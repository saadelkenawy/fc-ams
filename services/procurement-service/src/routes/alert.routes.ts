import { FastifyInstance } from 'fastify';
import { requireAuth, requireRole } from '../middleware/auth';
import { requireModule } from '../middleware/requireModule';
import * as ctrl from '../controllers/alert.controller';

export async function alertRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', requireAuth);
  app.addHook('preHandler', requireModule);

  app.get('/alerts',                    { schema: { tags: ['alerts'] } }, ctrl.listAlerts);
  app.patch('/alerts/:id/read',         { schema: { tags: ['alerts'], params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } } }, ctrl.markAlertRead);
  app.patch('/alerts/read-all',         { schema: { tags: ['alerts'] } }, ctrl.markAllAlertsRead);
  app.post('/alerts/check-expiry',      { preHandler: [requireRole('admin')], schema: { tags: ['alerts'] } }, ctrl.runExpiryCheck);
  app.post('/alerts/check-reorder',     { preHandler: [requireRole('admin')], schema: { tags: ['alerts'] } }, ctrl.runReorderCheck);
}
