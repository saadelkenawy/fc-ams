import { FastifyInstance } from 'fastify';
import { requireAuth, requireRole } from '../middleware/auth';
import * as ctrl from '../controllers/notification.controller';

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  app.post('/notifications/send',         ctrl.sendNotification);
  app.get('/notifications',               { preHandler: [requireRole('admin', 'receptionist')] }, ctrl.listNotifications);
  app.get('/notifications/:id',           ctrl.getNotification);
  app.post('/notifications/:id/retry',    { preHandler: [requireRole('admin')] }, ctrl.retryNotification);
  app.get('/notification-templates',      ctrl.listTemplates);
}
