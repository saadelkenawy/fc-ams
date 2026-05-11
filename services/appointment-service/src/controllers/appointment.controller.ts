import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { AppointmentStatus, JwtPayload } from '@fadl/types';
import * as repo from '../repositories/appointment.repository';
import { fireNotification } from '../clients/notification';

const APPOINTMENT_STATUS = z.enum(['TBC', 'Ok!', 'Conf.', 'Comp.', 'Canc.', 'Resch.', 'Inf.']);

export const createSchema = z.object({
  patientId:       z.string().uuid(),
  doctorId:        z.string().uuid(),
  specialtyId:     z.number().int().optional(),
  appointmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime:       z.string().regex(/^\d{2}:\d{2}$/),
  endTime:         z.string().regex(/^\d{2}:\d{2}$/),
  appointmentType: z.enum(['in_person', 'online', 'home_visit']).default('in_person'),
  isOnline:        z.boolean().default(false),
  patientSource:   z.string().default("Cl.'s"),
  approvedCharge:  z.number().positive().optional(),
  procedureCost:   z.number().positive().optional(),
  idempotencyKey:  z.string().max(100).optional(),
  notes:           z.string().max(2000).optional(),
}).refine(
  (data) => data.startTime < data.endTime,
  { message: 'endTime must be after startTime', path: ['endTime'] },
);

export const statusSchema = z.object({
  status:  APPOINTMENT_STATUS,
  version: z.number().int().positive(),
});

export const listSchema = z.object({
  doctorId:  z.string().uuid().optional(),
  patientId: z.string().uuid().optional(),
  date:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status:    APPOINTMENT_STATUS.optional(),
  page:      z.coerce.number().int().positive().default(1),
  limit:     z.coerce.number().int().positive().max(100).default(20),
});

export async function getAppointment(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const appointment = await repo.findAppointmentById(id);
  if (!appointment) {
    void reply.status(404).send({
      success: false,
      error: { code: 'APPOINTMENT_NOT_FOUND', message: 'Appointment not found' },
    });
    return;
  }
  void reply.send({ success: true, data: appointment });
}

export async function listAppointments(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const params = listSchema.parse(request.query);
  const result = await repo.listAppointments(params);
  void reply.send({ success: true, ...result });
}

export async function createAppointment(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const input = createSchema.parse(request.body);
  const user = request.user as JwtPayload;
  const appointment = await repo.createAppointment(input, user.sub, user.branchId);

  // Auto-assign room via Redis cache if doctor has an active room today
  if (input.appointmentDate === new Date().toISOString().split('T')[0]) {
    void (async () => {
      try {
        const { redis } = await import('../config/redis');
        const cached = await redis.get(`room:doctor:${input.doctorId}:${input.appointmentDate}`);
        if (cached) {
          const { roomId, roomCode } = JSON.parse(cached) as { roomId: number; roomCode: string };
          const { pool } = await import('../config/database');
          const client = await pool.connect();
          try {
            await client.query(`SET app.current_branch_id = $1`, [user.branchId]);
            await client.query(
              `UPDATE appointments SET room_id = $1, room_code = $2, room_assigned_at = NOW(), updated_at = NOW() WHERE id = $3`,
              [roomId, roomCode, appointment.id],
            );
          } finally {
            client.release();
          }
        }
      } catch (err) {
        console.error('[appt] auto-room assignment failed', (err as Error).message);
      }
    })();
  }

  // Fire APPT_BOOKED notification (fire-and-forget)
  void fireNotification({
    channel:       'sms',
    recipientId:   appointment.patientId,
    recipientType: 'patient',
    body:          `موعدك تم تأكيده بتاريخ ${appointment.appointmentDate} الساعة ${appointment.startTime}. المرجع: ${appointment.id.slice(0,8)}`,
    idempotencyKey: `appt-booked-${appointment.id}`,
    appointmentId: appointment.id,
  });
  void reply.status(201).send({ success: true, data: appointment });
}

export async function updateStatus(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const { status, version } = statusSchema.parse(request.body);
  const user = request.user as JwtPayload;
  const appointment = await repo.updateAppointmentStatus(id, status as AppointmentStatus, version, user.sub);
  // Fire cancellation/confirmation notifications (fire-and-forget)
  if (status === 'Canc.') {
    void fireNotification({
      channel:       'sms',
      recipientId:   appointment.patientId,
      recipientType: 'patient',
      body:          `تم إلغاء موعدك بتاريخ ${appointment.appointmentDate}. للحجز مجدداً اتصل بالعيادة.`,
      idempotencyKey: `appt-cancelled-${appointment.id}-${appointment.version}`,
      appointmentId: appointment.id,
    });
  } else if (status === 'Ok!') {
    void fireNotification({
      channel:       'sms',
      recipientId:   appointment.patientId,
      recipientType: 'patient',
      body:          `تم تأكيد موعدك بتاريخ ${appointment.appointmentDate} الساعة ${appointment.startTime}.`,
      idempotencyKey: `appt-confirmed-${appointment.id}-${appointment.version}`,
      appointmentId: appointment.id,
    });
  }
  void reply.send({ success: true, data: appointment });
}

export async function checkIn(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const user = request.user as JwtPayload;
  const appointment = await repo.checkInAppointment(id, user.sub);
  void reply.send({ success: true, data: appointment });
}

export async function deleteAppointment(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const user = request.user as JwtPayload;
  await repo.softDeleteAppointment(id, user.sub);
  void reply.status(204).send();
}
