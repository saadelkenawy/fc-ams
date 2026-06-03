# Quickstart: Modular Architecture & Feature Flagging

## Prerequisites

- Node 20 + pnpm 8
- Docker + docker-compose
- `kubectl` + access to testing cluster (for Task 5)
- `JWT_SECRET` and `DEVELOPER_UNLOCK_SECRET` in your `.env` files

---

## 1. Run locally with feature flags

```bash
# Add to .env (or .env.local for each service):
FEATURE_FLAGS_JSON='{"basic":["patients","scheduling"],"standard":["patients","scheduling","billing","settlements","ehr"],"premium":["patients","scheduling","billing","settlements","ehr","ai","analytics","telehealth","procurement","integrations"]}'
DEFAULT_TIER=premium
DEVELOPER_UNLOCK_SECRET=<min-32-char-secret>

# Start everything
pnpm dev
```

---

## 2. Mint a developer unlock JWT (demo setup)

```bash
node -e "
const jwt = require('jsonwebtoken');
const token = jwt.sign(
  { iss: 'fadl-dev', modules: ['ai', 'telehealth', 'analytics'], note: 'demo-client-x' },
  process.env.DEVELOPER_UNLOCK_SECRET,
  { expiresIn: '30d' }
);
console.log(token);
"
```

Present via `POST /feature-flags/unlock` body `{ "unlockToken": "<token>" }` after
logging in, or set `X-Unlock-Token` cookie in browser devtools for quick testing.

---

## 3. Test the module guard

```bash
# With basic-tier token (patients + scheduling only):
curl -H "Authorization: Bearer $BASIC_JWT" http://localhost:3004/transactions
# → 403 { "error": "Module 'billing' is not available on your plan" }

# With unlock token applied:
curl -b "fadl_token=$USER_JWT; X-Unlock-Token=$UNLOCK_JWT" \
  http://localhost:3000/feature-flags
# → { modules: { billing: true, ... }, unlockedBy: 'merged' }
```

---

## 4. Deploy to fadl-testing Kubernetes namespace

```bash
# 1. Build and push images
docker build -f services/identity-service/Dockerfile . -t fadl/identity-service:latest
# ... repeat for each service (or run Jenkins pipeline)

# 2. Create namespace and secrets
kubectl create namespace fadl-testing
kubectl create secret generic fcms-secrets \
  --from-literal=JWT_SECRET=$JWT_SECRET \
  --from-literal=DEVELOPER_UNLOCK_SECRET=$DEVELOPER_UNLOCK_SECRET \
  --from-literal=DATABASE_URL=$DATABASE_URL \
  --from-literal=REDIS_URL=redis://redis-svc:6379 \
  -n fadl-testing

# 3. Apply manifests
kubectl apply -f k8s/testing/ -n fadl-testing

# 4. Check rollout
kubectl rollout status deployment/identity-service -n fadl-testing
kubectl get pods -n fadl-testing
```

---

## 5. Create a demo branch

```bash
git checkout main
git checkout -b demo/client-acme
# add DEVELOPER_UNLOCK_SECRET and a pre-minted 30-day unlock JWT to .env.demo
echo 'UNLOCK_JWT=<token>' >> .env.demo
git add .env.demo
git commit -m "demo: pre-seed unlock JWT for Acme demo"
# deploy this branch to fadl-testing with demo-specific env
```

---

## 6. Verify frontend module gates

1. Log in as a `basic`-tier user
2. Billing, Analytics, AI nav items should be hidden
3. Directly navigate to `/billing` → `<ModuleUnavailablePage />` shown, not 404
4. POST unlock token → refresh → billing/analytics/AI nav items appear

---

## Key files to edit

| File | Change |
|---|---|
| `shared/types/src/feature-flags.ts` | New — module constants and tier map |
| `shared/types/src/common.ts` | Add `subscriptionTier?` to `JwtPayload` |
| `services/identity-service/src/routes/feature-flags.ts` | New — GET + POST endpoints |
| `services/identity-service/src/config/index.ts` | Add `DEVELOPER_UNLOCK_SECRET`, `FEATURE_FLAGS_JSON`, `DEFAULT_TIER` |
| `services/<name>-service/src/middleware/requireModule.ts` | New per-service guard |
| `frontend/web-portal/src/hooks/useFeatureFlags.ts` | New — TanStack Query hook |
| `frontend/web-portal/src/middleware.ts` | Add module-check alongside role-check |
| `k8s/testing/` | New directory — Deployment/Service/HPA/Ingress/ConfigMap YAMLs |
