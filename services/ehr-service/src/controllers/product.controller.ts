import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { ProductType } from '@fadl/types';
import * as repo from '../repositories/product.repository';

const searchSchema = z.object({
  q:     z.string().min(2).max(100).trim(),
  type:  z.enum(['medicine', 'cosmetic']).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function searchProducts(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { q, type, limit } = searchSchema.parse(request.query);

  const results = await repo.searchProducts({
    query: q,
    type: type as ProductType | undefined,
    limit,
  });

  return reply.send({ success: true, query: q, total: results.length, data: results });
}
