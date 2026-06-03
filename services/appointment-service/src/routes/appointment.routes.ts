import { FastifyInstance } from 'fastify';
import { requireAuth, requireRole } from '../middleware/auth';
import { requireModule } from '../middleware/requireModule';
import * as ctrl from '../controllers/appointment.controller';
import * as queue from '../controllers/queue.controller';

const STATUS_ENUM = ['TBC', 'Ok!', 'Conf.', 'Comp.', 'Canc.', 'Resch.', 'Inf.'];

const idParam = {
  type: 'object' as const,
  properties: { id: { type: 'string', format: 'uuid' } },
  required: ['id'],
};

export async function appointmentRoutes(app: FastifyInstance): Promise<void> {
  // All routes require authentication
  app.addHook('onRequest', requireAuth);
  app.addHook('preHandler', requireModule);

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

  // GET /appointments/doctors-on-date?date=YYYY-MM-DD
  // Lightweight: returns [{ doctorId, appointmentCount }] for room assignment filtering
  app.get('/appointments/doctors-on-date', {
    schema: {
      tags: ['appointments'],
      querystring: {
        type: 'object',
        required: ['date'],
        properties: {
          date: { type: 'string', format: 'date' },
        },
      },
    },
  }, ctrl.listDoctorsOnDate);

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
          appointmentType: { type: 'string', enum: ['in_person', 'online', 'home_visit', 'walk_in'], default: 'in_person' },
          isOnline:        { type: 'boolean', default: false },
          patientSource:   { type: 'string' },
          paymentMethod:   { type: 'string', enum: ['cash', 'visa', 'instapay'] },
          approvedCharge:  { type: 'number', exclusiveMinimum: 0 },
          procedureCost:   { type: 'number', exclusiveMinimum: 0 },
          idempotencyKey:  { type: 'string', maxLength: 100 },
          notes:           { type: 'string', maxLength: 2000 },
        },
      },
    },
  }, ctrl.createAppointment);

  // PATCH /appointments/:id  (edit appointment — admin and receptionist)
  app.patch('/appointments/:id', {
    preHandler: [requireRole('receptionist', 'admin')],
    schema: {
      tags: ['appointments'],
      params: idParam,
      body: {
        type: 'object',
        properties: {
          doctorId:        { type: 'string', format: 'uuid' },
          specialtyId:     { type: 'integer' },
          appointmentDate: { type: 'string', format: 'date' },
          startTime:       { type: 'string', pattern: '^\\d{2}:\\d{2}$' },
          endTime:         { type: 'string', pattern: '^\\d{2}:\\d{2}$' },
          appointmentType: { type: 'string', enum: ['in_person', 'online', 'home_visit', 'walk_in'] },
          patientSource:   { type: 'string' },
          paymentMethod:   { type: ['string', 'null'], enum: ['cash', 'visa', 'instapay', null] },
          approvedCharge:  { type: ['number', 'null'], exclusiveMinimum: 0 },
          procedureCost:   { type: ['number', 'null'], exclusiveMinimum: 0 },
          procedureId:     { type: ['string', 'null'], format: 'uuid' },
          notes:           { type: ['string', 'null'], maxLength: 2000 },
        },
      },
    },
  }, ctrl.updateAppointment);

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

  // PATCH /appointments/:id/soft-delete  (internal — called by billing-service on refund)
  app.patch('/appointments/:id/soft-delete', {
    preHandler: [requireRole('admin')],
    schema: { tags: ['appointments'], params: idParam },
  }, ctrl.softDeleteAppointmentHandler);

  // PATCH /appointments/:id/billing-cascade-delete  (internal — called by billing-service on bulk delete)
  // Only soft-deletes if appointment status is TBC / Ok! / Conf. — silently skips others
  app.patch('/appointments/:id/billing-cascade-delete', {
    preHandler: [requireRole('admin')],
    schema: { tags: ['appointments'], params: idParam },
  }, ctrl.billingCascadeDeleteHandler);

  // DELETE /appointments/:id  (hard delete — admin only, requires password + reason)
  app.delete('/appointments/:id', {
    preHandler: [requireRole('admin')],
    schema: {
      tags: ['appointments'],
      params: idParam,
      body: {
        type: 'object',
        required: ['password', 'reason'],
        properties: {
          password: { type: 'string', minLength: 1 },
          reason:   { type: 'string', minLength: 10 },
        },
      },
    },
  }, ctrl.deleteAppointment);

  // ── Patient Queue ───────────────────────────────────────────────────────────

  // POST /queue/check-in
  app.post('/queue/check-in', {
    preHandler: [requireRole('receptionist', 'admin')],
    schema: {
      tags: ['queue'],
      body: {
        type: 'object',
        required: ['appointmentId', 'doctorId', 'patientId', 'queueDate'],
        properties: {
          appointmentId: { type: 'string', format: 'uuid' },
          doctorId:      { type: 'string', format: 'uuid' },
          patientId:     { type: 'string', format: 'uuid' },
          queueDate:     { type: 'string', format: 'date' },
        },
      },
    },
  }, queue.checkIn);

  // GET /queue
  app.get('/queue', {
    schema: {
      tags: ['queue'],
      querystring: {
        type: 'object',
        required: ['doctorId'],
        properties: {
          doctorId: { type: 'string', format: 'uuid' },
          date:     { type: 'string', format: 'date' },
        },
      },
    },
  }, queue.getFullQueue);

  // GET /queue/stats
  app.get('/queue/stats', {
    schema: {
      tags: ['queue'],
      querystring: {
        type: 'object',
        required: ['doctorId'],
        properties: {
          doctorId: { type: 'string', format: 'uuid' },
          date:     { type: 'string', format: 'date' },
        },
      },
    },
  }, queue.getQueueStats);

  // GET /queue/:id
  app.get('/queue/:id', {
    schema: { tags: ['queue'], params: idParam },
  }, queue.getPosition);

  // POST /queue/:id/call
  app.post('/queue/:id/call', {
    preHandler: [requireRole('receptionist', 'doctor', 'admin')],
    schema: { tags: ['queue'], params: idParam },
  }, queue.callPatient);

  // POST /queue/:id/start-session
  app.post('/queue/:id/start-session', {
    preHandler: [requireRole('receptionist', 'doctor', 'admin')],
    schema: { tags: ['queue'], params: idParam },
  }, queue.startSession);

  // POST /queue/:id/complete
  app.post('/queue/:id/complete', {
    preHandler: [requireRole('receptionist', 'doctor', 'admin')],
    schema: { tags: ['queue'], params: idParam },
  }, queue.completeSession);

  // POST /queue/:id/no-show
  app.post('/queue/:id/no-show', {
    preHandler: [requireRole('receptionist', 'admin')],
    schema: { tags: ['queue'], params: idParam },
  }, queue.markNoShow);

  // DELETE /queue/:id  (cancel + auto-rejoin at end)
  app.delete('/queue/:id', {
    preHandler: [requireRole('receptionist', 'admin')],
    schema: { tags: ['queue'], params: idParam },
  }, queue.cancelFromQueue);

  // GET /queue/:id/cancel-preview  (read-only shift preview for confirmation dialog)
  app.get('/queue/:id/cancel-preview', {
    schema: { tags: ['queue'], params: idParam },
  }, queue.previewCancel);

  // POST /queue/:id/rejoin  (manual rejoin for no_show only)
  app.post('/queue/:id/rejoin', {
    preHandler: [requireRole('receptionist', 'admin')],
    schema: { tags: ['queue'], params: idParam },
  }, queue.rejoinQueue);

  // GET /queue/stream  (SSE — real-time queue updates)
  app.get('/queue/stream', {
    schema: { tags: ['queue'] },
  }, queue.queueStream);
}
