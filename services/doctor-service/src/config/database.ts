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
    // Set branch context for Row Level Security
    await client.query(`SET app.current_branch_id = '${config.BRANCH_ID}'`);
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
    await client.query(`SET app.current_branch_id = '${config.BRANCH_ID}'`);
    return await fn(client);
  } finally {
    client.release();
  }
}
