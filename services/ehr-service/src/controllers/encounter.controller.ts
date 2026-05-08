import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@fadl/types';
import * as repo from '../repositories/encounter.repository';

const encounterTypeEnum = z.enum(['outpatient', 'inpatient', 'emergency', 'telehealth', 'follow_up']);
const statusEnum = z.enum(['draft', 'in_progress', 'completed', 'signed_off']);

const listQuerySchema = z.object({
  patientId: z.string().uuid().optional(),
  doctorId: z.string().uuid().optional(),
  status: statusEnum.optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const createSchema = z.object({
  patientId: z.string().uuid(),
  appointmentId: z.string().uuid().optional(),
  doctorId: z.string().uuid(),
  specialtyId: z.number().int().positive().optional(),
  encounterDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  encounterType: encounterTypeEnum.optional(),
  chiefComplaint: z.string().max(1000).optional(),
});

const updateSchema = z.object({
  version: z.number().int().positive(),
  chiefComplaint: z.string().max(1000).optional(),
  historyOfPresentIllness: z.string().optional(),
  diagnosisPrimary: z.string().max(500).optional(),
  diagnosisSecondary: z.array(z.unknown()).optional(),
  clinicalNotes: z.string().optional(),
  vitalSigns: z.record(z.unknown()).optional(),
  prescriptions: z.array(z.unknown()).optional(),
  labOrders: z.array(z.unknown()).optional(),
  followUpDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  followUpNotes: z.string().optional(),
  status: statusEnum.optional(),
});

const signOffSchema = z.object({
  version: z.number().int().positive(),
});

export async function listEncounters(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const params = listQuerySchema.parse(request.query);
  const result = await repo.listEncounters(params);
  void reply.send({ success: true, ...result });
}

export async function getEncounter(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const encounter = await repo.findEncounterById(id);
  if (!encounter) {
    void reply.status(404).send({
      success: false,
      error: { code: 'ENCOUNTER_NOT_FOUND', message: 'Encounter not found' },
    });
    return;
  }
  void reply.send({ success: true, data: encounter });
}

export async function createEncounter(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const input = createSchema.parse(request.body);
  const user = request.user as JwtPayload;
  const encounter = await repo.createEncounter(input, user.sub);
  void reply.status(201).send({ success: true, data: encounter });
}

export async function updateEncounter(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const input = updateSchema.parse(request.body);
  const user = request.user as JwtPayload;
  const encounter = await repo.updateEncounter(id, input, user.sub);
  void reply.send({ success: true, data: encounter });
}

export async function signOffEncounter(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const { version } = signOffSchema.parse(request.body);
  const user = request.user as JwtPayload;
  const doctorId = user.doctorId ?? user.sub;
  const encounter = await repo.signOffEncounter(id, doctorId, version);
  void reply.send({ success: true, data: encounter });
}

export async function listPatientEncounters(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { patientId } = request.params as { patientId: string };
  const query = listQuerySchema.parse({ ...(request.query as object), patientId });
  const result = await repo.listEncounters(query);
  void reply.send({ success: true, ...result });
}
