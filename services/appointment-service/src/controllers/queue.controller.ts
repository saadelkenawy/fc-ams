import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@fadl/types';
import * as repo from '../repositories/queue.repository';

const checkInSchema = z.object({
  appointmentId: z.string().uuid(),
  doctorId: z.string().uuid(),
  patientId: z.string().uuid(),
  queueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function checkIn(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const input = checkInSchema.parse(request.body);
  const user = request.user as JwtPayload;
  const entry = await repo.checkIn(
    input.appointmentId, input.doctorId, input.patientId,
    input.queueDate, user.branchId, user.sub,
  );
  void reply.status(201).send({ success: true, data: entry });
}

export async function callPatient(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const user = request.user as JwtPayload;
  const entry = await repo.callPatient(id, user.sub, user.branchId);
  void reply.send({ success: true, data: entry });
}

export async function startSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const user = request.user as JwtPayload;
  const entry = await repo.startSession(id, user.sub, user.branchId);
  void reply.send({ success: true, data: entry });
}

export async function completeSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const user = request.user as JwtPayload;
  const entry = await repo.completeSession(id, user.sub, user.branchId);
  void reply.send({ success: true, data: entry });
}

export async function markNoShow(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const user = request.user as JwtPayload;
  const entry = await repo.markNoShow(id, user.sub, user.branchId);
  void reply.send({ success: true, data: entry });
}

export async function cancelFromQueue(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const user = request.user as JwtPayload;
  const entry = await repo.cancelAndShift(id, user.sub, user.branchId);
  void reply.send({ success: true, data: entry });
}

export async function rejoinQueue(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const user = request.user as JwtPayload;
  const entry = await repo.rejoinQueue(id, user.sub, user.branchId);
  void reply.send({ success: true, data: entry });
}

export async function getPosition(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const entry = await repo.getQueuePosition(id);
  if (!entry) {
    void reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Queue entry not found' } });
    return;
  }
  void reply.send({ success: true, data: entry });
}

export async function getFullQueue(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { doctorId, date } = request.query as { doctorId: string; date?: string };
  const targetDate = date ?? new Date().toISOString().split('T')[0];
  const queue = await repo.getFullQueue(doctorId, targetDate);
  void reply.send({ success: true, data: queue });
}

export async function getQueueStats(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { doctorId, date } = request.query as { doctorId: string; date?: string };
  const targetDate = date ?? new Date().toISOString().split('T')[0];
  const stats = await repo.getQueueStats(doctorId, targetDate);
  void reply.send({ success: true, data: stats });
}
