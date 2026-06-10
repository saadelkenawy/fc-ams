-- §3.5: the UNIQUE (branch_id, transaction_date, idempotency_key) constraint on
-- financial_transactions is per-partition, so the same key on a different
-- transaction_date (retry crossing midnight, back-dated correction) inserts a
-- duplicate. This non-partitioned claim table makes the key globally unique per
-- branch: createTransaction INSERTs here in the same tx as the transaction row,
-- and an ON CONFLICT miss means another tx already owns the key.

CREATE TABLE IF NOT EXISTS idempotency_keys (
    branch_id        INT          NOT NULL,
    idempotency_key  VARCHAR(100) NOT NULL,
    transaction_id   UUID         NOT NULL,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (branch_id, idempotency_key)
);

ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY idem_branch_isolation ON idempotency_keys
    FOR ALL
    USING (branch_id = current_setting('app.current_branch_id', TRUE)::INT);
ALTER TABLE idempotency_keys FORCE ROW LEVEL SECURITY;

-- Backfill from existing transactions. Where the per-date constraint already
-- let duplicates through, keep the earliest row as the canonical owner.
INSERT INTO idempotency_keys (branch_id, idempotency_key, transaction_id, created_at)
SELECT DISTINCT ON (branch_id, idempotency_key)
       branch_id, idempotency_key, id, created_at
FROM financial_transactions
WHERE idempotency_key IS NOT NULL
ORDER BY branch_id, idempotency_key, created_at ASC
ON CONFLICT (branch_id, idempotency_key) DO NOTHING;
