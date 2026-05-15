CREATE TABLE IF NOT EXISTS billing_bulk_audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type   TEXT NOT NULL CHECK (action_type IN ('BULK_EDIT', 'BULK_DELETE')),
  performed_by  UUID NOT NULL,
  performed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  affected_ids  UUID[] NOT NULL,
  changes       JSONB,          -- {field, before[], after[]} for BULK_EDIT
  deleted_snapshot JSONB,       -- full records snapshot for BULK_DELETE
  reason        TEXT NOT NULL,
  ip_address    TEXT,
  branch_id     INTEGER
);

CREATE INDEX IF NOT EXISTS idx_billing_bulk_audit_performed_at ON billing_bulk_audit_log (performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_bulk_audit_performed_by ON billing_bulk_audit_log (performed_by);
