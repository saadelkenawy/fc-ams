import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { createRateLimitStore, genReqId, registerErrorHandler, registerObservability } from '@fadl/service-kit';
import { config } from './config';
import { webhookRoutes } from './routes/webhook.routes';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    /** Raw request body bytes, retained for HMAC webhook signature verification. */
    rawBody?: Buffer;
  }
}

import type { FastifyRequest, FastifyReply } from 'fastify';

export async function buildApp(): Promise<ReturnType<typeof Fastify>> {
  const app = Fastify({
    genReqId,
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

  registerObservability(app, { serviceName: config.SERVICE_NAME });

  // Retain the raw JSON bytes so webhook HMAC signatures can be verified over the
  // exact payload as sent (parsing-then-re-serialising would change byte order /
  // whitespace and break the signature). Still parses to JSON for the handlers.
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    (req as FastifyRequest).rawBody = body as Buffer;
    if (!(body as Buffer).length) {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse((body as Buffer).toString('utf8')));
    } catch (err) {
      (err as { statusCode?: number }).statusCode = 400;
      done(err as Error, undefined);
    }
  });

  await app.register(helmet, { contentSecurityPolicy: config.NODE_ENV === 'production' ? undefined : false });
  await app.register(cors, { origin: config.NODE_ENV === 'production' ? false : true });
  await app.register(rateLimit, { max: 200, timeWindow: '1 minute', ...createRateLimitStore(config.SERVICE_NAME, config.REDIS_URL) });

  await app.register(jwt, {
    secret: { public: config.JWT_PUBLIC_KEY },
    verify: { algorithms: ['RS256'] },
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
