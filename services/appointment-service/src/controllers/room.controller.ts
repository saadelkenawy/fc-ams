import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@fadl/types';
import * as repo from '../repositories/room.repository';
import * as queueRepo from '../repositories/queue.repository';
import { registerRoomClient, broadcastRoom } from '../lib/room-sse';
import { broadcast as broadcastQueue } from '../lib/queue-sse';
import { redis } from '../config/redis';
import { createBillingTransaction } from '../clients/billing';

const assignSchema = z.object({
  doctorId:  z.string().uuid(),
  date:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fromTime:  z.string().regex(/^\d{2}:\d{2}$/),
  untilTime: z.string().regex(/^\d{2}:\d{2}$/),
});

const settingsSchema = z.object({
  roomName:    z.string().min(1).max(100).optional(),
  floor:       z.number().int().nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  isActive:    z.boolean().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'At least one field required' });

// ── SSE stream ───────────────────────────────────────────────────────────────

export async function roomStream(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = request.user as JwtPayload;
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  reply.raw.write('event: connected\ndata: {}\n\n');

  const unregister = registerRoomClient(user.branchId, reply);
  const heartbeat = setInterval(() => {
    try { reply.raw.write(':heartbeat\n\n'); } catch { clearInterval(heartbeat); unregister(); }
  }, 30_000);

  request.raw.on('close', () => { clearInterval(heartbeat); unregister(); });
}

// ── Queries ──────────────────────────────────────────────────────────────────

export async function listRooms(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = request.user as JwtPayload;
  const { date } = request.query as { date?: string };
  const targetDate = date ?? new Date().toISOString().split('T')[0];
  const rooms = await repo.listRooms(targetDate, user.branchId);
  reply.send({ success: true, data: rooms });
}

export async function listRoomAssignments(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { date } = request.query as { date?: string };
  const targetDate = date ?? new Date().toISOString().split('T')[0];
  const assignments = await repo.listAssignmentsByDate(targetDate);
  reply.send({ success: true, data: assignments });
}

export async function getRoomAvailability(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = request.user as JwtPayload;
  const { date } = request.query as { date?: string };
  const targetDate = date ?? new Date().toISOString().split('T')[0];
  const availability = await repo.getAvailabilityByDate(targetDate, user.branchId);
  reply.send({ success: true, data: availability });
}

export async function getRoomStats(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = request.user as JwtPayload;
  const stats = await repo.getRoomStats(user.branchId);
  reply.send({ success: true, data: stats });
}

// ── Mutations ────────────────────────────────────────────────────────────────

export async function assignRoom(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { roomCode } = request.params as { roomCode: string };
  const user = request.user as JwtPayload;
  const input = assignSchema.parse(request.body);

  const result = await repo.assignRoom(
    roomCode.toUpperCase(),
    input.doctorId,
    input.date,
    input.fromTime,
    input.untilTime,
    user.sub,
    user.branchId,
  );

  // Cache for cross-service lookup (appointment creation)
  await redis.setex(
    `room:doctor:${input.doctorId}:${input.date}`,
    86400,
    JSON.stringify({ roomId: result.roomId, roomCode: result.roomCode }),
  );

  broadcastRoom(user.branchId, 'room_assigned', {
    roomCode: result.roomCode,
    roomName: result.roomName,
    doctorId: input.doctorId,
    date: input.date,
    appointmentsUpdated: result.appointmentsUpdated,
  });

  reply.status(201).send({ success: true, data: result });
}

export async function autoAssignRoom(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = request.user as JwtPayload;
  const input = assignSchema.parse(request.body);

  const result = await repo.autoAssignRoom(
    input.doctorId,
    input.date,
    input.fromTime,
    input.untilTime,
    user.sub,
    user.branchId,
  );

  if (!result) {
    reply.status(409).send({
      success: false,
      error: { code: 'NO_ROOM_AVAILABLE', message: 'No rooms available for the requested date' },
    });
    return;
  }

  await redis.setex(
    `room:doctor:${input.doctorId}:${input.date}`,
    86400,
    JSON.stringify({ roomId: result.roomId, roomCode: result.roomCode }),
  );

  broadcastRoom(user.branchId, 'room_assigned', {
    roomCode: result.roomCode,
    roomName: result.roomName,
    doctorId: input.doctorId,
    date: input.date,
    appointmentsUpdated: result.appointmentsUpdated,
  });

  reply.status(201).send({ success: true, data: result });
}

export async function releaseRoom(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { roomCode } = request.params as { roomCode: string };
  const user = request.user as JwtPayload;
  const { date } = request.query as { date?: string };
  const targetDate = date ?? new Date().toISOString().split('T')[0];

  const result = await repo.releaseRoomByCode(roomCode.toUpperCase(), user.branchId);
  if (!result) {
    reply.status(404).send({
      success: false,
      error: { code: 'ROOM_NOT_ASSIGNED', message: `Room ${roomCode} has no active assignment on ${targetDate}` },
    });
    return;
  }

  await redis.del(`room:doctor:${result.doctorId}:${result.assignedDate}`);

  // Clear room from pending appointments
  const { withTransaction } = await import('../config/database');
  await withTransaction(user.branchId, async (client) => {
    await client.query(
      `UPDATE appointments
       SET room_id = NULL, room_code = NULL, room_assigned_at = NULL, updated_at = NOW()
       WHERE doctor_id = $1 AND appointment_date = $2
         AND status NOT IN ('Comp.','Canc.','Resch.') AND deleted_at IS NULL`,
      [result.doctorId, result.assignedDate],
    );
  });

  broadcastRoom(user.branchId, 'room_released', {
    roomCode: roomCode.toUpperCase(),
    doctorId: result.doctorId,
    date: result.assignedDate,
  });

  reply.send({ success: true, data: result.assignment });
}

export async function nextPatientHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { roomCode } = request.params as { roomCode: string };
  const { appointmentId } = request.body as { appointmentId: string };
  const user = request.user as JwtPayload;

  const result = await repo.nextPatient(appointmentId, user.sub, user.branchId);

  // Fire-and-forget billing — idempotency key prevents double billing
  const { completed, queueDate, queueExhausted } = result;
  if (completed.approvedCharge > 0) {
    const apptType = completed.appointmentType ?? '';
    const visitType: 'consultation' | 'operative' | 'online' =
      apptType === 'online' ? 'online' : apptType === 'operative' ? 'operative' : 'consultation';
    createBillingTransaction({
      idempotencyKey:        `appt-next-${completed.appointmentId}`,
      appointmentId:         completed.appointmentId,
      patientId:             completed.patientId,
      doctorId:              completed.doctorId,
      patientSource:         completed.patientSource,
      doctorSpecialtyId:     completed.specialtyId,
      approvedCharge:        completed.approvedCharge,
      splitDoctorPercentage: completed.splitDoctorPercentage,
      splitClinicPercentage: completed.splitClinicPercentage,
      visitType,
    }).catch((err: unknown) => {
      request.log.error({ err, appointmentId }, 'billing transaction failed — will retry via idempotency');
    });
  }

  // Push queue SSE so connected room boards update immediately
  void (async () => {
    try {
      const [fullQueue, stats] = await Promise.all([
        queueRepo.getFullQueue(completed.doctorId, queueDate),
        queueRepo.getQueueStats(completed.doctorId, queueDate),
      ]);
      broadcastQueue(completed.doctorId, queueDate, user.branchId, 'queue_update', {
        queue: fullQueue,
        stats,
        doctorId: completed.doctorId,
        date: queueDate,
      });
    } catch { /* non-critical */ }
  })();

  // Auto-release room when no more patients or remaining appointments
  if (queueExhausted) {
    try {
      const released = await repo.releaseRoomByCode(roomCode.toUpperCase(), user.branchId);
      if (released) {
        await redis.del(`room:doctor:${released.doctorId}:${released.assignedDate}`);
        const { withTransaction } = await import('../config/database');
        await withTransaction(user.branchId, async (client) => {
          await client.query(
            `UPDATE appointments
             SET room_id = NULL, room_code = NULL, room_assigned_at = NULL, updated_at = NOW()
             WHERE doctor_id = $1 AND appointment_date = $2
               AND status NOT IN ('Comp.','Canc.','Resch.') AND deleted_at IS NULL`,
            [released.doctorId, released.assignedDate],
          );
        });
        broadcastRoom(user.branchId, 'room_released', {
          roomCode: roomCode.toUpperCase(),
          doctorId: released.doctorId,
          date: released.assignedDate,
        });
      } else {
        broadcastRoom(user.branchId, 'room_status_changed', { roomCode: roomCode.toUpperCase() });
      }
    } catch (err) {
      request.log.error({ err, roomCode }, 'auto-release after queue exhaustion failed');
      broadcastRoom(user.branchId, 'room_status_changed', { roomCode: roomCode.toUpperCase() });
    }
  } else {
    broadcastRoom(user.branchId, 'room_status_changed', { roomCode: roomCode.toUpperCase() });
  }

  reply.send({ success: true, data: result });
}

export async function updateRoom(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { roomCode } = request.params as { roomCode: string };
  const user = request.user as JwtPayload;
  const updates = settingsSchema.parse(request.body);

  const room = await repo.updateRoomSettings(roomCode.toUpperCase(), updates, user.branchId);

  broadcastRoom(user.branchId, 'room_updated', { roomCode: roomCode.toUpperCase() });

  reply.send({ success: true, data: room });
}
