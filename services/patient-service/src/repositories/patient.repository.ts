import { PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import type {
  Patient,
  CreatePatientInput,
  UpdatePatientInput,
  PatientSearchParams,
  PaginatedResponse,
} from '@fadl/types';
import { withRlsContext, withTransaction, pool } from '../config/database';

function rowToPatient(row: Record<string, unknown>): Patient {
  return {
    patientId: row.patient_id as string,
    mobile: row.mobile as string,
    mobileHistory: (row.mobile_history as string[]) ?? [],
    nationalId: row.national_id as string | undefined,
    nameEn: row.name_en as string,
    nameAr: row.name_ar as string | undefined,
    dateOfBirth: row.date_of_birth ? (row.date_of_birth as Date).toISOString().split('T')[0] : undefined,
    gender: row.gender as Patient['gender'],
    bloodType: row.blood_type as Patient['bloodType'],
    address: row.address as string | undefined,
    email: row.email as string | undefined,
    emergencyContactMobile: row.emergency_contact_mobile as string | undefined,
    emergencyContactName: row.emergency_contact_name as string | undefined,
    preferredLanguage: (row.preferred_language as Patient['preferredLanguage']) ?? 'ar',
    sourceFirstVisit: row.source_first_visit as string | undefined,
    deletedAt: row.deleted_at ? (row.deleted_at as Date).toISOString() : undefined,
    version: row.version as number,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
    createdBy: row.created_by as string | undefined,
    branchId: row.branch_id as number,
  };
}

export async function findPatientById(patientId: string): Promise<Patient | null> {
  return withRlsContext(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM patients WHERE patient_id = $1 AND deleted_at IS NULL`,
      [patientId],
    );
    return rows.length ? rowToPatient(rows[0] as Record<string, unknown>) : null;
  });
}

export async function findPatientByMobile(mobile: string): Promise<Patient | null> {
  return withRlsContext(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM patients WHERE mobile = $1 AND deleted_at IS NULL`,
      [mobile],
    );
    return rows.length ? rowToPatient(rows[0] as Record<string, unknown>) : null;
  });
}

export async function searchPatients(
  params: PatientSearchParams,
): Promise<PaginatedResponse<Patient>> {
  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 20, 100);
  const offset = (page - 1) * limit;

  return withRlsContext(async (client) => {
    const conditions: string[] = ['deleted_at IS NULL'];
    const values: unknown[] = [];
    let idx = 1;

    if (params.mobile) {
      conditions.push(`mobile = $${idx++}`);
      values.push(params.mobile);
    }

    if (params.nationalId) {
      conditions.push(`national_id = $${idx++}`);
      values.push(params.nationalId);
    }

    if (params.query) {
      conditions.push(`name_search @@ plainto_tsquery('simple', $${idx++})`);
      values.push(params.query);
    }

    const where = conditions.join(' AND ');

    const [{ rows: countRows }, { rows: dataRows }] = await Promise.all([
      client.query(`SELECT COUNT(*)::int AS total FROM patients WHERE ${where}`, values),
      client.query(
        `SELECT * FROM patients WHERE ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
        [...values, limit, offset],
      ),
    ]);

    const total = (countRows[0] as { total: number }).total;

    return {
      data: dataRows.map((r) => rowToPatient(r as Record<string, unknown>)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  });
}

export async function createPatient(
  input: CreatePatientInput,
  createdBy: string,
  branchId: number,
): Promise<Patient> {
  return withTransaction(async (client: PoolClient) => {
    const patientId = uuidv4();
    const { rows } = await client.query(
      `INSERT INTO patients (
        patient_id, mobile, name_en, name_ar, national_id,
        date_of_birth, gender, blood_type, address, email,
        emergency_contact_mobile, emergency_contact_name,
        preferred_language, source_first_visit,
        created_by, branch_id
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
      ) RETURNING *`,
      [
        patientId,
        input.mobile,
        input.nameEn,
        input.nameAr ?? null,
        input.nationalId ?? null,
        input.dateOfBirth ?? null,
        input.gender ?? null,
        input.bloodType ?? null,
        input.address ?? null,
        input.email ?? null,
        input.emergencyContactMobile ?? null,
        input.emergencyContactName ?? null,
        input.preferredLanguage ?? 'ar',
        input.sourceFirstVisit ?? null,
        createdBy,
        branchId,
      ],
    );
    return rowToPatient(rows[0] as Record<string, unknown>);
  });
}

export async function updatePatient(
  patientId: string,
  input: UpdatePatientInput,
  updatedBy: string,
): Promise<Patient> {
  return withTransaction(async (client: PoolClient) => {
    // Optimistic concurrency check
    const { rows: existing } = await client.query(
      `SELECT version FROM patients WHERE patient_id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [patientId],
    );

    if (!existing.length) {
      throw Object.assign(new Error('Patient not found'), { code: 'PATIENT_NOT_FOUND', statusCode: 404 });
    }

    const currentVersion = (existing[0] as { version: number }).version;
    if (currentVersion !== input.version) {
      throw Object.assign(new Error('Conflict: patient was modified by another request'), {
        code: 'VERSION_CONFLICT',
        statusCode: 409,
      });
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const updatable: Array<[keyof UpdatePatientInput, string]> = [
      ['nameEn', 'name_en'],
      ['nameAr', 'name_ar'],
      ['nationalId', 'national_id'],
      ['dateOfBirth', 'date_of_birth'],
      ['gender', 'gender'],
      ['bloodType', 'blood_type'],
      ['address', 'address'],
      ['email', 'email'],
      ['emergencyContactMobile', 'emergency_contact_mobile'],
      ['emergencyContactName', 'emergency_contact_name'],
      ['preferredLanguage', 'preferred_language'],
      ['sourceFirstVisit', 'source_first_visit'],
    ];

    for (const [key, col] of updatable) {
      if (key in input && key !== 'version') {
        fields.push(`${col} = $${idx++}`);
        values.push((input as unknown as Record<string, unknown>)[key] ?? null);
      }
    }

    fields.push(`version = $${idx++}`, `updated_at = NOW()`, `updated_by = $${idx++}`);
    values.push(currentVersion + 1, updatedBy, patientId);

    const { rows } = await client.query(
      `UPDATE patients SET ${fields.join(', ')} WHERE patient_id = $${idx} RETURNING *`,
      values,
    );

    return rowToPatient(rows[0] as Record<string, unknown>);
  });
}

export async function softDeletePatient(patientId: string, deletedBy: string): Promise<void> {
  const result = await pool.query(
    `UPDATE patients SET deleted_at = NOW(), updated_by = $2 WHERE patient_id = $1 AND deleted_at IS NULL`,
    [patientId, deletedBy],
  );
  if (result.rowCount === 0) {
    throw Object.assign(new Error('Patient not found'), { code: 'PATIENT_NOT_FOUND', statusCode: 404 });
  }
}
