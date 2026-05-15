# Fadl Clinic Management System (FC-AMS)

A production microservices platform replacing Excel-based clinic operations at Fadl Clinic (فضل كلينك), an Egyptian multi-specialty medical clinic. Handles appointment scheduling, patient management, doctor revenue splits, immutable financial ledger, settlements, AI-assisted operations, and EHR.

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Infrastructure](#2-infrastructure)
3. [Service Reference](#3-service-reference)
4. [Database Design](#4-database-design)
5. [Authentication & Authorization](#5-authentication--authorization)
6. [Key Business Flows](#6-key-business-flows)
7. [Cross-Service Communication](#7-cross-service-communication)
8. [Frontend Structure](#8-frontend-structure)
9. [Migration History](#9-migration-history)
10. [Development Workflow](#10-development-workflow)
11. [Phase & Status](#11-phase--status)

---

## 1. System Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                             BROWSER / CLIENT                                  │
│                   Next.js 13 App Router  —  web-portal                       │
│           Bilingual AR/EN · RTL-first · dark sidebar + light canvas           │
└─────────────────────────────────┬────────────────────────────────────────────┘
                                  │  HTTPS · REST · axios instances per service
                                  │
              ┌───────────────────▼──────────────────────┐
              │          NEXT.JS API PROXY LAYER          │
              │  /api/v1/* routes forward to service URLs │
              └──────┬────────────┬────────────┬──────────┘
                     │            │            │
        ┌────────────▼──┐  ┌──────▼───┐  ┌────▼───────────┐
        │ identity :3000│  │patient   │  │appointment     │
        │               │  │  :3002   │  │  :3001         │
        │ JWT auth       │  │          │  │                │
        │ user CRUD      │  │ patients │  │ scheduling     │
        │ role mgmt      │  │ profiles │  │ room queue     │
        └───────────────┘  │ files    │  │ status flow    │
                           └──────────┘  └────────┬───────┘
                                                   │ creates transaction
        ┌──────────────┐  ┌────────────┐  ┌────────▼───────┐
        │ doctor :3003 │  │ analytics  │  │ billing :3004  │
        │              │  │  :3009     │  │                │
        │ profiles     │  │            │  │ immutable       │
        │ schedules    │  │ revenue    │  │ ledger          │
        │ rev. splits ─┼──┼──────────► │  │ settlements     │
        │              │  │ top doctors│  │ compensation    │
        └──────────────┘  │ specialty  │  │ source fees     │
                          │ no-show    │  └────────────────┘
                          └────────────┘
        ┌──────────────┐  ┌────────────┐  ┌────────────────┐
        │procedure     │  │ ehr :3005  │  │notification    │
        │  :3006       │  │            │  │  :3007         │
        │ catalogue    │  │ encounters │  │ email + SMS    │
        │ CRUD         │  │ clinical   │  │ nodemailer     │
        └──────────────┘  └────────────┘  │ Twilio         │
                                          └────────────────┘
        ┌──────────────┐  ┌────────────┐  ┌────────────────┐
        │ai-chatbot    │  │integration │  │ file :3011     │
        │  :3008       │  │  :3012     │  │                │
        │ OpenRouter   │  │ Vizita     │  │ MinIO upload   │
        │ intent parse │  │ Ekshf      │  │ presigned URLs │
        │ bilingual    │  │ CliniDo    │  └────────────────┘
        └──────────────┘  │ InstaPay   │
                          └────────────┘
        ┌──────────────┐  ┌────────────┐
        │procurement   │  │telehealth  │
        │  :3010       │  │  :3013     │
        │ vendors      │  │ online     │
        │ POs          │  │ sessions   │
        └──────────────┘  └────────────┘
```

---

## 2. Infrastructure

| Component | Tech | Role |
|---|---|---|
| PostgreSQL 16 | `postgres:16-alpine` | Single cluster; 14 logical databases (one per service) |
| PgBouncer | `pgbouncer/pgbouncer:latest` | Connection pooling in front of PostgreSQL (all services connect here) |
| Redis 7 | `redis:7-alpine` | Session cache, idempotency key store, rate limiting |
| MinIO | `minio/minio:latest` | S3-compatible object store for patient file uploads |
| Docker Compose | — | Single-host dev/staging orchestration |

### Database Isolation

Each service connects to its own logical database via PgBouncer:

| Service | Database |
|---|---|
| identity-service | `fadl_identity` |
| patient-service | `fadl_patients` |
| appointment-service | `fadl_appointments` |
| doctor-service | `fadl_doctors` |
| billing-service | `fadl_billing` |
| analytics-service | reads `fadl_billing` + `fadl_appointments` |
| ehr-service | `fadl_ehr` |
| notification-service | `fadl_notifications` |
| ai-chatbot-service | `fadl_chatbot` |
| integration-service | `fadl_integrations` |
| file-service | `fadl_files` |
| procedure-service | `fadl_procedures` |
| procurement-service | `fadl_procurement` |

All connections: `postgresql://fadl:<secret>@pgbouncer:5432/<database>`

---

## 3. Service Reference

### identity-service (port 3000)

Handles user authentication, JWT issuance, and user management.

**API Routes (`/api/v1`):**

| Method | Path | Roles | Description |
|---|---|---|---|
| POST | `/auth/login` | public | Email + password → access token + refresh token. Rate-limited to 5 req/min |
| POST | `/auth/refresh` | public | Refresh token → new access token |
| POST | `/auth/logout` | any auth | Invalidate refresh token |
| GET | `/auth/me` | any auth | Current user profile |
| PATCH | `/auth/password` | any auth | Change password (requires `currentPassword`) |
| GET | `/users` | admin | List all users |
| POST | `/users` | admin | Create user with role |
| PATCH | `/users/:id` | admin | Update user |
| DELETE | `/users/:id` | admin | Delete user |

**JWT structure:**
```json
{
  "sub": "<userId-UUID>",
  "role": "admin | receptionist | doctor | finance",
  "branchId": 1,
  "doctorId": "<UUID or null>",
  "iat": 1716000000,
  "exp": 1716086400
}
```
Signed with `HS256` using shared `JWT_SECRET`. Access token TTL: 24h. Refresh token: 30d.

---

### patient-service (port 3002)

Full CRUD for patient demographics, soft deletes, full-text search.

**API Routes (`/api/v1`):**

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/patients` | any auth | List patients; query: `search`, `page`, `limit` |
| GET | `/patients/batch` | any auth | Batch fetch by IDs |
| GET | `/patients/:id` | any auth | Single patient detail |
| POST | `/patients` | receptionist, admin | Create patient |
| PATCH | `/patients/:id` | receptionist, admin | Update demographics |
| DELETE | `/patients/:id` | admin | Soft delete (`deleted_at`) |

**Key schema (`fadl_patients`):**
- `patients`: UUID PK, `mobile` UNIQUE, `name_ar`, `name_en`, `date_of_birth`, `gender`, `source`, `is_future_patient`, `deleted_at`, `branch_id`

---

### appointment-service (port 3001)

Appointment scheduling with exclusion constraints (no double-booking), status workflow, walk-in queue, and room management.

**API Routes (`/api/v1`):**

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/appointments` | any auth | List; filter by `doctorId`, `patientId`, `date`, `status`, `page`, `limit` |
| GET | `/appointments/:id` | any auth | Single appointment |
| POST | `/appointments` | receptionist, doctor, admin | Create; requires `patientId`, `doctorId`, `appointmentDate`, `startTime`, `endTime`; optional `specialtyId`, `paymentMethod`, `notes`, `idempotencyKey` |
| PATCH | `/appointments/:id` | receptionist, admin | Edit; includes `specialtyId` from selected doctor |
| PATCH | `/appointments/:id/status` | receptionist, doctor, admin | Transition status |
| POST | `/appointments/:id/check-in` | receptionist, admin | Mark patient arrived |
| DELETE | `/appointments/:id` | admin | Soft delete + cascade delete billing transaction |
| GET | `/rooms` | any auth | List rooms with current occupancy |
| GET | `/rooms/availability` | any auth | Room slot availability |
| GET | `/rooms/stats` | any auth | Room utilisation stats |
| GET | `/rooms/stream` | any auth | SSE stream for real-time room updates |
| POST | `/rooms/:roomCode/assign` | receptionist, admin | Assign appointment to room |
| POST | `/rooms/auto-assign` | receptionist, admin | Auto-assign to next free room |
| DELETE | `/rooms/:roomCode/assignment` | receptionist, admin | Release room |
| POST | `/rooms/:roomCode/next-patient` | receptionist, admin | Advance queue |
| PATCH | `/rooms/:roomCode/settings` | admin | Update room config |

**Status workflow:**
```
TBC → Ok! → Conf. → in_session → Comp.
                              ↘ Canc.
                              ↘ Resch.
          ↘ Inf. (no-show)
```

**Double-booking prevention:**
PostgreSQL exclusion constraint on `(doctor_id, appointment_date, time_range)` where `time_range` overlaps — rejects any slot collision at the DB level.

**On appointment create**, the service synchronously calls:
- `billing-service POST /transactions` — creates a pending financial transaction
- `doctor-service GET /doctors/:id` — resolves doctor revenue splits for billing

---

### doctor-service (port 3003)

Doctor profiles, schedules, schedule overrides, availability calculation, and revenue split management. On save, pushes splits to billing-service.

**API Routes (`/api/v1`):**

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/doctors` | any auth | List; filter by `specialtyId`, `isActive`, `isOnlineDoctor` |
| GET | `/doctors/:id` | any auth | Single doctor |
| POST | `/doctors` | admin | Create doctor; triggers compensation seed in billing-service |
| PATCH | `/doctors/:id` | admin, receptionist | Update; if `revenueSplits` changes, triggers billing-service sync |
| PATCH | `/doctors/:id/active` | admin | Toggle active/inactive |
| DELETE | `/doctors/:id` | admin | Soft delete |
| GET | `/doctors/:id/schedules` | any auth | Weekly schedule |
| PUT | `/doctors/:id/schedules` | admin, receptionist | Upsert schedule day |
| GET | `/doctors/:id/schedule-overrides` | any auth | Date-specific overrides |
| POST | `/doctors/:id/schedule-overrides` | admin, receptionist | Add override (holiday, custom hours) |
| GET | `/doctors/:id/consultation-hours` | any auth | Consultation time blocks |
| PUT | `/doctors/:id/consultation-hours` | admin, receptionist | Set consultation hours |
| PUT | `/doctors/:id/consultation-hours/bulk` | admin | Bulk set all days |
| GET | `/doctors/:id/status` | any auth | Current doctor status |
| PATCH | `/doctors/:id/status` | admin, receptionist | Set status |
| GET | `/doctors/:id/status-history` | any auth | Status change log |
| GET | `/doctors/:id/day-overrides` | any auth | Day-level overrides |
| PUT | `/doctors/:id/day-overrides` | admin, receptionist | Set day override |
| GET | `/doctors/:id/availability` | any auth | Available slots for date range |
| GET | `/specialties` | any auth | All active specialties |

**Revenue splits schema (`fadl_doctors.doctors`):**
```sql
revenue_splits JSONB  -- {
  -- consultation: { doctorPercentage: 70, clinicPercentage: 30 },
  -- operative:    { doctorPercentage: 80, clinicPercentage: 20 },
  -- online:       { doctorPercentage: 70, clinicPercentage: 30 }
-- }
```
CHECK constraints enforce that each pair sums to 100.

**Billing sync** (fire-and-forget with `Promise.allSettled`):
- On `createDoctor`: calls `POST /compensation/:id` for all 3 visit types with `applyToExisting: false`
- On `updateDoctor` (when revenueSplits changed): calls `POST /compensation/:id` for all 3 visit types with `applyToExisting: true` — back-patches all pending transactions for that doctor

---

### billing-service (port 3004)

Immutable financial ledger, doctor settlements, source fee rules, and compensation rate management.

**API Routes (`/api/v1`):**

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/transactions` | admin, finance, doctor, receptionist | List; filter by `appointmentId`, `patientId`, `doctorId`, `status`, `dateFrom`, `dateTo` |
| GET | `/transactions/:id` | admin, finance, doctor, receptionist | Single transaction |
| POST | `/transactions` | admin, finance, receptionist | Create pending transaction |
| GET | `/transactions/:id/extra-services` | admin, finance, doctor, receptionist | Get extra service line items |
| PUT | `/transactions/:id/extra-services` | admin, finance | Replace extra service line items atomically |
| PATCH | `/transactions/:id/procedure-cost` | admin, finance | Correct procedure cost |
| PATCH | `/transactions/:id/status` | admin, finance | Advance payment status |
| PATCH | `/transactions/by-appointment/:appointmentId/payment-status` | admin, finance | Update status by appointment |
| PATCH | `/transactions/by-appointment/:appointmentId/refund` | admin, finance | Issue refund |
| POST | `/transactions/bulk-delete` | admin | Delete multiple transactions |
| PATCH | `/transactions/bulk/payment-method` | admin, finance | Bulk update payment method |
| GET | `/sources` | any auth | List source fee rules |
| POST | `/sources` | admin | Create source fee rule |
| PATCH | `/sources/:code` | admin | Update source fee rule |
| DELETE | `/sources/:code` | admin | Delete source fee rule |
| GET | `/sources/:code/rate` | any auth | Get fee rate for source code |
| GET | `/settlements` | admin, finance | Get settlement summary by doctor |
| POST | `/settlements/reconcile` | admin, finance | Create settlement (requires admin password) |
| GET | `/settlements/records` | admin, finance | List settlement records |
| POST | `/settlements/records/:id/reverse` | admin | Reverse a settlement (password-gated) |
| GET | `/settlements/doctor` | doctor | Doctor's own settlement history |
| GET | `/compensation/:doctorId` | admin, finance | Get doctor's compensation rates |
| POST | `/compensation/:doctorId` | admin (service token) | Set/update compensation rate; `applyToExisting` back-patches pending transactions |
| DELETE | `/compensation/rules/:id` | admin | Delete compensation rule |

**`financial_transactions` schema (key fields):**
```sql
approved_charge        DECIMAL(12,2)   -- Immutable after insert
gross_revenue          DECIMAL(12,2)   -- approved_charge - source_fee_amount
source_fee_percentage  DECIMAL(5,2)    -- Immutable
source_fee_amount      DECIMAL(12,2)   -- Immutable
split_doctor_percentage DECIMAL(5,2)  -- Mutable only on pending rows (V009)
split_clinic_percentage DECIMAL(5,2)  -- Mutable only on pending rows (V009)
doctor_share           DECIMAL(12,2)   -- Auto-recalculated by trigger on split change
clinic_share           DECIMAL(12,2)   -- Auto-recalculated by trigger on split change
payment_status         VARCHAR         -- pending→verified→approved→paid→reconciled/refunded
idempotency_key        VARCHAR(100)    -- Unique per (branch_id, transaction_date)
```

**Immutability triggers:**
- `protect_financial_amounts()`: Blocks changes to `approved_charge`, `source_fee_*`, `currency_code`, `exchange_rate`, `is_refund`, `original_transaction_id`, `is_foc`, `entry_type` on any row. Blocks split % changes on `reconciled`/`refunded` rows.
- `recalc_on_split_change()` (`aab_` prefix, fires first): When split % changes on a pending row, auto-recalculates `doctor_share` and `clinic_share` from stored `gross_revenue`.

**Partitioning:** `financial_transactions` is range-partitioned by `(branch_id, transaction_date)`. Partitions created per month: `ft_branch_1_y2026m05`, `ft_branch_1_y2026m06`, etc.

**`doctor_compensation` table:** Stores per-doctor, per-visit-type, per-branch split percentages. Used at transaction creation to look up the correct rate. UNIQUE on `(doctor_id, visit_type, branch_id) WHERE effective_until IS NULL`.

---

### analytics-service (port 3009)

Read-only analytical queries across billing and appointments databases.

**API Routes (`/api/v1`):**

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/analytics/overview` | admin, finance | KPI stat cards: total revenue, doctor share, clinic share, appointment count |
| GET | `/analytics/revenue` | admin, finance | Monthly revenue trend (date range query) |
| GET | `/analytics/sources` | admin, finance | Revenue breakdown by patient source (Vizita, Ekshf, CliniDo, direct) |
| GET | `/analytics/doctors/top` | admin, finance | Top doctors by earnings |
| GET | `/analytics/specialties` | admin, finance | Revenue + volume by specialty |
| GET | `/analytics/noshow-by-day` | admin, finance | No-show rate grouped by day of week |
| GET | `/reports/settlement` | admin, finance | Settlement report (paid + reconciled totals per doctor) |
| GET | `/reports/financial-summary` | admin, finance | Financial summary for date range |

---

### procedure-service (port 3006)

Procedure catalogue CRUD. 9 procedures seeded.

**API Routes (`/api/v1`):**

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/procedures` | any auth | List procedures; filter by specialty |
| GET | `/procedures/:id` | any auth | Single procedure |
| POST | `/procedures` | admin | Create procedure |
| PATCH | `/procedures/:id` | admin | Update procedure |
| DELETE | `/procedures/:id` | admin | Delete procedure |

---

### ehr-service (port 3005)

Clinical encounter records. 12 seeded records.

**API Routes (`/api/v1`):**

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/encounters` | admin, doctor | List encounters; filter by `patientId`, `doctorId`, `dateFrom`, `dateTo` |
| GET | `/encounters/:id` | admin, doctor | Single encounter |
| POST | `/encounters` | doctor, admin | Create encounter |
| PATCH | `/encounters/:id` | doctor, admin | Update encounter |
| DELETE | `/encounters/:id` | admin | Delete |

---

### notification-service (port 3007)

Sends email via nodemailer (SMTP) and SMS via Twilio. Gracefully skips if credentials not configured.

**API Routes (`/api/v1`):**

| Method | Path | Roles | Description |
|---|---|---|---|
| POST | `/notifications/email` | service token | Send email notification |
| POST | `/notifications/sms` | service token | Send SMS |
| GET | `/notifications` | admin | List notification log |

---

### ai-chatbot-service (port 3008)

LLM-as-intent-parser: accepts freeform Arabic or English text, classifies intent, resolves entities (patient name → UUID, doctor name → UUID), and executes the action via downstream service APIs. Powered by OpenRouter (gpt-4o-mini).

**API Routes (`/api/v1`):**

| Method | Path | Roles | Description |
|---|---|---|---|
| POST | `/chat` | any auth | Send message; returns AI response + any executed action |
| GET | `/chat/history` | any auth | Session chat history |

**Supported intents:**
- Register new patient
- Book appointment (resolves doctor name, specialty, available slot)
- Query appointment status
- Look up patient

---

### integration-service (port 3012)

Inbound webhook handlers for external referral platforms.

**API Routes (`/api/v1`):**

| Method | Path | Roles | Description |
|---|---|---|---|
| POST | `/webhooks/vizita` | webhook secret | Vizita appointment/referral events |
| POST | `/webhooks/ekshf` | webhook secret | Ekshf events |
| POST | `/webhooks/clinido` | webhook secret | CliniDo events |
| POST | `/webhooks/instapay` | webhook secret | InstaPay payment confirmation |
| GET | `/webhooks/events` | admin | Webhook event log |

---

### file-service (port 3011)

Presigned upload/download via MinIO.

**API Routes (`/api/v1`):**

| Method | Path | Roles | Description |
|---|---|---|---|
| POST | `/files/upload-url` | any auth | Get presigned PUT URL for upload |
| GET | `/files/:id/download-url` | any auth | Get presigned GET URL for download |
| GET | `/files` | any auth | List files; filter by `patientId` |
| DELETE | `/files/:id` | admin, receptionist | Delete file |

---

### procurement-service (port 3010)

Vendor and purchase order management.

**API Routes (`/api/v1`):**
- Vendors: CRUD (`/vendors`)
- Catalogue: product catalogue (`/catalog`)
- Receipts: goods received notes (`/receipts`)
- Alerts: low-stock alerts (`/alerts`)

---

## 4. Database Design

### Core Principles

| Principle | Implementation |
|---|---|
| **Immutable billing ledger** | `protect_financial_amounts()` trigger prevents changes to core charge fields; relaxed only for split % on pending rows (V009) |
| **Row-Level Security** | Every service sets `SET LOCAL app.branch_id = $1` before each query. All tables have RLS policies: `USING (branch_id = current_setting('app.branch_id')::int)` |
| **UUID primary keys** | All entity tables: `gen_random_uuid()`. Billing transactions partitioned: composite PK `(branch_id, transaction_date, id)` |
| **Soft deletes** | `deleted_at TIMESTAMPTZ NULL` + `WHERE deleted_at IS NULL` in all queries |
| **Optimistic concurrency** | `version INT` on `doctors`; incremented on every write; 409 on conflict |
| **Idempotency** | `idempotency_key VARCHAR(100)` on `financial_transactions`; `UNIQUE (branch_id, transaction_date, idempotency_key)` per partition; duplicate POST returns existing record |
| **Partitioning** | `appointments` and `financial_transactions` are range-partitioned by `(branch_id, date)` with monthly sub-partitions |
| **CHECK constraints** | Split percentages sum to 100. `splits_match_gross`: `ABS((doctor_share + clinic_share) - gross_revenue) < 0.01`. Time range validity. Status enum membership |
| **Migration strategy** | Flyway-style sequential `V001__...sql` files; applied manually via `docker exec psql`; no auto-runner on startup |

### Key Tables

**`fadl_appointments.appointments`** (partitioned by `branch_id + appointment_date`):
```
id UUID, patient_id UUID, doctor_id UUID, specialty_id INT,
appointment_date DATE, start_time TIME, end_time TIME,
status CHECK IN ('TBC','Ok!','Conf.','Comp.','Canc.','Resch.','Inf.'),
appointment_type, patient_source, payment_method, visit_type,
room_id INT, room_code VARCHAR, approved_charge DECIMAL,
notes TEXT, idempotency_key, created_by UUID, branch_id INT
```
Exclusion constraint prevents overlapping slots for the same doctor.

**`fadl_billing.financial_transactions`** (partitioned by `branch_id + transaction_date`):
```
id UUID, appointment_id UUID, patient_id UUID, doctor_id UUID,
approved_charge DECIMAL  [IMMUTABLE],
gross_revenue DECIMAL    [IMMUTABLE],
source_fee_percentage DECIMAL [IMMUTABLE],
source_fee_amount DECIMAL [IMMUTABLE],
split_doctor_percentage DECIMAL  [mutable on pending only],
split_clinic_percentage DECIMAL  [mutable on pending only],
doctor_share DECIMAL    [auto-recalculated],
clinic_share DECIMAL    [auto-recalculated],
payment_status, payment_method, idempotency_key,
is_refund BOOL, is_foc BOOL, entry_type, currency_code,
settlement_id UUID, branch_id INT
```

**`fadl_billing.doctor_compensation`**:
```
id UUID, doctor_id UUID, visit_type CHECK IN ('consultation','operative','online'),
doctor_percentage DECIMAL, clinic_percentage DECIMAL,
effective_from DATE, effective_until DATE,
UNIQUE (doctor_id, visit_type, branch_id) WHERE effective_until IS NULL
```

**`fadl_billing.settlement_records`** (immutable — trigger blocks UPDATE/DELETE):
```
id UUID, doctor_id UUID, settlement_date DATE, amount DECIMAL,
payment_method, payment_reference, processed_by_user_id UUID,
related_transaction_ids UUID[], notes TEXT, branch_id INT
```

**`fadl_doctors.doctors`**:
```
id UUID, mobile VARCHAR UNIQUE, name_en VARCHAR, name_ar VARCHAR,
specialty_id INT, is_online_doctor BOOL,
revenue_splits JSONB  -- { consultation, operative, online } × { doctorPercentage, clinicPercentage }
payment_method, allow_overbooking BOOL, overbooking_buffer_percentage INT,
version INT,  -- optimistic concurrency
is_active BOOL, deleted_at TIMESTAMPTZ, branch_id INT
```
CHECK constraints: each split pair sums to 100.

---

## 5. Authentication & Authorization

### JWT Flow

```
POST /api/v1/auth/login
  ↓ verifies email + bcrypt(password)
  ↓ returns { accessToken, refreshToken }

All subsequent requests:
  Authorization: Bearer <accessToken>
  ↓ each service middleware decodes + verifies HS256 signature
  ↓ sets request.user = { id, role, branchId, doctorId }
  ↓ sets DB session: SET LOCAL app.branch_id = branchId
```

### Role Matrix

| Route category | admin | finance | receptionist | doctor |
|---|---|---|---|---|
| Read any data | ✅ | ✅ | ✅ | ✅ |
| Create/edit appointments | ✅ | — | ✅ | ✅ |
| Create/edit patients | ✅ | — | ✅ | — |
| Manage doctors | ✅ | — | limited | — |
| Billing read | ✅ | ✅ | ✅ | own only |
| Billing write | ✅ | ✅ | limited | — |
| Settlements | ✅ | ✅ | — | — |
| Analytics/reports | ✅ | ✅ | — | — |
| Admin-only (users, delete, hard actions) | ✅ | — | — | — |

### Service-to-Service Auth

Internal calls (doctor-service → billing-service, appointment-service → billing-service) use a synthesised HS256 JWT:
```json
{
  "sub": "00000000-0000-0000-0000-000000000001",
  "role": "admin",
  "branchId": 1,
  "doctorId": null,
  "iat": ..., "exp": ...(+24h)
}
```
Signed with the same `JWT_SECRET`. Each service validates it the same way as a user token.

---

## 6. Key Business Flows

### Appointment Creation

```
1. Receptionist fills AddAppointmentModal:
   - Selects patient (search by name/mobile)
   - Selects doctor → specialtyId auto-mapped from doctor.specialtyId
   - Picks date, time, appointment type, payment method

2. Frontend POST /api/v1/appointments with body:
   { patientId, doctorId, specialtyId, appointmentDate, startTime,
     endTime, appointmentType, patientSource, paymentMethod,
     approvedCharge, idempotencyKey }

3. appointment-service:
   a. Validates no double-booking (exclusion constraint)
   b. Resolves doctor revenue splits from doctor-service
   c. Calculates source fee from source_fee_rules
   d. Creates appointment record
   e. Calls billing-service POST /transactions → creates pending
      financial_transaction with correct split %s
   f. Returns 201 with appointment

4. Frontend invalidates ['appointments'] query cache
```

### Doctor Revenue Split Change

```
1. Admin edits doctor profile → updates revenueSplits

2. doctor-service PATCH /doctors/:id:
   a. Updates doctors.revenue_splits JSONB
   b. Promise.allSettled([
        billing POST /compensation/:id { visitType: 'consultation', ..., applyToExisting: true },
        billing POST /compensation/:id { visitType: 'operative',    ..., applyToExisting: true },
        billing POST /compensation/:id { visitType: 'online',       ..., applyToExisting: true },
      ])

3. billing-service POST /compensation/:id (applyToExisting: true):
   a. Upserts doctor_compensation row (closes old effective_until, opens new)
   b. Runs UPDATE financial_transactions SET split_doctor_percentage = $new, ...
      WHERE doctor_id = $id AND payment_status NOT IN ('reconciled','refunded')
   c. recalc_on_split_change() trigger fires → recalculates doctor_share, clinic_share

4. Result: all pending/paid transactions immediately reflect new split
```

### Settlement Flow

```
1. Finance opens /billing → Settlements tab
2. Selects doctor → sees pending paid (unsettled) transactions
   - Dr% and Cl% columns show current doctor_compensation rates

3. Clicks "Settle" → password confirmation modal (admin password required)

4. POST /settlements/reconcile with {
     doctorId, transactionIds[], amount, paymentMethod, adminPassword
   }

5. billing-service:
   a. Verifies admin password via identity-service
   b. Creates settlement_records row (immutable)
   c. Updates financial_transactions SET payment_status='reconciled',
      settlement_id=<new_id> for all selected transactions
   d. Reconciled rows now protected: split % changes blocked by
      protect_financial_amounts() trigger

6. Doctor removed from pending settlement list
```

### Walk-in Queue

```
1. Receptionist at /receptionist page
2. Creates walk-in appointment (no pre-booked slot) via
   POST /appointments { appointmentType: 'walk_in', roomCode: '#1', ... }

3. Room auto-assigned if not specified (POST /rooms/auto-assign)

4. SSE stream (GET /rooms/stream) pushes real-time room status to frontend
   → Doctor sees patient in queue on their screen

5. Doctor clicks "Next Patient" (POST /rooms/:code/next-patient)
   → Status advances: TBC → in_session

6. Session complete: PATCH /appointments/:id/status { status: 'Comp.' }
```

---

## 7. Cross-Service Communication

```
appointment-service
  → doctor-service        GET /doctors/:id           (resolve revenue splits)
  → billing-service       POST /transactions          (create pending transaction)
  → billing-service       DELETE (cascade on appt delete)

doctor-service
  → billing-service       POST /compensation/:doctorId (on create/update splits)

ai-chatbot-service
  → patient-service       POST /patients              (register patient)
  → appointment-service   POST /appointments          (book appointment)
  → doctor-service        GET /doctors                (resolve doctor name)

integration-service
  → appointment-service   POST /appointments          (inbound webhook → create appointment)
  → patient-service       POST/GET /patients          (find or create patient)

analytics-service
  → Direct DB queries on fadl_billing + fadl_appointments (read-only)
```

All service-to-service calls use:
- `Authorization: Bearer <service-token>` (HS256, role: admin)
- `AbortSignal.timeout(8000)` — 8 s timeout
- Native Node.js `fetch` (Node 20) in doctor-service; axios in others

---

## 8. Frontend Structure

**Stack:** Next.js 13 App Router, React 18, TypeScript, TailwindCSS, TanStack Query v5, axios

```
frontend/web-portal/src/
├── app/
│   ├── (auth)/
│   │   └── login/page.tsx          Login — email+password, sets JWT cookie
│   └── (dashboard)/
│       ├── layout.tsx              Sidebar nav + auth guard + language context
│       ├── page.tsx                Dashboard — stat cards, status breakdown, skeletons
│       ├── appointments/
│       │   └── page.tsx            Appointment list + AddAppointmentModal
│       │                           Filters: doctor, status, date
│       │                           Actions: create, edit, status change, delete
│       ├── patients/
│       │   ├── page.tsx            Patient list — search, pagination
│       │   └── [id]/page.tsx       Patient detail — demographics, visit history, file upload/download
│       ├── doctors/
│       │   ├── page.tsx            Doctor list — filter by specialty, toggle active
│       │   └── [id]/schedule/      Weekly schedule + override management
│       ├── billing/
│       │   └── page.tsx            Transaction list + settlement panel
│       │                           Dr%/Cl% columns from doctor_compensation
│       │                           Password-gated settlement + reverse
│       ├── analytics/
│       │   └── page.tsx            Revenue trend, source breakdown, top doctors, specialty
│       │                           no-show by day — all live from analytics-service
│       ├── reports/
│       │   └── page.tsx            Monthly financial summary, dynamic month range
│       ├── receptionist/
│       │   └── page.tsx            Quick walk-in entry, room queue view
│       ├── encounters/
│       │   └── page.tsx            EHR encounter list, patient+doctor names resolved
│       ├── procedures/
│       │   └── page.tsx            Procedure catalogue — full CRUD
│       ├── sources/
│       │   └── page.tsx            Patient source fee rules — full CRUD (Vizita%, Ekshf%, etc.)
│       ├── settings/
│       │   └── page.tsx            Service health checks, change password
│       ├── chatbot/
│       │   └── page.tsx            AI chat — Arabic/English, registers patients, books appointments
│       └── integrations/
│           └── page.tsx            Webhook event log (admin only)
├── components/
│   ├── appointments/
│   │   ├── AddAppointmentModal.tsx  Create/edit modal; doctor selection auto-maps specialtyId
│   │   └── AppointmentTable.tsx
│   ├── billing/
│   │   ├── BillingTable.tsx
│   │   └── SettlementPanel.tsx
│   └── ui/
│       ├── StatCard.tsx            Metric card with icon, value, trend badge
│       ├── DataTable.tsx           Paginated sortable table
│       ├── ActionButtons.tsx       Dropdown action menus
│       └── badges.tsx              Status pills (7 appointment statuses)
├── contexts/
│   ├── LanguageContext.tsx         AR/EN toggle; `t(ar, en)` helper; RTL dir attribute
│   └── ThemeContext.tsx            Light/dark mode; persisted in localStorage
└── lib/
    ├── api/
    │   ├── appointmentApi.ts       axios instance → appointment-service
    │   ├── billingApi.ts           axios instance → billing-service
    │   ├── doctorApi.ts            axios instance → doctor-service
    │   ├── patientApi.ts           axios instance → patient-service
    │   └── analyticsApi.ts         axios instance → analytics-service
    └── utils/
        ├── dateUtils.ts            addMinutes, formatDate, slot generation
        └── authUtils.ts            Token decode, role check helpers
```

**RBAC (Next.js middleware.ts):**
```
/analytics, /reports      → admin, finance
/integrations, /settings  → admin
/doctors, /procedures     → admin
/billing, /sources        → admin, finance
All other dashboard routes → any authenticated role
```

---

## 9. Migration History

### appointment-service — `fadl_appointments` DB

| Version | Description |
|---|---|
| V001 | Core tables: `specialties`, `doctors` replica, `doctor_schedules`, `doctor_schedule_overrides`, `appointments` (partitioned), `source_fee_rules` seeded |
| V002 | Phase-zero schema: `clinic_rooms` (12 rooms seeded), `specialty_room_assignments`, `reschedule_backlog`; `appointments` adds `room_id` FK, `split_mode`; `doctors` adds `payment_channel`; `doctor_schedules` slot default 15→20 min |
| V003 | `appointments.updated_by UUID` column |
| V004 | Patient queue tables |
| V005 | Queue enhancements (position tracking, wait time) |
| V006 | `room_id INT`, `room_code VARCHAR` on appointments |
| V007 | Room assignment tracking table |
| V008 | `payment_method`, `payment_status_log`, audit trail on appointments |
| V009 | `visit_type VARCHAR CHECK IN ('consultation','operative','online')` on appointments; used to look up correct compensation rate |

### billing-service — `fadl_billing` DB

| Version | Description |
|---|---|
| V001 | Core tables: `source_fee_rules` (seeded), `financial_transactions` (partitioned + immutability trigger), `financial_events`, `doctor_compensation`, monthly partitions for 2026 |
| V002 | Phase-zero schema: `settlement_records` (immutable trigger), `vendor_invoices`, `cash_flow_events`, `migration_errors`; `financial_transactions` adds `is_foc`, `entry_type`, `settlement_id`; `approved_charge` CHECK relaxed for refund rows; 4 new source codes seeded |
| V003 | Allow `procedure_cost` to be corrected (removed from immutability check) |
| V004 | `extra_services` table (itemised line items per transaction) |
| V005 | Specialty-based rate overrides in `doctor_compensation` |
| V006 | Admin hard-delete capability for transactions |
| V007 | `billing_bulk_audit_log` for bulk operations |
| V008 | Settlement enhancements: password gate, reverse settlement, settled-doctor filter |
| V009 | Relax `protect_financial_amounts()`: split % updatable on pending rows only. Add `recalc_on_split_change()` trigger: auto-recalculates `doctor_share`/`clinic_share` when splits change |

### doctor-service — `fadl_doctors` DB

| Version | Description |
|---|---|
| V001 | Core tables: `specialties`, `doctors`, `doctor_schedules`, `doctor_schedule_overrides` |
| V002 | Reference data seed: specialties populated |
| V003 | Doctor availability calculation support |
| V004 | Room management columns |

---

## 10. Development Workflow

```bash
# Start full stack
docker compose up -d

# Rebuild ONE service after code change (REQUIRED — restart alone reuses old image)
docker compose build <service-name>
docker compose up -d --force-recreate <service-name>

# Rebuild web-portal specifically
docker compose build web-portal
docker compose up -d --force-recreate web-portal

# Apply a new billing migration manually
docker exec -i fcms-postgres-1 psql -U fadl -d fadl_billing < \
  services/billing-service/db/migrations/V009__allow_pending_split_update.sql

# Apply a new appointment migration manually
docker exec -i fcms-postgres-1 psql -U fadl -d fadl_appointments < \
  services/appointment-service/db/migrations/V009__visit_type.sql

# Run doctor compensation backfill (seeds doctor_compensation from doctor profiles)
# Must run from inside billing-service container or with correct env vars:
DOCTOR_SERVICE_URL=http://localhost:3003/api/v1 \
BILLING_SERVICE_URL=http://localhost:3004/api/v1 \
JWT_SECRET=<secret> \
  npx ts-node --transpile-only \
  services/billing-service/scripts/backfill-compensation.ts

# Check logs for a service
docker compose logs -f doctor-service

# Inspect billing DB
docker exec -it fcms-postgres-1 psql -U fadl -d fadl_billing

# Run TypeScript type check in a service
cd services/doctor-service && npx tsc --noEmit
```

**Important rules:**
- Always `docker compose build` + `--force-recreate` after any code change — `docker compose restart` reuses the old image
- Migrations are applied manually via psql — there is no auto-runner on service startup
- Service tokens expire in 24h; they are minted fresh on each inter-service request

---

## 11. Phase & Status

| Phase | Scope | Status |
|---|---|---|
| **Phase 0** | Excel migration spec — data analysis, field mapping, DSL parser, pipeline design | Spec complete (`data.md`); platform ready; awaiting data cutover |
| **Phase 1** | Core platform — all 14 services, all 17 frontend pages, billing logic, RBAC, AI chatbot | **Complete** (May 2026) |
| **Phase 2** | Production hardening — Keycloak RBAC, SMTP/Twilio env vars, PostgreSQL read replicas (`db-replication.md`) | Pending |
| **Phase 3** | Excel cutover — 30-day parallel run, < 0.01% variance gate, doctor sign-offs | Pending |

### Recent Changes (May 2026)

| Date | Change |
|---|---|
| 2026-05-15 | Doctor revenue splits now sync to billing-service on every save; V009 migration allows pending split updates; backfill corrected 27 doctors × 3 visit types |
| 2026-05-15 | Appointment `specialtyId` auto-mapped from selected doctor on create and edit; 5-row SQL backfill |
| 2026-05-15 | Appointment notes field made optional |
| 2026-05-12 | Mandatory fields smart error banner + auto next-slot in appointment modal |
| 2026-05-12 | Password-gate on reverse settlement; settled doctors removed from pending list |
| 2026-05-10 | Settlement enhancements (V008): password gate, bulk settle, Dr%/Cl% display |
