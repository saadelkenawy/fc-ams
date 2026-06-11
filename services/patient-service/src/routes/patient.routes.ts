import { FastifyInstance } from 'fastify';
import { requireAuth, requireRole } from '../middleware/auth';
import * as ctrl from '../controllers/patient.controller';

// Response schema for a Patient (§4.6 contract). Must list EVERY field the
// repository returns — fastify serializes responses per schema and silently
// drops anything missing here. Keep in sync with @fadl/types Patient.
const patientSchema = {
  type: 'object',
  properties: {
    patientId: { type: 'string', format: 'uuid' },
    mobile: { type: 'string' },
    mobileHistory: { type: 'array', items: { type: 'string' } },
    nationalId: { type: 'string', nullable: true },
    nameEn: { type: 'string' },
    nameAr: { type: 'string', nullable: true },
    dateOfBirth: { type: 'string', nullable: true },
    gender: { type: 'string', enum: ['M', 'F'], nullable: true },
    bloodType: { type: 'string', enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'], nullable: true },
    address: { type: 'string', nullable: true },
    email: { type: 'string', nullable: true },
    emergencyContactMobile: { type: 'string', nullable: true },
    emergencyContactName: { type: 'string', nullable: true },
    preferredLanguage: { type: 'string', enum: ['ar', 'en'] },
    sourceFirstVisit: { type: 'string', nullable: true },
    isFutureSource: { type: 'boolean' },
    futureSourceType: { type: 'string', nullable: true },
    futureSourceSetAt: { type: 'string', nullable: true },
    futureSourceSetBy: { type: 'string', nullable: true },
    deletedAt: { type: 'string', nullable: true },
    version: { type: 'integer' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
    createdBy: { type: 'string', nullable: true },
    branchId: { type: 'integer' },
  },
  required: ['patientId', 'mobile', 'mobileHistory', 'nameEn', 'preferredLanguage', 'isFutureSource', 'version', 'createdAt', 'updatedAt', 'branchId'],
} as const;

export async function patientRoutes(app: FastifyInstance): Promise<void> {
  // All routes require authentication
  app.addHook('onRequest', requireAuth);

  // GET /patients/batch?ids=uuid1,uuid2,...  — resolve names for multiple IDs
  app.get('/patients/batch', {
    schema: {
      tags: ['patients'],
      querystring: {
        type: 'object',
        required: ['ids'],
        properties: { ids: { type: 'string' } },
      },
    },
  }, ctrl.batchGetPatients);

  app.get('/patients/:id', {
    schema: {
      tags: ['patients'],
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      response: {
        200: {
          type: 'object',
          properties: { success: { type: 'boolean' }, data: patientSchema },
          required: ['success', 'data'],
        },
      },
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
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'array', items: patientSchema },
            total: { type: 'integer' },
            page: { type: 'integer' },
            limit: { type: 'integer' },
            totalPages: { type: 'integer' },
          },
          required: ['success', 'data', 'total', 'page', 'limit', 'totalPages'],
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
