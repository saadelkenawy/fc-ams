CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS encounters (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id        UUID NOT NULL,         -- cross-service ref to patient-service
    appointment_id    UUID,                  -- cross-service ref to appointment-service (nullable for walk-ins)
    doctor_id         UUID NOT NULL,         -- cross-service ref
    specialty_id      INT,                   -- cross-service ref
    encounter_date    DATE NOT NULL DEFAULT CURRENT_DATE,
    encounter_type    VARCHAR(50) NOT NULL DEFAULT 'outpatient'
        CHECK (encounter_type IN ('outpatient','inpatient','emergency','telehealth','follow_up')),
    status            VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft','in_progress','completed','signed_off')),

    -- Clinical data
    chief_complaint   TEXT,
    history_of_present_illness TEXT,
    diagnosis_primary VARCHAR(500),          -- ICD-10 code + description
    diagnosis_secondary JSONB DEFAULT '[]',  -- array of additional diagnoses
    clinical_notes    TEXT,

    -- Vital signs (JSONB for flexibility)
    vital_signs JSONB DEFAULT '{}',
    -- e.g. { "blood_pressure": "120/80", "heart_rate": 72, "temperature": 37.0, "weight_kg": 70, "height_cm": 170 }

    -- Prescriptions (JSONB array)
    prescriptions JSONB DEFAULT '[]',
    -- e.g. [{ "drug": "Amoxicillin", "dose": "500mg", "frequency": "TID", "duration_days": 7, "notes": "" }]

    -- Lab orders
    lab_orders JSONB DEFAULT '[]',

    -- Follow-up
    follow_up_date    DATE,
    follow_up_notes   TEXT,

    -- Sign-off
    signed_off_by     UUID,
    signed_off_at     TIMESTAMPTZ,

    -- Audit
    version           INT NOT NULL DEFAULT 1,
    created_by        UUID,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW(),
    branch_id         INT NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_enc_patient ON encounters(patient_id, encounter_date DESC);
CREATE INDEX IF NOT EXISTS idx_enc_doctor ON encounters(doctor_id, encounter_date DESC);
CREATE INDEX IF NOT EXISTS idx_enc_appointment ON encounters(appointment_id) WHERE appointment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_enc_status ON encounters(status) WHERE status IN ('draft','in_progress');
CREATE INDEX IF NOT EXISTS idx_enc_branch ON encounters(branch_id, encounter_date DESC);

ALTER TABLE encounters ENABLE ROW LEVEL SECURITY;
CREATE POLICY enc_branch_isolation ON encounters
    FOR ALL USING (branch_id = current_setting('app.current_branch_id', TRUE)::INT);
ALTER TABLE encounters FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER encounters_updated_at
    BEFORE UPDATE ON encounters FOR EACH ROW EXECUTE FUNCTION update_updated_at();
