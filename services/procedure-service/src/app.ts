import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { genReqId, registerErrorHandler, registerObservability } from '@fadl/service-kit';
import { config } from './config';
import { procedureRoutes } from './routes/procedure.routes';

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

  await app.register(helmet, { contentSecurityPolicy: config.NODE_ENV === 'production' ? undefined : false });
  await app.register(cors, { origin: config.NODE_ENV === 'production' ? false : true });
  await app.register(rateLimit, { max: 200, timeWindow: '1 minute' });

  await app.register(jwt, {
    secret: { public: config.JWT_PUBLIC_KEY },
    verify: { algorithms: ['RS256'] },
  });

  await app.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: { title: 'Fadl Clinic — Procedure Service', version: '1.0.0', description: 'Procedure catalogue API' },
      tags: [{ name: 'procedures', description: 'Procedure catalogue management' }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
      security: [{ bearerAuth: [] }],
    },
  });

  await app.register(swaggerUi, { routePrefix: '/docs' });

  app.get('/health', { logLevel: 'silent' }, async () => ({ status: 'ok', service: 'procedure-service' }));

  await app.register(procedureRoutes, { prefix: '/api/v1' });

  registerErrorHandler(app);

  return app;
}
