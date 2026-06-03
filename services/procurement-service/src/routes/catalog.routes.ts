import { FastifyInstance } from 'fastify';
import { requireAuth, requireRole } from '../middleware/auth';
import { requireModule } from '../middleware/requireModule';
import * as ctrl from '../controllers/catalog.controller';

export async function catalogRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', requireAuth);
  app.addHook('preHandler', requireModule);

  app.get('/catalog', { schema: { tags: ['catalog'] } }, ctrl.listItems);
  app.get('/catalog/:id', { schema: { tags: ['catalog'], params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } } }, ctrl.getItem);
  app.post('/catalog',    { preHandler: [requireRole('admin')], schema: { tags: ['catalog'] } }, ctrl.createItem);
  app.patch('/catalog/:id', { preHandler: [requireRole('admin')], schema: { tags: ['catalog'], params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } } }, ctrl.updateItem);
}
