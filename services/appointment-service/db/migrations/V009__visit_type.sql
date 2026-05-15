-- Migration V009: Add visit_type to appointments

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS visit_type VARCHAR(20) DEFAULT 'consultation'
    CHECK (visit_type IN ('consultation', 'operative', 'online'));

CREATE INDEX IF NOT EXISTS idx_appt_visit_type
  ON appointments (doctor_id, visit_type, appointment_date)
  WHERE deleted_at IS NULL;
