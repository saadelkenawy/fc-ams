import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@fadl/types';
import * as repo from '../repositories/prescription.repository';

/* ── schemas ─────────────────────────────────────────────────────────────── */

const formEnum      = z.enum(['cap', 'tab', 'syr', 'inj', 'gtt']);
const frequencyEnum = z.enum(['od', 'bid', 'tid', 'qid', 'q4h']);
const timingEnum    = z.enum(['ac', 'pc', 'hs', 'stat', 'prn', 'none']);
const statusEnum    = z.enum(['active', 'dispensed', 'cancelled']);

const itemSchema = z.object({
  productId:        z.string().uuid().optional(),
  medicationId:     z.string().uuid().optional(),
  medicationName:   z.string().min(1).max(255).optional(),
  form:             formEnum,
  dosageValue:      z.number().positive().optional(),
  dosageUnit:       z.string().max(20).optional(),
  frequency:        frequencyEnum,
  timing:           timingEnum.optional(),
  routeInstruction: z.string().max(500).optional(),
  durationDays:     z.number().int().positive().optional(),
  dispenseQuantity: z.number().int().positive().optional(),
  sortOrder:        z.number().int().min(0).optional(),
}).refine(
  (d) => d.productId != null || (d.medicationName != null && d.medicationName.length > 0),
  { message: 'Either productId or medicationName is required', path: ['medicationName'] },
);

const createSchema = z.object({
  encounterId: z.string().uuid().optional(),
  patientId:   z.string().uuid(),
  doctorId:    z.string().uuid(),
  diagnosis:   z.string().max(1000).optional(),
  notes:       z.string().optional(),
  items:       z.array(itemSchema).min(1).max(50),
});

const listQuerySchema = z.object({
  patientId:   z.string().uuid().optional(),
  doctorId:    z.string().uuid().optional(),
  encounterId: z.string().uuid().optional(),
  status:      statusEnum.optional(),
  page:        z.coerce.number().int().positive().default(1),
  limit:       z.coerce.number().int().positive().max(100).default(20),
});

const statusPatchSchema = z.object({
  version: z.number().int().positive(),
  status:  statusEnum,
});

const deletePatchSchema = z.object({
  version: z.number().int().positive(),
});

const medSearchSchema = z.object({
  q: z.string().min(1).max(100),
});

/* ── handlers ────────────────────────────────────────────────────────────── */

export async function createPrescription(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const user = request.user as JwtPayload;
  const body = createSchema.parse(request.body);
  const rx = await repo.createPrescription(body, user.sub);
  return reply.status(201).send({ success: true, data: rx });
}

export async function getPrescription(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const rx = await repo.findPrescriptionById(id);
  if (!rx) {
    return reply.status(404).send({
      success: false,
      error: { code: 'PRESCRIPTION_NOT_FOUND', message: 'Prescription not found' },
    });
    return;
  }
  return reply.send({ success: true, data: rx });
}

export async function listPrescriptions(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const params = listQuerySchema.parse(request.query);
  const result = await repo.listPrescriptions(params);
  return reply.send({ success: true, ...result });
}

export async function updateStatus(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const { status, version } = statusPatchSchema.parse(request.body);
  const rx = await repo.updatePrescriptionStatus(id, status, version);
  if (!rx) {
    return reply.status(409).send({
      success: false,
      error: {
        code: 'VERSION_CONFLICT',
        message: 'Prescription not found or version mismatch',
      },
    });
    return;
  }
  return reply.send({ success: true, data: rx });
}

export async function deletePrescription(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const { version } = deletePatchSchema.parse(request.body);
  const deleted = await repo.softDeletePrescription(id, version);
  if (!deleted) {
    return reply.status(409).send({
      success: false,
      error: {
        code: 'VERSION_CONFLICT',
        message: 'Prescription not found or version mismatch',
      },
    });
    return;
  }
  return reply.status(204).send();
}

export async function searchMedications(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { q } = medSearchSchema.parse(request.query);
  const results = await repo.searchMedications(q);
  return reply.send({ success: true, data: results });
}
