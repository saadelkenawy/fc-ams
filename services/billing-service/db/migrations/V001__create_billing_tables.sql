-- Migration: V001 — Billing Service — Financial Ledger
-- Creates: source_fee_rules, financial_transactions (partitioned), financial_events
-- Ref: database.md Enhancements #9 (idempotency), #5 (RLS), #6 (partitioning)
-- NOTE: Core financial amounts are immutable after insert.
--       Payment status and settlement fields ARE mutable (pending → paid workflow).

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── SOURCE FEE RULES ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS source_fee_rules (
    id             SERIAL      PRIMARY KEY,
    source_code    VARCHAR(50) UNIQUE NOT NULL,
    source_name_en VARCHAR(100),
    source_name_ar VARCHAR(100),
    fee_type       VARCHAR(20) NOT NULL CHECK (fee_type IN ('percentage', 'fixed')),
    fee_value      DECIMAL(12,2) NOT NULL CHECK (fee_value >= 0),
    deduct_from    VARCHAR(20) NOT NULL DEFAULT 'clinic'
        CHECK (deduct_from IN ('clinic', 'doctor', 'both')),
    is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
    valid_from     DATE        NOT NULL,
    valid_until    DATE,
    specialty_id   INT,
    last_modified_by UUID,
    last_modified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed known patient sources (from claude-plan.md Module 4)
INSERT INTO source_fee_rules (source_code, source_name_en, source_name_ar, fee_type, fee_value, deduct_from, valid_from)
VALUES
    ('Cl.''s',  'Clinic Direct',   'مباشر',        'percentage', 0,   'clinic', '2026-01-01'),
    ('Dr.''s',  'Doctor Referral', 'إحالة طبيب',   'percentage', 0,   'clinic', '2026-01-01'),
    ('VEZ',     'Vizita',          'فيزيتا',        'percentage', 10,  'clinic', '2026-01-01'),
    ('Ex-VEZ',  'Ex-Vizita',       'Ex-فيزيتا',     'percentage', 0,   'clinic', '2026-01-01'),
    ('EKF',     'Ekshf',           'اكشف',          'percentage', 10,  'clinic', '2026-01-01'),
    ('Ex-EKF',  'Ex-Ekshf',        'Ex-اكشف',       'percentage', 0,   'clinic', '2026-01-01'),
    ('DO',      'CliniDo',         'كلينيدو',       'percentage', 10,  'clinic', '2026-01-01'),
    ('Ex-DO',   'Ex-CliniDo',      'Ex-كلينيدو',    'percentage', 0,   'clinic', '2026-01-01'),
    ('SHL',     'Shamel',          'شامل',          'percentage', 0,   'clinic', '2026-01-01')
ON CONFLICT (source_code) DO NOTHING;

-- ─── FINANCIAL TRANSACTIONS ───────────────────────────────────────────────────
-- Partitioned LIST(branch_id) → RANGE(transaction_date)
-- Core amounts are immutable; status/settlement fields are mutable.

CREATE TABLE IF NOT EXISTS financial_transactions (
    id                     UUID         DEFAULT gen_random_uuid(),
    idempotency_key        VARCHAR(100) NOT NULL,
    appointment_id         UUID,
    patient_id             UUID         NOT NULL,
    doctor_id              UUID,
    procedure_id           UUID,
    patient_source         VARCHAR(50)  NOT NULL,

    -- Source fee (computed at insert, immutable)
    source_fee_percentage  DECIMAL(5,2)  NOT NULL DEFAULT 0.00,
    source_fee_amount      DECIMAL(12,2) NOT NULL DEFAULT 0.00,

    -- Charges (immutable)
    approved_charge        DECIMAL(12,2) NOT NULL CHECK (approved_charge >= 0),
    procedure_cost         DECIMAL(12,2),
    gross_revenue          DECIMAL(12,2) NOT NULL CHECK (gross_revenue >= 0),

    -- Revenue split (immutable)
    split_doctor_percentage DECIMAL(5,2) NOT NULL,
    split_clinic_percentage DECIMAL(5,2) NOT NULL,
    doctor_share            DECIMAL(12,2) NOT NULL CHECK (doctor_share >= 0),
    clinic_share            DECIMAL(12,2) NOT NULL CHECK (clinic_share >= 0),

    CONSTRAINT splits_sum_100     CHECK (split_doctor_percentage + split_clinic_percentage = 100),
    CONSTRAINT splits_match_gross CHECK (ABS((doctor_share + clinic_share) - gross_revenue) < 0.01),

    -- Payment (mutable — status progresses through workflow)
    payment_method  VARCHAR(50),
    payment_status  VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (payment_status IN ('pending', 'verified', 'approved', 'paid', 'reconciled', 'refunded')),
    check_in_amount  DECIMAL(12,2),
    check_out_amount DECIMAL(12,2),

    -- Refund chain (immutable)
    is_refund               BOOLEAN NOT NULL DEFAULT FALSE,
    original_transaction_id UUID,
    refund_reason           TEXT,

    -- Settlement (mutable)
    settled_at           TIMESTAMPTZ,
    settled_by           UUID,
    settlement_reference VARCHAR(100),

    -- Currency (immutable)
    currency_code  CHAR(3)      NOT NULL DEFAULT 'EGP',
    exchange_rate  DECIMAL(12,6) NOT NULL DEFAULT 1.0,
    vat_rate       DECIMAL(5,2)  NOT NULL DEFAULT 14.00,
    -- vat_amount is a generated column — computed from approved_charge * vat_rate / 100
    vat_amount     DECIMAL(12,2) GENERATED ALWAYS AS (ROUND(approved_charge * vat_rate / 100, 2)) STORED,

    -- Audit
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by       UUID,
    transaction_date DATE        NOT NULL,
    branch_id        INT         NOT NULL DEFAULT 1,

    PRIMARY KEY (branch_id, transaction_date, id),
    -- Partition key columns must be included in UNIQUE constraints on partitioned tables
    UNIQUE (branch_id, transaction_date, idempotency_key)

) PARTITION BY LIST (branch_id);

-- Branch 1 parent
CREATE TABLE IF NOT EXISTS financial_transactions_branch_1
    PARTITION OF financial_transactions
    FOR VALUES IN (1)
    PARTITION BY RANGE (transaction_date);

-- Branch 1 — May 2026
CREATE TABLE IF NOT EXISTS ft_branch_1_y2026m05
    PARTITION OF financial_transactions_branch_1
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

-- Branch 1 — Jun 2026
CREATE TABLE IF NOT EXISTS ft_branch_1_y2026m06
    PARTITION OF financial_transactions_branch_1
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

-- Branch 1 — Jul 2026
CREATE TABLE IF NOT EXISTS ft_branch_1_y2026m07
    PARTITION OF financial_transactions_branch_1
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

-- ─── INDEXES ──────────────────────────────────────────────────────────────────

-- Lookup by id alone (crosses partitions — needed by findById and updateStatus)
CREATE INDEX IF NOT EXISTS idx_ft_id
    ON financial_transactions (id);

CREATE INDEX IF NOT EXISTS idx_ft_patient
    ON financial_transactions (patient_id, transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_ft_doctor
    ON financial_transactions (doctor_id, payment_status, transaction_date);

CREATE INDEX IF NOT EXISTS idx_ft_appointment
    ON financial_transactions (appointment_id)
    WHERE appointment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ft_settlement
    ON financial_transactions (payment_status, settled_at)
    WHERE payment_status = 'paid';

CREATE INDEX IF NOT EXISTS idx_ft_date_branch
    ON financial_transactions (branch_id, transaction_date DESC);

-- ─── IMMUTABILITY TRIGGER ─────────────────────────────────────────────────────
-- Protects core financial amounts. Status and settlement fields remain mutable.

CREATE OR REPLACE FUNCTION protect_financial_amounts() RETURNS TRIGGER AS $$
BEGIN
    IF OLD.approved_charge        IS DISTINCT FROM NEW.approved_charge        OR
       OLD.procedure_cost         IS DISTINCT FROM NEW.procedure_cost         OR
       OLD.gross_revenue          IS DISTINCT FROM NEW.gross_revenue          OR
       OLD.split_doctor_percentage IS DISTINCT FROM NEW.split_doctor_percentage OR
       OLD.split_clinic_percentage IS DISTINCT FROM NEW.split_clinic_percentage OR
       OLD.doctor_share           IS DISTINCT FROM NEW.doctor_share           OR
       OLD.clinic_share           IS DISTINCT FROM NEW.clinic_share           OR
       OLD.source_fee_percentage  IS DISTINCT FROM NEW.source_fee_percentage  OR
       OLD.source_fee_amount      IS DISTINCT FROM NEW.source_fee_amount      OR
       OLD.currency_code          IS DISTINCT FROM NEW.currency_code          OR
       OLD.exchange_rate          IS DISTINCT FROM NEW.exchange_rate          OR
       OLD.is_refund              IS DISTINCT FROM NEW.is_refund              OR
       OLD.original_transaction_id IS DISTINCT FROM NEW.original_transaction_id
    THEN
        RAISE EXCEPTION 'Core financial amounts are immutable. Use a refund transaction to reverse a charge.'
            USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_financial_immutability
    BEFORE UPDATE ON financial_transactions
    FOR EACH ROW EXECUTE FUNCTION protect_financial_amounts();

-- Prevent hard deletes (soft operations should use refund transactions)
CREATE OR REPLACE FUNCTION prevent_financial_delete() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Financial transactions cannot be deleted. Create a refund transaction instead.'
        USING ERRCODE = 'P0002';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_delete_financial_transactions
    BEFORE DELETE ON financial_transactions
    FOR EACH ROW EXECUTE FUNCTION prevent_financial_delete();

-- ─── FINANCIAL EVENTS (audit log for status changes) ─────────────────────────

CREATE TABLE IF NOT EXISTS financial_events (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID        NOT NULL,
    event_type     VARCHAR(50) NOT NULL,  -- e.g. 'STATUS_CHANGED', 'SETTLED', 'REFUNDED'
    old_status     VARCHAR(20),
    new_status     VARCHAR(20),
    event_data     JSONB       NOT NULL DEFAULT '{}',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by     UUID
);

CREATE INDEX IF NOT EXISTS idx_fe_transaction
    ON financial_events (transaction_id, created_at);

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────────

ALTER TABLE financial_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY ft_branch_isolation ON financial_transactions
    FOR ALL
    USING (branch_id = current_setting('app.current_branch_id', TRUE)::INT);
ALTER TABLE financial_transactions FORCE ROW LEVEL SECURITY;
