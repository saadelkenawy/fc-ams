#!/bin/sh
# Entrypoint for the db-backup compose service: run a backup immediately on
# start (so a fresh deployment always has at least one), then once per day.
set -eu

INTERVAL_SECS="${BACKUP_INTERVAL_SECS:-86400}"

while true; do
  /opt/backup/backup.sh || echo "[backup] run failed — retrying at next interval" >&2
  /opt/backup/partition-maintenance.sh || echo "[partitions] maintenance failed — retrying at next interval" >&2
  sleep "$INTERVAL_SECS"
done
