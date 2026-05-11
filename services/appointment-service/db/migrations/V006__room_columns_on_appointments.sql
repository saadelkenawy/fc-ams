-- Migration: V006 — Add room columns to appointments
-- room_id is a cross-service reference (no FK — doctor-service owns clinic_rooms)

ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS room_id          UUID,
    ADD COLUMN IF NOT EXISTS room_code        VARCHAR(10),
    ADD COLUMN IF NOT EXISTS room_assigned_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_appointments_room ON appointments (room_id, appointment_date)
    WHERE room_id IS NOT NULL AND deleted_at IS NULL;
