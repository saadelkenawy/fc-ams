import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import * as repo from '../repositories/patient.repository';
import type { CreatePatientInput, UpdatePatientInput, JwtPayload } from '@fadl/types';

const createSchema = z.object({
  mobile: z.string().regex(/^\+20\d{10}$/, 'Mobile must be Egyptian format (+20XXXXXXXXXX)'),
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
  sourceFirstVisit: z.string().optional(),
});

const updateSchema = createSchema.partial().extend({ version: z.number().int().positive() });

const searchSchema = z.object({
  query: z.string().optional(),
  mobile: z.string().optional(),
  nationalId: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(500).default(20),
});

export async function getPatient(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const patient = await repo.findPatientById(id);
  if (!patient) {
    void reply.status(404).send({ success: false, error: { code: 'PATIENT_NOT_FOUND', message: 'Patient not found' } });
    return;
  }
  void reply.send({ success: true, data: patient });
}

export async function searchPatients(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const params = searchSchema.parse(request.query);
  const result = await repo.searchPatients(params);
  void reply.send({ success: true, ...result });
}

export async function createPatient(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const input = createSchema.parse(request.body) as CreatePatientInput;
  const user = request.user as JwtPayload;

  const existing = await repo.findPatientByMobile(input.mobile);
  if (existing) {
    void reply.status(409).send({
      success: false,
      error: { code: 'MOBILE_ALREADY_EXISTS', message: 'A patient with this mobile number already exists' },
    });
    return;
  }

  const patient = await repo.createPatient(input, user.sub, user.branchId);
  void reply.status(201).send({ success: true, data: patient });
}

export async function updatePatient(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const input = updateSchema.parse(request.body) as UpdatePatientInput;
  const user = request.user as JwtPayload;
  const patient = await repo.updatePatient(id, input, user.sub);
  void reply.send({ success: true, data: patient });
}

export async function deletePatient(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const user = request.user as JwtPayload;
  await repo.softDeletePatient(id, user.sub);
  void reply.status(204).send();
}
