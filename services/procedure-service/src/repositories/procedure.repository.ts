import { PoolClient } from 'pg';
import type { PaginatedResponse } from '@fadl/types';
import { withRlsContext, withTransaction } from '../config/database';

export interface Procedure {
  id: string;
  code: string;
  nameEn: string;
  nameAr?: string;
  procedureType: 'consultation' | 'follow_up' | 'operative' | 'settling_fee' | 'lab_test' | 'imaging';
  specialtyId: number;
  basePrice: number;
  durationMinutes: number;
  requiresPreAuth: boolean;
  notes?: string;
  isActive: boolean;
  deletedAt?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  branchId: number;
}

export interface CreateProcedureInput {
  code: string;
  nameEn: string;
  nameAr?: string;
  procedureType: Procedure['procedureType'];
  specialtyId: number;
  basePrice: number;
  durationMinutes?: number;
  requiresPreAuth?: boolean;
  notes?: string;
}

function rowToProcedure(row: Record<string, unknown>): Procedure {
  return {
    id: row.id as string,
    code: row.code as string,
    nameEn: row.name_en as string,
    nameAr: row.name_ar as string | undefined,
    procedureType: row.procedure_type as Procedure['procedureType'],
    specialtyId: row.specialty_id as number,
    basePrice: parseFloat(row.base_price as string),
    durationMinutes: row.duration_minutes as number,
    requiresPreAuth: row.requires_pre_auth as boolean,
    notes: row.notes as string | undefined,
    isActive: row.is_active as boolean,
    deletedAt: row.deleted_at ? (row.deleted_at as Date).toISOString() : undefined,
    version: row.version as number,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
    branchId: row.branch_id as number,
  };
}

export async function findProcedureById(id: string): Promise<Procedure | null> {
  return withRlsContext(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM procedures WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return rows.length ? rowToProcedure(rows[0] as Record<string, unknown>) : null;
  });
}

export interface ListProceduresParams {
  specialtyId?: number;
  procedureType?: string;
  isActive?: boolean;
  q?: string;
  page: number;
  limit: number;
}

export async function listProcedures(
  params: ListProceduresParams,
): Promise<PaginatedResponse<Procedure>> {
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

    if (params.procedureType) {
      conditions.push(`procedure_type = $${idx++}`);
      values.push(params.procedureType);
    }

    if (params.isActive !== undefined) {
      conditions.push(`is_active = $${idx++}`);
      values.push(params.isActive);
    }

    if (params.q) {
      conditions.push(`(name_en ILIKE $${idx} OR name_ar ILIKE $${idx})`);
      idx++;
      values.push(`%${params.q}%`);
    }

    const where = conditions.join(' AND ');

    const [{ rows: countRows }, { rows: dataRows }] = await Promise.all([
      client.query(`SELECT COUNT(*)::int AS total FROM procedures WHERE ${where}`, values),
      client.query(
        `SELECT * FROM procedures WHERE ${where} ORDER BY name_en ASC LIMIT $${idx++} OFFSET $${idx++}`,
        [...values, limit, offset],
      ),
    ]);

    const total = (countRows[0] as { total: number }).total;

    return {
      data: dataRows.map((r) => rowToProcedure(r as Record<string, unknown>)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  });
}

export async function createProcedure(
  input: CreateProcedureInput,
  _createdBy: string,
): Promise<Procedure> {
  return withTransaction(async (client: PoolClient) => {
    const { rows } = await client.query(
      `INSERT INTO procedures (
        code, name_en, name_ar, procedure_type, specialty_id,
        base_price, duration_minutes, requires_pre_auth, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *`,
      [
        input.code,
        input.nameEn,
        input.nameAr ?? null,
        input.procedureType,
        input.specialtyId,
        input.basePrice,
        input.durationMinutes ?? 30,
        input.requiresPreAuth ?? false,
        input.notes ?? null,
      ],
    );
    return rowToProcedure(rows[0] as Record<string, unknown>);
  });
}

export async function updateProcedure(
  id: string,
  input: Partial<CreateProcedureInput> & { version: number },
  _updatedBy: string,
): Promise<Procedure> {
  return withTransaction(async (client: PoolClient) => {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const updatable: Array<[keyof CreateProcedureInput, string]> = [
      ['code', 'code'],
      ['nameEn', 'name_en'],
      ['nameAr', 'name_ar'],
      ['procedureType', 'procedure_type'],
      ['specialtyId', 'specialty_id'],
      ['basePrice', 'base_price'],
      ['durationMinutes', 'duration_minutes'],
      ['requiresPreAuth', 'requires_pre_auth'],
      ['notes', 'notes'],
    ];

    for (const [key, col] of updatable) {
      if (key in input) {
        fields.push(`${col} = $${idx++}`);
        values.push((input as unknown as Record<string, unknown>)[key] ?? null);
      }
    }

    if (fields.length === 0) {
      throw Object.assign(new Error('No fields to update'), { code: 'NO_FIELDS', statusCode: 400 });
    }

    fields.push(`version = version + 1`);
    values.push(id, input.version);

    const { rows, rowCount } = await client.query(
      `UPDATE procedures SET ${fields.join(', ')} WHERE id = $${idx++} AND version = $${idx++} AND deleted_at IS NULL RETURNING *`,
      values,
    );

    if (rowCount === 0) {
      throw Object.assign(new Error('Procedure not found or version conflict'), {
        code: 'CONFLICT_VERSION',
        statusCode: 409,
      });
    }

    return rowToProcedure(rows[0] as Record<string, unknown>);
  });
}

export async function softDeleteProcedure(id: string): Promise<void> {
  return withTransaction(async (client: PoolClient) => {
    const { rowCount } = await client.query(
      `UPDATE procedures SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (rowCount === 0) {
      throw Object.assign(new Error('Procedure not found'), { code: 'PROCEDURE_NOT_FOUND', statusCode: 404 });
    }
  });
}

export async function upsertDoctorPrice(
  procedureId: string,
  doctorId: string,
  price: number,
  validFrom: string,
  validUntil?: string,
): Promise<void> {
  return withTransaction(async (client: PoolClient) => {
    await client.query(
      `INSERT INTO procedure_doctor_prices (procedure_id, doctor_id, override_price, valid_from, valid_until)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (procedure_id, doctor_id, valid_from)
       DO UPDATE SET override_price = EXCLUDED.override_price, valid_until = EXCLUDED.valid_until`,
      [procedureId, doctorId, price, validFrom, validUntil ?? null],
    );
  });
}

export async function getDoctorPrice(procedureId: string, doctorId: string): Promise<number | null> {
  return withRlsContext(async (client) => {
    const { rows } = await client.query(
      `SELECT override_price FROM procedure_doctor_prices
       WHERE procedure_id = $1 AND doctor_id = $2
         AND valid_from <= CURRENT_DATE
         AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
       ORDER BY valid_from DESC
       LIMIT 1`,
      [procedureId, doctorId],
    );
    if (!rows.length) return null;
    return parseFloat((rows[0] as Record<string, unknown>).override_price as string);
  });
}
