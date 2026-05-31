import { PoolClient } from 'pg';
import { withRlsContext, withTransaction } from '../config/database';

export interface Encounter {
  id: string;
  patientId: string;
  appointmentId?: string;
  doctorId: string;
  specialtyId?: number;
  encounterDate: string;
  encounterType: 'outpatient' | 'inpatient' | 'emergency' | 'telehealth' | 'follow_up';
  status: 'draft' | 'in_progress' | 'completed' | 'signed_off';
  chiefComplaint?: string;
  historyOfPresentIllness?: string;
  diagnosisPrimary?: string;
  diagnosisSecondary: unknown[];
  clinicalNotes?: string;
  vitalSigns: Record<string, unknown>;
  prescriptions: unknown[];
  labOrders: unknown[];
  followUpDate?: string;
  followUpNotes?: string;
  signedOffBy?: string;
  signedOffAt?: string;
  version: number;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  branchId: number;
}

export interface CreateEncounterInput {
  patientId: string;
  appointmentId?: string;
  doctorId: string;
  specialtyId?: number;
  encounterDate?: string;
  encounterType?: Encounter['encounterType'];
  chiefComplaint?: string;
}

export interface UpdateEncounterInput {
  version: number;
  chiefComplaint?: string;
  historyOfPresentIllness?: string;
  diagnosisPrimary?: string;
  diagnosisSecondary?: unknown[];
  clinicalNotes?: string;
  vitalSigns?: Record<string, unknown>;
  prescriptions?: unknown[];
  labOrders?: unknown[];
  followUpDate?: string;
  followUpNotes?: string;
  status?: Encounter['status'];
}

export interface ListEncountersParams {
  patientId?: string;
  doctorId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  page: number;
  limit: number;
}

export interface PaginatedEncounters {
  data: Encounter[];
  total: number;
  page: number;
  limit: number;
}

function rowToEncounter(row: Record<string, unknown>): Encounter {
  return {
    id: row.id as string,
    patientId: row.patient_id as string,
    appointmentId: row.appointment_id as string | undefined,
    doctorId: row.doctor_id as string,
    specialtyId: row.specialty_id as number | undefined,
    encounterDate: row.encounter_date instanceof Date
      ? row.encounter_date.toISOString().split('T')[0]
      : (row.encounter_date as string),
    encounterType: row.encounter_type as Encounter['encounterType'],
    status: row.status as Encounter['status'],
    chiefComplaint: row.chief_complaint as string | undefined,
    historyOfPresentIllness: row.history_of_present_illness as string | undefined,
    diagnosisPrimary: row.diagnosis_primary as string | undefined,
    diagnosisSecondary: (row.diagnosis_secondary as unknown[]) ?? [],
    clinicalNotes: row.clinical_notes as string | undefined,
    vitalSigns: (row.vital_signs as Record<string, unknown>) ?? {},
    prescriptions: (row.prescriptions as unknown[]) ?? [],
    labOrders: (row.lab_orders as unknown[]) ?? [],
    followUpDate: row.follow_up_date instanceof Date
      ? row.follow_up_date.toISOString().split('T')[0]
      : (row.follow_up_date as string | undefined),
    followUpNotes: row.follow_up_notes as string | undefined,
    signedOffBy: row.signed_off_by as string | undefined,
    signedOffAt: row.signed_off_at instanceof Date
      ? row.signed_off_at.toISOString()
      : (row.signed_off_at as string | undefined),
    version: row.version as number,
    createdBy: row.created_by as string | undefined,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
    branchId: row.branch_id as number,
  };
}

export async function findEncounterById(id: string): Promise<Encounter | null> {
  return withRlsContext(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM encounters WHERE id = $1`,
      [id],
    );
    return rows.length ? rowToEncounter(rows[0] as Record<string, unknown>) : null;
  });
}

export async function listEncounters(params: ListEncountersParams): Promise<PaginatedEncounters> {
  const page = Math.max(params.page, 1);
  const limit = Math.min(params.limit, 100);
  const offset = (page - 1) * limit;

  return withRlsContext(async (client) => {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (params.patientId) {
      conditions.push(`patient_id = $${idx++}`);
      values.push(params.patientId);
    }
    if (params.doctorId) {
      conditions.push(`doctor_id = $${idx++}`);
      values.push(params.doctorId);
    }
    if (params.status) {
      conditions.push(`status = $${idx++}`);
      values.push(params.status);
    }
    if (params.dateFrom) {
      conditions.push(`encounter_date >= $${idx++}`);
      values.push(params.dateFrom);
    }
    if (params.dateTo) {
      conditions.push(`encounter_date <= $${idx++}`);
      values.push(params.dateTo);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [{ rows: countRows }, { rows: dataRows }] = await Promise.all([
      client.query(`SELECT COUNT(*)::int AS total FROM encounters ${where}`, values),
      client.query(
        `SELECT * FROM encounters ${where} ORDER BY encounter_date DESC, created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
        [...values, limit, offset],
      ),
    ]);

    const total = (countRows[0] as { total: number }).total;
    return {
      data: dataRows.map((r) => rowToEncounter(r as Record<string, unknown>)),
      total,
      page,
      limit,
    };
  });
}

export async function createEncounter(
  input: CreateEncounterInput,
  createdBy: string,
): Promise<Encounter> {
  return withTransaction(async (client: PoolClient) => {
    const { rows } = await client.query(
      `INSERT INTO encounters (
        patient_id, appointment_id, doctor_id, specialty_id,
        encounter_date, encounter_type, chief_complaint, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *`,
      [
        input.patientId,
        input.appointmentId ?? null,
        input.doctorId,
        input.specialtyId ?? null,
        input.encounterDate ?? null,
        input.encounterType ?? 'outpatient',
        input.chiefComplaint ?? null,
        createdBy,
      ],
    );
    return rowToEncounter(rows[0] as Record<string, unknown>);
  });
}

export async function updateEncounter(
  id: string,
  input: UpdateEncounterInput,
  _updatedBy: string,
): Promise<Encounter> {
  return withTransaction(async (client: PoolClient) => {
    const { rows: existing } = await client.query(
      `SELECT version, status FROM encounters WHERE id = $1 FOR UPDATE`,
      [id],
    );

    if (!existing.length) {
      throw Object.assign(new Error('Encounter not found'), {
        code: 'ENCOUNTER_NOT_FOUND',
        statusCode: 404,
      });
    }

    const existingRow = existing[0] as { version: number; status: string };

    if (existingRow.status === 'signed_off') {
      throw Object.assign(new Error('Cannot modify a signed-off encounter'), {
        code: 'ENCOUNTER_SIGNED_OFF',
        statusCode: 422,
      });
    }

    const currentVersion = existingRow.version;
    if (currentVersion !== input.version) {
      throw Object.assign(new Error('Conflict: encounter was modified by another request'), {
        code: 'VERSION_CONFLICT',
        statusCode: 409,
      });
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const updatable: Array<[keyof UpdateEncounterInput, string]> = [
      ['chiefComplaint', 'chief_complaint'],
      ['historyOfPresentIllness', 'history_of_present_illness'],
      ['diagnosisPrimary', 'diagnosis_primary'],
      ['diagnosisSecondary', 'diagnosis_secondary'],
      ['clinicalNotes', 'clinical_notes'],
      ['vitalSigns', 'vital_signs'],
      ['prescriptions', 'prescriptions'],
      ['labOrders', 'lab_orders'],
      ['followUpDate', 'follow_up_date'],
      ['followUpNotes', 'follow_up_notes'],
      ['status', 'status'],
    ];

    for (const [key, col] of updatable) {
      if (key in input) {
        fields.push(`${col} = $${idx++}`);
        const val = (input as unknown as Record<string, unknown>)[key];
        values.push(val !== undefined ? val : null);
      }
    }

    fields.push(`version = $${idx++}`);
    values.push(currentVersion + 1);

    values.push(id);
    const { rows } = await client.query(
      `UPDATE encounters SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );

    return rowToEncounter(rows[0] as Record<string, unknown>);
  });
}

export async function signOffEncounter(
  id: string,
  doctorId: string,
  version: number,
): Promise<Encounter> {
  return withTransaction(async (client: PoolClient) => {
    const { rows: existing } = await client.query(
      `SELECT version, status FROM encounters WHERE id = $1 FOR UPDATE`,
      [id],
    );

    if (!existing.length) {
      throw Object.assign(new Error('Encounter not found'), {
        code: 'ENCOUNTER_NOT_FOUND',
        statusCode: 404,
      });
    }

    const row = existing[0] as { version: number; status: string };

    if (row.version !== version) {
      throw Object.assign(new Error('Conflict: encounter was modified by another request'), {
        code: 'VERSION_CONFLICT',
        statusCode: 409,
      });
    }

    if (row.status !== 'completed') {
      throw Object.assign(
        new Error(`Cannot sign off encounter with status '${row.status}'. Status must be 'completed'.`),
        { code: 'INVALID_STATUS_TRANSITION', statusCode: 422 },
      );
    }

    const { rows } = await client.query(
      `UPDATE encounters
       SET status = 'signed_off',
           signed_off_by = $1,
           signed_off_at = NOW(),
           version = $2
       WHERE id = $3
       RETURNING *`,
      [doctorId, row.version + 1, id],
    );

    return rowToEncounter(rows[0] as Record<string, unknown>);
  });
}
