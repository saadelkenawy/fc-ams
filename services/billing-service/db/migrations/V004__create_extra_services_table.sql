-- V004: Per-transaction extra services stored as individual records
-- Replaces the single procedure_cost sum with named line items
-- procedure_cost on financial_transactions is now auto-summed by trigger

CREATE TABLE IF NOT EXISTS transaction_extra_services (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id    UUID          NOT NULL,
  -- No FK: financial_transactions has composite PK (branch_id, transaction_date, id);
  -- referential integrity is enforced at the application layer.
  service_name      VARCHAR(200)  NOT NULL,
  cost              DECIMAL(12,2) NOT NULL CHECK (cost >= 0),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_by        UUID
);

CREATE INDEX IF NOT EXISTS idx_tes_transaction_id
  ON transaction_extra_services(transaction_id);

-- Trigger: whenever extra services change for a transaction, recompute procedure_cost sum
CREATE OR REPLACE FUNCTION sync_procedure_cost_from_extra_services()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_tx_id UUID;
  v_sum   DECIMAL(12,2);
BEGIN
  v_tx_id := COALESCE(NEW.transaction_id, OLD.transaction_id);
  SELECT COALESCE(SUM(cost), 0) INTO v_sum
    FROM transaction_extra_services
   WHERE transaction_id = v_tx_id;

  UPDATE financial_transactions
     SET procedure_cost = CASE WHEN v_sum = 0 THEN NULL ELSE v_sum END
   WHERE id = v_tx_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_procedure_cost
AFTER INSERT OR UPDATE OR DELETE ON transaction_extra_services
FOR EACH ROW EXECUTE FUNCTION sync_procedure_cost_from_extra_services();

COMMENT ON TABLE transaction_extra_services IS
  'Individual extra-service line items per billing transaction. SUM(cost) is synced to financial_transactions.procedure_cost via trigger.';
