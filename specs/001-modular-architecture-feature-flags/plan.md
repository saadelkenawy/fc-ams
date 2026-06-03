# Implementation Plan: Modular Architecture & Feature Flagging

**Branch**: `001-modular-architecture-feature-flags` | **Date**: 2026-06-03
**Spec**: [specs/001-modular-architecture-feature-flags/spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-modular-architecture-feature-flags/spec.md`

---

## Summary

Transform FCMS into a subscription-tier-aware platform by adding a feature-flag
layer on top of the existing 14-service microservice architecture. The backend
gains a `requireModule()` Fastify middleware and a `/feature-flags` endpoint in
identity-service; the frontend gains a `useFeatureFlags()` hook and a
`<ModuleUnavailablePage>`. A developer-issued JWT (`DEVELOPER_UNLOCK_SECRET`)
unlocks premium modules for demos without touching user records. All services are
deployable to a Kubernetes `fadl-testing` namespace using one-per-service
Deployment + HPA manifests and a shared `ConfigMap` for the tier→module map.

---

## Technical Context

**Language/Version**: TypeScript 5.x · Node 20

**Primary Dependencies**:
- Fastify 4 + `@fastify/jwt` (existing) — `requireModule` hooks
- `jose` (existing in frontend middleware) — developer token verification
- `ioredis` (existing) — flag/unlock caching
- `@tanstack/react-query` v4 (existing) — client-side flag caching
- `zod` (existing in all services) — unlock token payload validation

**Storage**: Redis (existing) for flag/unlock cache; no new PostgreSQL tables

**Testing**: `vitest` (existing per-service pattern)

**Target Platform**: Linux / Docker / Kubernetes 1.28+

**Project Type**: Monorepo web application (Next.js 15 + 14 Fastify microservices)

**Performance Goals**: Flag resolution ≤ 5 ms p95 (Redis read); no impact on
existing request latency

**Constraints**: Must not break existing sessions (backward-compat tier default
`premium`). Must not add new npm packages if an existing one covers the need.
No PostgreSQL schema migrations for this feature.

**Scale/Scope**: 14 services, 1 frontend, ~10 module IDs, Redis TTL 60 s

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Microservice Boundaries | PASS | Feature flags served by identity-service only; other services call their own Redis cache — no inter-service calls added |
| II. Schema-First (Flyway) | PASS | No new DB tables; Redis is ephemeral config, not schema |
| III. Zod at Boundaries | PASS | `UnlockTokenPayload` validated with Zod in identity-service before Redis write |
| IV. UUID PKs | N/A | No new tables |
| V. Immutable Billing | PASS | No billing table writes |
| VI. RBAC | PASS | `requireModule` is additive — runs after `requireAuth` + `requireRole` |
| VII. Bilingual UI | PASS | `<ModuleUnavailablePage>` must use `useLanguage` hook for Arabic/English text |
| VIII. No Hardcoded Secrets | PASS | `DEVELOPER_UNLOCK_SECRET` from env; service fails to start if absent when `FEATURE_FLAGS_ENABLED=true` |
| IX. Status Transitions | N/A | Not applicable |
| X. Design System | PASS | `<ModuleUnavailablePage>` uses crimson `#DC2626` and Outfit/Manrope tokens |

No violations. No Complexity Tracking table needed.

---

## Project Structure

### Documentation (this feature)

```text
specs/001-modular-architecture-feature-flags/
├── plan.md              ← this file
├── spec.md              ← feature specification
├── research.md          ← Phase 0 output
├── data-model.md        ← Phase 1 output
├── quickstart.md        ← Phase 1 output
├── contracts/
│   ├── feature-flags-api.md       ← REST contract + middleware shapes
│   └── kubernetes-topology.md     ← K8s manifest templates
└── tasks.md             ← Phase 2 output (/speckit-tasks — not yet)
```

### Source Code (repository root)

```text
shared/types/src/
├── feature-flags.ts         NEW — ModuleId, SubscriptionTier, TIER_MODULES, types
└── common.ts                EDIT — add subscriptionTier? to JwtPayload

services/identity-service/src/
├── config/index.ts          EDIT — add DEVELOPER_UNLOCK_SECRET, FEATURE_FLAGS_JSON, DEFAULT_TIER
├── routes/
│   └── feature-flags.ts     NEW — GET /feature-flags, POST /feature-flags/unlock
└── middleware/
    └── featureFlagService.ts NEW — Redis cache read/write, tier resolution, unlock merge

services/<each-service>/src/middleware/
└── requireModule.ts         NEW (per service) — Fastify preHandler checking module enable

frontend/web-portal/src/
├── hooks/
│   └── useFeatureFlags.ts   NEW — TanStack Query hook + useModuleEnabled()
├── components/
│   └── ModuleUnavailablePage.tsx  NEW — bilingual disabled-module page
├── lib/api/
│   └── identityApi.ts       EDIT — add featureFlags endpoints
└── middleware.ts             EDIT — add module-gate check alongside existing role-check

k8s/
└── testing/
    ├── namespace.yaml
    ├── configmap-feature-flags.yaml
    ├── identity-service.yaml         (Deployment + Service + HPA)
    ├── appointment-service.yaml
    ├── patient-service.yaml
    ├── ... (one file per service)
    └── ingress.yaml
```

**Structure Decision**: Option 2 (web application) — backend services + Next.js frontend.
The `k8s/testing/` directory is new; all other additions are additive to existing
service and frontend layouts.

---

## Phase 0: Research Summary

All unknowns resolved. See [research.md](./research.md) for full rationale.

- Flag storage: Redis + env-var fallback (no new service)
- Unlock mechanism: separate `DEVELOPER_UNLOCK_SECRET`, `X-Unlock-Token` cookie,
  Redis TTL = token `exp − now`
- Module boundary: `requireModule()` preHandler + `useModuleEnabled()` hook
- Tier in JWT: optional `subscriptionTier` claim, default `premium`
- K8s: `fadl-testing` namespace, kustomize-friendly YAML templates

---

## Phase 1: Design Summary

See [data-model.md](./data-model.md), [contracts/feature-flags-api.md](./contracts/feature-flags-api.md),
and [contracts/kubernetes-topology.md](./contracts/kubernetes-topology.md).

Key design decisions:
1. `MODULES` constant array in `shared/types` is the single source of truth for
   all valid module IDs — both backend and frontend import from it
2. `GET /feature-flags` resolves in identity-service: reads tier from JWT → maps
   to `TIER_MODULES[tier]` → merges Redis `unlock:{sessionId}` if present →
   writes to `flags:{branchId}:{userId}` cache
3. `POST /feature-flags/unlock` accepts developer JWT, verifies with
   `DEVELOPER_UNLOCK_SECRET`, stores unlock set in Redis
4. Frontend: `useFeatureFlags()` polls with 60 s staleTime; nav items gated with
   `{isEnabled('billing') && <NavItem .../>}`; disabled routes render
   `<ModuleUnavailablePage>` (not 404)
5. K8s: `fadl-testing` namespace; one YAML per service following the template in
   `contracts/kubernetes-topology.md`; `fcms-feature-flags` ConfigMap provides
   `FEATURE_FLAGS_JSON` and `DEFAULT_TIER`

---

## Implementation Sequence

### Step 1 — Shared types (no breaking changes)
- Add `shared/types/src/feature-flags.ts`
- Edit `shared/types/src/common.ts`: add optional `subscriptionTier`
- `pnpm --filter @fadl/types build`

### Step 2 — Identity service: config + Redis client
- Add `DEVELOPER_UNLOCK_SECRET`, `FEATURE_FLAGS_JSON`, `DEFAULT_TIER` to
  `services/identity-service/src/config/index.ts` (Zod schema)
- Add `featureFlagService.ts`: Redis get/set helpers, tier→module resolution,
  unlock merge logic

### Step 3 — Identity service: routes
- Add `services/identity-service/src/routes/feature-flags.ts`
  - `GET /feature-flags` — cache-read → resolve → cache-write → respond
  - `POST /feature-flags/unlock` — verify JWT → store in Redis → bust cache

### Step 4 — Per-service `requireModule` middleware
- Add `requireModule.ts` to each of the 9 module-gated services
- Wire into route registrations (additive `preHandler` entry)

### Step 5 — Frontend hook + gate components
- Add `useFeatureFlags.ts` and `useModuleEnabled()`
- Add `ModuleUnavailablePage.tsx` (bilingual, design-system compliant)
- Update navigation to use `useModuleEnabled()` per module
- Update `middleware.ts` to 403 module-disabled routes at Edge level

### Step 6 — Kubernetes manifests
- Create `k8s/testing/` with namespace, configmap, per-service YAML, ingress
- Validate with `kubectl apply --dry-run=client`

### Step 7 — Demo branch tooling
- Document `demo/<slug>` branch workflow in `quickstart.md`
- Add `scripts/mint-unlock-jwt.ts` for generating developer tokens locally
