# 🏥 Fadl Clinic (فضل كلينك) — Claude Project Plan

> **Document Version:** 2.1  
> **Last Updated:** 2026-05-02  
> **Status:** Planning Complete — All Decisions Confirmed — Awaiting Phase Zero Kickoff  
> **Maintained by:** Claude (updated automatically with every new request or change)

---

## 📋 Project Overview

| Field | Details |
|---|---|
| **Project Name** | Fadl Clinic Management System |
| **Arabic Name** | نظام إدارة فضل كلينك |
| **Client** | Fadl Clinic (فضل كلينك) |
| **Logo** | Deep red heart with crimson/black gradient |
| **Primary Colors** | Deep Red `#B71C1C` · Dark Crimson `#7B0000` |
| **Platform** | Web + iOS + Android + Admin Web Portal |
| **Deployment** | Red Hat OpenShift Container Platform (OCP) |
| **Languages** | Arabic (Primary) + English (Primary) — Full RTL Support |
| **Current System** | Excel-based (.xlsm) — to be fully replaced |
| **Architecture** | Domain-Driven Microservices (13 services) |
| **Service Mesh** | OpenShift Service Mesh (Istio) with mTLS |
| **Compliance** | Egypt Data Protection Law No. 151/2020 · HIPAA baseline · GDPR-ready |

---

## 🎯 Project Goals

- Replace the current Excel-based clinic management workflow with a fully digital, AI-powered platform
- Digitize appointment scheduling, doctor revenue splits, patient tracking, billing, and reporting
- Support 30+ medical specialties operating under one clinic brand
- Provide mobile access for patients (iOS & Android) and admin staff
- Deploy on OpenShift with enterprise-grade HA, observability, and security
- Support bilingual (Arabic + English) operations across all interfaces
- Scale horizontally from single clinic to multi-branch in the future

---

## 🏗️ Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                Red Hat OpenShift Container Platform               │
│                                                                    │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────────────┐   │
│  │ React + TS │  │  13 Domain │  │   OpenShift Service Mesh  │   │
│  │  Web App   │  │  Microsvcs │  │   (Istio + mTLS)          │   │
│  └────────────┘  └────────────┘  └──────────────────────────┘   │
│                                                                    │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌──────────┐  │
│  │ PostgreSQL │  │  MongoDB   │  │   Redis    │  │  Kafka / │  │
│  │ HA Cluster │  │ Replica Set│  │  Cluster   │  │ RabbitMQ │  │
│  └────────────┘  └────────────┘  └────────────┘  └──────────┘  │
│                                                                    │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌──────────┐  │
│  │   React    │  │ Prometheus │  │    Loki    │  │  Jaeger  │  │
│  │   Native   │  │ + Grafana  │  │  + Grafana │  │  /Tempo  │  │
│  └────────────┘  └────────────┘  └────────────┘  └──────────┘  │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │  Tekton Pipelines · ArgoCD (GitOps) · HashiCorp Vault        ││
│  │  3scale API Gateway · OpenShift AI · Knative Serverless      ││
│  └──────────────────────────────────────────────────────────────┘│
│                                                                    │
│  Namespaces: fadl-dev | fadl-staging | fadl-prod | fadl-migration │
└──────────────────────────────────────────────────────────────────┘
```

---

## 🧩 Microservices Decomposition (13 Services)

```
┌─ identity-service          → Keycloak / OpenShift SSO, RBAC, MFA
├─ patient-service           → Registration, profiles, mobile as primary ID
├─ appointment-service       → Scheduling, slots, queues, 2-hour rule
├─ doctor-service            → Profiles, revenue splits, payment prefs
├─ billing-service           → Transactions, source fees, immutable ledger
├─ ehr-service               → Medical records, prescriptions, FHIR R4
├─ procedure-service         → Catalogue, pricing per specialty/doctor
├─ notification-service      → SMS, WhatsApp, Push, Email, bilingual
├─ telehealth-service        → WebRTC video, Onl_ doctor logic
├─ analytics-service         → KPIs, reports, predictive models
├─ ai-chatbot-service        → NLP triage, TF/PyTorch, medical protocols
├─ integration-service       → Vizita, Ekshf, CliniDo, InstaPay, labs
└─ file-service              → DICOM imaging, encrypted document storage
```

**Communication:**
- **Sync:** Service Mesh (gRPC/REST) for real-time operations
- **Async:** Apache Kafka / RabbitMQ for events (appointments, billing, notifications)

---

## 🧱 Technology Stack

### Frontend
| Layer | Technology |
|---|---|
| Web Framework | React + TypeScript |
| Mobile | React Native (Phase 4) — native modules for video if needed |
| i18n / Multi-language | i18next (Arabic RTL + English LTR) |
| UI Design | Fadl Clinic Brand — Deep Red `#B71C1C` / Crimson `#7B0000` |

### Backend
| Layer | Technology |
|---|---|
| Microservices | Node.js or Java Spring Boot (TBD at Phase 1) |
| API Style | REST + gRPC via Service Mesh + WebSocket |
| Async Messaging | Apache Kafka / RabbitMQ |
| Authentication | Keycloak / OpenShift SSO + JWT + MFA |
| Secrets | HashiCorp Vault on OpenShift |
| API Gateway | 3scale (OpenShift API Management) |
| Search | Elasticsearch |

### Databases (Highly Available)
| Database | HA Strategy | Backup |
|---|---|---|
| PostgreSQL | Crunchy Data Operator or Patroni + PgBouncer | WAL-G → S3-compatible; PITR; monthly restore test |
| MongoDB | Percona Operator — Replica Set 3+ nodes | Percona Backup → object storage |
| Redis | Redis Cluster or Redis Sentinel | RDB + AOF snapshots to PV |
| Object Storage | ODF Noobaa / Ceph — multi-zone | 3-2-1 strategy; cross-region DR |

### Infrastructure & DevOps (OpenShift-Native)
| Component | OpenShift Implementation |
|---|---|
| Orchestration | Kubernetes Deployments + HPA + VPA + KEDA |
| Ingress | OpenShift Routes — TLS Edge/Pass-through |
| Serverless | OpenShift Serverless (Knative) — chatbot + burst traffic |
| Service Mesh | OpenShift Service Mesh (Istio) — mTLS, traffic mgmt |
| API Management | OpenShift API Management (3scale) |
| CI/CD | OpenShift Pipelines (Tekton) + OpenShift GitOps (ArgoCD + ApplicationSets) |
| Storage | OpenShift Data Foundation (ODF) — Ceph PVCs |
| AI/ML | OpenShift AI / Open Data Hub |
| Monitoring | Prometheus + Grafana + Alertmanager |
| Logging | Loki + Grafana (preferred) or EFK Stack |
| Tracing | Jaeger/Tempo + OpenShift Distributed Tracing |
| Security | Compliance Operator + Falco + Quay image scanning (Clair) |
| Multi-Cluster | OpenShift ACM (future multi-branch) |
| Push Notifications | Firebase Cloud Messaging |

---

## 🔱 Git Branching Strategy

Every module, service, and feature lives in its own isolated branch. This enables parallel development, clean PRs, and safe merging into production.

### Branch Structure
```
main                              ← Production-ready only (protected)
│
├── develop                       ← Integration branch (all features merge here)
│
├── phase/phase-0-migration       ← Phase 0: Excel migration pipeline
├── phase/phase-1-core            ← Phase 1: Core platform
├── phase/phase-2-financial       ← Phase 2: Financial engine + EHR
├── phase/phase-3-ai              ← Phase 3: AI chatbot + Analytics
├── phase/phase-4-mobile          ← Phase 4: Mobile apps
├── phase/phase-5-integrations    ← Phase 5: Third-party integrations
├── phase/phase-6-security        ← Phase 6: Security hardening
├── phase/phase-7-performance     ← Phase 7: Performance + multi-branch
│
├── service/identity-service
├── service/patient-service
├── service/appointment-service
├── service/doctor-service
├── service/billing-service
├── service/ehr-service
├── service/procedure-service
├── service/notification-service
├── service/telehealth-service
├── service/analytics-service
├── service/ai-chatbot-service
├── service/integration-service
├── service/file-service
│
├── infra/openshift-setup         ← Namespaces, operators, RBAC
├── infra/databases               ← PostgreSQL HA, MongoDB, Redis configs
├── infra/cicd-pipelines          ← Tekton + ArgoCD ApplicationSets
├── infra/observability           ← Prometheus, Grafana, Loki, Jaeger
├── infra/security                ← Vault, NetworkPolicies, Compliance Operator
│
├── frontend/web-portal           ← React + TypeScript web app
├── frontend/patient-mobile       ← React Native patient app
├── frontend/admin-mobile         ← React Native admin app
├── frontend/doctor-mobile        ← React Native doctor app (NEW)
│
└── feature/<FAD-ticket>-<desc>   ← Short-lived feature branches
    └── e.g. feature/FAD-001-appointment-status-workflow
```

### Branch Rules
| Rule | Detail |
|---|---|
| `main` | Protected — PRs only from `develop`; requires 2 approvals + full CI pass |
| `develop` | Protected — PRs from `service/*`, `phase/*`, `frontend/*`; 1 approval |
| `service/*` | One branch per microservice; merges into `develop` |
| `feature/*` | Short-lived; named `feature/FAD-<ticket>-<desc>`; merges into service or phase branch |
| Commit Style | Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:` |
| PR Template | Must include: what changed, how tested, linked ticket number |

---

## 📦 Modules

### Module 1 — Multi-Specialty Appointment & Scheduling
**Branch:** `service/appointment-service`

- 30+ specialties with specialty-specific booking rules (IVF cycle-day, surgery linked, dentistry chair-time, pediatric vaccination)
- Patient registration — mobile number as primary ID; national ID linkage
- **Appointment Status Workflow:**
  ```
  TBC! → Ok! → Conf. → Comp.
                ↘ Canc. / Resch. / Inf.
  ```
- Two-hour rule: auto-SMS/WhatsApp at TBC; escalate to receptionist if no confirm in 2h; auto-cancel and promote waiting list
- Queue management: real-time per doctor; priority: Emergency > Appointment > Walk-in; SMS alert for doctor delays >15 min
- Reschedule: moves booking, resets to TBC!, triggers new confirmation cycle
- Waiting lists per doctor per day with automatic promotion
- Online consultations (Onl_ prefix doctors — separate revenue split)
- Telehealth video integration
- Calendar views: per doctor · per specialty · clinic-wide

---

### Module 2 — Doctor Management & Revenue Split Engine
**Branch:** `service/doctor-service`
> Replaces the `Dr_Data` Excel sheet

- Doctor profiles: mobile, specialty, payment preferences (encrypted in Vault)
- **Revenue Splits:**
  | Type | Doctor % | Clinic % |
  |---|---|---|
  | Standard Consultation | 50% | 50% |
  | Operative Procedure | 80% | 20% |
  | Online Consultation | 70% | 30% |
  | Custom per doctor | Variable | Variable |
- Payment methods: Cash · InstaPay · Bank Transfer · VFC Wallet · Mobile Wallet
- **Settlement Lifecycle:** Pending → Verified → Approved → Paid → Reconciled
- Immutable ledger: event-sourced; compensating transactions for refunds
- Auto-calculate earnings per completed procedure
- Full settlement history and audit trail

---

### Module 3 — Electronic Health Records (EHR)
**Branch:** `service/ehr-service`

- Centralized records linked by mobile + national ID
- Medical history, diagnoses, clinical notes, procedure history across specialties
- Lab test ordering + results — HL7 FHIR R4 APIs
- Prescription management; DICOM medical imaging integration
- **Voice-to-text clinical notes:** Self-hosted Whisper model on OpenShift AI for Arabic (Egyptian dialect) + English; zero external API calls; all patient voice data stays within the OpenShift cluster
- Clinical Decision Support: drug-drug interaction alerts, allergy warnings, contraindications
- 25-year record retention (Egyptian law) — automated tiered storage: Hot → Warm → Cold
- Full compliance-grade audit trail

---

### Module 4 — Billing, Payments & Financial Management
**Branch:** `service/billing-service`
> Replaces the `MSR` (Master Sheet Record) Excel sheet

- Transaction recording: procedure, approved charge, cost, C/I, C/O, C/M amounts
- **Patient Source Matrix:**
  | Code | Source | Notes |
  |---|---|---|
  | Cl.'s | Clinic direct | — |
  | Dr.'s | Doctor referral | — |
  | VEZ | Vizita | Fee deducted |
  | Ex-VEZ | Ex-Vizita | — |
  | EKF | Ekshf | Fee deducted |
  | Ex-EKF | Ex-Ekshf | — |
  | DO | CliniDo | Fee deducted |
  | Ex-DO | Ex-CliniDo | — |
  | SHL | Shamel | No commission |
- Configurable source fee matrix: auto-deduction from clinic or doctor share
- Payment methods: Cash · InstaPay · Bank Transfer · Mobile Wallet · VFC
- Revenue, due, balance tracking; doctor/clinic shares auto-calculated
- Egyptian VAT integration; automated tax invoicing; multi-currency readiness (GCC)
- Reporting: daily/weekly/monthly by doctor, specialty, source; outstanding balances
- Accounting software export/sync

---

### Module 5 — Procedure & Service Catalogue
**Branch:** `service/procedure-service`

- Full catalogue per specialty: Gynecology (كشف نساء, سونار, Operations, Labs), Dentistry (full list), all 41 specialties
- Procedure types: Consultation · Follow-up · Operative · Settling Fee
- Pricing per doctor and specialty; approved charge vs cost tracking

---

### Module 6 — AI-Powered Intelligent Chatbot
**Branch:** `service/ai-chatbot-service`

- NLP: TensorFlow/PyTorch + OpenAI API; bilingual Arabic/English
- Symptom-based triage — Egyptian Ministry of Health guidelines; medical disclaimer on every response
- 85% confidence threshold — auto-escalate to human reception below threshold
- Appointment booking, reschedule, post-procedure instructions, medication reminders
- Deployed on OpenShift AI with model versioning and A/B testing
- All conversations stored 7 years; monthly quality review
- **Self-hosted Whisper model** on OpenShift AI for Arabic (Egyptian dialect) + English voice-to-text — fully on-premise, zero patient data leaves the cluster, full Egypt Law No. 151/2020 compliance

---

### Module 7 — Advanced Analytics & Dashboards
**Branch:** `service/analytics-service`

- Role-based dashboards: Admin · Doctor · Finance · Receptionist
- Real-time KPIs: patient volume, revenue, no-show rates, staff performance
- Doctor performance: earnings, procedure volumes
- Specialty revenue breakdown; patient source ROI analysis
- Predictive analytics: no-show prediction, capacity forecasting, 30-day revenue forecast
- Automated threshold-based alerts
- Export: PDF + Excel — English and Arabic
- Data anonymization for analytics and ML training

---

### Module 8 — Enterprise Security
**Branch:** `infra/security`

- AES-256 at rest (TDE + storage-level + pgcrypto field-level for national ID, mobile, financial)
- mTLS in transit via Istio Service Mesh + TLS on all routes
- Keycloak + JWT (short expiry) + MFA for all staff
- RBAC + OpenShift RBAC + NetworkPolicies (default-deny)
- HashiCorp Vault — dynamic secrets rotation
- Falco + Compliance Operator + immutable audit logs → SIEM
- Quay + Clair image scanning — block critical CVEs
- Annual third-party penetration testing
- Egypt Law No. 151/2020 · HIPAA baseline · GDPR-ready

---

### Module 9 — Third-Party Integrations
**Branch:** `service/integration-service`

All via Adapter Pattern with circuit breakers, retry logic, rate limiting, graceful degradation:

| Integration | Purpose |
|---|---|
| WhatsApp Business API | Appointment notifications, confirmations (bilingual) |
| SMS Gateway | Arabic/English transactional messages |
| InstaPay | Payment processing and reconciliation |
| VFC Wallet | Wallet payments and reconciliation |
| Bank Transfer | Reconciliation and settlement tracking |
| Vizita API | Patient source tracking and fee deduction |
| Ekshf API | Patient source tracking and fee deduction |
| CliniDo API | Patient source tracking and fee deduction |
| Lab/Imaging | HL7 FHIR / DICOM integration |
| Accounting Software | Automated financial sync |
| Firebase Cloud Messaging | Mobile push notifications |

---

### Module 10 — Mobile Applications
**Branches:** `frontend/patient-mobile` · `frontend/admin-mobile` · `frontend/doctor-mobile`

> ⚠️ **Online-Only Mode:** All mobile apps require active internet connection. **No local caching or offline mode** — all data fetched live from the platform to ensure data integrity, real-time accuracy, and security compliance.

#### Patient App (iOS & Android)
- Appointment booking, viewing, real-time status tracking
- Health records, procedure history, lab results, prescriptions
- Telehealth video; AI chatbot; push notifications (Arabic + English)
- Full RTL Arabic support; Fadl Clinic deep red branding
- Online-only — no offline data caching

#### Admin App (iOS & Android)
- Real-time dashboard; cross-specialty appointment management
- Doctor schedules; financial overview; daily revenue; critical alerts
- Online-only — no offline data caching

#### Doctor App (iOS & Android) ⭐ NEW
- Real-time personal schedule and daily appointment list
- Patient list with quick access to medical history and procedure notes
- Earnings dashboard: per-procedure breakdown, daily/weekly/monthly totals
- Settlement history and pending payments
- Push notifications for new appointments, cancellations, reschedules
- Quick clinical notes with voice-to-text (Arabic + English)
- Full RTL support; Fadl Clinic branding
- Online-only — no offline data caching

#### Web Portal (Desktop)
**Branch:** `frontend/web-portal`
- Full admin access; advanced reporting; system configuration; user/role management
- OpenShift Routes with TLS

> ✅ **Decision:** React Native for shared codebase; native modules for video if performance requires — confirmed for Phase 4.

---

### Module 11 — Receptionist Quick-Entry UI ⭐ NEW
**Branch:** `frontend/web-portal` (sub-module: `/receptionist`)

A simplified, fast-entry web view optimized for front-desk staff — completely separate from the full admin portal. Designed for high-volume walk-in registration and queue management with minimum clicks.

- Streamlined patient registration with mobile-number search-or-create flow
- Fast walk-in appointment booking — specialty → doctor → next available slot in 3 clicks
- Real-time queue board with drag-and-drop priority adjustment
- Quick check-in / check-out actions
- Status workflow control: TBC → Ok! → Conf. → Comp. with one-click updates
- Two-hour rule alerts and pending confirmations panel
- Walk-in vs scheduled appointment differentiation
- Quick payment recording (Cash / InstaPay / Bank Transfer / Wallet)
- Daily handover report at end of shift
- Fully bilingual (Arabic RTL + English LTR)
- Minimal training required — designed for non-technical reception staff

---

### Module 12 — Appointment Overbooking Buffer Engine ⭐ NEW
**Branch:** `service/appointment-service` (extends Module 1)

Configurable overbooking buffer per specialty to maximize doctor utilization while protecting patient experience.

- **Per-specialty buffer percentage** — e.g., Gynecology 10%, Dentistry 5%, Surgery 0%
- **Per-doctor override** — individual doctors can opt in/out of overbooking
- **Auto-waitlist promotion** — when a slot opens (cancellation, no-show), waitlist promotes automatically
- **Smart no-show prediction** integration — overbooking informed by historical no-show rates per doctor/specialty
- **Buffer ceiling** — hard cap to prevent excessive overbooking (default: max 15%)
- **Real-time queue rebalancing** — if all overbooked patients show up, queue auto-adjusts wait times
- **Admin override** — receptionist or admin can manually adjust buffer for specific days (e.g., holidays, doctor leave)
- **Audit trail** — all buffer changes logged with timestamp and user

---

## ⚠️ Phase Zero — Data Migration & Validation
**Branch:** `phase/phase-0-migration`

This phase runs **before any code deployment**.

| Step | Detail |
|---|---|
| Schema Analysis | Map Dr_Data → doctor-service; MSR → billing-service; patient records → patient + ehr services |
| Data Cleansing | Resolve duplicate mobile numbers; standardize Arabic/English names; validate financial totals |
| Migration Pipeline | Deploy in isolated `fadl-migration` namespace; execute dry-runs |
| Parallel Run | Run Excel + System simultaneously for 30 days; automated daily reconciliation |
| Validation Gate | Financial variance must be < 0.01%; doctor sign-off on revenue split configs |
| Rollback Plan | Immediate rollback capability if validation fails |

---

## 🏥 Supported Medical Specialties (41)

| # | English | Arabic |
|---|---|---|
| 1 | Gynecology & Infertility | النساء والعقم |
| 2 | Pediatrics & Newborn | الأطفال والمواليد |
| 3 | Pediatrics Surgery | جراحة الأطفال |
| 4 | Dentistry | الأسنان |
| 5 | Psychiatry | الطب النفسي |
| 6 | Physiotherapy | العلاج الطبيعي |
| 7 | Dermatology | الجلدية |
| 8 | Allergy & Immunology | الحساسية والمناعة |
| 9 | Pain Management | التحكم في الألم |
| 10 | Phoniatrics | التخاطب |
| 11 | Dietitian & Nutrition | التغذية والرجيم |
| 12 | Obesity & Laparoscopic Surgery | السمنة وجراحاتها |
| 13 | Ophthalmology | العيون |
| 14 | Hepatology | الكبد |
| 15 | Audiology | السمع |
| 16 | Plastic Surgery | الجراحات التجميلية |
| 17 | Diabetes & Endocrinology | السكر والغدد الصماء |
| 18 | Gastroenterology & Endoscopy | الجهاز الهضمي والمناظير |
| 19 | IVF & Infertility | التلقيح الصناعي والعقم |
| 20 | Nephrology | الكلى |
| 21 | Spinal Surgery | جراحة العمود الفقري |
| 22 | Elders Care | كبار القدر |
| 23 | Beauty | التجميل |
| 24 | Internal Medicine | الباطنة |
| 25 | Neurology | المخ والأعصاب |
| 26 | Neurosurgery | جراحة المخ والأعصاب |
| 27 | General Surgery | الجراحة العامة |
| 28 | Urology | المسالك البولية |
| 29 | Vascular Surgery | جراحة الأوعية الدموية |
| 30 | Cardiology | القلب |
| 31 | Chest & Respiratory | أمراض الصدر والجهاز التنفسي |
| 32 | Oncology | الأورام |
| 33 | Oncology Surgery | جراحة الأورام |
| 34 | Andrology & Male Infertility | الذكورة والعقم |
| 35 | Rheumatology | الروماتيزم |
| 36 | ENT | الأنف والأذن والحنجرة |
| 37 | Hematology | أمراض الدم |
| 38 | Orthopedics | جراحة العظام |
| 39 | Anesthesiology | التخدير |
| 40 | Radiology | الأشعة |
| 41 | Emergency Medicine | الطوارئ |

---

## 🗓️ Development Phases (8 Phases)

| Phase | Branch | Duration | Focus | Status |
|---|---|---|---|---|
| **Phase 0** | `phase/phase-0-migration` | 4–6 wks | Data migration, Excel analysis, cleansing, 30-day parallel run | ⏳ Not Started |
| **Phase 1** | `phase/phase-1-core` | 8–10 wks | OpenShift setup, identity, patient, appointment, doctor services, basic billing, bilingual web portal | ⏳ Not Started |
| **Phase 2** | `phase/phase-2-financial` | 10–12 wks | Full financial engine, immutable ledger, source fees, settlements, procedure catalogue, EHR core, notifications | ⏳ Not Started |
| **Phase 3** | `phase/phase-3-ai` | 8–10 wks | AI chatbot (OpenShift AI), analytics dashboards, predictive models, reporting engine | ⏳ Not Started |
| **Phase 4** | `phase/phase-4-mobile` | 8–10 wks | React Native mobile apps (patient + admin + doctor), telehealth-service, Firebase | ⏳ Not Started |
| **Phase 5** | `phase/phase-5-integrations` | 6–8 wks | WhatsApp, Vizita, Ekshf, CliniDo, InstaPay, SMS, lab integrations | ⏳ Not Started |
| **Phase 6** | `phase/phase-6-security` | 4–6 wks | Enterprise security hardening, penetration testing, HA failover validation, compliance cert | ⏳ Not Started |
| **Phase 7** | `phase/phase-7-performance` | 6–8 wks | Performance optimization, multi-branch architecture (ACM), final multi-round testing | ⏳ Not Started |

---

## 🧪 Testing Requirements

Every phase passes comprehensive multi-round testing before progression:

- ✅ Unit testing — all services and components
- ✅ Integration testing — across all microservices + service mesh
- ✅ End-to-end testing — full journeys (booking → billing → settlement)
- ✅ Performance & load — peak clinic hour simulation + HPA/KEDA validation
- ✅ Security penetration — annual third-party assessment
- ✅ OpenShift deployment — rolling updates, rollbacks, pod disruption budgets
- ✅ Database HA — failover, PITR restore, replication lag scenarios
- ✅ **Quarterly full-system DR drill** — cross-database disaster recovery test (PostgreSQL + MongoDB + Redis + Object Storage). Restore from backups in isolated DR namespace; validate data integrity; document recovery time objective (RTO) and recovery point objective (RPO)
- ✅ Mobile device matrix — iOS + Android
- ✅ Bilingual UI/UX — English LTR + Arabic RTL, font rendering, text expansion
- ✅ Financial accuracy — all split scenarios, source fees, edge cases (37.5/62.5, refunds, partial payments)

---

## 📊 Observability & SRE

| Layer | Tool | Purpose |
|---|---|---|
| Metrics | Prometheus + Grafana + OpenShift Monitoring | Infrastructure + app metrics |
| Logging | Loki + Grafana | Structured logs with correlation IDs |
| Tracing | Jaeger/Tempo + OpenShift Distributed Tracing | End-to-end request tracing |
| Alerting | Alertmanager + PagerDuty/Opsgenie | On-call escalation |
| Synthetic | Blackbox Exporter | Probe appointment API every 5 minutes |

**SLO Targets:**
- `appointment-service`: 99.9% availability · <500ms p95 latency
- `billing-service`: 99.99% availability · zero data loss

---

## 🔐 Security & Compliance

| Control | Implementation |
|---|---|
| Encryption at rest | AES-256 + TDE + pgcrypto field-level (national ID, mobile, financial) |
| Encryption in transit | mTLS (Istio) + TLS on all routes |
| Authentication | Keycloak + JWT (short expiry) + MFA all staff |
| Authorization | RBAC + OpenShift RBAC + NetworkPolicies (default-deny) |
| Secrets | HashiCorp Vault — dynamic secrets rotation |
| API Security | 3scale rate limiting + request validation + API key mgmt |
| Runtime | Falco + Compliance Operator + immutable audit logs → SIEM |
| Images | Quay + Clair scanning — block critical CVEs |
| Penetration Testing | Annual third-party assessment |
| Compliance | Egypt Law No. 151/2020 · HIPAA baseline · GDPR-ready |
| Record Retention | 25 years (Egyptian law) — Hot → Warm → Cold tiered storage |

---

## ⚠️ Risk Register

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Excel migration data errors | High | Critical | Phase 0 parallel run; automated reconciliation; <0.01% variance gate |
| Doctor resistance to revenue transparency | High | High | Change management; doctor champion committee; phased rollout |
| Third-party API downtime | Medium | High | Circuit breakers; graceful degradation; queue-and-retry |
| Arabic RTL UI defects | Medium | Medium | Dedicated Arabic QA; automated visual regression testing |
| Patient data breach | Low | Critical | Encryption, Vault, network policies, annual pentest |
| OpenShift operational complexity | Medium | Medium | Red Hat support subscription; SRE training; runbooks |

---

## 💬 Claude's Review Comments on New Plan

### ✅ What's Excellent
1. **Phase Zero** — migrating from Excel with a 30-day parallel run and <0.01% variance gate is the right approach. Critical for a financial system.
2. **13-service decomposition** is clean and domain-driven with clear bounded contexts.
3. **Istio Service Mesh with mTLS** — right choice for inter-service security in healthcare.
4. **Immutable billing ledger** with event sourcing — essential for financial compliance and auditability.
5. **OpenShift AI for chatbot** — model versioning and A/B testing built-in, no vendor lock-in.
6. **Egypt Law No. 151/2020** — was missing before, correctly added now.
7. **Knative scale-to-zero** for chatbot — cost-smart for variable load.
8. **Loki + Grafana** over EFK — lighter, modern, integrates with existing Grafana stack.
9. **3scale API Gateway** — proper external integration management with rate limiting.

### 💡 Claude's Suggested Additions (Pending Confirmation)
1. **Doctor mobile app** — new plan covers patient + admin mobile, but not a dedicated doctor app. Doctors likely want to view their schedule, patient list, and earnings on mobile. Recommend adding as sub-module in Phase 4.
2. **Receptionist UI** — explicitly define a simplified fast-entry web view for walk-in registration and queue management, separate from the full admin portal.
3. **Appointment overbooking buffer** — configurable buffer per specialty (e.g., allow 10% overbooking with auto-waitlist promotion). Worth deciding now before appointment-service is built.
4. **Offline mode for mobile** — if internet drops at clinic, cache pending appointments locally and sync on reconnect. Add to Phase 4 mobile requirements.
5. **Self-hosted Whisper for Arabic voice-to-text** — plan correctly flags no external patient data storage. Recommend deploying open-source Whisper model on OpenShift AI for Arabic transcription to stay fully on-premise and compliant.
6. **Quarterly full-system DR drill** — monthly PostgreSQL restore testing is mentioned; recommend extending to quarterly full DR drill across all databases (PostgreSQL + MongoDB + Redis + object storage).

---

## 📌 Open Decisions

| # | Decision | Status |
|---|---|---|
| 1 | Node.js vs Java Spring Boot for backend services | ⏳ Decide at Phase 1 start |
| 2 | React Native confirmed for mobile; native modules for video if needed | ✅ Confirmed |
| 3 | Doctor-facing mobile app (frontend/doctor-mobile) | ✅ Confirmed — added to Phase 4 |
| 4 | Receptionist simplified UI (separate fast-entry view) | ✅ Confirmed — added as Module 11 |
| 5 | Appointment overbooking buffer per specialty | ✅ Confirmed — added as Module 12 |
| 6 | Mobile offline mode / local caching | ✅ Confirmed — NOT used; all apps online-only |
| 7 | Arabic voice-to-text — self-hosted Whisper on OpenShift AI | ✅ Confirmed — fully on-premise |
| 8 | Quarterly full-system DR drill across all databases | ✅ Confirmed — added to testing |
| 9 | Clinic logo | ✅ Provided — deep red heart with crimson gradient |
| 10 | Excel system analysis | ✅ Completed — Dr_Data, MSR, Lists, Dict sheets fully analyzed |
| 11 | Clinic name | ✅ Confirmed: Fadl Clinic (فضل كلينك) |

---

## 📅 Change Log

| Date | Version | Change | By |
|---|---|---|---|
| 2026-05-02 | 1.0 | Initial project plan created | Saad |
| 2026-05-02 | 1.0 | Multi-specialty structure from Excel analysis | Saad |
| 2026-05-02 | 1.0 | Doctor revenue split engine from Dr_Data sheet | Saad |
| 2026-05-02 | 1.0 | Patient source tracking from MSR sheet | Saad |
| 2026-05-02 | 1.0 | OpenShift deployment + HA databases | Saad |
| 2026-05-02 | 1.0 | Multi-language (Arabic + English) | Saad |
| 2026-05-02 | 1.0 | Mobile apps (patient + admin) | Saad |
| 2026-05-02 | 1.0 | AI chatbot + advanced dashboards | Saad |
| 2026-05-02 | 1.0 | Fadl Clinic logo and branding | Saad |
| 2026-05-02 | 1.0 | Comprehensive testing requirements | Saad |
| 2026-05-02 | 1.0 | claude-plan.md created | Saad |
| 2026-05-02 | 2.0 | **Major upgrade** — 13 microservices, Istio Service Mesh, Phase Zero migration, immutable billing ledger, OpenShift AI, 3scale, Loki, Jaeger, KEDA, ACM, Egypt Law No. 151/2020, risk register, SLOs, Git branching strategy per module/service/phase | Saad |
| 2026-05-02 | 2.1 | **All open decisions confirmed:** Added doctor mobile app (Module 10 + frontend/doctor-mobile branch); added Receptionist Quick-Entry UI (Module 11); added Overbooking Buffer Engine (Module 12); confirmed online-only mobile apps (no offline cache); confirmed self-hosted Whisper on OpenShift AI for Arabic voice-to-text; added quarterly full-system DR drill to testing | Saad |
| 2026-05-02 | 2.2 | **Database architecture reviewed and enhanced** — created `database.md` v1.1 with 20 production-grade enhancements: UUID patient_id (not mobile as PK), composite partitioning (branch+date), exclusion constraints to prevent double-booking, idempotency keys, immutability triggers, Row Level Security, Redis Streams for notifications, distributed locks for slot booking, Debezium CDC, DICOMweb via Orthanc, S3 Object Lock for 25-year WORM, Vault dynamic DB credentials, Flyway migrations, healthcare-specific alerts | Saad + Claude |
| 2026-05-02 | 2.3 | **Design system reviewed and enhanced** — created `design.md` v1.1 with 20 enhancements inspired by CuraNet aesthetic: replaced Inter with Outfit+Manrope (English) and IBM Plex Arabic+Tajawal (Arabic), corrected logo gradient to match actual heart asset, added soft accent palette (rose gold/sand/mint), motion system with named easing curves, glassmorphism patterns, bento card variants, floating panel pattern, pill tab navigation, density modes (compact/comfortable/spacious), full dark mode palette, high-contrast mode for elders, font size scaling, color-blind safe status indicators (icon+color), real patient photo policy correction, print stylesheet with 7 templates, microcopy voice guidelines, doctor mobile app layout spec | Saad + Claude |

---

*This document is maintained by Claude and updated automatically with every new request, module addition, or change. Version 2.0 reflects the full enterprise-grade plan.*