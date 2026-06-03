# Data Model: SonarQube Code Quality Integration

**Feature**: 002-sonarqube-code-quality | **Date**: 2026-06-04

---

## Overview

No new FCMS database tables are added. The data model for this feature consists of:
1. A new PostgreSQL database (`fadl_sonar`) managed by SonarQube internally
2. Configuration file schemas (`sonar-project.properties`, `vitest.config.ts` coverage block)
3. Coverage artifact layout produced by each service's test run

---

## 1. SonarQube Database

**Database**: `fadl_sonar` (PostgreSQL 16, same cluster as FCMS services)

**Owner role**: `sonar` (LOGIN, password from `SONAR_DB_PASSWORD` env var)

SonarQube bootstraps its own schema on first startup. The FCMS team has no
direct access to these tables — all reads/writes go through the SonarQube API.

Setup SQL (`infra/sonarqube/create-db.sql`):
```sql
CREATE USER sonar WITH PASSWORD :'sonar_password';
CREATE DATABASE fadl_sonar OWNER sonar ENCODING 'UTF8';
GRANT ALL PRIVILEGES ON DATABASE fadl_sonar TO sonar;
```

---

## 2. Root Scanner Configuration (`sonar-project.properties`)

This file lives at the repo root and is the single source of truth for how the
monorepo is presented to SonarQube.

```properties
# ── Global ──────────────────────────────────────────────────────────────────
sonar.projectKey=fcms
sonar.projectName=Fadl Clinic Management System
sonar.projectVersion=1.0
sonar.sourceEncoding=UTF-8

# ── Module list ─────────────────────────────────────────────────────────────
sonar.modules=\
  identity-service,\
  appointment-service,\
  patient-service,\
  doctor-service,\
  billing-service,\
  ehr-service,\
  procedure-service,\
  notification-service,\
  ai-chatbot-service,\
  analytics-service,\
  procurement-service,\
  file-service,\
  integration-service,\
  telehealth-service,\
  web-portal

# ── Per-module overrides (same pattern for all 14 services) ─────────────────
identity-service.sonar.projectName=Identity Service
identity-service.sonar.projectBaseDir=services/identity-service
identity-service.sonar.sources=src
identity-service.sonar.tests=src
identity-service.sonar.test.inclusions=**/*.test.ts,**/*.spec.ts
identity-service.sonar.typescript.lcov.reportPaths=coverage/lcov.info
identity-service.sonar.exclusions=node_modules/**,dist/**,coverage/**

# (repeat pattern for all other services)
# appointment-service.sonar.projectBaseDir=services/appointment-service
# ...

# ── Frontend ─────────────────────────────────────────────────────────────────
web-portal.sonar.projectName=Web Portal
web-portal.sonar.projectBaseDir=frontend/web-portal
web-portal.sonar.sources=src,app,components
web-portal.sonar.tests=src,app,components
web-portal.sonar.test.inclusions=**/*.test.tsx,**/*.test.ts,**/*.spec.tsx,**/*.spec.ts
web-portal.sonar.typescript.lcov.reportPaths=coverage/lcov.info
web-portal.sonar.exclusions=node_modules/**,.next/**,coverage/**,public/**
```

**Field constraints**:
- `sonar.projectKey`: globally unique on the SonarQube server; convention `fcms`
- Module keys (used internally): `fcms:identity-service`, `fcms:web-portal`, etc.
- `sonar.sources` paths are relative to `sonar.projectBaseDir`

---

## 3. Coverage Configuration (`vitest.config.ts` additions)

Each service's `vitest.config.ts` gains a `coverage` block. Template:

```typescript
// services/<name>-service/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // ... existing config ...
    coverage: {
      provider: 'v8',
      reporter: ['lcov', 'text'],   // lcov → coverage/lcov.info
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/**',
        'dist/**',
        'src/server.ts',            // entry point, not unit-testable
        '**/*.d.ts',
      ],
    },
  },
});
```

**Output artifact**:
```
services/<name>-service/
└── coverage/
    ├── lcov.info       ← consumed by sonar-scanner
    └── index.html      ← local HTML report (gitignored)
```

**`.gitignore` additions** (repo root):
```
**/coverage/
!**/coverage/.gitkeep
```

---

## 4. Docker Compose Override (`docker-compose.sonar.yml`)

```yaml
version: '3.9'

services:
  sonarqube:
    image: sonarqube:lts-community
    container_name: fcms-sonarqube
    depends_on:
      - postgres
    environment:
      SONAR_JDBC_URL: jdbc:postgresql://postgres:5432/fadl_sonar
      SONAR_JDBC_USERNAME: sonar
      SONAR_JDBC_PASSWORD: ${SONAR_DB_PASSWORD}
    volumes:
      - sonarqube_data:/opt/sonarqube/data
      - sonarqube_extensions:/opt/sonarqube/extensions
      - sonarqube_logs:/opt/sonarqube/logs
    ports:
      - "9000:9000"
    ulimits:
      nofile:
        soft: 131072
        hard: 131072
    sysctls:
      vm.max_map_count: 524288
    networks:
      - fcms-network
    restart: unless-stopped

volumes:
  sonarqube_data:
  sonarqube_extensions:
  sonarqube_logs:
```

**Usage**:
```bash
# Start SonarQube alongside FCMS services
docker compose -f docker-compose.yml -f docker-compose.sonar.yml up -d sonarqube
```

---

## 5. Environment Variables

| Variable | Where set | Purpose |
|---|---|---|
| `SONAR_HOST_URL` | Jenkins credential / `.env.local` | URL to SonarQube server |
| `SONAR_TOKEN` | Jenkins secret-text `sonar-token` | Authentication token |
| `SONAR_DB_PASSWORD` | `.env` (gitignored) | SonarQube DB password |

No FCMS service environment variables are modified.

---

## 6. Coverage Artifact Layout (runtime)

After `pnpm test --coverage` runs across all services:

```
services/
├── identity-service/coverage/lcov.info
├── appointment-service/coverage/lcov.info
├── patient-service/coverage/lcov.info
├── doctor-service/coverage/lcov.info
├── billing-service/coverage/lcov.info
├── ehr-service/coverage/lcov.info
├── procedure-service/coverage/lcov.info
├── notification-service/coverage/lcov.info
├── ai-chatbot-service/coverage/lcov.info
├── analytics-service/coverage/lcov.info
├── procurement-service/coverage/lcov.info
├── file-service/coverage/lcov.info
├── integration-service/coverage/lcov.info
└── telehealth-service/coverage/lcov.info

frontend/web-portal/coverage/lcov.info
```

`sonar-scanner` reads these paths from `sonar-project.properties`
(`sonar.typescript.lcov.reportPaths=coverage/lcov.info` relative to each module's
`projectBaseDir`). If a service has no tests yet, sonar-scanner warns but does not
fail — the quality gate evaluates **new** code coverage only.
