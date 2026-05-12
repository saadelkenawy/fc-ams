import { FastifyInstance } from 'fastify';
import { requireAuth, requireRole } from '../middleware/auth';
import * as ctrl from '../controllers/patient.controller';

export async function patientRoutes(app: FastifyInstance): Promise<void> {
  // All routes require authentication
  app.addHook('onRequest', requireAuth);

  app.get('/patients/:id', {
    schema: {
      tags: ['patients'],
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
    },
  }, ctrl.getPatient);

  app.get('/patients', {
    schema: {
      tags: ['patients'],
      querystring: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          mobile: { type: 'string' },
          nationalId: { type: 'string' },
          isFutureSource: { type: 'boolean' },
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 500, default: 20 },
        },
      },
    },
  }, ctrl.searchPatients);

  app.post('/patients', {
    preHandler: [requireRole('admin', 'receptionist', 'doctor')],
    schema: { tags: ['patients'] },
  }, ctrl.createPatient);

  app.patch('/patients/:id', {
    preHandler: [requireRole('admin', 'receptionist', 'doctor')],
    schema: {
      tags: ['patients'],
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
    },
  }, ctrl.updatePatient);

  app.delete('/patients/:id', {
    preHandler: [requireRole('admin')],
    schema: {
      tags: ['patients'],
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
    },
  }, ctrl.deletePatient);
}
