import { redisSub } from '../config/redis';
import { pool } from '../config/database';
import { cascadeCancelForDoctor } from '../repositories/queue.repository';

interface DoctorStatusChangedPayload {
  doctorId: string;
  newStatus: string;
  branchId: number;
  changedAt: string;
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

    if (payload.newStatus !== 'absent' && payload.newStatus !== 'day_off') return;

    const today = new Date().toISOString().split('T')[0];

    try {
      // Cancel all queued appointments for this doctor today
      const cancelledIds = await cascadeCancelForDoctor(
        payload.doctorId,
        today,
        payload.branchId,
      );

      if (cancelledIds.length > 0) {
        // Also update appointment status to cancelled in the appointments table
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
  });
}
