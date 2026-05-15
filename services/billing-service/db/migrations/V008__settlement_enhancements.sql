-- Migration V008: Settlement enhancements — period tracking, reversal, doctor compensation, visit type

-- ─── Extend settlement_records with period columns and reversal tracking ───────
-- These new columns are NOT covered by the immutability trigger (which only guards
-- doctor_id, settlement_date, amount, payment_method, payment_reference).

ALTER TABLE settlement_records
  ADD COLUMN IF NOT EXISTS period_from       DATE,
  ADD COLUMN IF NOT EXISTS period_to         DATE,
  ADD COLUMN IF NOT EXISTS reversed_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_by       UUID,
  ADD COLUMN IF NOT EXISTS reversed_reason   TEXT;

-- ─── Doctor Compensation Rates ─────────────────────────────────────────────────
-- Per-doctor, per-visit-type split percentages.
-- Effective date range allows historical rate tracking.

CREATE TABLE IF NOT EXISTS doctor_compensation (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id         UUID         NOT NULL,
  visit_type        VARCHAR(20)  NOT NULL CHECK (visit_type IN ('consultation', 'operative', 'online')),
  doctor_percentage DECIMAL(5,2) NOT NULL CHECK (doctor_percentage >= 0 AND doctor_percentage <= 100),
  clinic_percentage DECIMAL(5,2) NOT NULL CHECK (clinic_percentage >= 0 AND clinic_percentage <= 100),
  effective_from    DATE         NOT NULL,
  effective_until   DATE,
  branch_id         INT          NOT NULL DEFAULT 1,
  created_by        UUID,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT doctor_comp_splits_100 CHECK (ABS(doctor_percentage + clinic_percentage - 100) < 0.01)
);

-- Only one active rate per doctor+type+branch at any time
CREATE UNIQUE INDEX IF NOT EXISTS idx_doctor_comp_active
  ON doctor_compensation (doctor_id, visit_type, branch_id)
  WHERE effective_until IS NULL;

CREATE INDEX IF NOT EXISTS idx_doctor_comp_lookup
  ON doctor_compensation (doctor_id, visit_type, effective_from);

-- ─── Visit Type on Financial Transactions ──────────────────────────────────────
ALTER TABLE financial_transactions
  ADD COLUMN IF NOT EXISTS visit_type VARCHAR(20)
  CHECK (visit_type IN ('consultation', 'operative', 'online'));
