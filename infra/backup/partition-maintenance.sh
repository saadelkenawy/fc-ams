#!/bin/sh
# Partition lifecycle maintenance (fable-enhancement §3.4). Runs daily inside
# the db-backup compose service, right after backups.
#
# For every branch parent in the two partitioned databases it calls the
# idempotent factory function to keep a 12-month forward runway of monthly
# leaves, then verifies the next 3 months exist — printing an ALERT line and
# exiting non-zero if not (the entrypoint loop logs and continues).
set -eu

PGHOST="${PGHOST:-postgres}"
PGUSER="${PGUSER:-fadl}"
# PGPASSWORD comes from the environment

# $1=db  $2=parent-name regexp prefix  $3=factory function
ensure_runway() {
  db="$1"; prefix="$2"; factory="$3"

  psql -h "$PGHOST" -U "$PGUSER" -d "$db" -v ON_ERROR_STOP=1 -q <<SQL
DO \$\$
DECLARE
    b INT;
    d DATE;
    i INT;
BEGIN
    FOR b IN
        SELECT (regexp_match(tablename, '^${prefix}_(\d+)\$'))[1]::INT
        FROM pg_tables
        WHERE tablename ~ '^${prefix}_\d+\$'
    LOOP
        d := date_trunc('month', now())::DATE;
        FOR i IN 0..12 LOOP
            PERFORM ${factory}(b, EXTRACT(YEAR FROM d)::INT, EXTRACT(MONTH FROM d)::INT);
            d := (d + INTERVAL '1 month')::DATE;
        END LOOP;
    END LOOP;
END \$\$;
SQL
}

# $1=db  $2=leaf name pattern with %B (branch) %Y %M placeholders
check_next_quarter() {
  db="$1"; pattern="$2"
  missing=$(psql -h "$PGHOST" -U "$PGUSER" -d "$db" -tA <<SQL
WITH branches AS (
    SELECT (regexp_match(tablename, '_branch_(\d+)\$'))[1] AS b
    FROM pg_tables WHERE tablename ~ '_branch_\d+\$'
), months AS (
    SELECT date_trunc('month', now())::DATE + (n || ' months')::INTERVAL AS m
    FROM generate_series(1, 3) n
)
SELECT replace(replace(replace('${pattern}', '%B', b),
               '%Y', to_char(m, 'YYYY')), '%M', to_char(m, 'MM'))
FROM branches CROSS JOIN months
WHERE NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE tablename =
        replace(replace(replace('${pattern}', '%B', b),
                '%Y', to_char(m, 'YYYY')), '%M', to_char(m, 'MM'))
);
SQL
)
  if [ -n "$missing" ]; then
    echo "[partitions] ALERT: $db is missing upcoming partitions: $missing" >&2
    return 1
  fi
}

echo "[partitions] $(date -Iseconds) ensuring 12-month runway"
rc=0
ensure_runway fadl_appointments appointments_branch create_appointment_partition || rc=1
ensure_runway fadl_billing financial_transactions_branch create_billing_partition || rc=1
check_next_quarter fadl_appointments 'appointments_branch_%B_y%Ym%M' || rc=1
check_next_quarter fadl_billing 'ft_branch_%B_y%Ym%M' || rc=1
[ "$rc" -eq 0 ] && echo "[partitions] ok — next 3 months covered in both DBs"
exit "$rc"
