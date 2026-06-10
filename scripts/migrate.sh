#!/usr/bin/env bash
# Versioned migration runner (Flyway-style, plain psql + a schema_version ledger).
#
# Each database gets a schema_version table recording (version, description,
# checksum, applied_at). On every run the runner:
#   1. validates that already-applied files have unchanged checksums (drift check)
#   2. applies pending V*.sql files in order, each in its own transaction
#
# Usage:
#   ./scripts/migrate.sh                    # migrate all services
#   ./scripts/migrate.sh patient            # migrate one service
#   ./scripts/migrate.sh all baseline       # record existing files as applied WITHOUT running them
#   ./scripts/migrate.sh billing baseline   # baseline a single service
#
# Baseline is for databases that already contain the schema (e.g. the long-
# running dev stack) — run it ONCE before the first ledgered migration.
#
# Connection via env: PG_HOST, PG_PORT, PG_USER, PGPASSWORD.
# Migrations run as the admin role (fadl); fadl_app gets access to new objects
# via the default privileges configured in infra/postgres/grant-app-role.sql.

set -euo pipefail

PG_HOST="${PG_HOST:-localhost}"
PG_PORT="${PG_PORT:-5432}"
PG_USER="${PG_USER:-fadl}"
export PGPASSWORD="${PGPASSWORD:-fadl_dev_secret}"

# Use host psql when available; otherwise exec into the compose postgres
# container (override with DOCKER_PG=<container>). SQL files are streamed via
# stdin so they never need to exist inside the container.
if command -v psql >/dev/null 2>&1; then
  psql_cmd() { psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -v ON_ERROR_STOP=1 -q "$@"; }
else
  DOCKER_PG="${DOCKER_PG:-fcms-postgres-1}"
  psql_cmd() { docker exec -i -e PGPASSWORD="$PGPASSWORD" "$DOCKER_PG" psql -U "$PG_USER" -v ON_ERROR_STOP=1 -q "$@"; }
fi

declare -A SERVICE_DBS=(
  [identity]="fadl_identity"
  [patient]="fadl_patients"
  [appointment]="fadl_appointments"
  [doctor]="fadl_doctors"
  [billing]="fadl_billing"
  [ehr]="fadl_ehr"
  [procurement]="fadl_procurement"
  [notification]="fadl_notifications"
  [ai-chatbot]="fadl_chatbot"
  [file]="fadl_files"
  [procedure]="fadl_procedures"
  [integration]="fadl_integrations"
)

ALL_SERVICES=(identity patient appointment doctor billing ehr procurement notification ai-chatbot file procedure integration)

checksum() { sha256sum "$1" | cut -d' ' -f1; }

ensure_ledger() {
  local db="$1"
  psql_cmd -d "$db" -c "
    CREATE TABLE IF NOT EXISTS schema_version (
      version     VARCHAR(20)  PRIMARY KEY,
      description TEXT         NOT NULL,
      checksum    CHAR(64)     NOT NULL,
      applied_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      baselined   BOOLEAN      NOT NULL DEFAULT FALSE
    );" >/dev/null
}

run_migrations() {
  local svc="$1" mode="${2:-apply}"
  local db="${SERVICE_DBS[$svc]}"
  local dir="services/${svc}-service/db/migrations"

  if [[ ! -d "$dir" ]]; then
    echo "-  No migrations directory for $svc — skipping"
    return
  fi

  echo ""
  echo ">  ${mode^} $svc -> $db"
  ensure_ledger "$db"

  local applied=0 skipped=0
  for sql_file in $(ls "$dir"/V*.sql 2>/dev/null | sort); do
    local fname version desc sum recorded
    fname="$(basename "$sql_file")"
    version="${fname%%__*}"            # e.g. V012
    desc="${fname#*__}"; desc="${desc%.sql}"
    sum="$(checksum "$sql_file")"

    recorded="$(psql_cmd -d "$db" -tA -c "SELECT checksum FROM schema_version WHERE version = '$version'")"

    if [[ -n "$recorded" ]]; then
      if [[ "$recorded" != "$sum" ]]; then
        echo "   !! DRIFT: $fname checksum differs from the applied version." >&2
        echo "      Never edit an applied migration — add a new V-file instead." >&2
        exit 1
      fi
      skipped=$((skipped + 1))
      continue
    fi

    if [[ "$mode" == "baseline" ]]; then
      psql_cmd -d "$db" -c "INSERT INTO schema_version (version, description, checksum, baselined) VALUES ('$version', '$desc', '$sum', TRUE)" >/dev/null
      echo "   = baselined $fname (not executed)"
    else
      echo "   + applying $fname ..."
      psql_cmd -d "$db" --single-transaction -f - < "$sql_file"
      psql_cmd -d "$db" -c "INSERT INTO schema_version (version, description, checksum) VALUES ('$version', '$desc', '$sum')" >/dev/null
    fi
    applied=$((applied + 1))
  done

  echo "   OK $svc — ${applied} ${mode}d, ${skipped} already applied"
}

TARGET="${1:-all}"
MODE="${2:-apply}"

if [[ "$MODE" != "apply" && "$MODE" != "baseline" ]]; then
  echo "Unknown mode: $MODE (use: apply | baseline)"; exit 1
fi

if [[ "$TARGET" == "all" ]]; then
  for svc in "${ALL_SERVICES[@]}"; do
    run_migrations "$svc" "$MODE"
  done
else
  if [[ -z "${SERVICE_DBS[$TARGET]+_}" ]]; then
    echo "Unknown service: $TARGET. Valid: ${ALL_SERVICES[*]}"
    exit 1
  fi
  run_migrations "$TARGET" "$MODE"
fi

echo ""
echo "Done."
