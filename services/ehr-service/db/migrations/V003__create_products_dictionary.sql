-- V003: EDA Products Dictionary
-- Global reference table (no RLS — shared across all branches).
-- Hosted in ehr-service DB because prescriptions reference it directly.
-- Cross-service access (procurement, billing) must go through ehr-service HTTP API;
-- if this grows into a shared catalogue, extract a catalog-service and move these tables.

-- ── Extensions ───────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- trigram similarity for typo-tolerant search
CREATE EXTENSION IF NOT EXISTS unaccent;  -- Latin unaccent (Arabic handled inline below)

-- ── Arabic normalization ──────────────────────────────────────────────────────
-- Folds all alef forms → ا, ta marbuta → ه, alef maqsura → ي,
-- strips tatweel and all harakat diacritics.
-- Used in GENERATED ALWAYS columns so normalization is zero-cost at query time.
CREATE OR REPLACE FUNCTION normalize_arabic(p_text TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
AS $$
    SELECT regexp_replace(
        regexp_replace(
            regexp_replace(
                regexp_replace(
                    regexp_replace(p_text,
                        '[أإآٱ]', 'ا', 'g'),   -- alef forms → plain alef
                    'ة', 'ه', 'g'),              -- ta marbuta → ha
                'ى', 'ي', 'g'),                  -- alef maqsura → ya
            'ـ', '', 'g'),                        -- tatweel / kashida
        '[ً-ٰٟ]', '', 'g'          -- harakat + superscript alef
    );
$$;

-- ── Dosage / packaging forms ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_forms (
    id          SMALLINT    PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    code        VARCHAR(10) NOT NULL,
    name_en     VARCHAR(60) NOT NULL,
    name_ar     VARCHAR(60),
    applies_to  VARCHAR(10) NOT NULL DEFAULT 'both'
        CHECK (applies_to IN ('medicine', 'cosmetic', 'both')),
    CONSTRAINT product_forms_code_uq UNIQUE (code)
);

INSERT INTO product_forms (code, name_en, name_ar, applies_to) VALUES
    ('tab',   'Tablet',       'قرص',      'medicine'),
    ('cap',   'Capsule',      'كبسولة',   'medicine'),
    ('syr',   'Syrup',        'شراب',     'medicine'),
    ('susp',  'Suspension',   'معلق',     'medicine'),
    ('sol',   'Solution',     'محلول',    'medicine'),
    ('inj',   'Injection',    'حقنة',     'medicine'),
    ('inf',   'Infusion',     'تسريب',    'medicine'),
    ('gtt',   'Drops',        'نقط',      'medicine'),
    ('inh',   'Inhaler',      'بخاخ',     'medicine'),
    ('patch', 'Patch',        'لاصقة',    'medicine'),
    ('supp',  'Suppository',  'تحميلة',   'medicine'),
    ('gran',  'Granules',     'حبيبات',   'medicine'),
    ('crm',   'Cream',        'كريم',     'both'),
    ('oint',  'Ointment',     'مرهم',     'both'),
    ('gel',   'Gel',          'جل',       'both'),
    ('lot',   'Lotion',       'لوشن',     'both'),
    ('spray', 'Spray',        'بخاخ',     'both'),
    ('pdr',   'Powder',       'مسحوق',    'both'),
    ('oil',   'Oil',          'زيت',      'both'),
    ('sham',  'Shampoo',      'شامبو',    'cosmetic'),
    ('foam',  'Foam',         'رغوة',     'cosmetic'),
    ('mask',  'Mask',         'قناع',     'cosmetic'),
    ('toner', 'Toner',        'تونر',     'cosmetic'),
    ('ser',   'Serum',        'سيروم',    'cosmetic')
ON CONFLICT (code) DO NOTHING;

-- ── Core products table ───────────────────────────────────────────────────────
CREATE TYPE product_type   AS ENUM ('medicine', 'cosmetic');
CREATE TYPE product_status AS ENUM ('active', 'suspended', 'cancelled', 'recalled');

CREATE TABLE IF NOT EXISTS products_dictionary (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    type                product_type    NOT NULL,
    status              product_status  NOT NULL DEFAULT 'active',

    -- Bilingual trade names
    trade_name_en       VARCHAR(300)    NOT NULL,
    trade_name_ar       VARCHAR(300),
    -- Normalized Arabic is stored so queries never compute it at runtime
    trade_name_ar_norm  VARCHAR(300)    GENERATED ALWAYS AS (normalize_arabic(trade_name_ar)) STORED,

    -- EDA registration (primary dedup key)
    -- UNIQUE enforced via partial index below (NULLs must coexist for pre-registration products)
    registration_number VARCHAR(60),
    eda_url             TEXT,

    -- Barcode (secondary dedup key)
    barcode             VARCHAR(20),
    pack_size           VARCHAR(80),          -- '1 strip × 10 tabs', '200 mL', …
    shelf_form_id       SMALLINT REFERENCES product_forms(id),

    -- Manufacturer / importer
    manufacturer_en     VARCHAR(300),
    manufacturer_ar     VARCHAR(300),
    country_of_origin   CHAR(2),              -- ISO 3166-1 alpha-2

    -- Reference pricing (EDA list price, informational only)
    reference_price_egp NUMERIC(10,2),

    -- FTS search vector (maintained by trigger aaa_products_search_vector)
    search_vector       TSVECTOR,

    -- Ingestion audit
    source              VARCHAR(40)     NOT NULL DEFAULT 'eda_scraper',
    last_synced_at      TIMESTAMPTZ,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ── Medicines metadata (1:1 extension — only for type = 'medicine') ───────────
CREATE TABLE IF NOT EXISTS medicines_metadata (
    product_id              UUID        PRIMARY KEY
        REFERENCES products_dictionary(id) ON DELETE CASCADE,

    -- Active ingredient(s)
    generic_name_en         VARCHAR(500) NOT NULL,
    generic_name_ar         VARCHAR(500),
    generic_name_ar_norm    VARCHAR(500) GENERATED ALWAYS AS (normalize_arabic(generic_name_ar)) STORED,

    -- Strength
    strength                VARCHAR(120),          -- '500 mg', '5 mg/mL', '10/80 mg'
    strength_normalized     NUMERIC(10,4),         -- parsed numeric for range queries
    strength_unit           VARCHAR(20),           -- 'mg', 'mcg', 'IU', '%'

    -- Classification
    atc_code                VARCHAR(10),           -- WHO ATC: 'J01CA04'
    form_id                 SMALLINT REFERENCES product_forms(id),
    administration_route    VARCHAR(80),           -- 'oral', 'topical', 'IV', 'IM'
    therapeutic_class       VARCHAR(200),

    -- Dispensing rules
    prescription_required   BOOLEAN NOT NULL DEFAULT TRUE,
    controlled_substance    BOOLEAN NOT NULL DEFAULT FALSE,
    schedule_class          SMALLINT,              -- narcotic schedule 1–5

    -- Clinical (JSONB; populated by future clinical-logic module)
    contraindications       JSONB   NOT NULL DEFAULT '[]',
    drug_interactions       JSONB   NOT NULL DEFAULT '[]',

    -- Storage
    storage_conditions      VARCHAR(200),
    requires_cold_chain     BOOLEAN NOT NULL DEFAULT FALSE
);

-- ── product_search_index (materialized view — explicit named artifact) ────────
-- Refresh with: REFRESH MATERIALIZED VIEW CONCURRENTLY product_search_index;
-- Schedule nightly via pg_cron or after each ingestion run.
-- With 20k rows this view is faster than the base table only when pre-aggregating
-- across both products_dictionary and medicines_metadata. For most autocomplete
-- queries hitting the GIN indexes on products_dictionary alone is sufficient.
CREATE MATERIALIZED VIEW IF NOT EXISTS product_search_index AS
    SELECT
        pd.id,
        pd.type,
        pd.status,
        pd.trade_name_en,
        pd.trade_name_ar,
        pd.trade_name_ar_norm,
        pd.registration_number,
        pd.barcode,
        pd.manufacturer_en,
        pd.shelf_form_id,
        mm.generic_name_en,
        mm.generic_name_ar,
        mm.generic_name_ar_norm,
        mm.strength,
        mm.atc_code,
        mm.form_id,
        mm.administration_route,
        mm.prescription_required,
        mm.controlled_substance,
        -- Combined search vector (weights: A=trade names, B=generic, C=manufacturer)
        (
            setweight(to_tsvector('simple', COALESCE(pd.trade_name_en, '')), 'A')     ||
            setweight(to_tsvector('simple', COALESCE(pd.trade_name_ar_norm, '')), 'A')||
            setweight(to_tsvector('simple', COALESCE(mm.generic_name_en, '')), 'B')   ||
            setweight(to_tsvector('simple', COALESCE(mm.generic_name_ar_norm, '')), 'B')||
            setweight(to_tsvector('simple', COALESCE(pd.manufacturer_en, '')), 'C')
        ) AS search_vector
    FROM products_dictionary pd
    LEFT JOIN medicines_metadata mm ON mm.product_id = pd.id
    WHERE pd.status = 'active'
WITH DATA;

-- Unique index required for CONCURRENTLY refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_psi_id
    ON product_search_index (id);

-- FTS on the materialized view (primary autocomplete path)
CREATE INDEX IF NOT EXISTS idx_psi_search_vector
    ON product_search_index USING GIN (search_vector);

-- Trigram on trade names (handles partial input and typos)
CREATE INDEX IF NOT EXISTS idx_psi_trgm_en
    ON product_search_index USING GIN (trade_name_en gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_psi_trgm_ar
    ON product_search_index USING GIN (trade_name_ar_norm gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_psi_trgm_generic
    ON product_search_index USING GIN (generic_name_en gin_trgm_ops);

-- ── Indexes on base tables (for ingestion dedup + range queries) ──────────────

-- Partial unique indexes — these are the conflict targets for ON CONFLICT ... WHERE
CREATE UNIQUE INDEX IF NOT EXISTS idx_prod_reg_num_uniq
    ON products_dictionary (registration_number)
    WHERE registration_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_prod_barcode_uniq
    ON products_dictionary (barcode)
    WHERE barcode IS NOT NULL;

-- FTS on base table (used between materialized view refreshes)
CREATE INDEX IF NOT EXISTS idx_prod_search_vector
    ON products_dictionary USING GIN (search_vector);

-- Trigram on base table for typo-tolerant fallback
CREATE INDEX IF NOT EXISTS idx_prod_trgm_name_en
    ON products_dictionary USING GIN (trade_name_en gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_prod_trgm_name_ar
    ON products_dictionary USING GIN (trade_name_ar_norm gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_mm_trgm_generic
    ON medicines_metadata USING GIN (generic_name_en gin_trgm_ops);

-- Filtering indexes
CREATE INDEX IF NOT EXISTS idx_prod_type_status
    ON products_dictionary (type, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_mm_atc
    ON medicines_metadata (atc_code) WHERE atc_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prod_updated_at
    ON products_dictionary (updated_at DESC);

-- ── Triggers (named with prefix to control execution order) ──────────────────
-- PostgreSQL fires BEFORE triggers alphabetically within the same event+timing.
-- aaa_ prefix → fires before zzz_ prefix.

-- 1. Maintain search_vector on products_dictionary (BEFORE INSERT OR UPDATE)
CREATE OR REPLACE FUNCTION fn_products_search_vector()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_generic_en TEXT := '';
    v_generic_ar TEXT := '';
BEGIN
    SELECT
        COALESCE(mm.generic_name_en, ''),
        COALESCE(mm.generic_name_ar_norm, '')
    INTO v_generic_en, v_generic_ar
    FROM medicines_metadata mm
    WHERE mm.product_id = NEW.id;

    NEW.search_vector :=
        setweight(to_tsvector('simple', COALESCE(NEW.trade_name_en,      '')), 'A') ||
        setweight(to_tsvector('simple', COALESCE(NEW.trade_name_ar_norm, '')), 'A') ||
        setweight(to_tsvector('simple', v_generic_en),                          'B') ||
        setweight(to_tsvector('simple', v_generic_ar),                          'B') ||
        setweight(to_tsvector('simple', COALESCE(NEW.manufacturer_en,   '')), 'C');
    RETURN NEW;
END;
$$;

CREATE TRIGGER aaa_products_search_vector
    BEFORE INSERT OR UPDATE ON products_dictionary
    FOR EACH ROW EXECUTE FUNCTION fn_products_search_vector();

-- 2. Keep updated_at current (BEFORE UPDATE — fires after aaa_)
CREATE OR REPLACE FUNCTION fn_products_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER zzz_products_updated_at
    BEFORE UPDATE ON products_dictionary
    FOR EACH ROW EXECUTE FUNCTION fn_products_updated_at();

-- 3. When medicines_metadata changes, re-run the search_vector trigger on the parent
--    by issuing a touch UPDATE (AFTER INSERT OR UPDATE on medicines_metadata)
CREATE OR REPLACE FUNCTION fn_medicines_metadata_touch_parent()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    UPDATE products_dictionary SET updated_at = NOW() WHERE id = NEW.product_id;
    RETURN NEW;
END;
$$;

CREATE TRIGGER aaa_mm_touch_parent
    AFTER INSERT OR UPDATE ON medicines_metadata
    FOR EACH ROW EXECUTE FUNCTION fn_medicines_metadata_touch_parent();
