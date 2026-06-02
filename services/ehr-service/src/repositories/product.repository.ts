import { pool } from '../config/database';
import type { ProductSearchResult, ProductType } from '@fadl/types';

export interface SearchProductsParams {
  query: string;
  type?: ProductType;
  limit: number;
}

/**
 * Builds a safe PostgreSQL tsquery string for prefix/multi-word FTS.
 * Strips tsquery operators so user input cannot inject query syntax.
 * "augmentin 625" → "augmentin:* & 625:*"
 */
function buildTsQuery(raw: string): string {
  const tokens = raw
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((t) => t.length > 0);

  if (tokens.length === 0) return '';
  return tokens.map((t) => `${t}:*`).join(' & ');
}

function rowToResult(row: Record<string, unknown>): ProductSearchResult {
  return {
    id:                   row.id as string,
    tradeNameEn:          row.trade_name_en as string,
    tradeNameAr:          (row.trade_name_ar as string | null) ?? null,
    type:                 row.type as ProductType,
    genericNameEn:        (row.generic_name_en as string | null) ?? null,
    strength:             (row.strength as string | null) ?? null,
    formCode:             (row.form_code as string | null) ?? null,
    formNameEn:           (row.form_name_en as string | null) ?? null,
    formNameAr:           (row.form_name_ar as string | null) ?? null,
    prescriptionRequired: row.prescription_required != null
                            ? Boolean(row.prescription_required)
                            : null,
    controlledSubstance:  row.controlled_substance != null
                            ? Boolean(row.controlled_substance)
                            : null,
    rank: Number(row.rank ?? 0),
  };
}

export async function searchProducts(
  params: SearchProductsParams,
): Promise<ProductSearchResult[]> {
  const tsQuery = buildTsQuery(params.query);

  // Empty after sanitization → return nothing rather than an unbounded scan
  if (!tsQuery) return [];

  const client = await pool.connect();
  try {
    // products_dictionary has no RLS — no branch_id session variable needed.
    // Two-phase search in a single round-trip:
    //   1. FTS with prefix matching via search_vector (GIN index)
    //   2. Trigram similarity on trade names + generic name (GIN trgm index)
    // ts_rank drives ORDER BY so exact and prefix matches surface first.
    const { rows } = await client.query(
      `SELECT
          pd.id,
          pd.trade_name_en,
          pd.trade_name_ar,
          pd.type::text                              AS type,
          mm.generic_name_en,
          mm.strength,
          COALESCE(f_mm.code,    f_pd.code)          AS form_code,
          COALESCE(f_mm.name_en, f_pd.name_en)       AS form_name_en,
          COALESCE(f_mm.name_ar, f_pd.name_ar)       AS form_name_ar,
          mm.prescription_required,
          mm.controlled_substance,
          ts_rank(pd.search_vector, to_tsquery('simple', $1)) AS rank
       FROM  products_dictionary pd
       LEFT  JOIN medicines_metadata mm ON mm.product_id = pd.id
       LEFT  JOIN product_forms f_mm   ON f_mm.id = mm.form_id
       LEFT  JOIN product_forms f_pd   ON f_pd.id = pd.shelf_form_id
       WHERE pd.status = 'active'
         AND ($2::text IS NULL OR pd.type::text = $2)
         AND (
             pd.search_vector @@ to_tsquery('simple', $1)
             OR pd.trade_name_en      % $3
             OR pd.trade_name_ar_norm % normalize_arabic($3)
             OR mm.generic_name_en    % $3
         )
       ORDER BY rank DESC, pd.trade_name_en
       LIMIT $4`,
      [tsQuery, params.type ?? null, params.query, params.limit],
    );

    return rows.map((r) => rowToResult(r as Record<string, unknown>));
  } finally {
    client.release();
  }
}
