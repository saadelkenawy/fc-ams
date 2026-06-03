# Contract: SonarQube → Jenkins Quality Gate Webhook

**Feature**: 002-sonarqube-code-quality | **Date**: 2026-06-04

---

## Purpose

SonarQube sends an HTTP POST to Jenkins after completing analysis. Jenkins'
`waitForQualityGate()` step polls for this callback to decide whether to pass
or abort the pipeline.

---

## Webhook Configuration (SonarQube Admin)

**Path**: SonarQube UI → Administration → Configuration → Webhooks → Create

| Field | Value |
|---|---|
| Name | `Jenkins-FCMS` |
| URL | `http://<jenkins-host>:8080/sonarqube-webhook/` |
| Secret | (optional) a shared secret stored as Jenkins env var `SONAR_WEBHOOK_SECRET` |

The trailing slash is required by the Jenkins plugin endpoint.

---

## Webhook Payload (SonarQube → Jenkins)

SonarQube sends a JSON POST body:

```json
{
  "serverUrl": "http://sonarqube:9000",
  "taskId": "AXouyxDpoxy3IwnOFghh",
  "status": "SUCCESS",
  "analysedAt": "2026-06-04T10:30:00+0000",
  "changedAt": "2026-06-04T10:30:01+0000",
  "project": {
    "key": "fcms",
    "name": "Fadl Clinic Management System",
    "url": "http://sonarqube:9000/dashboard?id=fcms"
  },
  "branch": {
    "name": "001-modular-architecture-feature-flags",
    "type": "BRANCH",
    "isMain": false,
    "url": "http://sonarqube:9000/dashboard?id=fcms&branch=001-modular-architecture-feature-flags"
  },
  "qualityGate": {
    "name": "FCMS Gate",
    "status": "OK",
    "conditions": [
      {
        "metric": "new_coverage",
        "operator": "LESS_THAN",
        "value": "85.5",
        "status": "OK",
        "errorThreshold": "70"
      },
      {
        "metric": "new_blocker_violations",
        "operator": "GREATER_THAN",
        "value": "0",
        "status": "OK",
        "errorThreshold": "0"
      },
      {
        "metric": "new_critical_violations",
        "operator": "GREATER_THAN",
        "value": "0",
        "status": "OK",
        "errorThreshold": "0"
      }
    ]
  }
}
```

**`qualityGate.status`** values:
- `OK` — gate passed; `waitForQualityGate()` returns, pipeline continues
- `WARN` — gate has warnings (treated as `OK` unless `abortPipeline: true` is set for warn)
- `ERROR` — gate failed; `waitForQualityGate(abortPipeline: true)` aborts the pipeline

---

## Jenkins Pipeline Consumption

```groovy
stage('Quality Gate') {
    steps {
        timeout(time: 5, unit: 'MINUTES') {
            // Polls for the webhook callback; aborts pipeline on ERROR status
            waitForQualityGate abortPipeline: true
        }
    }
}
```

The `timeout` wrapper prevents the stage from hanging indefinitely if SonarQube
fails to send the webhook (e.g., network partition between SonarQube and Jenkins).
