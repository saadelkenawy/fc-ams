import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import * as repo from '../repositories/notification.repository';
import type { JwtPayload } from '@fadl/types';

const sendSchema = z.object({
  channel: z.enum(['sms', 'whatsapp', 'email', 'push']),
  body: z.string().min(1),
  templateCode: z.string().optional(),
  recipientId: z.string().uuid().optional(),
  recipientType: z.enum(['patient', 'doctor', 'admin']).default('patient'),
  recipientMobile: z.string().optional(),
  recipientEmail: z.string().email().optional(),
  subject: z.string().optional(),
  variablesUsed: z.record(z.string()).optional(),
  scheduledAt: z.string().optional(),
  idempotencyKey: z.string().optional(),
  appointmentId: z.string().uuid().optional(),
});

const listSchema = z.object({
  recipientId:   z.string().uuid().optional(),
  status:        z.string().optional(),
  channel:       z.string().optional(),
  appointmentId: z.string().uuid().optional(),
  page:          z.coerce.number().int().positive().default(1),
  limit:         z.coerce.number().int().positive().max(100).default(20),
});

export async function sendNotification(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const input = sendSchema.parse(request.body);
  const user = request.user as JwtPayload;
  const notif = await repo.createNotification(input, user.sub);
  reply.status(201).send({ success: true, data: notif });
}

export async function listNotifications(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const params = listSchema.parse(request.query);
  const result = await repo.listNotifications(params);
  reply.send({ success: true, ...result });
}

export async function getNotification(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const notif = await repo.findNotificationById(id);
  if (!notif) {
    reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Notification not found' } });
    return;
  }
  reply.send({ success: true, data: notif });
}

export async function retryNotification(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const notif = await repo.retryNotification(id);
  reply.send({ success: true, data: notif });
}

export async function listTemplates(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const templates = await repo.getTemplates();
  reply.send({ success: true, data: templates });
}
