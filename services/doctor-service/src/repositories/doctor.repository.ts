import { PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import type {
  Doctor,
  DoctorSchedule,
  DoctorScheduleOverride,
  Specialty,
  PaginatedResponse,
} from '@fadl/types';
import { withRlsContext, withTransaction, rlsQuery } from '../config/database';
import { setCompensation } from '../clients/billing';

// ---------------------------------------------------------------------------
// Row mapping helpers
// ---------------------------------------------------------------------------

function rowToDoctor(row: Record<string, unknown>): Doctor {
  const rawSplits = row.revenue_splits;
  const revenueSplits =
    typeof rawSplits === 'string'
      ? (JSON.parse(rawSplits) as Doctor['revenueSplits'])
      : (rawSplits as Doctor['revenueSplits']);

  return {
    id: row.id as string,
    mobile: row.mobile as string,
    nameEn: row.name_en as string,
    nameAr: row.name_ar as string | undefined,
    specialtyId: row.specialty_id as number,
    secondarySpecialtyIds: (row.secondary_specialty_ids as number[]) ?? [],
    subSpecialty: row.sub_specialty as string | undefined,
    subSpecialtyIds: (() => {
      const raw = row.sub_specialty_ids;
      if (!raw) return undefined;
      return (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, string[]>;
    })(),
    isOnlineDoctor: row.is_online_doctor as boolean,
    revenueSplits,
    paymentMethod: row.payment_method as Doctor['paymentMethod'],
    allowOverbooking: row.allow_overbooking as boolean,
    overbookingBufferPercentage: row.overbooking_buffer_percentage as number,
    isActive: row.is_active as boolean,
    deletedAt: row.deleted_at ? (row.deleted_at as Date).toISOString() : undefined,
    version: row.version as number,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
    branchId: row.branch_id as number,
  };
}

function rowToSchedule(row: Record<string, unknown>): DoctorSchedule {
  return {
    id: row.id as string,
    doctorId: row.doctor_id as string,
    dayOfWeek: row.day_of_week as DoctorSchedule['dayOfWeek'],
    // Postgres TIME comes back as 'HH:MM:SS' — the UI works in 'HH:MM'.
    startTime: (row.start_time as string)?.slice(0, 5),
    endTime: (row.end_time as string)?.slice(0, 5),
    slotDurationMinutes: row.slot_duration_minutes as number,
    isActive: row.is_active as boolean,
    validFrom: row.valid_from
      ? (row.valid_from as Date).toISOString().split('T')[0]
      : (row.valid_from as string),
    validUntil: row.valid_until
      ? (row.valid_until as Date).toISOString().split('T')[0]
      : undefined,
    branchId: row.branch_id as number,
  };
}

function rowToOverride(row: Record<string, unknown>): DoctorScheduleOverride {
  return {
    id: row.id as string,
    doctorId: row.doctor_id as string,
    overrideDate: row.override_date
      ? (row.override_date as Date).toISOString().split('T')[0]
      : (row.override_date as string),
    overrideType: row.override_type as DoctorScheduleOverride['overrideType'],
    customStartTime: row.custom_start_time as string | undefined,
    customEndTime: row.custom_end_time as string | undefined,
    reason: row.reason as string | undefined,
    notifyPatients: row.notify_patients as boolean,
    createdAt: (row.created_at as Date).toISOString(),
    createdBy: row.created_by as string | undefined,
  };
}

// ---------------------------------------------------------------------------
// Doctor queries
// ---------------------------------------------------------------------------

export async function findDoctorById(id: string): Promise<Doctor | null> {
  return withRlsContext(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM doctors WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return rows.length ? rowToDoctor(rows[0] as Record<string, unknown>) : null;
  });
}

export async function listDoctors(params: {
  specialtyId?: number;
  isActive?: boolean;
  isOnlineDoctor?: boolean;
  page: number;
  limit: number;
}): Promise<PaginatedResponse<Doctor>> {
  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 20, 100);
  const offset = (page - 1) * limit;

  return withRlsContext(async (client) => {
    const conditions: string[] = ['deleted_at IS NULL'];
    const values: unknown[] = [];
    let idx = 1;

    if (params.specialtyId !== undefined) {
      conditions.push(`specialty_id = $${idx++}`);
      values.push(params.specialtyId);
    }

    if (params.isActive !== undefined) {
      conditions.push(`is_active = $${idx++}`);
      values.push(params.isActive);
    }

    if (params.isOnlineDoctor !== undefined) {
      conditions.push(`is_online_doctor = $${idx++}`);
      values.push(params.isOnlineDoctor);
    }

    const where = conditions.join(' AND ');

    const [{ rows: countRows }, { rows: dataRows }] = await Promise.all([
      client.query(`SELECT COUNT(*)::int AS total FROM doctors WHERE ${where}`, values),
      client.query(
        `SELECT * FROM doctors WHERE ${where} ORDER BY name_en LIMIT $${idx++} OFFSET $${idx++}`,
        [...values, limit, offset],
      ),
    ]);

    const total = (countRows[0] as { total: number }).total;

    return {
      data: dataRows.map((r) => rowToDoctor(r as Record<string, unknown>)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  });
}

export async function createDoctor(
  input: {
    mobile: string;
    nameEn: string;
    nameAr?: string;
    specialtyId: number;
    secondarySpecialtyIds?: number[];
    subSpecialty?: string;
    subSpecialtyIds?: Record<string, string[]>;
    isOnlineDoctor: boolean;
    revenueSplits: Doctor['revenueSplits'];
    paymentMethod?: Doctor['paymentMethod'];
    allowOverbooking: boolean;
    overbookingBufferPercentage: number;
  },
  createdBy: string,
  branchId: number,
): Promise<Doctor> {
  return withTransaction(async (client: PoolClient) => {
    const id = uuidv4();
    const { rows } = await client.query(
      `INSERT INTO doctors (
        id, mobile, name_en, name_ar, specialty_id, secondary_specialty_ids, sub_specialty,
        sub_specialty_ids, is_online_doctor, revenue_splits, payment_method,
        allow_overbooking, overbooking_buffer_percentage,
        created_by, branch_id
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15
      ) RETURNING *`,
      [
        id,
        input.mobile,
        input.nameEn,
        input.nameAr ?? null,
        input.specialtyId,
        input.secondarySpecialtyIds ?? [],
        input.subSpecialty ?? null,
        JSON.stringify(input.subSpecialtyIds ?? {}),
        input.isOnlineDoctor,
        JSON.stringify(input.revenueSplits),
        input.paymentMethod ?? null,
        input.allowOverbooking,
        input.overbookingBufferPercentage,
        createdBy,
        branchId,
      ],
    );
    const doctor = rowToDoctor(rows[0] as Record<string, unknown>);

    if (input.revenueSplits) {
      const splits = input.revenueSplits;
      await Promise.allSettled([
        setCompensation(id, 'consultation', splits.consultation.doctorPercentage, splits.consultation.clinicPercentage, false),
        setCompensation(id, 'operative',    splits.operative.doctorPercentage,    splits.operative.clinicPercentage,    false),
        setCompensation(id, 'online',       splits.online.doctorPercentage,       splits.online.clinicPercentage,       false),
      ]);
    }

    return doctor;
  });
}

export async function updateDoctor(
  id: string,
  input: Partial<{
    mobile: string;
    nameEn: string;
    nameAr?: string;
    specialtyId: number;
    secondarySpecialtyIds?: number[];
    subSpecialty?: string;
    subSpecialtyIds?: Record<string, string[]>;
    isOnlineDoctor: boolean;
    revenueSplits: Doctor['revenueSplits'];
    paymentMethod?: Doctor['paymentMethod'];
    allowOverbooking: boolean;
    overbookingBufferPercentage: number;
    version: number;
  }>,
  updatedBy: string,
): Promise<Doctor> {
  return withTransaction(async (client: PoolClient) => {
    const { rows: existing } = await client.query(
      `SELECT version FROM doctors WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [id],
    );

    if (!existing.length) {
      throw Object.assign(new Error('Doctor not found'), { code: 'DOCTOR_NOT_FOUND', statusCode: 404 });
    }

    const currentVersion = (existing[0] as { version: number }).version;
    if (input.version !== undefined && currentVersion !== input.version) {
      throw Object.assign(new Error('Conflict: doctor was modified by another request'), {
        code: 'VERSION_CONFLICT',
        statusCode: 409,
      });
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const updatable: Array<[string, string, boolean]> = [
      ['mobile', 'mobile', false],
      ['nameEn', 'name_en', false],
      ['nameAr', 'name_ar', false],
      ['specialtyId', 'specialty_id', false],
      ['secondarySpecialtyIds', 'secondary_specialty_ids', false],
      ['subSpecialty', 'sub_specialty', false],
      ['isOnlineDoctor', 'is_online_doctor', false],
      ['paymentMethod', 'payment_method', false],
      ['allowOverbooking', 'allow_overbooking', false],
      ['overbookingBufferPercentage', 'overbooking_buffer_percentage', false],
    ];

    for (const [key, col] of updatable) {
      if (key in input && key !== 'version') {
        fields.push(`${col} = $${idx++}`);
        values.push((input as Record<string, unknown>)[key] ?? null);
      }
    }

    if ('revenueSplits' in input && input.revenueSplits !== undefined) {
      fields.push(`revenue_splits = $${idx++}`);
      values.push(JSON.stringify(input.revenueSplits));
    }

    if ('subSpecialtyIds' in input && input.subSpecialtyIds !== undefined) {
      fields.push(`sub_specialty_ids = $${idx++}`);
      values.push(JSON.stringify(input.subSpecialtyIds));
    }

    fields.push(`version = $${idx++}`, `updated_at = NOW()`, `updated_by = $${idx++}`);
    values.push(currentVersion + 1, updatedBy, id);

    const { rows } = await client.query(
      `UPDATE doctors SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );

    const doctor = rowToDoctor(rows[0] as Record<string, unknown>);

    if ('revenueSplits' in input && input.revenueSplits !== undefined) {
      const splits = input.revenueSplits;
      await Promise.allSettled([
        setCompensation(id, 'consultation', splits.consultation.doctorPercentage, splits.consultation.clinicPercentage),
        setCompensation(id, 'operative',    splits.operative.doctorPercentage,    splits.operative.clinicPercentage),
        setCompensation(id, 'online',       splits.online.doctorPercentage,       splits.online.clinicPercentage),
      ]);
    }

    return doctor;
  });
}

export async function toggleDoctorActive(
  id: string,
  isActive: boolean,
  updatedBy: string,
): Promise<Doctor> {
  return withTransaction(async (client: PoolClient) => {
    const { rows: existing } = await client.query(
      `SELECT version FROM doctors WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [id],
    );

    if (!existing.length) {
      throw Object.assign(new Error('Doctor not found'), { code: 'DOCTOR_NOT_FOUND', statusCode: 404 });
    }

    const currentVersion = (existing[0] as { version: number }).version;

    const { rows } = await client.query(
      `UPDATE doctors SET is_active = $1, version = $2, updated_at = NOW(), updated_by = $3
       WHERE id = $4 RETURNING *`,
      [isActive, currentVersion + 1, updatedBy, id],
    );

    return rowToDoctor(rows[0] as Record<string, unknown>);
  });
}

export async function softDeleteDoctor(id: string, deletedBy: string): Promise<void> {
  const result = await rlsQuery(
    `UPDATE doctors SET deleted_at = NOW(), updated_by = $2 WHERE id = $1 AND deleted_at IS NULL`,
    [id, deletedBy],
  );
  if (result.rowCount === 0) {
    throw Object.assign(new Error('Doctor not found'), { code: 'DOCTOR_NOT_FOUND', statusCode: 404 });
  }
}

// ---------------------------------------------------------------------------
// Schedule queries
// ---------------------------------------------------------------------------

// Returns every block (active + disabled) so the management UI can show
// turned-off days and re-enable them. Consumers that only want live hours
// filter on isActive themselves.
export async function findSchedulesByDoctorId(doctorId: string): Promise<DoctorSchedule[]> {
  return withRlsContext(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM doctor_schedules WHERE doctor_id = $1 ORDER BY day_of_week, start_time`,
      [doctorId],
    );
    return rows.map((r) => rowToSchedule(r as Record<string, unknown>));
  });
}

interface ScheduleBlockInput {
  dayOfWeek: DoctorSchedule['dayOfWeek'];
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
  validFrom: string;
  validUntil?: string;
}

const overlapError = () =>
  Object.assign(new Error('This time range overlaps an existing block on that day'), {
    code: 'SCHEDULE_OVERLAP',
    statusCode: 409,
  });

// Any ACTIVE block on the same weekday whose range intersects [start,end).
// excludeId skips the row being edited. Half-open: touching ranges don't clash.
async function hasOverlap(
  client: PoolClient,
  doctorId: string,
  dayOfWeek: number,
  startTime: string,
  endTime: string,
  excludeId: string | null,
): Promise<boolean> {
  const { rows } = await client.query(
    `SELECT 1 FROM doctor_schedules
      WHERE doctor_id = $1 AND day_of_week = $2 AND is_active = TRUE
        AND ($5::uuid IS NULL OR id <> $5)
        AND start_time < $4::time AND end_time > $3::time
      LIMIT 1`,
    [doctorId, dayOfWeek, startTime, endTime, excludeId],
  );
  return rows.length > 0;
}

export async function createScheduleBlock(
  doctorId: string,
  input: ScheduleBlockInput,
  branchId: number,
): Promise<DoctorSchedule> {
  return withTransaction(async (client: PoolClient) => {
    if (await hasOverlap(client, doctorId, input.dayOfWeek, input.startTime, input.endTime, null)) {
      throw overlapError();
    }
    const { rows } = await client.query(
      `INSERT INTO doctor_schedules (
        id, doctor_id, day_of_week, start_time, end_time,
        slot_duration_minutes, is_active, valid_from, valid_until, branch_id
      ) VALUES ($1,$2,$3,$4,$5,$6,TRUE,$7,$8,$9) RETURNING *`,
      [
        uuidv4(),
        doctorId,
        input.dayOfWeek,
        input.startTime,
        input.endTime,
        input.slotDurationMinutes,
        input.validFrom,
        input.validUntil ?? null,
        branchId,
      ],
    );
    return rowToSchedule(rows[0] as Record<string, unknown>);
  });
}

export async function updateScheduleBlock(
  doctorId: string,
  scheduleId: string,
  input: ScheduleBlockInput,
): Promise<DoctorSchedule> {
  return withTransaction(async (client: PoolClient) => {
    if (await hasOverlap(client, doctorId, input.dayOfWeek, input.startTime, input.endTime, scheduleId)) {
      throw overlapError();
    }
    const { rows } = await client.query(
      `UPDATE doctor_schedules SET
         day_of_week = $3,
         start_time = $4,
         end_time = $5,
         slot_duration_minutes = $6,
         valid_from = $7,
         valid_until = $8,
         is_active = TRUE
       WHERE id = $1 AND doctor_id = $2
       RETURNING *`,
      [
        scheduleId,
        doctorId,
        input.dayOfWeek,
        input.startTime,
        input.endTime,
        input.slotDurationMinutes,
        input.validFrom,
        input.validUntil ?? null,
      ],
    );
    if (!rows.length) {
      throw Object.assign(new Error('Schedule block not found'), { code: 'SCHEDULE_NOT_FOUND', statusCode: 404 });
    }
    return rowToSchedule(rows[0] as Record<string, unknown>);
  });
}

export async function deleteScheduleBlock(doctorId: string, scheduleId: string): Promise<void> {
  await withTransaction(async (client: PoolClient) => {
    const { rowCount } = await client.query(
      `DELETE FROM doctor_schedules WHERE id = $1 AND doctor_id = $2`,
      [scheduleId, doctorId],
    );
    if (!rowCount) {
      throw Object.assign(new Error('Schedule block not found'), { code: 'SCHEDULE_NOT_FOUND', statusCode: 404 });
    }
  });
}

// Enable/disable every block on a weekday at once (the per-day toggle).
export async function setDayActive(
  doctorId: string,
  dayOfWeek: number,
  isActive: boolean,
): Promise<DoctorSchedule[]> {
  return withTransaction(async (client: PoolClient) => {
    try {
      await client.query(
        `UPDATE doctor_schedules SET is_active = $3
          WHERE doctor_id = $1 AND day_of_week = $2`,
        [doctorId, dayOfWeek, isActive],
      );
    } catch (err) {
      // Re-enabling a day whose blocks overlap trips the exclusion constraint.
      if ((err as { code?: string }).code === '23P01') throw overlapError();
      throw err;
    }
    const { rows } = await client.query(
      `SELECT * FROM doctor_schedules WHERE doctor_id = $1 ORDER BY day_of_week, start_time`,
      [doctorId],
    );
    return rows.map((r) => rowToSchedule(r as Record<string, unknown>));
  });
}

// ---------------------------------------------------------------------------
// Schedule override queries
// ---------------------------------------------------------------------------

export async function createScheduleOverride(
  doctorId: string,
  input: {
    overrideDate: string;
    overrideType: DoctorScheduleOverride['overrideType'];
    customStartTime?: string;
    customEndTime?: string;
    reason?: string;
    notifyPatients: boolean;
  },
  createdBy: string,
  branchId: number,
): Promise<DoctorScheduleOverride> {
  return withTransaction(async (client: PoolClient) => {
    const id = uuidv4();
    const { rows } = await client.query(
      `INSERT INTO doctor_schedule_overrides (
        id, doctor_id, override_date, override_type,
        custom_start_time, custom_end_time, reason, notify_patients,
        created_by, branch_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        id,
        doctorId,
        input.overrideDate,
        input.overrideType,
        input.customStartTime ?? null,
        input.customEndTime ?? null,
        input.reason ?? null,
        input.notifyPatients,
        createdBy,
        branchId,
      ],
    );
    return rowToOverride(rows[0] as Record<string, unknown>);
  });
}

export async function findOverridesByDoctorId(
  doctorId: string,
  fromDate?: string,
): Promise<DoctorScheduleOverride[]> {
  const { rows } = await rlsQuery(
    `SELECT * FROM doctor_schedule_overrides
     WHERE doctor_id = $1 ${fromDate ? 'AND override_date >= $2' : ''}
     ORDER BY override_date ASC`,
    fromDate ? [doctorId, fromDate] : [doctorId],
  );
  return rows.map((r) => rowToOverride(r as Record<string, unknown>));
}

// ---------------------------------------------------------------------------
// Specialty queries
// ---------------------------------------------------------------------------

export async function listSpecialties(): Promise<Specialty[]> {
  const { rows } = await rlsQuery(
    `SELECT * FROM specialties WHERE is_active = TRUE ORDER BY name_en`,
  );
  return rows.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: row.id as number,
      code: row.code as string,
      nameEn: row.name_en as string,
      nameAr: row.name_ar as string,
      category: row.category as string | undefined,
      isActive: row.is_active as boolean,
    };
  });
}
