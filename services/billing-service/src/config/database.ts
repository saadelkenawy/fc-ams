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

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.current_branch_id', $1::text, true)`, [String(config.BRANCH_ID)]);
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

export async function withRlsContext<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.current_branch_id', $1::text, true)`, [String(config.BRANCH_ID)]);
    return await fn(client);
  } finally {
    client.release();
  }
}
