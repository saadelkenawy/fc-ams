#!/usr/bin/env bash
# Create/refresh the fadl_app role and grant it DML on every service database.
# Idempotent — safe to re-run after adding a new service database.
#
# Usage (local dev, against the compose postgres container):
#   bash infra/postgres/apply-app-role.sh
# Production:
#   APP_DB_PASSWORD=<secret> PSQL="psql -h <host> -U fadl" bash infra/postgres/apply-app-role.sh
set -euo pipefail

cd "$(dirname "$0")"

APP_DB_PASSWORD="${APP_DB_PASSWORD:-fadl_app_dev_secret}"
PSQL="${PSQL:-docker exec -i fcms-postgres-1 psql -U fadl}"

DATABASES=(
  fadl_identity fadl_patients fadl_appointments fadl_doctors fadl_billing
  fadl_notifications fadl_chatbot fadl_files fadl_ehr fadl_procedures
  fadl_procurement fadl_integrations
)

echo "==> creating/refreshing role fadl_app"
$PSQL -d postgres -v app_password="$APP_DB_PASSWORD" -f - < create-app-role.sql

for db in "${DATABASES[@]}"; do
  echo "==> granting on $db"
  $PSQL -d postgres -c "GRANT CONNECT ON DATABASE $db TO fadl_app;"
  $PSQL -d "$db" -f - < grant-app-role.sql
done

echo "==> verification"
$PSQL -d postgres -c "SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname IN ('fadl','fadl_app');"
