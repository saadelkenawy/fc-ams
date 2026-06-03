import { FastifyInstance } from 'fastify';
import { requireAuth, requireRole } from '../middleware/auth';
import { requireModule } from '../middleware/requireModule';
import * as ctrl from '../controllers/receipt.controller';

export async function receiptRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', requireAuth);
  app.addHook('preHandler', requireModule);

  app.get('/overview', { schema: { tags: ['overview'] } }, ctrl.getOverview);

  app.get('/receipts',                     { schema: { tags: ['receipts'] } }, ctrl.listReceipts);
  app.get('/receipts/:id',                 { schema: { tags: ['receipts'], params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } } }, ctrl.getReceipt);
  app.post('/receipts',                    { preHandler: [requireRole('admin', 'finance')], schema: { tags: ['receipts'] } }, ctrl.createReceipt);
  app.post('/receipts/:id/items',          { preHandler: [requireRole('admin', 'finance')], schema: { tags: ['receipts'], params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } } }, ctrl.addReceiptItem);
  app.patch('/receipts/:id/status',        { preHandler: [requireRole('admin')], schema: { tags: ['receipts'], params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } } }, ctrl.updateReceiptStatus);
}
