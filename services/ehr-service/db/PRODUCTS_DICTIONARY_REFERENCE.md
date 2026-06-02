# Products Dictionary — Query & API Reference

## Autocomplete query (≥3 characters typed by doctor)

The search path uses the `product_search_index` materialized view first (refreshed
nightly / after each ingestion run). The query uses FTS with prefix matching (`term:*`)
and falls back to trigram similarity (`%`) to handle typos.

```sql
SELECT
    psi.id,
    psi.trade_name_en,
    psi.trade_name_ar,
    psi.type,
    psi.generic_name_en,
    psi.strength,
    COALESCE(f_mm.code, f_pd.code)    AS form_code,
    COALESCE(f_mm.name_en, f_pd.name_en) AS form_name_en,
    COALESCE(f_mm.name_ar, f_pd.name_ar) AS form_name_ar,
    psi.prescription_required,
    psi.controlled_substance,
    ts_rank(psi.search_vector, query)  AS rank
FROM   product_search_index psi
CROSS JOIN to_tsquery('simple', $1 || ':*') AS query
LEFT JOIN product_forms f_mm ON f_mm.id = psi.form_id
LEFT JOIN product_forms f_pd ON f_pd.id = (
    SELECT shelf_form_id FROM products_dictionary WHERE id = psi.id
)
WHERE  psi.status = 'active'
  AND  psi.type   = ANY($2::product_type[])   -- pass '{medicine}' or '{medicine,cosmetic}'
  AND (
      psi.search_vector @@ query
      OR psi.trade_name_en      % $3           -- trigram: $3 = raw search term
      OR psi.trade_name_ar_norm % normalize_arabic($3)
      OR psi.generic_name_en    % $3
  )
ORDER BY rank DESC, psi.trade_name_en
LIMIT 20;

-- $1 = search term for FTS          e.g. 'augmen'
-- $2 = allowed types array          e.g. '{medicine}'
-- $3 = raw search term for trigram  e.g. 'augmen'
```

> **Performance note**: `product_search_index` covers ~20k rows with GIN indexes on
> the tsvector and three trigram columns. Expect p95 < 5 ms after the first warm query.
> If the materialized view is stale (between refresh cycles), the base-table indexes on
> `products_dictionary` provide the same query shape with marginally higher I/O.

---

## Prescription create — API payload

`POST /prescriptions`

```json
{
  "encounterId": "enc_01HX...",
  "patientId":   "pat_01HX...",
  "doctorId":    "doc_01HX...",
  "diagnosis":   "J06.9 — Upper respiratory tract infection, unspecified / التهاب الجهاز التنفسي العلوي",
  "notes":       "Patient allergic to penicillin — prescribed alternative.",
  "items": [
    {
      "productId":         "9f3c2a01-...",
      "form":              "tab",
      "dosageValue":       500,
      "dosageUnit":        "mg",
      "frequency":         "tid",
      "timing":            "pc",
      "durationDays":      7,
      "dispenseQuantity":  21,
      "routeInstruction":  "Take orally with food",
      "sortOrder":         1
    },
    {
      "productId":         "b7e14f22-...",
      "form":              "tab",
      "dosageValue":       10,
      "dosageUnit":        "mg",
      "frequency":         "od",
      "timing":            "hs",
      "durationDays":      7,
      "dispenseQuantity":  7,
      "routeInstruction":  null,
      "sortOrder":         2
    },
    {
      "productId":         null,
      "medicationName":    "Chamomile Tea",
      "form":              "syr",
      "dosageValue":       null,
      "dosageUnit":        null,
      "frequency":         "tid",
      "timing":            "none",
      "durationDays":      3,
      "dispenseQuantity":  null,
      "routeInstruction":  "1 cup warm after meals",
      "sortOrder":         3
    }
  ]
}
```

> **Off-formulary items**: set `productId: null` and provide `medicationName` as
> free text. The trigger `aaa_rxitem_sync_medication_name` only fires when `productId`
> is non-null; otherwise `medicationName` is used as-is.

---

## Autocomplete response — API shape

`GET /products/search?q=augment&type=medicine`

```json
{
  "query": "augment",
  "total": 3,
  "results": [
    {
      "id":                   "9f3c2a01-4b8e-4f2d-a1c0-...",
      "tradeNameEn":          "Augmentin 625 mg Tablet",
      "tradeNameAr":          "أوجمنتين ٦٢٥ مجم أقراص",
      "type":                 "medicine",
      "genericNameEn":        "Amoxicillin / Clavulanic Acid",
      "strength":             "500/125 mg",
      "formCode":             "tab",
      "formNameEn":           "Tablet",
      "formNameAr":           "قرص",
      "prescriptionRequired": true,
      "controlledSubstance":  false,
      "rank":                 0.9753
    },
    {
      "id":                   "2d8a1f03-...",
      "tradeNameEn":          "Augmentin 1 g Tablet",
      "tradeNameAr":          "أوجمنتين ١ جم أقراص",
      "type":                 "medicine",
      "genericNameEn":        "Amoxicillin / Clavulanic Acid",
      "strength":             "875/125 mg",
      "formCode":             "tab",
      "formNameEn":           "Tablet",
      "formNameAr":           "قرص",
      "prescriptionRequired": true,
      "controlledSubstance":  false,
      "rank":                 0.9612
    }
  ]
}
```

---

## Refreshing the materialized view

```bash
# After ingestion run
psql $EHR_DATABASE_URL -c \
  "REFRESH MATERIALIZED VIEW CONCURRENTLY product_search_index;"

# Via pg_cron (install once):
SELECT cron.schedule(
  'refresh-product-search-index',
  '0 3 * * *',   -- 03:00 Cairo time daily
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY product_search_index$$
);
```

## Ingestion run order

```bash
# 1. Apply migrations (once)
psql $EHR_DATABASE_URL -f services/ehr-service/db/migrations/V003__create_products_dictionary.sql
psql $EHR_DATABASE_URL -f services/ehr-service/db/migrations/V004__link_prescription_items_to_dictionary.sql

# 2. Ingest EDA registry
EHR_DATABASE_URL=postgres://... python scripts/ingest_eda_products.py eda_registry.xlsx

# 3. Back-fill existing prescription_items (one-time)
psql $EHR_DATABASE_URL -f scripts/reconcile_medication_dict.sql
```
