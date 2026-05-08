import { PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import type { Appointment, AppointmentStatus, PaginatedResponse } from '@fadl/types';
import { withRlsContext, withTransaction, pool } from '../config/database';

// ---------------------------------------------------------------------------
// Allowed status transitions
// ---------------------------------------------------------------------------
const ALLOWED_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  'TBC':   ['Ok!', 'Canc.', 'Inf.'],
  'Ok!':   ['Conf.', 'Canc.', 'TBC', 'Inf.'],
  'Conf.': ['Comp.', 'Canc.', 'Resch.', 'Inf.'],
  'Comp.': [],
  'Canc.': [],
  'Resch.': [],
  'Inf.':  ['TBC', 'Ok!'],
};

// ---------------------------------------------------------------------------
// Row mapper
// ---------------------------------------------------------------------------
function rowToAppointment(row: Record<string, unknown>): Appointment {
  return {
    id:                     row.id as string,
    patientId:              row.patient_id as string,
    doctorId:               row.doctor_id as string,
    specialtyId:            row.specialty_id as number,
    appointmentDate:        (row.appointment_date as Date).toISOString().split('T')[0],
    startTime:              row.start_time as string,
    endTime:                row.end_time as string,
    timeZone:               (row.time_zone as string) ?? 'Africa/Cairo',
    status:                 row.status as AppointmentStatus,
    appointmentType:        row.appointment_type as Appointment['appointmentType'],
    isOnline:               row.is_online as boolean,
    isOverbooked:           row.is_overbooked as boolean,
    patientSource:          row.patient_source as Appointment['patientSource'],
    procedureId:            row.procedure_id as string | undefined,
    approvedCharge:         row.approved_charge != null ? Number(row.approved_charge) : undefined,
    procedureCost:          row.procedure_cost != null ? Number(row.procedure_cost) : undefined,
    queueNumber:            row.queue_number as number | undefined,
    checkedInAt:            row.checked_in_at ? (row.checked_in_at as Date).toISOString() : undefined,
    checkedOutAt:           row.checked_out_at ? (row.checked_out_at as Date).toISOString() : undefined,
    waitingTimeMinutes:     row.waiting_time_minutes as number | undefined,
    originalAppointmentId:  row.original_appointment_id as string | undefined,
    rescheduleCount:        (row.reschedule_count as number) ?? 0,
    idempotencyKey:         row.idempotency_key as string | undefined,
    notes:                  row.notes as string | undefined,
    version:                row.version as number,
    deletedAt:              row.deleted_at ? (row.deleted_at as Date).toISOString() : undefined,
    createdAt:              (row.created_at as Date).toISOString(),
    updatedAt:              (row.updated_at as Date).toISOString(),
    createdBy:              row.created_by as string | undefined,
    branchId:               row.branch_id as number,
  };
}

// ---------------------------------------------------------------------------
// findAppointmentById
// ---------------------------------------------------------------------------
export async function findAppointmentById(id: string): Promise<Appointment | null> {
  return withRlsContext(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM appointments WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return rows.length ? rowToAppointment(rows[0] as Record<string, unknown>) : null;
  });
}

// ---------------------------------------------------------------------------
// listAppointments
// ---------------------------------------------------------------------------
export async function listAppointments(params: {
  doctorId?: string;
  patientId?: string;
  date?: string;
  status?: AppointmentStatus;
  page?: number;
  limit?: number;
}): Promise<PaginatedResponse<Appointment>> {
  const page  = params.page  ?? 1;
  const limit = Math.min(params.limit ?? 20, 100);
  const offset = (page - 1) * limit;

  return withRlsContext(async (client) => {
    const conditions: string[] = ['deleted_at IS NULL'];
    const values: unknown[] = [];
    let idx = 1;

    // Include date early for partition pruning
    if (params.date) {
      conditions.push(`appointment_date = $${idx++}`);
      values.push(params.date);
    }

    if (params.doctorId) {
      conditions.push(`doctor_id = $${idx++}`);
      values.push(params.doctorId);
    }

    if (params.patientId) {
      conditions.push(`patient_id = $${idx++}`);
      values.push(params.patientId);
    }

    if (params.status) {
      conditions.push(`status = $${idx++}`);
      values.push(params.status);
    }

    const where = conditions.join(' AND ');

    const limitIdx  = idx;
    const offsetIdx = idx + 1;

    const [{ rows: countRows }, { rows: dataRows }] = await Promise.all([
      client.query(
        `SELECT COUNT(*)::int AS total FROM appointments WHERE ${where}`,
        values,
      ),
      client.query(
        `SELECT * FROM appointments WHERE ${where} ORDER BY appointment_date, start_time LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        [...values, limit, offset],
      ),
    ]);

    const total = (countRows[0] as { total: number }).total;

    return {
      data: dataRows.map((r) => rowToAppointment(r as Record<string, unknown>)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  });
}

// ---------------------------------------------------------------------------
// createAppointment
// ---------------------------------------------------------------------------
export async function createAppointment(
  input: {
    patientId: string;
    doctorId: string;
    specialtyId?: number;
    appointmentDate: string;
    startTime: string;
    endTime: string;
    appointmentType?: string;
    isOnline?: boolean;
    patientSource?: string;
    approvedCharge?: number;
    procedureCost?: number;
    idempotencyKey?: string;
    notes?: string;
  },
  createdBy: string,
  branchId: number,
): Promise<Appointment> {
  return withTransaction(async (client: PoolClient) => {
    // Idempotency check — return existing row if key already used
    if (input.idempotencyKey) {
      const { rows: existing } = await client.query(
        `SELECT * FROM appointments WHERE idempotency_key = $1 AND deleted_at IS NULL`,
        [input.idempotencyKey],
      );
      if (existing.length) {
        return rowToAppointment(existing[0] as Record<string, unknown>);
      }
    }

    // Get next queue number; lock existing rows first, then aggregate
    await client.query(
      `SELECT id FROM appointments
       WHERE doctor_id = $1
         AND appointment_date = $2
         AND status NOT IN ('Canc.', 'Resch.')
         AND deleted_at IS NULL
       FOR UPDATE`,
      [input.doctorId, input.appointmentDate],
    );
    const { rows: queueRows } = await client.query(
      `SELECT COALESCE(MAX(queue_number), 0) + 1 AS next_queue
       FROM appointments
       WHERE doctor_id = $1
         AND appointment_date = $2
         AND status NOT IN ('Canc.', 'Resch.')
         AND deleted_at IS NULL`,
      [input.doctorId, input.appointmentDate],
    );
    const queueNumber = (queueRows[0] as { next_queue: number }).next_queue;

    const id = uuidv4();

    let insertResult;
    try {
      insertResult = await client.query(
        `INSERT INTO appointments (
          id, patient_id, doctor_id, specialty_id,
          appointment_date, start_time, end_time,
          appointment_type, is_online,
          patient_source, approved_charge, procedure_cost,
          queue_number, idempotency_key, notes,
          status, created_by, branch_id
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7,
          $8, $9,
          $10, $11, $12,
          $13, $14, $15,
          'TBC', $16, $17
        ) RETURNING *`,
        [
          id,
          input.patientId,
          input.doctorId,
          input.specialtyId ?? null,
          input.appointmentDate,
          input.startTime,
          input.endTime,
          input.appointmentType ?? 'in_person',
          input.isOnline ?? false,
          input.patientSource ?? "Cl.'s",
          input.approvedCharge ?? null,
          input.procedureCost ?? null,
          queueNumber,
          input.idempotencyKey ?? null,
          input.notes ?? null,
          createdBy,
          branchId,
        ],
      );
    } catch (err) {
      const pgErr = err as { code?: string };
      if (pgErr.code === '23P01') {
        throw Object.assign(
          new Error('Appointment slot is already booked for this time range'),
          { code: 'DOUBLE_BOOKING', statusCode: 409 },
        );
      }
      throw err;
    }

    return rowToAppointment(insertResult.rows[0] as Record<string, unknown>);
  });
}

// ---------------------------------------------------------------------------
// updateAppointmentStatus
// ---------------------------------------------------------------------------
export async function updateAppointmentStatus(
  id: string,
  newStatus: AppointmentStatus,
  version: number,
  updatedBy: string,
): Promise<Appointment> {
  return withTransaction(async (client: PoolClient) => {
    const { rows } = await client.query(
      `SELECT * FROM appointments WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [id],
    );

    if (!rows.length) {
      throw Object.assign(
        new Error('Appointment not found'),
        { code: 'APPOINTMENT_NOT_FOUND', statusCode: 404 },
      );
    }

    const current = rows[0] as Record<string, unknown>;
    const currentVersion = current.version as number;
    const currentStatus  = current.status as AppointmentStatus;

    if (currentVersion !== version) {
      throw Object.assign(
        new Error('Conflict: appointment was modified by another request'),
        { code: 'VERSION_CONFLICT', statusCode: 409 },
      );
    }

    const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? [];
    if (!allowed.includes(newStatus)) {
      throw Object.assign(
        new Error(`Transition from '${currentStatus}' to '${newStatus}' is not allowed`),
        { code: 'INVALID_STATUS_TRANSITION', statusCode: 422 },
      );
    }

    const { rows: updated } = await client.query(
      `UPDATE appointments
          SET status     = $1,
              version    = $2,
              updated_at = NOW(),
              updated_by = $3
        WHERE id = $4
        RETURNING *`,
      [newStatus, currentVersion + 1, updatedBy, id],
    );

    return rowToAppointment(updated[0] as Record<string, unknown>);
  });
}

// ---------------------------------------------------------------------------
// checkInAppointment
// ---------------------------------------------------------------------------
export async function checkInAppointment(
  id: string,
  updatedBy: string,
): Promise<Appointment> {
  return withTransaction(async (client: PoolClient) => {
    const { rows } = await client.query(
      `SELECT * FROM appointments WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [id],
    );

    if (!rows.length) {
      throw Object.assign(
        new Error('Appointment not found'),
        { code: 'APPOINTMENT_NOT_FOUND', statusCode: 404 },
      );
    }

    const current = rows[0] as Record<string, unknown>;
    const currentStatus = current.status as AppointmentStatus;

    if (currentStatus !== 'Ok!' && currentStatus !== 'Conf.') {
      throw Object.assign(
        new Error(`Cannot check in appointment with status '${currentStatus}'`),
        { code: 'INVALID_STATUS_TRANSITION', statusCode: 422 },
      );
    }

    const { rows: updated } = await client.query(
      `UPDATE appointments
          SET checked_in_at = NOW(),
              status        = 'Conf.',
              updated_at    = NOW(),
              updated_by    = $1
        WHERE id = $2
        RETURNING *`,
      [updatedBy, id],
    );

    return rowToAppointment(updated[0] as Record<string, unknown>);
  });
}

// ---------------------------------------------------------------------------
// softDeleteAppointment
// ---------------------------------------------------------------------------
export async function softDeleteAppointment(id: string, deletedBy: string): Promise<void> {
  const result = await pool.query(
    `UPDATE appointments
        SET deleted_at = NOW(),
            updated_by = $2
      WHERE id = $1 AND deleted_at IS NULL`,
    [id, deletedBy],
  );
  if (result.rowCount === 0) {
    throw Object.assign(
      new Error('Appointment not found'),
      { code: 'APPOINTMENT_NOT_FOUND', statusCode: 404 },
    );
  }
}
