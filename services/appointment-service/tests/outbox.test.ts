/**
 * Transactional outbox behavior (fable-enhancement.md §4.2).
 *
 * Verifies: atomic enqueue, delivery marking, retry with exponential backoff,
 * and dead-lettering after max attempts. Uses the real appointment_outbox
 * table on the dev stack's PostgreSQL (docker compose up).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const APP_BASE = process.env.TEST_PG_APP_BASE ?? 'postgresql://fadl_app:fadl_app_dev_secret@localhost:5432';
const APP_URL = `${APP_BASE}/fadl_appointments`;

// config/index.ts validates env on import — satisfy it before loading modules
process.env.NODE_ENV = 'development';
process.env.DATABASE_URL = APP_URL;
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
process.env.JWT_PUBLIC_KEY_B64 = process.env.JWT_PUBLIC_KEY_B64
  ?? Buffer.from('-----BEGIN PUBLIC KEY-----\ntest-only\n-----END PUBLIC KEY-----').toString('base64');
process.env.SERVICE_JWT_SECRET = process.env.SERVICE_JWT_SECRET ?? 'test-secret-test-secret-test-secret!';

type OutboxModule = typeof import('../src/repositories/outbox.repository');
type DbModule = typeof import('../src/config/database');

let outbox: OutboxModule;
let db: DbModule;

beforeAll(async () => {
  db = await import('../src/config/database');
  outbox = await import('../src/repositories/outbox.repository');
});

afterAll(async () => {
  if (!db) return;
  await db.pool.query(`DELETE FROM appointment_outbox WHERE payload->>'test' = 'outbox-test'`);
  await db.pool.end();
});

function testPayload(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { test: 'outbox-test', idempotencyKey: `test-${Date.now()}-${Math.random()}`, ...extra };
}

describe('transactional outbox', () => {
  it('enqueue inside a rolled-back transaction leaves no row (atomicity)', async () => {
    const marker = `atomic-${Date.now()}`;
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await outbox.enqueue(client, 'billing.create', testPayload({ marker }), 1);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    const { rows } = await db.pool.query(
      `SELECT 1 FROM appointment_outbox WHERE payload->>'marker' = $1`, [marker],
    );
    expect(rows).toHaveLength(0);
  });

  it('delivers a pending row and marks it delivered', async () => {
    const marker = `deliver-${Date.now()}`;
    await db.withTransaction(1, async (client) => {
      await outbox.enqueue(client, 'billing.create', testPayload({ marker }), 1);
    });

    const delivered: string[] = [];
    await outbox.processDueBatch(50, async (row) => {
      if ((row.payload as { marker?: string }).marker === marker) delivered.push(row.id);
      // Rows from other tests in the batch: deliver as no-op too
    });

    expect(delivered).toHaveLength(1);
    const { rows } = await db.pool.query(
      `SELECT status, delivered_at FROM appointment_outbox WHERE payload->>'marker' = $1`, [marker],
    );
    expect(rows[0].status).toBe('delivered');
    expect(rows[0].delivered_at).not.toBeNull();
  });

  it('failed delivery increments attempts and schedules a backoff retry', async () => {
    const marker = `retry-${Date.now()}`;
    await db.withTransaction(1, async (client) => {
      await outbox.enqueue(client, 'billing.create', testPayload({ marker }), 1);
    });

    await outbox.processDueBatch(50, async (row) => {
      if ((row.payload as { marker?: string }).marker === marker) {
        throw new Error('simulated billing outage');
      }
    });

    const { rows } = await db.pool.query(
      `SELECT status, attempts, last_error, next_attempt_at > NOW() AS backed_off
       FROM appointment_outbox WHERE payload->>'marker' = $1`, [marker],
    );
    expect(rows[0]).toMatchObject({ status: 'pending', attempts: 1, backed_off: true });
    expect(rows[0].last_error).toContain('simulated billing outage');
  });

  it('moves a row to dead after max_attempts failures', async () => {
    const marker = `dead-${Date.now()}`;
    await db.withTransaction(1, async (client) => {
      await outbox.enqueue(client, 'billing.create', testPayload({ marker }), 1);
    });
    // Tighten the knobs so the test doesn't wait for real backoff windows
    await db.pool.query(
      `UPDATE appointment_outbox SET max_attempts = 2, next_attempt_at = NOW()
       WHERE payload->>'marker' = $1`, [marker],
    );

    const failOnce = async () => {
      await outbox.processDueBatch(50, async (row) => {
        if ((row.payload as { marker?: string }).marker === marker) throw new Error('still down');
      });
      await db.pool.query(
        `UPDATE appointment_outbox SET next_attempt_at = NOW()
         WHERE payload->>'marker' = $1 AND status = 'pending'`, [marker],
      );
    };
    await failOnce();
    await failOnce();

    const { rows } = await db.pool.query(
      `SELECT status, attempts FROM appointment_outbox WHERE payload->>'marker' = $1`, [marker],
    );
    expect(rows[0]).toMatchObject({ status: 'dead', attempts: 2 });
  });
});
