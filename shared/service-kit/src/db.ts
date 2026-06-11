import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { currentBranchId, metricsRegistry, promClient } from './observability';

export interface DbOptions {
  connectionString: string;
  min: number;
  max: number;
  /** Used as application_name so connections are attributable in pg_stat_activity. */
  serviceName: string;
  /**
   * Enable RLS branch-context binding. Services whose tables are branch-scoped
   * (RLS policies on branch_id) must pass their default BRANCH_ID here; services
   * without RLS (identity, procurement, ai-chatbot, integration) omit it and get
   * plain transaction helpers.
   */
  rls?: { defaultBranchId: number };
}

type TxFn<T> = (client: PoolClient) => Promise<T>;

export interface Db {
  pool: Pool;
  /** BEGIN → [bind RLS context] → fn → COMMIT (ROLLBACK on throw). */
  withTransaction<T>(fn: TxFn<T>): Promise<T>;
  withTransaction<T>(branchId: number, fn: TxFn<T>): Promise<T>;
  /** Same as withTransaction — kept as a named alias for read paths that only need the RLS context. */
  withRlsContext<T>(fn: TxFn<T>): Promise<T>;
  withRlsContext<T>(branchId: number, fn: TxFn<T>): Promise<T>;
  /** Checkout a client without a transaction (multi-statement reads, LISTEN, etc.). */
  withClient<T>(fn: TxFn<T>): Promise<T>;
  /**
   * Drop-in replacement for `pool.query` that binds the RLS branch context
   * (request branch > env default) around the statement — use for request-path
   * reads instead of raw pool.query so isolation is user-scoped (§3.1).
   */
  query<R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
}

export function createDb(opts: DbOptions): Db {
  const pool = new Pool({
    connectionString: opts.connectionString,
    min: opts.min,
    max: opts.max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: opts.serviceName,
  });

  pool.on('error', (err) => {
    console.error('Unexpected database pool error:', err);
  });

  // Pool saturation gauges, sampled at scrape time (§4.4: alert when
  // waiting > 0 sustained or total pins at max). Guarded so a second
  // createDb in tests doesn't double-register.
  const registry = metricsRegistry(opts.serviceName);
  if (!registry.getSingleMetric('pg_pool_connections')) {
    new promClient.Gauge({
      name: 'pg_pool_connections',
      help: 'pg pool connections by state (total/idle) and queued checkout requests (waiting)',
      labelNames: ['state'],
      registers: [registry],
      collect() {
        this.set({ state: 'total' }, pool.totalCount);
        this.set({ state: 'idle' }, pool.idleCount);
        this.set({ state: 'waiting' }, pool.waitingCount);
        this.set({ state: 'max' }, opts.max);
      },
    });
  }

  if (opts.rls) {
    // Default branch context for code paths that use pool.query directly (no
    // explicit transaction). Session-scoped — safe with PgBouncer session
    // pooling. Per-request overrides must use withTransaction/withRlsContext
    // with an explicit branchId. The value is validated as a number by the
    // service's env schema; Number() guards against SQL injection regardless.
    const defaultBranchId = Number(opts.rls.defaultBranchId);
    pool.on('connect', (client) => {
      client
        .query(`SET app.current_branch_id = ${defaultBranchId}`)
        .catch((err) => console.error('Failed to set default branch context:', err));
    });
  }

  /**
   * Bind the RLS branch context for the lifetime of the surrounding transaction.
   * Uses set_config(..., true) so the setting is scoped to the current tx and is
   * reset on COMMIT/ROLLBACK — this prevents the value from leaking to the next
   * client that checks out the same pooled server connection. The branch id is
   * bound as a parameter (no string interpolation).
   */
  async function setBranchContext(client: PoolClient, branchId: number): Promise<void> {
    if (!Number.isInteger(branchId) || branchId <= 0) {
      throw new Error(`Invalid branchId for RLS context: ${branchId}`);
    }
    await client.query(`SELECT set_config('app.current_branch_id', $1::text, true)`, [String(branchId)]);
  }

  function resolveArgs<T>(branchIdOrFn: number | TxFn<T>, maybeFn?: TxFn<T>): { branchId?: number; fn: TxFn<T> } {
    if (typeof branchIdOrFn === 'function') {
      // §3.1 resolution order: the authenticated request's branch (set by
      // requireAuth from the verified JWT) wins over the deployment default,
      // so RLS is user-scoped without threading branchId through every
      // repository signature. Explicit args (overload below) still win overall.
      return { branchId: currentBranchId() ?? opts.rls?.defaultBranchId, fn: branchIdOrFn };
    }
    if (!maybeFn) throw new Error('withTransaction/withRlsContext: callback is required');
    return { branchId: branchIdOrFn, fn: maybeFn };
  }

  async function run<T>(branchIdOrFn: number | TxFn<T>, maybeFn?: TxFn<T>): Promise<T> {
    const { branchId, fn } = resolveArgs(branchIdOrFn, maybeFn);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (opts.rls && branchId !== undefined) {
        await setBranchContext(client, branchId);
      }
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

  async function withClient<T>(fn: TxFn<T>): Promise<T> {
    const client = await pool.connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }

  function query<R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<R>> {
    return run((client) => client.query<R>(text, values));
  }

  return { pool, withTransaction: run, withRlsContext: run, withClient, query };
}
