import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import * as repo from '../repositories/patient.repository';
import type { CreatePatientInput, UpdatePatientInput, JwtPayload } from '@fadl/types';

function normalizeEgyptianMobile(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (d.startsWith('20') && d.length === 12) return `+${d}`;
  if (d.startsWith('0') && d.length === 11)  return `+20${d.slice(1)}`;
  if (d.startsWith('1') && d.length === 10)  return `+20${d}`;
  return raw;
}

const mobileField = z.string()
  .transform(normalizeEgyptianMobile)
  .pipe(z.string().regex(/^\+20\d{10}$/, 'Mobile must be Egyptian format (+20XXXXXXXXXX)'));

const createSchema = z.object({
  mobile: mobileField,
  nameEn: z.string().min(2).max(200),
  nameAr: z.string().max(200).optional(),
  nationalId: z.string().length(14).optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  gender: z.enum(['M', 'F']).optional(),
  bloodType: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).optional(),
  address: z.string().max(500).optional(),
  email: z.string().email().optional(),
  emergencyContactMobile: z.string().optional(),
  emergencyContactName: z.string().optional(),
  preferredLanguage: z.enum(['ar', 'en']).default('ar'),
  insuranceProvider: z.string().max(200).optional(),
  insurancePolicyNumber: z.string().regex(/^\d+$/, 'Policy number must be numeric').max(50).optional(),
  currentMedications: z.array(z.object({
    name: z.string().min(1).max(200),
    dosage: z.string().max(100).optional(),
  })).max(50).optional(),
  allergies: z.array(z.object({
    type: z.enum(['medication', 'food']),
    name: z.string().min(1).max(200),
  })).max(50).optional(),
  chronicDiseases: z.array(z.string().min(1).max(200)).max(50).optional(),
  sourceFirstVisit: z.string().optional(),
  isFutureSource: z.boolean().optional(),
});

const updateSchema = createSchema.partial().extend({ version: z.number().int().positive() });

const searchSchema = z.object({
  query: z.string().optional(),
  mobile: z.string().optional(),
  nationalId: z.string().optional(),
  isFutureSource: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(500).default(20),
});

export async function getPatient(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const user = request.user as JwtPayload;
  const patient = await repo.findPatientById(user.branchId, id);
  if (!patient) {
    reply.status(404).send({ success: false, error: { code: 'PATIENT_NOT_FOUND', message: 'Patient not found' } });
    return;
  }
  reply.send({ success: true, data: patient });
}

export async function searchPatients(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const params = searchSchema.parse(request.query);
  const user = request.user as JwtPayload;
  const result = await repo.searchPatients(user.branchId, params);
  reply.send({ success: true, ...result });
}

const batchSchema = z.object({
  ids: z.string().transform((s) => s.split(',').map((id) => id.trim()).filter(Boolean)),
});

export async function batchGetPatients(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { ids } = batchSchema.parse(request.query);
  const user = request.user as JwtPayload;
  if (ids.length > 200) {
    reply.status(400).send({ success: false, error: { code: 'TOO_MANY_IDS', message: 'Max 200 IDs per request' } });
    return;
  }
  const patients = await repo.findPatientsByIds(user.branchId, ids);
  reply.send({ success: true, data: patients });
}

export async function createPatient(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const input = createSchema.parse(request.body) as CreatePatientInput;
  const user = request.user as JwtPayload;

  const existing = await repo.findPatientByMobile(user.branchId, input.mobile);
  if (existing) {
    reply.status(409).send({
      success: false,
      error: { code: 'MOBILE_ALREADY_EXISTS', message: 'A patient with this mobile number already exists' },
    });
    return;
  }

  const patient = await repo.createPatient(input, user.sub, user.branchId);
  reply.status(201).send({ success: true, data: patient });
}

export async function updatePatient(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const input = updateSchema.parse(request.body) as UpdatePatientInput;
  const user = request.user as JwtPayload;
  const patient = await repo.updatePatient(user.branchId, id, input, user.sub);
  reply.send({ success: true, data: patient });
}

export async function deletePatient(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const user = request.user as JwtPayload;
  await repo.softDeletePatient(user.branchId, id, user.sub);
  reply.status(204).send();
}
