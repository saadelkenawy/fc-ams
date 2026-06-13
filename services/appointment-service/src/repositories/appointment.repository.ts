import { PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import type { Appointment, AppointmentStatus, PaginatedResponse } from '@fadl/types';
import { withRlsContext, withTransaction, rlsQuery } from '../config/database';
import { config } from '../config';
import * as outbox from './outbox.repository';

// ---------------------------------------------------------------------------
// Allowed status transitions
// ---------------------------------------------------------------------------
const ALLOWED_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  'TBC':    ['Ok!', 'Canc.', 'Ref.'],
  'Ok!':    ['Comp.', 'Canc.', 'Ref.'],
  'Conf.':  ['Comp.', 'Canc.', 'Ref.'],
  'Comp.':  [],
  'Canc.':  ['Ref.'],
  'Resch.': [],
  'Inf.':   ['TBC', 'Ok!'],
  'Ref.':   [],
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
    startTime:              (row.start_time as string).slice(0, 5),
    endTime:                (row.end_time as string).slice(0, 5),
    timeZone:               (row.time_zone as string) ?? 'Africa/Cairo',
    status:                 row.status as AppointmentStatus,
    doctorConfirmed:        (row.doctor_confirmed as boolean) ?? false,
    patientConfirmed:       (row.patient_confirmed as boolean) ?? false,
    appointmentType:        row.appointment_type as Appointment['appointmentType'],
    isOnline:               row.is_online as boolean,
    isOverbooked:           row.is_overbooked as boolean,
    patientSource:          row.patient_source as Appointment['patientSource'],
    paymentMethod:          row.payment_method as Appointment['paymentMethod'] | undefined,
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
    roomId:                 row.room_id as string | undefined,
    roomCode:               row.room_code as string | undefined,
    roomAssignedAt:         row.room_assigned_at ? (row.room_assigned_at as Date).toISOString() : undefined,
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
      client.query(`SELECT COUNT(*)::int AS total FROM appointments WHERE ${where}`, values),
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
    paymentMethod?: string;
    approvedCharge?: number;
    procedureCost?: number;
    roomCode?: string;
    idempotencyKey?: string;
    notes?: string;
  },
  createdBy: string,
  branchId: number,
): Promise<Appointment & { doctorSplitDoctor: number; doctorSplitClinic: number }> {
  return withTransaction(branchId, async (client: PoolClient) => {
    if (input.idempotencyKey) {
      const { rows: existing } = await client.query(
        `SELECT * FROM appointments WHERE idempotency_key = $1 AND deleted_at IS NULL`,
        [input.idempotencyKey],
      );
      if (existing.length) {
        const appt = rowToAppointment(existing[0] as Record<string, unknown>);
        const { rows: docRows } = await client.query(
          `SELECT consultation_split_doctor, consultation_split_clinic FROM doctors WHERE id = $1`,
          [appt.doctorId],
        );
        const doctorSplitDoctor = docRows.length ? Number((docRows[0] as Record<string, unknown>).consultation_split_doctor) : 50;
        const doctorSplitClinic = docRows.length ? Number((docRows[0] as Record<string, unknown>).consultation_split_clinic) : 50;
        return { ...appt, doctorSplitDoctor, doctorSplitClinic };
      }
    }

    // Queue number
    await client.query(
      `SELECT id FROM appointments
       WHERE doctor_id = $1 AND appointment_date = $2
         AND status NOT IN ('Canc.', 'Resch.') AND deleted_at IS NULL
       FOR UPDATE`,
      [input.doctorId, input.appointmentDate],
    );
    const { rows: queueRows } = await client.query(
      `SELECT COALESCE(MAX(queue_number), 0) + 1 AS next_queue
       FROM appointments
       WHERE doctor_id = $1 AND appointment_date = $2
         AND status NOT IN ('Canc.', 'Resch.') AND deleted_at IS NULL`,
      [input.doctorId, input.appointmentDate],
    );
    const queueNumber = (queueRows[0] as { next_queue: number }).next_queue;

    // Doctor split percentages for auto-billing
    const { rows: docRows } = await client.query(
      `SELECT consultation_split_doctor, consultation_split_clinic FROM doctors WHERE id = $1`,
      [input.doctorId],
    );
    const splitDoctor = docRows.length ? Number((docRows[0] as Record<string, unknown>).consultation_split_doctor) : 50;
    const splitClinic = docRows.length ? Number((docRows[0] as Record<string, unknown>).consultation_split_clinic) : 50;

    // Clinic room: validate the room exists and still has daily capacity.
    // On overflow the error lists rooms that can still take appointments so
    // the receptionist (or UI) can immediately pick another room.
    let roomId: number | null = null;
    if (input.roomCode) {
      const { rows: roomRows } = await client.query(
        `SELECT id FROM clinic_rooms WHERE room_code = $1 AND is_active = TRUE`,
        [input.roomCode],
      );
      if (!roomRows.length) {
        throw Object.assign(new Error(`Unknown or inactive room: ${input.roomCode}`), {
          code: 'ROOM_NOT_FOUND', statusCode: 422,
        });
      }
      roomId = (roomRows[0] as { id: number }).id;

      const { rows: usageRows } = await client.query(
        `SELECT cr.room_code, COUNT(a.id)::int AS used
         FROM clinic_rooms cr
         LEFT JOIN appointments a
           ON a.room_code = cr.room_code
          AND a.appointment_date = $1
          AND a.status NOT IN ('Canc.', 'Resch.')
          AND a.deleted_at IS NULL
         WHERE cr.is_active = TRUE AND cr.room_code IS NOT NULL
         GROUP BY cr.room_code
         ORDER BY cr.room_code`,
        [input.appointmentDate],
      );
      const capacity = config.ROOM_DAILY_SLOT_CAPACITY;
      const usage = usageRows as Array<{ room_code: string; used: number }>;
      const selected = usage.find((u) => u.room_code === input.roomCode);
      if ((selected?.used ?? 0) >= capacity) {
        const free = usage.filter((u) => u.used < capacity).map((u) => `${u.room_code} (${u.used}/${capacity})`);
        throw Object.assign(
          new Error(
            free.length
              ? `Room ${input.roomCode} is full for this date (${capacity}/${capacity}). Rooms with capacity: ${free.join(', ')}`
              : `Room ${input.roomCode} is full for this date and no other room has capacity`,
          ),
          { code: 'ROOM_FULL', statusCode: 409 },
        );
      }
    }

    const id = uuidv4();

    let insertResult;
    try {
      insertResult = await client.query(
        `INSERT INTO appointments (
          id, patient_id, doctor_id, specialty_id,
          appointment_date, start_time, end_time,
          appointment_type, is_online,
          patient_source, payment_method, approved_charge, procedure_cost,
          queue_number, idempotency_key, notes,
          room_id, room_code, room_assigned_at,
          status, created_by, branch_id, doctor_confirmed
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7,
          $8, $9,
          $10, $11, $12, $13,
          $14, $15, $16,
          $17, $18, CASE WHEN $18::varchar IS NULL THEN NULL ELSE NOW() END,
          'TBC', $19, $20, $21
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
          input.paymentMethod ?? null,
          input.approvedCharge ?? null,
          input.procedureCost ?? null,
          queueNumber,
          input.idempotencyKey ?? null,
          input.notes ?? null,
          roomId,
          input.roomCode ?? null,
          createdBy,
          branchId,
          // Doctor confirmation auto-on when this isn't the doctor's first
          // appointment of the day (they're already present); first booking of
          // the day starts unconfirmed. Patient confirmation is always manual.
          queueNumber > 1,
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

    // Log initial status
    await client.query(
      `INSERT INTO appointment_status_log (appointment_id, from_status, to_status, changed_by, branch_id)
       VALUES ($1, NULL, 'TBC', $2, $3)`,
      [id, createdBy, branchId],
    );

    const appt = rowToAppointment(insertResult.rows[0] as Record<string, unknown>);

    // Transactional outbox: billing record creation commits atomically with
    // the appointment and is delivered (with retries) by the outbox worker.
    if (input.approvedCharge && input.approvedCharge > 0) {
      const visitType = input.appointmentType === 'online'
        ? 'online'
        : input.appointmentType === 'operative'
        ? 'operative'
        : 'consultation';
      await outbox.enqueue(client, 'billing.create', {
        idempotencyKey:        `appt-billing-${id}`,
        appointmentId:         id,
        patientId:             input.patientId,
        doctorId:              input.doctorId,
        patientSource:         appt.patientSource,
        doctorSpecialtyId:     input.specialtyId ?? null,
        approvedCharge:        input.approvedCharge,
        procedureCost:         input.procedureCost,
        splitDoctorPercentage: splitDoctor,
        splitClinicPercentage: splitClinic,
        paymentMethod:         input.paymentMethod,
        currencyCode:          'EGP',
        visitType,
      }, branchId);
    }

    return { ...appt, doctorSplitDoctor: splitDoctor, doctorSplitClinic: splitClinic };
  });
}

// ---------------------------------------------------------------------------
// updateAppointment (edit flow)
// ---------------------------------------------------------------------------
export async function updateAppointment(
  id: string,
  input: {
    doctorId?: string;
    specialtyId?: number;
    appointmentDate?: string;
    startTime?: string;
    endTime?: string;
    appointmentType?: string;
    patientSource?: string;
    paymentMethod?: string | null;
    approvedCharge?: number | null;
    procedureCost?: number | null;
    notes?: string | null;
    procedureId?: string | null;
  },
  updatedBy: string,
): Promise<Appointment> {
  return withTransaction(async (client: PoolClient) => {
    const { rows } = await client.query(
      `SELECT * FROM appointments WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [id],
    );

    if (!rows.length) {
      throw Object.assign(new Error('Appointment not found'), { code: 'APPOINTMENT_NOT_FOUND', statusCode: 404 });
    }

    const current = rows[0] as Record<string, unknown>;
    const currentStatus = current.status as AppointmentStatus;

    if (currentStatus === 'Comp.' || currentStatus === 'Canc.' || currentStatus === 'Ref.') {
      throw Object.assign(
        new Error('Cannot edit a completed, cancelled, or refunded appointment'),
        { code: 'INVALID_STATUS', statusCode: 422 },
      );
    }

    const setClauses: string[] = ['updated_at = NOW()', 'updated_by = $2', 'version = version + 1'];
    const values: unknown[] = [id, updatedBy];
    let idx = 3;

    function addSet(col: string, val: unknown) {
      setClauses.push(`${col} = $${idx++}`);
      values.push(val);
    }

    if (input.doctorId       !== undefined) addSet('doctor_id',        input.doctorId);
    if (input.specialtyId    !== undefined) addSet('specialty_id',     input.specialtyId);
    if (input.appointmentDate !== undefined) addSet('appointment_date', input.appointmentDate);
    if (input.startTime      !== undefined) addSet('start_time',       input.startTime);
    if (input.endTime        !== undefined) addSet('end_time',         input.endTime);
    if (input.appointmentType !== undefined) addSet('appointment_type', input.appointmentType);
    if (input.patientSource  !== undefined) addSet('patient_source',   input.patientSource);
    if (input.paymentMethod  !== undefined) addSet('payment_method',   input.paymentMethod);
    if (input.approvedCharge !== undefined) addSet('approved_charge',  input.approvedCharge);
    if (input.procedureCost  !== undefined) addSet('procedure_cost',   input.procedureCost);
    if (input.notes          !== undefined) addSet('notes',            input.notes);
    if (input.procedureId    !== undefined) addSet('procedure_id',     input.procedureId);

    const { rows: updated } = await client.query(
      `UPDATE appointments SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
      values,
    );

    return rowToAppointment(updated[0] as Record<string, unknown>);
  });
}

// ---------------------------------------------------------------------------
// swapAppointmentTimes — atomically exchange the start/end slots of two
// appointments in a single transaction. Both rows are swapped in ONE UPDATE
// statement so the non-deferrable double-booking exclusion constraint (checked
// at statement end, not per-row) never sees the two rows transiently overlap —
// no temporary "parking" slot is needed and a failure rolls the whole swap back.
// ---------------------------------------------------------------------------
const SWAP_TERMINAL_STATUSES: AppointmentStatus[] = ['Comp.', 'Canc.', 'Ref.', 'Resch.'];

export async function swapAppointmentTimes(
  aId: string,
  bId: string,
  updatedBy: string,
): Promise<{ a: Appointment; b: Appointment }> {
  return withTransaction(async (client: PoolClient) => {
    // Lock both rows up front (stable order is irrelevant — ANY() locks both
    // in one statement, so there is no lock-ordering deadlock window).
    const { rows } = await client.query(
      `SELECT * FROM appointments WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL FOR UPDATE`,
      [[aId, bId]],
    );

    if (rows.length !== 2) {
      throw Object.assign(
        new Error('One or both appointments not found'),
        { code: 'APPOINTMENT_NOT_FOUND', statusCode: 404 },
      );
    }

    const a = rows.find((r) => r.id === aId) as Record<string, unknown>;
    const b = rows.find((r) => r.id === bId) as Record<string, unknown>;

    for (const r of [a, b]) {
      if (SWAP_TERMINAL_STATUSES.includes(r.status as AppointmentStatus)) {
        throw Object.assign(
          new Error('Cannot swap a completed, cancelled, rescheduled, or refunded appointment'),
          { code: 'INVALID_STATUS', statusCode: 422 },
        );
      }
    }

    // Time-only swap is meaningful only within the same day (the room timeline
    // is per-date); reject cross-date swaps rather than silently corrupt times.
    // appointment_date comes back as a JS Date (node-pg) — compare by value,
    // not by reference (two Date instances are never === / !== equal).
    if (String(a.appointment_date) !== String(b.appointment_date)) {
      throw Object.assign(
        new Error('Appointments must be on the same date to swap slots'),
        { code: 'SWAP_DATE_MISMATCH', statusCode: 422 },
      );
    }

    const move = (id: string, start: unknown, end: unknown, extraSet = '') =>
      client.query(
        `UPDATE appointments
            SET start_time = $2::time, end_time = $3::time,
                version = version + 1, updated_at = NOW(), updated_by = $4${extraSet}
          WHERE id = $1 RETURNING *`,
        [id, start, end, updatedBy],
      );

    try {
      if (a.doctor_id === b.doctor_id) {
        // Same doctor: the non-deferrable GiST exclusion constraint is checked
        // per-row, so the two rows can't transiently share the index. Lift B out
        // of the partial index (is_overbooked = TRUE drops it from the WHERE
        // clause) for the duration of the swap, then restore its original flag.
        // All in this one transaction — the exemption never commits on failure.
        await client.query(`UPDATE appointments SET is_overbooked = TRUE WHERE id = $1`, [bId]);
        await move(aId, b.start_time, b.end_time);
        await move(bId, a.start_time, a.end_time,
          `, is_overbooked = ${b.is_overbooked ? 'TRUE' : 'FALSE'}`);
      } else {
        // Different doctors never overlap each other; either move may still
        // collide with a *third* appointment of its new doctor — that's a real
        // conflict we want to surface (and roll back).
        await move(aId, b.start_time, b.end_time);
        await move(bId, a.start_time, a.end_time);
      }
    } catch (err) {
      // 23P01 = exclusion_violation: the swap would double-book a doctor.
      if ((err as { code?: string }).code === '23P01') {
        throw Object.assign(
          new Error('Swap would double-book a doctor at the target time'),
          { code: 'SLOT_CONFLICT', statusCode: 409 },
        );
      }
      throw err;
    }

    const { rows: fresh } = await client.query(
      `SELECT * FROM appointments WHERE id = ANY($1::uuid[])`, [[aId, bId]],
    );
    const byId = new Map(
      (fresh as Record<string, unknown>[]).map((r) => [r.id as string, rowToAppointment(r)]),
    );
    return { a: byId.get(aId)!, b: byId.get(bId)! };
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
      throw Object.assign(new Error('Appointment not found'), { code: 'APPOINTMENT_NOT_FOUND', statusCode: 404 });
    }

    const current = rows[0] as Record<string, unknown>;
    const currentVersion = current.version as number;
    const currentStatus  = current.status as AppointmentStatus;
    const branchId       = current.branch_id as number;

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
          SET status = $1, version = $2, updated_at = NOW(), updated_by = $3
        WHERE id = $4
        RETURNING *`,
      [newStatus, currentVersion + 1, updatedBy, id],
    );

    // Write status log
    await client.query(
      `INSERT INTO appointment_status_log (appointment_id, from_status, to_status, changed_by, branch_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, currentStatus, newStatus, updatedBy, branchId],
    );

    // Refunded appointments are locked and removed from all active lists
    if (newStatus === 'Ref.') {
      await client.query(
        `UPDATE appointments SET deleted_at = NOW() WHERE id = $1`,
        [id],
      );
    }

    return rowToAppointment(updated[0] as Record<string, unknown>);
  });
}

// ---------------------------------------------------------------------------
// updateConfirmations
// ---------------------------------------------------------------------------
// Toggles the doctor/patient confirmation flags and auto-advances the status:
//   TBC → Ok!  when doctor + patient + room are all confirmed
//   Ok! → TBC  when any of those conditions is no longer met (pre-check-in only)
// `roomReady` is computed by the caller from live room capacity/status.
export interface ConfirmationResult {
  appointment: Appointment;
  autoConfirmed: boolean; // flipped TBC → Ok! this call
  reverted: boolean;      // flipped Ok! → TBC this call
}

export async function updateConfirmations(
  id: string,
  flags: { doctorConfirmed?: boolean; patientConfirmed?: boolean },
  roomReady: boolean,
  version: number,
  updatedBy: string,
): Promise<ConfirmationResult> {
  return withTransaction(async (client: PoolClient) => {
    const { rows } = await client.query(
      `SELECT * FROM appointments WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [id],
    );
    if (!rows.length) {
      throw Object.assign(new Error('Appointment not found'), { code: 'APPOINTMENT_NOT_FOUND', statusCode: 404 });
    }

    const current        = rows[0] as Record<string, unknown>;
    const currentVersion = current.version as number;
    const currentStatus  = current.status as AppointmentStatus;
    const branchId       = current.branch_id as number;

    if (currentVersion !== version) {
      throw Object.assign(
        new Error('Conflict: appointment was modified by another request'),
        { code: 'VERSION_CONFLICT', statusCode: 409 },
      );
    }

    // Confirmations can only be toggled while the appointment is still in the
    // pre-visit window (TBC or auto-confirmed Ok!). Once checked-in/completed/
    // cancelled the flags are frozen.
    if (currentStatus !== 'TBC' && currentStatus !== 'Ok!') {
      throw Object.assign(
        new Error(`Confirmations cannot be changed while status is '${currentStatus}'`),
        { code: 'CONFIRMATIONS_LOCKED', statusCode: 422 },
      );
    }

    const doctorConfirmed  = flags.doctorConfirmed  ?? (current.doctor_confirmed  as boolean);
    const patientConfirmed = flags.patientConfirmed ?? (current.patient_confirmed as boolean);
    const allReady = doctorConfirmed && patientConfirmed && roomReady;

    let nextStatus = currentStatus;
    if (currentStatus === 'TBC' && allReady)      nextStatus = 'Ok!';
    else if (currentStatus === 'Ok!' && !allReady) nextStatus = 'TBC';

    const { rows: updated } = await client.query(
      `UPDATE appointments
          SET doctor_confirmed = $1, patient_confirmed = $2, status = $3,
              version = version + 1, updated_at = NOW(), updated_by = $4
        WHERE id = $5
        RETURNING *`,
      [doctorConfirmed, patientConfirmed, nextStatus, updatedBy, id],
    );

    if (nextStatus !== currentStatus) {
      await client.query(
        `INSERT INTO appointment_status_log (appointment_id, from_status, to_status, changed_by, branch_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, currentStatus, nextStatus, updatedBy, branchId],
      );
    }

    return {
      appointment:   rowToAppointment(updated[0] as Record<string, unknown>),
      autoConfirmed: currentStatus === 'TBC' && nextStatus === 'Ok!',
      reverted:      currentStatus === 'Ok!' && nextStatus === 'TBC',
    };
  });
}

// ---------------------------------------------------------------------------
// checkInAppointment
// ---------------------------------------------------------------------------
export async function checkInAppointment(id: string, updatedBy: string): Promise<Appointment> {
  return withTransaction(async (client: PoolClient) => {
    const { rows } = await client.query(
      `SELECT * FROM appointments WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [id],
    );

    if (!rows.length) {
      throw Object.assign(new Error('Appointment not found'), { code: 'APPOINTMENT_NOT_FOUND', statusCode: 404 });
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
          SET checked_in_at = NOW(), status = 'Conf.', updated_at = NOW(), updated_by = $1
        WHERE id = $2
        RETURNING *`,
      [updatedBy, id],
    );

    return rowToAppointment(updated[0] as Record<string, unknown>);
  });
}

// ---------------------------------------------------------------------------
// hardDeleteAppointment (Feature 5 — secure delete with audit)
// ---------------------------------------------------------------------------
export async function hardDeleteAppointment(
  id: string,
  deletedBy: string,
  reason: string,
  ipAddress: string | undefined,
  branchId: number,
): Promise<void> {
  return withTransaction(async (client: PoolClient) => {
    const { rows } = await client.query(
      `SELECT id, status, branch_id FROM appointments WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [id],
    );

    if (!rows.length) {
      throw Object.assign(new Error('Appointment not found'), { code: 'APPOINTMENT_NOT_FOUND', statusCode: 404 });
    }

    if ((rows[0] as Record<string, unknown>).status === 'Comp.') {
      throw Object.assign(
        new Error('Completed appointments cannot be deleted'),
        { code: 'APPOINTMENT_COMPLETED', statusCode: 422 },
      );
    }

    // Write audit log BEFORE delete
    await client.query(
      `INSERT INTO deletion_audit_log (record_type, record_id, deleted_by, deletion_reason, ip_address, branch_id)
       VALUES ('appointment', $1, $2, $3, $4, $5)`,
      [id, deletedBy, reason, ipAddress ?? null, branchId],
    );

    // Hard delete
    await client.query(`DELETE FROM appointments WHERE id = $1`, [id]);
  });
}

// ---------------------------------------------------------------------------
// softDeleteAppointment (kept for backward compat)
// ---------------------------------------------------------------------------
export async function softDeleteAppointment(id: string, deletedBy: string): Promise<void> {
  const result = await rlsQuery(
    `UPDATE appointments SET deleted_at = NOW(), updated_by = $2
      WHERE id = $1 AND deleted_at IS NULL AND status != 'Comp.'`,
    [id, deletedBy],
  );
  if (result.rowCount === 0) {
    // Either not found or completed — either way, nothing to soft-delete
  }
}

// ---------------------------------------------------------------------------
// cascadeSoftDeleteFromBilling — only soft-deletes if status is safe (TBC/Ok!/Conf.)
// Silently skips completed, cancelled, or already-deleted appointments.
// ---------------------------------------------------------------------------
const BILLING_CASCADE_SAFE = new Set(['TBC', 'Ok!', 'Conf.']);

// ---------------------------------------------------------------------------
// getDoctorsOnDate — lightweight: returns doctorId + appointment count for a date
// Used by room assignment to filter to doctors with actual appointments
// ---------------------------------------------------------------------------
export async function getDoctorsOnDate(date: string): Promise<{ doctorId: string; appointmentCount: number }[]> {
  return withRlsContext(async (client) => {
    const { rows } = await client.query(
      `SELECT doctor_id, COUNT(*)::int AS appointment_count
         FROM appointments
        WHERE appointment_date = $1
          AND deleted_at IS NULL
          AND status NOT IN ('Canc.', 'Resch.')
        GROUP BY doctor_id
        ORDER BY appointment_count DESC`,
      [date],
    );
    return (rows as { doctor_id: string; appointment_count: number }[]).map((r) => ({
      doctorId: r.doctor_id,
      appointmentCount: r.appointment_count,
    }));
  });
}

export async function cascadeSoftDeleteFromBilling(id: string, deletedBy: string): Promise<'deleted' | 'skipped'> {
  const result = await rlsQuery(
    `UPDATE appointments
        SET deleted_at = NOW(), updated_by = $2
      WHERE id = $1
        AND deleted_at IS NULL
        AND status = ANY($3::text[])
     RETURNING id`,
    [id, deletedBy, [...BILLING_CASCADE_SAFE]],
  );
  return result.rowCount! > 0 ? 'deleted' : 'skipped';
}
