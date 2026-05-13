-- Migration V008: payment_method on appointments, status log, deletion audit log

-- ─── payment_method ───────────────────────────────────────────────────────────
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20)
    CHECK (payment_method IN ('cash', 'visa', 'instapay'));

-- ─── appointment_status_log ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointment_status_log (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID        NOT NULL,
  from_status    VARCHAR(20),
  to_status      VARCHAR(20) NOT NULL,
  changed_by     UUID        NOT NULL,
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  branch_id      INT         NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_status_log_appt
  ON appointment_status_log (appointment_id, changed_at DESC);

-- ─── deletion_audit_log ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deletion_audit_log (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  record_type      VARCHAR(50) NOT NULL,
  record_id        UUID        NOT NULL,
  deleted_by       UUID        NOT NULL,
  deletion_reason  TEXT        NOT NULL,
  deleted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address       VARCHAR(45),
  branch_id        INT         NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_deletion_audit_record
  ON deletion_audit_log (record_type, record_id);
