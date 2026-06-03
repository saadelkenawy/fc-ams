# Tasks: SonarQube Code Quality Integration

**Input**: Design documents from `/specs/002-sonarqube-code-quality/`

**Sources**: plan.md · research.md · data-model.md · contracts/ · quickstart.md

**Total tasks**: 48 | **User stories**: 4 | **Parallel opportunities**: 20+

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no blocking dependencies)
- **[Story]**: User story label — US1, US2, US3, US4

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create directory structure, environment scaffolding, and gitignore entries
needed by every subsequent phase.

- [x] T001 Create `infra/sonarqube/` directory at repo root
- [x] T002 [P] Create `infra/sonarqube/create-db.sql` — PostgreSQL setup script for `fadl_sonar` database and `sonar` role (see data-model.md §3)
- [ ] T003 [P] Add `SONAR_DB_PASSWORD`, `SONAR_HOST_URL`, `SONAR_TOKEN` entries to `.env.example` with placeholder values and comments
- [x] T004 [P] Add `**/coverage/` and `!**/coverage/.gitkeep` to root `.gitignore` — already present as `coverage/` (matches recursively)

**Checkpoint**: Repo structure ready, env vars documented, coverage dirs gitignored

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core config files that all user story phases depend on — must be complete
before US1–US4 work begins.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Create `docker-compose.sonar.yml` at repo root with `sonarqube:lts-community` service definition, volume mounts, sysctl settings, and `fcms-network` attachment (see data-model.md §4)
- [x] T006 Create `sonar-project.properties` at repo root listing all 15 modules (`sonar.modules=identity-service,appointment-service,patient-service,doctor-service,billing-service,ehr-service,procedure-service,notification-service,ai-chatbot-service,analytics-service,procurement-service,file-service,integration-service,telehealth-service,web-portal`) with per-module `projectBaseDir`, `sources`, `tests`, `typescript.lcov.reportPaths`, and `exclusions` (see data-model.md §2)
- [x] T007 Add `@vitest/coverage-v8` as a dev dependency to each of the 14 services and the frontend via `pnpm add -D @vitest/coverage-v8 --filter @fadl/<name>` (run for each service + `frontend/web-portal`)

**Checkpoint**: Foundation ready — US1 can now start; US2–US4 can be planned in parallel

---

## Phase 3: User Story 1 — SonarQube Server Running (Priority: P1) 🎯 MVP

**Goal**: SonarQube server up, project created, quality gate defined, first manual scan
possible. This is the minimum viable deliverable — proves the pipeline works before
wiring Jenkins.

**Independent Test**: Open `http://localhost:9100`, log in, see project `fcms` listed,
run `sonar-scanner` from the repo root, see green project dashboard

### Implementation for User Story 1

- [ ] T008 [US1] Execute `infra/sonarqube/create-db.sql` against the running PostgreSQL cluster to create `fadl_sonar` database and `sonar` role (`psql -h localhost -p 5432 -U postgres -f infra/sonarqube/create-db.sql`)
- [ ] T009 [US1] Set `vm.max_map_count=524288` and `fs.file-max=131072` on the Docker host (`sudo sysctl -w vm.max_map_count=524288 && sudo sysctl -w fs.file-max=131072`) and persist in `/etc/sysctl.d/99-sonarqube.conf`
- [ ] T010 [US1] Add `SONAR_DB_PASSWORD` to `.env` (local value), then start SonarQube: `docker compose -f docker-compose.yml -f docker-compose.sonar.yml up -d sonarqube` — wait ~90 s and verify `http://localhost:9100` returns 200
- [ ] T011 [US1] Log in to SonarQube UI at `http://localhost:9100` (admin/admin), change admin password, create project manually (Project Key: `fcms`, Project Name: `Fadl Clinic Management System`), generate token named `jenkins-ci`, save token value to `.env` as `SONAR_TOKEN`
- [ ] T012 [US1] Create quality gate `FCMS Gate` in SonarQube UI (Quality Gates → Create) with conditions: new_coverage < 70 % → Error, new_blocker_violations > 0 → Error, new_critical_violations > 0 → Error; set as default gate for project `fcms`

**Checkpoint**: US1 complete — `sonar-scanner -Dsonar.host.url=http://localhost:9100 -Dsonar.token=$SONAR_TOKEN` runs without error; `fcms` project appears on dashboard

---

## Phase 4: User Story 2 — Multi-Module Code Scan (Priority: P2)

**Goal**: All 14 services and the frontend produce lcov coverage reports and appear
as separate modules in the SonarQube dashboard under a single `fcms` project.

**Independent Test**: After `pnpm test --coverage && sonar-scanner`, the SonarQube
dashboard shows 15 modules under `fcms`, each with a coverage metric and 0 new
critical issues

### Implementation for User Story 2

- [x] T013 [US2] Create `services/identity-service/vitest.config.ts` with `coverage: { provider: 'v8', reporter: ['lcov', 'text'], reportsDirectory: './coverage', exclude: ['node_modules/**', 'dist/**', 'src/server.ts', '**/*.d.ts'] }` (template from data-model.md §3)
- [x] T014 [P] [US2] Create `services/appointment-service/vitest.config.ts` using the same coverage template as T013
- [x] T015 [P] [US2] Create `services/patient-service/vitest.config.ts` using the same coverage template
- [x] T016 [P] [US2] Create `services/doctor-service/vitest.config.ts` using the same coverage template
- [x] T017 [P] [US2] Create `services/billing-service/vitest.config.ts` using the same coverage template
- [x] T018 [P] [US2] Create `services/ehr-service/vitest.config.ts` using the same coverage template
- [x] T019 [P] [US2] Create `services/procedure-service/vitest.config.ts` using the same coverage template
- [x] T020 [P] [US2] Create `services/notification-service/vitest.config.ts` using the same coverage template
- [x] T021 [P] [US2] Create `services/ai-chatbot-service/vitest.config.ts` using the same coverage template
- [x] T022 [P] [US2] Create `services/analytics-service/vitest.config.ts` using the same coverage template
- [x] T023 [P] [US2] Create `services/procurement-service/vitest.config.ts` using the same coverage template
- [x] T024 [P] [US2] Create `services/file-service/vitest.config.ts` using the same coverage template
- [x] T025 [P] [US2] Create `services/integration-service/vitest.config.ts` using the same coverage template
- [x] T026 [P] [US2] Create `services/telehealth-service/vitest.config.ts` using the same coverage template
- [x] T027 [P] [US2] Create `frontend/web-portal/vitest.config.ts` with coverage template; set `sonar.sources=src,app,components` and `sonar.exclusions` to include `.next/**,public/**`
- [ ] T028 [US2] Run `pnpm test --coverage` from repo root and verify `coverage/lcov.info` exists under each of the 15 module directories (depends on T013–T027)
- [ ] T029 [US2] Run `sonar-scanner -Dsonar.projectVersion=dev-local` locally and verify SonarQube dashboard shows all 15 modules with coverage data (depends on T028 and US1 complete)

**Checkpoint**: US2 complete — 15 modules visible in SonarQube, coverage tracked per module

---

## Phase 5: User Story 3 — Jenkins CI Quality Gate (Priority: P3)

**Goal**: Every push to Jenkins triggers test + scan + quality gate. A gate failure
blocks `Build Images` — broken code never reaches Docker Hub or the K8s cluster.

**Independent Test**: Push a commit that deliberately lowers coverage below 70 % on
a new file; Jenkins `Quality Gate` stage shows FAILED and the pipeline stops before
`Build Images` runs

### Implementation for User Story 3

- [ ] T030 [US3] Install `SonarQube Scanner for Jenkins` plugin: Jenkins UI → Manage Jenkins → Plugins → Available → search "SonarQube Scanner" → Install and restart
- [ ] T031 [US3] Add SonarQube server in Jenkins: Manage Jenkins → Configure System → SonarQube servers → Add (Name: `SonarQube-FCMS`, URL: `http://sonarqube:9000`, Authentication Token: credential `sonar-token`)
- [ ] T032 [US3] Add `sonar-token` Secret Text credential: Manage Jenkins → Credentials → Global → Add Credentials (Kind: Secret text, ID: `sonar-token`, Secret: token from T011)
- [ ] T033 [US3] Add `SonarScanner-5` tool: Manage Jenkins → Global Tool Configuration → SonarQube Scanner → Add (Name: `SonarScanner-5`, Install automatically from sonarqube.org, version 5.x)
- [x] T034 [US3] Add `Test & Coverage` stage to `Jenkinsfile` immediately after the `Detect Changes` stage, using the Groovy snippet from `contracts/jenkins-pipeline-stage.md` (runs `pnpm test --coverage` only for changed services)
- [x] T035 [US3] Add `SonarQube Analysis` stage to `Jenkinsfile` after `Test & Coverage`, using `withSonarQubeEnv('SonarQube-FCMS')` block with `sonar-scanner -Dsonar.projectVersion=${BUILD_TAG} -Dsonar.branch.name=${BRANCH_NAME}`
- [x] T036 [US3] Add `Quality Gate` stage to `Jenkinsfile` after `SonarQube Analysis`, using `waitForQualityGate abortPipeline: true` wrapped in a 5-minute timeout (see `contracts/jenkins-pipeline-stage.md`)
- [ ] T037 [US3] Configure SonarQube → Jenkins webhook: SonarQube UI → Administration → Configuration → Webhooks → Create (Name: `Jenkins-FCMS`, URL: `http://<jenkins-host>:8080/sonarqube-webhook/`) per `contracts/sonarqube-webhook.md`
- [ ] T038 [US3] Trigger a Jenkins build, monitor the 3 new stages in Blue Ocean / console log, and confirm: `Test & Coverage` archives lcov reports, `SonarQube Analysis` ends with `EXECUTION SUCCESS`, `Quality Gate` shows `PASSED`, pipeline proceeds to `Build Images`

**Checkpoint**: US3 complete — quality gate enforced on every commit; pipeline visibly blocked on gate failure

---

## Phase 6: User Story 4 — Kubernetes Deployment (Priority: P4)

**Goal**: SonarQube runs persistently in the `fadl-testing` K8s namespace, reachable
at `http://sonar.fadl-testing.local`, so the K8s-based CI testing loop uses the
cluster-internal SonarQube instance.

**Independent Test**: `kubectl get pods -n fadl-testing | grep sonarqube` shows
`Running`; `curl http://sonar.fadl-testing.local/api/system/status` returns
`{"status":"UP"}`; Jenkins `SonarQube-FCMS` server URL updated to cluster address
and pipeline still passes quality gate

### Implementation for User Story 4

- [x] T039 [US4] Create `k8s/testing/sonarqube.yaml` containing: `PersistentVolumeClaim` (5 Gi for `/opt/sonarqube/data`), `Deployment` (`sonarqube:lts-community`, env vars from Secret + ConfigMap, sysctl init-container for `vm.max_map_count`), `Service` (ClusterIP, port 9000)
- [x] T040 [P] [US4] Create `infra/sonarqube/helm-values.yaml` with SonarSource Helm chart overrides (edition: community, postgresql.enabled: false, jdbcOverwrite with external PG cluster URL, resource requests/limits: 2 Gi RAM) per research.md §8
- [x] T041 [US4] Add SonarQube routing to `k8s/testing/ingress.yaml`: new `rules` entry for host `sonar.fadl-testing.local` → `sonarqube` Service port 9000
- [ ] T042 [US4] Create `sonarqube-db-secret` Kubernetes Secret in `fadl-testing` namespace: `kubectl create secret generic sonarqube-db-secret -n fadl-testing --from-literal=password=<SONAR_DB_PASSWORD>`
- [ ] T043 [US4] Apply K8s manifests: `kubectl apply -f k8s/testing/sonarqube.yaml -n fadl-testing && kubectl apply -f k8s/testing/ingress.yaml -n fadl-testing`; wait for pod ready: `kubectl rollout status deployment/sonarqube -n fadl-testing --timeout=180s`
- [ ] T044 [US4] Update `SonarQube-FCMS` server URL in Jenkins from `http://sonarqube:9000` (local Docker) to `http://sonarqube.fadl-testing.svc:9000` (K8s cluster-internal); re-run pipeline to confirm quality gate still passes

**Checkpoint**: US4 complete — SonarQube persists on K8s cluster; survives pod restarts; CI uses cluster-internal URL

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Robustness improvements that affect multiple user stories

- [ ] T045 [P] Add `sonar-scanner` install step to `Jenkinsfile` agent initialisation (or Dockerfile for the Jenkins agent image) so the tool is always available without relying on Jenkins Global Tool auto-install
- [ ] T046 [P] Add `sonar-project.properties` maintenance note to `specs/002-sonarqube-code-quality/data-model.md` — document how to add a 16th module when a new service is created
- [ ] T047 [P] Persist SonarQube admin password and `sonar-token` in `CREDENTIALS_SETUP.md` instructions (not values — instructions on where to store them)
- [ ] T048 Run quickstart.md end-to-end from a clean environment to validate all steps; update any steps that need correction

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)          → no dependencies, start immediately
Phase 2 (Foundational)   → depends on Phase 1
Phase 3 (US1)            → depends on Phase 2
Phase 4 (US2)            → depends on Phase 2 + US1 complete (needs running SonarQube)
Phase 5 (US3)            → depends on US2 complete (needs lcov reports + working scan)
Phase 6 (US4)            → depends on US3 complete (needs validated Jenkins integration)
Phase 7 (Polish)         → depends on all US phases
```

### User Story Dependencies

| Story | Depends on | Can run in parallel with |
|---|---|---|
| US1 (P1) | Phase 2 complete | — |
| US2 (P2) | Phase 2 complete + US1 server running | — |
| US3 (P3) | US2 complete | — |
| US4 (P4) | US3 complete (validated pipeline) | — |

US1–US4 form a sequential delivery chain: each story builds directly on the
previous one. However, **within US2**, all 15 vitest config tasks (T013–T027)
are fully parallel — they touch different files with no shared state.

### Within Each Story

- US1: T008 → T009 → T010 → T011 → T012 (sequential — each step unlocks the next)
- US2: T013–T027 fully parallel → T028 (depends on all) → T029 (depends on T028)
- US3: T030 → T031+T032+T033 (parallel) → T034+T035+T036 (parallel) → T037 → T038
- US4: T039+T040 (parallel) → T041 → T042 → T043 → T044

---

## Parallel Execution Examples

### US2: All vitest configs at once (15 files, no conflicts)

```text
Launch in parallel:
  T013  services/identity-service/vitest.config.ts
  T014  services/appointment-service/vitest.config.ts
  T015  services/patient-service/vitest.config.ts
  T016  services/doctor-service/vitest.config.ts
  T017  services/billing-service/vitest.config.ts
  T018  services/ehr-service/vitest.config.ts
  T019  services/procedure-service/vitest.config.ts
  T020  services/notification-service/vitest.config.ts
  T021  services/ai-chatbot-service/vitest.config.ts
  T022  services/analytics-service/vitest.config.ts
  T023  services/procurement-service/vitest.config.ts
  T024  services/file-service/vitest.config.ts
  T025  services/integration-service/vitest.config.ts
  T026  services/telehealth-service/vitest.config.ts
  T027  frontend/web-portal/vitest.config.ts
Then sequentially: T028 (pnpm test --coverage) → T029 (sonar-scanner)
```

### US3: Jenkins admin config tasks (parallel after plugin install)

```text
T030 install plugin (sequential, must complete first)
Then in parallel:
  T031  add SonarQube server config
  T032  add sonar-token credential
  T033  add SonarScanner-5 tool
Then in parallel:
  T034  add Test & Coverage stage to Jenkinsfile
  T035  add SonarQube Analysis stage to Jenkinsfile
  T036  add Quality Gate stage to Jenkinsfile
Then T037 (webhook) → T038 (trigger build and verify)
```

---

## Implementation Strategy

### MVP First (US1 + US2 only)

1. Complete Phase 1: Setup (T001–T004)
2. Complete Phase 2: Foundational (T005–T007)
3. Complete US1: Server running (T008–T012)
4. Complete US2: All modules scanned (T013–T029)
5. **STOP and VALIDATE**: SonarQube dashboard shows all 15 modules with real metrics
6. Demo to team before wiring Jenkins

### Incremental Delivery

```
Phase 1–2 + US1  →  SonarQube server live, manual scan works
+ US2            →  All modules tracked, coverage visible
+ US3            →  Jenkins enforces quality gate on every commit
+ US4            →  SonarQube persists in K8s cluster
+ Phase 7        →  Polish and documentation
```

### Parallel Team Strategy (2 developers)

Once Phase 1–2 are done and US1 is complete:

```
Dev A: US2 vitest configs (T013–T027) — 15 files, fully independent
Dev B: US3 Jenkins admin setup (T030–T033) — UI config tasks
→ Sync: Dev A runs T028–T029; Dev B runs T034–T036
→ Together: T037–T038 end-to-end pipeline validation
```

---

## Task Count Summary

| Phase | Tasks | Parallel |
|---|---|---|
| Phase 1: Setup | 4 | 3 |
| Phase 2: Foundational | 3 | 0 |
| Phase 3: US1 Server | 5 | 0 |
| Phase 4: US2 Scan | 17 | 15 |
| Phase 5: US3 Jenkins | 9 | 7 |
| Phase 6: US4 K8s | 6 | 2 |
| Phase 7: Polish | 4 | 3 |
| **Total** | **48** | **30** |
