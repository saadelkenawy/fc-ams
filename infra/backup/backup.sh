#!/bin/sh
# Nightly logical backups of all Fadl Clinic databases (pg_dump custom format).
# Runs inside the db-backup compose service (postgres:16-alpine).
#
# Layout:  /backups/<YYYY-MM-DD>/<db>.dump
# Retention: BACKUP_RETENTION_DAYS (default 14) daily folders are kept.
#
# Restore a single database (see restore.sh):
#   pg_restore -h postgres -U fadl -d <db> --clean --if-exists /backups/<date>/<db>.dump
set -eu

PGHOST="${PGHOST:-postgres}"
PGUSER="${PGUSER:-fadl}"
# PGPASSWORD comes from the environment
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
DEST_ROOT="${BACKUP_DEST:-/backups}"

DATABASES="fadl_identity fadl_patients fadl_appointments fadl_doctors fadl_billing fadl_notifications fadl_chatbot fadl_files fadl_ehr fadl_procedures fadl_procurement fadl_integrations"

stamp="$(date +%F)"
dest="$DEST_ROOT/$stamp"
mkdir -p "$dest"

echo "[backup] $(date -Iseconds) starting -> $dest"
fail=0
for db in $DATABASES; do
  if pg_dump -h "$PGHOST" -U "$PGUSER" -Fc -f "$dest/$db.dump.tmp" "$db"; then
    mv "$dest/$db.dump.tmp" "$dest/$db.dump"
    echo "[backup]   ok  $db ($(du -h "$dest/$db.dump" | cut -f1))"
  else
    rm -f "$dest/$db.dump.tmp"
    echo "[backup]   FAILED $db" >&2
    fail=1
  fi
done

# Also keep the cluster-wide globals (roles, grants)
pg_dumpall -h "$PGHOST" -U "$PGUSER" --globals-only > "$dest/globals.sql" \
  && echo "[backup]   ok  globals.sql" || { echo "[backup]   FAILED globals" >&2; fail=1; }

# Prune folders older than the retention window
find "$DEST_ROOT" -maxdepth 1 -mindepth 1 -type d -mtime "+$RETENTION_DAYS" -exec rm -rf {} + 2>/dev/null || true

echo "[backup] $(date -Iseconds) finished (fail=$fail)"
exit "$fail"
