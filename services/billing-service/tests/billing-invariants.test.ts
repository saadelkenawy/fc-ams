/**
 * Money-path invariants in the billing ledger (fable-enhancement.md §4.1.1).
 *
 * Tests the SQL triggers that encode the business rules — exactly the logic
 * that breaks silently (V011 regressed V009's split soft-guard; fixed in V012).
 * Runs as the fadl_app role with RLS context bound, like the real service.
 *
 * Requires the dev stack's PostgreSQL on localhost:5432 (docker compose up).
 */
import { describe, it, expect, afterAll } from 'vitest';
import { Pool, PoolClient } from 'pg';
import { randomUUID } from 'crypto';

const ADMIN_BASE = process.env.TEST_PG_ADMIN_BASE ?? 'postgresql://fadl:fadl_dev_secret@localhost:5432';
const APP_BASE = process.env.TEST_PG_APP_BASE ?? 'postgresql://fadl_app:fadl_app_dev_secret@localhost:5432';
const APP_URL = `${APP_BASE}/fadl_billing`;
const ADMIN_URL = `${ADMIN_BASE}/fadl_billing`;

const app = new Pool({ connectionString: APP_URL, max: 2 });
const admin = new Pool({ connectionString: ADMIN_URL, max: 1 });

const TEST_SOURCE = 'FABLE_TEST';

async function withBranch<T>(branchId: number, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await app.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.current_branch_id', $1::text, true)`, [String(branchId)]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

interface TxRow { id: string; doctor_share: string; clinic_share: string; payment_status: string }

async function insertTx(client: PoolClient, overrides: Record<string, unknown> = {}): Promise<TxRow> {
  const values = {
    idempotency_key: `fable-test-${randomUUID()}`,
    patient_id: randomUUID(),
    doctor_id: randomUUID(),
    patient_source: TEST_SOURCE,
    approved_charge: 1000,
    gross_revenue: 1000,
    split_doctor_percentage: 50,
    split_clinic_percentage: 50,
    doctor_share: 500,
    clinic_share: 500,
    ...overrides,
  };
  const cols = Object.keys(values);
  const params = Object.values(values);
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  const { rows } = await client.query(
    `INSERT INTO financial_transactions (${cols.join(', ')}, transaction_date, branch_id)
     VALUES (${placeholders.join(', ')}, CURRENT_DATE, 1)
     RETURNING id, doctor_share, clinic_share, payment_status`,
    params,
  );
  return rows[0] as TxRow;
}

afterAll(async () => {
  await admin.query(`DELETE FROM financial_transactions WHERE patient_source = $1`, [TEST_SOURCE]);
  await admin.end();
  await app.end();
});

describe('billing ledger invariants', () => {
  it('duplicate idempotency key on the same branch+date is rejected (23505)', async () => {
    const key = `fable-test-idem-${randomUUID()}`;
    await withBranch(1, (c) => insertTx(c, { idempotency_key: key }));
    await expect(
      withBranch(1, (c) => insertTx(c, { idempotency_key: key })),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('hard-immutable fields cannot change after insert (is_foc)', async () => {
    const tx = await withBranch(1, (c) => insertTx(c));
    await expect(
      withBranch(1, (c) => c.query(
        `UPDATE financial_transactions SET is_foc = TRUE WHERE id = $1`, [tx.id],
      )),
    ).rejects.toMatchObject({ code: 'P0001' });
  });

  it('split change on a PENDING row succeeds and auto-recalculates shares (V009/V012)', async () => {
    const tx = await withBranch(1, (c) => insertTx(c));
    expect(tx.payment_status).toBe('pending');

    const updated = await withBranch(1, async (c) => {
      const { rows } = await c.query(
        `UPDATE financial_transactions
         SET split_doctor_percentage = 70, split_clinic_percentage = 30
         WHERE id = $1
         RETURNING doctor_share, clinic_share`,
        [tx.id],
      );
      return rows[0] as { doctor_share: string; clinic_share: string };
    });

    // aab_recalc_split_change: shares recomputed from gross_revenue (1000)
    expect(Number(updated.doctor_share)).toBe(700);
    expect(Number(updated.clinic_share)).toBe(300);
  });

  it('split change on a RECONCILED row is rejected (P0001)', async () => {
    const tx = await withBranch(1, (c) => insertTx(c));
    await withBranch(1, (c) => c.query(
      `UPDATE financial_transactions SET payment_status = 'reconciled' WHERE id = $1`, [tx.id],
    ));
    await expect(
      withBranch(1, (c) => c.query(
        `UPDATE financial_transactions SET split_doctor_percentage = 60, split_clinic_percentage = 40 WHERE id = $1`,
        [tx.id],
      )),
    ).rejects.toMatchObject({ code: 'P0001' });
  });

  it('approved_charge change recalculates the derived money group (V011)', async () => {
    const tx = await withBranch(1, (c) => insertTx(c));
    const updated = await withBranch(1, async (c) => {
      const { rows } = await c.query(
        `UPDATE financial_transactions SET approved_charge = 2000 WHERE id = $1
         RETURNING gross_revenue, doctor_share, clinic_share`,
        [tx.id],
      );
      return rows[0] as { gross_revenue: string; doctor_share: string; clinic_share: string };
    });
    expect(Number(updated.gross_revenue)).toBe(2000);
    expect(Number(updated.doctor_share)).toBe(1000);
    expect(Number(updated.clinic_share)).toBe(1000);
  });

  it('approved_charge change on a PAID (settled) row is rejected (P0001)', async () => {
    const tx = await withBranch(1, (c) => insertTx(c));
    await withBranch(1, (c) => c.query(
      `UPDATE financial_transactions SET payment_status = 'paid' WHERE id = $1`, [tx.id],
    ));
    await expect(
      withBranch(1, (c) => c.query(
        `UPDATE financial_transactions SET approved_charge = 5000 WHERE id = $1`, [tx.id],
      )),
    ).rejects.toMatchObject({ code: 'P0001' });
  });

  it('RLS: rows are invisible without a branch context (fail closed)', async () => {
    const tx = await withBranch(1, (c) => insertTx(c));
    // A context-less query either errors (policy casts the unset/empty setting
    // to INT) or matches zero rows — never leaks data.
    try {
      const { rows } = await app.query(
        `SELECT 1 FROM financial_transactions WHERE id = $1`, [tx.id],
      );
      expect(rows).toHaveLength(0);
    } catch (err) {
      expect((err as Error).message).toMatch(/invalid input syntax for type integer/);
    }
  });
});
