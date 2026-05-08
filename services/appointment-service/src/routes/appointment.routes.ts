import { FastifyInstance } from 'fastify';
import { requireAuth, requireRole } from '../middleware/auth';
import * as ctrl from '../controllers/appointment.controller';

const STATUS_ENUM = ['TBC', 'Ok!', 'Conf.', 'Comp.', 'Canc.', 'Resch.', 'Inf.'];

const idParam = {
  type: 'object' as const,
  properties: { id: { type: 'string', format: 'uuid' } },
  required: ['id'],
};

export async function appointmentRoutes(app: FastifyInstance): Promise<void> {
  // All routes require authentication
  app.addHook('onRequest', requireAuth);

  // GET /appointments
  app.get('/appointments', {
    schema: {
      tags: ['appointments'],
      querystring: {
        type: 'object',
        properties: {
          doctorId:  { type: 'string', format: 'uuid' },
          patientId: { type: 'string', format: 'uuid' },
          date:      { type: 'string', format: 'date' },
          status:    { type: 'string', enum: STATUS_ENUM },
          page:      { type: 'integer', minimum: 1, default: 1 },
          limit:     { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
    },
  }, ctrl.listAppointments);

  // GET /appointments/:id
  app.get('/appointments/:id', {
    schema: {
      tags: ['appointments'],
      params: idParam,
    },
  }, ctrl.getAppointment);

  // POST /appointments
  app.post('/appointments', {
    preHandler: [requireRole('receptionist', 'doctor', 'admin')],
    schema: {
      tags: ['appointments'],
      body: {
        type: 'object',
        required: ['patientId', 'doctorId', 'appointmentDate', 'startTime', 'endTime'],
        properties: {
          patientId:       { type: 'string', format: 'uuid' },
          doctorId:        { type: 'string', format: 'uuid' },
          specialtyId:     { type: 'integer' },
          appointmentDate: { type: 'string', format: 'date' },
          startTime:       { type: 'string', pattern: '^\\d{2}:\\d{2}$' },
          endTime:         { type: 'string', pattern: '^\\d{2}:\\d{2}$' },
          appointmentType: { type: 'string', enum: ['in_person', 'online', 'home_visit'], default: 'in_person' },
          isOnline:        { type: 'boolean', default: false },
          patientSource:   { type: 'string' },
          approvedCharge:  { type: 'number', exclusiveMinimum: 0 },
          procedureCost:   { type: 'number', exclusiveMinimum: 0 },
          idempotencyKey:  { type: 'string', maxLength: 100 },
          notes:           { type: 'string', maxLength: 2000 },
        },
      },
    },
  }, ctrl.createAppointment);

  // PATCH /appointments/:id/status
  app.patch('/appointments/:id/status', {
    preHandler: [requireRole('receptionist', 'doctor', 'admin')],
    schema: {
      tags: ['appointments'],
      params: idParam,
      body: {
        type: 'object',
        required: ['status', 'version'],
        properties: {
          status:  { type: 'string', enum: STATUS_ENUM },
          version: { type: 'integer', minimum: 1 },
        },
      },
    },
  }, ctrl.updateStatus);

  // POST /appointments/:id/checkin
  app.post('/appointments/:id/checkin', {
    preHandler: [requireRole('receptionist', 'admin')],
    schema: {
      tags: ['appointments'],
      params: idParam,
    },
  }, ctrl.checkIn);

  // DELETE /appointments/:id
  app.delete('/appointments/:id', {
    preHandler: [requireRole('admin')],
    schema: {
      tags: ['appointments'],
      params: idParam,
    },
  }, ctrl.deleteAppointment);
}
