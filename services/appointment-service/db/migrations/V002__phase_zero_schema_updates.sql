-- Migration: V002 — Phase Zero Schema Updates (data.md §14)
-- Adds: clinic_rooms, specialty_room_assignments, reschedule_backlog
-- Alters: appointments (room_id, split_mode), doctors (payment_channel),
--         doctor_schedules (slot_duration_minutes default 20 per Excel 20-min cadence)

-- ─── CLINIC ROOMS ─────────────────────────────────────────────────────────────
-- §7.6 — rooms observed in Excel C# column: #1–#6, D1–D4, OL, NS

CREATE TABLE IF NOT EXISTS clinic_rooms (
    id        SERIAL PRIMARY KEY,
    code      VARCHAR(10) UNIQUE NOT NULL,
    name_en   VARCHAR(100),
    name_ar   VARCHAR(100),
    room_type VARCHAR(20) CHECK (room_type IN ('clinical','dental','online','finance')),
    floor     SMALLINT,
    is_active BOOLEAN DEFAULT TRUE,
    branch_id INT NOT NULL DEFAULT 1
);

INSERT INTO clinic_rooms (code, name_en, name_ar, room_type, branch_id) VALUES
    ('#1', 'Room 1',           'غرفة ١',          'clinical', 1),
    ('#2', 'Room 2',           'غرفة ٢',          'clinical', 1),
    ('#3', 'Room 3',           'غرفة ٣',          'clinical', 1),
    ('#4', 'Room 4',           'غرفة ٤',          'clinical', 1),
    ('#5', 'Room 5',           'غرفة ٥',          'clinical', 1),
    ('#6', 'Room 6',           'غرفة ٦',          'clinical', 1),
    ('D1', 'Dental Chair 1',   'كرسي أسنان ١',    'dental',   1),
    ('D2', 'Dental Chair 2',   'كرسي أسنان ٢',    'dental',   1),
    ('D3', 'Dental Chair 3',   'كرسي أسنان ٣',    'dental',   1),
    ('D4', 'Dental Chair 4',   'كرسي أسنان ٤',    'dental',   1),
    ('OL', 'Online',           'أونلاين',          'online',   1),
    ('NS', 'No Slot (Finance)','مالية',            'finance',  1)
ON CONFLICT (code) DO NOTHING;

-- ─── SPECIALTY–ROOM ASSIGNMENTS ───────────────────────────────────────────────
-- §7.7 — enforces which rooms each specialty can use

CREATE TABLE IF NOT EXISTS specialty_room_assignments (
    specialty_id INT NOT NULL REFERENCES specialties(id) ON DELETE CASCADE,
    room_id      INT NOT NULL REFERENCES clinic_rooms(id) ON DELETE CASCADE,
    is_primary   BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (specialty_id, room_id)
);

-- ─── ALTER APPOINTMENTS ───────────────────────────────────────────────────────
-- §14: Add room_id FK and split_mode

ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS room_id    INT REFERENCES clinic_rooms(id),
    ADD COLUMN IF NOT EXISTS split_mode VARCHAR(20)
        CHECK (split_mode IN ('consultation', 'operative', 'online'));

-- ─── ALTER DOCTORS ────────────────────────────────────────────────────────────
-- §14: Add payment_channel (e.g. 'InstaPay', 'Bank Direct')

ALTER TABLE doctors
    ADD COLUMN IF NOT EXISTS payment_channel VARCHAR(50);

-- ─── ALTER DOCTOR SCHEDULES ───────────────────────────────────────────────────
-- §14: Excel uses 20-min cadence; change DEFAULT from 15 → 20

ALTER TABLE doctor_schedules
    ALTER COLUMN slot_duration_minutes SET DEFAULT 20;

-- ─── RESCHEDULE BACKLOG ───────────────────────────────────────────────────────
-- §7.5 — productises the per-doctor manual reschedule sheet (Dr. Sara's sheet pattern)

CREATE TABLE IF NOT EXISTS reschedule_backlog (
    id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_appointment_id         UUID NOT NULL,   -- FK enforced at app layer (cross-partition)
    patient_id                      UUID NOT NULL,
    doctor_id                       UUID NOT NULL REFERENCES doctors(id),
    original_date                   DATE NOT NULL,
    rescheduled_to_date             DATE,
    rescheduled_to_appointment_id   UUID,
    backlog_reason                  VARCHAR(200),
    priority                        SMALLINT DEFAULT 0,
    notification_sent_count         INT DEFAULT 0,
    last_notification_at            TIMESTAMPTZ,
    created_by                      UUID,
    created_at                      TIMESTAMPTZ DEFAULT NOW(),
    resolved_at                     TIMESTAMPTZ,
    branch_id                       INT NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_backlog_doctor_unresolved
    ON reschedule_backlog (doctor_id, original_date)
    WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_backlog_patient
    ON reschedule_backlog (patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_backlog_branch
    ON reschedule_backlog (branch_id, resolved_at)
    WHERE resolved_at IS NULL;

-- RLS

ALTER TABLE reschedule_backlog ENABLE ROW LEVEL SECURITY;
CREATE POLICY reschedule_backlog_branch_isolation ON reschedule_backlog
    FOR ALL
    USING (branch_id = current_setting('app.current_branch_id', TRUE)::INT);
ALTER TABLE reschedule_backlog FORCE ROW LEVEL SECURITY;
