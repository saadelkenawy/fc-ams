CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Procedure catalogue
CREATE TABLE IF NOT EXISTS procedures (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code          VARCHAR(50) UNIQUE NOT NULL,     -- e.g. "GYN_CONS", "DENT_XRAY"
    name_en       VARCHAR(200) NOT NULL,
    name_ar       VARCHAR(200),
    procedure_type VARCHAR(50) NOT NULL DEFAULT 'consultation'
        CHECK (procedure_type IN ('consultation','follow_up','operative','settling_fee','lab_test','imaging')),
    specialty_id  INT NOT NULL,                    -- cross-service ref, no FK constraint
    base_price    DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (base_price >= 0),
    duration_minutes INT DEFAULT 30,
    requires_pre_auth BOOLEAN DEFAULT FALSE,
    notes         TEXT,
    is_active     BOOLEAN DEFAULT TRUE,
    deleted_at    TIMESTAMPTZ,
    version       INT NOT NULL DEFAULT 1,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW(),
    branch_id     INT NOT NULL DEFAULT 1
);

-- Per-doctor price overrides
CREATE TABLE IF NOT EXISTS procedure_doctor_prices (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    procedure_id  UUID NOT NULL REFERENCES procedures(id) ON DELETE CASCADE,
    doctor_id     UUID NOT NULL,                   -- cross-service ref
    override_price DECIMAL(12,2) NOT NULL CHECK (override_price >= 0),
    valid_from    DATE NOT NULL,
    valid_until   DATE,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (procedure_id, doctor_id, valid_from)
);

CREATE INDEX IF NOT EXISTS idx_procedures_specialty ON procedures(specialty_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_procedures_type ON procedures(procedure_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_procedures_active ON procedures(is_active) WHERE is_active = TRUE AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pdp_procedure ON procedure_doctor_prices(procedure_id);
CREATE INDEX IF NOT EXISTS idx_pdp_doctor ON procedure_doctor_prices(doctor_id);

-- Seed common procedures for the main specialty (Gynecology, id=1)
INSERT INTO procedures (code, name_en, name_ar, procedure_type, specialty_id, base_price, duration_minutes) VALUES
  ('GYN_CONS',   'Gynecology Consultation',     'كشف نساء',     'consultation', 1, 300,  15),
  ('GYN_SONO',   'Gynecology Ultrasound',        'سونار نساء',   'imaging',      1, 200,  20),
  ('GYN_FOLL',   'Gynecology Follow-up',         'متابعة نساء',  'follow_up',    1, 150,  15),
  ('IVF_CONS',   'IVF Consultation',             'كشف تلقيح',    'consultation', 19, 500, 30),
  ('DENT_CONS',  'Dental Consultation',          'كشف أسنان',    'consultation', 4, 250,  15),
  ('PEDS_CONS',  'Pediatrics Consultation',      'كشف أطفال',    'consultation', 2, 250,  15),
  ('CARD_CONS',  'Cardiology Consultation',      'كشف قلب',      'consultation', 30, 400, 20),
  ('ORTHO_CONS', 'Orthopedics Consultation',     'كشف عظام',     'consultation', 38, 350, 20),
  ('LAB_CBC',    'Complete Blood Count',         'تحليل دم كامل','lab_test',     1, 120,  5)
ON CONFLICT (code) DO NOTHING;

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER procedures_updated_at
    BEFORE UPDATE ON procedures
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
