# FCMS Enhancement Plan — Architecture, Database, Security & UI

> Audit date: 2026-06-10 · Audited at commit `460930a` (branch `main`)
> Scope: 14 Fastify services, PostgreSQL 16 + PgBouncer, Next.js 15 web portal.
> Each finding cites the file where it was observed. Priorities: **P0** = fix before production / actively dangerous, **P1** = fix soon, **P2** = planned improvement, **P3** = nice to have.

---

## 1. Executive Summary

The codebase is well-organized (consistent service layout, shared `@fadl/types`, Zod-validated env config, scrypt password hashing, account lockout, audit logging, immutable billing ledger, RLS policies in SQL). However, the audit found **four systemic gaps** that outweigh any single bug:

1. **Zero automated tests** — not one `*.test.ts` / `*.spec.ts` file exists anywhere in `services/` or `frontend/`. A clinic management system handling money and patient data has no regression safety net.
2. **Branch isolation (RLS) is not actually per-user** — the `app.current_branch_id` setting is taken from the static env var `BRANCH_ID`, not from the authenticated user's JWT. Two of the three patterns used to set it are likely broken at runtime (details in §3.1).
3. **Over-privileged, forgeable service-to-service auth** — every service mints a 24-hour `role: admin` JWT from the same shared `JWT_SECRET` used for user tokens. Compromise of any one service (or the frontend's env) = full admin on all services.
4. **Money flows on fire-and-forget HTTP** — appointment→billing transaction creation is `void (async () => …)` with `console.error` on failure. A billing-service outage silently loses revenue records.

---

## 2. Security

### 2.1 P0 — Service-to-service tokens are `role: admin` user tokens

**Where:** `services/appointment-service/src/clients/billing.ts:9-22` (and the same `makeServiceToken()` copy-pasted into `notification.ts`, doctor-service, ai-chatbot-service, integration-service clients).

Each service hand-rolls an HS256 JWT:

```ts
{ sub: '00000000-…-0001', role: 'admin', branchId: config.BRANCH_ID, exp: now + 86400 }
```

Problems:
- It is indistinguishable from a real admin user token — it passes `requireAuth` + `requireRole('admin')` on **every** endpoint of **every** service, including user CRUD on identity-service.
- 24-hour expiry for a token minted fresh on every request is pointless risk; if one leaks (logs, APM, proxy) it is admin-everywhere for a day.
- No `aud` (audience) or `iss` (issuer) claims, so a token minted for billing calls works against identity.

**Recommendation:**
1. Introduce a dedicated `role: 'service'` (or `tokenType: 'service'` claim) and explicit `aud: '<target-service>'`, `iss: '<caller>'` claims. Each service verifies `aud === self`.
2. Drop expiry to 60–120 seconds (the token is regenerated per request anyway via the axios interceptor).
3. Extract the duplicated `makeServiceToken()`/`base64url()` into a shared package (`shared/service-auth`) — there are at least 5 copies today (see §4.3).
4. Longer term: move to asymmetric signing (RS256/EdDSA). Identity-service holds the private key; all other services verify with the public key. This removes the "one shared secret = keys to the kingdom" problem entirely, including for the frontend middleware which currently also needs `JWT_SECRET` (`frontend/web-portal/src/middleware.ts:28`).

### 2.2 P0 — Webhook signature verification silently disabled by default

**Where:** `services/integration-service/src/controllers/webhook.controller.ts:10-16` + `services/integration-service/src/config/index.ts:20-23`.

```ts
function verifySecret(header, expected) {
  if (!expected) return true; // dev mode: skip verification
```

All four webhook secrets default to `''` in the Zod schema, so unless every secret is explicitly set in production env, **anyone on the network can inject fake Vizita/Ekshf/CliniDo/InstaPay bookings and payment confirmations**. InstaPay especially is a payment-confirmation channel.

**Recommendation:**
1. Remove the empty-string defaults; make the secrets **required when `NODE_ENV === 'production'`** (Zod `superRefine`), and log a loud startup warning in dev.
2. Upgrade from shared-secret-in-header to proper **HMAC of the raw request body** (`x-signature: hex(hmac_sha256(body, secret))`) with a timestamp header and ±5 min replay window. The current scheme sends the secret itself over the wire on every request.
3. Add per-source rate limiting and store rejected webhook attempts in the existing events table for alerting.

### 2.3 P0 — Tokens in `localStorage` + CSP disabled

**Where:** `frontend/web-portal/src/lib/api.ts:11,73-74`, `frontend/web-portal/src/contexts/AuthContext.tsx:42-43`, and `services/identity-service/src/app.ts:25` (`helmet, { contentSecurityPolicy: false }`).

Access token, refresh token, and user object all live in `localStorage` — exfiltratable by any XSS. With CSP disabled on the API side and no CSP configured in the Next.js app, the two defenses that would mitigate each other are both off. Note also the **split-brain**: `middleware.ts:46` reads a `fadl_token` **cookie**, but the login flow only writes `localStorage` — verify whether the cookie is ever set; if not, all the server-side role rules in `ROLE_RULES` are dead code and route protection is purely client-side.

**Recommendation:**
1. Move the refresh token to an `HttpOnly; Secure; SameSite=Strict` cookie set by identity-service (or a Next.js route handler). Keep the short-lived (15 min) access token in memory only — never persisted.
2. Set the access token (or a session marker) as a cookie too, so `middleware.ts` route/role protection actually executes server-side.
3. Add a CSP via `next.config` headers (script-src 'self', frame-ancestors 'none', etc.) and re-enable helmet CSP on services (they serve JSON; a restrictive default costs nothing).

### 2.4 P1 — Single shared HS256 secret across 14 services + frontend

Covered by 2.1's asymmetric-keys recommendation. Interim hardening: rotate `JWT_SECRET` regularly, source it from a secret manager (memory notes say Vault was the target — `reference_database_architecture`), and ensure `.env` is git-ignored (a root `.env` exists in the working tree — verify it is not tracked: `git ls-files .env`).

### 2.5 P1 — Hardcoded credential defaults in config schemas

**Where:** `services/file-service/src/config/index.ts:16-17` (`MINIO_ACCESS_KEY` defaults `fadl_minio` / `fadl_minio_secret`).

A misconfigured prod deployment silently runs with known credentials. Same rule as 2.2: no defaults for credentials; required in production.

### 2.6 P1 — Infra ports exposed on the host in docker-compose

**Where:** `docker-compose.yml:44-45` (Postgres `5432:5432`), `:58-59` (Redis `6379:6379` — no password), `:76-77` (MinIO `9000`), plus every service port published.

Fine for local dev; dangerous if this compose file is the basis of the prod deployment (a `docker-compose.prod.yml` exists). **Recommendation:** in prod compose, publish **only** the web portal (and optionally an API gateway); keep Postgres/PgBouncer/Redis/MinIO/services on the internal Docker network. Add `requirepass` to Redis.

### 2.7 P1 — Error handler leaks internal messages

**Where:** `services/identity-service/src/app.ts:52-64` (same pattern in all services). 5xx responses send `(error as Error).message` to the client — DB error strings, internal hostnames, etc. **Recommendation:** for `statusCode >= 500`, respond with a generic message + request ID; log the real error server-side (already done).

### 2.8 P2 — Rate limiting & proxy trust

- Identity allows 30 req/min/IP (`app.ts:29`) — good, but with `trustProxy: true` the limiter keys on a spoofable `X-Forwarded-For` unless the deployment guarantees a trusted proxy in front. Verify; otherwise scope `trustProxy` to known proxy CIDRs.
- Confirm every other service registers `@fastify/rate-limit` (spot-check showed identity only); at minimum billing and integration need it.

### 2.9 P2 — Healthcare-data (PHI) posture

For a clinic system, plan for: field-level encryption (or pgcrypto) for clinical notes in `ehr-service`; **read-access audit logging** (who viewed which patient) — currently only auth events are audited (`identity.repository.ts auditLog`); data-retention and export/erasure procedures (Egypt PDPL); TLS termination everywhere (currently plain HTTP between services — acceptable inside one Docker network, document the boundary).

### 2.10 What's already good (keep)

scrypt password hashing with timing-safe compare and bcrypt back-compat (`auth.controller.ts:19-50`); account lockout (423) + login audit trail; refresh tokens stored SHA-256-hashed (`identity.repository.ts:141`); Zod validation at every controller boundary; immutable settlements requiring admin password re-verification.

---

## 3. Database

### 3.1 P0 — RLS branch isolation: wrong source of truth and two broken patterns

The CLAUDE.md contract says: *"After validation each service runs `SET LOCAL app.branch_id = $branchId` (from the JWT) before any DB query."* The code does **not** do this:

1. **Wrong source:** `services/appointment-service/src/config/database.ts:23,38` (and doctor-service, file-service equivalents) set the branch from `config.BRANCH_ID` — a static env var — never from `request.user.branchId`. With one deployment per branch this "works", but it means RLS is deployment-scoped, not user-scoped: an admin from branch 2 logging into the branch-1 deployment sees branch-1 data, and a future multi-branch deployment has **no** isolation. The JWT's `branchId` claim is decorative.
2. **Likely no-op:** `withRlsContext()` (`database.ts:35-43`) calls `set_config(…, true)` (transaction-local) **outside any transaction** — in PostgreSQL the setting evaporates at the end of that single-statement transaction, so subsequent queries on the client see `NULL` branch and the policy `branch_id = current_setting('app.current_branch_id', TRUE)::INT` matches nothing (or everything via NULL-comparison semantics on `FORCE` tables). This needs runtime verification — if rows are coming back, RLS may not be enforcing at all on these paths (e.g. connecting as a role with `BYPASSRLS`, or policies not applied to that table).
3. **Likely runtime error:** `SET app.current_branch_id = $1` with a bind parameter (`appointment-service/src/controllers/room.controller.ts:163,238`, `appointment.controller.ts:111`) — `SET` does not accept parameters in PostgreSQL; if these paths execute they should throw. Either they're dead code or errors are being swallowed.

**Recommendation (in order):**
1. Write an integration test that proves isolation: create rows in branch 1 and 2, query with each context, assert no leakage (this alone justifies the test infrastructure in §4.1).
2. Standardize on **one** helper: `withBranchContext(branchId, fn)` that opens a transaction and runs `SELECT set_config('app.current_branch_id', $1, true)` inside it — and **pass `request.user.branchId`**, not env.
3. Delete the parameterized `SET` calls and the non-transactional `withRlsContext` variant.
4. Confirm PgBouncer pool mode: with **transaction pooling**, session-level `SET` is unsafe and transaction-local `set_config` inside explicit transactions is the only correct pattern. Document this in CLAUDE.md.
5. Verify the service DB roles don't own the tables / lack `BYPASSRLS` (policies use `FORCE ROW LEVEL SECURITY` — good — but only on some tables; audit coverage per table).

### 3.2 P1 — No real migration runner

Migrations are `V00X__*.sql` applied via `bash scripts/migrate.sh` (psql), with no schema-version ledger, no checksums, and no transactional guarantees. Evidence of drift already exists: billing jumps **V009 → V011** (no V010 in `services/billing-service/db/migrations/`).

**Recommendation:** adopt a real runner — `node-pg-migrate`, Flyway, or sqitch — with a `schema_version` table per database, checksum validation, and CI enforcement ("no service builds if pending migrations fail against a scratch DB"). Migrate the existing files in place; keep the manual `pnpm db:migrate` entry points.

### 3.3 P1 — Backup / disaster recovery (nothing found)

No backup tooling exists in the repo or compose files. For financial + patient data this is a P1 even pre-launch. **Recommendation:** pgBackRest (or wal-g) with WAL archiving to MinIO/S3, nightly full + continuous WAL, **quarterly restore drills**, and a documented RPO/RTO. Add `pg_dump` of all 12 DBs as an interim cron until that lands.

### 3.4 P2 — Partition lifecycle automation

`V010__partitions_2026_2027.sql` pre-creates monthly partitions through 2027 and `V011__partition_automation_and_idempotency.sql` adds automation — verify the automation actually runs (it's a DB function; nothing schedules it without pg_cron or an app-level job). **Recommendation:** add a scheduled job (pg_cron in the cluster, or a tiny cron container) that calls the partition-maintenance function monthly and alerts if the next 3 months of partitions don't exist. Same for dropping/archiving old partitions per retention policy.

### 3.5 P2 — Idempotency key scope

`UNIQUE (branch_id, transaction_date, idempotency_key)` is **per-date**: the same `appt-billing-<id>` key on a different `transaction_date` inserts a duplicate. Since the key embeds the appointment ID, a retry that crosses midnight (or a back-dated correction) can double-bill. **Recommendation:** either include the appointment date in the key deterministically, or add a global (non-partitioned) `idempotency_keys` lookup table checked before insert.

### 3.6 P2 — Analytics cross-DB access

`analytics-service` reads `fadl_billing` and `fadl_appointments` directly — a deliberate trade-off, but it couples analytics to other services' schemas with no contract. **Recommendation:** create read-only DB roles with `GRANT SELECT` on explicit views (not tables) owned by billing/appointment services. The views become the contract; schema changes behind them don't break analytics. Longer term: read replica.

### 3.7 P3 — Index & query review

Patient FTS (GIN tsvector) and the exclusion constraint on double-booking are solid. Schedule a pass with `pg_stat_statements` after a few weeks of real load: check FK indexes on partitioned tables, the `appointments (doctor_id, date)` access paths, and `EXPLAIN` for the settlement aggregation queries in `billing.repository.ts` (1,100+ lines — likely contains the heaviest queries).

---

## 4. Architecture

### 4.1 P0 — No tests, anywhere

`find services frontend -name "*.test.ts*"` → **0 files** (excluding node_modules/worktrees). The Jenkins pipeline builds images but can't catch regressions.

**Recommendation — pragmatic order, not "test everything":**
1. **Money paths first** (vitest + testcontainers-postgres): billing transaction creation/idempotency, split recalculation trigger (`aab_recalc_on_split_change`), settlement immutability, refund flow. These encode the business in SQL triggers — exactly the logic that silently breaks.
2. **RLS isolation test** (§3.1).
3. **Auth contract tests**: requireAuth/requireRole matrix per service, service-token `aud` enforcement once added.
4. **One happy-path E2E** (Playwright, already in repo for screenshots): login → create patient → book appointment → record payment → see it in billing.
5. Wire `pnpm test` into Jenkins as a gate (it currently can be a no-op).

### 4.2 P0 — Fire-and-forget money: appointment → billing

**Where:** `services/appointment-service/src/controllers/appointment.controller.ts:128-156` — billing creation runs in a detached `void (async () => …)` with `console.error` on failure. The same pattern covers room auto-assignment and SMS (acceptable for those).

If billing-service is down/restarting (every deploy!), the appointment exists but the financial transaction never does, and nothing retries or alerts.

**Recommendation:** implement a minimal **transactional outbox**:
1. In the same DB transaction that creates the appointment, insert a row into `appointment_outbox (id, kind='billing.create', payload, attempts, next_attempt_at, status)`.
2. A small poller in appointment-service (setInterval, `FOR UPDATE SKIP LOCKED`) delivers pending rows with exponential backoff; idempotency keys already make redelivery safe.
3. Alert (notification-service or log-based) on rows stuck > N attempts.
This is ~1 table + ~100 lines and removes the silent-loss class entirely. The same outbox can carry doctor-service → billing split back-patches.

### 4.3 P1 — Copy-pasted infrastructure code across services

`makeServiceToken`/`base64url` exists in ≥5 places; `database.ts` pool/withTransaction is near-identical in all 14 services; the app.ts bootstrap (helmet/cors/jwt/swagger/error-handler) is duplicated too. A security fix (like §2.1) currently requires 14 synchronized edits.

**Recommendation:** add two workspace packages:
- `@fadl/service-kit` — `buildBaseApp(opts)` (fastify + plugins + error handler + health), `requireAuth`/`requireRole`, service-token mint/verify.
- `@fadl/db` — pool factory, `withBranchContext`, outbox helpers.
Per the CLAUDE.md Dockerfile rule, a change to `shared/` rebuilds all services — that's the correct behavior for this category of change.

### 4.4 P1 — Observability is `console.error`

No request-ID propagation between services, no metrics, no tracing. Diagnosing a cross-service failure (appointment→doctor→billing) means grepping 3 containers' logs with no correlation key.

**Recommendation (incremental):**
1. Generate/propagate `x-request-id` (Fastify `genReqId` + axios interceptor forwarding) and include it in every log line and error response. ~Half a day with §4.3's shared kit.
2. Add `/metrics` (prom-client) per service + a Prometheus/Grafana pair in compose; alert on 5xx rate, outbox backlog, DB pool saturation.
3. OpenTelemetry traces later, only if the team will actually run a collector.

### 4.5 P2 — Resilience policy for inter-service HTTP

8s timeout exists (good); there are no retries (correct default for non-idempotent calls) but also no circuit breaker or fallback. With the outbox (§4.2) handling writes, add: small retry budget (2 attempts, idempotent GETs only), and per-client `axios-retry`-style jittered backoff inside the outbox poller.

### 4.6 P2 — API versioning & contracts

Identity mounts under `/api/v1` but other services appear to mount at root (`/transactions`, …) — inconsistent. Swagger is registered per-service; nothing validates that the frontend's expectations match. **Recommendation:** standardize `/api/v1` everywhere; export each service's OpenAPI JSON in CI and type-check the frontend hooks against it (e.g. `openapi-typescript`), replacing hand-maintained types drifting from reality.

### 4.7 P3 — Misc

- `telehealth-service` is scaffolded but not in compose — either wire it or move to a `drafts/` area so it isn't mistaken for live code.
- `.claude/worktrees/stupefied-thompson-669666/` contains a full stale repo copy that pollutes searches — clean up (it shows up in every grep, including this audit's).
- Untracked junk at repo root (`Fadl Clinic Design System-handoff.zip`, `.scannerwork/`, `claude-convert-accounts/`) — gitignore or remove.

---

## 5. UI / Design

Context: the `fc-*` design-kit port is **complete** for Dashboard, Patients, Doctors, Appointments, Billing, Settlements, Analytics (per the tracked gap list — all 10 items Done). Remaining work is quality depth, not visual parity.

### 5.1 P1 — Accessibility pass

Only 13 of 36 component files contain any `aria-*` attribute. Specific gaps to address:
- **Modals** (`Modal.tsx`, `ConfirmDialog.tsx`, the various Bulk/Status/SecureDelete modals): focus trap, `role="dialog"` + `aria-modal`, return focus on close, Escape handling.
- **DataTable**: header `scope`, sort-state `aria-sort`, keyboard row actions.
- **Filter chips / status pills** (heavily used on Appointments/Patients/Billing): they're divs with onClick — need `button` semantics + visible focus rings.
- **Color-only status** (status dots, source pills): add text/icon redundancy; verify contrast in dark mode for the crimson palette (`#DC2626` on dark surfaces is borderline).
- **RTL**: the kit was ported with `[dir="rtl"]` overrides — run a full Arabic-locale click-through; sparklines/charts (SVG) typically don't mirror and need explicit handling.
- Add `eslint-plugin-jsx-a11y` to the lint config so regressions are caught mechanically.

### 5.2 P1 — Auth UX correctness (overlaps §2.3)

Because route protection is client-side today, a logged-out user briefly sees protected shells before redirect, and deep-linking while expired flashes content. Fixing the cookie/middleware split (§2.3.2) also fixes this UX class. Also: the silent-refresh handler (`api.ts:46-83`) can fire **concurrent refreshes** when several queries 401 simultaneously — single-flight it (one in-flight refresh promise shared by all callers) to avoid refresh-token rotation races that randomly log users out.

### 5.3 P2 — Component consolidation & CSS strategy

- Delete legacy `KpiCard.tsx` in favor of `StatCard` (tracked as legacy in the component-evolution notes) and sweep remaining usages.
- `globals.css` now carries the entire ported `fc-*` sheet (kit lines 1285–1913+) plus dark/RTL overrides — it will only grow. Split into `styles/fc/{base,patients,doctors,appointments,billing}.css` imported from globals, and extract the shared tokens (colors, shadows, radii) into Tailwind theme config so new components stop hand-copying hex values.
- Establish one pattern for new pages: fc-* classes for kit-derived layout, Tailwind utilities for one-offs — document it in CLAUDE.md to stop the drift between the two systems.

### 5.4 P2 — Frontend testing & tooling

- Component tests for the ui/ primitives (vitest + testing-library) and **Playwright visual snapshots** for the 7 ported pages in light/dark × LTR/RTL (16 screenshots) — the screenshot automation that already exists in the repo can seed this.
- TanStack Query v4 → v5 migration (v4 is in maintenance); mechanical but touches every hook — do it before more hooks accumulate.

### 5.5 P3 — Polish backlog

- Skeletons exist; add them to the remaining data-heavy views (settlements history, queue) for consistent perceived performance.
- Empty states: `EmptyState.tsx` exists — verify every list view uses it with an action button (e.g. "Book first appointment").
- The dashboard fetches everything client-side; Next 15 server components could render the KPI row server-side for faster first paint — only worth it after the auth-cookie work (§2.3) since server fetching needs the token server-side.

---

## 6. Suggested execution order

| Phase | Items | Effort (rough) |
|---|---|---|
| **Phase 1 — Stop the bleeding (P0)** | §2.2 webhook secrets required; §2.1 service-token `aud`/`type`/short-TTL (keep HS256 for now); §3.1 fix RLS helpers + pass JWT branchId + isolation test; §4.2 billing outbox; §4.1 items 1–2 (money + RLS tests, CI gate) | ~2 weeks |
| **Phase 2 — Harden (P1)** | §2.3 HttpOnly cookies + CSP + middleware fix; §5.2 single-flight refresh; §3.2 migration runner; §3.3 backups; §4.3 shared service-kit/db packages; §2.5–2.7; §5.1 a11y pass | ~3 weeks |
| **Phase 3 — Mature (P2)** | §4.4 request-IDs + metrics; §3.4 partition automation check; §3.5 idempotency scope; §3.6 analytics views; §4.6 API versioning/contracts; §5.3 CSS consolidation; §5.4 frontend tests | ~3–4 weeks |
| **Phase 4 — Polish (P3)** | §2.1 asymmetric JWT; §3.7 query review; §4.7 cleanup; §5.5 polish | opportunistic |

**Dependencies worth noting:** the shared packages (§4.3) should land *before* the asymmetric-JWT work so it's one edit, not fourteen; the cookie work (§2.3) unblocks both the middleware role rules and server-component rendering (§5.5); the test infrastructure (§4.1) is a prerequisite for safely doing everything else.

---

## 7. Verification checklist — RESULTS (verified live 2026-06-10)

- [x] `.env` is **not** tracked (`git ls-files` returns only `.env.example`; `.gitignore:5`). ✓ OK
- [x] **Webhook bypass CONFIRMED**: `POST /api/v1/webhooks/vizita` with no secret header against the running integration-service returned `422` (passed signature check, failed at payload processing) — not `401`. All four `*_WEBHOOK_SECRET` env vars are empty in the live container.
- [x] **RLS is completely inert — worse than §3.1 stated**: the `fadl` role services connect as is `rolsuper = t, rolbypassrls = t`. Superusers bypass RLS even with `FORCE ROW LEVEL SECURITY`. Every policy in every migration is decorative until services connect as a non-superuser role. (Additionally confirmed: `set_config(…, true)` outside a transaction evaporates after its own statement — second statement sees NULL.)
- [x] **Parameterized `SET` CONFIRMED broken**: `SET app.current_branch_id = $1` via the pg driver inside the appointment-service container throws `syntax error at or near "$1"`. The call sites (`room.controller.ts:163,238`, `appointment.controller.ts:111`) sit inside catch-and-log blocks, so the failures are swallowed.
- [x] PgBouncer `pool_mode = session` (`infra/pgbouncer/pgbouncer.ini:32`) — session-level settings would persist per pooled connection (a leakage risk between checkouts); transaction-local `set_config` inside explicit transactions remains the correct pattern.
- [x] **Correction to §2.3**: the `fadl_token` cookie **is** set at login (`AuthContext.tsx:46`), so `middleware.ts` role rules do execute. Remaining issues: the cookie is JS-set (not HttpOnly — same XSS exposure as localStorage) and has `max-age` 24 h while the token expires in 15 min, so middleware happily forwards expired tokens (harmless — services reject them — but the UX flash remains).
- [~] Billing fire-and-forget loss: confirmed by code inspection (`void (async…)` + `console.error`, `appointment.controller.ts:128-156`); not live-tested to avoid disrupting the shared running stack. The outbox (§4.2) addresses it.

### 7.1 Revised P0 for RLS (supersedes §3.1 ordering)

1. **Create a non-superuser application role** (`fadl_app`, `NOSUPERUSER NOBYPASSRLS`) with explicit GRANTs on all 12 databases + default privileges; switch every service's `DATABASE_URL` to it. Keep `fadl` for migrations only.
2. Then the branch-context fixes in §3.1 (transactional `set_config`, JWT branchId, remove broken `SET $1` sites) actually become meaningful.

---

## 8. Phase 1 — IMPLEMENTED (2026-06-10)

All Phase 1 items are done, deployed to the dev stack, and verified end-to-end.

### 8.1 Webhook secrets (§2.2)
- `services/integration-service/src/config/index.ts` — Zod `superRefine` makes all four `*_WEBHOOK_SECRET`s required (min 16 chars) when `NODE_ENV=production`; startup fails otherwise.
- `webhook.controller.ts` `verifySecret()` — hard-fails in production when no secret is configured (defense in depth) and logs a loud per-platform warning in dev.

### 8.2 Service-to-service tokens (§2.1)
- `shared/types` `JwtPayload` gained optional `tokenType: 'service'` and `aud` claims.
- All 5 `makeServiceToken` copies (appointment→billing/notification, doctor→billing, integration→appointment/billing/patient, analytics→5 targets) now mint `tokenType: 'service'`, target-scoped `aud`, **TTL 120 s** (was 1–24 h).
- All 14 services' `requireAuth` reject service tokens whose `aud` doesn't match their own `SERVICE_NAME`. Shared-package extraction and asymmetric keys remain Phase 2/4.

### 8.3 RLS made real (§3.1 / §7.1)
- New role **`fadl_app`** (`NOSUPERUSER NOBYPASSRLS`) created and granted DML on all 12 DBs — `infra/postgres/{create-app-role.sql,grant-app-role.sql,apply-app-role.sh}` (idempotent). All `DATABASE_URL`s in both compose files switched to it; `fadl` is migrations-only. PgBouncer userlist updated. **Production env needs `APP_DB_PASSWORD` (and optional `APP_DB_USER`) set.**
- Canonical `database.ts` (appointment, billing, doctor, ehr, notification, procedure, file; patient already correct): `withTransaction`/`withRlsContext` accept an optional leading `branchId` arg and bind `set_config(..., true)` **inside** a transaction; a `pool.on('connect')` session default (`SET app.current_branch_id = <env BRANCH_ID>`) covers raw `pool.query` paths (safe with PgBouncer session pooling).
- All 6 broken `SET app.current_branch_id = $1` sites (appointment/room controllers + doctor-status subscriber) replaced with `withTransaction(user.branchId, …)`.
- Full per-request JWT-branchId plumbing through every repository remains Phase 2 (single-branch deployments are correct meanwhile via the env default).

### 8.4 Transactional outbox (§4.2)
- `V012__appointment_outbox.sql` + `outbox.repository.ts` (enqueue in-transaction; `FOR UPDATE SKIP LOCKED` claim; exponential backoff 5 s→10 min; dead-letter after 12 attempts) + `lib/outbox-worker.ts` (5 s poller, started in `server.ts`).
- `createAppointment` enqueues `billing.create` in the same transaction as the appointment insert; the controller's fire-and-forget billing block is removed.
- **Verified live**: with billing-service stopped, an appointment was created, the row retried (`attempts=2`, `ENOTFOUND billing-service`), and after restart was `delivered` on attempt 3 with the financial transaction present.

### 8.5 Tests + CI gate (§4.1)
- 16 integration tests, all passing: `services/appointment-service/tests/{rls-isolation,outbox}.test.ts` (10) and `services/billing-service/tests/billing-invariants.test.ts` (6). DB endpoints configurable via `TEST_PG_ADMIN_BASE` / `TEST_PG_APP_BASE`.
- `Dockerfile.test` (+ `Dockerfile.test.dockerignore`) builds a runner image; new **`Tests` stage in the Jenkinsfile** runs it on `fcms_fadl-net` as a hard gate before image builds.
- Every service's `test` script now uses `vitest run --passWithNoTests`, so root `pnpm -r test` is green (exit 0).

### 8.6 Bonus findings fixed along the way (Phase 1)
- **V011 had regressed V009**: the live `protect_financial_amounts()` hard-blocked all split changes, breaking the documented `applyToExisting` back-patch flow. Fixed by `V012__restore_pending_split_soft_guard.sql` (splits updatable unless `payment_status IN ('reconciled','refunded')`; approved_charge relaxation kept). Covered by tests. This is exactly the drift class §3.2's migration runner prevents.
- Identity-service host port mapping moved to **3100→3000** (an unrelated local process holds host 3000; inter-service traffic is unaffected).
- §2.3 correction: the `fadl_token` cookie *is* set at login, so middleware role rules execute — but it's not HttpOnly and outlives the 15-min token; still Phase 2 work.

---

## 9. Phase 2 — IMPLEMENTED (2026-06-10)

### 9.1 Quick security wins (§2.5 / §2.6 / §2.7)
- **MinIO credentials** (`file-service/src/config/index.ts`): production refuses to start with the dev-default `fadl_minio`/`fadl_minio_secret` or a secret < 16 chars.
- **Error handlers** (all 14 `app.ts`): 5xx responses now return a generic `INTERNAL_ERROR` + `requestId` instead of leaking internal error messages; Zod validation errors return proper `400 VALIDATION_ERROR` with field details (they previously surfaced as 500s).
- **§2.6 correction**: prod compose was already locked down — it publishes only nginx 80/443 and Redis already has `requirepass`. No change needed; the audit item applied to the dev compose only (acceptable).
- **Helmet CSP** on all services: enabled in production (left off in dev so Swagger UI at `/docs` keeps working).

### 9.2 Auth token storage + CSP + single-flight refresh (§2.3 / §5.2)
- New Next.js route handlers `POST /api/auth/{login,refresh,logout}` (`src/app/api/auth/`): proxy to identity-service and manage two **HttpOnly, SameSite=Strict** cookies — `fadl_token` (15 min, read by middleware) and `fadl_refresh` (7 days, rotated on every refresh). **The refresh token never reaches page JavaScript**; the legacy localStorage slots are actively cleaned up on boot.
- `lib/api.ts`: access token now lives **in memory only** (`setAccessToken`); the 401 handler does a **single-flight** refresh (one in-flight promise shared by all concurrent 401s — fixes the rotation race that could randomly log users out).
- `AuthContext`: session restore on page load via the refresh cookie; logout revokes server-side and clears cookies.
- `middleware.ts`: fully-unauthenticated visitors (no access *and* no refresh cookie) are now redirected to `/login` server-side — no more protected-shell flash.
- **CSP + security headers** added in `next.config.js` (`headers()`): CSP (script-src 'self' + dev-only unsafe-eval), nosniff, frame DENY, referrer policy, permissions policy.

### 9.3 Migration runner with ledger (§3.2)
- `scripts/migrate.sh` rewritten: per-DB `schema_version` table (version, description, sha256 checksum, applied_at, baselined), drift detection (editing an applied file fails the run), per-file transactions, covers **all 12 services** (was 7), works with host psql or via `docker exec` fallback.
- `bash scripts/migrate.sh all baseline` run against the dev stack — all existing migrations recorded. Drift detection and idempotent re-runs verified live.

### 9.4 Backups (§3.3)
- New `db-backup` compose service (postgres:16-alpine): nightly `pg_dump -Fc` of all 12 DBs + `pg_dumpall --globals-only` into the `pgbackups` volume, 14-day retention (30 in prod), first run at startup. Verified: all 12 dumps + globals produced; archive integrity checked with `pg_restore --list`.
- `infra/backup/restore.sh <db> <date>` — confirmation-gated single-DB restore.
- Remaining for later: ship dumps off-host (MinIO/S3 sync) and schedule a quarterly restore drill.

### 9.5 Accessibility pass (§5.1)
- `eslint-plugin-jsx-a11y` wired into `.eslintrc.json` (recommended ruleset) — **62 findings → 0** (6 are documented inline suppressions for legitimate patterns: backdrop click-shields, Safari `role="list"`, pointer-only sidebar resize).
- New `DialogOverlay` component (`components/ui/DialogOverlay.tsx`): drop-in accessible wrapper for the inline `fixed inset-0` modal pattern — role=dialog, aria-modal, aria-label, Escape, focus trap, focus restore, optional `closeOnBackdrop={false}` for destructive flows.
- Converted **10 inline modals** to DialogOverlay (appointments ×3, billing ×3, settings, sources, doctor-schedule, QueueBoard cancel-turn).
- Keyboard activation (role=button + tabIndex + Enter/Space) added to clickable cards/rows: doctors grid, patients list, doctor-patients list, appointments timeline blocks.
- Label associations fixed (settings/rooms ×3, RoomStatusBoard ×2); `ActionButtons` rewritten (per-button stopPropagation, aria-labels, aria-hidden icons).
- Note: the existing `Modal.tsx` was already exemplary (focus trap, reduced-motion) — the audit's raw aria-count understated the component quality; the real gaps were the page-level inline modals, now fixed.

### 9.6 Deferred from Phase 2 (do in Phase 3)
- **§4.3 shared `service-kit`/`db` packages**: deliberately deferred — it touches every service's package.json + all 14 Dockerfiles' COPY lists and is too risky to combine with this change set. Phase 1 made all duplicated copies (token mint, auth middleware, database helpers, error handler) **identical**, so extraction is now a mechanical move. Do it as an isolated PR before the asymmetric-JWT work (§2.1.4).
- Full per-request `branchId` plumbing through every repository (§3.1 note) — current state: env default + explicit branchId on appointment-service write paths.
- TanStack Query v4→v5 (§5.4) and Playwright visual snapshots — unchanged.

---

## 10. Phase 3 — shared service-kit (§4.3) — IMPLEMENTED (2026-06-10)

### 10.1 `@fadl/service-kit` (`shared/service-kit`)
New workspace package consumed by all 14 services; four modules:
- **auth**: `createRequireAuth(serviceName)` (JWT verify + service-token `aud` enforcement) and `requireRole(...roles)`. Owns the `@fastify/jwt` `FastifyJWT` type augmentation.
- **service-token**: `makeServiceToken(aud, { jwtSecret, branchId, sub? })` and `createServiceClient({ baseURL, aud, ... })` — axios instance, 8 s default timeout, fresh 120 s token per request. Per-service `sub` values (…0001/…0002/…0003) preserved.
- **db**: `createDb({ connectionString, min, max, serviceName, rls? })` → `{ pool, withTransaction, withRlsContext, withClient }`. `rls: { defaultBranchId }` enables the branch-context binding (8 RLS services); identity / procurement / ai-chatbot / integration omit it (their tables aren't branch-scoped).
- **error-handler**: `registerErrorHandler(app)` — the §2.7 contract, unified to include both the `field: msg` message and `details: error.flatten().fieldErrors`.

### 10.2 What changed in services
- `src/middleware/auth.ts` → 5-line re-export (was 8 divergent copies; diffs were cosmetic only — wording/formatting; identity & file had drifted error messages, now unified).
- `src/config/database.ts` → `createDb` wrapper keeping the same exports, so **no repository/controller imports changed**.
- 5 token-mint copies (appointment ×2, doctor, analytics, integration) → kit calls.
- 14 `app.setErrorHandler` blocks (4 drifted variants) → `registerErrorHandler(app)`.
- All 14 Dockerfiles + `Dockerfile.test`: `COPY shared/service-kit/package.json` + `pnpm --filter @fadl/service-kit build` (verified: image builds, kit resolves at runtime via `pnpm deploy`).

### 10.3 Verified
- `pnpm -r build`, `pnpm type-check`, `pnpm test` (16/16 incl. money-path + RLS) all green; appointment image smoke-built locally.
- Net: −~600 lines of copy-pasted infrastructure; future drift (the §8.6 class of bug) is structurally impossible for these four concerns.

### 10.4 Still open for later phases
- Per-request `branchId` plumbing through every repository (§3.1) — unchanged.
- Asymmetric JWT (§2.1.4) — now a one-file change in the kit.
- TanStack Query v4→v5, Playwright snapshots (§5.4).

---

## 11. Phase 4 — Mature (P2 batch) — IMPLEMENTED (2026-06-10)

### 11.1 Observability baseline (§4.4)
- **Request-ID propagation**: `genReqId` (kit) reuses a sane inbound `x-request-id` or mints a UUID at the edge; `registerObservability(app, { serviceName })` binds the id into AsyncLocalStorage, echoes it as a response header, and `createServiceClient` forwards it on every outbound call — one id now correlates the appointment→doctor→billing chain across containers. Error responses already carried `requestId`; pino logs carry `reqId` per request.
- **Metrics**: every service exposes `GET /metrics` (prom-client): default process metrics + `http_request_duration_seconds{method,route,status_code}` histogram (per-service memoized registry, `service` default label). `createDb` adds `pg_pool_connections{state=total|idle|waiting|max}` sampled at scrape time; the outbox worker publishes `appointment_outbox_rows{status=pending|dead}` each poll.
- **Prometheus + Grafana**: `docker-compose.monitoring.yml` (overlay, like sonar) — Prometheus on host 9090 scraping all 13 compose services, Grafana on host 3200 with a provisioned datasource. `infra/monitoring/alert-rules.yml` defines High5xxRate, OutboxDeadLetters, OutboxBacklogGrowing, DbPoolSaturated, ServiceDown (Alertmanager wiring is config-only later).

### 11.2 Idempotency key scope (§3.5)
- New `idempotency_keys` table in fadl_billing (V013, non-partitioned, `PK (branch_id, idempotency_key)`, RLS) claimed inside `createTransaction`'s tx via `INSERT … ON CONFLICT DO NOTHING RETURNING`; conflict path returns the winning transaction. Closes both the cross-midnight retry duplicate and the concurrent same-key race the SELECT pre-check missed. 128 existing keys backfilled (earliest row wins).

### 11.3 Partition lifecycle (§3.4)
- **Found live**: fadl_billing leaves existed only through **July 2026** — inserts would have started failing 2026-08-01. V014 adds `create_billing_partition(branch, year, month)` (also creates the branch LIST parent) and extends the runway to 2028-12.
- **Found live**: appointment V010/V011 were ledger-*baselined* but V011 had never executed — `create_appointment_partition` didn't exist. Re-applied (idempotent). Lesson: baselining marks files applied without running them; verify objects exist when baselining.
- `infra/backup/partition-maintenance.sh` now runs daily after backups in the db-backup container: ensures a rolling 12-month runway in both DBs via the factory functions (branches discovered from parent table names) and alerts (non-zero exit + ALERT log) if any of the next 3 months is missing. Verified green in the live container.

### 11.4 Resolved without changes
- **§3.6 analytics contract**: analytics-service no longer has any pg pools/DB URLs — all data already flows through billing/appointment/patient/doctor/procurement HTTP clients. The cross-DB coupling this section described no longer exists.
- **§4.6 route prefixes**: all 14 services already mount under `/api/v1`. Remaining (deferred): exporting per-service OpenAPI JSON in CI and type-checking frontend hooks against it.

### 11.5 Frontend (§5.3 / §5.4)
- Deleted legacy `KpiCard.tsx` (zero importers; StatCard is canonical).
- **TanStack Query v4 → v5** (`^5.62`): mutation `.isLoading` → `.isPending` (23 sites), `cacheTime` → `gcTime` (1), `keepPreviousData: true` → `placeholderData: keepPreviousData` (11 files). No `useQuery` callbacks existed, so no behavioral refactors. `tsc --noEmit` and `next build` green.

### 11.6 Still open for later phases
- Asymmetric JWT (§2.1.4) — one-file kit change.
- Per-request branchId plumbing through repositories (§3.1).
- Playwright visual snapshots + component tests (§5.4), CSS splitting (§5.3 second half).
- OpenAPI contract check in CI (§4.6), Alertmanager receiver, partition archival/retention policy (§3.4 second half).

---

## 12. Phase 5 — Polish (P3 batch) — IMPLEMENTED (2026-06-11)

### 12.1 Asymmetric JWT (§2.1.4 / §2.4)
Two trust domains replace the single shared HS256 secret:
- **User access tokens: RS256.** identity-service signs with the private key (`JWT_PRIVATE_KEY_B64`, identity env only); every other service registers @fastify/jwt with `{ public }` and `algorithms: ['RS256']` — they can verify but structurally cannot mint. The web-portal middleware (jose `importSPKI`) also verifies with the public key only, so a leaked frontend env can no longer forge auth.
- **Service-to-service tokens: HS256 with a dedicated `SERVICE_JWT_SECRET`.** Minted by `makeServiceToken` (kit), verified by hand in `createRequireAuth` (timing-safe compare, `exp`, `tokenType === 'service'`, target-scoped `aud`). Holding this secret reaches internal endpoints but cannot forge a user token; the RS256 path rejects any token claiming `tokenType: 'service'`, and the HS256 path requires it — no algorithm-confusion crossover.
- Dev keypair: `infra/jwt/` (PEMs are gitignored by the existing `*.pem` rule; the base64 values are inline in docker-compose.yml like the other dev secrets; README documents prod key generation). `JWT_SECRET` is gone from all 14 service configs, app.ts registrations, compose dev+prod, and `.env.example` files. Prod compose fails fast on missing `JWT_PRIVATE_KEY_B64`/`JWT_PUBLIC_KEY_B64`/`SERVICE_JWT_SECRET` (`${…:?}`).
- **Verified live** (7/7): login issues RS256; RS256 accepted by appointment + billing; service token accepted with correct secret+aud; rejected with wrong `aud`; rejected when forged with the old shared JWT_SECRET; HS256-without-tokenType rejected. 16/16 integration tests green.
- **Operator note:** pre-prod/production deploy targets in Jenkinsfile.deploy still inject `JWT_SECRET` into their `.env` — harmless dead var locally, but remote hosts using docker-compose.prod.yml need the three new vars in `/opt/fcms/.env` before their next deploy. The `prod-jwt-secret` Jenkins credential can be retired then.

### 12.2 Phase 3 gap found and fixed
`services/Dockerfile.backend` — the shared dockerfile docker-compose dev builds use (all backend services build via `SERVICE_DIR` arg) — was missed in the Phase 3 service-kit rollout: it never copied `shared/service-kit`, so every local `docker compose build` of a backend service failed since Phase 3 (CI was unaffected — it uses the per-service Dockerfiles). Now wires service-kit through deps/builder stages. This also explains fcms-deploy #90/#91 failures: they ran Phase-4 hub images against this working tree's Phase-5 compose env mid-migration (JWT_SECRET removed) → identity crashloop → healthcheck deps failed. Resolves itself when images and compose come from the same commit.

### 12.3 Repo cleanup (§4.7)
`.gitignore` now covers `.scannerwork/`, `.claude/worktrees/` (stale repo copy that polluted searches), `claude-convert-accounts/`, `design-system/`, `*.zip`, `.next/`, `.mcp.json`. telehealth-service stays scaffolded (excluded from deploys by the fcms-deploy filter).

### 12.4 Still open (opportunistic)
- §3.7 query review — needs pg_stat_statements under real load.
- §3.1 per-request branchId plumbing through repositories.
- §5.4 Playwright snapshots / component tests; §5.3 CSS splitting; §4.6 OpenAPI contract checks in CI; §5.5 polish backlog.

---

## 13. Phase 6 — Per-request isolation & contracts — IMPLEMENTED (2026-06-11)

### 13.1 Per-request branchId (§3.1 — the last open P0)
RLS context is now **user-scoped, not deployment-scoped**, with zero repository signature churn:
- `requireAuth` (kit) stores the verified JWT's `branchId` in the per-request AsyncLocalStorage (same store Phase 4 added for request ids).
- `createDb` resolves the branch as **explicit argument → authenticated request's branch → env default** — so every existing `withTransaction`/`withRlsContext` call automatically binds the caller's branch; env `BRANCH_ID` remains only the fallback for workers/startup.
- New `db.query(text, values)` — a drop-in `pool.query` replacement that binds the context; 19 raw request-path `pool.query` sites in appointment/billing/doctor converted (`rlsQuery` export). The outbox worker's 2 sites intentionally stay env-scoped.
- `withRequestContext({ branchId }, fn)` exported for workers/tests.
- **Proven** by `tests/rls-request-context.test.ts` (4 tests): branch-2 request context sees only branch-2 rows through the same code path that previously used the env default; explicit args still win; the `db.query` helper binds too.

### 13.2 OpenAPI contracts (§4.6)
- `scripts/export-openapi.sh` exports all 12 documented services' specs from the running stack into `contracts/openapi/` (integration-service excluded — webhook-only, no swagger).
- `pnpm --filter web-portal contracts:types` (openapi-typescript) regenerates `src/types/api/<service>.ts`. Workflow: change routes/schemas → re-export → regenerate → a portal type error = contract drift caught before runtime. Adoption in hooks is incremental.

### 13.3 Frontend component tests (§5.4 first half)
- vitest + jsdom + Testing Library wired into web-portal (`vitest.config.ts`, setup with RTL cleanup, `pnpm test`).
- 11 tests across Button (variants, loading/disabled semantics), Badge + AppointmentStatusBadge (bilingual labels), EmptyState (action wiring).
- Playwright visual snapshots remain deferred (browser infra in CI).

### 13.4 Verified
31 tests green (14 appointment incl. RLS proofs, 6 billing, 11 portal); workspace build + type-check clean; deploy #92 (Phase 5) SUCCESS with all 14 services healthy and **13/13 Prometheus targets up** — the full Phase 4 observability stack is live.

### 13.5 Remaining backlog (opportunistic)
§3.7 query review under load, Playwright snapshots, CSS splitting (§5.3), §5.5 polish, Alertmanager receiver, partition retention/archival, secret manager (Vault).
