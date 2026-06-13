import { FastifyInstance } from 'fastify';
import { requireAuth, requireRole } from '../middleware/auth';
import * as ctrl from '../controllers/appointment.controller';
import * as queue from '../controllers/queue.controller';

const STATUS_ENUM = ['TBC', 'Ok!', 'Conf.', 'Comp.', 'Canc.', 'Resch.', 'Inf.'];

const idParam = {
  type: 'object' as const,
  properties: { id: { type: 'string', format: 'uuid' } },
  required: ['id'],
};

// Response schema for an Appointment (§4.6 contract). Must list EVERY field the
// repository returns — fastify serializes responses per schema and silently
// drops anything missing here. Keep in sync with @fadl/types Appointment.
// Status enum matches the DB CHECK (V010) which includes 'Ref.'; the request
// STATUS_ENUM above deliberately excludes it (refund flow sets it internally).
const appointmentSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    patientId: { type: 'string', format: 'uuid' },
    doctorId: { type: 'string', format: 'uuid' },
    specialtyId: { type: 'integer' },
    appointmentDate: { type: 'string' },
    startTime: { type: 'string' },
    endTime: { type: 'string' },
    timeZone: { type: 'string' },
    status: { type: 'string', enum: ['TBC', 'Ok!', 'Conf.', 'Comp.', 'Canc.', 'Resch.', 'Inf.', 'Ref.'] },
    appointmentType: { type: 'string', enum: ['in_person', 'online', 'walk_in'] },
    isOnline: { type: 'boolean' },
    isOverbooked: { type: 'boolean' },
    patientSource: { type: 'string', enum: ["Cl.'s", "Dr.'s", 'VEZ', 'Ex-VEZ', 'EKF', 'Ex-EKF', 'DO', 'Ex-DO', 'SHL'] },
    paymentMethod: { type: 'string', enum: ['cash', 'visa', 'instapay'], nullable: true },
    procedureId: { type: 'string', nullable: true },
    approvedCharge: { type: 'number', nullable: true },
    procedureCost: { type: 'number', nullable: true },
    queueNumber: { type: 'integer', nullable: true },
    checkedInAt: { type: 'string', nullable: true },
    checkedOutAt: { type: 'string', nullable: true },
    roomId: { type: 'string', nullable: true },
    roomCode: { type: 'string', nullable: true },
    roomAssignedAt: { type: 'string', nullable: true },
    waitingTimeMinutes: { type: 'integer', nullable: true },
    originalAppointmentId: { type: 'string', nullable: true },
    rescheduleCount: { type: 'integer' },
    idempotencyKey: { type: 'string', nullable: true },
    version: { type: 'integer' },
    deletedAt: { type: 'string', nullable: true },
    notes: { type: 'string', nullable: true },
    createdBy: { type: 'string', nullable: true },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
    branchId: { type: 'integer' },
  },
  required: ['id', 'patientId', 'doctorId', 'specialtyId', 'appointmentDate', 'startTime', 'endTime', 'timeZone', 'status', 'appointmentType', 'isOnline', 'isOverbooked', 'patientSource', 'rescheduleCount', 'version', 'createdAt', 'updatedAt', 'branchId'],
} as const;

// Response schema for a PatientQueueEntry (§4.6 contract). Keep in sync with
// queue.repository rowToEntry and @fadl/types PatientQueueEntry.
const queueEntrySchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    appointmentId: { type: 'string', format: 'uuid' },
    doctorId: { type: 'string', format: 'uuid' },
    patientId: { type: 'string', format: 'uuid' },
    queueDate: { type: 'string' },
    position: { type: 'integer' },
    originalPosition: { type: 'integer', nullable: true },
    status: { type: 'string', enum: ['waiting', 'called', 'in_session', 'completed', 'cancelled', 'no_show'] },
    checkedInAt: { type: 'string' },
    calledAt: { type: 'string', nullable: true },
    cancelledAt: { type: 'string', nullable: true },
    cancelReason: { type: 'string', nullable: true },
    rejoinedAt: { type: 'string', nullable: true },
    rejoinPosition: { type: 'integer', nullable: true },
    sessionStart: { type: 'string', nullable: true },
    sessionEnd: { type: 'string', nullable: true },
    estimatedWaitMinutes: { type: 'integer', nullable: true },
    branchId: { type: 'integer' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
  required: ['id', 'appointmentId', 'doctorId', 'patientId', 'queueDate', 'position', 'status', 'checkedInAt', 'branchId', 'createdAt', 'updatedAt'],
} as const;

const queueStatsSchema = {
  type: 'object',
  properties: {
    doctorId: { type: 'string', format: 'uuid' },
    queueDate: { type: 'string' },
    waiting: { type: 'integer' },
    called: { type: 'integer' },
    inSession: { type: 'integer' },
    completed: { type: 'integer' },
    cancelled: { type: 'integer' },
    avgSessionMinutes: { type: 'number' },
    estimatedWaitForNext: { type: 'number' },
  },
  required: ['doctorId', 'queueDate', 'waiting', 'called', 'inSession', 'completed', 'cancelled', 'avgSessionMinutes', 'estimatedWaitForNext'],
} as const;

const dataEnvelope = (data: object) => ({
  200: {
    type: 'object',
    properties: { success: { type: 'boolean' }, data },
    required: ['success', 'data'],
  },
});

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
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'array', items: appointmentSchema },
            total: { type: 'integer' },
            page: { type: 'integer' },
            limit: { type: 'integer' },
            totalPages: { type: 'integer' },
          },
          required: ['success', 'data', 'total', 'page', 'limit', 'totalPages'],
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
      response: {
        200: {
          type: 'object',
          properties: { success: { type: 'boolean' }, data: appointmentSchema },
          required: ['success', 'data'],
        },
      },
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
          appointmentType: { type: 'string', enum: ['in_person', 'online', 'walk_in'], default: 'in_person' },
          isOnline:        { type: 'boolean', default: false },
          patientSource:   { type: 'string' },
          paymentMethod:   { type: 'string', enum: ['cash', 'visa', 'instapay'] },
          approvedCharge:  { type: 'number', exclusiveMinimum: 0 },
          procedureCost:   { type: 'number', exclusiveMinimum: 0 },
          roomCode:        { type: 'string', maxLength: 10 },
          idempotencyKey:  { type: 'string', maxLength: 100 },
          notes:           { type: 'string', maxLength: 2000 },
        },
      },
    },
  }, ctrl.createAppointment);

  // POST /appointments/swap  (atomically exchange two appointments' time slots)
  app.post('/appointments/swap', {
    preHandler: [requireRole('receptionist', 'admin')],
    schema: {
      tags: ['appointments'],
      body: {
        type: 'object',
        required: ['appointmentIdA', 'appointmentIdB'],
        properties: {
          appointmentIdA: { type: 'string', format: 'uuid' },
          appointmentIdB: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, ctrl.swapAppointments);

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
          appointmentType: { type: 'string', enum: ['in_person', 'online', 'walk_in'] },
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
      response: dataEnvelope({ type: 'array', items: queueEntrySchema }),
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
      response: dataEnvelope(queueStatsSchema),
    },
  }, queue.getQueueStats);

  // GET /queue/:id
  app.get('/queue/:id', {
    schema: { tags: ['queue'], params: idParam, response: dataEnvelope(queueEntrySchema) },
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
    schema: {
      tags: ['queue'],
      params: idParam,
      response: dataEnvelope({
        type: 'object',
        properties: {
          cancelledPosition: { type: 'integer' },
          newEndPosition: { type: 'integer' },
          patientsToShift: { type: 'integer' },
        },
        required: ['cancelledPosition', 'newEndPosition', 'patientsToShift'],
      }),
    },
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
