-- Migration: V011 — Allow approved_charge to be corrected on non-reconciled transactions
-- Removes approved_charge and source_fee_amount from the immutability guard.
-- A BEFORE UPDATE trigger recalculates source_fee_amount, gross_revenue, doctor_share,
-- and clinic_share whenever approved_charge changes, keeping the group consistent.
-- Trigger naming: "aab_" fires after aaa_recalc_procedure_cost, before enforce_financial_immutability.

-- 1. Recreate immutability guard without approved_charge / source_fee_amount
CREATE OR REPLACE FUNCTION protect_financial_amounts() RETURNS TRIGGER AS $$
BEGIN
    IF OLD.source_fee_percentage   IS DISTINCT FROM NEW.source_fee_percentage   OR
       OLD.split_doctor_percentage IS DISTINCT FROM NEW.split_doctor_percentage OR
       OLD.split_clinic_percentage IS DISTINCT FROM NEW.split_clinic_percentage OR
       OLD.currency_code           IS DISTINCT FROM NEW.currency_code           OR
       OLD.exchange_rate           IS DISTINCT FROM NEW.exchange_rate           OR
       OLD.is_refund               IS DISTINCT FROM NEW.is_refund               OR
       OLD.original_transaction_id IS DISTINCT FROM NEW.original_transaction_id OR
       OLD.is_foc                  IS DISTINCT FROM NEW.is_foc                  OR
       OLD.entry_type              IS DISTINCT FROM NEW.entry_type
    THEN
        RAISE EXCEPTION 'Core financial amounts are immutable. Use a refund transaction to reverse a charge.'
            USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Add trigger that recalculates derived fields when approved_charge changes.
--    Uses stored percentages so the original rate contract is preserved.
CREATE OR REPLACE FUNCTION recalc_on_charge_change() RETURNS TRIGGER AS $$
BEGIN
    IF OLD.approved_charge IS DISTINCT FROM NEW.approved_charge THEN
        NEW.source_fee_amount := ROUND(NEW.approved_charge * OLD.source_fee_percentage / 100, 2);
        NEW.gross_revenue     := ROUND(
            (NEW.approved_charge - NEW.source_fee_amount) + COALESCE(NEW.procedure_cost, 0),
            2
        );
        NEW.doctor_share := ROUND(NEW.gross_revenue * OLD.split_doctor_percentage / 100, 2);
        NEW.clinic_share := ROUND(NEW.gross_revenue * OLD.split_clinic_percentage  / 100, 2);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Fire BEFORE the immutability trigger (alphabetical: aab_ < enforce_)
-- and AFTER aaa_recalc_procedure_cost so procedure_cost is already settled in NEW.
CREATE TRIGGER aab_recalc_charge
    BEFORE UPDATE ON financial_transactions
    FOR EACH ROW EXECUTE FUNCTION recalc_on_charge_change();
