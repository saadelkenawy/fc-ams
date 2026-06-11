import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { genReqId, registerErrorHandler, registerObservability } from '@fadl/service-kit';
import { config } from './config';
import { encounterRoutes } from './routes/encounter.routes';
import { prescriptionRoutes } from './routes/prescription.routes';
import { productRoutes } from './routes/product.routes';

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
      info: {
        title: 'Fadl Clinic — EHR Service',
        version: '1.0.0',
        description: 'Electronic Health Records API',
      },
      tags: [
        { name: 'encounters',    description: 'Clinical encounter management' },
        { name: 'prescriptions', description: 'Prescription management' },
        { name: 'products',      description: 'EDA medicine & cosmetic registry search' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
      security: [{ bearerAuth: [] }],
    },
  });

  await app.register(swaggerUi, { routePrefix: '/docs' });

  app.get('/health', { logLevel: 'silent' }, async () => ({ status: 'ok', service: 'ehr-service' }));

  await app.register(encounterRoutes,    { prefix: '/api/v1' });
  await app.register(prescriptionRoutes, { prefix: '/api/v1' });
  await app.register(productRoutes,      { prefix: '/api/v1' });

  registerErrorHandler(app);

  return app;
}
