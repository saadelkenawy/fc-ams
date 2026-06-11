#!/bin/bash
# §4.6: export each service's OpenAPI spec from the running dev stack into
# contracts/openapi/, then regenerate the frontend's typed contracts with
#   pnpm --filter web-portal contracts:types
# Run after changing any service's routes/schemas and commit the results —
# a frontend type error against the regenerated contracts means the API and
# the UI have drifted.
set -euo pipefail

HOST="${OPENAPI_HOST:-localhost}"
OUT="$(dirname "$0")/../contracts/openapi"
mkdir -p "$OUT"

# service:port (host ports from docker-compose.yml; identity is 3100 on the host)
SERVICES="
identity:3100
appointment:3001
patient:3002
doctor:3003
billing:3004
ehr:3005
procedure:3006
notification:3007
ai-chatbot:3008
analytics:3009
file:3011
procurement:3013
"
# integration-service (3012) is excluded: it registers no swagger — it only
# receives external webhooks and the portal never calls it.

fail=0
for entry in $SERVICES; do
  name="${entry%%:*}"; port="${entry##*:}"
  if curl -fsS "http://${HOST}:${port}/docs/json" -o "$OUT/${name}.json" 2>/dev/null; then
    echo "ok   ${name} -> contracts/openapi/${name}.json"
  else
    echo "FAIL ${name} (http://${HOST}:${port}/docs/json unreachable — is the stack up?)" >&2
    fail=1
  fi
done
exit $fail
