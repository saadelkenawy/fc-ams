# Tasks: Modular Architecture & Feature Flagging

**Branch**: `001-modular-architecture-feature-flags`
**Input**: Design documents from `/specs/001-modular-architecture-feature-flags/`
**Plan**: plan.md · **Spec**: spec.md · **Data model**: data-model.md · **Contracts**: contracts/

**Organization**: Tasks are grouped by user story so each story can be implemented,
tested, and delivered as an independent increment.

## Format: `[ID] [P?] [Story?] Description with file path`

- **[P]**: Parallelizable — different files, no dependency on incomplete tasks
- **[US#]**: User story label — maps to Phase 3+ phases below

---

## Phase 1: Setup

**Purpose**: Create new shared files and directories so downstream tasks have stable import targets.

- [ ] T001 Add `shared/types/src/feature-flags.ts` — export `MODULES`, `ModuleId`, `SubscriptionTier`, `TIER_MODULES`, `FeatureFlagsResponse`, `UnlockTokenPayload`
- [ ] T002 Edit `shared/types/src/common.ts` — add optional `subscriptionTier?: SubscriptionTier` field to `JwtPayload` interface
- [ ] T003 Edit `shared/types/src/index.ts` — add `export * from './feature-flags'`
- [ ] T004 Run `pnpm --filter @fadl/types build` to verify types compile with no errors

**Checkpoint**: `@fadl/types` builds cleanly; all module IDs and tier maps are importable.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Identity-service infrastructure that all user stories depend on — Redis helper, config, and route registration. Must be complete before any US work begins.

**⚠️ CRITICAL**: Phases 3–7 cannot start until this phase is complete.

- [ ] T005 Edit `services/identity-service/src/config/index.ts` — add `DEVELOPER_UNLOCK_SECRET` (min 32 chars, required), `FEATURE_FLAGS_JSON` (optional string), `DEFAULT_TIER` (enum `basic|standard|premium`, default `premium`) to the Zod env schema
- [ ] T006 Create `services/identity-service/src/middleware/featureFlagService.ts` — implement `resolveFlags(userId, branchId, tier, sessionId, redisClient)` that: reads `FEATURE_FLAGS_JSON` from config, maps tier to module list, reads `unlock:{sessionId}` from Redis, merges unlock set, writes result to `flags:{branchId}:{userId}` (TTL 60 s), returns `FeatureFlagsResponse`
- [ ] T007 Edit `services/identity-service/src/app.ts` (or `server.ts`) — import and register the feature-flags routes plugin under `/feature-flags`

**Checkpoint**: Identity service starts without errors; `/health` returns 200; Redis connection is confirmed in logs.

---

## Phase 3: User Story 1 — Feature Flag API (P1) 🎯 MVP

**Goal**: `GET /feature-flags` returns the correct module map for any authenticated user based on their JWT `subscriptionTier` claim. Basic and standard tier users see a restricted module list; premium (or missing tier) users see all modules.

**Independent Test**:
```bash
# basic-tier JWT → only patients + scheduling enabled
curl -H "Authorization: Bearer $BASIC_JWT" http://localhost:3000/feature-flags
# → { modules: { patients: true, scheduling: true, billing: false, ... }, tier: 'basic' }

# premium JWT (no tier claim) → all modules enabled
curl -H "Authorization: Bearer $PREMIUM_JWT" http://localhost:3000/feature-flags
# → { modules: { patients: true, ..., telehealth: true }, tier: 'premium' }
```

### Implementation

- [ ] T008 [US1] Create `services/identity-service/src/routes/feature-flags.ts` — implement `GET /feature-flags` handler: extract JWT payload via `req.jwtPayload`, resolve `subscriptionTier` (default `premium`), call `featureFlagService.resolveFlags()`, return `FeatureFlagsResponse`; validate response shape with Zod before returning
- [ ] T009 [US1] Add Zod schema for the `GET /feature-flags` response in `services/identity-service/src/routes/feature-flags.ts` — use `z.object({ modules: z.record(z.boolean()), tier: z.enum(['basic','standard','premium']), unlockedBy: z.enum(['subscription','developer-token','merged']) })`
- [ ] T010 [US1] Edit `services/identity-service/src/routes/index.ts` (or equivalent) — register the feature-flags route plugin so `GET /feature-flags` is reachable
- [ ] T011 [US1] Add `subscriptionTier` to the JWT sign payload in `services/identity-service/src/controllers/auth.ts` (login handler) — read tier from user record or default to `premium`; if no tier column exists yet, always emit `premium` as a safe default

**Checkpoint**: `GET /feature-flags` returns correct module map for basic, standard, and premium tier JWTs. Redis cache key `flags:{branchId}:{userId}` is written and TTL is 60 s.

---

## Phase 4: User Story 2 — Developer JWT Unlock (P2)

**Goal**: `POST /feature-flags/unlock` accepts a developer-issued token and activates premium modules for the current session without modifying the user's subscription record.

**Independent Test**:
```bash
# Present valid unlock JWT
curl -X POST http://localhost:3000/feature-flags/unlock \
  -H "Authorization: Bearer $BASIC_JWT" \
  -H "Content-Type: application/json" \
  -d '{"unlockToken":"<developer-jwt>"}'
# → { unlocked: ['ai','telehealth','analytics'], expiresAt: '...' }

# Re-fetch feature flags — billing still off (not in unlock list), ai/analytics now on
curl -H "Authorization: Bearer $BASIC_JWT" http://localhost:3000/feature-flags
# → { modules: { patients: true, scheduling: true, ai: true, analytics: true, billing: false, ... }, unlockedBy: 'merged' }
```

### Implementation

- [ ] T012 [US2] Add `POST /feature-flags/unlock` handler to `services/identity-service/src/routes/feature-flags.ts` — Zod-validate request body `{ unlockToken: z.string() }`, verify token with `DEVELOPER_UNLOCK_SECRET` using `@fastify/jwt` or `jose`, confirm `iss === 'fadl-dev'`, filter to known `ModuleId` values, write `unlock:{sessionId}` to Redis with TTL `= token.exp - Date.now()/1000`, bust `flags:{branchId}:{userId}` cache key, return `{ unlocked, expiresAt }`
- [ ] T013 [US2] Add error cases in `POST /feature-flags/unlock` — expired token → 400 `"Invalid or expired unlock token"`; unknown `iss` → 400; malformed JWT → 400; graceful: unknown module IDs are silently dropped, not errors
- [ ] T014 [US2] Create `scripts/mint-unlock-jwt.ts` — CLI script using `jsonwebtoken` to generate a developer unlock token; accepts `--modules`, `--expires`, `--note` flags; reads `DEVELOPER_UNLOCK_SECRET` from env; prints the JWT to stdout

**Checkpoint**: `POST /feature-flags/unlock` stores unlock set in Redis; subsequent `GET /feature-flags` returns merged module map with `unlockedBy: 'merged'`. Expired/invalid tokens return 400.

---

## Phase 5: User Story 3 — Backend Module Guards (P3)

**Goal**: Every module-gated service returns `403` with a clear message when a request arrives from a user whose feature flags do not include that service's module, regardless of role.

**Independent Test**:
```bash
# basic-tier user hitting billing service
curl -H "Authorization: Bearer $BASIC_JWT" http://localhost:3004/transactions
# → 403 { "error": "Module 'billing' is not available on your plan" }

# premium user hits same endpoint → 200 (passes through to existing auth)
curl -H "Authorization: Bearer $PREMIUM_JWT" http://localhost:3004/transactions
# → 200 (existing behaviour unchanged)
```

### Implementation

- [ ] T015 [P] [US3] Create `services/patient-service/src/middleware/requireModule.ts` — `requireModule('patients')` Fastify preHandler: reads `flags:{branchId}:{userId}` from Redis (falls back to `featureFlagService.resolveFlags()` on cache miss); returns `403` if module disabled; add `MODULE_ID = 'patients'` constant
- [ ] T016 [P] [US3] Create `services/appointment-service/src/middleware/requireModule.ts` — same pattern, `MODULE_ID = 'scheduling'`
- [ ] T017 [P] [US3] Create `services/billing-service/src/middleware/requireModule.ts` — same pattern, `MODULE_ID = 'billing'` (settlements routes use same guard)
- [ ] T018 [P] [US3] Create `services/ehr-service/src/middleware/requireModule.ts` — `MODULE_ID = 'ehr'`
- [ ] T019 [P] [US3] Create `services/ai-chatbot-service/src/middleware/requireModule.ts` — `MODULE_ID = 'ai'`
- [ ] T020 [P] [US3] Create `services/analytics-service/src/middleware/requireModule.ts` — `MODULE_ID = 'analytics'`
- [ ] T021 [P] [US3] Create `services/procurement-service/src/middleware/requireModule.ts` — `MODULE_ID = 'procurement'`
- [ ] T022 [P] [US3] Create `services/integration-service/src/middleware/requireModule.ts` — `MODULE_ID = 'integrations'`
- [ ] T023 [P] [US3] Create `services/telehealth-service/src/middleware/requireModule.ts` — `MODULE_ID = 'telehealth'`
- [ ] T024 [US3] Wire `requireModule` into route registration for all 9 services — add as `preHandler` entry alongside `requireAuth` in each service's main route file (e.g. `services/patient-service/src/routes/index.ts`)

**Checkpoint**: All 9 module-gated services return 403 for basic-tier users on their primary endpoints. Core services (identity, doctor, notification, file, procedure) are unaffected.

---

## Phase 6: User Story 4 — Frontend Module Gates (P4)

**Goal**: Frontend navigation hides disabled module items; disabled routes render `<ModuleUnavailablePage>` instead of 404; the Edge middleware enforces module access at the Next.js layer.

**Independent Test**:
1. Log in as basic-tier user → sidebar shows only Patients + Scheduling nav items
2. Navigate directly to `/billing` → `<ModuleUnavailablePage>` shown, not 404
3. POST unlock token in devtools → refresh → Billing/AI/Analytics items appear
4. Log in as premium user → all nav items visible from the start

### Implementation

- [ ] T025 [P] [US4] Create `frontend/web-portal/src/hooks/useFeatureFlags.ts` — TanStack Query hook: `GET /api/identity/feature-flags` (proxied via Next.js API route); `staleTime: 60_000`; export `useFeatureFlags()` and `useModuleEnabled(moduleId: ModuleId): boolean` (default `true` on loading to avoid flash)
- [ ] T026 [P] [US4] Create `frontend/web-portal/src/components/ModuleUnavailablePage.tsx` — bilingual (`useLanguage` hook) page component shown when a module is disabled; displays current tier name, lists what's included, shows upgrade prompt; uses design-system tokens (crimson `#DC2626`, Outfit/Manrope fonts, Card + Button components from `shadcn/ui`)
- [ ] T027 [P] [US4] Add feature-flags methods to `frontend/web-portal/src/lib/api/identityApi.ts` — `getFeatureFlags()` and `postUnlock(unlockToken: string)`
- [ ] T028 [US4] Update the sidebar/navigation component (locate via `frontend/web-portal/src/`) — wrap each module nav item with `useModuleEnabled(moduleId)` guard; hide item when disabled (no broken link, just absent)
- [ ] T029 [US4] Update `frontend/web-portal/src/app/(dashboard)/billing/page.tsx` and each other module-gated page — add `const enabled = useModuleEnabled('billing'); if (!enabled) return <ModuleUnavailablePage />;` at top of component
- [ ] T030 [US4] Edit `frontend/web-portal/src/middleware.ts` — after role check, add module-gate check: call `GET /api/identity/feature-flags` (service-to-service, not via browser cookie) and redirect to `/module-unavailable?module=<id>` if disabled; add `MODULE_ROUTES` map parallel to existing `ROLE_RULES`
- [ ] T031 [US4] Create `frontend/web-portal/src/app/(dashboard)/module-unavailable/page.tsx` — read `module` query param, render `<ModuleUnavailablePage>` with the correct module name; this is the Edge redirect target

**Checkpoint**: Basic-tier user cannot reach any billing/AI/analytics page via navigation or direct URL. Premium user sees all pages. Upgrade prompt is bilingual.

---

## Phase 7: User Story 5 — Kubernetes Deployment (P5)

**Goal**: All 14 services + frontend run in the `fadl-testing` namespace on the cluster, routable via Nginx Ingress, with feature flags delivered via ConfigMap.

**Independent Test**:
```bash
kubectl get pods -n fadl-testing   # all pods Running/Ready
curl http://fcms-test.internal/api/identity/health   # 200
curl http://fcms-test.internal/api/patients/health   # 200
```

### Implementation

- [ ] T032 [US5] Create `k8s/testing/namespace.yaml` — `kind: Namespace`, name `fadl-testing`
- [ ] T033 [US5] Create `k8s/testing/configmap-feature-flags.yaml` — `ConfigMap` named `fcms-feature-flags` with `FEATURE_FLAGS_JSON` and `DEFAULT_TIER=premium` as per `contracts/kubernetes-topology.md`
- [ ] T034 [P] [US5] Create `k8s/testing/identity-service.yaml` — Deployment (1 replica), ClusterIP Service (port 3000), HPA (min 1, max 3, CPU 70%) following template in `contracts/kubernetes-topology.md`; `envFrom` both `fcms-secrets` and `fcms-feature-flags`
- [ ] T035 [P] [US5] Create `k8s/testing/appointment-service.yaml` — same pattern, port 3001
- [ ] T036 [P] [US5] Create `k8s/testing/patient-service.yaml` — port 3002
- [ ] T037 [P] [US5] Create `k8s/testing/doctor-service.yaml` — port 3003
- [ ] T038 [P] [US5] Create `k8s/testing/billing-service.yaml` — port 3004
- [ ] T039 [P] [US5] Create `k8s/testing/ehr-service.yaml` — port 3005
- [ ] T040 [P] [US5] Create `k8s/testing/ai-chatbot-service.yaml` — port 3008
- [ ] T041 [P] [US5] Create `k8s/testing/analytics-service.yaml` — port 3009
- [ ] T042 [P] [US5] Create `k8s/testing/web-portal.yaml` — Next.js frontend Deployment + Service (port 3000 in pod, named `web-portal`)
- [ ] T043 [US5] Create `k8s/testing/ingress.yaml` — Nginx Ingress with path-prefix routing as defined in `contracts/kubernetes-topology.md`; host `fcms-test.internal`
- [ ] T044 [US5] Create `k8s/testing/redis.yaml` — single-replica Redis Deployment + ClusterIP Service (`redis-svc:6379`); use `bitnami/redis:7` image with `--save ""` (no persistence in testing)
- [ ] T045 [US5] Validate all manifests: `kubectl apply --dry-run=client -f k8s/testing/ -n fadl-testing` — must complete with no errors; fix any schema issues

**Checkpoint**: `kubectl apply -f k8s/testing/` creates all resources without errors. All pods reach `Running` state. `GET /api/identity/health` returns 200 through Ingress.

---

## Phase 8: User Story 6 — Demo Branch Tooling (P6)

**Goal**: Any developer can cut a demo branch in under 5 minutes, pre-seed it with a 30-day unlock JWT, and deploy it to `fadl-testing` without touching `main`.

**Independent Test**:
```bash
# On demo/client-acme branch:
node scripts/mint-unlock-jwt.ts --modules ai,telehealth,analytics --expires 30d --note "acme-demo"
# → prints JWT; can be decoded at jwt.io to verify claims
```

### Implementation

- [ ] T046 [P] [US6] Create `scripts/mint-unlock-jwt.ts` — CLI: reads `DEVELOPER_UNLOCK_SECRET` from env, accepts `--modules` (comma-separated ModuleId list), `--expires` (e.g. `30d`), `--note` (string); outputs JWT to stdout; exits 1 if secret missing
- [ ] T047 [P] [US6] Create `.env.demo.example` at repo root — template file documenting the env vars needed for a demo deployment: `DEVELOPER_UNLOCK_SECRET`, `DEFAULT_TIER=basic`, and a placeholder `UNLOCK_JWT` with instructions to run `mint-unlock-jwt.ts`
- [ ] T048 [US6] Add `demo` script to root `package.json` — `"demo:mint": "tsx scripts/mint-unlock-jwt.ts"` so the script is runnable via `pnpm demo:mint`

**Checkpoint**: `pnpm demo:mint --modules ai,analytics --expires 7d` prints a valid JWT. Decoded payload contains `iss: 'fadl-dev'` and the requested modules.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Hardening, backward-compatibility verification, and documentation across all stories.

- [ ] T049 [P] Verify backward compatibility: start identity-service with an existing JWT that has no `subscriptionTier` claim → `GET /feature-flags` returns `tier: 'premium'` and all modules enabled (no regression for existing sessions)
- [ ] T050 [P] Add `DEVELOPER_UNLOCK_SECRET` to `docker-compose.yml` env block for identity-service (set to a dev placeholder so local dev starts without errors when feature flags are enabled)
- [ ] T051 Update `quickstart.md` in `specs/001-modular-architecture-feature-flags/` — fill in any concrete values that emerged during implementation (actual Redis key format confirmed, exact cookie names, etc.)
- [ ] T052 Run `graphify update .` from repo root to refresh the knowledge graph with all new files added in this feature

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately; T001–T004 run in sequence
- **Phase 2 (Foundational)**: Depends on Phase 1 — T005 after T004; T006 after T005; T007 after T006
- **Phase 3 (US1)**: Depends on Phase 2 — T008–T011 after T007
- **Phase 4 (US2)**: Depends on Phase 3 (needs `/feature-flags` infrastructure) — T012–T014 after T011
- **Phase 5 (US3)**: Depends on Phase 2 (needs `@fadl/types` + Redis service) — all T015–T024 can start after T004; T024 (wire) after T015–T023
- **Phase 6 (US4)**: Depends on Phase 3 (needs the API to call) — T025–T031 after T011
- **Phase 7 (US5)**: Depends on Phase 1 (needs built images) — T032–T044 can start after T004; T045 (dry-run validation) after T044
- **Phase 8 (US6)**: Independent of Phases 3–7 — T046–T048 can start after Phase 1
- **Phase 9 (Polish)**: Depends on all Phase 3–8 work being done

### User Story Dependencies

| Story | Depends on | Can run in parallel with |
|---|---|---|
| US1 — Feature Flag API | Phase 2 complete | US3 (different files) |
| US2 — Developer Unlock | US1 complete | — |
| US3 — Backend Guards | Phase 2 complete | US1, US4, US5 |
| US4 — Frontend Gates | US1 complete | US3, US5 |
| US5 — Kubernetes | Phase 1 complete | US3 |
| US6 — Demo Tooling | Phase 1 complete | US1–US5 |

### Within Each User Story

- Types and config before service layer
- Service layer before route handlers
- Route handlers before frontend integration
- Frontend hook before component usage

---

## Parallel Opportunities

```bash
# After Phase 2 completes, these groups can run concurrently:

# Group A: US1 core API
T008  Create GET /feature-flags handler
T009  Add response Zod schema
T010  Register routes
T011  Add tier to JWT sign

# Group B: US3 requireModule files (all independent files)
T015  patient-service/requireModule.ts
T016  appointment-service/requireModule.ts
T017  billing-service/requireModule.ts
T018  ehr-service/requireModule.ts
T019  ai-chatbot-service/requireModule.ts
T020  analytics-service/requireModule.ts
T021  procurement-service/requireModule.ts
T022  integration-service/requireModule.ts
T023  telehealth-service/requireModule.ts

# Group C: K8s manifests (all independent files)
T034–T042  One YAML per service

# Group D: Demo tooling (independent of API)
T046  mint-unlock-jwt.ts
T047  .env.demo.example
```

---

## Implementation Strategy

### MVP (US1 only — 11 tasks)

1. Phase 1: T001–T004 (shared types)
2. Phase 2: T005–T007 (identity-service foundation)
3. Phase 3: T008–T011 (Feature Flag API)
4. **Stop and validate**: `GET /feature-flags` returns correct tier-based map
5. Ship: basic/standard/premium tier differentiation is live

### Incremental Delivery

| Milestone | Tasks | What's live |
|---|---|---|
| M1: Feature flags | T001–T011 | GET /feature-flags works |
| M2: Unlock | + T012–T014 | Developer demo unlocking works |
| M3: Backend guards | + T015–T024 | 403 on disabled modules |
| M4: Frontend gates | + T025–T031 | UI hides/shows modules |
| M5: K8s | + T032–T045 | Cluster deployment ready |
| M6: Demo tooling | + T046–T048 | Demo branches self-serve |

### Parallel Team Strategy

With 3 developers after Phase 2:
- **Dev A**: US1 → US2 (identity-service routes)
- **Dev B**: US3 (9 requireModule files + wiring)
- **Dev C**: US5 (k8s manifests) and US6 (demo tooling)

Dev A's work unblocks Dev C's US4 (frontend) once US1 is done.

---

## Notes

- [P] = different files, no inter-task dependency
- [US#] = traceability to user story; each story independently completable
- No test tasks generated — spec does not request TDD; add manually if desired
- `requireModule` reads Redis directly in each service (no identity-service call per request); cache miss falls back to `FEATURE_FLAGS_JSON` env var so services work even if Redis is temporarily unavailable
- Total: **52 tasks** across 9 phases
