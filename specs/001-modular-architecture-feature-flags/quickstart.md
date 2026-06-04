# Quickstart: Modular Architecture & Feature Flagging

## Prerequisites

- Node 20 + pnpm 8
- Docker + docker-compose
- `kubectl` + access to testing cluster (for Task 5)
- `JWT_SECRET` and `DEVELOPER_UNLOCK_SECRET` in your `.env` files

---

## 1. Run locally with feature flags

```bash
# Add to services/identity-service/.env (or docker-compose override):
FEATURE_FLAGS_JSON='{"basic":["patients","scheduling"],"standard":["patients","scheduling","billing","settlements","ehr"],"premium":["patients","scheduling","billing","settlements","ehr","ai","analytics","telehealth","procurement","integrations"]}'
DEFAULT_TIER=standard
DEVELOPER_UNLOCK_SECRET=<min-32-char-secret>
ALLOW_DEVELOPER_TOKEN_OVERRIDE=true

# Start everything
pnpm dev
```

> **Note**: `docker-compose.yml` ships with `DEFAULT_TIER=standard`. The K8s
> `fcms-feature-flags` ConfigMap defaults to `DEFAULT_TIER=premium`.

---

## 2. Mint a developer unlock JWT (demo setup)

```bash
# Uses scripts/mint-unlock-jwt.ts via the demo:mint alias
pnpm demo:mint --modules ai,telehealth,analytics --expires 30d --note "demo-client-x"
# → prints a signed JWT to stdout
```

Present the token via `POST /api/v1/feature-flags/unlock` after logging in:

```bash
curl -X POST http://localhost:3000/api/v1/feature-flags/unlock \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"unlockToken":"<token-from-above>"}'
# → { "unlocked": ["ai","telehealth","analytics"], "expiresAt": "..." }
```

---

## 3. Test the module guard

```bash
# basic-tier JWT → billing returns 403
curl -H "Authorization: Bearer $BASIC_JWT" http://localhost:3004/transactions
# → 403 { "error": { "code": "MODULE_DISABLED", "message": "Module 'billing' is not available on your plan" } }

# After unlock: re-fetch flags — ai/analytics now on, billing still off (not in unlock list)
curl -H "Authorization: Bearer $BASIC_JWT" http://localhost:3000/api/v1/feature-flags
# → { "modules": { "patients": true, "scheduling": true, "ai": true, "analytics": true, "billing": false, ... }, "unlockedBy": "merged" }
```

**Redis keys written during these calls**:
- `flags:{branchId}:{userId}` — resolved module map, TTL 60 s
- `unlock:{sessionId}` — developer unlock set, TTL = token `exp − now`

where `sessionId` = the JWT `sub` claim (user UUID).

---

## 4. Deploy to fadl-testing Kubernetes namespace

```bash
# 1. Build and push images (image names match Docker Hub registry)
docker build -f services/identity-service/Dockerfile . \
  -t saadelkenawy/fcms-identity-service:<build-tag>
docker push saadelkenawy/fcms-identity-service:<build-tag>
# ... repeat for each service, or trigger the Jenkins pipeline on this branch

# 2. Create namespace and secrets
kubectl create namespace fadl-testing
kubectl create secret generic fcms-secrets \
  --from-literal=JWT_SECRET=$JWT_SECRET \
  --from-literal=DEVELOPER_UNLOCK_SECRET=$DEVELOPER_UNLOCK_SECRET \
  --from-literal=DATABASE_URL=$DATABASE_URL \
  --from-literal=REDIS_URL=redis://redis-svc:6379 \
  -n fadl-testing

# 3. Apply all manifests (namespace + configmap + redis + services + ingress)
kubectl apply -f k8s/testing/ -n fadl-testing

# 4. Verify rollouts
kubectl rollout status deployment/identity-service -n fadl-testing
kubectl get pods -n fadl-testing
# All pods should reach Running/Ready before testing

# 5. Dry-run validation (run before every apply to catch schema errors)
kubectl apply --dry-run=client -f k8s/testing/ -n fadl-testing
```

---

## 5. Create a demo branch

```bash
git checkout main
git checkout -b demo/client-acme

# Mint a 30-day unlock JWT
pnpm demo:mint --modules ai,telehealth,analytics --expires 30d --note "acme-demo"

# Add the minted JWT to .env.demo (use .env.demo.example as template)
echo 'UNLOCK_JWT=<token>' >> .env.demo
git add .env.demo
git commit -m "demo: pre-seed unlock JWT for Acme demo"

# Deploy this branch to fadl-testing with demo-specific env
```

---

## 6. Verify frontend module gates

1. Log in as a `basic`-tier user — user JWT is stored in the `fadl_token` cookie
2. Billing, Analytics, AI nav items should be hidden (filtered by `useModuleEnabled()`)
3. Directly navigate to `/billing` → `<ModuleUnavailablePage />` shown (not 404); redirected via Next.js Edge middleware to `/module-unavailable?module=billing`
4. POST unlock token via step 2 above → refresh page → billing/analytics/AI nav items appear
5. Premium user: all nav items visible from first login (tier defaults to `premium` on missing claim)

---

## Key files

| File | Purpose |
|---|---|
| `shared/types/src/feature-flags.ts` | `MODULES`, `ModuleId`, `SubscriptionTier`, `TIER_MODULES`, `FeatureFlagsResponse` |
| `shared/types/src/common.ts` | `subscriptionTier?` added to `JwtPayload` |
| `services/identity-service/src/routes/feature-flags.routes.ts` | `GET /api/v1/feature-flags` + `POST /api/v1/feature-flags/unlock` |
| `services/identity-service/src/middleware/featureFlagService.ts` | Redis cache helpers, tier→module resolution, unlock merge |
| `services/identity-service/src/config/index.ts` | `DEVELOPER_UNLOCK_SECRET`, `FEATURE_FLAGS_JSON`, `DEFAULT_TIER` env schema |
| `services/<name>-service/src/middleware/requireModule.ts` | Per-service 403 guard (9 services) |
| `frontend/web-portal/src/hooks/useFeatureFlags.ts` | TanStack Query hook + `useModuleEnabled()` |
| `frontend/web-portal/src/lib/api.ts` | `featureFlagsApi.getFlags()` + `featureFlagsApi.unlock()` |
| `frontend/web-portal/src/middleware.ts` | Edge module-gate check; redirects to `/module-unavailable?module=<id>` |
| `k8s/testing/` | Namespace, ConfigMap, per-service Deployment+Service+HPA, Redis, Ingress |
| `scripts/mint-unlock-jwt.ts` | CLI for minting developer override JWTs (`pnpm demo:mint`) |
| `.env.demo.example` | Template for demo-branch environment variables |
