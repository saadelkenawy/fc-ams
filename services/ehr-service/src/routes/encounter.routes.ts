import { FastifyInstance } from 'fastify';
import { requireAuth, requireRole } from '../middleware/auth';
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

// Response schema for an Encounter (§4.6 contract). Must list EVERY field the
// repository returns — fastify serializes responses per schema and silently
// drops anything missing here. Keep in sync with the repository's Encounter
// interface (and the portal's local Encounter type in useEncounters.ts).
// vitalSigns is free-form: additionalProperties keeps its keys; the unknown[]
// arrays use unconstrained items for the same reason.
const encounterSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    patientId: { type: 'string', format: 'uuid' },
    appointmentId: { type: 'string', nullable: true },
    doctorId: { type: 'string', format: 'uuid' },
    specialtyId: { type: 'integer', nullable: true },
    encounterDate: { type: 'string' },
    encounterType: { type: 'string', enum: ['outpatient', 'inpatient', 'emergency', 'telehealth', 'follow_up'] },
    status: { type: 'string', enum: ['draft', 'in_progress', 'completed', 'signed_off'] },
    chiefComplaint: { type: 'string', nullable: true },
    historyOfPresentIllness: { type: 'string', nullable: true },
    diagnosisPrimary: { type: 'string', nullable: true },
    diagnosisSecondary: { type: 'array', items: {} },
    clinicalNotes: { type: 'string', nullable: true },
    vitalSigns: { type: 'object', additionalProperties: true },
    prescriptions: { type: 'array', items: {} },
    labOrders: { type: 'array', items: {} },
    followUpDate: { type: 'string', nullable: true },
    followUpNotes: { type: 'string', nullable: true },
    signedOffBy: { type: 'string', nullable: true },
    signedOffAt: { type: 'string', nullable: true },
    version: { type: 'integer' },
    createdBy: { type: 'string', nullable: true },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
    branchId: { type: 'integer' },
  },
  required: ['id', 'patientId', 'doctorId', 'encounterDate', 'encounterType', 'status', 'diagnosisSecondary', 'vitalSigns', 'prescriptions', 'labOrders', 'version', 'createdAt', 'updatedAt', 'branchId'],
} as const;

const encounterListResponse = {
  200: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      data: { type: 'array', items: encounterSchema },
      total: { type: 'integer' },
      page: { type: 'integer' },
      limit: { type: 'integer' },
    },
    required: ['success', 'data', 'total', 'page', 'limit'],
  },
} as const;

export async function encounterRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', requireAuth);

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
      response: encounterListResponse,
    },
  }, ctrl.listEncounters);

  app.get('/encounters/:id', {
    schema: {
      tags: ['encounters'],
      params: uuidParam,
      response: {
        200: {
          type: 'object',
          properties: { success: { type: 'boolean' }, data: encounterSchema },
          required: ['success', 'data'],
        },
      },
    },
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
      response: encounterListResponse,
    },
  }, ctrl.listPatientEncounters);
}
