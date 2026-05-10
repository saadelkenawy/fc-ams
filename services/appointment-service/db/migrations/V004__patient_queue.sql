-- Migration: V004 — Patient Queue Management
-- Creates: patient_queue, queue_event_log
-- Queue is per-doctor per-date; positions are 1-indexed integers.

-- ─── QUEUE STATUS ENUM ────────────────────────────────────────────────────────

DO $$ BEGIN
    CREATE TYPE queue_status AS ENUM (
        'waiting',
        'called',
        'in_session',
        'completed',
        'cancelled',
        'no_show'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE queue_event_type AS ENUM (
        'checked_in',
        'called',
        'session_started',
        'session_completed',
        'cancelled',
        'no_show',
        'rejoined',
        'position_shifted'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── PATIENT QUEUE ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS patient_queue (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id  UUID         NOT NULL,
    doctor_id       UUID         NOT NULL,
    patient_id      UUID         NOT NULL,
    queue_date      DATE         NOT NULL,
    position        INT          NOT NULL CHECK (position >= 1),
    status          queue_status NOT NULL DEFAULT 'waiting',
    checked_in_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    called_at       TIMESTAMPTZ,
    session_start   TIMESTAMPTZ,
    session_end     TIMESTAMPTZ,
    estimated_wait_minutes INT,
    branch_id       INT          NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    -- One active queue entry per appointment
    CONSTRAINT uq_queue_appointment UNIQUE (appointment_id),
    -- Positions are unique per doctor per day (enforced by update logic, not DB constraint,
    -- because positions shift atomically)
    CONSTRAINT uq_queue_position UNIQUE (doctor_id, queue_date, position)
);

CREATE INDEX IF NOT EXISTS idx_queue_doctor_date
    ON patient_queue (doctor_id, queue_date, position)
    WHERE status IN ('waiting', 'called', 'in_session');

CREATE INDEX IF NOT EXISTS idx_queue_patient
    ON patient_queue (patient_id, queue_date DESC);

CREATE INDEX IF NOT EXISTS idx_queue_branch_date
    ON patient_queue (branch_id, queue_date DESC);

ALTER TABLE patient_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY queue_branch_isolation ON patient_queue
    FOR ALL
    USING (branch_id = current_setting('app.current_branch_id', TRUE)::INT);
ALTER TABLE patient_queue FORCE ROW LEVEL SECURITY;

-- ─── QUEUE EVENT LOG ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS queue_event_log (
    id          UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_id    UUID             NOT NULL REFERENCES patient_queue(id) ON DELETE CASCADE,
    event_type  queue_event_type NOT NULL,
    old_position INT,
    new_position INT,
    metadata    JSONB,
    performed_by UUID,
    occurred_at TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    branch_id   INT              NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_queue_events_queue
    ON queue_event_log (queue_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_queue_events_branch_date
    ON queue_event_log (branch_id, occurred_at DESC);

ALTER TABLE queue_event_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY queue_events_branch_isolation ON queue_event_log
    FOR ALL
    USING (branch_id = current_setting('app.current_branch_id', TRUE)::INT);
ALTER TABLE queue_event_log FORCE ROW LEVEL SECURITY;

-- ─── AUTO-UPDATE updated_at ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_queue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER patient_queue_updated_at
    BEFORE UPDATE ON patient_queue
    FOR EACH ROW EXECUTE FUNCTION update_queue_updated_at();
