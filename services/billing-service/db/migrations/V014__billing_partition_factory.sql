-- §3.4: V001 created financial_transactions leaves only through July 2026 —
-- from 2026-08-01 every insert would fail with "no partition found for row".
-- Adds the same idempotent factory pattern appointments got in its V011, and
-- extends the runway through 2028. The maintenance job (db-backup container)
-- calls the factory daily to keep a rolling 12-month runway.

CREATE OR REPLACE FUNCTION create_billing_partition(
    p_branch_id INT,
    p_year      INT,
    p_month     INT
) RETURNS VOID AS $$
DECLARE
    v_parent    TEXT := format('financial_transactions_branch_%s', p_branch_id);
    v_part_name TEXT := format('ft_branch_%s_y%sm%s',
                               p_branch_id, p_year, lpad(p_month::TEXT, 2, '0'));
    v_from      DATE := make_date(p_year, p_month, 1);
    v_to        DATE := (make_date(p_year, p_month, 1) + INTERVAL '1 month')::DATE;
BEGIN
    -- Branch LIST parent (no-op for existing branches; makes onboarding a new
    -- branch a single factory call).
    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF financial_transactions '
        'FOR VALUES IN (%s) PARTITION BY RANGE (transaction_date)',
        v_parent, p_branch_id
    );

    -- Monthly leaf. Parent-level indexes, the UNIQUE constraint and the
    -- immutability/recalc row triggers all propagate automatically (PG13+).
    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
        v_part_name, v_parent, v_from, v_to
    );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_billing_partition(INT, INT, INT) IS
    'Creates branch LIST parent (if missing) + monthly leaf for financial_transactions. '
    'Idempotent; called daily by the partition-maintenance job.';

-- Extend runway: Aug 2026 → Dec 2028 (matches appointments).
DO $$
DECLARE
    d DATE := DATE '2026-08-01';
BEGIN
    WHILE d <= DATE '2028-12-01' LOOP
        PERFORM create_billing_partition(1, EXTRACT(YEAR FROM d)::INT, EXTRACT(MONTH FROM d)::INT);
        d := (d + INTERVAL '1 month')::DATE;
    END LOOP;
END $$;
