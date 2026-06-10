-- V012: Transactional outbox for cross-service side effects.
--
-- Previously the appointment→billing transaction creation was fire-and-forget
-- HTTP: if billing-service was down (e.g. during a deploy), the financial
-- record was silently lost. Outbox rows are written in the SAME transaction
-- as the appointment insert, then delivered by a poller with retry/backoff.
-- Delivery is idempotent: billing enforces UNIQUE idempotency keys.
--
-- No RLS policy on purpose: this is internal plumbing processed by a
-- service-level worker that must see all branches; branch_id is carried as
-- a plain column for observability.

CREATE TABLE IF NOT EXISTS appointment_outbox (
    id              BIGSERIAL PRIMARY KEY,
    kind            VARCHAR(50)  NOT NULL,            -- e.g. 'billing.create'
    payload         JSONB        NOT NULL,
    branch_id       INT          NOT NULL,
    status          VARCHAR(20)  NOT NULL DEFAULT 'pending',  -- pending | delivered | dead
    attempts        INT          NOT NULL DEFAULT 0,
    max_attempts    INT          NOT NULL DEFAULT 12,
    next_attempt_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    last_error      TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    delivered_at    TIMESTAMPTZ,

    CONSTRAINT appointment_outbox_status_check
        CHECK (status IN ('pending', 'delivered', 'dead'))
);

-- Poller scan: only pending rows that are due
CREATE INDEX IF NOT EXISTS idx_outbox_pending_due
    ON appointment_outbox (next_attempt_at)
    WHERE status = 'pending';

-- Alerting/monitoring: dead letters needing manual reconciliation
CREATE INDEX IF NOT EXISTS idx_outbox_dead
    ON appointment_outbox (created_at)
    WHERE status = 'dead';

GRANT SELECT, INSERT, UPDATE, DELETE ON appointment_outbox TO fadl_app;
GRANT USAGE, SELECT ON SEQUENCE appointment_outbox_id_seq TO fadl_app;
