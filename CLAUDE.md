# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- ALWAYS read graphify-out/GRAPH_REPORT.md before reading any source files, running grep/glob searches, or answering codebase questions. The graph is your primary map of the codebase.
- IF graphify-out/wiki/index.md EXISTS, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

---

## Commands

```bash
# Run all services in dev mode (parallel)
pnpm dev

# Build everything
pnpm build

# Build a single service
pnpm --filter @fadl/appointment-service build

# Run all tests
pnpm test

# Run tests for a single service
pnpm --filter @fadl/identity-service test

# Run a single test file / pattern
pnpm --filter @fadl/billing-service test -- path/to/file.test.ts
pnpm --filter @fadl/billing-service test -- --reporter=verbose -t "settlement"

# Lint / type-check
pnpm lint
pnpm type-check

# Docker compose (all services + infra)
pnpm docker:up
pnpm docker:down
pnpm docker:logs

# Database migrations (Flyway-style, applied via psql — no auto-runner)
pnpm db:migrate                    # all services
pnpm db:migrate:patient            # single service
# Migration files live at: services/<name>-service/db/migrations/V001__*.sql
```

---

## Architecture

**Monorepo layout** (`pnpm-workspace.yaml`):
- `services/*` — 14 Fastify microservices (TypeScript, Node 20)
- `frontend/web-portal` — Next.js 15 App Router (TanStack Query v4, TailwindCSS)
- `shared/types` — `@fadl/types`: shared TypeScript interfaces imported by all services and the frontend
- `migration/` — migration utilities

**Each service** follows this internal layout: `src/{app,config,controllers,middleware,repositories,routes,server.ts}`.

**Infrastructure** (docker-compose): PostgreSQL 16 → PgBouncer → services. Redis for sessions/rate-limiting. MinIO for file uploads.

### Service ports
| Service | Port | Notes |
|---|---|---|
| identity | 3000 | JWT login, user CRUD, roles |
| appointment | 3001 | Scheduling, rooms, SSE queue |
| patient | 3002 | Demographics, prefix FTS search |
| doctor | 3003 | Profiles, schedules, revenue splits |
| billing | 3004 | Immutable ledger, settlements |
| ehr | 3005 | Clinical encounters |
| procedure | 3006 | Procedure catalogue |
| notification | 3007 | email (nodemailer) + SMS (Twilio) |
| ai-chatbot | 3008 | OpenRouter intent parser |
| analytics | 3009 | Read-only cross-DB queries |
| procurement | 3010 | Vendors, POs |
| file | 3011 | MinIO presigned URLs |
| integration | 3012 | Vizita / Ekshf / CliniDo / InstaPay webhooks |
| telehealth | 3013 | Scaffolded only — not in docker-compose |

### Cross-service communication
Services call each other over HTTP using `Authorization: Bearer <service-token>` — a synthesised HS256 JWT with `role: admin`, signed with the shared `JWT_SECRET`. All calls use an 8 s `AbortSignal.timeout`. The call graph:
- `appointment-service` → `doctor-service` (resolve splits), `billing-service` (create transaction)
- `doctor-service` → `billing-service` (push split changes, back-patch pending transactions)
- `ai-chatbot-service` → `patient-service`, `appointment-service`, `doctor-service`
- `integration-service` → `appointment-service`, `patient-service`
- `analytics-service` → direct DB reads on `fadl_billing` + `fadl_appointments`

### Authentication
All requests carry `Authorization: Bearer <JWT>`. Every service validates the HS256 signature locally (no central auth gateway). JWT payload: `{ sub, role, branchId, doctorId }`. After validation each service runs `SET LOCAL app.branch_id = $branchId` before any DB query — this activates PostgreSQL RLS on all tables.

Roles: `admin`, `finance`, `receptionist`, `doctor`.

### Database
One PostgreSQL cluster; 12 logical databases (one per service). All connections go through PgBouncer on port 5432. Key invariants:
- **Immutable billing ledger**: `protect_financial_amounts()` trigger blocks writes to core charge fields; `recalc_on_split_change()` (fires first, `aab_` prefix) auto-recalculates `doctor_share`/`clinic_share` when split % changes on pending rows.
- **Partitioning**: `appointments` and `financial_transactions` are range-partitioned by `(branch_id, date)` with monthly sub-partitions.
- **Migrations**: sequential `V001__*.sql` files under `services/<name>-service/db/migrations/`, applied manually via `bash scripts/migrate.sh`.
- **No auto-runner**: migrations do not run on service startup.

### Jenkins CI (`fcms-pipeline`)
The pipeline runs on the `main` branch inside `fcms-jenkins` container (port 8080). It diffs changed files against the last successful build and rebuilds only the affected service images. All `docker build` commands run from the **repo root** with `-f <service>/Dockerfile .` so that pnpm workspaces resolve correctly.

**Critical Dockerfile rule**: Every service Dockerfile must use `--filter` to build only its own package. Using `RUN pnpm build` at the root triggers a recursive build across all packages (including `next build` for the web portal), which fails in service containers that don't have `next` installed. The correct pattern (see `services/appointment-service/Dockerfile`):

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm@8
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY shared/types/package.json ./shared/types/
COPY services/<name>/package.json ./services/<name>/
RUN pnpm install --no-frozen-lockfile
COPY . .
RUN pnpm --filter @fadl/types build
RUN pnpm --filter @fadl/<name> build
RUN pnpm --filter @fadl/<name> deploy --prod /deploy
```

A change to `shared/` or root config files (`pnpm-workspace.yaml`, `tsconfig.base.json`) triggers a rebuild of **all** services.

<!-- SPECKIT START -->
### Active Feature Branch

Current plan: [specs/001-modular-architecture-feature-flags/plan.md](specs/001-modular-architecture-feature-flags/plan.md)

Feature: Modular Architecture & Feature Flagging — subscription tiers, developer unlock JWT, K8s deployment.
See also: [spec](specs/001-modular-architecture-feature-flags/spec.md) · [research](specs/001-modular-architecture-feature-flags/research.md) · [data-model](specs/001-modular-architecture-feature-flags/data-model.md) · [contracts](specs/001-modular-architecture-feature-flags/contracts/)

### Planned Feature

Planned plan: [specs/002-sonarqube-code-quality/plan.md](specs/002-sonarqube-code-quality/plan.md)

Feature: SonarQube Code Quality Integration — multi-module monorepo scan, Jenkins quality gate, lcov coverage, Docker + K8s deployment.
See also: [research](specs/002-sonarqube-code-quality/research.md) · [data-model](specs/002-sonarqube-code-quality/data-model.md) · [contracts](specs/002-sonarqube-code-quality/contracts/) · [quickstart](specs/002-sonarqube-code-quality/quickstart.md)
<!-- SPECKIT END -->

### Key business rules
- **Appointment double-booking**: prevented by a PostgreSQL exclusion constraint on `(doctor_id, appointment_date, time_range)` — collision is rejected at the DB level, not in application code.
- **Patient search**: uses a GIN-indexed `tsvector` column (`name_search`) with `to_tsquery('simple', 'token:*')` — results appear from the first character typed.
- **Revenue splits**: stored as JSONB on `doctors.revenue_splits`; when splits change, `billing-service POST /compensation/:id` with `applyToExisting: true` back-patches all non-reconciled transactions via a single UPDATE + trigger.
- **Settlements**: immutable once created — `protect_financial_amounts()` blocks UPDATE/DELETE on `settlement_records`. Requires admin password verification via identity-service.
- **Idempotency**: `financial_transactions` has a `UNIQUE (branch_id, transaction_date, idempotency_key)` constraint per partition; duplicate POSTs return the existing record.
