-- Migration: V002 — Add future source flag columns to patients
-- Allows marking non-Clinic-Direct patients as potential future Cl.'s referral sources

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS is_future_source     BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS future_source_type   VARCHAR(20),
  ADD COLUMN IF NOT EXISTS future_source_set_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS future_source_set_by UUID;

-- Partial index for fast filtering of future-source patients per branch
CREATE INDEX IF NOT EXISTS idx_patients_future_source
  ON patients(branch_id)
  WHERE is_future_source = TRUE AND deleted_at IS NULL;
