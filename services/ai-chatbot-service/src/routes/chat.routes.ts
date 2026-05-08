import { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth';
import * as ctrl from '../controllers/chat.controller';

export async function chatRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);
  app.post('/chat/message', ctrl.sendMessage);
  app.get('/chat/sessions/:id', ctrl.getSession);
}
