/**
 * Atomic slot-swap (fable-enhancement.md §18.1 hardening).
 *
 * The room-timeline drag-to-swap was three sequential PATCHes from the client
 * (parking one appointment on a temp 23:58 slot to dodge the non-deferrable
 * double-booking exclusion constraint). A failure mid-sequence could strand an
 * appointment on the temp slot. This is now a single server transaction whose
 * one UPDATE statement swaps both rows — the exclusion constraint is evaluated
 * at statement end, so the rows exchanging slots never appear to overlap, and
 * any conflict rolls the whole swap back.
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

// config/index.ts validates env on import — satisfy it before loading modules
process.env.NODE_ENV = 'development';
process.env.DATABASE_URL = APP_URL;
process.env.BRANCH_ID = '1';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
process.env.JWT_PUBLIC_KEY_B64 = process.env.JWT_PUBLIC_KEY_B64
  ?? Buffer.from('-----BEGIN PUBLIC KEY-----\ntest-only\n-----END PUBLIC KEY-----').toString('base64');
process.env.SERVICE_JWT_SECRET = process.env.SERVICE_JWT_SECRET ?? 'test-secret-test-secret-test-secret!';

type RepoModule = typeof import('../src/repositories/appointment.repository');
type DbModule = typeof import('../src/config/database');

const admin = new Pool({ connectionString: ADMIN_URL, max: 2 });
let repo: RepoModule;
let db: DbModule;

const DATE = '2026-06-15'; // inside the branch-1 2026m06 partition (V010)
const updatedBy = randomUUID();
const docX = randomUUID();
const docY = randomUUID();
const createdIds: string[] = [];

async function seedAppt(doctorId: string, start: string, end: string): Promise<string> {
  const id = randomUUID();
  await admin.query(
    `INSERT INTO appointments (id, patient_id, doctor_id, appointment_date, start_time, end_time, status, created_by, branch_id)
     VALUES ($1, $2, $3, $4, $5, $6, 'TBC', $7, 1)`,
    [id, randomUUID(), doctorId, DATE, start, end, updatedBy],
  );
  createdIds.push(id);
  return id;
}

beforeAll(async () => {
  db = await import('../src/config/database');
  repo = await import('../src/repositories/appointment.repository');
  await admin.query(`DELETE FROM doctors WHERE mobile IN ('01099000001','01099000002')`);
  await admin.query(
    `INSERT INTO doctors (id, mobile, name_en, branch_id) VALUES
       ($1, '01099000001', 'Swap Test Doctor X', 1),
       ($2, '01099000002', 'Swap Test Doctor Y', 1)`,
    [docX, docY],
  );
}, 30_000);

afterAll(async () => {
  if (createdIds.length) {
    await admin.query(`DELETE FROM appointments WHERE id = ANY($1::uuid[])`, [createdIds]);
  }
  await admin.query(`DELETE FROM doctors WHERE id = ANY($1::uuid[])`, [[docX, docY]]);
  await admin.end();
  if (db) await db.pool.end();
});

describe('atomic slot swap', () => {
  it('exchanges two same-doctor slots in one transaction (no temp slot)', async () => {
    const a = await seedAppt(docX, '09:00', '09:20'); // A
    const b = await seedAppt(docX, '10:00', '10:20'); // B

    const result = await repo.swapAppointmentTimes(a, b, updatedBy);

    expect(result.a).toMatchObject({ id: a, startTime: '10:00', endTime: '10:20' });
    expect(result.b).toMatchObject({ id: b, startTime: '09:00', endTime: '09:20' });

    // Confirm persisted (not just returned)
    const { rows } = await admin.query(
      `SELECT id, to_char(start_time,'HH24:MI') AS s FROM appointments WHERE id = ANY($1::uuid[])`,
      [[a, b]],
    );
    const map = Object.fromEntries(rows.map((r) => [r.id, r.s]));
    expect(map[a]).toBe('10:00');
    expect(map[b]).toBe('09:00');
  });

  it('rolls back fully when the swap would double-book a doctor', async () => {
    // Doc X busy 11:00–11:20; Doc Y free at 12:00–12:20.
    const c = await seedAppt(docX, '11:00', '11:20'); // X's existing appt
    const a = await seedAppt(docX, '08:00', '08:20'); // A (doc X)
    const b = await seedAppt(docY, '11:00', '11:20'); // B (doc Y) — swapping moves A onto 11:00 under X → collides with C

    await expect(repo.swapAppointmentTimes(a, b, updatedBy)).rejects.toMatchObject({
      code: 'SLOT_CONFLICT',
      statusCode: 409,
    });

    // Neither A nor B moved — the transaction rolled back atomically.
    const { rows } = await admin.query(
      `SELECT id, to_char(start_time,'HH24:MI') AS s, version FROM appointments WHERE id = ANY($1::uuid[])`,
      [[a, b]],
    );
    const map = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(map[a].s).toBe('08:00');
    expect(map[b].s).toBe('11:00');
    expect(map[a].version).toBe(1);
    expect(map[b].version).toBe(1);
    void c;
  });

  it('rejects swapping an appointment with a terminal status', async () => {
    const a = await seedAppt(docY, '13:00', '13:20');
    const b = await seedAppt(docY, '14:00', '14:20');
    await admin.query(`UPDATE appointments SET status = 'Comp.' WHERE id = $1`, [b]);

    await expect(repo.swapAppointmentTimes(a, b, updatedBy)).rejects.toMatchObject({
      code: 'INVALID_STATUS',
      statusCode: 422,
    });
  });
});
