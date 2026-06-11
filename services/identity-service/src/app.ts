import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { genReqId, registerErrorHandler, registerObservability } from '@fadl/service-kit';
import { config } from './config';
import { authRoutes } from './routes/auth.routes';

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

  // Stricter rate limits on auth endpoints
  await app.register(rateLimit, { max: 30, timeWindow: '1 minute', keyGenerator: (req) => req.ip });

  await app.register(jwt, {
    secret: { private: config.JWT_PRIVATE_KEY, public: config.JWT_PUBLIC_KEY },
    sign:   { algorithm: 'RS256', expiresIn: config.JWT_EXPIRY },
  });

  await app.register(swagger, {
    openapi: {
      info: { title: 'Fadl Clinic — Identity Service', version: '1.0.0' },
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
  });

  await app.register(swaggerUi, { routePrefix: '/docs' });

  app.get('/health', { logLevel: 'silent' }, async () => ({ status: 'ok', service: 'identity-service', version: '1.0.0' }));

  await app.register(authRoutes, { prefix: '/api/v1' });

  registerErrorHandler(app);

  return app;
}
