/**
 * Per-request RLS branch resolution (fable-enhancement.md §3.1, Phase 6).
 *
 * Proves that @fadl/service-kit's createDb resolves the branch context from
 * the authenticated request (AsyncLocalStorage, set by requireAuth from the
 * verified JWT) rather than the deployment env — so a branch-2 admin hitting
 * a branch-1 deployment sees branch-2 data, and a future multi-branch
 * deployment isolates correctly. Falls back to the env default outside a
 * request (workers, startup).
 *
 * Requires the dev stack's PostgreSQL on localhost:5432 (docker compose up).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { createDb, withRequestContext } from '@fadl/service-kit';

const ADMIN_BASE = process.env.TEST_PG_ADMIN_BASE ?? 'postgresql://fadl:fadl_dev_secret@localhost:5432';
const APP_BASE = process.env.TEST_PG_APP_BASE ?? 'postgresql://fadl_app:fadl_app_dev_secret@localhost:5432';

const admin = new Pool({ connectionString: `${ADMIN_BASE}/fadl_appointments`, max: 2 });
const db = createDb({
  connectionString: `${APP_BASE}/fadl_appointments`,
  min: 1,
  max: 2,
  serviceName: 'rls-request-context-test',
  rls: { defaultBranchId: 1 },
});

const branch1Id = randomUUID();
const branch2Id = randomUUID();
const testIds = [branch1Id, branch2Id];
const SELECT = `SELECT id, branch_id FROM doctors WHERE id = ANY($1::uuid[])`;

beforeAll(async () => {
  // Clear leftovers from interrupted runs (fixed mobiles collide on doctors_mobile_key)
  await admin.query(`DELETE FROM doctors WHERE mobile LIKE '010000001%'`);
  await admin.query(
    `INSERT INTO doctors (id, mobile, name_en, branch_id) VALUES
       ($1, '01000000011', 'CTX Test Doctor B1', 1),
       ($2, '01000000012', 'CTX Test Doctor B2', 2)`,
    testIds,
  );
});

afterAll(async () => {
  await admin.query(`DELETE FROM doctors WHERE id = ANY($1::uuid[])`, [testIds]);
  await admin.end();
  await db.pool.end();
});

describe('per-request branch resolution (§3.1)', () => {
  it('withTransaction inside a branch-2 request context sees only branch 2', async () => {
    const rows = await withRequestContext({ branchId: 2 }, () =>
      db.withTransaction(async (c) => (await c.query(SELECT, [testIds])).rows),
    );
    expect(rows.map((r) => r.id)).toEqual([branch2Id]);
  });

  it('the same call outside a request falls back to the env default (branch 1)', async () => {
    const rows = await db.withTransaction(async (c) => (await c.query(SELECT, [testIds])).rows);
    expect(rows.map((r) => r.id)).toEqual([branch1Id]);
  });

  it('an explicit branchId argument still wins over the request context', async () => {
    const rows = await withRequestContext({ branchId: 2 }, () =>
      db.withTransaction(1, async (c) => (await c.query(SELECT, [testIds])).rows),
    );
    expect(rows.map((r) => r.id)).toEqual([branch1Id]);
  });

  it('the db.query helper (pool.query replacement) binds the request branch', async () => {
    const { rows } = await withRequestContext({ branchId: 2 }, () => db.query(SELECT, [testIds]));
    expect(rows.map((r) => r.id)).toEqual([branch2Id]);
  });
});
