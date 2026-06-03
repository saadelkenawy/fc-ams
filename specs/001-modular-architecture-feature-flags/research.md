# Research: Modular Architecture & Feature Flagging

**Branch**: `001-modular-architecture-feature-flags`
**Phase**: 0 (Research)

---

## 1. Feature Flag Storage Strategy

**Decision**: Redis + env-var fallback, served via identity-service

**Rationale**: Redis is already deployed (used for sessions and rate-limiting).
Storing flags in Redis gives sub-millisecond reads and a natural 60-second TTL
without a new database or external service. Env-var fallback (`FEATURE_FLAGS_JSON`)
lets the flag set be baked into Kubernetes ConfigMaps for zero-Redis bootstrap.

**Alternatives considered**:
- LaunchDarkly / Unleash: external dependency, cost, GDPR concerns for clinic data
- PostgreSQL table: correct but overkill for a boolean map; slower than Redis
- Static JSON file: no runtime override, requires pod restart to change

---

## 2. JWT Unlock Mechanism

**Decision**: Separate `DEVELOPER_UNLOCK_SECRET` + `X-Unlock-Token` cookie, verified
in identity-service, cached in Redis under `unlock:{sessionId}` (TTL = token `exp`)

**Rationale**: Keeps developer-override tokens entirely separate from user auth tokens.
The existing `JWT_SECRET` is not compromised if a demo unlock token leaks. Session
binding prevents token replay across different browser sessions. Redis TTL mirrors
the token expiry so no manual cleanup is needed.

**Alternatives considered**:
- Add `modules` claim to user JWT: requires re-issuing user tokens, pollutes auth flow
- URL query param: logged in proxies, leaks in referrer headers
- Database record: requires write access to production DB for every demo setup

---

## 3. Module Boundary Enforcement

**Decision**: `requireModule(moduleId)` Fastify middleware + `useFeatureFlags()` React hook

**Rationale**: Dual enforcement (backend + frontend) matches the existing pattern
where `requireRole()` guards backend routes and `ROLE_RULES` in middleware guards
frontend routes. Adding a `requireModule` decorator follows the same shape as
`requireAuth` (god node, 55 edges) and `requireRole` (47 edges) — minimal new
surface area.

**Alternatives considered**:
- API gateway-level routing: requires Nginx/Kong config changes per module change
- Service mesh (Istio) authorization policies: correct for prod hardening but
  disproportionate complexity for this feature

---

## 4. Subscription Tier in JWT

**Decision**: Add `subscriptionTier: 'basic' | 'standard' | 'premium'` as an optional
claim in the existing HS256 JWT payload. Default to `'premium'` if absent (preserves
backward compatibility with all existing tokens).

**Rationale**: The JWT payload already carries `{ sub, role, branchId, doctorId }`.
Adding one claim reuses the existing token infrastructure. Defaulting to `premium`
means no existing session breaks — only new logins get tier-restricted tokens.

**Alternatives considered**:
- Separate subscription service: correct long-term but out of scope
- Redis lookup by userId: extra hop per request; JWT self-contained is faster

---

## 5. Kubernetes Topology

**Decision**: One `Deployment` + `ClusterIP Service` per microservice; Nginx Ingress
routing `/api/<service-slug>` to each; `HorizontalPodAutoscaler` on CPU 70%.
Namespace: `fadl-testing`.

**Rationale**: Community 118 in the graph already contains `Default-Deny NetworkPolicy`,
`PostgreSQL HA with Patroni (Crunchy Data)`, `Redis Cluster`, and `PgBouncer`
manifests for the `fadl-prod` namespace. The testing cluster mirrors this topology
but uses a separate namespace and lower resource limits.

**Alternatives considered**:
- OpenShift Routes instead of Ingress: compatible if cluster is OpenShift; Ingress
  manifests work on both vanilla k8s and OCP 4.x via the Ingress shim
- Helm chart per service: correct for parameterised prod deployments; deferred
  because kustomize overlays are simpler for a single testing cluster

---

## 6. Branch Strategy (Task 4)

**Decision**: `main` (stable) + `demo/<client-slug>` cut from main with a
pre-seeded `.env.demo` containing a 30-day unlock JWT for the demo modules.

**Rationale**: Demo branches never merge back to main, so the codebase stays clean.
The unlock JWT in `.env.demo` is checked in only to the demo branch (not main),
preventing accidental secret exposure in the production branch.

**Alternatives considered**:
- Feature flags in the database: correct, but gives no branch isolation for
  completely removing unreleased UI elements from the demo
- Environment-variable-only approach without branch: works but risks demo
  config leaking into production via a bad deploy

---

## Resolved Clarifications

All items from the Technical Context section are resolved:
- No new database tables needed (Redis + JWT claims only)
- No new npm packages beyond `jsonwebtoken` (already `@fastify/jwt`) for
  the unlock token verification
- K8s manifests target `fadl-testing` namespace; base images are the existing
  service Dockerfiles
