import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from './config';
import { fileRoutes } from './routes/file.routes';
import { ensureBucket } from './config/storage';

export async function buildApp(): Promise<ReturnType<typeof Fastify>> {
  const app = Fastify({
    logger: { level: config.LOG_LEVEL, serializers: { req(r) { return { method: r.method, url: r.url }; } } },
    trustProxy: true,
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: config.NODE_ENV === 'production' ? false : true });
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });

  await app.register(jwt, { secret: config.JWT_SECRET, sign: { expiresIn: config.JWT_EXPIRY } });

  await app.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: { title: 'Fadl Clinic — File Service', version: '1.0.0', description: 'Document storage with MinIO presigned URLs' },
      tags: [{ name: 'files', description: 'File upload/download/metadata' }],
      components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
      security: [{ bearerAuth: [] }],
    },
  });

  await app.register(swaggerUi, { routePrefix: '/docs' });

  app.get('/health', { logLevel: 'silent' }, async () => ({ status: 'ok', service: 'file-service' }));

  await app.register(fileRoutes, { prefix: '/api/v1' });

  app.setErrorHandler(async (error, request, reply) => {
    const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
    const code = (error as { code?: string }).code ?? 'INTERNAL_ERROR';
    if (statusCode >= 500) request.log.error({ err: error }, 'Unhandled error');
    reply.status(statusCode).send({ success: false, error: { code, message: (error as Error).message } });
  });

  // Ensure MinIO bucket exists on startup
  ensureBucket().catch((err: Error) => app.log.warn({ err }, 'MinIO bucket init failed — will retry on next request'));

  return app;
}
