import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { registerErrorHandler } from '@fadl/service-kit';
import { config } from './config';
import { webhookRoutes } from './routes/webhook.routes';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

import type { FastifyRequest, FastifyReply } from 'fastify';

export async function buildApp(): Promise<ReturnType<typeof Fastify>> {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      serializers: {
        req(request) {
          return { method: request.method, url: request.url };
        },
      },
    },
    trustProxy: true,
  });

  await app.register(helmet, { contentSecurityPolicy: config.NODE_ENV === 'production' ? undefined : false });
  await app.register(cors, { origin: config.NODE_ENV === 'production' ? false : true });
  await app.register(rateLimit, { max: 200, timeWindow: '1 minute' });

  await app.register(jwt, {
    secret: config.JWT_SECRET,
    sign: { expiresIn: config.JWT_EXPIRY },
  });

  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid or missing token' } });
    }
  });

  app.get('/health', { logLevel: 'silent' }, async () => ({ status: 'ok', service: 'integration-service' }));

  await app.register(webhookRoutes, { prefix: '/api/v1' });

  registerErrorHandler(app);

  return app;
}
