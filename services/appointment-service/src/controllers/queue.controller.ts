import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@fadl/types';
import * as repo from '../repositories/queue.repository';
import { broadcast, registerClient } from '../lib/queue-sse';

const checkInSchema = z.object({
  appointmentId: z.string().uuid(),
  doctorId:      z.string().uuid(),
  patientId:     z.string().uuid(),
  queueDate:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function pushQueueUpdate(doctorId: string, queueDate: string, branchId: number): Promise<void> {
  const [queue, stats] = await Promise.all([
    repo.getFullQueue(doctorId, queueDate),
    repo.getQueueStats(doctorId, queueDate),
  ]);
  broadcast(doctorId, queueDate, branchId, 'queue_update', { doctorId, date: queueDate, queue, stats });
}

// ── SSE stream endpoint ───────────────────────────────────────────────────────

export async function queueStream(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { doctorId, date } = request.query as { doctorId: string; date?: string };
  const user = request.user as JwtPayload;
  const queueDate = date ?? new Date().toISOString().split('T')[0];

  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Send initial state immediately
  const [queue, stats] = await Promise.all([
    repo.getFullQueue(doctorId, queueDate),
    repo.getQueueStats(doctorId, queueDate),
  ]);
  reply.raw.write(`event: queue_update\ndata: ${JSON.stringify({ doctorId, date: queueDate, queue, stats })}\n\n`);

  // Heartbeat every 30s to keep connection alive through proxies
  const heartbeat = setInterval(() => {
    try { reply.raw.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); }
  }, 30_000);

  const unregister = registerClient(doctorId, queueDate, user.branchId, reply);

  request.raw.on('close', () => {
    clearInterval(heartbeat);
    unregister();
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export async function checkIn(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const input = checkInSchema.parse(request.body);
  const user = request.user as JwtPayload;
  const entry = await repo.checkIn(
    input.appointmentId, input.doctorId, input.patientId,
    input.queueDate, user.branchId, user.sub,
  );
  void pushQueueUpdate(input.doctorId, input.queueDate, user.branchId);
  void reply.status(201).send({ success: true, data: entry });
}

export async function callPatient(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const user = request.user as JwtPayload;
  const entry = await repo.callPatient(id, user.sub, user.branchId);
  void pushQueueUpdate(entry.doctorId, entry.queueDate, user.branchId);
  broadcast(entry.doctorId, entry.queueDate, user.branchId, 'patient_called', {
    doctorId: entry.doctorId, patientId: entry.patientId, position: entry.position,
  });
  void reply.send({ success: true, data: entry });
}

export async function startSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const user = request.user as JwtPayload;
  const entry = await repo.startSession(id, user.sub, user.branchId);
  void pushQueueUpdate(entry.doctorId, entry.queueDate, user.branchId);
  void reply.send({ success: true, data: entry });
}

export async function completeSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const user = request.user as JwtPayload;
  const entry = await repo.completeSession(id, user.sub, user.branchId);
  void pushQueueUpdate(entry.doctorId, entry.queueDate, user.branchId);
  broadcast(entry.doctorId, entry.queueDate, user.branchId, 'session_completed', {
    doctorId: entry.doctorId, durationMins: entry.sessionStart
      ? Math.round((new Date(entry.sessionEnd!).getTime() - new Date(entry.sessionStart).getTime()) / 60000)
      : null,
  });
  void reply.send({ success: true, data: entry });
}

export async function markNoShow(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const user = request.user as JwtPayload;
  const entry = await repo.markNoShow(id, user.sub, user.branchId);
  void pushQueueUpdate(entry.doctorId, entry.queueDate, user.branchId);
  void reply.send({ success: true, data: entry });
}

export async function cancelFromQueue(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const user = request.user as JwtPayload;
  const body = (request.body ?? {}) as { reason?: string };
  const result = await repo.cancelAndShift(id, user.sub, user.branchId, body.reason);

  void pushQueueUpdate(result.entry.doctorId, result.entry.queueDate, user.branchId);
  broadcast(result.entry.doctorId, result.entry.queueDate, user.branchId, 'patient_cancelled_rejoined', {
    doctorId: result.entry.doctorId,
    cancelledPatient: {
      id: result.entry.patientId,
      oldPosition: result.cancelledPosition,
      newPosition: result.newPosition,
    },
    shiftedPatients: result.patientsShifted,
  });

  void reply.send({
    success: true,
    data: {
      entry: result.entry,
      cancelledPosition: result.cancelledPosition,
      newPosition: result.newPosition,
      patientsShifted: result.patientsShifted,
    },
  });
}

export async function rejoinQueue(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const user = request.user as JwtPayload;
  const entry = await repo.rejoinQueue(id, user.sub, user.branchId);
  void pushQueueUpdate(entry.doctorId, entry.queueDate, user.branchId);
  void reply.send({ success: true, data: entry });
}

export async function previewCancel(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = request.params as { id: string };
  const preview = await repo.previewCancel(id);
  if (!preview) {
    void reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Queue entry not found or not cancellable' } });
    return;
  }
  void reply.send({ success: true, data: preview });
}

// ── Read ──────────────────────────────────────────────────────────────────────

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
