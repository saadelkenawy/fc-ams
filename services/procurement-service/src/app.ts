import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { createRateLimitStore, genReqId, registerErrorHandler, registerObservability } from '@fadl/service-kit';
import { config } from './config';
import { catalogRoutes } from './routes/catalog.routes';
import { vendorRoutes } from './routes/vendor.routes';
import { receiptRoutes } from './routes/receipt.routes';
import { alertRoutes } from './routes/alert.routes';

export async function buildApp(): Promise<ReturnType<typeof Fastify>> {
  const app = Fastify({
    genReqId,
    logger: {
      level: config.LOG_LEVEL,
      serializers: { req(req) { return { method: req.method, url: req.url }; } },
    },
    trustProxy: true,
  });

  registerObservability(app, { serviceName: config.SERVICE_NAME });

  await app.register(helmet, { contentSecurityPolicy: config.NODE_ENV === 'production' ? undefined : false });
  await app.register(cors, { origin: config.NODE_ENV !== 'production' });
  await app.register(rateLimit, { max: 200, timeWindow: '1 minute', ...createRateLimitStore(config.SERVICE_NAME, config.REDIS_URL) });
  await app.register(jwt, { secret: { public: config.JWT_PUBLIC_KEY }, verify: { algorithms: ['RS256'] } });

  await app.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: { title: 'Fadl Clinic — Procurement Service', version: '1.0.0', description: 'Medical procurement & inventory receipt management' },
      tags: [
        { name: 'overview',  description: 'Dashboard overview stats' },
        { name: 'catalog',   description: 'Item catalog management' },
        { name: 'vendors',   description: 'Vendor directory' },
        { name: 'receipts',  description: 'Receipt logging' },
        { name: 'alerts',    description: 'Inventory alerts' },
      ],
      components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
      security: [{ bearerAuth: [] }],
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  app.get('/health', { logLevel: 'silent' }, async () => ({ status: 'ok', service: 'procurement-service' }));

  await app.register(catalogRoutes, { prefix: '/api/v1' });
  await app.register(vendorRoutes,  { prefix: '/api/v1' });
  await app.register(receiptRoutes, { prefix: '/api/v1' });
  await app.register(alertRoutes,   { prefix: '/api/v1' });

  registerErrorHandler(app);

  return app;
}
