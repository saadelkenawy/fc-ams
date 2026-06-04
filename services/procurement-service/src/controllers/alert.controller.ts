import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import * as repo from '../repositories/alert.repository';

const listSchema = z.object({
  alertType: z.enum(['EXPIRY_ALERT', 'REORDER_ALERT', 'DISCREPANCY_ALERT']).optional(),
  isRead:    z.string().optional().transform((v) => v === undefined ? undefined : v === 'true'),
  page:      z.coerce.number().int().positive().default(1),
  limit:     z.coerce.number().int().positive().max(100).default(20),
});

export async function listAlerts(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const params = listSchema.parse(request.query);
  const result = await repo.listAlerts(params);
  return reply.send({ success: true, ...result });
}

export async function markAlertRead(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  await repo.markRead(id);
  return reply.send({ success: true });
}

export async function markAllAlertsRead(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const count = await repo.markAllRead();
  return reply.send({ success: true, data: { markedRead: count } });
}

export async function runExpiryCheck(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const count = await repo.checkExpiryAlerts();
  return reply.send({ success: true, data: { alertsRaised: count } });
}

export async function runReorderCheck(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const count = await repo.checkReorderAlerts();
  return reply.send({ success: true, data: { alertsRaised: count } });
}
