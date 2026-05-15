You are working on the Appointments module of the Fadl Clinic Management System (FCMS).
The system has a dark-themed UI with a sidebar nav, an appointments list table, and a
"New Appointment" modal. The stack is Fastify/TypeScript backend + Next.js 13 frontend.

Implement the following 5 features exactly as specified:

---

## Feature 1 — Edit appointment

Add a pencil icon button to every row in the appointments list table, positioned to the
left of the existing ⋮ menu.

- Clicking it opens the existing New Appointment modal pre-populated with all stored
  values: doctor, date, time, duration, appointment type, patient source, session fee,
  notes, payment method, and procedure.
- Modal title becomes "Edit Appointment". "Confirm Booking" label becomes "Save Changes".
- On save, update the existing record in place — do not create a new one.
- Icon is visible only to Admin and Reception roles.
- If appointment status is Complete or Cancelled, the icon is disabled (greyed out,
  cursor: not-allowed, tooltip: "Cannot edit a completed or cancelled appointment").
- All create-flow validation rules apply to the edit flow.

---

## Feature 2 — Mandatory payment method field

Add a PAYMENT METHOD field to the New Appointment modal, placed below SESSION FEE and
above EXTRA SERVICE.

- Render as a segmented button group matching the APPOINTMENT TYPE row style.
- Options: Cash | Visa | InstaPay
- No option pre-selected by default.
- Field is mandatory. "Confirm Booking" is disabled until one option is selected.
- On submit attempt with no selection, show inline error below the field:
  "Payment method is required to confirm this booking."
- Store as: payment_method ENUM('cash', 'visa', 'instapay') NOT NULL on the appointment
  record.
- Pass the value to the billing record created in Feature 4.
- In edit mode, pre-select the stored value. Allow change unless status is Complete or
  Cancelled.

---

## Feature 3 — TBC → Confirmed → Ok! status flow

Modify the Change Status action in the ⋮ menu per this transition map:

  TBC        → allowed next: Confirmed, Cancelled
  Confirmed  → display immediately as Ok! (no intermediate badge shown to user)
  Ok!        → allowed next: Complete, Cancelled
  Complete   → no further changes (greyed out, tooltip: "Appointment is complete")
  Cancelled  → no further changes

Rules:
- When Admin or Reception selects "Confirmed", the row badge updates to "Ok!" instantly.
  "Confirmed" is an internal state only — never displayed as a badge.
- Tab filter counts (TBC, Ok!, etc.) update in real time without page reload.
- Backend: appointment.status ENUM('tbc', 'confirmed', 'ok', 'complete', 'cancelled').
  Map 'confirmed' → display as 'ok' in the frontend status resolver.
- Log every change to appointment_status_log:
  (appointment_id, changed_by staff_id, from_status, to_status, changed_at timestamp).

---

## Feature 4 — Auto-reflect appointment in Billing

On successful appointment creation ("Confirm Booking"), automatically create a linked
billing record. No manual action required.

Field mapping (appointment → billing):
  Doctor name       → doctor grouping key
  Date + time       → time frame column
  Patient name      → patient column
  Session fee (EGP) → charge amount
  Payment method    → payment method column
  Status            → billing status (mirrors appointment status in real time)
  Procedure + cost  → additional line item on the same record (if procedure is set)

Display rules:
- Billing page groups records by doctor name, sorted by date asc then time asc.
- New appointment appears without requiring a hard page reload (optimistic update or
  reactive state).

Sync rules:
- Editing session fee, procedure, or status in Appointments updates the billing record
  automatically.
- Billing records are read-only on the Billing page. All edits flow from Appointments.

---

## Feature 5 — Secure delete with billing audit

When Admin clicks "Delete" from the appointment ⋮ menu, execute this flow:

Step 1 — Redirect:
- Do not show a confirmation dialog on the Appointments page.
- Navigate immediately to the Billing page.
- Scroll to and highlight the corresponding billing row:
  2px solid border in var(--color-border-danger) + var(--color-background-danger) fill.

Step 2 — Auth modal (opens automatically on redirect, on top of the Billing page):
- Title: "Confirm record deletion"
- Field 1: Password (type="password", mandatory, validated server-side against the
  current user's account credentials).
- Field 2: Reason (textarea, mandatory, minimum 10 characters,
  placeholder: "Describe why this record is being deleted...").
- "Confirm Delete" button: red, disabled until both fields pass validation.
- "Cancel" button: aborts deletion, removes highlight, restores the appointment record.

Step 3 — On confirmed delete:
- Hard-delete the appointment record.
- Hard-delete the linked billing record.
- Write to deletion_audit_log:
  (record_type 'appointment', record_id, deleted_by staff_id, deletion_reason,
  deleted_at timestamp, ip_address).
- Show success toast: "Appointment and billing record permanently deleted."

Access control:
- Reception role sees "Delete" greyed out with tooltip:
  "Deletion requires Admin access."
