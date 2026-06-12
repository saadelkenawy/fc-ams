-- V003: clinical intake fields captured at registration
-- insurance (provider + policy number) and three free-form clinical lists:
-- current medications [{name, dosage?}], allergies [{type: medication|food, name}],
-- chronic diseases [string]. Stored as JSONB — read/written whole by the
-- patient-service, no per-element querying needed.

ALTER TABLE patients
    ADD COLUMN IF NOT EXISTS insurance_provider        VARCHAR(200),
    ADD COLUMN IF NOT EXISTS insurance_policy_number   VARCHAR(50),
    ADD COLUMN IF NOT EXISTS current_medications       JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS allergies                 JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS chronic_diseases          JSONB NOT NULL DEFAULT '[]'::jsonb;
