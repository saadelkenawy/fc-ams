import { FastifyInstance } from 'fastify';
import { requireAuth, requireRole } from '../middleware/auth';
import * as ctrl from '../controllers/doctor.controller';

const idParam = {
  type: 'object' as const,
  properties: { id: { type: 'string', format: 'uuid' } },
  required: ['id'],
};

export async function doctorRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', requireAuth);

  // GET /doctors
  app.get('/doctors', {
    schema: {
      tags: ['doctors'],
      querystring: {
        type: 'object',
        properties: {
          specialtyId:    { type: 'integer' },
          isActive:       { type: 'string', enum: ['true', 'false'] },
          isOnlineDoctor: { type: 'string', enum: ['true', 'false'] },
          page:           { type: 'integer', minimum: 1, default: 1 },
          limit:          { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
    },
  }, ctrl.listDoctors);

  // GET /specialties (no id param — must come before /doctors/:id)
  app.get('/specialties', {
    schema: { tags: ['doctors'] },
  }, async (_req, reply) => {
    const { listSpecialties } = await import('../repositories/doctor.repository');
    const data = await listSpecialties();
    void reply.send({ success: true, data });
  });

  // GET /doctors/:id
  app.get('/doctors/:id', {
    schema: { tags: ['doctors'], params: idParam },
  }, ctrl.getDoctor);

  // POST /doctors
  app.post('/doctors', {
    preHandler: [requireRole('admin')],
    schema: { tags: ['doctors'] },
  }, ctrl.createDoctor);

  // PATCH /doctors/:id
  app.patch('/doctors/:id', {
    preHandler: [requireRole('admin', 'receptionist')],
    schema: { tags: ['doctors'], params: idParam },
  }, ctrl.updateDoctor);

  // PATCH /doctors/:id/active
  app.patch('/doctors/:id/active', {
    preHandler: [requireRole('admin')],
    schema: {
      tags: ['doctors'],
      params: idParam,
      body: {
        type: 'object',
        required: ['isActive'],
        properties: { isActive: { type: 'boolean' } },
      },
    },
  }, ctrl.toggleActive);

  // DELETE /doctors/:id
  app.delete('/doctors/:id', {
    preHandler: [requireRole('admin')],
    schema: { tags: ['doctors'], params: idParam },
  }, ctrl.deleteDoctor);

  // GET /doctors/:id/schedules
  app.get('/doctors/:id/schedules', {
    schema: { tags: ['doctors'], params: idParam },
  }, ctrl.getSchedules);

  // PUT /doctors/:id/schedules
  app.put('/doctors/:id/schedules', {
    preHandler: [requireRole('admin', 'receptionist')],
    schema: {
      tags: ['doctors'],
      params: idParam,
      body: {
        type: 'object',
        required: ['dayOfWeek', 'startTime', 'endTime', 'slotDurationMinutes', 'validFrom'],
        properties: {
          dayOfWeek:            { type: 'integer', minimum: 0, maximum: 6 },
          startTime:            { type: 'string', pattern: '^\\d{2}:\\d{2}$' },
          endTime:              { type: 'string', pattern: '^\\d{2}:\\d{2}$' },
          slotDurationMinutes:  { type: 'integer', minimum: 5, maximum: 120 },
          validFrom:            { type: 'string', format: 'date' },
          validUntil:           { type: 'string', format: 'date' },
        },
      },
    },
  }, ctrl.upsertSchedule);

  // GET /doctors/:id/schedule-overrides
  app.get('/doctors/:id/schedule-overrides', {
    schema: {
      tags: ['doctors'],
      params: idParam,
      querystring: {
        type: 'object',
        properties: { from: { type: 'string', format: 'date' } },
      },
    },
  }, ctrl.getOverrides);

  // POST /doctors/:id/schedule-overrides
  app.post('/doctors/:id/schedule-overrides', {
    preHandler: [requireRole('admin', 'receptionist')],
    schema: {
      tags: ['doctors'],
      params: idParam,
      body: {
        type: 'object',
        required: ['overrideDate', 'overrideType'],
        properties: {
          overrideDate:    { type: 'string', format: 'date' },
          overrideType:    { type: 'string', enum: ['unavailable', 'custom_hours', 'holiday'] },
          customStartTime: { type: 'string', pattern: '^\\d{2}:\\d{2}$' },
          customEndTime:   { type: 'string', pattern: '^\\d{2}:\\d{2}$' },
          reason:          { type: 'string', maxLength: 500 },
          notifyPatients:  { type: 'boolean', default: false },
        },
      },
    },
  }, ctrl.createOverride);
}
