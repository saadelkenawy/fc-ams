#!/usr/bin/env bash
# Run Flyway-style migrations manually (no Flyway needed — plain psql)
# Usage:
#   ./scripts/migrate.sh               # migrate all services
#   ./scripts/migrate.sh patient       # migrate one service
#
# Expects PGPASSWORD or .env.local in project root.
# Defaults to the docker-compose dev postgres on localhost:5432.

set -euo pipefail

PG_HOST="${PG_HOST:-localhost}"
PG_PORT="${PG_PORT:-5432}"
PG_USER="${PG_USER:-fadl}"
export PGPASSWORD="${PGPASSWORD:-fadl_dev_secret}"

declare -A SERVICE_DBS=(
  [identity]="fadl_identity"
  [patient]="fadl_patients"
  [appointment]="fadl_appointments"
  [doctor]="fadl_doctors"
  [billing]="fadl_billing"
  [procurement]="fadl_procurement"
)

run_migrations() {
  local svc="$1"
  local db="${SERVICE_DBS[$svc]}"
  local dir="services/${svc}-service/db/migrations"

  if [[ ! -d "$dir" ]]; then
    echo "⚠  No migrations directory for $svc — skipping"
    return
  fi

  echo ""
  echo "▶  Migrating $svc → $db"

  for sql_file in $(ls "$dir"/*.sql 2>/dev/null | sort); do
    echo "   Applying $(basename "$sql_file") ..."
    psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$db" -f "$sql_file" \
      --set ON_ERROR_STOP=1 -q
  done

  echo "   ✓ $svc done"
}

TARGET="${1:-all}"

if [[ "$TARGET" == "all" ]]; then
  for svc in identity patient appointment doctor billing procurement; do
    run_migrations "$svc"
  done
else
  if [[ -z "${SERVICE_DBS[$TARGET]+_}" ]]; then
    echo "Unknown service: $TARGET. Valid: identity, patient, appointment, doctor, billing, procurement"
    exit 1
  fi
  run_migrations "$TARGET"
fi

echo ""
echo "✅  Migrations complete."
