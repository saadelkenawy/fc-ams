-- Migration: V004 — Clinic Room Management
-- Creates: clinic_rooms, room_assignments, room_appointment_log
-- Seeds: 5 rooms C1–C5
-- RLS: branch_id isolation on all new tables

-- ─── ROOM ASSIGNMENT STATUS ENUM ──────────────────────────────────────────────

DO $$ BEGIN
    CREATE TYPE room_assignment_status AS ENUM ('reserved', 'active', 'released', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── CLINIC ROOMS ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS clinic_rooms (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    room_code   VARCHAR(10)  NOT NULL,
    room_name   VARCHAR(100) NOT NULL,
    floor       INT,
    description TEXT,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    branch_id   INT          NOT NULL DEFAULT 1,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_room_code_branch UNIQUE (room_code, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_rooms_branch ON clinic_rooms (branch_id) WHERE is_active = TRUE;

ALTER TABLE clinic_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY rooms_branch_isolation ON clinic_rooms
    FOR ALL USING (branch_id = current_setting('app.current_branch_id', TRUE)::INT);
ALTER TABLE clinic_rooms FORCE ROW LEVEL SECURITY;

-- Seed the 5 standard rooms
INSERT INTO clinic_rooms (room_code, room_name, branch_id) VALUES
    ('C1', 'Room 1', 1),
    ('C2', 'Room 2', 1),
    ('C3', 'Room 3', 1),
    ('C4', 'Room 4', 1),
    ('C5', 'Room 5', 1)
ON CONFLICT (room_code, branch_id) DO NOTHING;

-- ─── ROOM ASSIGNMENTS ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS room_assignments (
    id              UUID                   PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id         UUID                   NOT NULL REFERENCES clinic_rooms(id),
    doctor_id       UUID                   NOT NULL REFERENCES doctors(id),
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

CREATE TRIGGER room_assignments_updated_at
    BEFORE UPDATE ON room_assignments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── ROOM APPOINTMENT LOG ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS room_appointment_log (
    id              UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id         UUID  NOT NULL REFERENCES clinic_rooms(id),
    appointment_id  UUID  NOT NULL,  -- cross-service reference, no FK
    patient_id      UUID  NOT NULL,
    doctor_id       UUID  NOT NULL REFERENCES doctors(id),
    assigned_date   DATE  NOT NULL,
    entered_at      TIMESTAMPTZ,
    exited_at       TIMESTAMPTZ,
    branch_id       INT   NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_room_log_room_date ON room_appointment_log (room_id, assigned_date);
CREATE INDEX IF NOT EXISTS idx_room_log_appt ON room_appointment_log (appointment_id);

ALTER TABLE room_appointment_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY room_log_branch_isolation ON room_appointment_log
    FOR ALL USING (branch_id = current_setting('app.current_branch_id', TRUE)::INT);
ALTER TABLE room_appointment_log FORCE ROW LEVEL SECURITY;
