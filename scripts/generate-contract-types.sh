#!/bin/bash
# §4.6: regenerate the web-portal's typed API contracts from the exported
# OpenAPI specs (scripts/export-openapi.sh). Run from frontend/web-portal via
#   pnpm contracts:types
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/frontend/web-portal/src/types/api"
mkdir -p "$OUT"
for spec in "$ROOT"/contracts/openapi/*.json; do
  name="$(basename "$spec" .json)"
  npx openapi-typescript "$spec" -o "$OUT/$name.ts" >/dev/null
  echo "ok  src/types/api/$name.ts"
done
