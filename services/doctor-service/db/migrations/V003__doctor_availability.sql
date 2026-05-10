-- Migration: V003 — Doctor Availability & Consultation Hours
-- Adds: current_status, status_updated_at on doctors
--       doctor_consultation_hours (max_patients per slot)
--       doctor_status_log
--       doctor_day_overrides (is_working boolean, simpler than doctor_schedule_overrides)

-- ─── DOCTOR STATUS ENUM ───────────────────────────────────────────────────────

DO $$ BEGIN
    CREATE TYPE doctor_status AS ENUM ('active', 'absent', 'on_his_way', 'day_off');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── ALTER DOCTORS ────────────────────────────────────────────────────────────

ALTER TABLE doctors
    ADD COLUMN IF NOT EXISTS current_status    doctor_status NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS status_note       VARCHAR(500);

CREATE INDEX IF NOT EXISTS idx_doctors_status
    ON doctors (current_status, branch_id) WHERE deleted_at IS NULL;

-- ─── DOCTOR CONSULTATION HOURS ────────────────────────────────────────────────
-- Separate from doctor_schedules: tracks max_patients per slot and is the
-- authoritative source for what hours to show in the appointment booking UI.

CREATE TABLE IF NOT EXISTS doctor_consultation_hours (
    id                  UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id           UUID     NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    day_of_week         SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time          TIME     NOT NULL,
    end_time            TIME     NOT NULL,
    slot_duration_mins  INT      NOT NULL DEFAULT 15 CHECK (slot_duration_mins BETWEEN 5 AND 120),
    max_patients        INT      NOT NULL DEFAULT 20 CHECK (max_patients BETWEEN 1 AND 200),
    is_active           BOOLEAN  NOT NULL DEFAULT TRUE,
    branch_id           INT      NOT NULL DEFAULT 1,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_consult_time CHECK (start_time < end_time),
    CONSTRAINT uq_consult_doctor_day UNIQUE (doctor_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_consult_hours_doctor
    ON doctor_consultation_hours (doctor_id, day_of_week) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_consult_hours_branch
    ON doctor_consultation_hours (branch_id) WHERE is_active = TRUE;

ALTER TABLE doctor_consultation_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY consult_hours_branch_isolation ON doctor_consultation_hours
    FOR ALL
    USING (branch_id = current_setting('app.current_branch_id', TRUE)::INT);
ALTER TABLE doctor_consultation_hours FORCE ROW LEVEL SECURITY;

CREATE TRIGGER consult_hours_updated_at
    BEFORE UPDATE ON doctor_consultation_hours
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── DOCTOR STATUS LOG ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS doctor_status_log (
    id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id      UUID          NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    previous_status doctor_status,
    new_status     doctor_status NOT NULL,
    note           VARCHAR(500),
    changed_by     UUID,
    changed_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    branch_id      INT           NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_status_log_doctor
    ON doctor_status_log (doctor_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_status_log_branch_date
    ON doctor_status_log (branch_id, changed_at DESC);

ALTER TABLE doctor_status_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY status_log_branch_isolation ON doctor_status_log
    FOR ALL
    USING (branch_id = current_setting('app.current_branch_id', TRUE)::INT);
ALTER TABLE doctor_status_log FORCE ROW LEVEL SECURITY;

-- ─── DOCTOR DAY OVERRIDES ─────────────────────────────────────────────────────
-- Per-date override: doctor works or doesn't, with optional custom hours.
-- Distinct from doctor_schedule_overrides (which uses an override_type enum).

CREATE TABLE IF NOT EXISTS doctor_day_overrides (
    id              UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id       UUID     NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    override_date   DATE     NOT NULL,
    is_working      BOOLEAN  NOT NULL,
    start_time      TIME,
    end_time        TIME,
    max_patients    INT      CHECK (max_patients BETWEEN 1 AND 200),
    reason          VARCHAR(500),
    created_by      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    branch_id       INT      NOT NULL DEFAULT 1,

    CONSTRAINT uq_day_override UNIQUE (doctor_id, override_date),
    CONSTRAINT valid_override_time CHECK (
        is_working = FALSE OR (start_time IS NULL AND end_time IS NULL)
            OR (start_time IS NOT NULL AND end_time IS NOT NULL AND start_time < end_time)
    )
);

CREATE INDEX IF NOT EXISTS idx_day_overrides_doctor_date
    ON doctor_day_overrides (doctor_id, override_date);

CREATE INDEX IF NOT EXISTS idx_day_overrides_branch_date
    ON doctor_day_overrides (branch_id, override_date);

ALTER TABLE doctor_day_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY day_overrides_branch_isolation ON doctor_day_overrides
    FOR ALL
    USING (branch_id = current_setting('app.current_branch_id', TRUE)::INT);
ALTER TABLE doctor_day_overrides FORCE ROW LEVEL SECURITY;
