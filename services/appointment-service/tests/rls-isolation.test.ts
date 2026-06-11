/**
 * RLS branch-isolation proof (fable-enhancement.md §3.1 / §7.1).
 *
 * Connects twice: as the `fadl` admin role (seeds rows in two branches,
 * bypasses RLS) and as the `fadl_app` application role (what services use
 * since the P0 fix). Verifies that with the branch context bound the app
 * role sees only its branch, and with no context it sees nothing.
 *
 * Requires the dev stack's PostgreSQL on localhost:5432 (docker compose up).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';

const ADMIN_BASE = process.env.TEST_PG_ADMIN_BASE ?? 'postgresql://fadl:fadl_dev_secret@localhost:5432';
const APP_BASE = process.env.TEST_PG_APP_BASE ?? 'postgresql://fadl_app:fadl_app_dev_secret@localhost:5432';
const ADMIN_URL = `${ADMIN_BASE}/fadl_appointments`;
const APP_URL = `${APP_BASE}/fadl_appointments`;

const admin = new Pool({ connectionString: ADMIN_URL, max: 2 });
const app = new Pool({ connectionString: APP_URL, max: 2 });

const branch1DoctorId = randomUUID();
const branch2DoctorId = randomUUID();
const testIds = [branch1DoctorId, branch2DoctorId];

/** Run fn with the RLS branch context bound, mirroring withTransaction(). */
async function withBranch<T>(pool: Pool, branchId: number, sql: string, params: unknown[]): Promise<T[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.current_branch_id', $1::text, true)`, [String(branchId)]);
    const { rows } = await client.query(sql, params);
    await client.query('COMMIT');
    return rows as T[];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

beforeAll(async () => {
  // Clear leftovers from interrupted runs (fixed mobiles collide on doctors_mobile_key)
  await admin.query(`DELETE FROM doctors WHERE mobile LIKE '010000000%'`);
  // Seed one doctor per branch as admin (bypasses RLS)
  await admin.query(
    `INSERT INTO doctors (id, mobile, name_en, branch_id) VALUES
       ($1, '01000000001', 'RLS Test Doctor B1', 1),
       ($2, '01000000002', 'RLS Test Doctor B2', 2)`,
    [branch1DoctorId, branch2DoctorId],
  );
});

afterAll(async () => {
  await admin.query(`DELETE FROM doctors WHERE id = ANY($1::uuid[])`, [testIds]);
  await admin.end();
  await app.end();
});

describe('RLS branch isolation (fadl_app role)', () => {
  it('app role is not a superuser and cannot bypass RLS', async () => {
    const { rows } = await app.query(
      `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`,
    );
    expect(rows[0]).toMatchObject({ rolsuper: false, rolbypassrls: false });
  });

  it('branch 1 context sees only the branch 1 row', async () => {
    const rows = await withBranch<{ id: string; branch_id: number }>(
      app, 1, `SELECT id, branch_id FROM doctors WHERE id = ANY($1::uuid[])`, [testIds],
    );
    expect(rows.map((r) => r.id)).toEqual([branch1DoctorId]);
  });

  it('branch 2 context sees only the branch 2 row', async () => {
    const rows = await withBranch<{ id: string }>(
      app, 2, `SELECT id FROM doctors WHERE id = ANY($1::uuid[])`, [testIds],
    );
    expect(rows.map((r) => r.id)).toEqual([branch2DoctorId]);
  });

  it('no branch context sees nothing (fail closed)', async () => {
    // A code path that forgot the context either errors (the policy casts the
    // unset/empty setting to INT) or matches zero rows — never leaks data.
    try {
      const { rows } = await app.query(
        `SELECT id FROM doctors WHERE id = ANY($1::uuid[])`, [testIds],
      );
      expect(rows).toHaveLength(0);
    } catch (err) {
      expect((err as Error).message).toMatch(/invalid input syntax for type integer/);
    }
  });

  it('cannot insert a row for another branch than the bound context', async () => {
    await expect(
      withBranch(app, 1,
        `INSERT INTO doctors (id, mobile, name_en, branch_id) VALUES ($1, '01000000003', 'Cross-branch insert', 2)`,
        [randomUUID()],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('documents why a superuser connection would be unsafe (admin sees all branches)', async () => {
    const { rows } = await admin.query(
      `SELECT id FROM doctors WHERE id = ANY($1::uuid[])`, [testIds],
    );
    expect(rows).toHaveLength(2);
  });
});
