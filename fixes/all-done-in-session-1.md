# Session 1 — Complete Change Reference

All changes made during the first multi-session implementation sprint.
Use this document as the canonical reference for any new session continuing this work.

---

## Summary of Implemented Features

From `fixes/appointment-reflect-billing.md`:

| # | Feature | Status |
|---|---------|--------|
| 1 | Edit Appointment (pencil icon, pre-populated modal, PATCH) | Done |
| 2 | Mandatory payment method (Cash / Visa / InstaPay) | Done |
| 3 | Simplified TBC → Ok! → Complete status flow | Done |
| 4 | Auto-reflect appointment in Billing on create | Done |
| 5 | Secure delete with billing audit (password + reason) | Done |

---

## Bug Fix: Walk-in Appointment Type

**Problem**: Walk-in appointments were failing with a DB enum mismatch.
The old compiled JS in `/app/dist/` still had the old code after `docker compose restart`
(restart does NOT recompile TypeScript).

**Fix applied**:
- Fixed enum value mapping in `appointment.repository.ts`
- Required `docker compose build appointment-service && docker compose up -d --no-deps appointment-service`

---

## Database Migrations

### appointment-service — V008__payment_method_status_log_audit.sql
- Adds `payment_method VARCHAR(20) CHECK (payment_method IN ('cash', 'visa', 'instapay'))` to `appointments`
- Creates `appointment_status_log (id, appointment_id, from_status, to_status, changed_by, changed_at, branch_id)`
- Creates `deletion_audit_log (id, record_type, record_id, deleted_by, deletion_reason, deleted_at, ip_address, branch_id)`

### billing-service — V006__allow_admin_hard_delete.sql
- Drops `prevent_financial_delete` trigger on `financial_transactions`
- Drops `prevent_financial_delete()` function
- Required for Feature 5 hard deletes; audit trail replaces trigger protection

---

## Backend Changes

### shared/types/src/appointment.ts
- Added `export type PaymentMethod = 'cash' | 'visa' | 'instapay'`
- Added `paymentMethod?: PaymentMethod` field to `Appointment` interface

### shared/types/src/doctor.ts
- Renamed `PaymentMethod` → `DoctorPaymentMethod` to avoid export conflict with appointment.ts
- Updated `Doctor.paymentMethod` field to use `DoctorPaymentMethod`

### services/appointment-service/src/repositories/appointment.repository.ts
Complete rewrite — key additions:
- `ALLOWED_TRANSITIONS`: `TBC: ['Ok!', 'Canc.']`, `Ok!: ['Comp.', 'Canc.']`
- `createAppointment` now:
  - Includes `payment_method` at position $11 in INSERT
  - Queries doctor split percentages and returns them on the result object
  - Inserts initial row into `appointment_status_log`
- `updateAppointment(id, input, updatedBy)` — NEW — builds dynamic SET clause, rejects terminal status edits
- `updateAppointmentStatus` now logs every change to `appointment_status_log`
- `hardDeleteAppointment(id, deletedBy, reason, ipAddress, branchId)` — NEW — writes to `deletion_audit_log` then hard deletes
- `softDeleteAppointment` kept for backward compat

### services/appointment-service/src/controllers/appointment.controller.ts
Complete rewrite — key additions:
- `createSchema` includes optional `paymentMethod: z.enum(['cash', 'visa', 'instapay'])`
- `updateSchema` — NEW — all appointment fields optional for PATCH
- `deleteSchema` — NEW — requires `password: z.string().min(1)` and `reason: z.string().min(10)`
- `createAppointment`: fire-and-forget `createBillingTransaction` after DB insert when `approvedCharge > 0`
- `updateAppointment` — NEW handler — calls `repo.updateAppointment`
- `deleteAppointment`: verifies password via identity service, calls `hardDeleteAppointment`, fire-and-forget `deleteTransactionByAppointment`

### services/appointment-service/src/routes/appointment.routes.ts
- POST body: added `paymentMethod: { type: 'string', enum: ['cash', 'visa', 'instapay'] }`
- NEW PATCH `/appointments/:id` route (receptionist + admin, all fields optional)
- DELETE body now requires `password` (string) and `reason` (string, minLength 10)

### services/appointment-service/src/clients/billing.ts
- Added `procedureCost?: number` and `paymentMethod?: string` to `CreateBillingTransactionInput`
- Added `deleteTransactionByAppointment(appointmentId)` — calls `DELETE /transactions/by-appointment/:appointmentId`

### services/appointment-service/src/clients/identity.ts (NEW)
- `verifyUserPassword(authHeader, password)` — POST `/auth/verify-password`, returns `boolean`

### services/appointment-service/src/config/index.ts
- Added `IDENTITY_SERVICE_URL: z.string().default('http://localhost:3000/api/v1')`

### services/identity-service/src/controllers/auth.controller.ts
- Added `verifyPasswordEndpoint` — accepts bearer token + `{password}`, returns `{valid: boolean}`
- Added `deleteUser` — admin hard deletes user (prevents self-delete)

### services/identity-service/src/repositories/identity.repository.ts
- Added `deleteUser(userId)` — `DELETE FROM users WHERE id = $1`

### services/identity-service/src/routes/auth.routes.ts
- Added `DELETE /users/:id` (admin only)
- Added `POST /auth/verify-password` (requireAuth, body: `{password: string}`)

### services/billing-service/src/repositories/billing.repository.ts
- Added `deleteTransactionByAppointmentId(appointmentId)` — hard delete by appointment FK

### services/billing-service/src/controllers/billing.controller.ts
- Added `deleteTransactionByAppointmentHandler` — calls repo, returns 204

### services/billing-service/src/routes/billing.routes.ts
- Added `DELETE /transactions/by-appointment/:appointmentId` (admin only, UUID param)

### docker-compose.yml
- appointment-service env: added `IDENTITY_SERVICE_URL: http://identity-service:3000/api/v1`
- appointment-service depends_on: added `identity-service: condition: service_healthy`

---

## Frontend Changes

### frontend/web-portal/src/components/appointments/AddAppointmentModal.tsx
Complete rewrite — key additions:
- `PAYMENT_METHODS = [{value:'cash', Icon:Banknote}, {value:'visa', Icon:CreditCard}, {value:'instapay', Icon:Smartphone}]`
- Added `diffMinutes(start, end)` helper
- `PatientPicker` accepts `disabled?: boolean` prop
- Props: added `editAppointment?: Appointment`, `editPatient?: Patient | null`, `editDoctor?: Doctor | null`
- `isEdit = !!editAppointment`
- All state initialized from `editAppointment` fields; `useEffect` syncs on `[open, editAppointment?.id]`
- `paymentMethod` state: `useState<'cash' | 'visa' | 'instapay' | null>(editAppointment?.paymentMethod ?? null)`
- Validation: blocks submit + disables Confirm button when `!paymentMethod`
- Inline error: "Payment method is required to confirm this booking."
- Edit mode: PATCH to `/appointments/${editAppointment.id}`, patient field disabled
- Title: "Edit Appointment" / button: "Save Changes" in edit mode

### frontend/web-portal/src/app/(dashboard)/appointments/page.tsx
Key changes:
- Added `useRouter` from `next/navigation`, `useAuth` from `@/contexts/AuthContext`
- Added `Patient`, `Doctor` type imports
- **Feature 3**: Updated `TRANSITIONS`:
  - `TBC: ['Ok!', 'Canc.']` (removed Conf.)
  - `Ok!: ['Comp.', 'Canc.']` (direct to Complete, not Conf.)
- **Feature 1**: `ActionMenu` updated with `onEdit` and `userRole` props:
  - Shows inline pencil button for admin/receptionist on non-terminal appointments
  - MoreVertical dropdown: Change Status + Delete
  - Delete greyed out for receptionist with tooltip "Only administrators can delete"
- **Feature 5**: `handleDelete(a)` navigates to `/billing?deleteApptId=${a.id}`
- `editAppt`, `editPatientState`, `editDoctorState` state for edit modal
- `handleEdit(a)` resolves patient/doctor from maps then opens edit modal
- Second `<AddAppointmentModal>` instance for edit mode (separate from create modal)
- Removed old `DeleteModal` component entirely

### frontend/web-portal/src/app/(dashboard)/billing/page.tsx
Key additions for Feature 5:
- Imports: `useSearchParams`, `useRouter` from `next/navigation`; `appointmentApi`; `Trash2`, `ShieldAlert` icons
- `SecureDeleteModal` component:
  - Password field + Reason textarea (min 10 chars with live counter)
  - Calls `DELETE /appointments/:id` with `{password, reason}` body
  - On success: toast + navigate back to `/appointments`
  - On error: shows API error message inline
- `BillingPage`:
  - Reads `deleteApptId` from search params
  - Auto-opens `SecureDeleteModal` and scrolls to linked row
  - Transaction row highlighted with `border-2 border-red-400 bg-red-50` when `tx.appointmentId === deleteApptId`
  - `id="delete-target-row"` for scroll target

---

## Architecture Decisions

### Password verification flow
The appointment-service calls the identity-service's `POST /auth/verify-password` endpoint
(forwarding the user's Authorization header). The identity service verifies with scrypt and
returns `{valid: boolean}`. The appointment-service rejects the delete if `valid === false`.

### Billing immutability preserved
The `protect_financial_amounts` trigger still blocks amount changes after creation.
Only the `prevent_financial_delete` trigger was removed (replaced by `deletion_audit_log`).
Fee edits do NOT auto-update billing — amounts are locked at creation time.

### Status flow simplification
Kept existing DB ENUM values (TBC, Ok!, Conf., Comp., Canc.) to avoid
partition table migration risk. Frontend TRANSITIONS map simplified:
- TBC → [Ok!, Canc.] (direct confirm, no intermediate Conf. step)
- Ok! → [Comp., Canc.] (direct to complete or cancel)

### Service-to-service auth
All inter-service calls that require auth forward the user's Bearer token
(e.g., identity verification). Service-to-service calls that don't need user
auth use a nil-UUID JWT (e.g., billing delete called from appointment-service).

---

## Services to Rebuild After Session

Run after any code change:
```bash
docker compose build appointment-service billing-service identity-service web-portal
docker compose up -d --no-deps appointment-service billing-service identity-service web-portal
```

Run DB migrations (Flyway auto-runs on service start from `db/migrations/`).
The migrations are version-locked so re-running is idempotent.

---

## Known Limitations / Future Work

1. **Billing amounts not updated on appointment edit** — approvedCharge edits in the appointment form
   do not patch the billing transaction (amounts are immutable post-creation).
   Workaround: cancel old appointment + create new one.

2. **Payment method not validated at backend for edit** — PATCH `/appointments/:id` accepts
   `paymentMethod` but does not require it if the field already exists from creation.

3. **Multi-branch delete** — `deleteTransactionByAppointmentId` deletes across branches.
   If appointments span branches (future multi-branch feature), this may need scoping.

4. **No email/SMS notification on delete** — deletion is logged but not notified.
   Add a notification trigger in `deletion_audit_log` insert if needed.
