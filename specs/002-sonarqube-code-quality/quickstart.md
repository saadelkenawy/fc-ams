# Quickstart: SonarQube Code Quality Integration

**Feature**: 002-sonarqube-code-quality | **Date**: 2026-06-04

---

## Prerequisites

- Docker and Docker Compose installed on your machine
- Jenkins running at `http://localhost:8080` with admin access
- PostgreSQL cluster accessible (same one used by FCMS services)
- `pnpm` installed

---

## Step 1: Create the SonarQube Database

Run once against your PostgreSQL cluster:

```bash
# Replace the password with a value you'll put in .env
psql -h localhost -p 5432 -U postgres \
  -v sonar_password="changeme_sonar" \
  -f infra/sonarqube/create-db.sql
```

---

## Step 2: Add Environment Variables

Append to your `.env` file (never commit this):

```bash
SONAR_DB_PASSWORD=changeme_sonar
SONAR_HOST_URL=http://localhost:9000
SONAR_TOKEN=<generated in step 5 below>
```

---

## Step 3: Start SonarQube

```bash
docker compose -f docker-compose.yml -f docker-compose.sonar.yml up -d sonarqube
```

Wait ~60 seconds for SonarQube to initialize, then open http://localhost:9000.
Default credentials: `admin` / `admin` (change immediately on first login).

---

## Step 4: Create the FCMS Project in SonarQube

1. Log in at http://localhost:9000
2. Create Project → Manually
3. Project Key: `fcms`
4. Project Name: `Fadl Clinic Management System`
5. Set up analysis method: **Locally** (we use `sonar-scanner` CLI)

---

## Step 5: Generate a SonarQube Token

1. Click your avatar (top-right) → My Account → Security
2. Generate Tokens → Name: `jenkins-ci` → Type: `Global Analysis Token`
3. Copy the token and add it to `.env` as `SONAR_TOKEN=<token>`
4. Also add it to Jenkins: Credentials → Global → Add → Secret Text → ID: `sonar-token`

---

## Step 6: Configure the Quality Gate

1. SonarQube UI → Quality Gates → Create → Name: `FCMS Gate`
2. Add conditions:
   - Coverage on new code: is less than `70` → Error
   - Blocker issues on new code: is greater than `0` → Error
   - Critical issues on new code: is greater than `0` → Error
3. Set as default quality gate for project `fcms`

---

## Step 7: Run a Local Scan

```bash
# Generate coverage reports first
pnpm test --coverage

# Run sonar-scanner (must be installed: brew install sonar-scanner or npm i -g sonar-scanner)
SONAR_HOST_URL=http://localhost:9000 \
SONAR_TOKEN=$SONAR_TOKEN \
sonar-scanner -Dsonar.projectVersion=local-dev
```

Results appear at http://localhost:9000/dashboard?id=fcms in ~2 minutes.

---

## Step 8: Configure Jenkins

Follow the Jenkins Admin Pre-Requisites in
[contracts/jenkins-pipeline-stage.md](./contracts/jenkins-pipeline-stage.md):

1. Install `SonarQube Scanner for Jenkins` plugin
2. Add SonarQube server config (name: `SonarQube-FCMS`, URL: `http://sonarqube:9000`)
3. Add `sonar-token` credential (Secret Text)
4. Add `SonarScanner-5` tool (auto-install)
5. Add the webhook in SonarQube: Administration → Webhooks → `http://<jenkins-host>:8080/sonarqube-webhook/`

After these steps, the next push to any branch triggers full quality analysis
before images are built.

---

## Verify It's Working

After Jenkins runs a build with the new stages:

1. **Test & Coverage** stage: passes and archives coverage HTML
2. **SonarQube Analysis** stage: `sonar-scanner` output ends with `EXECUTION SUCCESS`
3. **Quality Gate** stage: shows `PASSED` and pipeline continues to `Build Images`
4. SonarQube dashboard: http://sonarqube:9000/dashboard?id=fcms shows green gate

If the Quality Gate stage shows `FAILED`:
- Check SonarQube → Project → Issues for new bugs/vulnerabilities
- Check coverage: run `pnpm test --coverage` locally to see which files lack tests
