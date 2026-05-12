-- Migration: V005 — Specialty-based fee rates per source
-- Adds is_general flag to source_fee_rules; creates source_specialty_rates table.
-- Rate resolution: if is_general=true → use fee_value; else → lookup specialty rate → fallback to fee_value.

ALTER TABLE source_fee_rules
  ADD COLUMN IF NOT EXISTS is_general BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS source_specialty_rates (
    id           SERIAL        PRIMARY KEY,
    source_code  VARCHAR(50)   NOT NULL REFERENCES source_fee_rules(source_code) ON DELETE CASCADE,
    specialty_id INT           NOT NULL,
    fee_value    DECIMAL(12,2) NOT NULL CHECK (fee_value >= 0),
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (source_code, specialty_id)
);

CREATE INDEX IF NOT EXISTS idx_ssr_source_code ON source_specialty_rates(source_code);
