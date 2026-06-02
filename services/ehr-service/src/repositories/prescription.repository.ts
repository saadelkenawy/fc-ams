import { PoolClient } from 'pg';
import { withRlsContext, withTransaction } from '../config/database';
import type {
  Prescription,
  PrescriptionItem,
  CreatePrescriptionInput,
  MedicationDictionaryEntry,
} from '@fadl/types';

/* ── row mappers ─────────────────────────────────────────────────────────── */

function rowToItem(row: Record<string, unknown>): PrescriptionItem {
  return {
    id:               row.id as string,
    prescriptionId:   row.prescription_id as string,
    medicationId:     row.medication_id as string | undefined,
    medicationName:   row.medication_name as string,
    form:             row.form as PrescriptionItem['form'],
    dosageValue:      row.dosage_value != null ? Number(row.dosage_value) : undefined,
    dosageUnit:       row.dosage_unit as string | undefined,
    frequency:        row.frequency as PrescriptionItem['frequency'],
    timing:           row.timing as PrescriptionItem['timing'],
    routeInstruction: row.route_instruction as string | undefined,
    durationDays:     row.duration_days != null ? Number(row.duration_days) : undefined,
    dispenseQuantity: row.dispense_quantity != null ? Number(row.dispense_quantity) : undefined,
    sortOrder:        Number(row.sort_order ?? 0),
    createdAt:        (row.created_at as Date).toISOString(),
  };
}

function rowToPrescription(
  row: Record<string, unknown>,
  items: PrescriptionItem[],
): Prescription {
  return {
    id:          row.id as string,
    branchId:    Number(row.branch_id),
    encounterId: row.encounter_id as string | undefined,
    patientId:   row.patient_id as string,
    doctorId:    row.doctor_id as string,
    diagnosis:   row.diagnosis as string | undefined,
    status:      row.status as Prescription['status'],
    notes:       row.notes as string | undefined,
    items,
    version:     Number(row.version),
    createdBy:   row.created_by as string | undefined,
    createdAt:   (row.created_at as Date).toISOString(),
    updatedAt:   (row.updated_at as Date).toISOString(),
  };
}

/* ── public API ──────────────────────────────────────────────────────────── */

export async function createPrescription(
  input: CreatePrescriptionInput,
  createdBy: string,
): Promise<Prescription> {
  return withTransaction(async (client: PoolClient) => {
    const { rows: rxRows } = await client.query(
      `INSERT INTO prescriptions
         (encounter_id, patient_id, doctor_id, diagnosis, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [
        input.encounterId ?? null,
        input.patientId,
        input.doctorId,
        input.diagnosis ?? null,
        input.notes ?? null,
        createdBy,
      ],
    );

    const rx = rxRows[0] as Record<string, unknown>;
    const items: PrescriptionItem[] = [];

    for (let i = 0; i < input.items.length; i++) {
      const it = input.items[i];
      const { rows: itemRows } = await client.query(
        `INSERT INTO prescription_items
           (prescription_id, medication_id, medication_name,
            form, dosage_value, dosage_unit, frequency, timing,
            route_instruction, duration_days, dispense_quantity, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *`,
        [
          rx.id,
          it.medicationId ?? null,
          it.medicationName,
          it.form,
          it.dosageValue ?? null,
          it.dosageUnit ?? null,
          it.frequency,
          it.timing ?? 'none',
          it.routeInstruction ?? null,
          it.durationDays ?? null,
          it.dispenseQuantity ?? null,
          it.sortOrder ?? i,
        ],
      );
      items.push(rowToItem(itemRows[0] as Record<string, unknown>));
    }

    return rowToPrescription(rx, items);
  });
}

export async function findPrescriptionById(id: string): Promise<Prescription | null> {
  return withRlsContext(async (client) => {
    const { rows: rxRows } = await client.query(
      `SELECT * FROM prescriptions WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (rxRows.length === 0) return null;

    const { rows: itemRows } = await client.query(
      `SELECT * FROM prescription_items WHERE prescription_id = $1 ORDER BY sort_order`,
      [id],
    );

    return rowToPrescription(
      rxRows[0] as Record<string, unknown>,
      itemRows.map((r) => rowToItem(r as Record<string, unknown>)),
    );
  });
}

export interface ListPrescriptionsParams {
  patientId?: string;
  doctorId?: string;
  encounterId?: string;
  status?: string;
  page: number;
  limit: number;
}

export async function listPrescriptions(
  params: ListPrescriptionsParams,
): Promise<{ data: Prescription[]; total: number; page: number; limit: number }> {
  const page = Math.max(params.page, 1);
  const limit = Math.min(params.limit, 100);
  const offset = (page - 1) * limit;

  return withRlsContext(async (client) => {
    const conditions: string[] = ['deleted_at IS NULL'];
    const values: unknown[] = [];
    let idx = 1;

    if (params.patientId)   { conditions.push(`patient_id = $${idx++}`);   values.push(params.patientId); }
    if (params.doctorId)    { conditions.push(`doctor_id = $${idx++}`);    values.push(params.doctorId); }
    if (params.encounterId) { conditions.push(`encounter_id = $${idx++}`); values.push(params.encounterId); }
    if (params.status)      { conditions.push(`status = $${idx++}`);       values.push(params.status); }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const [{ rows: countRows }, { rows: rxRows }] = await Promise.all([
      client.query(`SELECT COUNT(*)::int AS total FROM prescriptions ${where}`, values),
      client.query(
        `SELECT * FROM prescriptions ${where}
         ORDER BY created_at DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...values, limit, offset],
      ),
    ]);

    const total = (countRows[0] as { total: number }).total;

    if (rxRows.length === 0) return { data: [], total, page, limit };

    const ids = rxRows.map((r) => (r as Record<string, unknown>).id as string);
    const { rows: itemRows } = await client.query(
      `SELECT * FROM prescription_items
       WHERE prescription_id = ANY($1::uuid[])
       ORDER BY prescription_id, sort_order`,
      [ids],
    );

    const itemsByRx = new Map<string, PrescriptionItem[]>();
    for (const row of itemRows) {
      const rxId = (row as Record<string, unknown>).prescription_id as string;
      if (!itemsByRx.has(rxId)) itemsByRx.set(rxId, []);
      itemsByRx.get(rxId)!.push(rowToItem(row as Record<string, unknown>));
    }

    const data = rxRows.map((row) => {
      const r = row as Record<string, unknown>;
      return rowToPrescription(r, itemsByRx.get(r.id as string) ?? []);
    });

    return { data, total, page, limit };
  });
}

export async function updatePrescriptionStatus(
  id: string,
  status: Prescription['status'],
  version: number,
): Promise<Prescription | null> {
  return withTransaction(async (client: PoolClient) => {
    const { rows } = await client.query(
      `UPDATE prescriptions
       SET status = $1
       WHERE id = $2 AND version = $3 AND deleted_at IS NULL
       RETURNING *`,
      [status, id, version],
    );
    if (rows.length === 0) return null;

    const { rows: itemRows } = await client.query(
      `SELECT * FROM prescription_items WHERE prescription_id = $1 ORDER BY sort_order`,
      [id],
    );

    return rowToPrescription(
      rows[0] as Record<string, unknown>,
      itemRows.map((r) => rowToItem(r as Record<string, unknown>)),
    );
  });
}

export async function softDeletePrescription(id: string, version: number): Promise<boolean> {
  return withTransaction(async (client: PoolClient) => {
    const { rows } = await client.query(
      `UPDATE prescriptions
       SET deleted_at = NOW(), status = 'cancelled'
       WHERE id = $1 AND version = $2 AND deleted_at IS NULL
       RETURNING id`,
      [id, version],
    );
    return rows.length > 0;
  });
}

export async function searchMedications(query: string): Promise<MedicationDictionaryEntry[]> {
  return withRlsContext(async (client) => {
    const { rows } = await client.query(
      `SELECT id, generic_name, brand_name, available_forms
       FROM medication_dictionary
       WHERE is_active = TRUE
         AND (generic_name ILIKE $1 OR brand_name ILIKE $1)
       ORDER BY generic_name
       LIMIT 20`,
      [`%${query}%`],
    );

    return rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id:             row.id as string,
        genericName:    row.generic_name as string,
        brandName:      row.brand_name as string | undefined,
        availableForms: ((row.available_forms as string[]) ?? []) as import('@fadl/types').RxForm[],
      };
    });
  });
}
