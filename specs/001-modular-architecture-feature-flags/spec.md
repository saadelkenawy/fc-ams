# Feature Spec: Modular Architecture & Feature Flagging

**Branch**: `001-modular-architecture-feature-flags`
**Date**: 2026-06-03
**Author**: Saad Elkenawy

---

## Overview

Transform FCMS into a tiered, subscription-aware platform where features can be
enabled or disabled per deployment without code changes. Introduce a developer-issued
JWT override mechanism so premium modules can be unlocked for client demos without
modifying subscription records. Deliver the full system on a Kubernetes cluster.

---

## Task 1: Establish Modular Architecture

Refactor the application into distinct, independent modules for each feature:
patient management, scheduling, billing, settlements, AI chatbot, EHR, analytics,
telehealth, procurement, and integrations. Each module maps 1-to-1 to an existing
Fastify service. The module boundary is enforced by:

- A `MODULE_ID` constant exported from each service
- A frontend `useFeatureFlags()` hook that gates navigation items and routes
- Backend middleware `requireModule(moduleId)` that returns 403 when disabled

No code is deleted — disabled modules become unreachable, not removed.

## Task 2: Implement Feature Flagging Architecture

A configuration-based system reads the `subscriptionTier` claim from the user JWT
and dynamically enables/disables modules at runtime.

**Tiers**:
| Tier | Included modules |
|------|-----------------|
| `basic` | patients, scheduling |
| `standard` | patients, scheduling, billing, settlements, ehr |
| `premium` | all modules |

Feature flags are resolved in identity-service, cached in Redis (60 s TTL), and
served to the frontend via `GET /api/feature-flags`. The frontend caches the
response in TanStack Query with the same TTL.

## Task 3: JWT-Based Dynamic Unlocking

A short-lived developer-issued HS256 JWT signed with `DEVELOPER_UNLOCK_SECRET`
(separate from `JWT_SECRET`) carries:

```json
{ "iss": "fadl-dev", "modules": ["ai", "telehealth", "analytics"], "exp": 1780502400 }
```

The client presents this token in an `X-Unlock-Token` cookie. Identity-service
verifies and caches the unlock set in Redis under `unlock:{sessionId}`. The
feature-flag resolver merges the unlock set with the subscription-tier flags before
returning the response. No database writes required.

## Task 4: Manage Deployment Branches

- `main` — stable baseline; only tier-locked features visible
- `001-modular-architecture-feature-flags` — this feature branch
- `demo/<client-slug>` — cut from main with a pre-seeded unlock JWT in `.env.demo`
  for client showcases; never merged back to main

## Task 5: Kubernetes / OpenShift Deployment

Deploy all 14 services + frontend on a Kubernetes cluster under namespace
`fadl-testing`. Each service gets a `Deployment`, `Service`, and `HorizontalPodAutoscaler`.
A `ConfigMap` named `fcms-feature-flags` holds the default tier→module mapping.
Ingress routes `/api/<service>` to the correct backend. PostgreSQL and Redis are
deployed via existing Helm charts (Crunchy Data PGO + Bitnami Redis).
