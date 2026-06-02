-- reconcile_medication_dict.sql
-- Run AFTER the EDA ingester has populated products_dictionary.
-- Back-fills product_id on prescription_items rows that still reference the
-- old medication_dictionary (medication_id IS NOT NULL) but have no product_id yet.
--
-- Usage:
--   psql $EHR_DATABASE_URL -f scripts/reconcile_medication_dict.sql

BEGIN;

-- Match by brand_name (exact, case-insensitive)
UPDATE prescription_items pi
SET    product_id = pd.id
FROM   medication_dictionary md
JOIN   products_dictionary pd
       ON LOWER(TRIM(pd.trade_name_en)) = LOWER(TRIM(md.brand_name))
WHERE  pi.medication_id = md.id
  AND  pi.product_id IS NULL;

-- Match by generic_name as fallback (first result only)
UPDATE prescription_items pi
SET    product_id = pd.id
FROM   medication_dictionary md
CROSS JOIN LATERAL (
    SELECT id FROM products_dictionary
    WHERE  LOWER(TRIM(trade_name_en)) = LOWER(TRIM(md.generic_name))
    LIMIT  1
) pd
WHERE  pi.medication_id = md.id
  AND  pi.product_id IS NULL;

SELECT
    COUNT(*) FILTER (WHERE product_id IS NOT NULL) AS linked,
    COUNT(*) FILTER (WHERE product_id IS NULL)     AS still_unlinked
FROM prescription_items;

COMMIT;
