import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from './config';
import { redis } from './config/redis';
import { authRoutes } from './routes/auth.routes';
import { featureFlagsRoutes } from './routes/feature-flags.routes';

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

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: config.NODE_ENV === 'production' ? false : true });

  // Stricter rate limits on auth endpoints
  await app.register(rateLimit, { max: 30, timeWindow: '1 minute', keyGenerator: (req) => req.ip });

  await app.register(jwt, {
    secret: config.JWT_SECRET,
    sign:   { expiresIn: config.JWT_EXPIRY },
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
  await app.register(featureFlagsRoutes, { prefix: '/api/v1' });

  await redis.connect().catch(() => {/* logged by redis.on('error') */});

  app.setErrorHandler(async (error, request, reply) => {
    const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
    const code       = (error as { code?: string }).code ?? 'INTERNAL_ERROR';

    if (statusCode >= 500) {
      request.log.error({ err: error }, 'Unhandled error');
    }

    void reply.status(statusCode).send({
      success: false,
      error: { code, message: (error as Error).message },
    });
  });

  return app;
}
