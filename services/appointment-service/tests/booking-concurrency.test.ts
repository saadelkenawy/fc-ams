/**
 * Concurrency guards in createAppointment (review findings #3 + #4).
 *
 *  #3 idempotency: two concurrent requests sharing an idempotency key must
 *     resolve to ONE appointment — the loser used to hit the per-partition
 *     UNIQUE index (23505) and surface an opaque 500. A per-key advisory lock
 *     makes the check-then-insert atomic.
 *  #4 room capacity: the daily capacity check is check-then-act with no lock,
 *     so concurrent bookings could overflow ROOM_DAILY_SLOT_CAPACITY. A per
 *     room+date advisory lock serialises the count + insert.
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

// config/index.ts validates env on import — satisfy it before loading modules.
process.env.NODE_ENV = 'development';
process.env.DATABASE_URL = APP_URL;
process.env.BRANCH_ID = '1';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
process.env.JWT_PUBLIC_KEY_B64 = process.env.JWT_PUBLIC_KEY_B64
  ?? Buffer.from('-----BEGIN PUBLIC KEY-----\ntest-only\n-----END PUBLIC KEY-----').toString('base64');
process.env.SERVICE_JWT_SECRET = process.env.SERVICE_JWT_SECRET ?? 'test-secret-test-secret-test-secret!';
process.env.ROOM_DAILY_SLOT_CAPACITY = '2'; // small so a handful of concurrent inserts can overflow

type RepoModule = typeof import('../src/repositories/appointment.repository');

const admin = new Pool({ connectionString: ADMIN_URL, max: 6 });
let repo: RepoModule;

const DATE = '2026-06-15'; // inside the branch-1 2026m06 partition (V010)
const ROOM = 'CONCROOM'; // clinic_rooms.room_code is varchar(10)
const doctor = randomUUID();
const createdBy = randomUUID();

beforeAll(async () => {
  repo = await import('../src/repositories/appointment.repository');
  await admin.query(`DELETE FROM doctors WHERE mobile = '01099000099'`);
  await admin.query(
    `INSERT INTO doctors (id, mobile, name_en, branch_id) VALUES ($1, '01099000099', 'Concurrency Test Doctor', 1)`,
    [doctor],
  );
  await admin.query(`DELETE FROM clinic_rooms WHERE room_code = $1`, [ROOM]);
  await admin.query(
    `INSERT INTO clinic_rooms (code, room_code, name_en, room_type, is_active, branch_id)
     VALUES ($1, $1, 'Concurrency Test Room', 'clinical', TRUE, 1)`,
    [ROOM],
  );
}, 30_000);

afterAll(async () => {
  await admin.query(`DELETE FROM appointments WHERE doctor_id = $1`, [doctor]);
  await admin.query(`DELETE FROM clinic_rooms WHERE room_code = $1`, [ROOM]);
  await admin.query(`DELETE FROM doctors WHERE id = $1`, [doctor]);
  await admin.end();
});

describe('createAppointment concurrency guards', () => {
  it('#4 concurrent bookings never overflow room daily capacity', async () => {
    const times = ['09:00', '10:00', '11:00', '12:00', '13:00']; // distinct slots — no doctor double-book
    const results = await Promise.allSettled(
      times.map((t) =>
        repo.createAppointment(
          { patientId: randomUUID(), doctorId: doctor, appointmentDate: DATE,
            startTime: t, endTime: `${t.split(':')[0]}:30`, roomCode: ROOM },
          createdBy, 1,
        ),
      ),
    );

    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const rejectedRoomFull = results.filter(
      (r) => r.status === 'rejected' && (r.reason as { code?: string }).code === 'ROOM_FULL',
    ).length;

    expect(ok).toBe(2);                 // exactly capacity succeed
    expect(rejectedRoomFull).toBe(3);   // the rest are cleanly rejected

    const { rows } = await admin.query(
      `SELECT COUNT(*)::int AS n FROM appointments
       WHERE room_code = $1 AND appointment_date = $2 AND deleted_at IS NULL
         AND status NOT IN ('Canc.', 'Resch.')`,
      [ROOM, DATE],
    );
    expect((rows[0] as { n: number }).n).toBeLessThanOrEqual(2);
  }, 30_000);

  it('#3 concurrent bookings sharing an idempotency key produce one appointment', async () => {
    const key = `conc-idem-${randomUUID()}`;
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        repo.createAppointment(
          { patientId: randomUUID(), doctorId: doctor, appointmentDate: DATE,
            startTime: '15:00', endTime: '15:30', idempotencyKey: key },
          createdBy, 1,
        ),
      ),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(5); // none throw

    const ids = new Set(fulfilled.map((r) => (r as PromiseFulfilledResult<{ id: string }>).value.id));
    expect(ids.size).toBe(1); // all resolve to the same appointment

    const { rows } = await admin.query(
      `SELECT COUNT(*)::int AS n FROM appointments WHERE idempotency_key = $1`, [key],
    );
    expect((rows[0] as { n: number }).n).toBe(1);
  }, 30_000);
});
