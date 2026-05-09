import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import * as repo from '../repositories/catalog.repository';

const CATEGORIES = ['PPE', 'Injection & Phlebotomy', 'Sterilization & Hygiene', 'Diagnostic Devices', 'Specialty Instruments'] as const;
const BUDGET_TIERS = ['Economy', 'Mid-range', 'Premium'] as const;
const EDA_STATUSES = ['Registered', 'Permit required', 'Controlled', 'Not regulated'] as const;
const CLINIC_TYPES = ['Internal Medicine', 'Pediatrics', 'General Surgery', 'Dermatology'] as const;

const itemSchema = z.object({
  itemName:          z.string().min(1).max(200),
  itemNameAr:        z.string().max(200).optional(),
  category:          z.enum(CATEGORIES),
  clinicalUse:       z.string().max(500).optional(),
  clinicTypes:       z.array(z.enum(CLINIC_TYPES)).optional(),
  budgetTier:        z.enum(BUDGET_TIERS),
  edaStatus:         z.enum(EDA_STATUSES),
  edaClass:          z.enum(['I', 'II', 'III']).optional(),
  localFirst:        z.boolean().optional(),
  qtyUnit:           z.string().max(50).optional(),
  qtyPerMonth:       z.number().int().positive().optional(),
  reorderThreshold:  z.number().int().min(0).optional(),
  currentStock:      z.number().int().min(0).optional(),
  unitCostEgp:       z.number().positive().optional(),
  preferredVendorId: z.string().uuid().optional(),
  notes:             z.string().optional(),
});

const listSchema = z.object({
  q:          z.string().optional(),
  category:   z.enum(CATEGORIES).optional(),
  clinicType: z.enum(CLINIC_TYPES).optional(),
  isActive:   z.string().optional().transform((v) => v === undefined ? undefined : v === 'true'),
  page:       z.coerce.number().int().positive().default(1),
  limit:      z.coerce.number().int().positive().max(100).default(20),
});

export async function listItems(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const params = listSchema.parse(request.query);
  const result = await repo.listItems(params);
  void reply.send({ success: true, ...result });
}

export async function getItem(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const item = await repo.findItemById(id);
  if (!item) {
    void reply.status(404).send({ success: false, error: { code: 'ITEM_NOT_FOUND', message: 'Catalog item not found' } });
    return;
  }
  void reply.send({ success: true, data: item });
}

export async function createItem(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const input = itemSchema.parse(request.body);
  const item = await repo.createItem(input, request.user.sub);
  void reply.status(201).send({ success: true, data: item });
}

export async function updateItem(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const input = itemSchema.partial().parse(request.body);
  const item = await repo.updateItem(id, input);
  void reply.send({ success: true, data: item });
}
