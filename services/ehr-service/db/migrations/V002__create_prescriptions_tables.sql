-- V002: Prescription module — normalized tables for prescriptions + items + medication dictionary

CREATE EXTENSION IF NOT EXISTS pgcrypto;

/* ── Lookup: medication dictionary (global, no RLS — shared across branches) ── */

CREATE TABLE IF NOT EXISTS medication_dictionary (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    generic_name     VARCHAR(255) NOT NULL,
    brand_name       VARCHAR(255),
    available_forms  JSONB NOT NULL DEFAULT '[]',
    -- e.g. ["cap", "tab", "syr"]
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meddict_generic ON medication_dictionary USING gin(to_tsvector('simple', generic_name));
CREATE INDEX IF NOT EXISTS idx_meddict_brand   ON medication_dictionary USING gin(to_tsvector('simple', COALESCE(brand_name, '')));
CREATE INDEX IF NOT EXISTS idx_meddict_active  ON medication_dictionary(is_active) WHERE is_active = TRUE;

/* ── Prescriptions (tenant-scoped, one per encounter-session) ─────────────── */

CREATE TYPE prescription_status AS ENUM ('active', 'dispensed', 'cancelled');

CREATE TABLE IF NOT EXISTS prescriptions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id     INT  NOT NULL DEFAULT 1,          -- RLS fence

    encounter_id  UUID,                             -- FK to encounters.id (same DB)
    patient_id    UUID NOT NULL,                    -- cross-service ref
    doctor_id     UUID NOT NULL,                    -- cross-service ref

    diagnosis     TEXT,
    status        prescription_status NOT NULL DEFAULT 'active',
    notes         TEXT,

    -- Audit
    version       INT NOT NULL DEFAULT 1,
    created_by    UUID,
    deleted_at    TIMESTAMPTZ,                      -- soft delete
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT fk_prescription_encounter
        FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_rx_patient   ON prescriptions(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rx_doctor    ON prescriptions(doctor_id,  created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rx_encounter ON prescriptions(encounter_id) WHERE encounter_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rx_branch    ON prescriptions(branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rx_status    ON prescriptions(status) WHERE deleted_at IS NULL;

ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY rx_branch_isolation ON prescriptions
    FOR ALL USING (branch_id = current_setting('app.current_branch_id', TRUE)::INT);
ALTER TABLE prescriptions FORCE ROW LEVEL SECURITY;

/* ── Prescription items (child rows, one per medication line) ─────────────── */

CREATE TYPE rx_form      AS ENUM ('cap', 'tab', 'syr', 'inj', 'gtt');
CREATE TYPE rx_frequency AS ENUM ('od', 'bid', 'tid', 'qid', 'q4h');
CREATE TYPE rx_timing    AS ENUM ('ac', 'pc', 'hs', 'stat', 'prn', 'none');

CREATE TABLE IF NOT EXISTS prescription_items (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prescription_id   UUID NOT NULL,
    branch_id         INT  NOT NULL DEFAULT 1,      -- RLS fence (denormalised for policy)

    medication_id     UUID,                         -- optional FK to medication_dictionary
    medication_name   VARCHAR(255) NOT NULL,        -- free-text fallback (always populated)

    form              rx_form      NOT NULL,
    dosage_value      NUMERIC(10,2),
    dosage_unit       VARCHAR(20),                  -- 'mg', 'ml', 'mcg', …
    frequency         rx_frequency NOT NULL,
    timing            rx_timing    NOT NULL DEFAULT 'none',
    route_instruction VARCHAR(500),                 -- 'Take orally', 'Apply topically', …
    duration_days     INT,
    dispense_quantity INT,
    sort_order        INT  NOT NULL DEFAULT 0,

    created_at        TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT fk_rxitem_prescription
        FOREIGN KEY (prescription_id) REFERENCES prescriptions(id) ON DELETE CASCADE,
    CONSTRAINT fk_rxitem_meddict
        FOREIGN KEY (medication_id) REFERENCES medication_dictionary(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_rxitem_prescription ON prescription_items(prescription_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_rxitem_branch        ON prescription_items(branch_id);
CREATE INDEX IF NOT EXISTS idx_rxitem_medname       ON prescription_items(medication_name);

ALTER TABLE prescription_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY rxitem_branch_isolation ON prescription_items
    FOR ALL USING (branch_id = current_setting('app.current_branch_id', TRUE)::INT);
ALTER TABLE prescription_items FORCE ROW LEVEL SECURITY;

/* ── Triggers ─────────────────────────────────────────────────────────────── */

CREATE OR REPLACE FUNCTION update_updated_at_prescriptions() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prescriptions_updated_at
    BEFORE UPDATE ON prescriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_prescriptions();

CREATE OR REPLACE FUNCTION prescriptions_increment_version() RETURNS TRIGGER AS $$
BEGIN NEW.version = OLD.version + 1; RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prescriptions_version
    BEFORE UPDATE ON prescriptions
    FOR EACH ROW EXECUTE FUNCTION prescriptions_increment_version();
