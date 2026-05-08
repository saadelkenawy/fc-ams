import { pool, withTransaction } from '../config/database';

export interface IntegrationEvent {
  id: string;
  platform: string;
  eventType: string;
  idempotencyKey?: string;
  payload: Record<string, unknown>;
  normalized?: Record<string, unknown>;
  status: 'received' | 'processing' | 'processed' | 'failed' | 'duplicate';
  result?: Record<string, unknown>;
  errorMessage?: string;
  retryCount: number;
  branchId: number;
  createdAt: string;
  processedAt?: string;
}

function row(r: Record<string, unknown>): IntegrationEvent {
  return {
    id: r.id as string,
    platform: r.platform as string,
    eventType: r.event_type as string,
    idempotencyKey: r.idempotency_key as string | undefined,
    payload: r.payload as Record<string, unknown>,
    normalized: r.normalized as Record<string, unknown> | undefined,
    status: r.status as IntegrationEvent['status'],
    result: r.result as Record<string, unknown> | undefined,
    errorMessage: r.error_message as string | undefined,
    retryCount: r.retry_count as number,
    branchId: r.branch_id as number,
    createdAt: (r.created_at as Date).toISOString(),
    processedAt: r.processed_at ? (r.processed_at as Date).toISOString() : undefined,
  };
}

export async function createEvent(input: {
  platform: string; eventType: string; idempotencyKey?: string;
  payload: Record<string, unknown>; branchId: number;
}): Promise<IntegrationEvent> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<Record<string, unknown>>(
      `INSERT INTO integration_events (platform, event_type, idempotency_key, payload, branch_id)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (idempotency_key) DO UPDATE SET status = 'duplicate'
       RETURNING *`,
      [input.platform, input.eventType, input.idempotencyKey ?? null, JSON.stringify(input.payload), input.branchId],
    );
    return row(rows[0]);
  });
}

export async function updateEvent(id: string, updates: {
  status: IntegrationEvent['status'];
  normalized?: Record<string, unknown>;
  result?: Record<string, unknown>;
  errorMessage?: string;
}): Promise<void> {
  await pool.query(
    `UPDATE integration_events
     SET status = $2, normalized = $3, result = $4, error_message = $5,
         processed_at = NOW(), retry_count = retry_count + 1
     WHERE id = $1`,
    [id, updates.status, updates.normalized ? JSON.stringify(updates.normalized) : null,
     updates.result ? JSON.stringify(updates.result) : null, updates.errorMessage ?? null],
  );
}

export async function listEvents(params: { platform?: string; status?: string; limit?: number }): Promise<IntegrationEvent[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (params.platform) { conditions.push(`platform = $${idx++}`); values.push(params.platform); }
  if (params.status)   { conditions.push(`status = $${idx++}`);   values.push(params.status); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(params.limit ?? 50, 200);
  const { rows } = await pool.query(
    `SELECT * FROM integration_events ${where} ORDER BY created_at DESC LIMIT $${idx}`,
    [...values, limit],
  );
  return (rows as Record<string, unknown>[]).map(row);
}
