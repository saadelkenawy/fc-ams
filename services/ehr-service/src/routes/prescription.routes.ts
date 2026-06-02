import { FastifyInstance } from 'fastify';
import { requireAuth, requireRole } from '../middleware/auth';
import * as ctrl from '../controllers/prescription.controller';

const uuidParam = {
  type: 'object',
  properties: { id: { type: 'string', format: 'uuid' } },
  required: ['id'],
};

export async function prescriptionRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', requireAuth);

  app.get('/prescriptions', {
    schema: {
      tags: ['prescriptions'],
      querystring: {
        type: 'object',
        properties: {
          patientId:   { type: 'string', format: 'uuid' },
          doctorId:    { type: 'string', format: 'uuid' },
          encounterId: { type: 'string', format: 'uuid' },
          status:      { type: 'string', enum: ['active', 'dispensed', 'cancelled'] },
          page:        { type: 'integer', minimum: 1, default: 1 },
          limit:       { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
    },
  }, ctrl.listPrescriptions);

  app.get('/prescriptions/:id', {
    schema: { tags: ['prescriptions'], params: uuidParam },
  }, ctrl.getPrescription);

  app.post('/prescriptions', {
    preHandler: [requireRole('doctor', 'admin')],
    schema: { tags: ['prescriptions'] },
  }, ctrl.createPrescription);

  app.patch('/prescriptions/:id/status', {
    preHandler: [requireRole('doctor', 'admin')],
    schema: { tags: ['prescriptions'], params: uuidParam },
  }, ctrl.updateStatus);

  app.delete('/prescriptions/:id', {
    preHandler: [requireRole('doctor', 'admin')],
    schema: { tags: ['prescriptions'], params: uuidParam },
  }, ctrl.deletePrescription);

  app.get('/medications/search', {
    schema: {
      tags: ['prescriptions'],
      querystring: {
        type: 'object',
        properties: { q: { type: 'string', minLength: 1 } },
        required: ['q'],
      },
    },
  }, ctrl.searchMedications);
}
