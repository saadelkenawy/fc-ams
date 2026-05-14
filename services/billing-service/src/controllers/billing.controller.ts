import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import * as repo from '../repositories/billing.repository';
import type { PaymentStatus, JwtPayload } from '@fadl/types';

const PAYMENT_STATUS = ['pending', 'verified', 'approved', 'paid', 'reconciled', 'refunded'] as const;
const CURRENCY = ['EGP', 'USD', 'EUR', 'SAR', 'AED'] as const;

const createTxSchema = z.object({
  idempotencyKey: z.string().min(1).max(100),
  appointmentId: z.string().uuid().optional(),
  patientId: z.string().uuid(),
  doctorId: z.string().uuid().optional(),
  procedureId: z.string().uuid().optional(),
  patientSource: z.string().min(1),
  doctorSpecialtyId: z.number().int().positive().optional(),
  approvedCharge: z.number().positive(),
  procedureCost: z.number().positive().optional(),
  splitDoctorPercentage: z.number().min(0).max(100),
  splitClinicPercentage: z.number().min(0).max(100),
  paymentMethod: z.string().optional(),
  currencyCode: z.enum(CURRENCY).default('EGP'),
}).refine(
  (d) => d.splitDoctorPercentage + d.splitClinicPercentage === 100,
  { message: 'splitDoctorPercentage + splitClinicPercentage must equal 100' },
);

const updateStatusSchema = z.object({
  status: z.enum(PAYMENT_STATUS),
  settlementReference: z.string().optional(),
  checkInAmount: z.number().positive().optional(),
  checkOutAmount: z.number().positive().optional(),
});

const listTxSchema = z.object({
  appointmentId: z.string().uuid().optional(),
  patientId: z.string().uuid().optional(),
  doctorId: z.string().uuid().optional(),
  status: z.enum(PAYMENT_STATUS).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const settlementQuerySchema = z.object({
  doctorId: z.string().uuid(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const listSettlementsSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export async function listTransactions(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const params = listTxSchema.parse(request.query);
  const result = await repo.listTransactions(params);
  void reply.send({ success: true, ...result });
}

export async function getTransaction(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const tx = await repo.findTransactionById(id);
  if (!tx) {
    void reply.status(404).send({ success: false, error: { code: 'TRANSACTION_NOT_FOUND', message: 'Transaction not found' } });
    return;
  }
  void reply.send({ success: true, data: tx });
}

export async function createTransaction(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const input = createTxSchema.parse(request.body);
  const user = request.user as JwtPayload;
  const tx = await repo.createTransaction(input, user.sub, user.branchId);
  void reply.status(201).send({ success: true, data: tx });
}

const updateProcedureCostSchema = z.object({
  procedureCost: z.number().min(0).nullable(),
});

const replaceExtraServicesSchema = z.object({
  items: z.array(z.object({
    serviceName: z.string().min(1).max(200),
    cost: z.number().min(0),
  })),
});

export async function getExtraServices(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const items = await repo.listExtraServices(id);
  void reply.send({ success: true, data: items });
}

export async function replaceExtraServices(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const { items } = replaceExtraServicesSchema.parse(request.body);
  const user = request.user as JwtPayload;
  const result = await repo.replaceExtraServices(id, items, user.sub);
  void reply.send({ success: true, data: result });
}

export async function updateProcedureCost(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const { procedureCost } = updateProcedureCostSchema.parse(request.body);
  const tx = await repo.updateProcedureCost(id, procedureCost);
  void reply.send({ success: true, data: tx });
}

export async function updateStatus(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const { status, settlementReference, checkInAmount, checkOutAmount } = updateStatusSchema.parse(request.body);
  const user = request.user as JwtPayload;
  const tx = await repo.updatePaymentStatus(
    id,
    status as PaymentStatus,
    user.sub,
    { settlementReference, checkInAmount, checkOutAmount },
  );
  void reply.send({ success: true, data: tx });
}

export async function getDoctorSettlement(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { doctorId, from, to } = settlementQuerySchema.parse(request.query);
  const settlement = await repo.getDoctorSettlement(doctorId, from, to);
  void reply.send({ success: true, data: settlement });
}

export async function listSettlements(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const params = listSettlementsSchema.parse(request.query);
  const result = await repo.listDoctorSettlements(params);
  void reply.send({ success: true, ...result });
}

// ─── Source Fee Rules ─────────────────────────────────────────────────────────

const specialtyRateSchema = z.object({
  specialtyId: z.number().int().positive(),
  feeValue:    z.number().min(0),
});

const createSourceSchema = z.object({
  sourceCode:     z.string().min(1).max(50),
  sourceNameEn:   z.string().min(1).max(100),
  sourceNameAr:   z.string().min(1).max(100),
  feeType:        z.enum(['percentage', 'fixed']),
  feeValue:       z.number().min(0),
  deductFrom:     z.enum(['clinic', 'doctor', 'both']).default('clinic'),
  isGeneral:      z.boolean().default(true),
  isActive:       z.boolean().default(true),
  validFrom:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  validUntil:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  specialtyRates: z.array(specialtyRateSchema).optional(),
});

const updateSourceSchema = createSourceSchema.omit({ sourceCode: true }).partial().extend({
  validFrom:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  validUntil:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  specialtyRates: z.array(specialtyRateSchema).optional(),
}).transform((v) => {
  // Strip empty strings so they are treated as not-provided (not sent to DB)
  const out = { ...v };
  if (out.validFrom === '') delete out.validFrom;
  if (out.validUntil === '') out.validUntil = null;
  return out;
});

const sourceRateQuerySchema = z.object({
  specialtyId: z.coerce.number().int().positive().optional(),
});

export async function listSourcesHandler(_req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const sources = await repo.listSources();
  void reply.send({ success: true, data: sources });
}

export async function createSourceHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = req.user as JwtPayload;
  const input = createSourceSchema.parse(req.body);
  const source = await repo.createSource(input, user.sub);
  void reply.status(201).send({ success: true, data: source });
}

export async function updateSourceHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { code } = req.params as { code: string };
  const user = req.user as JwtPayload;
  const input = updateSourceSchema.parse(req.body);
  const source = await repo.updateSource(code, input, user.sub);
  void reply.send({ success: true, data: source });
}

export async function deleteSourceHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { code } = req.params as { code: string };
  await repo.deleteSource(code);
  void reply.status(204).send();
}

export async function getSourceRateHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { code } = req.params as { code: string };
  const { specialtyId } = sourceRateQuerySchema.parse(req.query);
  const rate = await repo.getSourceRate(code, specialtyId);
  void reply.send({ success: true, data: { sourceCode: code, specialtyId, rate } });
}

export async function updatePaymentStatusByAppointmentHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { appointmentId } = req.params as { appointmentId: string };
  const { status } = (req.body as { status: string });
  await repo.updatePaymentStatusByAppointmentId(appointmentId, status);
  void reply.status(204).send();
}

export async function refundTransactionByAppointmentHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { appointmentId } = req.params as { appointmentId: string };
  await repo.refundTransactionByAppointmentId(appointmentId);
  void reply.status(204).send();
}

const reconcileDoctorSchema = z.object({
  doctorId: z.string().uuid(),
  from:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function reconcileDoctorHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { doctorId, from, to } = reconcileDoctorSchema.parse(req.body);
  const user = req.user as JwtPayload;
  const result = await repo.reconcileDoctor(doctorId, from, to, user.sub, user.branchId);
  void reply.send({ success: true, data: result });
}
