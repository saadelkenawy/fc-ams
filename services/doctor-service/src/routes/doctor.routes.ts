import { FastifyInstance } from 'fastify';
import { requireAuth, requireRole } from '../middleware/auth';
import * as ctrl from '../controllers/doctor.controller';
import * as avail from '../controllers/availability.controller';

const idParam = {
  type: 'object' as const,
  properties: { id: { type: 'string', format: 'uuid' } },
  required: ['id'],
};

// Response schema for a Doctor (§4.6 contract). Must list EVERY field the
// repository returns — fastify serializes responses per schema and silently
// drops anything missing here. Keep in sync with @fadl/types Doctor.
const revenueSplitSchema = {
  type: 'object',
  properties: {
    doctorPercentage: { type: 'number' },
    clinicPercentage: { type: 'number' },
  },
  required: ['doctorPercentage', 'clinicPercentage'],
} as const;

const visitTypeSplitsSchema = {
  type: 'object',
  properties: {
    consultation: revenueSplitSchema,
    operative: revenueSplitSchema,
    online: revenueSplitSchema,
  },
  required: ['consultation', 'operative', 'online'],
} as const;

const doctorSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    mobile: { type: 'string' },
    nameEn: { type: 'string' },
    nameAr: { type: 'string', nullable: true },
    specialtyId: { type: 'integer' },
    secondarySpecialtyIds: { type: 'array', items: { type: 'integer' } },
    subSpecialty: { type: 'string', nullable: true },
    isOnlineDoctor: { type: 'boolean' },
    revenueSplits: {
      type: 'object',
      properties: {
        consultation: revenueSplitSchema,
        operative: revenueSplitSchema,
        online: revenueSplitSchema,
        // Per-specialty overrides keyed by specialtyId (multi-specialty doctors)
        bySpecialty: { type: 'object', additionalProperties: visitTypeSplitsSchema },
      },
      required: ['consultation', 'operative', 'online'],
    },
    paymentMethod: { type: 'string', enum: ['cash', 'instapay', 'bank_transfer', 'vfc_wallet', 'mobile_wallet'], nullable: true },
    allowOverbooking: { type: 'boolean' },
    overbookingBufferPercentage: { type: 'number' },
    isActive: { type: 'boolean' },
    deletedAt: { type: 'string', nullable: true },
    version: { type: 'integer' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
    branchId: { type: 'integer' },
  },
  required: ['id', 'mobile', 'nameEn', 'specialtyId', 'secondarySpecialtyIds', 'isOnlineDoctor', 'revenueSplits', 'allowOverbooking', 'overbookingBufferPercentage', 'isActive', 'version', 'createdAt', 'updatedAt', 'branchId'],
} as const;

const specialtySchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    code: { type: 'string' },
    nameEn: { type: 'string' },
    nameAr: { type: 'string' },
    category: { type: 'string', nullable: true },
    isActive: { type: 'boolean' },
  },
  required: ['id', 'code', 'nameEn', 'nameAr', 'isActive'],
} as const;

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
          limit:          { type: 'integer', minimum: 1, maximum: 500, default: 20 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'array', items: doctorSchema },
            total: { type: 'integer' },
            page: { type: 'integer' },
            limit: { type: 'integer' },
            totalPages: { type: 'integer' },
          },
          required: ['success', 'data', 'total', 'page', 'limit', 'totalPages'],
        },
      },
    },
  }, ctrl.listDoctors);

  // GET /specialties (no id param — must come before /doctors/:id)
  app.get('/specialties', {
    schema: {
      tags: ['doctors'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'array', items: specialtySchema },
          },
          required: ['success', 'data'],
        },
      },
    },
  }, async (_req, reply) => {
    const { listSpecialties } = await import('../repositories/doctor.repository');
    const data = await listSpecialties();
    reply.send({ success: true, data });
  });

  // GET /doctors/:id
  app.get('/doctors/:id', {
    schema: {
      tags: ['doctors'],
      params: idParam,
      response: {
        200: {
          type: 'object',
          properties: { success: { type: 'boolean' }, data: doctorSchema },
          required: ['success', 'data'],
        },
      },
    },
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

  // ── Consultation Hours ──────────────────────────────────────────────────────

  // GET /doctors/:id/consultation-hours
  app.get('/doctors/:id/consultation-hours', {
    schema: { tags: ['doctors'], params: idParam },
  }, avail.getConsultHours);

  // PUT /doctors/:id/consultation-hours  (single day)
  app.put('/doctors/:id/consultation-hours', {
    preHandler: [requireRole('admin', 'receptionist')],
    schema: {
      tags: ['doctors'],
      params: idParam,
      body: {
        type: 'object',
        required: ['dayOfWeek', 'startTime', 'endTime'],
        properties: {
          dayOfWeek:        { type: 'integer', minimum: 0, maximum: 6 },
          startTime:        { type: 'string', pattern: '^\\d{2}:\\d{2}$' },
          endTime:          { type: 'string', pattern: '^\\d{2}:\\d{2}$' },
          slotDurationMins: { type: 'integer', minimum: 5, maximum: 120 },
          maxPatients:      { type: 'integer', minimum: 1, maximum: 200 },
        },
      },
    },
  }, avail.putConsultHours);

  // PUT /doctors/:id/consultation-hours/bulk  (all days at once)
  app.put('/doctors/:id/consultation-hours/bulk', {
    preHandler: [requireRole('admin', 'receptionist')],
    schema: {
      tags: ['doctors'],
      params: idParam,
      body: {
        type: 'object',
        required: ['hours'],
        properties: {
          hours: {
            type: 'array',
            items: {
              type: 'object',
              required: ['dayOfWeek', 'startTime', 'endTime'],
              properties: {
                dayOfWeek:        { type: 'integer', minimum: 0, maximum: 6 },
                startTime:        { type: 'string', pattern: '^\\d{2}:\\d{2}$' },
                endTime:          { type: 'string', pattern: '^\\d{2}:\\d{2}$' },
                slotDurationMins: { type: 'integer', minimum: 5, maximum: 120 },
                maxPatients:      { type: 'integer', minimum: 1, maximum: 200 },
              },
            },
          },
        },
      },
    },
  }, avail.putConsultHoursBulk);

  // ── Doctor Status ───────────────────────────────────────────────────────────

  // GET /doctors/:id/status
  app.get('/doctors/:id/status', {
    schema: { tags: ['doctors'], params: idParam },
  }, avail.getDoctorStatus);

  // PATCH /doctors/:id/status
  app.patch('/doctors/:id/status', {
    preHandler: [requireRole('admin', 'receptionist', 'doctor')],
    schema: {
      tags: ['doctors'],
      params: idParam,
      body: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { type: 'string', enum: ['active', 'absent', 'on_his_way', 'day_off'] },
          note:   { type: 'string', maxLength: 500 },
        },
      },
    },
  }, avail.patchDoctorStatus);

  // GET /doctors/:id/status-history
  app.get('/doctors/:id/status-history', {
    schema: {
      tags: ['doctors'],
      params: idParam,
      querystring: {
        type: 'object',
        properties: { limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 } },
      },
    },
  }, avail.getDoctorStatusHistory);

  // ── Day Overrides ───────────────────────────────────────────────────────────

  // GET /doctors/:id/day-overrides
  app.get('/doctors/:id/day-overrides', {
    schema: {
      tags: ['doctors'],
      params: idParam,
      querystring: {
        type: 'object',
        properties: { from: { type: 'string', format: 'date' } },
      },
    },
  }, avail.getDayOverrides);

  // PUT /doctors/:id/day-overrides  (upsert by date)
  app.put('/doctors/:id/day-overrides', {
    preHandler: [requireRole('admin', 'receptionist')],
    schema: {
      tags: ['doctors'],
      params: idParam,
      body: {
        type: 'object',
        required: ['overrideDate', 'isWorking'],
        properties: {
          overrideDate: { type: 'string', format: 'date' },
          isWorking:    { type: 'boolean' },
          startTime:    { type: 'string', pattern: '^\\d{2}:\\d{2}$' },
          endTime:      { type: 'string', pattern: '^\\d{2}:\\d{2}$' },
          maxPatients:  { type: 'integer', minimum: 1, maximum: 200 },
          reason:       { type: 'string', maxLength: 500 },
        },
      },
    },
  }, avail.putDayOverride);

  // ── Availability ────────────────────────────────────────────────────────────

  // GET /doctors/:id/availability?date=YYYY-MM-DD
  app.get('/doctors/:id/availability', {
    schema: {
      tags: ['doctors'],
      params: idParam,
      querystring: {
        type: 'object',
        properties: { date: { type: 'string', format: 'date' } },
      },
    },
  }, avail.getDoctorAvailability);
}
