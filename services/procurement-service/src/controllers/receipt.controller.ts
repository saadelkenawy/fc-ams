import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import * as repo from '../repositories/receipt.repository';

const receiptSchema = z.object({
  vendorId:         z.string().uuid(),
  invoiceNumber:    z.string().max(100).optional(),
  invoiceDate:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  invoiceTotalEgp:  z.number().positive().optional(),
  invoiceFileUri:   z.string().max(500).optional(),
  currencySource:   z.enum(['EGP', 'converted']).optional(),
  cbeRate:          z.number().positive().optional(),
  dateReceived:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes:            z.string().optional(),
});

const receiptItemSchema = z.object({
  itemId:           z.string().uuid(),
  batchLotNumber:   z.string().max(100).optional(),
  expiryDate:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  quantityReceived: z.number().int().positive(),
  quantityOrdered:  z.number().int().positive().optional(),
  unitPriceEgp:     z.number().positive(),
});

const listSchema = z.object({
  vendorId: z.string().uuid().optional(),
  status:   z.enum(['pending', 'approved', 'discrepancy', 'cancelled']).optional(),
  page:     z.coerce.number().int().positive().default(1),
  limit:    z.coerce.number().int().positive().max(100).default(20),
});

export async function getOverview(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const stats = await repo.getOverviewStats();
  reply.send({ success: true, data: stats });
}

export async function listReceipts(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const params = listSchema.parse(request.query);
  const result = await repo.listReceipts(params);
  reply.send({ success: true, ...result });
}

export async function getReceipt(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const receipt = await repo.findReceiptById(id);
  if (!receipt) {
    reply.status(404).send({ success: false, error: { code: 'RECEIPT_NOT_FOUND', message: 'Receipt not found' } });
    return;
  }
  reply.send({ success: true, data: receipt });
}

export async function createReceipt(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const input = receiptSchema.parse(request.body);
  const receipt = await repo.createReceipt(input, request.user.sub);
  reply.status(201).send({ success: true, data: receipt });
}

export async function addReceiptItem(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const existing = await repo.findReceiptById(id);
  if (!existing) {
    reply.status(404).send({ success: false, error: { code: 'RECEIPT_NOT_FOUND', message: 'Receipt not found' } });
    return;
  }
  const input = receiptItemSchema.parse(request.body);
  const item = await repo.addReceiptItem(id, input);
  reply.status(201).send({ success: true, data: item });
}

export async function updateReceiptStatus(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const { status } = z.object({ status: z.enum(['pending', 'approved', 'discrepancy', 'cancelled']) }).parse(request.body);
  const receipt = await repo.updateReceiptStatus(id, status);
  reply.send({ success: true, data: receipt });
}
