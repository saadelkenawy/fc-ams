CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE file_entity_type AS ENUM ('encounter', 'patient', 'prescription', 'lab_result', 'imaging', 'invoice', 'other');

CREATE TABLE IF NOT EXISTS files (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_key        TEXT NOT NULL UNIQUE,          -- MinIO object key: branch/entity_type/entity_id/filename
    original_name   VARCHAR(500) NOT NULL,
    mime_type       VARCHAR(200) NOT NULL,
    size_bytes      BIGINT NOT NULL,
    entity_type     file_entity_type NOT NULL DEFAULT 'other',
    entity_id       UUID,                          -- linked encounter / patient / etc.
    description     VARCHAR(1000),
    uploaded_by     UUID NOT NULL,
    branch_id       INT NOT NULL DEFAULT 1,
    deleted_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_files_entity    ON files(entity_type, entity_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_files_branch    ON files(branch_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_files_uploaded  ON files(uploaded_by, created_at DESC);

ALTER TABLE files ENABLE ROW LEVEL SECURITY;
CREATE POLICY files_branch ON files FOR ALL
    USING (branch_id = current_setting('app.current_branch_id', TRUE)::INT);
ALTER TABLE files FORCE ROW LEVEL SECURITY;
