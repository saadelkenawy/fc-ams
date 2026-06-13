-- Migration: V014 — Independent confirmation flags on appointments
-- Doctor and patient confirmation are tracked separately from the lifecycle
-- status. The room/clinic confirmation is derived live from room capacity and
-- status, so it is NOT stored here. When both stored flags are true and the
-- assigned room is ready, the status auto-advances TBC → Ok! (see
-- appointment.repository.updateConfirmations).

ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS doctor_confirmed  BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS patient_confirmed BOOLEAN NOT NULL DEFAULT FALSE;

-- Existing confirmed/checked-in/completed appointments are implicitly
-- doctor- and patient-confirmed (they reached Ok! under the old single toggle).
UPDATE appointments
   SET doctor_confirmed = TRUE, patient_confirmed = TRUE
 WHERE status IN ('Ok!', 'Conf.', 'Comp.')
   AND (doctor_confirmed = FALSE OR patient_confirmed = FALSE);
