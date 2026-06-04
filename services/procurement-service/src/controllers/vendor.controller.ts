import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import * as repo from '../repositories/vendor.repository';

const VENDOR_TYPES = [
  'Local Egyptian manufacturer',
  'Authorized international distributor',
  'Major medical importer / supply chain',
] as const;

const CATEGORIES = ['PPE', 'Injection & Phlebotomy', 'Sterilization & Hygiene', 'Diagnostic Devices', 'Specialty Instruments'] as const;

const vendorSchema = z.object({
  vendorName:       z.string().min(1).max(200),
  vendorNameAr:     z.string().max(200).optional(),
  vendorType:       z.enum(VENDOR_TYPES),
  brandsCovered:    z.string().optional(),
  categoriesServed: z.array(z.enum(CATEGORIES)).optional(),
  contactName:      z.string().max(200).optional(),
  contactPhone:     z.string().max(50).optional(),
  contactEmail:     z.string().email().optional(),
  notes:            z.string().optional(),
});

const listSchema = z.object({
  q:          z.string().optional(),
  vendorType: z.enum(VENDOR_TYPES).optional(),
  category:   z.enum(CATEGORIES).optional(),
  isApproved: z.string().optional().transform((v) => v === undefined ? undefined : v === 'true'),
  page:       z.coerce.number().int().positive().default(1),
  limit:      z.coerce.number().int().positive().max(100).default(50),
});

export async function listVendors(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const params = listSchema.parse(request.query);
  const result = await repo.listVendors(params);
  reply.send({ success: true, ...result });
}

export async function getVendor(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const vendor = await repo.findVendorById(id);
  if (!vendor) {
    reply.status(404).send({ success: false, error: { code: 'VENDOR_NOT_FOUND', message: 'Vendor not found' } });
    return;
  }
  reply.send({ success: true, data: vendor });
}

export async function createVendor(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const input = vendorSchema.parse(request.body);
  const vendor = await repo.createVendor(input);
  reply.status(201).send({ success: true, data: vendor });
}

export async function updateVendor(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const input = vendorSchema.partial().extend({ isApproved: z.boolean().optional() }).parse(request.body);
  const vendor = await repo.updateVendor(id, input);
  reply.send({ success: true, data: vendor });
}
