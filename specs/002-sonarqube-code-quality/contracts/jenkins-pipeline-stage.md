# Contract: Jenkins Pipeline SonarQube Stages

**Feature**: 002-sonarqube-code-quality | **Date**: 2026-06-04

---

## Overview

Three new stages are inserted into the existing `Jenkinsfile` between `Detect Changes`
and `Build Images`. The stages are:

1. **Test & Coverage** — runs all service tests with coverage enabled
2. **SonarQube Analysis** — runs `sonar-scanner` with token injected from Jenkins credentials
3. **Quality Gate** — waits for SonarQube webhook callback; aborts pipeline on failure

---

## Stage Insertion Point

```
[existing]  Detect Changes
[NEW]       Test & Coverage
[NEW]       SonarQube Analysis
[NEW]       Quality Gate
[existing]  Build Images
[existing]  Push to Docker Hub
[existing]  Deploy → K8s Testing
...
```

Placing analysis BEFORE image builds ensures broken code never reaches Docker Hub
or the K8s cluster.

---

## Groovy Stage Definitions

```groovy
stage('Test & Coverage') {
    when { expression { env.BUILD_LIST?.trim() } }
    steps {
        // Run tests for all services that changed; generate lcov reports
        // pnpm workspaces run coverage in parallel across changed services only
        script {
            def filters = env.BUILD_LIST.split(';').collect { entry ->
                def ctx = entry.split('\\|')[1]
                "--filter=${ctx.replace('/', '/')}"
            }.join(' ')
            sh "pnpm ${filters} run test --coverage --reporter=verbose"
        }
    }
    post {
        always {
            // Archive coverage HTML reports as build artifacts
            publishHTML(target: [
                allowMissing: true,
                alwaysLinkToLastBuild: false,
                keepAll: false,
                reportDir: 'services/identity-service/coverage',
                reportFiles: 'index.html',
                reportName: 'Coverage Report'
            ])
        }
    }
}

stage('SonarQube Analysis') {
    when { expression { env.BUILD_LIST?.trim() } }
    steps {
        withSonarQubeEnv('SonarQube-FCMS') {
            // SonarQube Scanner tool configured in Jenkins Global Tool Configuration
            // as 'SonarScanner-5' (auto-install from sonarqube.org)
            sh """
                sonar-scanner \
                    -Dsonar.projectVersion=${env.BUILD_TAG} \
                    -Dsonar.branch.name=${env.BRANCH_NAME}
            """
        }
    }
}

stage('Quality Gate') {
    when { expression { env.BUILD_LIST?.trim() } }
    steps {
        timeout(time: 5, unit: 'MINUTES') {
            waitForQualityGate abortPipeline: true
        }
    }
}
```

---

## Jenkins Admin Pre-Requisites

These are one-time setup steps performed by the Jenkins admin before the pipeline
stages will work:

### 1. Install Plugin

- Plugin ID: `sonar`
- Install via: Manage Jenkins → Plugins → Available → "SonarQube Scanner for Jenkins"
- Restart Jenkins after install

### 2. Add SonarQube Server

Manage Jenkins → Configure System → SonarQube servers → Add:

| Field | Value |
|---|---|
| Name | `SonarQube-FCMS` ← must match `withSonarQubeEnv('SonarQube-FCMS')` |
| Server URL | `http://sonarqube:9000` (or the container/service hostname) |
| Server authentication token | Select credential ID `sonar-token` |

### 3. Add SonarQube Token Credential

Manage Jenkins → Credentials → Global → Add Credentials:

| Field | Value |
|---|---|
| Kind | Secret text |
| ID | `sonar-token` |
| Secret | Token generated from SonarQube UI (My Account → Security → Generate Token) |

### 4. Install sonar-scanner Tool

Manage Jenkins → Global Tool Configuration → SonarQube Scanner → Add:

| Field | Value |
|---|---|
| Name | `SonarScanner-5` |
| Install automatically | ✓ from sonarqube.org, version 5.x |

---

## Environment Variables Injected by `withSonarQubeEnv`

When the stage runs, Jenkins automatically sets:
- `SONAR_HOST_URL` — resolved from the server config above
- `SONAR_AUTH_TOKEN` — resolved from the `sonar-token` credential
- `SONAR_SCANNER_OPTS` — JVM options for the scanner

These are NOT stored in the Jenkinsfile or any committed file — they exist only
as process environment variables for the duration of the `withSonarQubeEnv` block.

---

## Quality Gate Abort Behavior

If `waitForQualityGate abortPipeline: true` triggers an abort:
- Build status: `FAILED`
- Docker images are NOT built (stage skipped because prior stage failed)
- Cluster is NOT updated
- Jenkins `post { failure {} }` block runs: prints failure message
- No deploy occurs

This ensures that code violating quality thresholds never reaches the K8s cluster
or Docker Hub.
