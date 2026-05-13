-- Migration V006: Remove hard-delete prevention trigger.
-- Compliance is now enforced via deletion_audit_log in appointment-service.
-- Admin-initiated deletes are authenticated, password-verified, and audited.

DROP TRIGGER IF EXISTS no_delete_financial_transactions ON financial_transactions;
DROP FUNCTION IF EXISTS prevent_financial_delete();
