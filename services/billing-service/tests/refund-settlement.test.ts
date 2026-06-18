/**
 * Refund vs settlement immutability (review finding C-🔴).
 *
 * When a financial_transaction has already been settled (a settlement_record
 * references it), refunding it must NOT silently orphan the settlement. The
 * settlement immutability trigger (prevent_settlement_modification, P0003)
 * blocks the DELETE the refund path attempts — the refund must surface that as
 * a clean rejection and leave both rows untouched, not abort opaquely.
 *
 * Exercises the real repository function (public interface), as fadl_app with
 * RLS context, against the dev stack PostgreSQL.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { randomUUID, generateKeyPairSync } from 'crypto';

// config/index.ts parses env at module load — set it before importing the repo.
process.env.NODE_ENV = 'development'; // vitest forces 'test', which the schema rejects
process.env.DATABASE_URL ??= 'postgresql://fadl_app:fadl_app_dev_secret@localhost:5432/fadl_billing';
// config decodes JWT_PUBLIC_KEY_B64 → base64 of a real PEM. The refund path under
// test never uses it, but config validates it eagerly at load.
const { publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
process.env.JWT_PUBLIC_KEY_B64 ??= Buffer.from(publicKey).toString('base64');
process.env.SERVICE_JWT_SECRET ??= 'x'.repeat(32);
process.env.BRANCH_ID ??= '1';

const ADMIN_BASE = process.env.TEST_PG_ADMIN_BASE ?? 'postgresql://fadl:fadl_dev_secret@localhost:5432';
const admin = new Pool({ connectionString: `${ADMIN_BASE}/fadl_billing`, max: 1 });
const TEST_SOURCE = 'REFUND_SETTLE_TEST';

type Repo = typeof import('../src/repositories/billing.repository');
let repo: Repo;

beforeAll(async () => {
  repo = await import('../src/repositories/billing.repository');
});

afterAll(async () => {
  // fadl owns the table with BYPASSRLS, so cleanup needs no branch context.
  // settlement_records is delete-protected by prevent_settlement_modification
  // (P0003); session_replication_role = replica disables triggers so the test
  // fixtures can be torn down.
  const client = await admin.connect();
  try {
    await client.query(`SET session_replication_role = replica`);
    await client.query(`DELETE FROM settlement_records WHERE notes = $1`, [TEST_SOURCE]);
    await client.query(`DELETE FROM financial_transactions WHERE patient_source = $1`, [TEST_SOURCE]);
  } finally {
    await client.query(`SET session_replication_role = origin`).catch(() => {});
    client.release();
  }
  await admin.end();
});

async function seedSettledTxn(): Promise<string> {
  const id = randomUUID();
  await admin.query(
    `INSERT INTO financial_transactions
       (id, idempotency_key, patient_id, doctor_id, patient_source,
        approved_charge, gross_revenue, split_doctor_percentage, split_clinic_percentage,
        doctor_share, clinic_share, payment_status, transaction_date, branch_id)
     VALUES ($1, $2, $3, $4, $5, 1000, 1000, 50, 50, 500, 500, 'paid', CURRENT_DATE, 1)`,
    [id, `refund-settle-${id}`, randomUUID(), randomUUID(), TEST_SOURCE],
  );
  await admin.query(
    `INSERT INTO settlement_records
       (doctor_id, settlement_date, amount, payment_method, related_transaction_ids, notes, branch_id)
     VALUES ($1, CURRENT_DATE, 500, 'cash', ARRAY[$2]::uuid[], $3, 1)`,
    [randomUUID(), id, TEST_SOURCE],
  );
  return id;
}

describe('refund of a settled transaction', () => {
  it('is rejected cleanly and leaves the settlement + transaction intact', async () => {
    const id = await seedSettledTxn();

    await expect(repo.updatePaymentStatus(id, 'refunded', randomUUID())).rejects.toMatchObject({
      statusCode: 409,
      code: 'TRANSACTION_SETTLED',
    });

    // Settlement must still exist — never silently orphaned.
    const { rows: settlements } = await admin.query(
      `SELECT 1 FROM settlement_records WHERE $1::uuid = ANY(related_transaction_ids)`, [id],
    );
    expect(settlements).toHaveLength(1);

    // Transaction must NOT have flipped to refunded.
    const { rows: txn } = await admin.query(
      `SELECT payment_status FROM financial_transactions WHERE id = $1`, [id],
    );
    expect((txn[0] as { payment_status: string }).payment_status).toBe('paid');
  });
});
