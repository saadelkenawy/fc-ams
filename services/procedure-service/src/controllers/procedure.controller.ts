import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@fadl/types';
import * as repo from '../repositories/procedure.repository';
import type { CreateProcedureInput } from '../repositories/procedure.repository';

const PROCEDURE_TYPES = ['consultation', 'follow_up', 'operative', 'settling_fee', 'lab_test', 'imaging'] as const;

const createSchema = z.object({
  code: z.string().min(1).max(50).toUpperCase(),
  nameEn: z.string().min(1).max(200),
  nameAr: z.string().max(200).optional(),
  procedureType: z.enum(PROCEDURE_TYPES),
  specialtyId: z.number().int().positive(),
  basePrice: z.number().nonnegative(),
  durationMinutes: z.number().int().positive().optional(),
  requiresPreAuth: z.boolean().optional(),
  notes: z.string().optional(),
});

const updateSchema = createSchema.partial().extend({ version: z.number().int().positive() });

const listSchema = z.object({
  specialtyId: z.coerce.number().int().positive().optional(),
  procedureType: z.enum(PROCEDURE_TYPES).optional(),
  isActive: z.string().optional().transform((v) => (v === undefined ? undefined : v === 'true')),
  q: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const doctorPriceSchema = z.object({
  doctorId: z.string().uuid(),
  price: z.number().nonnegative(),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function listProcedures(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const params = listSchema.parse(request.query);
  const result = await repo.listProcedures(params);
  reply.send({ success: true, ...result });
}

export async function getProcedure(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const procedure = await repo.findProcedureById(id);
  if (!procedure) {
    reply.status(404).send({
      success: false,
      error: { code: 'PROCEDURE_NOT_FOUND', message: 'Procedure not found' },
    });
    return;
  }
  reply.send({ success: true, data: procedure });
}

export async function createProcedure(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const input = createSchema.parse(request.body) as CreateProcedureInput;
  const user = request.user as JwtPayload;
  const procedure = await repo.createProcedure(input, user.sub);
  reply.status(201).send({ success: true, data: procedure });
}

export async function updateProcedure(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const input = updateSchema.parse(request.body);
  const user = request.user as JwtPayload;
  const procedure = await repo.updateProcedure(id, input as Partial<CreateProcedureInput> & { version: number }, user.sub);
  reply.send({ success: true, data: procedure });
}

export async function deleteProcedure(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  await repo.softDeleteProcedure(id);
  reply.status(204).send();
}

export async function setDoctorPrice(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const body = doctorPriceSchema.parse(request.body);

  const procedure = await repo.findProcedureById(id);
  if (!procedure) {
    reply.status(404).send({
      success: false,
      error: { code: 'PROCEDURE_NOT_FOUND', message: 'Procedure not found' },
    });
    return;
  }

  await repo.upsertDoctorPrice(id, body.doctorId, body.price, body.validFrom, body.validUntil);
  reply.status(201).send({ success: true });
}

export async function getEffectivePrice(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const { doctorId } = request.query as { doctorId?: string };

  const procedure = await repo.findProcedureById(id);
  if (!procedure) {
    reply.status(404).send({
      success: false,
      error: { code: 'PROCEDURE_NOT_FOUND', message: 'Procedure not found' },
    });
    return;
  }

  let effectivePrice = procedure.basePrice;

  if (doctorId) {
    const override = await repo.getDoctorPrice(id, doctorId);
    if (override !== null) {
      effectivePrice = override;
    }
  }

  reply.send({ success: true, data: { procedureId: id, doctorId: doctorId ?? null, effectivePrice } });
}
