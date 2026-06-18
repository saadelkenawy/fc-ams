/**
 * tx-guard — single source of truth for "which mutations are legal in which
 * payment_status" (codebase-design: deep module at an internal seam).
 *
 * Replaces the SELECT ... FOR UPDATE + per-site status checks that were copied
 * (and had drifted) across updateProcedureCost, updatePaymentStatus,
 * replaceExtraServices(+ByAppointmentId), updateApprovedChargeByAppointmentId,
 * and the previously-unguarded refund-by-appointment paths.
 *
 * Tested through the module's interface against the dev stack PostgreSQL, as
 * fadl_app with RLS context bound (like the real service).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool, PoolClient } from 'pg';
import { randomUUID, generateKeyPairSync } from 'crypto';

process.env.NODE_ENV = 'development';
process.env.DATABASE_URL ??= 'postgresql://fadl_app:fadl_app_dev_secret@localhost:5432/fadl_billing';
const { publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
process.env.JWT_PUBLIC_KEY_B64 ??= Buffer.from(publicKey).toString('base64');
process.env.SERVICE_JWT_SECRET ??= 'x'.repeat(32);
process.env.BRANCH_ID ??= '1';

const ADMIN_BASE = process.env.TEST_PG_ADMIN_BASE ?? 'postgresql://fadl:fadl_dev_secret@localhost:5432';
const APP_BASE = process.env.TEST_PG_APP_BASE ?? 'postgresql://fadl_app:fadl_app_dev_secret@localhost:5432';
const admin = new Pool({ connectionString: `${ADMIN_BASE}/fadl_billing`, max: 1 });
const app = new Pool({ connectionString: `${APP_BASE}/fadl_billing`, max: 2 });
const TEST_SOURCE = 'TX_GUARD_TEST';

type Guard = typeof import('../src/repositories/tx-guard');
let guard: Guard;

beforeAll(async () => {
  guard = await import('../src/repositories/tx-guard');
});

afterAll(async () => {
  const c = await admin.connect();
  try {
    await c.query(`SET session_replication_role = replica`);
    await c.query(`DELETE FROM settlement_records WHERE notes = $1`, [TEST_SOURCE]);
    await c.query(`DELETE FROM financial_transactions WHERE patient_source = $1`, [TEST_SOURCE]);
  } finally {
    await c.query(`SET session_replication_role = origin`).catch(() => {});
    c.release();
  }
  await admin.end();
  await app.end();
});

async function seedTxn(status: string, opts: { appointmentId?: string; settled?: boolean } = {}): Promise<string> {
  const id = randomUUID();
  await admin.query(
    `INSERT INTO financial_transactions
       (id, idempotency_key, patient_id, doctor_id, patient_source, appointment_id,
        approved_charge, gross_revenue, split_doctor_percentage, split_clinic_percentage,
        doctor_share, clinic_share, payment_status, transaction_date, branch_id)
     VALUES ($1,$2,$3,$4,$5,$6, 1000,1000,50,50,500,500,$7, CURRENT_DATE,1)`,
    [id, `txg-${id}`, randomUUID(), randomUUID(), TEST_SOURCE, opts.appointmentId ?? null, status],
  );
  if (opts.settled) {
    await admin.query(
      `INSERT INTO settlement_records (doctor_id, settlement_date, amount, payment_method, related_transaction_ids, notes, branch_id)
       VALUES ($1, CURRENT_DATE, 500, 'cash', ARRAY[$2]::uuid[], $3, 1)`,
      [randomUUID(), id, TEST_SOURCE],
    );
  }
  return id;
}

// Run the guard inside an RLS-bound transaction, like the real repository.
async function check(
  selector: { id: string } | { appointmentId: string },
  intent: import('../src/repositories/tx-guard').MutationIntent,
): Promise<void> {
  const client: PoolClient = await app.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.current_branch_id', '1', true)`);
    await guard.assertTransactionMutable(client, selector, intent);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

describe('assertTransactionMutable', () => {
  // allowed paths return without throwing
  it.each([
    ['amend-charge', 'pending'],
    ['amend-charge', 'verified'],
    ['add-extra', 'paid'],
    ['change-status', 'paid'],
    ['refund', 'paid'],
  ] as const)('allows %s on a %s transaction', async (intent, status) => {
    const id = await seedTxn(status);
    await expect(check({ id }, intent)).resolves.toBeUndefined();
  });

  // blocked paths throw the canonical coded error
  it.each([
    ['amend-charge', 'paid', 403, 'RECORD_SETTLED'],
    ['amend-charge', 'reconciled', 403, 'RECORD_RECONCILED'],
    ['amend-charge', 'refunded', 403, 'RECORD_REFUNDED'],
    ['add-extra', 'reconciled', 403, 'RECORD_RECONCILED'],
    ['add-extra', 'refunded', 403, 'RECORD_REFUNDED'],
    ['change-status', 'reconciled', 403, 'RECORD_RECONCILED'],
    ['refund', 'refunded', 403, 'RECORD_REFUNDED'],
  ] as const)('blocks %s on a %s transaction', async (intent, status, statusCode, code) => {
    const id = await seedTxn(status);
    await expect(check({ id }, intent)).rejects.toMatchObject({ statusCode, code });
  });

  it('blocks refund of a settled (settlement-backed) transaction with 409', async () => {
    const id = await seedTxn('paid', { settled: true });
    await expect(check({ id }, 'refund')).rejects.toMatchObject({ statusCode: 409, code: 'TRANSACTION_SETTLED' });
  });

  it('throws 404 when the transaction does not exist', async () => {
    await expect(check({ id: randomUUID() }, 'amend-charge')).rejects.toMatchObject({
      statusCode: 404, code: 'TRANSACTION_NOT_FOUND',
    });
  });

  it('resolves by appointmentId and applies the same rules', async () => {
    const appointmentId = randomUUID();
    await seedTxn('reconciled', { appointmentId });
    await expect(check({ appointmentId }, 'amend-charge')).rejects.toMatchObject({
      statusCode: 403, code: 'RECORD_RECONCILED',
    });
  });
});
