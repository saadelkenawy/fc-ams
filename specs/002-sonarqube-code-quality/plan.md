# Implementation Plan: SonarQube Code Quality Integration

**Branch**: `002-sonarqube-code-quality` | **Date**: 2026-06-04
**Spec**: [specs/002-sonarqube-code-quality/spec.md](./spec.md)

**Input**: "need to implement a SonarQube to check the code"

---

## Summary

Integrate SonarQube Community Edition into the FCMS monorepo to enforce continuous
code quality across all 14 Fastify microservices and the Next.js frontend. The
SonarQube server runs as a Docker container (later deployable via Helm on K8s)
backed by a dedicated `fadl_sonar` PostgreSQL database on the existing cluster.
Each service emits an lcov coverage report (via `@vitest/coverage-v8`); a root-level
`sonar-project.properties` multi-module config feeds all 15 modules to the scanner.
Jenkins gains a `SonarQube Analysis` stage (using the `SonarQube Scanner for Jenkins`
plugin) followed by a `Quality Gate` stage that blocks merges on threshold failures.

---

## Technical Context

**Language/Version**: TypeScript 5.x · Node 20 (services + frontend); Groovy (Jenkinsfile)

**Primary Dependencies**:
- `sonarqube:lts-community` Docker image — analysis server
- `sonar-scanner` CLI 5.x (installed in Jenkins agent or Docker runner)
- `@vitest/coverage-v8` — lcov report generation (new, one per service)
- Jenkins plugin: `SonarQube Scanner for Jenkins` (already common on Jenkins LTS)

**Storage**: PostgreSQL — new logical database `fadl_sonar` on the existing PgBouncer
cluster. SonarQube manages its own schema migrations internally (no Flyway needed).

**Testing**: vitest per-service — add `coverage` config to each `vitest.config.ts`;
output: `coverage/lcov.info` relative to service root.

**Target Platform**: Linux/Docker (dev & CI); Kubernetes `fadl-testing` namespace
via SonarSource Helm chart (same cluster as feature branch K8s deploy).

**Project Type**: DevOps / quality tooling addition — no changes to FCMS business logic.

**Performance Goals**:
- Full monorepo scan (15 modules): ≤ 10 min on Jenkins
- PR-triggered incremental scan: ≤ 3 min
- SonarQube server memory: 2 GB heap (stays within Jenkins host capacity)

**Constraints**:
- Community Edition only (no paid SonarSource license required)
- Must not block the existing `Build Images` or `Push` stages on first introduction
- SonarQube token stored as a Jenkins `Secret Text` credential (`sonar-token`);
  never committed to the repo
- `SONAR_TOKEN` and `SONAR_HOST_URL` come from env vars — app fails to scan if absent
- No changes to FCMS service source code beyond adding coverage config to vitest

**Scale/Scope**: 15 modules (~50 K LOC TypeScript), 14 services + 1 Next.js frontend

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Microservice Boundaries | PASS | SonarQube is external tooling; no FCMS service imports from another |
| II. Schema-First (Flyway) | PASS | `fadl_sonar` DB is managed entirely by SonarQube — no Flyway migrations needed |
| III. Zod at Boundaries | N/A | No new FCMS HTTP endpoints introduced |
| IV. UUID PKs | N/A | No new FCMS tables |
| V. Immutable Billing | PASS | No billing tables touched |
| VI. RBAC | N/A | SonarQube has its own user/group model; FCMS RBAC unaffected |
| VII. Bilingual UI | N/A | No FCMS UI changes |
| VIII. No Hardcoded Secrets | PASS | `SONAR_TOKEN` from Jenkins credential; `SONAR_HOST_URL` from env — never hardcoded |
| IX. Status Transitions | N/A | Not applicable |
| X. Design System | N/A | No frontend component changes |

No violations. No Complexity Tracking table needed.

---

## Project Structure

### Documentation (this feature)

```text
specs/002-sonarqube-code-quality/
├── plan.md              ← this file
├── research.md          ← Phase 0 output
├── data-model.md        ← Phase 1 output
├── quickstart.md        ← Phase 1 output
├── contracts/           ← Phase 1 output
│   ├── sonarqube-webhook.md
│   └── jenkins-pipeline-stage.md
└── tasks.md             ← Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
# New files added by this feature
sonar-project.properties          # root multi-module scanner config
docker-compose.sonar.yml          # SonarQube server + DB override
k8s/testing/sonarqube.yaml        # K8s Deployment + Service for SonarQube
infra/sonarqube/
├── create-db.sql                 # CREATE DATABASE fadl_sonar; CREATE USER sonar ...
└── helm-values.yaml              # SonarSource Helm chart overrides

# Modified files
Jenkinsfile                       # add SonarQube Analysis + Quality Gate stages
services/<name>/vitest.config.ts  # add coverage: { reporter: ['lcov'] } (×14)
frontend/web-portal/vitest.config.ts  # same, if vitest used; else jest.config.ts
```

**Structure Decision**: Root `sonar-project.properties` with `sonar.modules` listing
all 15 modules. Each module block sets its own `sonar.sources`, `sonar.tests`, and
`sonar.typescript.lcov.reportPaths`. This avoids 15 separate scanner invocations
and produces a unified project view in SonarQube UI.
