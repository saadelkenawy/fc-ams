-- Migration: V003 — Allow procedure_cost to be corrected
-- Removes procedure_cost, gross_revenue, doctor_share, clinic_share from the
-- immutability check (they form a consistent derived group).
-- A new BEFORE UPDATE trigger auto-recalculates the derived fields whenever
-- procedure_cost is changed so the group stays internally consistent.

-- 1. Drop old immutability function and recreate without the derived cost fields
CREATE OR REPLACE FUNCTION protect_financial_amounts() RETURNS TRIGGER AS $$
BEGIN
    -- Base financial parameters that must NEVER change after insert
    IF OLD.approved_charge           IS DISTINCT FROM NEW.approved_charge           OR
       OLD.source_fee_percentage     IS DISTINCT FROM NEW.source_fee_percentage     OR
       OLD.source_fee_amount         IS DISTINCT FROM NEW.source_fee_amount         OR
       OLD.split_doctor_percentage   IS DISTINCT FROM NEW.split_doctor_percentage   OR
       OLD.split_clinic_percentage   IS DISTINCT FROM NEW.split_clinic_percentage   OR
       OLD.currency_code             IS DISTINCT FROM NEW.currency_code             OR
       OLD.exchange_rate             IS DISTINCT FROM NEW.exchange_rate             OR
       OLD.is_refund                 IS DISTINCT FROM NEW.is_refund                 OR
       OLD.original_transaction_id   IS DISTINCT FROM NEW.original_transaction_id  OR
       OLD.is_foc                    IS DISTINCT FROM NEW.is_foc                    OR
       OLD.entry_type                IS DISTINCT FROM NEW.entry_type
    THEN
        RAISE EXCEPTION 'Core financial amounts are immutable. Use a refund transaction to reverse a charge.'
            USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Add trigger that auto-recalculates gross_revenue / doctor_share / clinic_share
--    whenever procedure_cost is updated, keeping the group consistent.
CREATE OR REPLACE FUNCTION recalc_on_procedure_cost_change() RETURNS TRIGGER AS $$
BEGIN
    IF OLD.procedure_cost IS DISTINCT FROM NEW.procedure_cost THEN
        NEW.gross_revenue := (OLD.approved_charge - OLD.source_fee_amount)
                             + COALESCE(NEW.procedure_cost, 0);
        NEW.doctor_share  := ROUND(NEW.gross_revenue * OLD.split_doctor_percentage / 100, 2);
        NEW.clinic_share  := ROUND(NEW.gross_revenue * OLD.split_clinic_percentage  / 100, 2);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Fire BEFORE the immutability trigger so derived values are set before the check runs
-- (triggers fire in alphabetical order: 'enforce_...' > 'aaa_recalc_...')
CREATE TRIGGER aaa_recalc_procedure_cost
    BEFORE UPDATE ON financial_transactions
    FOR EACH ROW EXECUTE FUNCTION recalc_on_procedure_cost_change();
