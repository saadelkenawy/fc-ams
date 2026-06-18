-- Migration V016: Freeze approved_charge / procedure_cost once a transaction is settled.
--
-- BUG (defense-in-depth gap): V011 dropped approved_charge + source_fee_amount from
-- the hard-immutable group so pending charges could be corrected, and V003 did the
-- same for procedure_cost. But neither added a payment_status guard — unlike the
-- split-% soft guard (V009/V012). Result: a direct
--   UPDATE financial_transactions SET approved_charge = ... WHERE id = <settled row>
-- succeeds on a 'paid'/'reconciled'/'refunded' row, and aab_recalc_charge /
-- aaa_recalc_procedure_cost silently rewrite gross_revenue + doctor_share +
-- clinic_share AFTER settlement. The app layer blocks reconciled/refunded but
-- still allows 'paid', and any holder of fadl_app UPDATE bypasses the app entirely,
-- so the "immutable ledger" promise was app-only, not DB-enforced.
--
-- Fix: extend protect_financial_amounts() with a soft guard mirroring the split
-- rule — approved_charge and procedure_cost may only change while the row is not
-- yet settled (payment_status NOT IN paid/reconciled/refunded). Corrections on
-- pending/verified/approved rows still work and still recalc via the aab_/aaa_
-- triggers (which fire first, alphabetically before enforce_).

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

    -- approved_charge / procedure_cost may only be corrected on not-yet-settled
    -- rows. Once paid/reconciled/refunded the money group is frozen so settlement
    -- figures can never be back-dated. Derived shares are recalculated by
    -- aab_recalc_charge / aaa_recalc_procedure_cost on the still-mutable rows.
    IF (OLD.approved_charge IS DISTINCT FROM NEW.approved_charge OR
        OLD.procedure_cost  IS DISTINCT FROM NEW.procedure_cost)
       AND OLD.payment_status IN ('paid', 'reconciled', 'refunded')
    THEN
        RAISE EXCEPTION 'Charge and procedure cost are immutable on settled transactions. Use a refund transaction to reverse a charge.'
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
