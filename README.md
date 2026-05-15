# Fadl Clinic Management System (FC-AMS)

A microservices-based clinic management platform replacing the Excel-based operation of Fadl Clinic (فضل كلينك), an Egyptian multi-specialty medical clinic with 30+ specialties.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                         │
│              Next.js 13 App Router — web-portal (:3000)                 │
│         Bilingual (AR/EN), RTL-first, dark sidebar + light canvas        │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ REST (axios via /api/v1)
┌───────────────────────────────▼─────────────────────────────────────────┐
│                       BACKEND SERVICES                                   │
│                                                                          │
│  identity-service  :3000 │ JWT auth, RBAC roles, change-password        │
│  patient-service   :3002 │ Patient CRUD, soft delete, full-text search  │
│  appointment-svc   :3001 │ Scheduling, status workflow, double-booking  │
│                          │ exclusion, walk-in queue, room assignment     │
│  doctor-service    :3003 │ Doctor CRUD, schedules, overrides, revenue   │
│                          │ splits (consultation/operative/online),       │
│                          │ syncs splits → billing-service on save        │
│  billing-service   :3004 │ Financial transactions (immutable ledger),   │
│                          │ settlements, doctor_compensation rates,       │
│                          │ VAT, source fee rules, idempotency keys       │
│  analytics-service :3009 │ Revenue overview, doctor earnings, source    │
│                          │ breakdown, specialty stats, no-show trends    │
│  procedure-service :3006 │ Procedure catalogue CRUD (9 seeded)          │
│  ehr-service       :3005 │ Clinical encounters, EHR records             │
│  notification-svc  :3007 │ Email (nodemailer/SMTP) + Twilio SMS         │
│  ai-chatbot-svc    :3008 │ OpenRouter LLM intent parser; registers      │
│                          │ patients, books appointments, bilingual       │
│  integration-svc   :3012 │ Webhook handlers: Vizita/Ekshf/CliniDo/     │
│                          │ InstaPay inbound events                       │
│  file-service      :3011 │ Presigned upload/download via MinIO          │
│  procurement-svc   :3010 │ Purchase orders, vendor management           │
│  telehealth-svc    :3013 │ Online consultation session management        │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────────────┐
│                      INFRASTRUCTURE                                       │
│                                                                          │
│  PostgreSQL 16     Single cluster; logical databases per domain:         │
│                      fadl_appointments  fadl_billing                     │
│                      fadl_doctors       fadl_patients                    │
│                      fadl_identity      fadl_ehr                         │
│  PgBouncer         Connection pooling in front of PostgreSQL             │
│  Redis 7           Session cache, idempotency key store                  │
│  MinIO             Object storage for file uploads                       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Service Communication

- **Synchronous:** REST over HTTP, service tokens (HS256 JWT, `role: admin`) for service-to-service calls
- **Doctor → Billing sync:** When `doctor-service` saves `revenue_splits`, it immediately calls `billing-service POST /compensation/:doctorId` for all three visit types (consultation, operative, online) with `applyToExisting: true`, back-patching pending financial transactions
- **Auth:** HS256 JWT signed with shared `JWT_SECRET`; `branchId` claim enforced via Row-Level Security on every PostgreSQL query

---

## Database Design Principles

| Principle | Implementation |
|---|---|
| Immutable billing ledger | `protect_financial_amounts()` trigger blocks changes to core charge fields after insert; split %s updatable only on pending rows (V009) |
| Row-Level Security | Every service sets `app.branch_id` session variable; RLS policies filter all tables by `branch_id` |
| UUID primary keys | All entity tables use `gen_random_uuid()` |
| Soft deletes | `deleted_at TIMESTAMPTZ` + `deleted_at IS NULL` in all queries |
| Optimistic concurrency | `version INT` column on `doctors`, incremented on every update; conflicts return 409 |
| Idempotency | `idempotency_key` on `financial_transactions`; duplicate requests return existing record |
| Migrations (Flyway-style) | Sequential `V001__...sql` files; applied manually via psql; no auto-runner on startup |

---

## Key Business Flows

### Appointment Creation
1. Receptionist selects patient + doctor (specialty auto-mapped from doctor)
2. Frontend sends `POST /appointments` with `specialtyId` from selected doctor
3. `appointment-service` checks exclusion constraint (no double-booking same room + slot)
4. On success, `billing-service` creates a pending `financial_transaction` using the doctor's current `doctor_compensation` rate for the visit type

### Doctor Revenue Splits
- Stored as JSONB `revenue_splits` in `doctors` table (consultation/operative/online × doctorPercentage/clinicPercentage)
- Mirrored to `billing_service.doctor_compensation` table (per-doctor, per-visit-type, per-branch)
- When splits change, `billing-service` back-patches all pending transactions for that doctor via `recalc_on_split_change()` trigger
- Backfill script: `billing-service/scripts/backfill-compensation.ts`

### Settlement Flow
1. Finance selects doctor → views paid (unsettled) transactions
2. Confirms settlement amount → password gate (admin password required)
3. Settlement record created; transactions marked `reconciled`
4. Reconciled transactions locked: split % changes blocked by `protect_financial_amounts()` trigger

### Walk-in Queue
- Room-based queue via `appointment-service`; receptionist assigns room
- Status workflow: `TBC` → `confirmed` → `in_session` → `completed` / `cancelled` / `rescheduled`

---

## Frontend Structure

```
frontend/web-portal/src/
  app/                   Next.js 13 App Router pages
    (auth)/login/        Login page
    (dashboard)/         All authenticated pages
      page.tsx           Dashboard (stat cards, status counts)
      appointments/      Appointment list + AddAppointmentModal
      patients/          Patient list + detail + files
      doctors/           Doctor list + schedule management
      billing/           Billing transactions + settlement
      analytics/         Revenue charts + breakdowns
      reports/           Monthly financial reports
      receptionist/      Quick-entry walk-in flow
      encounters/        EHR encounter list
      procedures/        Procedure catalogue CRUD
      sources/           Patient source fee rules CRUD
      settings/          Health checks + change password
      chatbot/           AI-assisted registration/booking
      integrations/      Webhook event log (admin only)
  components/            Shared UI components
    appointments/        AddAppointmentModal, AppointmentTable
    billing/             BillingTable, SettlementPanel
    ui/                  StatCard, DataTable, ActionButtons, badges
  contexts/              LanguageContext (AR/EN), ThemeContext
  lib/                   API clients (axios instances per service)
```

---

## Migrations Applied

### appointment-service (fadl_appointments DB)
| Version | Description |
|---|---|
| V001 | Core appointments, doctors replica, specialties, rooms tables |
| V002 | Phase-zero schema: clinic_rooms, specialty_room_assignments, reschedule_backlog |
| V003 | `updated_by` column on appointments |
| V004 | Patient queue tables |
| V005 | Queue enhancements |
| V006 | Room columns on appointments (`room_id`, `room_code`) |
| V007 | Room assignments |
| V008 | Payment method, status log, audit trail |
| V009 | `visit_type` on appointments and financial transactions |

### billing-service (fadl_billing DB)
| Version | Description |
|---|---|
| V001 | Core billing tables: `financial_transactions`, `settlements`, `doctor_compensation`, `source_fee_rules` |
| V002 | Phase-zero schema: `settlement_records`, `vendor_invoices`, `cash_flow_events`, `migration_errors` |
| V003 | Allow `procedure_cost` updates |
| V004 | Extra services table |
| V005 | Specialty-based rates |
| V006 | Admin hard-delete capability |
| V007 | Billing bulk audit log |
| V008 | Settlement enhancements (password gate, reverse settlement) |
| V009 | Relax immutability trigger: split % updatable on pending rows; `recalc_on_split_change()` trigger added |

---

## Development Workflow

```bash
# Start all services
docker compose up -d

# Rebuild a single service after code change
docker compose build <service-name>
docker compose up -d --force-recreate <service-name>

# Apply a new migration manually
docker exec -i fcms-postgres-1 psql -U fadl -d fadl_billing < \
  services/billing-service/db/migrations/V009__allow_pending_split_update.sql

# Backfill doctor compensation from doctor service
docker exec fcms-doctor-service-1 \
  npx ts-node --transpile-only scripts/backfill-compensation.ts
```

---

## Phase Status

| Phase | Status |
|---|---|
| Phase 0 — Excel migration spec | Spec complete; awaiting data cutover |
| Phase 1 — Core platform | **Complete** — all 13 services running, all 17 frontend pages live |
| Phase 2 — Production hardening | Pending: Keycloak RBAC, SMTP/Twilio env vars, read replicas |
| Phase 3 — Excel cutover | Pending: 30-day parallel run required before cutover |
