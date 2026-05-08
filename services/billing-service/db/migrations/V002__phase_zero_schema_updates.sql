-- Migration: V002 — Phase Zero Schema Updates (data.md §14)
-- Adds: settlement_records, vendor_invoices, cash_flow_events, migration_errors
-- Alters: financial_transactions (is_foc, entry_type, settlement_id, refund-aware charge check)
-- Updates: source_fee_rules (VEZ-Direct, EKF-Direct, DO-Direct, SHL-Clinic)

-- ─── SETTLEMENT RECORDS ───────────────────────────────────────────────────────
-- §7.1 — doctor payout events (C/O + Procedure='Doctor's Fee' in Excel)
-- Immutable after insert; a trigger prevents UPDATE/DELETE.

CREATE TABLE IF NOT EXISTS settlement_records (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id                UUID NOT NULL,        -- FK enforced at app layer (cross-service)
    settlement_date          DATE NOT NULL,
    settlement_time          TIME,
    amount                   DECIMAL(12,2) NOT NULL CHECK (amount > 0),
    payment_method           VARCHAR(50) NOT NULL, -- cash, mobile_wallet, bank_transfer_cib, etc.
    payment_reference        VARCHAR(100),         -- POS receipt # or bank reference
    processed_by_user_id     UUID,                 -- Staff member who paid out
    related_transaction_ids  UUID[],               -- financial_transactions this settles
    notes                    TEXT,
    branch_id                INT NOT NULL DEFAULT 1,
    created_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION prevent_settlement_modification() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Settlement records are immutable and cannot be deleted.'
            USING ERRCODE = 'P0003';
    END IF;
    IF OLD.doctor_id         IS DISTINCT FROM NEW.doctor_id         OR
       OLD.settlement_date   IS DISTINCT FROM NEW.settlement_date   OR
       OLD.amount            IS DISTINCT FROM NEW.amount            OR
       OLD.payment_method    IS DISTINCT FROM NEW.payment_method    OR
       OLD.payment_reference IS DISTINCT FROM NEW.payment_reference
    THEN
        RAISE EXCEPTION 'Core settlement fields are immutable.'
            USING ERRCODE = 'P0003';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_settlement_immutability
    BEFORE UPDATE OR DELETE ON settlement_records
    FOR EACH ROW EXECUTE FUNCTION prevent_settlement_modification();

CREATE INDEX IF NOT EXISTS idx_settlement_doctor
    ON settlement_records (doctor_id, settlement_date DESC);

CREATE INDEX IF NOT EXISTS idx_settlement_branch
    ON settlement_records (branch_id, settlement_date DESC);

ALTER TABLE settlement_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY settlement_branch_isolation ON settlement_records
    FOR ALL
    USING (branch_id = current_setting('app.current_branch_id', TRUE)::INT);
ALTER TABLE settlement_records FORCE ROW LEVEL SECURITY;

-- ─── VENDOR INVOICES ──────────────────────────────────────────────────────────
-- §7.2 — C/O + Procedure='Settling Invoice' in Excel

CREATE TABLE IF NOT EXISTS vendor_invoices (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_name          VARCHAR(200) NOT NULL,
    invoice_date         DATE NOT NULL,
    amount               DECIMAL(12,2) NOT NULL,
    payment_method       VARCHAR(50) NOT NULL,
    payment_reference    VARCHAR(100),
    description          TEXT,
    processed_by_user_id UUID,
    branch_id            INT NOT NULL DEFAULT 1,
    created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendor_invoices_branch
    ON vendor_invoices (branch_id, invoice_date DESC);

ALTER TABLE vendor_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY vendor_invoices_branch_isolation ON vendor_invoices
    FOR ALL
    USING (branch_id = current_setting('app.current_branch_id', TRUE)::INT);
ALTER TABLE vendor_invoices FORCE ROW LEVEL SECURITY;

-- ─── ALTER FINANCIAL TRANSACTIONS ─────────────────────────────────────────────
-- §14 additions: is_foc, entry_type, settlement_id
-- §14 constraint change: approved_charge allows negative when is_refund = TRUE

-- 1. Add new columns
ALTER TABLE financial_transactions
    ADD COLUMN IF NOT EXISTS is_foc      BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS entry_type  VARCHAR(20)
        CHECK (entry_type IN ('appointment', 'cash_in', 'cash_out')),
    ADD COLUMN IF NOT EXISTS settlement_id UUID REFERENCES settlement_records(id);

-- 2. Relax the approved_charge constraint to allow negatives for refund transactions
ALTER TABLE financial_transactions
    DROP CONSTRAINT IF EXISTS approved_charge_check;

ALTER TABLE financial_transactions
    ADD CONSTRAINT approved_charge_check CHECK (
        (is_refund = FALSE AND approved_charge >= 0) OR
        (is_refund = TRUE  AND approved_charge <= 0)
    );

-- 3. Index for FOC filtering (reports need to exclude FOC from revenue totals)
CREATE INDEX IF NOT EXISTS idx_ft_foc
    ON financial_transactions (branch_id, transaction_date)
    WHERE is_foc = TRUE;

-- 4. Update the immutability trigger to also protect is_foc and entry_type
CREATE OR REPLACE FUNCTION protect_financial_amounts() RETURNS TRIGGER AS $$
BEGIN
    IF OLD.approved_charge           IS DISTINCT FROM NEW.approved_charge           OR
       OLD.procedure_cost            IS DISTINCT FROM NEW.procedure_cost            OR
       OLD.gross_revenue             IS DISTINCT FROM NEW.gross_revenue             OR
       OLD.split_doctor_percentage   IS DISTINCT FROM NEW.split_doctor_percentage   OR
       OLD.split_clinic_percentage   IS DISTINCT FROM NEW.split_clinic_percentage   OR
       OLD.doctor_share              IS DISTINCT FROM NEW.doctor_share              OR
       OLD.clinic_share              IS DISTINCT FROM NEW.clinic_share              OR
       OLD.source_fee_percentage     IS DISTINCT FROM NEW.source_fee_percentage     OR
       OLD.source_fee_amount         IS DISTINCT FROM NEW.source_fee_amount         OR
       OLD.currency_code             IS DISTINCT FROM NEW.currency_code             OR
       OLD.exchange_rate             IS DISTINCT FROM NEW.exchange_rate             OR
       OLD.is_refund                 IS DISTINCT FROM NEW.is_refund                 OR
       OLD.original_transaction_id   IS DISTINCT FROM NEW.original_transaction_id  OR
       OLD.is_foc                    IS DISTINCT FROM NEW.is_foc                    OR
       OLD.entry_type                IS DISTINCT FROM NEW.entry_type
    THEN
        RAISE EXCEPTION 'Core financial amounts and classification are immutable. Use a refund transaction to reverse a charge.'
            USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── CASH FLOW EVENTS ─────────────────────────────────────────────────────────
-- §4.3 — parsed from Excel C/M column (the directional DSL)
-- Each financial_transaction may produce 1+ cash flow events.

CREATE TABLE IF NOT EXISTS cash_flow_events (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL,          -- References financial_transactions(id); enforced at app layer
    raw_dsl        VARCHAR(20) NOT NULL,   -- Original C/M value preserved (e.g. 'NS<Pt.', 'MW>iPay')
    method         VARCHAR(50) NOT NULL,   -- cash, pos_terminal, mobile_wallet, bank_transfer_cib, instapay, vfc_wallet, free_of_charge, pending
    direction      VARCHAR(20) NOT NULL CHECK (direction IN ('inflow', 'outflow', 'none')),
    counterparty   VARCHAR(50) NOT NULL,   -- patient, doctor, vendor, salary, mobile_wallet, instapay, vfc, cib, cash, none
    amount         DECIMAL(12,2) NOT NULL,
    parse_warning  TEXT,                   -- Set when DSL value was unparseable
    occurred_at    TIMESTAMPTZ NOT NULL,
    branch_id      INT NOT NULL DEFAULT 1,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cash_flow_transaction
    ON cash_flow_events (transaction_id);

CREATE INDEX IF NOT EXISTS idx_cash_flow_method_direction
    ON cash_flow_events (method, direction, occurred_at);

CREATE INDEX IF NOT EXISTS idx_cash_flow_counterparty
    ON cash_flow_events (counterparty, occurred_at);

CREATE INDEX IF NOT EXISTS idx_cash_flow_branch_date
    ON cash_flow_events (branch_id, occurred_at DESC);

-- ─── SOURCE FEE RULES — NEW DIRECT CODES ─────────────────────────────────────
-- §3.3 and §14: VEZ-Direct (DVZ), EKF-Direct (DEF), DO-Direct (DDO), SHL-Clinic

INSERT INTO source_fee_rules (source_code, source_name_en, source_name_ar, fee_type, fee_value, deduct_from, valid_from)
VALUES
    ('VEZ-Direct', 'Vizita Direct',      'فيزيتا مباشر',    'percentage', 10,  'clinic', '2026-01-01'),
    ('EKF-Direct', 'Ekshf Direct',       'اكشف مباشر',      'percentage', 10,  'clinic', '2026-01-01'),
    ('DO-Direct',  'CliniDo Direct',     'كلينيدو مباشر',   'percentage', 10,  'clinic', '2026-01-01'),
    ('SHL-Clinic', 'Shamel via Clinic',  'شامل عبر العيادة', 'percentage', 0,   'clinic', '2026-01-01')
ON CONFLICT (source_code) DO NOTHING;

-- ─── MIGRATION ERRORS ─────────────────────────────────────────────────────────
-- §8.1 — log for ETL pipeline errors during Phase Zero migration

CREATE TABLE IF NOT EXISTS migration_errors (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_file      VARCHAR(200) NOT NULL,
    source_sheet     VARCHAR(100) NOT NULL,
    source_row       INT NOT NULL,
    error_type       VARCHAR(50) NOT NULL,     -- 'parse_error', 'fk_lookup_failed', 'data_quality', etc.
    error_severity   VARCHAR(20) CHECK (error_severity IN ('blocker', 'high', 'medium', 'low', 'warning')),
    error_message    TEXT NOT NULL,
    raw_row_data     JSONB NOT NULL,            -- Full source row for debugging
    suggested_fix    TEXT,
    resolved         BOOLEAN DEFAULT FALSE,
    resolved_at      TIMESTAMPTZ,
    resolved_by      UUID,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_migration_errors_severity
    ON migration_errors (error_severity, resolved)
    WHERE resolved = FALSE;

CREATE INDEX IF NOT EXISTS idx_migration_errors_type
    ON migration_errors (error_type, source_sheet);
