import { FastifyInstance } from 'fastify';
import { requireAuth, requireRole } from '../middleware/auth';
import { requireModule } from '../middleware/requireModule';
import * as ctrl from '../controllers/encounter.controller';

const uuidParam = {
  type: 'object',
  properties: { id: { type: 'string', format: 'uuid' } },
  required: ['id'],
};

const patientUuidParam = {
  type: 'object',
  properties: { patientId: { type: 'string', format: 'uuid' } },
  required: ['patientId'],
};

export async function encounterRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', requireAuth);
  app.addHook('preHandler', requireModule);

  app.get('/encounters', {
    schema: {
      tags: ['encounters'],
      querystring: {
        type: 'object',
        properties: {
          patientId: { type: 'string', format: 'uuid' },
          doctorId: { type: 'string', format: 'uuid' },
          status: { type: 'string', enum: ['draft', 'in_progress', 'completed', 'signed_off'] },
          dateFrom: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          dateTo: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
    },
  }, ctrl.listEncounters);

  app.get('/encounters/:id', {
    schema: { tags: ['encounters'], params: uuidParam },
  }, ctrl.getEncounter);

  app.post('/encounters', {
    preHandler: [requireRole('doctor', 'admin')],
    schema: { tags: ['encounters'] },
  }, ctrl.createEncounter);

  app.patch('/encounters/:id', {
    preHandler: [requireRole('doctor', 'admin')],
    schema: { tags: ['encounters'], params: uuidParam },
  }, ctrl.updateEncounter);

  app.post('/encounters/:id/sign-off', {
    preHandler: [requireRole('doctor')],
    schema: { tags: ['encounters'], params: uuidParam },
  }, ctrl.signOffEncounter);

  // Convenience alias: patient's encounter history
  app.get('/patients/:patientId/encounters', {
    schema: {
      tags: ['encounters'],
      params: patientUuidParam,
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['draft', 'in_progress', 'completed', 'signed_off'] },
          dateFrom: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          dateTo: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
    },
  }, ctrl.listPatientEncounters);
}
