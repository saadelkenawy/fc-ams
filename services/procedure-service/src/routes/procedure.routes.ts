import { FastifyInstance } from 'fastify';
import { requireAuth, requireRole } from '../middleware/auth';
import * as ctrl from '../controllers/procedure.controller';

// Response schema for a Procedure (§4.6 contract). Must list EVERY field the
// repository returns — fastify serializes responses per schema and silently
// drops anything missing here. Keep in sync with the repository's Procedure
// interface (and the portal's local Procedure type in useProcedures.ts).
const procedureSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    code: { type: 'string' },
    nameEn: { type: 'string' },
    nameAr: { type: 'string', nullable: true },
    procedureType: { type: 'string', enum: ['consultation', 'follow_up', 'operative', 'settling_fee', 'lab_test', 'imaging'] },
    specialtyId: { type: 'integer' },
    basePrice: { type: 'number' },
    durationMinutes: { type: 'integer' },
    requiresPreAuth: { type: 'boolean' },
    notes: { type: 'string', nullable: true },
    isActive: { type: 'boolean' },
    deletedAt: { type: 'string', nullable: true },
    version: { type: 'integer' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
    branchId: { type: 'integer' },
  },
  required: ['id', 'code', 'nameEn', 'procedureType', 'specialtyId', 'basePrice', 'durationMinutes', 'requiresPreAuth', 'isActive', 'version', 'createdAt', 'updatedAt', 'branchId'],
} as const;

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
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'array', items: procedureSchema },
            total: { type: 'integer' },
            page: { type: 'integer' },
            limit: { type: 'integer' },
            totalPages: { type: 'integer' },
          },
          required: ['success', 'data', 'total', 'page', 'limit', 'totalPages'],
        },
      },
    },
  }, ctrl.listProcedures);

  app.get('/procedures/:id', {
    schema: {
      tags: ['procedures'],
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      response: {
        200: {
          type: 'object',
          properties: { success: { type: 'boolean' }, data: procedureSchema },
          required: ['success', 'data'],
        },
      },
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
