-- Migration V009: Allow split percentages to be corrected on pending transactions
--
-- Before this migration, split_doctor_percentage and split_clinic_percentage were
-- in the hard-immutable group alongside approved_charge.  That blocked the
-- `setDoctorCompensation(applyToExisting=true)` path which needs to back-patch
-- pending transactions when a doctor's revenue split is changed in their profile.
--
-- Change: remove split percentages from the hard-immutability check and guard them
-- instead with a softer rule: changes are allowed only when payment_status is NOT
-- in ('reconciled', 'refunded').  When splits change on a pending row, auto-
-- recalculate doctor_share and clinic_share so the amounts stay consistent.

-- ─── 1. Update the hard-immutability trigger function ─────────────────────────
CREATE OR REPLACE FUNCTION protect_financial_amounts() RETURNS TRIGGER AS $$
BEGIN
    -- Core charge / fee fields that must NEVER change after insert
    IF OLD.approved_charge           IS DISTINCT FROM NEW.approved_charge           OR
       OLD.source_fee_percentage     IS DISTINCT FROM NEW.source_fee_percentage     OR
       OLD.source_fee_amount         IS DISTINCT FROM NEW.source_fee_amount         OR
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

    -- Split percentages may only be changed on pending (not yet settled) rows
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

-- ─── 2. Add recalculation trigger for split percentage changes ─────────────────
-- Fires BEFORE the immutability check (alphabetical: 'aab_' < 'enforce_').
-- When split percentages change on a pending row, recompute doctor_share and
-- clinic_share from the stored gross_revenue.
CREATE OR REPLACE FUNCTION recalc_on_split_change() RETURNS TRIGGER AS $$
BEGIN
    IF (OLD.split_doctor_percentage IS DISTINCT FROM NEW.split_doctor_percentage OR
        OLD.split_clinic_percentage IS DISTINCT FROM NEW.split_clinic_percentage)
    THEN
        NEW.doctor_share := ROUND(OLD.gross_revenue * NEW.split_doctor_percentage / 100, 2);
        NEW.clinic_share := ROUND(OLD.gross_revenue * NEW.split_clinic_percentage / 100, 2);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER aab_recalc_split_change
    BEFORE UPDATE ON financial_transactions
    FOR EACH ROW EXECUTE FUNCTION recalc_on_split_change();
