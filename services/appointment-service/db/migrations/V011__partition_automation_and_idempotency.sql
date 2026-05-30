-- Migration V011: Partition automation + idempotency uniqueness backfill
--
-- Fixes high-severity audit findings:
--   - #2: No partition automation. Adds a SQL helper function + extends runway through 2028.
--   - #3: Idempotency UNIQUE index only existed on the May 2026 leaf. Backfills every
--         partition created by V010 and ensures the helper applies it going forward.

-- ─── 1. Partition factory function ────────────────────────────────────────────
-- Creates an appointments leaf partition for (branch, year, month) and attaches:
--   * the double-booking exclusion constraint
--   * the per-partition idempotency UNIQUE index
-- Idempotent: safe to call repeatedly and from a monthly cron job.

CREATE OR REPLACE FUNCTION create_appointment_partition(
    p_branch_id INT,
    p_year      INT,
    p_month     INT
) RETURNS VOID AS $$
DECLARE
    v_part_name TEXT := format('appointments_branch_%s_y%sm%s',
                               p_branch_id, p_year, lpad(p_month::TEXT, 2, '0'));
    v_excl_name TEXT := format('appt_no_double_book_b%s_%sm%s',
                               p_branch_id, p_year, lpad(p_month::TEXT, 2, '0'));
    v_idem_name TEXT := format('idx_appointments_idempotency_b%s_%sm%s',
                               p_branch_id, p_year, lpad(p_month::TEXT, 2, '0'));
    v_parent    TEXT := format('appointments_branch_%s', p_branch_id);
    v_from      DATE := make_date(p_year, p_month, 1);
    v_to        DATE := (make_date(p_year, p_month, 1) + INTERVAL '1 month')::DATE;
BEGIN
    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
        v_part_name, v_parent, v_from, v_to
    );

    -- Add the double-booking exclusion constraint only if it isn't already present.
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = v_excl_name
    ) THEN
        EXECUTE format(
            'ALTER TABLE %I ADD CONSTRAINT %I '
            'EXCLUDE USING gist (doctor_id WITH =, appointment_range WITH &&) '
            'WHERE (status NOT IN (''Canc.'', ''Resch.'') '
            '       AND is_overbooked = FALSE '
            '       AND deleted_at IS NULL)',
            v_part_name, v_excl_name
        );
    END IF;

    -- Per-partition idempotency uniqueness (partitioned parents can't carry a
    -- partial UNIQUE on a subset of columns, so each leaf carries its own).
    EXECUTE format(
        'CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I (idempotency_key) '
        'WHERE idempotency_key IS NOT NULL',
        v_idem_name, v_part_name
    );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_appointment_partition(INT, INT, INT) IS
    'Creates a monthly leaf partition under appointments_branch_<id> with double-book '
    'exclusion + idempotency UNIQUE index. Idempotent; safe for monthly cron.';

-- ─── 2. Backfill idempotency UNIQUE on every existing partition ───────────────
-- V001 only created the index on b1_2026m05; V010 added 18 more partitions without it.

CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_idempotency_b1_2026m06
    ON appointments_branch_1_y2026m06 (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_idempotency_b1_2026m07
    ON appointments_branch_1_y2026m07 (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_idempotency_b1_2026m08
    ON appointments_branch_1_y2026m08 (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_idempotency_b1_2026m09
    ON appointments_branch_1_y2026m09 (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_idempotency_b1_2026m10
    ON appointments_branch_1_y2026m10 (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_idempotency_b1_2026m11
    ON appointments_branch_1_y2026m11 (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_idempotency_b1_2026m12
    ON appointments_branch_1_y2026m12 (idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_idempotency_b1_2027m01
    ON appointments_branch_1_y2027m01 (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_idempotency_b1_2027m02
    ON appointments_branch_1_y2027m02 (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_idempotency_b1_2027m03
    ON appointments_branch_1_y2027m03 (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_idempotency_b1_2027m04
    ON appointments_branch_1_y2027m04 (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_idempotency_b1_2027m05
    ON appointments_branch_1_y2027m05 (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_idempotency_b1_2027m06
    ON appointments_branch_1_y2027m06 (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_idempotency_b1_2027m07
    ON appointments_branch_1_y2027m07 (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_idempotency_b1_2027m08
    ON appointments_branch_1_y2027m08 (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_idempotency_b1_2027m09
    ON appointments_branch_1_y2027m09 (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_idempotency_b1_2027m10
    ON appointments_branch_1_y2027m10 (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_idempotency_b1_2027m11
    ON appointments_branch_1_y2027m11 (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_idempotency_b1_2027m12
    ON appointments_branch_1_y2027m12 (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ─── 3. Extend runway through 2028 using the new helper ───────────────────────

SELECT create_appointment_partition(1, 2028,  1);
SELECT create_appointment_partition(1, 2028,  2);
SELECT create_appointment_partition(1, 2028,  3);
SELECT create_appointment_partition(1, 2028,  4);
SELECT create_appointment_partition(1, 2028,  5);
SELECT create_appointment_partition(1, 2028,  6);
SELECT create_appointment_partition(1, 2028,  7);
SELECT create_appointment_partition(1, 2028,  8);
SELECT create_appointment_partition(1, 2028,  9);
SELECT create_appointment_partition(1, 2028, 10);
SELECT create_appointment_partition(1, 2028, 11);
SELECT create_appointment_partition(1, 2028, 12);

-- ─── 4. Operator note ─────────────────────────────────────────────────────────
-- Schedule the following monthly (e.g. cron on the 1st of each month at 02:00) to
-- maintain a 12-month forward runway:
--
--   psql $DATABASE_URL -c "SELECT create_appointment_partition(
--       1,
--       EXTRACT(YEAR  FROM (NOW() + INTERVAL '12 months'))::INT,
--       EXTRACT(MONTH FROM (NOW() + INTERVAL '12 months'))::INT
--   );"
