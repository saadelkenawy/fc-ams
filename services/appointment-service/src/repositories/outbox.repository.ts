import { PoolClient } from 'pg';
import { pool } from '../config/database';

export type OutboxKind = 'billing.create';

export interface OutboxRow {
  id: string;
  kind: OutboxKind;
  payload: Record<string, unknown>;
  branchId: number;
  attempts: number;
  maxAttempts: number;
}

/**
 * Enqueue a side effect in the SAME transaction as the business write.
 * Pass the transaction's client — never the pool — so the outbox row commits
 * or rolls back atomically with the appointment.
 */
export async function enqueue(
  client: PoolClient,
  kind: OutboxKind,
  payload: Record<string, unknown>,
  branchId: number,
): Promise<void> {
  await client.query(
    `INSERT INTO appointment_outbox (kind, payload, branch_id) VALUES ($1, $2, $3)`,
    [kind, JSON.stringify(payload), branchId],
  );
}

/**
 * Claim a batch of due pending rows. FOR UPDATE SKIP LOCKED makes this safe
 * to run from multiple service instances concurrently. The claim transaction
 * stays open while the caller delivers — crash mid-delivery releases the lock
 * and the row is retried (delivery is idempotent via billing idempotency keys).
 */
export async function processDueBatch(
  limit: number,
  deliver: (row: OutboxRow) => Promise<void>,
): Promise<number> {
  const client = await pool.connect();
  let processed = 0;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, kind, payload, branch_id, attempts, max_attempts
       FROM appointment_outbox
       WHERE status = 'pending' AND next_attempt_at <= NOW()
       ORDER BY id
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [limit],
    );

    for (const raw of rows as Array<Record<string, unknown>>) {
      const row: OutboxRow = {
        id: String(raw.id),
        kind: raw.kind as OutboxKind,
        payload: raw.payload as Record<string, unknown>,
        branchId: Number(raw.branch_id),
        attempts: Number(raw.attempts),
        maxAttempts: Number(raw.max_attempts),
      };
      try {
        await deliver(row);
        await client.query(
          `UPDATE appointment_outbox
           SET status = 'delivered', delivered_at = NOW(), last_error = NULL
           WHERE id = $1`,
          [row.id],
        );
      } catch (err) {
        const message = (err as Error).message ?? 'unknown error';
        const attempts = row.attempts + 1;
        if (attempts >= row.maxAttempts) {
          await client.query(
            `UPDATE appointment_outbox
             SET status = 'dead', attempts = $2, last_error = $3
             WHERE id = $1`,
            [row.id, attempts, message],
          );
          console.error(`[outbox] row ${row.id} (${row.kind}) moved to DEAD after ${attempts} attempts: ${message}`);
        } else {
          // Exponential backoff: 5s, 10s, 20s … capped at 10 min
          const delaySeconds = Math.min(5 * 2 ** (attempts - 1), 600);
          await client.query(
            `UPDATE appointment_outbox
             SET attempts = $2, last_error = $3,
                 next_attempt_at = NOW() + make_interval(secs => $4)
             WHERE id = $1`,
            [row.id, attempts, message, delaySeconds],
          );
        }
      }
      processed += 1;
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return processed;
}

/** Count of dead-letter rows — exposed for monitoring/alerting. */
export async function deadLetterCount(): Promise<number> {
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM appointment_outbox WHERE status = 'dead'`);
  return (rows[0] as { n: number }).n;
}
