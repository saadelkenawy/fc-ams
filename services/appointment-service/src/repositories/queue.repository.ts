import { PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import type { PatientQueueEntry, QueueStats, QueueStatus } from '@fadl/types';
import { withRlsContext, withTransaction, pool } from '../config/database';

// ── Row mapper ───────────────────────────────────────────────────────────────

function rowToEntry(r: Record<string, unknown>): PatientQueueEntry {
  return {
    id: r.id as string,
    appointmentId: r.appointment_id as string,
    doctorId: r.doctor_id as string,
    patientId: r.patient_id as string,
    queueDate: (r.queue_date as Date).toISOString().split('T')[0],
    position: r.position as number,
    status: r.status as QueueStatus,
    checkedInAt: (r.checked_in_at as Date).toISOString(),
    calledAt: r.called_at ? (r.called_at as Date).toISOString() : undefined,
    sessionStart: r.session_start ? (r.session_start as Date).toISOString() : undefined,
    sessionEnd: r.session_end ? (r.session_end as Date).toISOString() : undefined,
    estimatedWaitMinutes: r.estimated_wait_minutes as number | undefined,
    branchId: r.branch_id as number,
    createdAt: (r.created_at as Date).toISOString(),
    updatedAt: (r.updated_at as Date).toISOString(),
  };
}

async function logEvent(
  client: PoolClient,
  queueId: string,
  eventType: string,
  branchId: number,
  opts: { oldPosition?: number; newPosition?: number; performedBy?: string; metadata?: Record<string, unknown> } = {},
): Promise<void> {
  await client.query(
    `INSERT INTO queue_event_log (id, queue_id, event_type, old_position, new_position, metadata, performed_by, branch_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [uuidv4(), queueId, eventType, opts.oldPosition ?? null, opts.newPosition ?? null,
     opts.metadata ? JSON.stringify(opts.metadata) : null, opts.performedBy ?? null, branchId],
  );
}

// ── Check-in ─────────────────────────────────────────────────────────────────

export async function checkIn(
  appointmentId: string,
  doctorId: string,
  patientId: string,
  queueDate: string,
  branchId: number,
  performedBy: string,
): Promise<PatientQueueEntry> {
  return withTransaction(async (client: PoolClient) => {
    // Verify appointment exists and is confirmed
    const { rows: apptRows } = await client.query(
      `SELECT id, status FROM appointments WHERE appointment_date = $1 AND id = $2 AND deleted_at IS NULL`,
      [queueDate, appointmentId],
    );
    if (!apptRows.length) {
      throw Object.assign(new Error('Appointment not found'), { code: 'APPOINTMENT_NOT_FOUND', statusCode: 404 });
    }

    // Check not already in queue
    const { rows: existing } = await client.query(
      `SELECT id FROM patient_queue WHERE appointment_id = $1`,
      [appointmentId],
    );
    if (existing.length) {
      throw Object.assign(new Error('Patient already checked in'), { code: 'ALREADY_CHECKED_IN', statusCode: 409 });
    }

    // Get next position (SELECT FOR UPDATE to prevent race conditions)
    const { rows: maxRows } = await client.query(
      `SELECT COALESCE(MAX(position), 0) + 1 AS next_pos
       FROM patient_queue
       WHERE doctor_id = $1 AND queue_date = $2
         AND status IN ('waiting', 'called', 'in_session')
       FOR UPDATE`,
      [doctorId, queueDate],
    );
    const position = (maxRows[0] as { next_pos: number }).next_pos;

    // Estimate wait time
    const { rows: avgRows } = await client.query(
      `SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (session_end - session_start))/60), 15)::int AS avg_mins
       FROM patient_queue
       WHERE doctor_id = $1 AND queue_date = $2 AND status = 'completed'
         AND session_start IS NOT NULL AND session_end IS NOT NULL`,
      [doctorId, queueDate],
    );
    const avgMins = (avgRows[0] as { avg_mins: number }).avg_mins;
    const waitingAhead = position - 1;
    const estimatedWait = waitingAhead * avgMins;

    const id = uuidv4();
    const { rows } = await client.query(
      `INSERT INTO patient_queue
         (id, appointment_id, doctor_id, patient_id, queue_date, position, status, estimated_wait_minutes, branch_id)
       VALUES ($1,$2,$3,$4,$5,$6,'waiting',$7,$8) RETURNING *`,
      [id, appointmentId, doctorId, patientId, queueDate, position, estimatedWait, branchId],
    );

    const entry = rowToEntry(rows[0] as Record<string, unknown>);
    await logEvent(client, id, 'checked_in', branchId, { newPosition: position, performedBy });
    return entry;
  });
}

// ── Call Patient ──────────────────────────────────────────────────────────────

export async function callPatient(queueId: string, performedBy: string, branchId: number): Promise<PatientQueueEntry> {
  return withTransaction(async (client: PoolClient) => {
    const { rows } = await client.query(
      `UPDATE patient_queue SET status = 'called', called_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status = 'waiting'
       RETURNING *`,
      [queueId],
    );
    if (!rows.length) {
      throw Object.assign(new Error('Queue entry not found or not in waiting status'), { code: 'INVALID_TRANSITION', statusCode: 409 });
    }
    const entry = rowToEntry(rows[0] as Record<string, unknown>);
    await logEvent(client, queueId, 'called', branchId, { performedBy });
    return entry;
  });
}

// ── Start Session ─────────────────────────────────────────────────────────────

export async function startSession(queueId: string, performedBy: string, branchId: number): Promise<PatientQueueEntry> {
  return withTransaction(async (client: PoolClient) => {
    const { rows } = await client.query(
      `UPDATE patient_queue SET status = 'in_session', session_start = NOW(), updated_at = NOW()
       WHERE id = $1 AND status IN ('called', 'waiting')
       RETURNING *`,
      [queueId],
    );
    if (!rows.length) {
      throw Object.assign(new Error('Queue entry not found'), { code: 'NOT_FOUND', statusCode: 404 });
    }
    const entry = rowToEntry(rows[0] as Record<string, unknown>);
    await logEvent(client, queueId, 'session_started', branchId, { performedBy });
    return entry;
  });
}

// ── Complete Session ──────────────────────────────────────────────────────────

export async function completeSession(queueId: string, performedBy: string, branchId: number): Promise<PatientQueueEntry> {
  return withTransaction(async (client: PoolClient) => {
    const { rows } = await client.query(
      `UPDATE patient_queue SET status = 'completed', session_end = NOW(), updated_at = NOW()
       WHERE id = $1 AND status = 'in_session'
       RETURNING *`,
      [queueId],
    );
    if (!rows.length) {
      throw Object.assign(new Error('Queue entry not found or not in session'), { code: 'INVALID_TRANSITION', statusCode: 409 });
    }
    const entry = rowToEntry(rows[0] as Record<string, unknown>);
    await logEvent(client, queueId, 'session_completed', branchId, { performedBy });
    return entry;
  });
}

// ── No-Show ───────────────────────────────────────────────────────────────────

export async function markNoShow(queueId: string, performedBy: string, branchId: number): Promise<PatientQueueEntry> {
  return withTransaction(async (client: PoolClient) => {
    const { rows: existing } = await client.query(
      `SELECT position, status FROM patient_queue WHERE id = $1 FOR UPDATE`,
      [queueId],
    );
    if (!existing.length) {
      throw Object.assign(new Error('Queue entry not found'), { code: 'NOT_FOUND', statusCode: 404 });
    }
    const { position, status } = existing[0] as { position: number; status: QueueStatus };
    if (!['waiting', 'called'].includes(status)) {
      throw Object.assign(new Error('Cannot mark no-show from current status'), { code: 'INVALID_TRANSITION', statusCode: 409 });
    }

    const { rows } = await client.query(
      `UPDATE patient_queue SET status = 'no_show', updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [queueId],
    );

    // Shift positions of those behind
    await shiftPositions(client, (existing[0] as Record<string, unknown>).doctor_id as string,
      (existing[0] as Record<string, unknown>).queue_date as string, position, branchId);

    const entry = rowToEntry(rows[0] as Record<string, unknown>);
    await logEvent(client, queueId, 'no_show', branchId, { oldPosition: position, performedBy });
    return entry;
  });
}

// ── Cancel & Shift ────────────────────────────────────────────────────────────

export async function cancelAndShift(
  queueId: string,
  performedBy: string,
  branchId: number,
): Promise<PatientQueueEntry> {
  return withTransaction(async (client: PoolClient) => {
    const { rows: existing } = await client.query(
      `SELECT position, doctor_id, queue_date, status FROM patient_queue WHERE id = $1 FOR UPDATE`,
      [queueId],
    );
    if (!existing.length) {
      throw Object.assign(new Error('Queue entry not found'), { code: 'NOT_FOUND', statusCode: 404 });
    }
    const row = existing[0] as Record<string, unknown>;
    const position = row.position as number;
    const doctorId = row.doctor_id as string;
    const queueDate = row.queue_date as string;

    if (!['waiting', 'called'].includes(row.status as string)) {
      throw Object.assign(new Error('Cannot cancel from current status'), { code: 'INVALID_TRANSITION', statusCode: 409 });
    }

    const { rows } = await client.query(
      `UPDATE patient_queue SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [queueId],
    );

    await shiftPositions(client, doctorId, queueDate, position, branchId);

    const entry = rowToEntry(rows[0] as Record<string, unknown>);
    await logEvent(client, queueId, 'cancelled', branchId, { oldPosition: position, performedBy });
    return entry;
  });
}

// Decrement positions of all entries with position > cancelledPosition
async function shiftPositions(
  client: PoolClient,
  doctorId: string,
  queueDate: string,
  cancelledPosition: number,
  branchId: number,
): Promise<void> {
  const { rows } = await client.query(
    `UPDATE patient_queue SET position = position - 1, updated_at = NOW()
     WHERE doctor_id = $1 AND queue_date = $2
       AND position > $3
       AND status IN ('waiting', 'called')
     RETURNING id, position`,
    [doctorId, queueDate, cancelledPosition],
  );

  for (const r of rows) {
    const row = r as Record<string, unknown>;
    await logEvent(client, row.id as string, 'position_shifted', branchId, {
      oldPosition: (row.position as number) + 1,
      newPosition: row.position as number,
    });
  }
}

// ── Rejoin Queue ──────────────────────────────────────────────────────────────

export async function rejoinQueue(
  queueId: string,
  performedBy: string,
  branchId: number,
): Promise<PatientQueueEntry> {
  return withTransaction(async (client: PoolClient) => {
    const { rows: existing } = await client.query(
      `SELECT doctor_id, queue_date, status FROM patient_queue WHERE id = $1 FOR UPDATE`,
      [queueId],
    );
    if (!existing.length) {
      throw Object.assign(new Error('Queue entry not found'), { code: 'NOT_FOUND', statusCode: 404 });
    }
    const row = existing[0] as Record<string, unknown>;
    if (!['cancelled', 'no_show'].includes(row.status as string)) {
      throw Object.assign(new Error('Can only rejoin from cancelled or no_show status'), { code: 'INVALID_TRANSITION', statusCode: 409 });
    }

    const { rows: maxRows } = await client.query(
      `SELECT COALESCE(MAX(position), 0) + 1 AS next_pos
       FROM patient_queue
       WHERE doctor_id = $1 AND queue_date = $2 AND status IN ('waiting', 'called', 'in_session')
       FOR UPDATE`,
      [row.doctor_id, row.queue_date],
    );
    const newPosition = (maxRows[0] as { next_pos: number }).next_pos;

    const { rows } = await client.query(
      `UPDATE patient_queue
       SET status = 'waiting', position = $1, called_at = NULL, session_start = NULL, session_end = NULL, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [newPosition, queueId],
    );

    const entry = rowToEntry(rows[0] as Record<string, unknown>);
    await logEvent(client, queueId, 'rejoined', branchId, { newPosition, performedBy });
    return entry;
  });
}

// ── Read operations ───────────────────────────────────────────────────────────

export async function getQueuePosition(queueId: string): Promise<PatientQueueEntry | null> {
  return withRlsContext(async (client) => {
    const { rows } = await client.query(`SELECT * FROM patient_queue WHERE id = $1`, [queueId]);
    return rows.length ? rowToEntry(rows[0] as Record<string, unknown>) : null;
  });
}

export async function getFullQueue(doctorId: string, queueDate: string): Promise<PatientQueueEntry[]> {
  return withRlsContext(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM patient_queue
       WHERE doctor_id = $1 AND queue_date = $2
       ORDER BY CASE status WHEN 'in_session' THEN 1 WHEN 'called' THEN 2 WHEN 'waiting' THEN 3 ELSE 4 END, position`,
      [doctorId, queueDate],
    );
    return rows.map((r) => rowToEntry(r as Record<string, unknown>));
  });
}

export async function getQueueStats(doctorId: string, queueDate: string): Promise<QueueStats> {
  return withRlsContext(async (client) => {
    const { rows } = await client.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'waiting')    AS waiting,
         COUNT(*) FILTER (WHERE status = 'called')     AS called,
         COUNT(*) FILTER (WHERE status = 'in_session') AS in_session,
         COUNT(*) FILTER (WHERE status = 'completed')  AS completed,
         COUNT(*) FILTER (WHERE status = 'cancelled')  AS cancelled,
         COALESCE(AVG(EXTRACT(EPOCH FROM (session_end - session_start))/60)
           FILTER (WHERE status = 'completed' AND session_start IS NOT NULL AND session_end IS NOT NULL), 15)::int AS avg_session_minutes
       FROM patient_queue
       WHERE doctor_id = $1 AND queue_date = $2`,
      [doctorId, queueDate],
    );

    const r = rows[0] as Record<string, unknown>;
    const waiting = Number(r.waiting ?? 0);
    const avgSession = Number(r.avg_session_minutes ?? 15);

    return {
      doctorId,
      queueDate,
      waiting,
      called: Number(r.called ?? 0),
      inSession: Number(r.in_session ?? 0),
      completed: Number(r.completed ?? 0),
      cancelled: Number(r.cancelled ?? 0),
      avgSessionMinutes: avgSession,
      estimatedWaitForNext: waiting * avgSession,
    };
  });
}

// Cascade cancel all waiting/called appointments for a doctor on a date
export async function cascadeCancelForDoctor(
  doctorId: string,
  queueDate: string,
  branchId: number,
): Promise<string[]> {
  return withTransaction(async (client: PoolClient) => {
    const { rows } = await client.query(
      `UPDATE patient_queue SET status = 'cancelled', updated_at = NOW()
       WHERE doctor_id = $1 AND queue_date = $2 AND status IN ('waiting', 'called')
       RETURNING id, appointment_id`,
      [doctorId, queueDate],
    );

    const appointmentIds: string[] = [];
    for (const r of rows) {
      const row = r as Record<string, unknown>;
      appointmentIds.push(row.appointment_id as string);
      await logEvent(client, row.id as string, 'cancelled', branchId, {
        metadata: { reason: 'doctor_absent' },
      });
    }
    return appointmentIds;
  });
}
