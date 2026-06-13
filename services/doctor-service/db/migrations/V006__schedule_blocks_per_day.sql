-- ─────────────────────────────────────────────────────────────────────────────
-- V006 — Multiple working-hour blocks per day (doctor_schedules)
--
-- Until now a doctor could have at most ONE schedule row per weekday
-- (uq_doctor_day UNIQUE (doctor_id, day_of_week)), so the upsert-by-day flow
-- silently overwrote existing hours. We now allow several non-overlapping
-- blocks on the same weekday (e.g. a morning and an evening shift) while still
-- rejecting any time overlap at the database level.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Drop the one-row-per-day constraint + its partial unique index.
ALTER TABLE doctor_schedules DROP CONSTRAINT IF EXISTS uq_doctor_day;
DROP INDEX IF EXISTS idx_schedules_doctor_day;

-- Reject overlapping ACTIVE blocks for the same doctor on the same weekday.
-- Back-to-back blocks (09:00–13:00 + 13:00–17:00) are allowed because tsrange
-- is half-open [). Disabled blocks (is_active = FALSE) never conflict, so a day
-- can be turned off and its hours preserved for re-enabling later.
ALTER TABLE doctor_schedules
    ADD CONSTRAINT excl_schedule_block_overlap
    EXCLUDE USING gist (
        doctor_id   WITH =,
        day_of_week WITH =,
        tsrange(DATE '2000-01-01' + start_time, DATE '2000-01-01' + end_time) WITH &&
    ) WHERE (is_active);

-- Lookup index for the management page (all blocks, ordered).
CREATE INDEX IF NOT EXISTS idx_schedules_doctor_day_time
    ON doctor_schedules (doctor_id, day_of_week, start_time);
