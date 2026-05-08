import { FastifyInstance } from 'fastify';
import { requireAuth, requireRole } from '../middleware/auth';
import * as ctrl from '../controllers/file.controller';

export async function fileRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  app.post('/files/initiate',      ctrl.initiateUpload);
  app.get('/files',                ctrl.listFiles);
  app.get('/files/:id',            ctrl.getDownloadUrl);
  app.delete('/files/:id',         { preHandler: [requireRole('admin', 'doctor')], handler: ctrl.deleteFile });
}
