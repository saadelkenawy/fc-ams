#!/usr/bin/env bash
# ─── Fadl Clinic — Secret Generator ──────────────────────────────────────────
# Generates a production-ready .env file with random secrets.
# Usage:  bash scripts/gen-secrets.sh
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"
EXAMPLE_FILE="$ROOT/.env.example"

if [[ ! -f "$EXAMPLE_FILE" ]]; then
  echo "ERROR: $EXAMPLE_FILE not found." >&2
  exit 1
fi

if [[ -f "$ENV_FILE" ]]; then
  echo "WARNING: $ENV_FILE already exists. Overwriting will change all secrets."
  read -r -p "Continue? [y/N] " confirm
  [[ "$confirm" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }
  cp "$ENV_FILE" "${ENV_FILE}.bak.$(date +%Y%m%d%H%M%S)"
  echo "Backup saved."
fi

rand() { openssl rand -hex "$1"; }

DB_USER="fadl"
DB_PASSWORD="$(rand 24)"
JWT_SECRET="$(rand 40)"
REDIS_PASSWORD="$(rand 24)"
MINIO_SECRET_KEY="$(rand 24)"
VIZITA_WEBHOOK_SECRET="$(rand 20)"
EKSHF_WEBHOOK_SECRET="$(rand 20)"
CLINIDO_WEBHOOK_SECRET="$(rand 20)"
INSTAPAY_WEBHOOK_SECRET="$(rand 20)"

# PgBouncer md5 auth: md5 + md5sum(password + username)
PGBOUNCER_MD5_HASH="md5$(printf '%s' "${DB_PASSWORD}${DB_USER}" | md5sum | cut -d' ' -f1)"

# Write infra/pgbouncer/userlist.txt so PgBouncer picks up the new hash
USERLIST="$ROOT/infra/pgbouncer/userlist.txt"
printf '"%s" "%s"\n' "$DB_USER" "$PGBOUNCER_MD5_HASH" > "$USERLIST"
echo "Updated $USERLIST"

# Start with the example file and substitute placeholder values
cp "$EXAMPLE_FILE" "$ENV_FILE"

set_var() {
  local key="$1" val="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
  else
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}

set_var DB_USER            "$DB_USER"
set_var DB_PASSWORD        "$DB_PASSWORD"
set_var PGBOUNCER_MD5_HASH "$PGBOUNCER_MD5_HASH"
set_var JWT_SECRET         "$JWT_SECRET"
set_var REDIS_PASSWORD     "$REDIS_PASSWORD"
set_var MINIO_SECRET_KEY   "$MINIO_SECRET_KEY"
set_var VIZITA_WEBHOOK_SECRET   "$VIZITA_WEBHOOK_SECRET"
set_var EKSHF_WEBHOOK_SECRET    "$EKSHF_WEBHOOK_SECRET"
set_var CLINIDO_WEBHOOK_SECRET  "$CLINIDO_WEBHOOK_SECRET"
set_var INSTAPAY_WEBHOOK_SECRET "$INSTAPAY_WEBHOOK_SECRET"

echo ""
echo "Generated .env at $ENV_FILE"
echo ""
echo "Secrets generated:"
echo "  DB_PASSWORD        = ${DB_PASSWORD:0:8}... (${#DB_PASSWORD} chars)"
echo "  JWT_SECRET         = ${JWT_SECRET:0:8}... (${#JWT_SECRET} chars)"
echo "  REDIS_PASSWORD     = ${REDIS_PASSWORD:0:8}..."
echo "  MINIO_SECRET_KEY   = ${MINIO_SECRET_KEY:0:8}..."
echo ""
echo "Still required (fill in .env manually):"
echo "  SMTP_USER, SMTP_PASS       — email delivery"
echo "  TWILIO_*                   — SMS delivery"
echo "  ANTHROPIC_API_KEY or OPENROUTER_API_KEY — AI chatbot"
echo "  MINIO_PUBLIC_URL, DOMAIN   — public URLs"
echo ""
echo "Next: docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d"
