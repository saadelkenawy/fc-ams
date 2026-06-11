import { PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import type {
  DoctorConsultationHours,
  DoctorStatus,
  DoctorStatusLog,
  DoctorDayOverride,
  DoctorAvailability,
  DoctorAvailabilitySlot,
} from '@fadl/types';
import { withRlsContext, withTransaction, rlsQuery } from '../config/database';

// ── Row mappers ──────────────────────────────────────────────────────────────

function rowToConsultHours(r: Record<string, unknown>): DoctorConsultationHours {
  return {
    id: r.id as string,
    doctorId: r.doctor_id as string,
    dayOfWeek: r.day_of_week as DoctorConsultationHours['dayOfWeek'],
    startTime: r.start_time as string,
    endTime: r.end_time as string,
    slotDurationMins: r.slot_duration_mins as number,
    maxPatients: r.max_patients as number,
    isActive: r.is_active as boolean,
    branchId: r.branch_id as number,
    createdAt: (r.created_at as Date).toISOString(),
    updatedAt: (r.updated_at as Date).toISOString(),
  };
}

function rowToStatusLog(r: Record<string, unknown>): DoctorStatusLog {
  return {
    id: r.id as string,
    doctorId: r.doctor_id as string,
    previousStatus: r.previous_status as DoctorStatus | undefined,
    newStatus: r.new_status as DoctorStatus,
    note: r.note as string | undefined,
    changedBy: r.changed_by as string | undefined,
    changedAt: (r.changed_at as Date).toISOString(),
    branchId: r.branch_id as number,
  };
}

function rowToDayOverride(r: Record<string, unknown>): DoctorDayOverride {
  return {
    id: r.id as string,
    doctorId: r.doctor_id as string,
    overrideDate: (r.override_date as Date).toISOString().split('T')[0],
    isWorking: r.is_working as boolean,
    startTime: r.start_time as string | undefined,
    endTime: r.end_time as string | undefined,
    maxPatients: r.max_patients as number | undefined,
    reason: r.reason as string | undefined,
    createdBy: r.created_by as string | undefined,
    createdAt: (r.created_at as Date).toISOString(),
    branchId: r.branch_id as number,
  };
}

// ── Consultation Hours ───────────────────────────────────────────────────────

export async function findConsultHours(doctorId: string): Promise<DoctorConsultationHours[]> {
  return withRlsContext(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM doctor_consultation_hours
       WHERE doctor_id = $1 AND is_active = TRUE ORDER BY day_of_week`,
      [doctorId],
    );
    return rows.map((r) => rowToConsultHours(r as Record<string, unknown>));
  });
}

export async function upsertConsultHours(
  doctorId: string,
  input: {
    dayOfWeek: DoctorConsultationHours['dayOfWeek'];
    startTime: string;
    endTime: string;
    slotDurationMins: number;
    maxPatients: number;
  },
  branchId: number,
): Promise<DoctorConsultationHours> {
  return withTransaction(async (client: PoolClient) => {
    const id = uuidv4();
    const { rows } = await client.query(
      `INSERT INTO doctor_consultation_hours
         (id, doctor_id, day_of_week, start_time, end_time, slot_duration_mins, max_patients, branch_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (doctor_id, day_of_week) DO UPDATE SET
         start_time        = EXCLUDED.start_time,
         end_time          = EXCLUDED.end_time,
         slot_duration_mins = EXCLUDED.slot_duration_mins,
         max_patients      = EXCLUDED.max_patients,
         is_active         = TRUE,
         updated_at        = NOW()
       RETURNING *`,
      [id, doctorId, input.dayOfWeek, input.startTime, input.endTime, input.slotDurationMins, input.maxPatients, branchId],
    );
    return rowToConsultHours(rows[0] as Record<string, unknown>);
  });
}

export async function upsertConsultHoursBulk(
  doctorId: string,
  hours: Array<{
    dayOfWeek: DoctorConsultationHours['dayOfWeek'];
    startTime: string;
    endTime: string;
    slotDurationMins: number;
    maxPatients: number;
  }>,
  branchId: number,
): Promise<DoctorConsultationHours[]> {
  return withTransaction(async (client: PoolClient) => {
    const results: DoctorConsultationHours[] = [];
    for (const h of hours) {
      const id = uuidv4();
      const { rows } = await client.query(
        `INSERT INTO doctor_consultation_hours
           (id, doctor_id, day_of_week, start_time, end_time, slot_duration_mins, max_patients, branch_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (doctor_id, day_of_week) DO UPDATE SET
           start_time        = EXCLUDED.start_time,
           end_time          = EXCLUDED.end_time,
           slot_duration_mins = EXCLUDED.slot_duration_mins,
           max_patients      = EXCLUDED.max_patients,
           is_active         = TRUE,
           updated_at        = NOW()
         RETURNING *`,
        [id, doctorId, h.dayOfWeek, h.startTime, h.endTime, h.slotDurationMins, h.maxPatients, branchId],
      );
      results.push(rowToConsultHours(rows[0] as Record<string, unknown>));
    }
    return results;
  });
}

export async function deleteConsultHoursForDay(
  doctorId: string,
  dayOfWeek: number,
): Promise<void> {
  await rlsQuery(
    `UPDATE doctor_consultation_hours SET is_active = FALSE, updated_at = NOW()
     WHERE doctor_id = $1 AND day_of_week = $2`,
    [doctorId, dayOfWeek],
  );
}

// ── Doctor Status ────────────────────────────────────────────────────────────

export async function getStatus(doctorId: string): Promise<{ status: DoctorStatus; statusNote?: string; statusUpdatedAt: string } | null> {
  return withRlsContext(async (client) => {
    const { rows } = await client.query(
      `SELECT current_status, status_note, status_updated_at FROM doctors WHERE id = $1 AND deleted_at IS NULL`,
      [doctorId],
    );
    if (!rows.length) return null;
    const r = rows[0] as Record<string, unknown>;
    return {
      status: r.current_status as DoctorStatus,
      statusNote: r.status_note as string | undefined,
      statusUpdatedAt: (r.status_updated_at as Date).toISOString(),
    };
  });
}

export async function updateStatus(
  doctorId: string,
  newStatus: DoctorStatus,
  changedBy: string,
  branchId: number,
  note?: string,
): Promise<DoctorStatusLog> {
  return withTransaction(async (client: PoolClient) => {
    const { rows: existing } = await client.query(
      `SELECT current_status FROM doctors WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [doctorId],
    );
    if (!existing.length) {
      throw Object.assign(new Error('Doctor not found'), { code: 'DOCTOR_NOT_FOUND', statusCode: 404 });
    }

    const previousStatus = (existing[0] as Record<string, unknown>).current_status as DoctorStatus;

    await client.query(
      `UPDATE doctors SET current_status = $1, status_note = $2, status_updated_at = NOW(), updated_at = NOW()
       WHERE id = $3`,
      [newStatus, note ?? null, doctorId],
    );

    const logId = uuidv4();
    const { rows } = await client.query(
      `INSERT INTO doctor_status_log
         (id, doctor_id, previous_status, new_status, note, changed_by, branch_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [logId, doctorId, previousStatus, newStatus, note ?? null, changedBy, branchId],
    );

    return rowToStatusLog(rows[0] as Record<string, unknown>);
  });
}

export async function getStatusHistory(doctorId: string, limit = 50): Promise<DoctorStatusLog[]> {
  return withRlsContext(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM doctor_status_log WHERE doctor_id = $1 ORDER BY changed_at DESC LIMIT $2`,
      [doctorId, limit],
    );
    return rows.map((r) => rowToStatusLog(r as Record<string, unknown>));
  });
}

// ── Day Overrides ────────────────────────────────────────────────────────────

export async function findDayOverrides(doctorId: string, fromDate?: string): Promise<DoctorDayOverride[]> {
  return withRlsContext(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM doctor_day_overrides WHERE doctor_id = $1
       ${fromDate ? 'AND override_date >= $2' : ''}
       ORDER BY override_date`,
      fromDate ? [doctorId, fromDate] : [doctorId],
    );
    return rows.map((r) => rowToDayOverride(r as Record<string, unknown>));
  });
}

export async function upsertDayOverride(
  doctorId: string,
  input: {
    overrideDate: string;
    isWorking: boolean;
    startTime?: string;
    endTime?: string;
    maxPatients?: number;
    reason?: string;
  },
  createdBy: string,
  branchId: number,
): Promise<DoctorDayOverride> {
  return withTransaction(async (client: PoolClient) => {
    const id = uuidv4();
    const { rows } = await client.query(
      `INSERT INTO doctor_day_overrides
         (id, doctor_id, override_date, is_working, start_time, end_time, max_patients, reason, created_by, branch_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (doctor_id, override_date) DO UPDATE SET
         is_working   = EXCLUDED.is_working,
         start_time   = EXCLUDED.start_time,
         end_time     = EXCLUDED.end_time,
         max_patients = EXCLUDED.max_patients,
         reason       = EXCLUDED.reason
       RETURNING *`,
      [id, doctorId, input.overrideDate, input.isWorking, input.startTime ?? null, input.endTime ?? null, input.maxPatients ?? null, input.reason ?? null, createdBy, branchId],
    );
    return rowToDayOverride(rows[0] as Record<string, unknown>);
  });
}

// ── Availability Calculation ─────────────────────────────────────────────────

export async function getDoctorAvailability(
  doctorId: string,
  date: string,
  branchId: number,
): Promise<DoctorAvailability> {
  return withRlsContext(async (client) => {
    const d = new Date(date);
    const dayOfWeek = d.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;

    // Check day override first
    const { rows: overrides } = await client.query(
      `SELECT * FROM doctor_day_overrides WHERE doctor_id = $1 AND override_date = $2`,
      [doctorId, date],
    );

    let startTime: string | null = null;
    let endTime: string | null = null;
    let maxPatients = 20;
    let isWorking = false;

    if (overrides.length) {
      const ov = overrides[0] as Record<string, unknown>;
      isWorking = ov.is_working as boolean;
      if (isWorking) {
        startTime = ov.start_time as string | null;
        endTime = ov.end_time as string | null;
        maxPatients = (ov.max_patients as number) ?? 20;
      }
    } else {
      // Fall back to regular consultation hours
      const { rows: hours } = await client.query(
        `SELECT * FROM doctor_consultation_hours
         WHERE doctor_id = $1 AND day_of_week = $2 AND is_active = TRUE`,
        [doctorId, dayOfWeek],
      );
      if (hours.length) {
        const h = hours[0] as Record<string, unknown>;
        isWorking = true;
        startTime = h.start_time as string;
        endTime = h.end_time as string;
        maxPatients = h.max_patients as number;
      }
    }

    if (!isWorking || !startTime || !endTime) {
      return { doctorId, date, isWorking: false, slots: [], totalSlots: 0, bookedSlots: 0, maxPatients: 0 };
    }

    // Get booked appointments for this doctor on this date
    const { rows: booked } = await client.query(
      `SELECT start_time FROM appointments
       WHERE doctor_id = $1 AND appointment_date = $2
         AND status NOT IN ('Canc.', 'Resch.') AND deleted_at IS NULL`,
      [doctorId, date],
    );

    const bookedTimes = new Set(booked.map((r) => {
      const row = r as Record<string, unknown>;
      const t = row.start_time as string;
      return t.substring(0, 5); // HH:MM
    }));

    // Generate slots
    const slots: DoctorAvailabilitySlot[] = [];
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    // Get slot duration from consultation hours or default 15
    const { rows: consultRows } = await client.query(
      `SELECT slot_duration_mins FROM doctor_consultation_hours
       WHERE doctor_id = $1 AND day_of_week = $2 AND is_active = TRUE`,
      [doctorId, dayOfWeek],
    );
    const slotDuration = consultRows.length
      ? (consultRows[0] as Record<string, unknown>).slot_duration_mins as number
      : 15;

    for (let m = startMinutes; m < endMinutes; m += slotDuration) {
      const hh = String(Math.floor(m / 60)).padStart(2, '0');
      const mm = String(m % 60).padStart(2, '0');
      const time = `${hh}:${mm}`;
      slots.push({ time, available: !bookedTimes.has(time) });
    }

    return {
      doctorId,
      date,
      isWorking: true,
      slots,
      totalSlots: slots.length,
      bookedSlots: bookedTimes.size,
      maxPatients,
    };
  });
}
