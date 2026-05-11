import { redisSub, redis } from '../config/redis';
import { pool } from '../config/database';
import { cascadeCancelForDoctor } from '../repositories/queue.repository';
import * as roomRepo from '../repositories/room.repository';
import { broadcastRoom } from '../lib/room-sse';

interface DoctorStatusChangedPayload {
  doctorId: string;
  newStatus: string;
  branchId: number;
  changedAt: string;
}

async function handleRoomOnStatusChange(
  doctorId: string,
  newStatus: string,
  branchId: number,
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  if (newStatus === 'active') {
    // Activate existing reserved assignment first
    const activated = await roomRepo.activateReservedRoom(doctorId, today);
    if (activated) {
      const cache = await redis.get(`room:doctor:${doctorId}:${today}`);
      broadcastRoom(branchId, 'room_status_changed', {
        doctorId,
        newDoctorStatus: 'active',
        assignment: activated,
        roomCode: cache ? (JSON.parse(cache) as { roomCode: string }).roomCode : null,
      });
      return;
    }

    // No reservation — auto-assign lowest available room
    const result = await roomRepo.autoAssignRoom(doctorId, today, '08:00', '18:00', 'system', branchId);
    if (result) {
      await redis.setex(
        `room:doctor:${doctorId}:${today}`,
        86400,
        JSON.stringify({ roomId: result.roomId, roomCode: result.roomCode }),
      );
      broadcastRoom(branchId, 'room_assigned', {
        roomCode: result.roomCode,
        roomName: result.roomName,
        doctorId,
        date: today,
        appointmentsUpdated: result.appointmentsUpdated,
      });
    }
  } else if (newStatus === 'absent' || newStatus === 'day_off') {
    const released = await roomRepo.releaseRoom(doctorId, today, branchId);
    if (released) {
      await redis.del(`room:doctor:${doctorId}:${today}`);

      // Clear room from pending appointments
      const client = await pool.connect();
      try {
        await client.query(`SET app.current_branch_id = $1`, [branchId]);
        await client.query(
          `UPDATE appointments
           SET room_id = NULL, room_code = NULL, room_assigned_at = NULL, updated_at = NOW()
           WHERE doctor_id = $1 AND appointment_date = $2
             AND status NOT IN ('Comp.','Canc.','Resch.') AND deleted_at IS NULL`,
          [doctorId, today],
        );
      } finally {
        client.release();
      }

      broadcastRoom(branchId, 'room_released', {
        roomCode: released.roomCode,
        doctorId,
        date: today,
        reason: 'Doctor absent',
      });
    }
  } else if (newStatus === 'on_his_way') {
    broadcastRoom(branchId, 'room_status_changed', { doctorId, newDoctorStatus: 'on_his_way' });
  }
}

export async function startDoctorStatusSubscriber(): Promise<void> {
  await redisSub.connect();

  await redisSub.subscribe('doctor:status_changed', (err) => {
    if (err) {
      console.error('[queue-sub] Failed to subscribe to doctor:status_changed', err.message);
    }
  });

  redisSub.on('message', async (channel: string, message: string) => {
    if (channel !== 'doctor:status_changed') return;

    let payload: DoctorStatusChangedPayload;
    try {
      payload = JSON.parse(message) as DoctorStatusChangedPayload;
    } catch {
      console.error('[queue-sub] Invalid JSON payload', message);
      return;
    }

    // ── Queue cascade cancel ─────────────────────────────────────────────────
    if (payload.newStatus === 'absent' || payload.newStatus === 'day_off') {
      const today = new Date().toISOString().split('T')[0];
      try {
        const cancelledIds = await cascadeCancelForDoctor(
          payload.doctorId,
          today,
          payload.branchId,
        );

        if (cancelledIds.length > 0) {
          const client = await pool.connect();
          try {
            await client.query(`SET app.current_branch_id = $1`, [payload.branchId]);
            await client.query(
              `UPDATE appointments
               SET status = 'Canc.', updated_at = NOW()
               WHERE id = ANY($1::uuid[]) AND status NOT IN ('Comp.', 'Canc.', 'Resch.')`,
              [cancelledIds],
            );
          } finally {
            client.release();
          }

          console.log(`[queue-sub] Cascade-cancelled ${cancelledIds.length} appointments for doctor ${payload.doctorId}`);
        }
      } catch (err) {
        console.error('[queue-sub] Cascade cancel failed', (err as Error).message);
      }
    }

    // ── Room auto-assign / auto-release ──────────────────────────────────────
    void handleRoomOnStatusChange(payload.doctorId, payload.newStatus, payload.branchId)
      .catch((err: Error) => console.error('[room-sub] Room action failed', err.message));
  });
}
