import { Pool, PoolClient } from 'pg';
import { config } from './index';

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  min: config.DATABASE_POOL_MIN,
  max: config.DATABASE_POOL_MAX,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  application_name: config.SERVICE_NAME,
});

pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});

// Default branch context for code paths that use pool.query directly (no
// explicit transaction). Session-scoped — safe with PgBouncer session pooling.
pool.on('connect', (client) => {
  client
    .query(`SET app.current_branch_id = ${Number(config.BRANCH_ID)}`)
    .catch((err) => console.error('Failed to set default branch context:', err));
});

/**
 * Bind the RLS branch context for the lifetime of the surrounding transaction.
 * Uses set_config(..., true) so the setting is scoped to the current tx and is
 * reset on COMMIT/ROLLBACK — this prevents the value from leaking to the next
 * client that checks out the same pooled server connection.
 *
 * The branch id is bound as a parameter (no string interpolation) to defeat
 * injection if a caller ever sources it from untrusted input.
 */
async function setBranchContext(client: PoolClient, branchId: number): Promise<void> {
  if (!Number.isInteger(branchId) || branchId <= 0) {
    throw new Error(`Invalid branchId for RLS context: ${branchId}`);
  }
  await client.query(`SELECT set_config('app.current_branch_id', $1::text, true)`, [String(branchId)]);
}

/**
 * Run `fn` inside an explicit transaction with the RLS branch context bound.
 * If `branchId` is omitted, falls back to the service-level config (legacy).
 */
export async function withTransaction<T>(
  branchIdOrFn: number | ((client: PoolClient) => Promise<T>),
  maybeFn?: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const { branchId, fn } = resolveArgs(branchIdOrFn, maybeFn);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setBranchContext(client, branchId);
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

/**
 * Run `fn` with the RLS branch context bound. Wraps in a transaction so that
 * `set_config(..., true)` is scoped correctly — even for read-only work.
 */
export async function withRlsContext<T>(
  branchIdOrFn: number | ((client: PoolClient) => Promise<T>),
  maybeFn?: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const { branchId, fn } = resolveArgs(branchIdOrFn, maybeFn);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setBranchContext(client, branchId);
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

function resolveArgs<T>(
  branchIdOrFn: number | ((client: PoolClient) => Promise<T>),
  maybeFn?: (client: PoolClient) => Promise<T>,
): { branchId: number; fn: (client: PoolClient) => Promise<T> } {
  if (typeof branchIdOrFn === 'function') {
    return { branchId: config.BRANCH_ID, fn: branchIdOrFn };
  }
  if (!maybeFn) throw new Error('withRlsContext/withTransaction: callback is required');
  return { branchId: branchIdOrFn, fn: maybeFn };
}
