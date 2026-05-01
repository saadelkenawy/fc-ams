-- Migration: V001 — Create patients table
-- Ref: database.md Enhancement #4 (UUID PK), #5 (RLS), #3 (extensions)

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS patients (
    patient_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mobile VARCHAR(20) UNIQUE NOT NULL,
    mobile_history JSONB DEFAULT '[]',
    national_id VARCHAR(20) UNIQUE,
    name_en VARCHAR(200) NOT NULL,
    name_ar VARCHAR(200),
    name_search tsvector GENERATED ALWAYS AS (
        to_tsvector('simple', coalesce(name_ar, '')) ||
        to_tsvector('simple', coalesce(name_en, ''))
    ) STORED,
    date_of_birth DATE,
    gender CHAR(1) CHECK (gender IN ('M','F')),
    blood_type VARCHAR(5),
    address TEXT,
    email VARCHAR(200),
    emergency_contact_mobile VARCHAR(20),
    emergency_contact_name VARCHAR(200),
    preferred_language VARCHAR(10) DEFAULT 'ar',
    source_first_visit VARCHAR(50),
    pii_encryption_key_id VARCHAR(50),
    deleted_at TIMESTAMPTZ,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    branch_id INT NOT NULL DEFAULT 1
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_mobile_active
    ON patients(mobile) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_patients_national_id
    ON patients(national_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_patients_name_search
    ON patients USING gin(name_search);

CREATE INDEX IF NOT EXISTS idx_patients_created_at
    ON patients(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_patients_branch
    ON patients(branch_id, deleted_at);

-- Row Level Security (Enhancement #5)
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

CREATE POLICY patients_branch_isolation ON patients
    FOR ALL
    USING (branch_id = current_setting('app.current_branch_id', TRUE)::INT);

-- Allow superuser/migration role to bypass RLS
ALTER TABLE patients FORCE ROW LEVEL SECURITY;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER patients_updated_at
    BEFORE UPDATE ON patients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
