# Contract: Kubernetes Topology (fadl-testing)

**Namespace**: `fadl-testing`
**Cluster**: testing (mirrors `fadl-prod` topology at reduced scale)

---

## Deployment Pattern (per service)

```yaml
# template — substitute <name>, <port>, <module>
apiVersion: apps/v1
kind: Deployment
metadata:
  name: <name>-service
  namespace: fadl-testing
spec:
  replicas: 1
  selector:
    matchLabels: { app: <name>-service }
  template:
    metadata:
      labels: { app: <name>-service }
    spec:
      containers:
        - name: <name>-service
          image: fadl/<name>-service:latest
          ports: [{ containerPort: <port> }]
          envFrom:
            - secretRef: { name: fcms-secrets }
            - configMapRef: { name: fcms-feature-flags }
          readinessProbe:
            httpGet: { path: /health, port: <port> }
            initialDelaySeconds: 5
            periodSeconds: 10
          resources:
            requests: { cpu: 50m, memory: 128Mi }
            limits:   { cpu: 500m, memory: 512Mi }
---
apiVersion: v1
kind: Service
metadata:
  name: <name>-service
  namespace: fadl-testing
spec:
  selector: { app: <name>-service }
  ports: [{ port: <port>, targetPort: <port> }]
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: <name>-service
  namespace: fadl-testing
spec:
  scaleTargetRef: { apiVersion: apps/v1, kind: Deployment, name: <name>-service }
  minReplicas: 1
  maxReplicas: 3
  metrics:
    - type: Resource
      resource: { name: cpu, target: { type: Utilization, averageUtilization: 70 } }
```

---

## ConfigMap: fcms-feature-flags

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: fcms-feature-flags
  namespace: fadl-testing
data:
  FEATURE_FLAGS_JSON: |
    {
      "basic":    ["patients","scheduling"],
      "standard": ["patients","scheduling","billing","settlements","ehr"],
      "premium":  ["patients","scheduling","billing","settlements","ehr","ai","analytics","telehealth","procurement","integrations"]
    }
  DEFAULT_TIER: "premium"
```

---

## Secret: fcms-secrets

Must be created out-of-band (not checked in):

```
kubectl create secret generic fcms-secrets \
  --from-literal=JWT_SECRET=<value> \
  --from-literal=DEVELOPER_UNLOCK_SECRET=<value> \
  --from-literal=DATABASE_URL=<value> \
  --from-literal=REDIS_URL=redis://redis-svc:6379 \
  -n fadl-testing
```

---

## Ingress

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: fcms-ingress
  namespace: fadl-testing
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /$2
spec:
  ingressClassName: nginx
  rules:
    - host: fcms-test.internal
      http:
        paths:
          - path: /api/identity(/|$)(.*)
            pathType: Prefix
            backend: { service: { name: identity-service,     port: { number: 3000 } } }
          - path: /api/appointments(/|$)(.*)
            pathType: Prefix
            backend: { service: { name: appointment-service,  port: { number: 3001 } } }
          - path: /api/patients(/|$)(.*)
            pathType: Prefix
            backend: { service: { name: patient-service,      port: { number: 3002 } } }
          - path: /api/billing(/|$)(.*)
            pathType: Prefix
            backend: { service: { name: billing-service,      port: { number: 3004 } } }
          - path: /api/analytics(/|$)(.*)
            pathType: Prefix
            backend: { service: { name: analytics-service,    port: { number: 3009 } } }
          - path: /(/|$)(.*)
            pathType: Prefix
            backend: { service: { name: web-portal,           port: { number: 3000 } } }
```

---

## Service Registry (all 14)

| Service | Port | Module |
|---|---|---|
| identity-service | 3000 | core |
| appointment-service | 3001 | scheduling |
| patient-service | 3002 | patients |
| doctor-service | 3003 | core |
| billing-service | 3004 | billing / settlements |
| ehr-service | 3005 | ehr |
| procedure-service | 3006 | core |
| notification-service | 3007 | core |
| ai-chatbot-service | 3008 | ai |
| analytics-service | 3009 | analytics |
| procurement-service | 3010 | procurement |
| file-service | 3011 | core |
| integration-service | 3012 | integrations |
| telehealth-service | 3013 | telehealth |
| web-portal (frontend) | 3000 (pod) | — |
