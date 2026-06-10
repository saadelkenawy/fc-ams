import { createDb } from '@fadl/service-kit';
import { config } from './index';

const db = createDb({
  connectionString: config.DATABASE_URL,
  min: config.DATABASE_POOL_MIN,
  max: config.DATABASE_POOL_MAX,
  serviceName: config.SERVICE_NAME,
  rls: { defaultBranchId: config.BRANCH_ID },
});

export const pool = db.pool;
export const withTransaction = db.withTransaction;
export const withRlsContext = db.withRlsContext;
