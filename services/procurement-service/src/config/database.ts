import { createDb } from '@fadl/service-kit';
import { config } from './index';

// This service's tables are not branch-scoped — no RLS context binding.
const db = createDb({
  connectionString: config.DATABASE_URL,
  min: config.DATABASE_POOL_MIN,
  max: config.DATABASE_POOL_MAX,
  serviceName: config.SERVICE_NAME,
});

export const pool = db.pool;
export const withTransaction = db.withTransaction;
export const withClient = db.withClient;
