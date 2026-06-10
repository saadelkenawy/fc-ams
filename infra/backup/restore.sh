#!/usr/bin/env bash
# Restore one database from a nightly dump (run from the repo root on the host).
#
# Usage:
#   bash infra/backup/restore.sh <db> <YYYY-MM-DD>
#   bash infra/backup/restore.sh fadl_billing 2026-06-10
#
# DANGER: --clean drops existing objects in the target DB before restoring.
# Stop the owning service first so it doesn't write during the restore.
set -euo pipefail

DB="${1:?usage: restore.sh <db> <YYYY-MM-DD>}"
STAMP="${2:?usage: restore.sh <db> <YYYY-MM-DD>}"
CONTAINER="${DB_BACKUP_CONTAINER:-fcms-db-backup-1}"

echo "About to restore $DB from /backups/$STAMP/$DB.dump (drops existing objects)."
read -r -p "Type the database name to confirm: " confirm
[[ "$confirm" == "$DB" ]] || { echo "aborted"; exit 1; }

docker exec "$CONTAINER" pg_restore \
  -h postgres -U fadl -d "$DB" \
  --clean --if-exists --no-owner \
  "/backups/$STAMP/$DB.dump"

echo "Restore of $DB from $STAMP complete. Re-run 'bash infra/postgres/apply-app-role.sh'"
echo "if grants were affected, then restart the owning service."
