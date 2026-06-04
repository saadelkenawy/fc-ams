import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@fadl/types';
import type { DoctorStatus } from '@fadl/types';
import * as repo from '../repositories/availability.repository';
import { redis } from '../config/redis';

const consultHoursSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6) as z.ZodType<0|1|2|3|4|5|6>,
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  slotDurationMins: z.number().int().min(5).max(120).default(15),
  maxPatients: z.number().int().min(1).max(200).default(20),
});

const bulkConsultHoursSchema = z.object({
  hours: z.array(consultHoursSchema).min(1).max(7),
});

const statusSchema = z.object({
  status: z.enum(['active', 'absent', 'on_his_way', 'day_off']),
  note: z.string().max(500).optional(),
});

const dayOverrideSchema = z.object({
  overrideDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isWorking: z.boolean(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  maxPatients: z.number().int().min(1).max(200).optional(),
  reason: z.string().max(500).optional(),
});

// ── Consultation Hours ───────────────────────────────────────────────────────

export async function getConsultHours(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const hours = await repo.findConsultHours(id);
  return reply.send({ success: true, data: hours });
}

export async function putConsultHours(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const input = consultHoursSchema.parse(request.body);
  const user = request.user as JwtPayload;
  const hour = await repo.upsertConsultHours(id, input, user.branchId);
  return reply.send({ success: true, data: hour });
}

export async function putConsultHoursBulk(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const { hours } = bulkConsultHoursSchema.parse(request.body);
  const user = request.user as JwtPayload;
  const result = await repo.upsertConsultHoursBulk(id, hours, user.branchId);
  return reply.send({ success: true, data: result });
}

// ── Doctor Status ────────────────────────────────────────────────────────────

export async function getDoctorStatus(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const status = await repo.getStatus(id);
  if (!status) {
    return reply.status(404).send({ success: false, error: { code: 'DOCTOR_NOT_FOUND', message: 'Doctor not found' } });
    return;
  }
  return reply.send({ success: true, data: status });
}

export async function patchDoctorStatus(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const { status, note } = statusSchema.parse(request.body);
  const user = request.user as JwtPayload;

  const log = await repo.updateStatus(id, status as DoctorStatus, user.sub, user.branchId, note);

  // Publish status change to Redis for appointment-service cascade
  const payload = JSON.stringify({
    doctorId: id,
    newStatus: status,
    previousStatus: log.previousStatus,
    changedBy: user.sub,
    branchId: user.branchId,
    changedAt: log.changedAt,
    note: note ?? null,
  });
  await redis.publish('doctor:status_changed', payload);

  return reply.send({ success: true, data: log });
}

export async function getDoctorStatusHistory(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const { limit } = (request.query as { limit?: string });
  const history = await repo.getStatusHistory(id, limit ? Number(limit) : 50);
  return reply.send({ success: true, data: history });
}

// ── Day Overrides ────────────────────────────────────────────────────────────

export async function getDayOverrides(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const { from } = request.query as { from?: string };
  const overrides = await repo.findDayOverrides(id, from);
  return reply.send({ success: true, data: overrides });
}

export async function putDayOverride(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const input = dayOverrideSchema.parse(request.body);
  const user = request.user as JwtPayload;
  const override = await repo.upsertDayOverride(id, input, user.sub, user.branchId);
  return reply.status(200).send({ success: true, data: override });
}

// ── Availability ─────────────────────────────────────────────────────────────

export async function getDoctorAvailability(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const { date } = request.query as { date?: string };
  const user = request.user as JwtPayload;

  const targetDate = date ?? new Date().toISOString().split('T')[0];
  const availability = await repo.getDoctorAvailability(id, targetDate, user.branchId);
  return reply.send({ success: true, data: availability });
}
