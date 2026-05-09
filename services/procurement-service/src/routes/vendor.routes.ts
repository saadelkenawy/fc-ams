import { FastifyInstance } from 'fastify';
import { requireAuth, requireRole } from '../middleware/auth';
import * as ctrl from '../controllers/vendor.controller';

export async function vendorRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', requireAuth);

  app.get('/vendors',     { schema: { tags: ['vendors'] } }, ctrl.listVendors);
  app.get('/vendors/:id', { schema: { tags: ['vendors'], params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } } }, ctrl.getVendor);
  app.post('/vendors',    { preHandler: [requireRole('admin')], schema: { tags: ['vendors'] } }, ctrl.createVendor);
  app.patch('/vendors/:id', { preHandler: [requireRole('admin')], schema: { tags: ['vendors'], params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } } }, ctrl.updateVendor);
}
