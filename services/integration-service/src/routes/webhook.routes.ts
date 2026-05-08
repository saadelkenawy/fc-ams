import type { FastifyInstance } from 'fastify';
import * as ctrl from '../controllers/webhook.controller';

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  // Platform webhooks — authenticated by per-platform shared secret in X-*-Secret header
  app.post('/webhooks/vizita',   ctrl.vizitaWebhook);
  app.post('/webhooks/ekshf',    ctrl.ekshfWebhook);
  app.post('/webhooks/clinido',  ctrl.clinidoWebhook);
  app.post('/webhooks/instapay', ctrl.instaPayWebhook);

  // Admin — list events (requires JWT)
  app.get('/events', { preHandler: [app.authenticate] }, ctrl.listEvents);
}
