import { createRequireAuth, requireRole } from '@fadl/service-kit';
import { config } from '../config';

export const requireAuth = createRequireAuth(config.SERVICE_NAME);
export { requireRole };
