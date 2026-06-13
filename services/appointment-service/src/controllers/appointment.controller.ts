import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { Appointment, AppointmentStatus, JwtPayload } from '@fadl/types';
import * as repo from '../repositories/appointment.repository';
import * as queueRepo from '../repositories/queue.repository';
import * as roomRepo from '../repositories/room.repository';
import { fireNotification } from '../clients/notification';
import { createBillingTransaction, refundTransactionByAppointment, syncBillingApprovedCharge, syncBillingPaymentStatus } from '../clients/billing';
import { verifyUserPassword } from '../clients/identity';
import { getDoctorAvailability } from '../clients/doctor';
import { broadcastRoom } from '../lib/room-sse';
import { broadcast as broadcastQueue } from '../lib/queue-sse';

const APPOINTMENT_STATUS = z.enum(['TBC', 'Ok!', 'Conf.', 'Comp.', 'Canc.', 'Resch.', 'Inf.', 'Ref.']);

export const createSchema = z.object({
  patientId:       z.string().uuid(),
  doctorId:        z.string().uuid(),
  specialtyId:     z.number().int().optional(),
  appointmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime:       z.string().regex(/^\d{2}:\d{2}$/),
  endTime:         z.string().regex(/^\d{2}:\d{2}$/),
  appointmentType: z.enum(['in_person', 'online', 'walk_in']).default('in_person'),
  isOnline:        z.boolean().default(false),
  patientSource:   z.string().default("Cl.'s"),
  paymentMethod:   z.enum(['cash', 'visa', 'instapay']).optional(),
  approvedCharge:  z.number().positive().optional(),
  procedureCost:   z.number().positive().optional(),
  roomCode:        z.string().max(10).optional(),
  idempotencyKey:  z.string().max(100).optional(),
  notes:           z.string().max(2000).optional(),
}).refine(
  (data) => data.startTime < data.endTime,
  { message: 'endTime must be after startTime', path: ['endTime'] },
);

export const updateSchema = z.object({
  doctorId:        z.string().uuid().optional(),
  specialtyId:     z.number().int().optional(),
  appointmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startTime:       z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime:         z.string().regex(/^\d{2}:\d{2}$/).optional(),
  appointmentType: z.enum(['in_person', 'online', 'walk_in']).optional(),
  patientSource:   z.string().optional(),
  paymentMethod:   z.enum(['cash', 'visa', 'instapay']).nullable().optional(),
  approvedCharge:  z.number().positive().nullable().optional(),
  procedureCost:   z.number().positive().nullable().optional(),
  procedureId:     z.string().uuid().nullable().optional(),
  notes:           z.string().max(2000).nullable().optional(),
});

export const statusSchema = z.object({
  status:  APPOINTMENT_STATUS,
  version: z.number().int().positive(),
});

export const confirmationsSchema = z.object({
  doctorConfirmed:  z.boolean().optional(),
  patientConfirmed: z.boolean().optional(),
  // Manual room/clinic override — when present, replaces the auto-derived
  // room readiness for the auto-confirm decision.
  roomConfirmed:    z.boolean().optional(),
  version:          z.number().int().positive(),
}).refine(
  (d) => d.doctorConfirmed !== undefined || d.patientConfirmed !== undefined || d.roomConfirmed !== undefined,
  { message: 'At least one confirmation flag must be provided' },
);

export const listSchema = z.object({
  doctorId:  z.string().uuid().optional(),
  patientId: z.string().uuid().optional(),
  date:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status:    APPOINTMENT_STATUS.optional(),
  page:      z.coerce.number().int().positive().default(1),
  limit:     z.coerce.number().int().positive().max(100).default(20),
});

export const deleteSchema = z.object({
  password: z.string().min(1),
  reason:   z.string().min(10, 'Deletion reason must be at least 10 characters'),
});

export async function getAppointment(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const appointment = await repo.findAppointmentById(id);
  if (!appointment) {
    reply.status(404).send({ success: false, error: { code: 'APPOINTMENT_NOT_FOUND', message: 'Appointment not found' } });
    return;
  }
  reply.send({ success: true, data: appointment });
}

export async function listAppointments(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const params = listSchema.parse(request.query);
  const result = await repo.listAppointments(params);
  reply.send({ success: true, ...result });
}

const doctorsOnDateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function listDoctorsOnDate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { date } = doctorsOnDateSchema.parse(request.query);
  const doctors = await repo.getDoctorsOnDate(date);
  reply.send({ success: true, data: doctors });
}

export async function createAppointment(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const input = createSchema.parse(request.body);
  const user = request.user as JwtPayload;

  // Validate against the doctor's configured working days/hours (doctor-service
  // consultation hours + day overrides). Only enforced for doctors who have a
  // schedule configured; fail-open when doctor-service is down.
  if (input.appointmentType !== 'online') {
    const availability = await getDoctorAvailability(input.doctorId, input.appointmentDate);
    if (availability && availability.hasSchedule === true) {
      if (!availability.isWorking || availability.slots.length === 0) {
        reply.status(422).send({
          success: false,
          error: { code: 'DOCTOR_NOT_AVAILABLE', message: 'Doctor is not available on this day' },
        });
        return;
      }
      // The whole session (start → end) must fit inside the clinic working
      // window so dynamic session lengths can't run past closing time.
      const workStart = availability.workStart ?? availability.slots[0].time;
      const workEnd = availability.workEnd ?? availability.slots[availability.slots.length - 1].time;
      if (input.startTime < workStart || input.endTime > workEnd) {
        reply.status(422).send({
          success: false,
          error: {
            code: 'DOCTOR_NOT_AVAILABLE',
            message: `Doctor is not available at this time — working hours on this day are ${workStart}–${workEnd}`,
          },
        });
        return;
      }
    }
  }

  const appointment = await repo.createAppointment(input, user.sub, user.branchId);

  // Auto-assign room via Redis cache (fire-and-forget)
  if (input.appointmentDate === new Date().toISOString().split('T')[0]) {
    void (async () => {
      try {
        const { redis } = await import('../config/redis');
        const cached = await redis.get(`room:doctor:${input.doctorId}:${input.appointmentDate}`);
        if (cached) {
          const { roomId, roomCode } = JSON.parse(cached) as { roomId: number; roomCode: string };
          const { withTransaction } = await import('../config/database');
          await withTransaction(user.branchId, async (client) => {
            await client.query(
              `UPDATE appointments SET room_id = $1, room_code = $2, room_assigned_at = NOW(), updated_at = NOW() WHERE id = $3`,
              [roomId, roomCode, appointment.id],
            );
          });
          broadcastRoom(user.branchId, 'room_updated', { roomId, roomCode, appointmentId: appointment.id });
        }
      } catch (err) {
        console.error('[appt] auto-room assignment failed', (err as Error).message);
      }
    })();
  }

  // Billing record creation now goes through the transactional outbox inside
  // repo.createAppointment — committed atomically and delivered with retries.

  // SMS notification (fire-and-forget)
  void fireNotification({
    channel:        'sms',
    recipientId:    appointment.patientId,
    recipientType:  'patient',
    body:           `موعدك تم تأكيده بتاريخ ${appointment.appointmentDate} الساعة ${appointment.startTime}. المرجع: ${appointment.id.slice(0, 8)}`,
    idempotencyKey: `appt-booked-${appointment.id}`,
    appointmentId:  appointment.id,
  });

  reply.status(201).send({ success: true, data: appointment });
}

export async function updateAppointment(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const input = updateSchema.parse(request.body);
  const user = request.user as JwtPayload;
  const appointment = await repo.updateAppointment(id, input, user.sub);

  if (input.approvedCharge != null) {
    void syncBillingApprovedCharge(id, input.approvedCharge).catch((err: Error) =>
      console.error('[appt] billing charge sync failed', err.message),
    );
  }

  reply.send({ success: true, data: appointment });
}

export const swapSchema = z.object({
  appointmentIdA: z.string().uuid(),
  appointmentIdB: z.string().uuid(),
}).refine((d) => d.appointmentIdA !== d.appointmentIdB, {
  message: 'Cannot swap an appointment with itself',
  path: ['appointmentIdB'],
});

export async function swapAppointments(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { appointmentIdA, appointmentIdB } = swapSchema.parse(request.body);
  const user = request.user as JwtPayload;
  const result = await repo.swapAppointmentTimes(appointmentIdA, appointmentIdB, user.sub);
  reply.send({ success: true, data: result });
}

export async function updateStatus(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const { status, version } = statusSchema.parse(request.body);
  const user = request.user as JwtPayload;
  const appointment = await repo.updateAppointmentStatus(id, status as AppointmentStatus, version, user.sub);

  if (status === 'Canc.') {
    void fireNotification({
      channel:        'sms',
      recipientId:    appointment.patientId,
      recipientType:  'patient',
      body:           `تم إلغاء موعدك بتاريخ ${appointment.appointmentDate}. للحجز مجدداً اتصل بالعيادة.`,
      idempotencyKey: `appt-cancelled-${appointment.id}-${appointment.version}`,
      appointmentId:  appointment.id,
    });
  } else if (status === 'Ok!') {
    void fireNotification({
      channel:        'sms',
      recipientId:    appointment.patientId,
      recipientType:  'patient',
      body:           `تم تأكيد موعدك بتاريخ ${appointment.appointmentDate} الساعة ${appointment.startTime}.`,
      idempotencyKey: `appt-confirmed-${appointment.id}-${appointment.version}`,
      appointmentId:  appointment.id,
    });
    // Sync billing: confirmed appointment → payment marked as paid
    void syncBillingPaymentStatus(appointment.id, 'paid').catch((err: Error) =>
      console.error('[appt] billing status sync failed', err.message),
    );
  } else if (status === 'Comp.') {
    // Consultation complete — ensure billing is marked paid (idempotent if Ok! already set it)
    void syncBillingPaymentStatus(appointment.id, 'paid').catch((err: Error) =>
      console.error('[appt] billing status sync on completion failed', err.message),
    );
    // Advance queue and auto-release room if all patients are done (fire-and-forget)
    void (async () => {
      try {
        const adv = await queueRepo.advanceQueueAfterCompletion(appointment.id, user.sub, user.branchId);
        if (!adv) return;

        // Push queue SSE so room boards update immediately
        try {
          const [fullQueue, stats] = await Promise.all([
            queueRepo.getFullQueue(adv.doctorId, adv.queueDate),
            queueRepo.getQueueStats(adv.doctorId, adv.queueDate),
          ]);
          broadcastQueue(adv.doctorId, adv.queueDate, user.branchId, 'queue_update', {
            queue: fullQueue, stats, doctorId: adv.doctorId, date: adv.queueDate,
          });
        } catch { /* non-critical */ }

        if (!adv.queueExhausted) return;

        // Look up room from Redis then release
        const { redis } = await import('../config/redis');
        const cached = await redis.get(`room:doctor:${adv.doctorId}:${adv.queueDate}`);
        if (!cached) return;
        const { roomCode } = JSON.parse(cached) as { roomId: number; roomCode: string };

        const released = await roomRepo.releaseRoomByCode(roomCode, user.branchId);
        if (!released) return;

        await redis.del(`room:doctor:${adv.doctorId}:${adv.queueDate}`);

        const { withTransaction } = await import('../config/database');
        await withTransaction(user.branchId, async (client) => {
          await client.query(
            `UPDATE appointments
             SET room_id = NULL, room_code = NULL, room_assigned_at = NULL, updated_at = NOW()
             WHERE doctor_id = $1 AND appointment_date = $2
               AND status NOT IN ('Comp.','Canc.','Resch.') AND deleted_at IS NULL`,
            [adv.doctorId, adv.queueDate],
          );
        });

        broadcastRoom(user.branchId, 'room_released', {
          roomCode,
          doctorId: adv.doctorId,
          date: adv.queueDate,
        });
      } catch (err) {
        console.error('[appt] queue/room advancement after manual Comp. failed', (err as Error).message);
      }
    })();
  } else if (status === 'Ref.') {
    void refundTransactionByAppointment(appointment.id).catch((err: Error) =>
      console.error('[appt] billing refund on Ref. status failed', err.message),
    );
  }

  reply.send({ success: true, data: appointment });
}

// Derives whether the room assigned to an appointment is "ready": the room
// must be assigned (directly or via the doctor's day assignment), active, and
// still have free slots for the day.
async function computeRoomReady(appt: Appointment, branchId: number): Promise<boolean> {
  try {
    const rooms = await roomRepo.listRooms(appt.appointmentDate, branchId);
    const room = rooms.find((r) =>
      (appt.roomCode && r.roomCode === appt.roomCode) ||
      (r.assignedDoctor?.id === appt.doctorId),
    );
    if (!room) return false;
    return room.isActive && room.status !== 'inactive' && room.appointmentsRemaining > 0;
  } catch {
    return false;
  }
}

export async function updateConfirmations(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const { doctorConfirmed, patientConfirmed, roomConfirmed, version } = confirmationsSchema.parse(request.body);
  const user = request.user as JwtPayload;

  const existing = await repo.findAppointmentById(id);
  if (!existing) {
    reply.status(404).send({ success: false, error: { code: 'APPOINTMENT_NOT_FOUND', message: 'Appointment not found' } });
    return;
  }

  // Manual override wins; otherwise derive room readiness from live capacity.
  const roomReady = roomConfirmed !== undefined
    ? roomConfirmed
    : await computeRoomReady(existing, user.branchId);

  const result = await repo.updateConfirmations(
    id, { doctorConfirmed, patientConfirmed }, roomReady, version, user.sub,
  );
  const appointment = result.appointment;

  // Mirror the side-effects of a manual TBC → Ok! transition.
  if (result.autoConfirmed) {
    void fireNotification({
      channel:        'sms',
      recipientId:    appointment.patientId,
      recipientType:  'patient',
      body:           `تم تأكيد موعدك بتاريخ ${appointment.appointmentDate} الساعة ${appointment.startTime}.`,
      idempotencyKey: `appt-confirmed-${appointment.id}-${appointment.version}`,
      appointmentId:  appointment.id,
    });
    void syncBillingPaymentStatus(appointment.id, 'paid').catch((err: Error) =>
      console.error('[appt] billing status sync on auto-confirm failed', err.message),
    );
  } else if (result.reverted) {
    // Confirmation withdrawn before check-in — roll the billing record back.
    void syncBillingPaymentStatus(appointment.id, 'pending').catch((err: Error) =>
      console.error('[appt] billing status revert failed', err.message),
    );
  }

  reply.send({ success: true, data: appointment });
}

export async function checkIn(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const user = request.user as JwtPayload;
  const appointment = await repo.checkInAppointment(id, user.sub);
  reply.send({ success: true, data: appointment });
}

export async function deleteAppointment(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const { password, reason } = deleteSchema.parse(request.body);
  const user = request.user as JwtPayload;

  // Verify password against identity service
  const authHeader = (request.headers.authorization as string) ?? '';
  const valid = await verifyUserPassword(authHeader, password);
  if (!valid) {
    reply.status(403).send({
      success: false,
      error: { code: 'INVALID_PASSWORD', message: 'Password verification failed' },
    });
    return;
  }

  const ipAddress = (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    ?? request.socket.remoteAddress;

  // Hard delete appointment + audit log
  await repo.hardDeleteAppointment(id, user.sub, reason, ipAddress, user.branchId);

  // Mark linked billing record as refunded (fire-and-forget with error logging)
  void (async () => {
    try {
      await refundTransactionByAppointment(id);
    } catch (err) {
      console.error('[appt] billing refund after appointment delete failed', (err as Error).message);
    }
  })();

  reply.status(204).send();
}

export async function softDeleteAppointmentHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const user = request.user as JwtPayload;
  await repo.softDeleteAppointment(id, user.sub);
  reply.status(204).send();
}

export async function billingCascadeDeleteHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const user = request.user as JwtPayload;
  const outcome = await repo.cascadeSoftDeleteFromBilling(id, user.sub);
  reply.status(204).send({ outcome });
}
