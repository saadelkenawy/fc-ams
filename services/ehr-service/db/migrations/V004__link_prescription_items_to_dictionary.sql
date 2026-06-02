-- V004: Link prescription_items to products_dictionary
--
-- Design decision: medication_name is KEPT as a denormalized snapshot column.
-- Medical records must remain readable even if a product is later deleted or renamed.
-- When product_id is set, a trigger populates medication_name automatically.
-- Free-text fallback (product_id IS NULL) remains valid for off-formulary items.
--
-- The old medication_dictionary table and medication_id FK are NOT dropped here —
-- they stay readable for any pre-V003 records. Use the reconciliation script
-- scripts/reconcile_medication_dict.sql after running the EDA ingester to backfill
-- product_id where matching products_dictionary rows exist.

-- ── 1. Add product_id FK to prescription_items ───────────────────────────────
ALTER TABLE prescription_items
    ADD COLUMN IF NOT EXISTS product_id UUID
        REFERENCES products_dictionary(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rxitem_product
    ON prescription_items (product_id)
    WHERE product_id IS NOT NULL;

-- ── 2. Trigger: when product_id is set, snapshot trade_name_en → medication_name
CREATE OR REPLACE FUNCTION fn_rxitem_sync_medication_name()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.product_id IS NOT NULL THEN
        SELECT COALESCE(trade_name_en, medication_name)
        INTO NEW.medication_name
        FROM products_dictionary
        WHERE id = NEW.product_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER aaa_rxitem_sync_medication_name
    BEFORE INSERT OR UPDATE OF product_id ON prescription_items
    FOR EACH ROW EXECUTE FUNCTION fn_rxitem_sync_medication_name();

-- ── 3. FTS index on prescriptions.diagnosis ──────────────────────────────────
-- Supports ICD-11 code lookups ("1A00") and free-text Arabic/English diagnosis search.
CREATE INDEX IF NOT EXISTS idx_rx_diagnosis_fts
    ON prescriptions USING GIN (to_tsvector('simple', COALESCE(diagnosis, '')));

-- ── 4. Trigram index on diagnosis (handles partial code and name search) ──────
CREATE INDEX IF NOT EXISTS idx_rx_diagnosis_trgm
    ON prescriptions USING GIN (diagnosis gin_trgm_ops)
    WHERE diagnosis IS NOT NULL;
