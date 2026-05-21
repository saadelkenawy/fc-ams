-- Migration V010: Add monthly partitions for June 2026 – December 2027
-- Also fixes status CHECK constraint to include 'Ref.' (used by refund flow)

-- ─── STATUS CONSTRAINT FIX ────────────────────────────────────────────────────
-- 'Ref.' is used by the refund/status-update flow but was missing from V001 CHECK

ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_status_check;

-- Re-add on parent table (propagates to all partitions)
ALTER TABLE appointments
    ADD CONSTRAINT appointments_status_check
    CHECK (status IN ('TBC', 'Ok!', 'Conf.', 'Comp.', 'Canc.', 'Resch.', 'Inf.', 'Ref.'));

-- ─── BRANCH 1 PARTITIONS — 2026 ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS appointments_branch_1_y2026m06
    PARTITION OF appointments_branch_1
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

ALTER TABLE appointments_branch_1_y2026m06
    ADD CONSTRAINT appt_no_double_book_b1_2026m06
    EXCLUDE USING gist (
        doctor_id         WITH =,
        appointment_range WITH &&
    ) WHERE (status NOT IN ('Canc.', 'Resch.') AND is_overbooked = FALSE AND deleted_at IS NULL);

CREATE TABLE IF NOT EXISTS appointments_branch_1_y2026m07
    PARTITION OF appointments_branch_1
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

ALTER TABLE appointments_branch_1_y2026m07
    ADD CONSTRAINT appt_no_double_book_b1_2026m07
    EXCLUDE USING gist (
        doctor_id         WITH =,
        appointment_range WITH &&
    ) WHERE (status NOT IN ('Canc.', 'Resch.') AND is_overbooked = FALSE AND deleted_at IS NULL);

CREATE TABLE IF NOT EXISTS appointments_branch_1_y2026m08
    PARTITION OF appointments_branch_1
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

ALTER TABLE appointments_branch_1_y2026m08
    ADD CONSTRAINT appt_no_double_book_b1_2026m08
    EXCLUDE USING gist (
        doctor_id         WITH =,
        appointment_range WITH &&
    ) WHERE (status NOT IN ('Canc.', 'Resch.') AND is_overbooked = FALSE AND deleted_at IS NULL);

CREATE TABLE IF NOT EXISTS appointments_branch_1_y2026m09
    PARTITION OF appointments_branch_1
    FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

ALTER TABLE appointments_branch_1_y2026m09
    ADD CONSTRAINT appt_no_double_book_b1_2026m09
    EXCLUDE USING gist (
        doctor_id         WITH =,
        appointment_range WITH &&
    ) WHERE (status NOT IN ('Canc.', 'Resch.') AND is_overbooked = FALSE AND deleted_at IS NULL);

CREATE TABLE IF NOT EXISTS appointments_branch_1_y2026m10
    PARTITION OF appointments_branch_1
    FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');

ALTER TABLE appointments_branch_1_y2026m10
    ADD CONSTRAINT appt_no_double_book_b1_2026m10
    EXCLUDE USING gist (
        doctor_id         WITH =,
        appointment_range WITH &&
    ) WHERE (status NOT IN ('Canc.', 'Resch.') AND is_overbooked = FALSE AND deleted_at IS NULL);

CREATE TABLE IF NOT EXISTS appointments_branch_1_y2026m11
    PARTITION OF appointments_branch_1
    FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');

ALTER TABLE appointments_branch_1_y2026m11
    ADD CONSTRAINT appt_no_double_book_b1_2026m11
    EXCLUDE USING gist (
        doctor_id         WITH =,
        appointment_range WITH &&
    ) WHERE (status NOT IN ('Canc.', 'Resch.') AND is_overbooked = FALSE AND deleted_at IS NULL);

CREATE TABLE IF NOT EXISTS appointments_branch_1_y2026m12
    PARTITION OF appointments_branch_1
    FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

ALTER TABLE appointments_branch_1_y2026m12
    ADD CONSTRAINT appt_no_double_book_b1_2026m12
    EXCLUDE USING gist (
        doctor_id         WITH =,
        appointment_range WITH &&
    ) WHERE (status NOT IN ('Canc.', 'Resch.') AND is_overbooked = FALSE AND deleted_at IS NULL);

-- ─── BRANCH 1 PARTITIONS — 2027 ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS appointments_branch_1_y2027m01
    PARTITION OF appointments_branch_1
    FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');

ALTER TABLE appointments_branch_1_y2027m01
    ADD CONSTRAINT appt_no_double_book_b1_2027m01
    EXCLUDE USING gist (
        doctor_id         WITH =,
        appointment_range WITH &&
    ) WHERE (status NOT IN ('Canc.', 'Resch.') AND is_overbooked = FALSE AND deleted_at IS NULL);

CREATE TABLE IF NOT EXISTS appointments_branch_1_y2027m02
    PARTITION OF appointments_branch_1
    FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');

ALTER TABLE appointments_branch_1_y2027m02
    ADD CONSTRAINT appt_no_double_book_b1_2027m02
    EXCLUDE USING gist (
        doctor_id         WITH =,
        appointment_range WITH &&
    ) WHERE (status NOT IN ('Canc.', 'Resch.') AND is_overbooked = FALSE AND deleted_at IS NULL);

CREATE TABLE IF NOT EXISTS appointments_branch_1_y2027m03
    PARTITION OF appointments_branch_1
    FOR VALUES FROM ('2027-03-01') TO ('2027-04-01');

ALTER TABLE appointments_branch_1_y2027m03
    ADD CONSTRAINT appt_no_double_book_b1_2027m03
    EXCLUDE USING gist (
        doctor_id         WITH =,
        appointment_range WITH &&
    ) WHERE (status NOT IN ('Canc.', 'Resch.') AND is_overbooked = FALSE AND deleted_at IS NULL);

CREATE TABLE IF NOT EXISTS appointments_branch_1_y2027m04
    PARTITION OF appointments_branch_1
    FOR VALUES FROM ('2027-04-01') TO ('2027-05-01');

ALTER TABLE appointments_branch_1_y2027m04
    ADD CONSTRAINT appt_no_double_book_b1_2027m04
    EXCLUDE USING gist (
        doctor_id         WITH =,
        appointment_range WITH &&
    ) WHERE (status NOT IN ('Canc.', 'Resch.') AND is_overbooked = FALSE AND deleted_at IS NULL);

CREATE TABLE IF NOT EXISTS appointments_branch_1_y2027m05
    PARTITION OF appointments_branch_1
    FOR VALUES FROM ('2027-05-01') TO ('2027-06-01');

ALTER TABLE appointments_branch_1_y2027m05
    ADD CONSTRAINT appt_no_double_book_b1_2027m05
    EXCLUDE USING gist (
        doctor_id         WITH =,
        appointment_range WITH &&
    ) WHERE (status NOT IN ('Canc.', 'Resch.') AND is_overbooked = FALSE AND deleted_at IS NULL);

CREATE TABLE IF NOT EXISTS appointments_branch_1_y2027m06
    PARTITION OF appointments_branch_1
    FOR VALUES FROM ('2027-06-01') TO ('2027-07-01');

ALTER TABLE appointments_branch_1_y2027m06
    ADD CONSTRAINT appt_no_double_book_b1_2027m06
    EXCLUDE USING gist (
        doctor_id         WITH =,
        appointment_range WITH &&
    ) WHERE (status NOT IN ('Canc.', 'Resch.') AND is_overbooked = FALSE AND deleted_at IS NULL);

CREATE TABLE IF NOT EXISTS appointments_branch_1_y2027m07
    PARTITION OF appointments_branch_1
    FOR VALUES FROM ('2027-07-01') TO ('2027-08-01');

ALTER TABLE appointments_branch_1_y2027m07
    ADD CONSTRAINT appt_no_double_book_b1_2027m07
    EXCLUDE USING gist (
        doctor_id         WITH =,
        appointment_range WITH &&
    ) WHERE (status NOT IN ('Canc.', 'Resch.') AND is_overbooked = FALSE AND deleted_at IS NULL);

CREATE TABLE IF NOT EXISTS appointments_branch_1_y2027m08
    PARTITION OF appointments_branch_1
    FOR VALUES FROM ('2027-08-01') TO ('2027-09-01');

ALTER TABLE appointments_branch_1_y2027m08
    ADD CONSTRAINT appt_no_double_book_b1_2027m08
    EXCLUDE USING gist (
        doctor_id         WITH =,
        appointment_range WITH &&
    ) WHERE (status NOT IN ('Canc.', 'Resch.') AND is_overbooked = FALSE AND deleted_at IS NULL);

CREATE TABLE IF NOT EXISTS appointments_branch_1_y2027m09
    PARTITION OF appointments_branch_1
    FOR VALUES FROM ('2027-09-01') TO ('2027-10-01');

ALTER TABLE appointments_branch_1_y2027m09
    ADD CONSTRAINT appt_no_double_book_b1_2027m09
    EXCLUDE USING gist (
        doctor_id         WITH =,
        appointment_range WITH &&
    ) WHERE (status NOT IN ('Canc.', 'Resch.') AND is_overbooked = FALSE AND deleted_at IS NULL);

CREATE TABLE IF NOT EXISTS appointments_branch_1_y2027m10
    PARTITION OF appointments_branch_1
    FOR VALUES FROM ('2027-10-01') TO ('2027-11-01');

ALTER TABLE appointments_branch_1_y2027m10
    ADD CONSTRAINT appt_no_double_book_b1_2027m10
    EXCLUDE USING gist (
        doctor_id         WITH =,
        appointment_range WITH &&
    ) WHERE (status NOT IN ('Canc.', 'Resch.') AND is_overbooked = FALSE AND deleted_at IS NULL);

CREATE TABLE IF NOT EXISTS appointments_branch_1_y2027m11
    PARTITION OF appointments_branch_1
    FOR VALUES FROM ('2027-11-01') TO ('2027-12-01');

ALTER TABLE appointments_branch_1_y2027m11
    ADD CONSTRAINT appt_no_double_book_b1_2027m11
    EXCLUDE USING gist (
        doctor_id         WITH =,
        appointment_range WITH &&
    ) WHERE (status NOT IN ('Canc.', 'Resch.') AND is_overbooked = FALSE AND deleted_at IS NULL);

CREATE TABLE IF NOT EXISTS appointments_branch_1_y2027m12
    PARTITION OF appointments_branch_1
    FOR VALUES FROM ('2027-12-01') TO ('2028-01-01');

ALTER TABLE appointments_branch_1_y2027m12
    ADD CONSTRAINT appt_no_double_book_b1_2027m12
    EXCLUDE USING gist (
        doctor_id         WITH =,
        appointment_range WITH &&
    ) WHERE (status NOT IN ('Canc.', 'Resch.') AND is_overbooked = FALSE AND deleted_at IS NULL);
