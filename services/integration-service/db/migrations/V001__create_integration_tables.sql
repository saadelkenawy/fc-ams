CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE integration_platform AS ENUM ('vizita', 'ekshf', 'clinido', 'instapay', 'other');
CREATE TYPE integration_event_status AS ENUM ('received', 'processing', 'processed', 'failed', 'duplicate');

CREATE TABLE IF NOT EXISTS integration_events (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform         integration_platform NOT NULL,
    event_type       VARCHAR(100) NOT NULL,  -- 'appointment.booked', 'payment.received', etc.
    idempotency_key  VARCHAR(200) UNIQUE,    -- platform's own booking/payment ID
    payload          JSONB NOT NULL,         -- raw inbound payload
    normalized       JSONB,                  -- our normalised version
    status           integration_event_status NOT NULL DEFAULT 'received',
    result           JSONB,                  -- response from downstream service
    error_message    TEXT,
    retry_count      INT DEFAULT 0,
    branch_id        INT NOT NULL DEFAULT 1,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    processed_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_integ_platform  ON integration_events(platform, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_integ_status    ON integration_events(status) WHERE status IN ('received', 'failed');
CREATE INDEX IF NOT EXISTS idx_integ_branch    ON integration_events(branch_id, created_at DESC);
