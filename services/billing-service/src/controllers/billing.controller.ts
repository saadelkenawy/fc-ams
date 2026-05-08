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
