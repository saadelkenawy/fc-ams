-- V013: allow multiple sequential doctors per room per day.
-- The per-day unique indexes (V007) made the waiting screen's "next doctor"
-- impossible: a second reserved/active assignment for the same room+date was
-- rejected even when the time windows didn't touch. Replace them with
-- time-overlap exclusion constraints so back-to-back assignments coexist
-- while overlapping ones are still rejected at the DB level.

CREATE EXTENSION IF NOT EXISTS btree_gist;

DROP INDEX IF EXISTS uq_room_active_reserved;
DROP INDEX IF EXISTS uq_doctor_active_reserved;

ALTER TABLE room_assignments
    ADD CONSTRAINT excl_room_assignment_overlap
    EXCLUDE USING gist (
        room_id WITH =,
        tsrange(assigned_date + assigned_from, assigned_date + assigned_until) WITH &&
    ) WHERE (status IN ('reserved', 'active'));

ALTER TABLE room_assignments
    ADD CONSTRAINT excl_doctor_assignment_overlap
    EXCLUDE USING gist (
        doctor_id WITH =,
        tsrange(assigned_date + assigned_from, assigned_date + assigned_until) WITH &&
    ) WHERE (status IN ('reserved', 'active'));
