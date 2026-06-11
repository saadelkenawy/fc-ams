import { createRequireAuth, requireRole } from '@fadl/service-kit';
import { config } from '../config';

export const requireAuth = createRequireAuth({
  serviceName: config.SERVICE_NAME,
  serviceTokenSecret: config.SERVICE_JWT_SECRET,
});
export { requireRole };
