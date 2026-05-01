-- Migration: V001 — Billing Service — Immutable Financial Ledger
-- Ref: database.md Enhancements #9 (idempotency + immutability), #5 (RLS)

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Source fee rules (configurable per source code)
CREATE TABLE IF NOT EXISTS source_fee_rules (
    id SERIAL PRIMARY KEY,
    source_code VARCHAR(50) UNIQUE NOT NULL,
    source_name_en VARCHAR(100),
    source_name_ar VARCHAR(100),
    fee_type VARCHAR(20) NOT NULL CHECK (fee_type IN ('percentage', 'fixed')),
    fee_value DECIMAL(12,2) NOT NULL CHECK (fee_value >= 0),
    deduct_from VARCHAR(20) DEFAULT 'clinic' CHECK (deduct_from IN ('clinic', 'doctor', 'both')),
    is_active BOOLEAN DEFAULT TRUE,
    valid_from DATE NOT NULL,
    valid_until DATE,
    specialty_id INT,
    last_modified_by UUID,
    last_modified_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed known sources from claude-plan.md Module 4
INSERT INTO source_fee_rules (source_code, source_name_en, source_name_ar, fee_type, fee_value, deduct_from, valid_from)
VALUES
    ('Cl.''s',   'Clinic Direct',  'مباشر',       'percentage', 0,    'clinic',  '2026-01-01'),
    ('Dr.''s',   'Doctor Referral','إحالة طبيب',   'percentage', 0,    'clinic',  '2026-01-01'),
    ('VEZ',      'Vizita',         'فيزيتا',       'percentage', 10,   'clinic',  '2026-01-01'),
    ('Ex-VEZ',   'Ex-Vizita',      'Ex-فيزيتا',    'percentage', 0,    'clinic',  '2026-01-01'),
    ('EKF',      'Ekshf',          'اكشف',         'percentage', 10,   'clinic',  '2026-01-01'),
    ('Ex-EKF',   'Ex-Ekshf',       'Ex-اكشف',      'percentage', 0,    'clinic',  '2026-01-01'),
    ('DO',       'CliniDo',        'كلينيدو',      'percentage', 10,   'clinic',  '2026-01-01'),
    ('Ex-DO',    'Ex-CliniDo',     'Ex-كلينيدو',   'percentage', 0,    'clinic',  '2026-01-01'),
    ('SHL',      'Shamel',         'شامل',         'percentage', 0,    'clinic',  '2026-01-01')
ON CONFLICT (source_code) DO NOTHING;

-- Immutable financial transactions (partitioned)
CREATE TABLE IF NOT EXISTS financial_transactions (
    id UUID DEFAULT gen_random_uuid(),
    idempotency_key VARCHAR(100) NOT NULL,
    appointment_id UUID,
    patient_id UUID NOT NULL,
    doctor_id UUID,
    procedure_id UUID,
    patient_source VARCHAR(50) NOT NULL,
    source_fee_percentage DECIMAL(5,2) DEFAULT 0.00,
    source_fee_amount DECIMAL(12,2) DEFAULT 0.00,
    approved_charge DECIMAL(12,2) NOT NULL CHECK (approved_charge >= 0),
    procedure_cost DECIMAL(12,2),
    gross_revenue DECIMAL(12,2) NOT NULL,
    split_doctor_percentage DECIMAL(5,2) NOT NULL,
    split_clinic_percentage DECIMAL(5,2) NOT NULL,
    doctor_share DECIMAL(12,2) NOT NULL CHECK (doctor_share >= 0),
    clinic_share DECIMAL(12,2) NOT NULL CHECK (clinic_share >= 0),

    -- Mathematical integrity
    CONSTRAINT splits_sum_to_gross CHECK (ABS((doctor_share + clinic_share) - gross_revenue) < 0.01),
    CONSTRAINT splits_percentages CHECK (split_doctor_percentage + split_clinic_percentage = 100),

    payment_method VARCHAR(50),
    payment_status VARCHAR(20) DEFAULT 'pending'
        CHECK (payment_status IN ('pending','verified','approved','paid','reconciled','refunded')),
    check_in_amount DECIMAL(12,2),
    check_out_amount DECIMAL(12,2),
    is_refund BOOLEAN DEFAULT FALSE,
    original_transaction_id UUID,
    refund_reason TEXT,
    settled_at TIMESTAMPTZ,
    settled_by UUID,
    settlement_reference VARCHAR(100),
    currency_code CHAR(3) NOT NULL DEFAULT 'EGP',
    exchange_rate DECIMAL(12,6) DEFAULT 1.0,
    vat_rate DECIMAL(5,2) DEFAULT 14.00,
    vat_amount DECIMAL(12,2) GENERATED ALWAYS AS (approved_charge * vat_rate / 100) STORED,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    branch_id INT NOT NULL DEFAULT 1,
    transaction_date DATE NOT NULL,
    PRIMARY KEY (branch_id, transaction_date, id),
    UNIQUE (idempotency_key)
) PARTITION BY LIST (branch_id);

CREATE TABLE IF NOT EXISTS financial_transactions_branch_1
    PARTITION OF financial_transactions FOR VALUES IN (1)
    PARTITION BY RANGE (transaction_date);

CREATE TABLE IF NOT EXISTS ft_branch_1_y2026m05
    PARTITION OF financial_transactions_branch_1
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

CREATE TABLE IF NOT EXISTS ft_branch_1_y2026m06
    PARTITION OF financial_transactions_branch_1
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ft_patient
    ON financial_transactions(patient_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_ft_doctor
    ON financial_transactions(doctor_id, payment_status, transaction_date);
CREATE INDEX IF NOT EXISTS idx_ft_appointment
    ON financial_transactions(appointment_id);
CREATE INDEX IF NOT EXISTS idx_ft_settlement
    ON financial_transactions(payment_status, settled_at)
    WHERE payment_status = 'paid';

-- IMMUTABILITY TRIGGERS (Enhancement #9)
CREATE OR REPLACE FUNCTION prevent_financial_modification() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Financial transactions are immutable. Create a compensating refund transaction instead.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_update_financial_transactions
    BEFORE UPDATE ON financial_transactions
    FOR EACH ROW EXECUTE FUNCTION prevent_financial_modification();

CREATE TRIGGER no_delete_financial_transactions
    BEFORE DELETE ON financial_transactions
    FOR EACH ROW EXECUTE FUNCTION prevent_financial_modification();

-- Event sourcing table
CREATE TABLE IF NOT EXISTS financial_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB NOT NULL,
    event_version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID
);
CREATE INDEX IF NOT EXISTS idx_fe_transaction ON financial_events(transaction_id, created_at);

-- RLS (Enhancement #5)
ALTER TABLE financial_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY ft_branch_isolation ON financial_transactions
    FOR ALL
    USING (branch_id = current_setting('app.current_branch_id', TRUE)::INT);
ALTER TABLE financial_transactions FORCE ROW LEVEL SECURITY;
