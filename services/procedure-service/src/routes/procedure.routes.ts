import { FastifyInstance } from 'fastify';
import { requireAuth, requireRole } from '../middleware/auth';
import * as ctrl from '../controllers/procedure.controller';

export async function procedureRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', requireAuth);

  app.get('/procedures', {
    schema: {
      tags: ['procedures'],
      querystring: {
        type: 'object',
        properties: {
          specialtyId: { type: 'integer', minimum: 1 },
          procedureType: { type: 'string', enum: ['consultation', 'follow_up', 'operative', 'settling_fee', 'lab_test', 'imaging'] },
          isActive: { type: 'string', enum: ['true', 'false'] },
          q: { type: 'string' },
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
    },
  }, ctrl.listProcedures);

  app.get('/procedures/:id', {
    schema: {
      tags: ['procedures'],
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
    },
  }, ctrl.getProcedure);

  app.post('/procedures', {
    preHandler: [requireRole('admin')],
    schema: { tags: ['procedures'] },
  }, ctrl.createProcedure);

  app.patch('/procedures/:id', {
    preHandler: [requireRole('admin')],
    schema: {
      tags: ['procedures'],
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
    },
  }, ctrl.updateProcedure);

  app.delete('/procedures/:id', {
    preHandler: [requireRole('admin')],
    schema: {
      tags: ['procedures'],
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
    },
  }, ctrl.deleteProcedure);

  app.post('/procedures/:id/doctor-prices', {
    preHandler: [requireRole('admin')],
    schema: {
      tags: ['procedures'],
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
    },
  }, ctrl.setDoctorPrice);

  app.get('/procedures/:id/price', {
    schema: {
      tags: ['procedures'],
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      querystring: {
        type: 'object',
        properties: { doctorId: { type: 'string', format: 'uuid' } },
      },
    },
  }, ctrl.getEffectivePrice);
}
