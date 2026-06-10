import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { registerErrorHandler } from '@fadl/service-kit';
import { config } from './config';
import { redis } from './config/redis';
import { startDoctorStatusSubscriber } from './subscribers/doctor-status.subscriber';
import { appointmentRoutes } from './routes/appointment.routes';
import { roomRoutes } from './routes/room.routes';

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

  await app.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: { title: 'Fadl Clinic — Appointment Service', version: '1.0.0', description: 'Appointment scheduling and management API' },
      tags: [{ name: 'appointments', description: 'Appointment CRUD and status transitions' }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
      security: [{ bearerAuth: [] }],
    },
  });

  await app.register(swaggerUi, { routePrefix: '/docs' });

  await redis.connect().catch(() => { /* logged by redis.on('error') */ });
  await startDoctorStatusSubscriber().catch((err: Error) => {
    console.error('[app] Failed to start doctor-status subscriber', err.message);
  });

  app.get('/health', { logLevel: 'silent' }, async () => ({ status: 'ok', service: 'appointment-service' }));

  await app.register(appointmentRoutes, { prefix: '/api/v1' });
  await app.register(roomRoutes, { prefix: '/api/v1' });

  registerErrorHandler(app);

  return app;
}
