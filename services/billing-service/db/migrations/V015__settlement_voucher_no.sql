-- V015 — Settlement voucher number
-- Adds a manually-entered external voucher / transaction number captured at
-- settle time (reception/admin types it from the external payment output).
-- Numeric string, up to 12 digits. Stored alongside the immutable settlement
-- record; the immutability trigger only guards UPDATE/DELETE so this DDL is safe.

ALTER TABLE settlement_records
  ADD COLUMN IF NOT EXISTS voucher_no VARCHAR(12);

COMMENT ON COLUMN settlement_records.voucher_no IS
  'External payment voucher/transaction number (digits only, max 12), entered manually at settle time.';
