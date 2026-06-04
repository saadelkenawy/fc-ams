import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@fadl/types';
import * as repo from '../repositories/doctor.repository';

const revenueSplitSchema = z.object({
  doctorPercentage: z.number().min(0).max(100),
  clinicPercentage: z.number().min(0).max(100),
}).refine((s) => s.doctorPercentage + s.clinicPercentage === 100, {
  message: 'doctorPercentage + clinicPercentage must equal 100',
});

const revenueSplitsSchema = z.object({
  consultation: revenueSplitSchema,
  operative: revenueSplitSchema,
  online: revenueSplitSchema,
});

const createDoctorSchema = z.object({
  mobile: z.string().regex(/^\+20\d{10}$/, 'Mobile must be Egyptian format (+20XXXXXXXXXX)'),
  nameEn: z.string().min(2).max(200),
  nameAr: z.string().max(200).optional(),
  specialtyId: z.number().int().positive(),
  subSpecialty: z.string().max(100).optional(),
  isOnlineDoctor: z.boolean().default(false),
  revenueSplits: revenueSplitsSchema,
  paymentMethod: z.enum(['cash', 'instapay', 'bank_transfer', 'vfc_wallet', 'mobile_wallet']).optional(),
  allowOverbooking: z.boolean().default(false),
  overbookingBufferPercentage: z.number().int().min(0).max(15).default(0),
});

const updateDoctorSchema = createDoctorSchema.partial().extend({
  version: z.number().int().positive(),
});

const listDoctorsSchema = z.object({
  specialtyId: z.coerce.number().int().positive().optional(),
  isActive: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  isOnlineDoctor: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(500).default(20),
});

const scheduleSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6) as z.ZodType<0|1|2|3|4|5|6>,
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  slotDurationMinutes: z.number().int().min(5).max(120),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const overrideSchema = z.object({
  overrideDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  overrideType: z.enum(['unavailable', 'custom_hours', 'holiday']),
  customStartTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  customEndTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  reason: z.string().max(500).optional(),
  notifyPatients: z.boolean().default(false),
});

export async function listDoctors(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const params = listDoctorsSchema.parse(request.query);
  const result = await repo.listDoctors(params);
  return reply.send({ success: true, ...result });
}

export async function getDoctor(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const doctor = await repo.findDoctorById(id);
  if (!doctor) {
    return reply.status(404).send({ success: false, error: { code: 'DOCTOR_NOT_FOUND', message: 'Doctor not found' } });
    return;
  }
  return reply.send({ success: true, data: doctor });
}

export async function createDoctor(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const input = createDoctorSchema.parse(request.body);
  const user = request.user as JwtPayload;
  const doctor = await repo.createDoctor(input, user.sub, user.branchId);
  return reply.status(201).send({ success: true, data: doctor });
}

export async function updateDoctor(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const input = updateDoctorSchema.parse(request.body);
  const user = request.user as JwtPayload;
  const doctor = await repo.updateDoctor(id, input, user.sub);
  return reply.send({ success: true, data: doctor });
}

export async function toggleActive(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const { isActive } = z.object({ isActive: z.boolean() }).parse(request.body);
  const user = request.user as JwtPayload;
  const doctor = await repo.toggleDoctorActive(id, isActive, user.sub);
  return reply.send({ success: true, data: doctor });
}

export async function deleteDoctor(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const user = request.user as JwtPayload;
  await repo.softDeleteDoctor(id, user.sub);
  return reply.status(204).send();
}

export async function getSchedules(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const schedules = await repo.findSchedulesByDoctorId(id);
  return reply.send({ success: true, data: schedules });
}

export async function getOverrides(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const { from } = request.query as { from?: string };
  const overrides = await repo.findOverridesByDoctorId(id, from);
  return reply.send({ success: true, data: overrides });
}

export async function upsertSchedule(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const input = scheduleSchema.parse(request.body);
  const user = request.user as JwtPayload;
  const schedule = await repo.upsertSchedule(id, input, user.branchId);
  return reply.send({ success: true, data: schedule });
}

export async function createOverride(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const input = overrideSchema.parse(request.body);
  const user = request.user as JwtPayload;
  const override = await repo.createScheduleOverride(id, input, user.sub, user.branchId);
  return reply.status(201).send({ success: true, data: override });
}
