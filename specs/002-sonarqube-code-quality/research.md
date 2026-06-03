# Research: SonarQube Code Quality Integration

**Feature**: 002-sonarqube-code-quality | **Date**: 2026-06-04

---

## 1. SonarQube Edition Choice

**Decision**: Community Edition (free, open-source)

**Rationale**: Community Edition supports TypeScript/JavaScript analysis, lcov
coverage ingestion, quality gates, and multi-module projects — all requirements
for FCMS. Developer/Enterprise editions add branch analysis and pull-request
decoration, which require a paid license and are not needed in Phase 1.

**Alternatives considered**:
- SonarCloud (SaaS) — rejected: requires public repo or paid plan; FCMS is private
- Developer Edition — rejected: paid license not justified for internal tooling at this stage

---

## 2. SonarQube Docker Deployment Strategy

**Decision**: `sonarqube:lts-community` container added to `docker-compose.sonar.yml`
(override file, not the main compose). For K8s: SonarSource official Helm chart.

**Rationale**: Keeping SonarQube in a separate override file means `pnpm docker:up`
(the normal dev workflow) does not start SonarQube by default — devs opt in with
`docker compose -f docker-compose.yml -f docker-compose.sonar.yml up -d sonarqube`.
This avoids adding 2 GB RAM overhead to every local dev session.

**Configuration notes**:
- `SONAR_JDBC_URL=jdbc:postgresql://postgres:5432/fadl_sonar`
- `SONAR_JDBC_USERNAME=sonar` / `SONAR_JDBC_PASSWORD` from `.env`
- Data volume: `sonarqube_data`, `sonarqube_extensions`, `sonarqube_logs`
- Port: 9000 (internal and host)
- `vm.max_map_count=524288` and `fs.file-max=131072` required on the host
  (set via sysctl in docker-compose or Jenkins agent init)

**Alternatives considered**:
- Embed in main `docker-compose.yml` — rejected: adds memory overhead for all devs
- Run on bare metal — rejected: no isolation, harder to upgrade

---

## 3. PostgreSQL Database for SonarQube

**Decision**: New logical database `fadl_sonar` on the existing PostgreSQL cluster.
New role `sonar` with CREATEDB + LOGIN privileges.

**Rationale**: FCMS already runs a PostgreSQL cluster (PgBouncer → Postgres 16).
Adding a database reuses existing infra without a second PostgreSQL instance.

**Setup script**: `infra/sonarqube/create-db.sql` — run once manually:
```sql
CREATE USER sonar WITH PASSWORD '${SONAR_DB_PASSWORD}';
CREATE DATABASE fadl_sonar OWNER sonar;
GRANT ALL PRIVILEGES ON DATABASE fadl_sonar TO sonar;
```

**Note**: SonarQube connects directly (bypassing PgBouncer) because it uses
prepared statements incompatible with PgBouncer's transaction-pooling mode.
Use `SONAR_JDBC_URL=jdbc:postgresql://postgres:5432/fadl_sonar` with direct
host/port, not the PgBouncer endpoint.

---

## 4. Multi-Module Monorepo Scanner Config

**Decision**: Single root `sonar-project.properties` with `sonar.modules` listing
all 15 modules. One `sonar-scanner` invocation per Jenkins build.

**Rationale**: SonarQube multi-module projects aggregate results into one dashboard
and one quality gate. This is simpler to maintain than 15 separate projects and
gives a unified view of the whole system.

**Module key convention**: `fcms:<service-name>` (e.g., `fcms:identity-service`,
`fcms:web-portal`).

**Alternatives considered**:
- 15 separate SonarQube projects — rejected: no aggregate view, 15× webhook overhead
- One project, merged sources — rejected: misleading coverage aggregation

---

## 5. Coverage Reporting Strategy

**Decision**: `@vitest/coverage-v8` for all 14 services; configure
`coverage.reporter: ['lcov', 'text']` in each service's `vitest.config.ts`.
Output path: `coverage/lcov.info` (vitest default under `coverage/`).

**Rationale**: `coverage-v8` uses Node's built-in V8 coverage engine — faster than
Istanbul and no additional instrumentation. lcov is the only format SonarQube reads
for TypeScript coverage (`sonar.typescript.lcov.reportPaths`).

**Frontend (Next.js)**: `@vitest/coverage-v8` with `vitest` configured in
`frontend/web-portal/vitest.config.ts`; lcov output at
`frontend/web-portal/coverage/lcov.info`.

**CI integration**: `pnpm test --coverage` must be added as a step BEFORE the
`SonarQube Analysis` stage in Jenkinsfile so coverage reports exist on disk.

**Alternatives considered**:
- `@vitest/coverage-istanbul` — valid alternative; rejected to avoid extra dep
- Jest (for frontend) — Next.js uses Jest by default but the project uses vitest
  per the existing pattern; staying consistent

---

## 6. Jenkins Integration

**Decision**: Use the `SonarQube Scanner for Jenkins` plugin (pipeline DSL:
`withSonarQubeEnv()` + `waitForQualityGate()`).

**Rationale**: The plugin handles token injection, server URL injection, and
quality gate webhook polling natively. Zero extra shell scripting needed.

**Jenkins configuration required** (one-time admin setup):
1. Install plugin: `SonarQube Scanner for Jenkins` (available in Jenkins Update Center)
2. Add SonarQube server: Manage Jenkins → Configure System → SonarQube servers
   - Name: `SonarQube-FCMS`
   - URL: `http://sonarqube:9000` (if Jenkins runs in same Docker network)
   - Token: credential ID `sonar-token` (Secret Text)
3. Install sonar-scanner: Manage Jenkins → Global Tool Configuration → SonarQube Scanner
   - Name: `SonarScanner-5`
   - Auto-install from sonarqube.org

**Pipeline stages to add** (after `Build Images`, before `Deploy`):
```groovy
stage('Test & Coverage') {
    steps { sh 'pnpm test --coverage --reporter=verbose' }
}
stage('SonarQube Analysis') {
    steps {
        withSonarQubeEnv('SonarQube-FCMS') {
            sh 'sonar-scanner -Dsonar.projectVersion=$BUILD_TAG'
        }
    }
}
stage('Quality Gate') {
    steps {
        timeout(time: 5, unit: 'MINUTES') {
            waitForQualityGate abortPipeline: true
        }
    }
}
```

---

## 7. Quality Gate Thresholds

**Decision**: Default SonarQube "Sonar way" gate with one override:
new-code coverage minimum raised from 80 % to 70 % for Phase 1 (many services
have no tests yet; stricter gates introduced incrementally).

| Metric | Threshold |
|---|---|
| New code coverage | ≥ 70 % |
| New critical/blocker issues | 0 |
| New bugs | 0 |
| New security vulnerabilities | 0 |
| New code duplication | < 3 % |

**Phase 2 target** (once test coverage backfill is done): raise to 80 %.

---

## 8. Kubernetes Deployment

**Decision**: SonarSource official Helm chart (`sonarqube/sonarqube`) with custom
`helm-values.yaml` targeting the `fadl-testing` namespace.

**Key overrides**:
```yaml
edition: community
postgresql:
  enabled: false          # use external PG cluster
jdbcOverwrite:
  enable: true
  jdbcUrl: "jdbc:postgresql://postgres.fadl-testing.svc:5432/fadl_sonar"
  jdbcUsername: sonar
  jdbcSecretName: sonarqube-db-secret
```

SonarQube runs on port 9000 with a `ClusterIP` Service; exposed via Ingress at
`sonar.fadl-testing.local`.
