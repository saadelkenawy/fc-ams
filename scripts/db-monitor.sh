#!/usr/bin/env bash
# Real-time DB monitoring: patient writes, replication lag, active queries
# Usage: bash scripts/db-monitor.sh [interval_seconds]
INTERVAL="${1:-5}"
PG="docker exec fcms-postgres-1 psql -U fadl -d fadl_patients -t -A"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

echo -e "${CYAN}Fadl Clinic — DB Monitor (every ${INTERVAL}s) — Ctrl-C to stop${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

while true; do
  STAMP=$(date '+%H:%M:%S')
  echo -e "\n${YELLOW}[$STAMP]${NC}"

  # Patient counts
  TOTAL=$($PG -c "SELECT COUNT(*) FROM patients WHERE deleted_at IS NULL" 2>/dev/null || echo "—")
  NEW_5M=$($PG -c "SELECT COUNT(*) FROM patients WHERE created_at > NOW()-INTERVAL '5 minutes' AND deleted_at IS NULL" 2>/dev/null || echo "—")
  echo -e "  ${CYAN}Patients:${NC} total=$TOTAL  created_last_5m=$NEW_5M"

  # Recent writes
  RECENT=$($PG -c "SELECT mobile, name_en, created_at::text FROM patients WHERE created_at > NOW()-INTERVAL '5 minutes' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 5" 2>/dev/null || echo "")
  if [[ -n "$RECENT" ]]; then
    echo -e "  ${GREEN}Recent inserts:${NC}"
    echo "$RECENT" | while IFS='|' read -r mob name ts; do
      echo "    $ts  $name  ($mob)"
    done
  fi

  # Appointment service DB
  APPT_TOTAL=$(docker exec fcms-postgres-1 psql -U fadl -d fadl_appointments -t -A \
    -c "SELECT COUNT(*) FROM appointments WHERE appointment_date=CURRENT_DATE" 2>/dev/null || echo "—")
  WALKIN=$(docker exec fcms-postgres-1 psql -U fadl -d fadl_appointments -t -A \
    -c "SELECT COUNT(*) FROM appointments WHERE appointment_type='walk_in' AND appointment_date=CURRENT_DATE" 2>/dev/null || echo "—")
  echo -e "  ${CYAN}Today's appointments:${NC} total=$APPT_TOTAL  walk_in=$WALKIN"

  # Replication status
  REP=$(docker exec fcms-postgres-1 psql -U fadl -d postgres -t -A \
    -c "SELECT client_addr, state, sent_lsn, write_lsn, flush_lsn, replay_lsn, sync_state FROM pg_stat_replication" 2>/dev/null || echo "")
  if [[ -n "$REP" ]]; then
    echo -e "  ${GREEN}Replication slots:${NC}"
    echo "$REP" | while IFS='|' read -r addr state sent write flush replay sync; do
      echo "    $addr  state=$state  sync=$sync"
    done
  else
    echo -e "  ${YELLOW}Replication: no standbys connected (single-node)${NC}"
  fi

  # Replication lag (WAL receiver on any replica containers)
  LAG=$(docker exec fcms-postgres-1 psql -U fadl -d postgres -t -A \
    -c "SELECT EXTRACT(EPOCH FROM (NOW()-pg_last_xact_replay_timestamp()))::int AS lag_sec" 2>/dev/null || echo "—")
  echo -e "  ${CYAN}WAL replay lag:${NC} ${LAG}s"

  # Active queries (excluding idle)
  ACTIVE=$(docker exec fcms-postgres-1 psql -U fadl -d postgres -t -A \
    -c "SELECT count(*) FROM pg_stat_activity WHERE state='active' AND query NOT LIKE '%pg_stat%'" 2>/dev/null || echo "—")
  echo -e "  ${CYAN}Active queries:${NC} $ACTIVE"

  # Lock waits
  LOCKS=$(docker exec fcms-postgres-1 psql -U fadl -d postgres -t -A \
    -c "SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock'" 2>/dev/null || echo "0")
  [[ "$LOCKS" -gt "0" ]] 2>/dev/null && \
    echo -e "  ${RED}Lock waits: $LOCKS${NC}" || \
    echo -e "  ${GREEN}Lock waits: 0${NC}"

  sleep "$INTERVAL"
done
