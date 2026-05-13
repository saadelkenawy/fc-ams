#!/usr/bin/env bash
# Patient API test scenarios — run against the live stack
# Usage: bash scripts/test-patient-scenarios.sh [BASE_URL] [JWT_TOKEN]
set -euo pipefail

BASE_URL="${1:-http://localhost:3010/api}"
TOKEN="${2:-}"
PATIENT_SVC="${BASE_URL/3010/3003}"   # patient-service on 3003
APPT_SVC="${BASE_URL/3010/3001}"      # appointment-service on 3001

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
PASS=0; FAIL=0

h() { echo -e "\n${YELLOW}━━━ $1 ━━━${NC}"; }
ok() { echo -e "  ${GREEN}✓ $1${NC}"; ((PASS++)); }
fail() { echo -e "  ${RED}✗ $1${NC}"; ((FAIL++)); }

auth_header() { [[ -n "$TOKEN" ]] && echo "-H \"Authorization: Bearer $TOKEN\"" || echo ""; }

run() {
  local label="$1"; shift
  local resp
  resp=$(eval curl -s -w '\n%{http_code}' "$@" 2>&1)
  local body code
  body=$(echo "$resp" | head -n -1)
  code=$(echo "$resp" | tail -n 1)
  echo "  HTTP $code | $(echo "$body" | python3 -m json.tool 2>/dev/null | head -5 || echo "$body" | cut -c1-120)"
  echo "$code:$body"
}

# ─── Auth helper (get token if not provided) ───────────────────────────────
if [[ -z "$TOKEN" ]]; then
  h "Getting auth token"
  RESP=$(curl -s -X POST http://localhost:3002/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@fadlclinic.com","password":"Admin@123456"}')
  TOKEN=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('token',''))" 2>/dev/null || echo "")
  if [[ -z "$TOKEN" ]]; then
    echo -e "${RED}Could not obtain token. Set TOKEN env or pass as \$2.${NC}"
    echo "Login response: $RESP"
  else
    echo "  Token acquired (${#TOKEN} chars)"
  fi
fi

AUTH="-H \"Authorization: Bearer $TOKEN\""
PATIENT_ID=""
MOBILE="+201$(shuf -i 00000001-99999999 -n 1)"   # random Egyptian mobile

# ─── Scenario 1: Create patient — all required fields only ─────────────────
h "Scenario 1: Create patient (required fields only)"
RESULT=$(eval curl -s -w '\\n%{http_code}' -X POST http://localhost:3003/api/v1/patients \
  -H "Content-Type: application/json" \
  -H "\"Authorization: Bearer $TOKEN\"" \
  "$AUTH" \
  -d "{\"mobile\":\"$MOBILE\",\"nameEn\":\"Test Patient One\",\"preferredLanguage\":\"en\"}")
CODE=$(echo "$RESULT" | tail -n 1)
BODY=$(echo "$RESULT" | head -n -1)
if [[ "$CODE" == "201" ]]; then
  PATIENT_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['patientId'])" 2>/dev/null || echo "")
  ok "Created patient ID: $PATIENT_ID"
else
  fail "Expected 201, got $CODE — $BODY"
fi

# ─── Scenario 2: Create patient — all optional fields ─────────────────────
h "Scenario 2: Create patient (all fields)"
MOBILE2="+201$(shuf -i 100000001-199999999 -n 1)"
RESULT2=$(eval curl -s -w '\\n%{http_code}' -X POST http://localhost:3003/api/v1/patients \
  -H "Content-Type: application/json" \
  "$AUTH" \
  -d "{
    \"mobile\":\"$MOBILE2\",
    \"nameEn\":\"Full Fields Patient\",
    \"nameAr\":\"مريض كامل البيانات\",
    \"nationalId\":\"29901011234567\",
    \"dateOfBirth\":\"1999-01-01\",
    \"gender\":\"M\",
    \"bloodType\":\"O+\",
    \"address\":\"12 Tahrir Square, Cairo\",
    \"email\":\"test@example.com\",
    \"emergencyContactMobile\":\"+201000000001\",
    \"emergencyContactName\":\"Emergency Contact\",
    \"preferredLanguage\":\"ar\",
    \"sourceFirstVisit\":\"Facebook\",
    \"isFutureSource\":true
  }")
CODE2=$(echo "$RESULT2" | tail -n 1)
BODY2=$(echo "$RESULT2" | head -n -1)
if [[ "$CODE2" == "201" ]]; then
  PATIENT_ID2=$(echo "$BODY2" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['patientId'])" 2>/dev/null || echo "")
  ok "Created full patient ID: $PATIENT_ID2"
  IS_FUTURE=$(echo "$BODY2" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['isFutureSource'])" 2>/dev/null || echo "")
  [[ "$IS_FUTURE" == "True" ]] && ok "isFutureSource=true set correctly" || fail "isFutureSource should be true, got: $IS_FUTURE"
else
  fail "Expected 201, got $CODE2 — $BODY2"
fi

# ─── Scenario 3: Duplicate mobile rejected ────────────────────────────────
h "Scenario 3: Duplicate mobile → 409"
RESULT3=$(eval curl -s -w '\\n%{http_code}' -X POST http://localhost:3003/api/v1/patients \
  -H "Content-Type: application/json" \
  "$AUTH" \
  -d "{\"mobile\":\"$MOBILE\",\"nameEn\":\"Duplicate\",\"preferredLanguage\":\"en\"}")
CODE3=$(echo "$RESULT3" | tail -n 1)
[[ "$CODE3" == "409" ]] && ok "Duplicate mobile correctly returns 409" || fail "Expected 409, got $CODE3"

# ─── Scenario 4: Invalid mobile format ────────────────────────────────────
h "Scenario 4: Invalid mobile format → 400"
RESULT4=$(eval curl -s -w '\\n%{http_code}' -X POST http://localhost:3003/api/v1/patients \
  -H "Content-Type: application/json" \
  "$AUTH" \
  -d '{"mobile":"01234567890","nameEn":"Bad Mobile","preferredLanguage":"en"}')
CODE4=$(echo "$RESULT4" | tail -n 1)
[[ "$CODE4" == "400" ]] && ok "Invalid mobile format correctly returns 400" || fail "Expected 400, got $CODE4"

# ─── Scenario 5: Invalid national ID length ───────────────────────────────
h "Scenario 5: Wrong-length national ID → 400"
MOBILE5="+201$(shuf -i 200000001-299999999 -n 1)"
RESULT5=$(eval curl -s -w '\\n%{http_code}' -X POST http://localhost:3003/api/v1/patients \
  -H "Content-Type: application/json" \
  "$AUTH" \
  -d "{\"mobile\":\"$MOBILE5\",\"nameEn\":\"Bad NID\",\"nationalId\":\"123\",\"preferredLanguage\":\"en\"}")
CODE5=$(echo "$RESULT5" | tail -n 1)
[[ "$CODE5" == "400" ]] && ok "Short national ID correctly returns 400" || fail "Expected 400, got $CODE5"

# ─── Scenario 6: Search by mobile (existing patient) ─────────────────────
h "Scenario 6: Search by mobile — select existing patient"
if [[ -n "$MOBILE" ]]; then
  RESULT6=$(eval curl -s -w '\\n%{http_code}' \
    "http://localhost:3003/api/v1/patients?mobile=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$MOBILE'))")" \
    "$AUTH")
  CODE6=$(echo "$RESULT6" | tail -n 1)
  COUNT6=$(echo "$RESULT6" | head -n -1 | python3 -c "import sys,json; print(json.load(sys.stdin).get('total',0))" 2>/dev/null || echo "0")
  if [[ "$CODE6" == "200" && "$COUNT6" -ge "1" ]]; then
    ok "Search by mobile returned $COUNT6 result(s)"
  else
    fail "Expected 200+results, got $CODE6 / count=$COUNT6"
  fi
fi

# ─── Scenario 7: Full-text search ─────────────────────────────────────────
h "Scenario 7: Full-text name search"
RESULT7=$(eval curl -s -w '\\n%{http_code}' \
  "http://localhost:3003/api/v1/patients?query=Test+Patient" \
  "$AUTH")
CODE7=$(echo "$RESULT7" | tail -n 1)
[[ "$CODE7" == "200" ]] && ok "Name search returns 200" || fail "Expected 200, got $CODE7"

# ─── Scenario 8: Fetch by ID ──────────────────────────────────────────────
h "Scenario 8: Fetch patient by ID"
if [[ -n "$PATIENT_ID" ]]; then
  RESULT8=$(eval curl -s -w '\\n%{http_code}' \
    "http://localhost:3003/api/v1/patients/$PATIENT_ID" \
    "$AUTH")
  CODE8=$(echo "$RESULT8" | tail -n 1)
  [[ "$CODE8" == "200" ]] && ok "GET /patients/:id returns 200" || fail "Expected 200, got $CODE8"
fi

# ─── Scenario 9: Optimistic concurrency — version conflict ────────────────
h "Scenario 9: Version conflict on update → 409"
if [[ -n "$PATIENT_ID" ]]; then
  RESULT9=$(eval curl -s -w '\\n%{http_code}' -X PATCH \
    "http://localhost:3003/api/v1/patients/$PATIENT_ID" \
    -H "Content-Type: application/json" \
    "$AUTH" \
    -d '{"nameEn":"Updated Name","version":999}')
  CODE9=$(echo "$RESULT9" | tail -n 1)
  [[ "$CODE9" == "409" ]] && ok "Stale version correctly returns 409" || fail "Expected 409, got $CODE9"
fi

# ─── Scenario 10: Walk-in appointment for created patient ─────────────────
h "Scenario 10: Walk-in appointment creation"
if [[ -n "$PATIENT_ID" ]]; then
  DOCTOR_RESP=$(eval curl -s "http://localhost:3004/api/v1/doctors?limit=1" "$AUTH")
  DOCTOR_ID=$(echo "$DOCTOR_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data'][0]['id'])" 2>/dev/null || echo "")
  if [[ -n "$DOCTOR_ID" ]]; then
    TODAY=$(date +%Y-%m-%d)
    RESULT10=$(eval curl -s -w '\\n%{http_code}' -X POST \
      "http://localhost:3001/api/v1/appointments" \
      -H "Content-Type: application/json" \
      "$AUTH" \
      -d "{
        \"patientId\":\"$PATIENT_ID\",
        \"doctorId\":\"$DOCTOR_ID\",
        \"appointmentDate\":\"$TODAY\",
        \"startTime\":\"14:00\",
        \"endTime\":\"14:20\",
        \"appointmentType\":\"walk_in\",
        \"patientSource\":\"Cl.'s\"
      }")
    CODE10=$(echo "$RESULT10" | tail -n 1)
    [[ "$CODE10" == "201" ]] && ok "Walk-in appointment created (201)" || fail "Walk-in failed: $CODE10 — $(echo "$RESULT10" | head -n -1 | cut -c1-200)"
  else
    echo "  (skipped — no doctors in DB)"
  fi
fi

# ─── Summary ─────────────────────────────────────────────────────────────
echo -e "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "Results: ${GREEN}$PASS passed${NC}  ${RED}$FAIL failed${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
[[ "$FAIL" -eq 0 ]] && exit 0 || exit 1
