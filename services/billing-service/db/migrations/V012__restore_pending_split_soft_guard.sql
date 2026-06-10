-- Migration V012: Restore the V009 soft-guard for split percentages.
--
-- REGRESSION FIX: V011 recreated protect_financial_amounts() to relax
-- approved_charge, but its version was based on the pre-V009 function — it
-- re-added split_doctor_percentage / split_clinic_percentage to the HARD
-- immutable group. That silently broke the documented business rule that
-- doctor revenue-split changes back-patch all pending transactions
-- (setDoctorCompensation(applyToExisting=true) → UPDATE splits → P0001).
--
-- This migration merges both intents:
--   * approved_charge / source_fee_amount stay updatable (V011) — derived
--     fields are recalculated by aab_recalc_charge.
--   * split percentages are updatable ONLY while payment_status is not
--     reconciled/refunded (V009) — shares recalculated by aab_recalc_split_change.
--   * everything else in the core group stays hard-immutable.

CREATE OR REPLACE FUNCTION protect_financial_amounts() RETURNS TRIGGER AS $$
BEGIN
    -- Core fee/identity fields that must NEVER change after insert
    IF OLD.source_fee_percentage   IS DISTINCT FROM NEW.source_fee_percentage   OR
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

    -- Split percentages may only be changed on not-yet-settled rows
    IF (OLD.split_doctor_percentage IS DISTINCT FROM NEW.split_doctor_percentage OR
        OLD.split_clinic_percentage IS DISTINCT FROM NEW.split_clinic_percentage)
       AND OLD.payment_status IN ('reconciled', 'refunded')
    THEN
        RAISE EXCEPTION 'Revenue split percentages are immutable on reconciled or refunded transactions.'
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
