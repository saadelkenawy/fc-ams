-- Migration: V007 — Room Management (assignments + enhancements)
-- clinic_rooms already exists in this DB with integer PK
-- We add: room_code (C1–C5), description, room_assignments, room_appointment_log

-- ─── ENHANCE CLINIC ROOMS ─────────────────────────────────────────────────────

ALTER TABLE clinic_rooms
    ADD COLUMN IF NOT EXISTS room_code   VARCHAR(10),
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Populate room_code for the 5 standard clinical rooms
UPDATE clinic_rooms SET room_code = 'C' || id::TEXT WHERE id BETWEEN 1 AND 5 AND room_code IS NULL;

-- ─── ROOM ASSIGNMENT STATUS ENUM ──────────────────────────────────────────────

DO $$ BEGIN
    CREATE TYPE room_assignment_status AS ENUM ('reserved', 'active', 'released', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── ROOM ASSIGNMENTS ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS room_assignments (
    id              UUID                   PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id         INTEGER                NOT NULL REFERENCES clinic_rooms(id),
    doctor_id       UUID                   NOT NULL,  -- cross-service ref, no FK
    assigned_date   DATE                   NOT NULL,
    assigned_from   TIME                   NOT NULL,
    assigned_until  TIME                   NOT NULL,
    assigned_by     UUID,
    assigned_at     TIMESTAMPTZ            NOT NULL DEFAULT NOW(),
    status          room_assignment_status NOT NULL DEFAULT 'reserved',
    released_at     TIMESTAMPTZ,
    branch_id       INT                    NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ            NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ            NOT NULL DEFAULT NOW()
);

-- One active/reserved assignment per room per day
CREATE UNIQUE INDEX IF NOT EXISTS uq_room_active_reserved
    ON room_assignments (room_id, assigned_date)
    WHERE status IN ('reserved', 'active');

-- One active/reserved assignment per doctor per day
CREATE UNIQUE INDEX IF NOT EXISTS uq_doctor_active_reserved
    ON room_assignments (doctor_id, assigned_date)
    WHERE status IN ('reserved', 'active');

CREATE INDEX IF NOT EXISTS idx_assignments_date ON room_assignments (assigned_date, branch_id);
CREATE INDEX IF NOT EXISTS idx_assignments_doctor ON room_assignments (doctor_id, assigned_date);

ALTER TABLE room_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY assignments_branch_isolation ON room_assignments
    FOR ALL USING (branch_id = current_setting('app.current_branch_id', TRUE)::INT);
ALTER TABLE room_assignments FORCE ROW LEVEL SECURITY;

-- ─── ROOM APPOINTMENT LOG ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS room_appointment_log (
    id              UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id         INTEGER  NOT NULL REFERENCES clinic_rooms(id),
    appointment_id  UUID     NOT NULL,
    patient_id      UUID     NOT NULL,
    doctor_id       UUID     NOT NULL,
    assigned_date   DATE     NOT NULL,
    entered_at      TIMESTAMPTZ,
    exited_at       TIMESTAMPTZ,
    branch_id       INT      NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_room_log_room_date ON room_appointment_log (room_id, assigned_date);
CREATE INDEX IF NOT EXISTS idx_room_log_appt ON room_appointment_log (appointment_id);

ALTER TABLE room_appointment_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY room_log_branch_isolation ON room_appointment_log
    FOR ALL USING (branch_id = current_setting('app.current_branch_id', TRUE)::INT);
ALTER TABLE room_appointment_log FORCE ROW LEVEL SECURITY;
