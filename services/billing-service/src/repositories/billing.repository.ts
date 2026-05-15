import { PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import type {
  FinancialTransaction,
  CreateTransactionInput,
  DoctorSettlement,
  PaymentStatus,
  PaginatedResponse,
} from '@fadl/types';
import { withRlsContext, withTransaction, pool } from '../config/database';


function rowToTransaction(row: Record<string, unknown>): FinancialTransaction {
  return {
    id: row.id as string,
    idempotencyKey: row.idempotency_key as string,
    appointmentId: row.appointment_id as string | undefined,
    patientId: row.patient_id as string,
    doctorId: row.doctor_id as string | undefined,
    procedureId: row.procedure_id as string | undefined,
    patientSource: row.patient_source as string,
    sourceFeePercentage: Number(row.source_fee_percentage),
    sourceFeeAmount: Number(row.source_fee_amount),
    approvedCharge: Number(row.approved_charge),
    procedureCost: row.procedure_cost !== null && row.procedure_cost !== undefined ? Number(row.procedure_cost) : undefined,
    grossRevenue: Number(row.gross_revenue),
    splitDoctorPercentage: Number(row.split_doctor_percentage),
    splitClinicPercentage: Number(row.split_clinic_percentage),
    doctorShare: Number(row.doctor_share),
    clinicShare: Number(row.clinic_share),
    paymentMethod: row.payment_method as string | undefined,
    paymentStatus: row.payment_status as PaymentStatus,
    checkInAmount: row.check_in_amount !== null && row.check_in_amount !== undefined ? Number(row.check_in_amount) : undefined,
    checkOutAmount: row.check_out_amount !== null && row.check_out_amount !== undefined ? Number(row.check_out_amount) : undefined,
    isRefund: row.is_refund as boolean,
    originalTransactionId: row.original_transaction_id as string | undefined,
    refundReason: row.refund_reason as string | undefined,
    settledAt: row.settled_at ? (row.settled_at as Date).toISOString() : undefined,
    settledBy: row.settled_by as string | undefined,
    settlementReference: row.settlement_reference as string | undefined,
    currencyCode: row.currency_code as FinancialTransaction['currencyCode'],
    exchangeRate: Number(row.exchange_rate),
    vatRate: Number(row.vat_rate),
    vatAmount: Number(row.vat_amount),
    createdAt: (row.created_at as Date).toISOString(),
    createdBy: row.created_by as string | undefined,
    transactionDate: row.transaction_date
      ? (row.transaction_date as Date).toISOString().split('T')[0]
      : (row.transaction_date as string),
    branchId: row.branch_id as number,
  };
}

export async function findTransactionById(id: string): Promise<FinancialTransaction | null> {
  return withRlsContext(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM financial_transactions WHERE id = $1`,
      [id],
    );
    return rows.length ? rowToTransaction(rows[0] as Record<string, unknown>) : null;
  });
}

export async function listTransactions(params: {
  appointmentId?: string;
  patientId?: string;
  doctorId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  page: number;
  limit: number;
}): Promise<PaginatedResponse<FinancialTransaction>> {
  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 20, 100);
  const offset = (page - 1) * limit;

  return withRlsContext(async (client) => {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (params.appointmentId) {
      conditions.push(`appointment_id = $${idx++}`);
      values.push(params.appointmentId);
    }
    if (params.patientId) {
      conditions.push(`patient_id = $${idx++}`);
      values.push(params.patientId);
    }
    if (params.doctorId) {
      conditions.push(`doctor_id = $${idx++}`);
      values.push(params.doctorId);
    }
    if (params.status) {
      conditions.push(`payment_status = $${idx++}`);
      values.push(params.status);
    }
    if (params.dateFrom) {
      conditions.push(`transaction_date >= $${idx++}`);
      values.push(params.dateFrom);
    }
    if (params.dateTo) {
      conditions.push(`transaction_date <= $${idx++}`);
      values.push(params.dateTo);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [{ rows: countRows }, { rows: dataRows }] = await Promise.all([
      client.query(`SELECT COUNT(*)::int AS total FROM financial_transactions ${where}`, values),
      client.query(
        `SELECT * FROM financial_transactions ${where}
         ORDER BY transaction_date DESC, created_at DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...values, limit, offset],
      ),
    ]);

    const total = (countRows[0] as { total: number }).total;

    return {
      data: dataRows.map((r) => rowToTransaction(r as Record<string, unknown>)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  });
}

export async function createTransaction(
  input: CreateTransactionInput,
  createdBy: string,
  branchId: number,
): Promise<FinancialTransaction> {
  return withTransaction(async (client: PoolClient) => {
    // Idempotency check
    const { rows: existing } = await client.query(
      `SELECT * FROM financial_transactions WHERE idempotency_key = $1 AND branch_id = $2`,
      [input.idempotencyKey, branchId],
    );
    if (existing.length) {
      return rowToTransaction(existing[0] as Record<string, unknown>);
    }

    // Resolve source fee: specialty-specific rate → fallback to general rate
    const sourceFeePercentage = await getSourceRate(input.patientSource, input.doctorSpecialtyId);
    // Mediator cut applies ONLY to the base session fee
    const sourceFeeAmount = input.approvedCharge * sourceFeePercentage / 100;
    // Net pool = remaining session fee + full cost of extra services (procedures)
    // gross_revenue stores this net pool — the total amount split between doctor and clinic
    const netPool = (input.approvedCharge - sourceFeeAmount) + (input.procedureCost ?? 0);
    const grossRevenue = netPool;
    const doctorShare = netPool * input.splitDoctorPercentage / 100;
    const clinicShare = netPool * input.splitClinicPercentage / 100;
    const vatRate = 0.14;
    const transactionDate = new Date().toISOString().split('T')[0];
    const id = uuidv4();

    const { rows } = await client.query(
      `INSERT INTO financial_transactions (
        id, idempotency_key, appointment_id, patient_id, doctor_id, procedure_id,
        patient_source, source_fee_percentage, source_fee_amount,
        approved_charge, procedure_cost, gross_revenue,
        split_doctor_percentage, split_clinic_percentage, doctor_share, clinic_share,
        payment_method, payment_status,
        currency_code, exchange_rate, vat_rate,
        is_refund, transaction_date, created_by, branch_id
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25
      ) RETURNING *`,
      [
        id,
        input.idempotencyKey,
        input.appointmentId ?? null,
        input.patientId,
        input.doctorId ?? null,
        input.procedureId ?? null,
        input.patientSource,
        sourceFeePercentage,
        sourceFeeAmount,
        input.approvedCharge,
        input.procedureCost ?? null,
        grossRevenue,
        input.splitDoctorPercentage,
        input.splitClinicPercentage,
        doctorShare,
        clinicShare,
        input.paymentMethod ?? null,
        'pending',
        input.currencyCode ?? 'EGP',
        1,
        vatRate,
        false,
        transactionDate,
        createdBy,
        branchId,
      ],
    );

    return rowToTransaction(rows[0] as Record<string, unknown>);
  });
}

export async function updateProcedureCost(
  id: string,
  procedureCost: number | null,
): Promise<FinancialTransaction> {
  return withTransaction(async (client: PoolClient) => {
    const { rows: existing } = await client.query(
      `SELECT payment_status FROM financial_transactions WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (!existing.length) {
      throw Object.assign(new Error('Transaction not found'), { statusCode: 404, code: 'TRANSACTION_NOT_FOUND' });
    }
    if ((existing[0] as Record<string, unknown>).payment_status === 'reconciled') {
      throw Object.assign(new Error('Record is reconciled and locked'), { statusCode: 403, code: 'RECORD_RECONCILED' });
    }
    const { rows } = await client.query(
      `UPDATE financial_transactions SET procedure_cost = $2 WHERE id = $1 RETURNING *`,
      [id, procedureCost],
    );
    return rowToTransaction(rows[0] as Record<string, unknown>);
  });
}

export async function updatePaymentStatus(
  id: string,
  status: PaymentStatus,
  updatedBy: string,
  extra?: {
    settlementReference?: string;
    checkInAmount?: number;
    checkOutAmount?: number;
  },
): Promise<FinancialTransaction> {
  return withTransaction(async (client: PoolClient) => {
    const { rows: existing } = await client.query(
      `SELECT id, payment_status FROM financial_transactions WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (!existing.length) {
      throw Object.assign(new Error('Transaction not found'), { code: 'TRANSACTION_NOT_FOUND', statusCode: 404 });
    }
    const currentStatus = (existing[0] as Record<string, unknown>).payment_status as string;
    if (currentStatus === 'reconciled') {
      throw Object.assign(new Error('Record is reconciled and locked'), { statusCode: 403, code: 'RECORD_RECONCILED' });
    }
    if (currentStatus === 'refunded') {
      throw Object.assign(new Error('Transaction is refunded and locked'), { statusCode: 403, code: 'RECORD_REFUNDED' });
    }

    if (status === 'refunded') {
      await client.query(`DELETE FROM transaction_extra_services WHERE transaction_id = $1`, [id]);
      try {
        await client.query(`DELETE FROM settlement_records WHERE $1::uuid = ANY(related_transaction_ids)`, [id]);
      } catch { /* immutability trigger may block — non-fatal */ }
    }

    const fields: string[] = ['payment_status = $2'];
    const values: unknown[] = [id, status];
    let idx = 3;

    if (status === 'paid') {
      fields.push(`settled_at = NOW()`, `settled_by = $${idx++}`);
      values.push(updatedBy);
    }
    if (extra?.settlementReference !== undefined) {
      fields.push(`settlement_reference = $${idx++}`);
      values.push(extra.settlementReference);
    }
    if (extra?.checkInAmount !== undefined) {
      fields.push(`check_in_amount = $${idx++}`);
      values.push(extra.checkInAmount);
    }
    if (extra?.checkOutAmount !== undefined) {
      fields.push(`check_out_amount = $${idx++}`);
      values.push(extra.checkOutAmount);
    }

    const { rows } = await client.query(
      `UPDATE financial_transactions SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
      values,
    );

    return rowToTransaction(rows[0] as Record<string, unknown>);
  });
}

export async function getDoctorSettlement(
  doctorId: string,
  from: string,
  to: string,
): Promise<DoctorSettlement> {
  return withRlsContext(async (client) => {
    const { rows } = await client.query(
      `SELECT ft.*
       FROM financial_transactions ft
       WHERE ft.doctor_id = $1
         AND ft.transaction_date BETWEEN $2 AND $3
         AND ft.payment_status IN ('paid', 'reconciled')`,
      [doctorId, from, to],
    );

    if (!rows.length) {
      return {
        doctorId,
        doctorNameEn: '',
        period: { from, to },
        totalConsultations: 0,
        totalProcedures: 0,
        grossRevenue: 0,
        doctorShare: 0,
        clinicShare: 0,
        totalSourceFees: 0,
        netPayable: 0,
        status: 'pending',
        transactions: [],
      };
    }

    const transactions = rows.map((r) => rowToTransaction(r as Record<string, unknown>));
    const doctorNameEn = ''; // resolved client-side via doctors API

    const totalConsultations = rows.filter((r) => !(r as Record<string, unknown>).procedure_id).length;
    const totalProcedures = rows.filter((r) => (r as Record<string, unknown>).procedure_id).length;
    // gross_revenue stores the net pool (= remaining session fee + extra services)
    const grossRevenue = transactions.reduce((s, t) => s + t.grossRevenue, 0);
    const totalSourceFees = transactions.reduce((s, t) => s + t.sourceFeeAmount, 0);
    const totalExtraServices = transactions.reduce((s, t) => s + (t.procedureCost ?? 0), 0);
    // Use stored share values computed at transaction creation
    const doctorShare = transactions.reduce((s, t) => s + t.doctorShare, 0);
    const clinicShare = transactions.reduce((s, t) => s + t.clinicShare, 0);
    const netPayable = doctorShare;

    const allPaid = transactions.every((t) => t.paymentStatus === 'paid');
    const status: PaymentStatus = allPaid ? 'paid' : 'pending';

    return {
      doctorId,
      doctorNameEn,
      period: { from, to },
      totalConsultations,
      totalProcedures,
      grossRevenue,
      doctorShare,
      clinicShare,
      totalSourceFees,
      totalExtraServices,
      netPayable,
      status,
      transactions,
    };
  });
}

export async function listDoctorSettlements(params: {
  from: string;
  to: string;
  page: number;
  limit: number;
}): Promise<PaginatedResponse<Omit<DoctorSettlement, 'transactions'>>> {
  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 20, 100);
  const offset = (page - 1) * limit;

  return withRlsContext(async (client) => {
    const [{ rows: countRows }, { rows: dataRows }] = await Promise.all([
      client.query(
        `SELECT COUNT(DISTINCT doctor_id)::int AS total
         FROM financial_transactions
         WHERE transaction_date BETWEEN $1 AND $2
           AND doctor_id IS NOT NULL
           AND payment_status IN ('paid', 'reconciled')`,
        [params.from, params.to],
      ),
      client.query(
        `SELECT
           ft.doctor_id,
           COUNT(*) FILTER (WHERE ft.procedure_id IS NULL)::int AS total_consultations,
           COUNT(*) FILTER (WHERE ft.procedure_id IS NOT NULL)::int AS total_procedures,
           SUM(ft.approved_charge)                         AS total_session_fees,
           SUM(COALESCE(ft.procedure_cost, 0))             AS total_extra_services,
           SUM(ft.source_fee_amount)                       AS total_source_fees,
           SUM(ft.gross_revenue)                           AS gross_revenue,
           SUM(ft.doctor_share)                            AS doctor_share,
           SUM(ft.clinic_share)                            AS clinic_share,
           SUM(ft.doctor_share)                            AS net_payable,
           BOOL_AND(ft.payment_status = 'reconciled')      AS all_reconciled
         FROM financial_transactions ft
         WHERE ft.transaction_date BETWEEN $1 AND $2
           AND ft.doctor_id IS NOT NULL
           AND ft.payment_status IN ('paid', 'reconciled')
         GROUP BY ft.doctor_id
         ORDER BY gross_revenue DESC
         LIMIT $3 OFFSET $4`,
        [params.from, params.to, limit, offset],
      ),
    ]);

    const total = (countRows[0] as { total: number }).total;

    const data = dataRows.map((r) => {
      const row = r as Record<string, unknown>;
      const allReconciled = row.all_reconciled as boolean;
      return {
        doctorId: row.doctor_id as string,
        doctorNameEn: '', // resolved client-side via doctors API to avoid cross-DB join
        period: { from: params.from, to: params.to },
        totalConsultations: Number(row.total_consultations),
        totalProcedures: Number(row.total_procedures),
        totalSessionFees: Number(row.total_session_fees),
        totalExtraServices: Number(row.total_extra_services),
        grossRevenue: Number(row.gross_revenue), // net pool = what doctor+clinic split
        doctorShare: Number(row.doctor_share),
        clinicShare: Number(row.clinic_share),
        totalSourceFees: Number(row.total_source_fees),
        netPayable: Number(row.net_payable),
        status: (allReconciled ? 'reconciled' : 'paid') as PaymentStatus,
      };
    });

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  });
}

// ─── Extra Services ───────────────────────────────────────────────────────────

export interface ExtraServiceRecord {
  id: string;
  transactionId: string;
  serviceName: string;
  cost: number;
  createdAt: string;
  createdBy: string | null;
}

function rowToExtraService(row: Record<string, unknown>): ExtraServiceRecord {
  return {
    id:            row.id as string,
    transactionId: row.transaction_id as string,
    serviceName:   row.service_name as string,
    cost:          Number(row.cost),
    createdAt:     (row.created_at as Date).toISOString(),
    createdBy:     (row.created_by as string | null) ?? null,
  };
}

export async function listExtraServices(transactionId: string): Promise<ExtraServiceRecord[]> {
  const { rows } = await pool.query(
    `SELECT * FROM transaction_extra_services WHERE transaction_id = $1 ORDER BY created_at ASC`,
    [transactionId],
  );
  return rows.map((r) => rowToExtraService(r as Record<string, unknown>));
}

export async function replaceExtraServices(
  transactionId: string,
  items: Array<{ serviceName: string; cost: number }>,
  createdBy: string,
): Promise<ExtraServiceRecord[]> {
  return withTransaction(async (client: PoolClient) => {
    // verify transaction exists and is not reconciled
    const { rows: txRows } = await client.query(
      `SELECT id, payment_status FROM financial_transactions WHERE id = $1`,
      [transactionId],
    );
    if (!txRows.length) {
      throw Object.assign(new Error('Transaction not found'), { statusCode: 404, code: 'TRANSACTION_NOT_FOUND' });
    }
    if ((txRows[0] as Record<string, unknown>).payment_status === 'reconciled') {
      throw Object.assign(new Error('Record is reconciled and locked'), { statusCode: 403, code: 'RECORD_RECONCILED' });
    }

    await client.query(
      `DELETE FROM transaction_extra_services WHERE transaction_id = $1`,
      [transactionId],
    );

    if (!items.length) {
      // trigger will set procedure_cost = NULL
      return [];
    }

    const inserted: ExtraServiceRecord[] = [];
    for (const item of items) {
      const { rows } = await client.query(
        `INSERT INTO transaction_extra_services (transaction_id, service_name, cost, created_by)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [transactionId, item.serviceName, item.cost, createdBy],
      );
      inserted.push(rowToExtraService(rows[0] as Record<string, unknown>));
    }
    return inserted;
  });
}

// ─── Reconcile Doctor (atomic Paid → Reconciled for all of a doctor's sessions) ─

export interface ReconcileResult {
  reconciledCount: number;
  doctorShare: number;
  clinicShare: number;
  grossRevenue: number;
  transactionIds: string[];
  settlementRecordId: string;
}

export async function reconcileDoctor(
  doctorId: string,
  from: string,
  to: string,
  settledBy: string,
  branchId: number,
): Promise<ReconcileResult> {
  return withTransaction(async (client: PoolClient) => {
    // Lock all Paid transactions for this doctor in the period
    const { rows } = await client.query(
      `SELECT id, doctor_share, clinic_share, gross_revenue, split_doctor_percentage, split_clinic_percentage
       FROM financial_transactions
       WHERE doctor_id = $1
         AND transaction_date BETWEEN $2 AND $3
         AND payment_status = 'paid'
       FOR UPDATE`,
      [doctorId, from, to],
    );

    if (!rows.length) {
      throw Object.assign(
        new Error('No Paid transactions found for this doctor in the given period'),
        { statusCode: 422, code: 'NO_PAID_TRANSACTIONS' },
      );
    }

    // Validate Dr% + Cl% = 100 for all rows
    for (const r of rows) {
      const row = r as Record<string, unknown>;
      const sum = Number(row.split_doctor_percentage) + Number(row.split_clinic_percentage);
      if (Math.abs(sum - 100) > 0.01) {
        throw Object.assign(
          new Error(`Invalid split for transaction ${row.id as string}: Dr% + Cl% = ${sum}`),
          { statusCode: 422, code: 'INVALID_SPLIT' },
        );
      }
    }

    const transactionIds = rows.map((r) => (r as Record<string, unknown>).id as string);
    const totals = rows.reduce(
      (acc, r) => {
        const row = r as Record<string, unknown>;
        acc.doctorShare  += Number(row.doctor_share);
        acc.clinicShare  += Number(row.clinic_share);
        acc.grossRevenue += Number(row.gross_revenue);
        return acc;
      },
      { doctorShare: 0, clinicShare: 0, grossRevenue: 0 },
    );

    // Atomically mark all as reconciled
    await client.query(
      `UPDATE financial_transactions
          SET payment_status = 'reconciled', settled_at = NOW(), settled_by = $2
        WHERE doctor_id = $1
          AND transaction_date BETWEEN $3 AND $4
          AND payment_status = 'paid'`,
      [doctorId, settledBy, from, to],
    );

    // Write immutable settlement audit record
    const { rows: srRows } = await client.query(
      `INSERT INTO settlement_records
         (doctor_id, settlement_date, amount, payment_method, processed_by_user_id, related_transaction_ids, notes, branch_id)
       VALUES ($1, CURRENT_DATE, $2, 'system', $3, $4, $5, $6)
       RETURNING id`,
      [
        doctorId,
        totals.doctorShare,
        settledBy,
        transactionIds,
        `Reconciled ${transactionIds.length} transactions: ${from} to ${to}`,
        branchId,
      ],
    );

    return {
      reconciledCount: transactionIds.length,
      doctorShare:     totals.doctorShare,
      clinicShare:     totals.clinicShare,
      grossRevenue:    totals.grossRevenue,
      transactionIds,
      settlementRecordId: (srRows[0] as Record<string, unknown>).id as string,
    };
  });
}

// ─── Source Fee Rules ─────────────────────────────────────────────────────────

export interface SpecialtyRate {
  specialtyId: number;
  feeValue: number;
}

export interface SourceFeeRule {
  id: number;
  sourceCode: string;
  sourceNameEn: string;
  sourceNameAr: string;
  feeType: 'percentage' | 'fixed';
  feeValue: number;
  deductFrom: 'clinic' | 'doctor' | 'both';
  isGeneral: boolean;
  isActive: boolean;
  validFrom: string;
  validUntil: string | null;
  specialtyRates: SpecialtyRate[];
  lastModifiedAt: string;
}

export interface CreateSourceInput {
  sourceCode: string;
  sourceNameEn: string;
  sourceNameAr: string;
  feeType: 'percentage' | 'fixed';
  feeValue: number;
  deductFrom: 'clinic' | 'doctor' | 'both';
  isGeneral?: boolean;
  isActive?: boolean;
  validFrom: string;
  validUntil?: string;
  specialtyRates?: SpecialtyRate[];
}

export interface UpdateSourceInput {
  sourceNameEn?: string;
  sourceNameAr?: string;
  feeType?: 'percentage' | 'fixed';
  feeValue?: number;
  deductFrom?: 'clinic' | 'doctor' | 'both';
  isGeneral?: boolean;
  isActive?: boolean;
  validFrom?: string;
  validUntil?: string | null;
  specialtyRates?: SpecialtyRate[];
}

function rowToSource(row: Record<string, unknown>, specialtyRates: SpecialtyRate[] = []): SourceFeeRule {
  return {
    id:             row.id as number,
    sourceCode:     row.source_code as string,
    sourceNameEn:   (row.source_name_en as string) ?? '',
    sourceNameAr:   (row.source_name_ar as string) ?? '',
    feeType:        row.fee_type as 'percentage' | 'fixed',
    feeValue:       Number(row.fee_value),
    deductFrom:     row.deduct_from as 'clinic' | 'doctor' | 'both',
    isGeneral:      (row.is_general as boolean) ?? true,
    isActive:       row.is_active as boolean,
    validFrom:      row.valid_from instanceof Date ? (row.valid_from as Date).toISOString().split('T')[0] : row.valid_from as string,
    validUntil:     row.valid_until instanceof Date ? (row.valid_until as Date).toISOString().split('T')[0] : (row.valid_until as string | null) ?? null,
    specialtyRates,
    lastModifiedAt: (row.last_modified_at as Date).toISOString(),
  };
}

async function fetchSpecialtyRates(client: { query: typeof pool.query }, sourceCode: string): Promise<SpecialtyRate[]> {
  const { rows } = await client.query(
    `SELECT specialty_id, fee_value FROM source_specialty_rates WHERE source_code = $1 ORDER BY specialty_id`,
    [sourceCode],
  );
  return rows.map((r) => ({
    specialtyId: (r as Record<string, unknown>).specialty_id as number,
    feeValue:    Number((r as Record<string, unknown>).fee_value),
  }));
}

async function replaceSpecialtyRates(
  client: PoolClient,
  sourceCode: string,
  rates: SpecialtyRate[],
): Promise<void> {
  await client.query(`DELETE FROM source_specialty_rates WHERE source_code = $1`, [sourceCode]);
  for (const r of rates) {
    await client.query(
      `INSERT INTO source_specialty_rates (source_code, specialty_id, fee_value) VALUES ($1,$2,$3)`,
      [sourceCode, r.specialtyId, r.feeValue],
    );
  }
}

export async function listSources(): Promise<SourceFeeRule[]> {
  const { rows } = await pool.query(
    `SELECT * FROM source_fee_rules ORDER BY is_active DESC, source_code ASC`,
  );
  if (!rows.length) return [];

  const { rows: rateRows } = await pool.query(
    `SELECT source_code, specialty_id, fee_value FROM source_specialty_rates ORDER BY source_code, specialty_id`,
  );

  const rateMap = new Map<string, SpecialtyRate[]>();
  for (const r of rateRows) {
    const row = r as Record<string, unknown>;
    const code = row.source_code as string;
    if (!rateMap.has(code)) rateMap.set(code, []);
    rateMap.get(code)!.push({ specialtyId: row.specialty_id as number, feeValue: Number(row.fee_value) });
  }

  return rows.map((r) => {
    const row = r as Record<string, unknown>;
    return rowToSource(row, rateMap.get(row.source_code as string) ?? []);
  });
}

export async function getSourceRate(sourceCode: string, specialtyId?: number): Promise<number> {
  const { rows } = await pool.query(
    `SELECT fee_value, is_general FROM source_fee_rules
     WHERE source_code = $1 AND is_active = TRUE
       AND valid_from <= CURRENT_DATE
       AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
     LIMIT 1`,
    [sourceCode],
  );
  if (!rows.length) return 0;

  const row = rows[0] as Record<string, unknown>;
  const isGeneral = row.is_general as boolean;
  const defaultRate = Number(row.fee_value);

  if (isGeneral || !specialtyId) return defaultRate;

  const { rows: srRows } = await pool.query(
    `SELECT fee_value FROM source_specialty_rates WHERE source_code = $1 AND specialty_id = $2`,
    [sourceCode, specialtyId],
  );
  return srRows.length ? Number((srRows[0] as Record<string, unknown>).fee_value) : defaultRate;
}

export async function createSource(input: CreateSourceInput, userId: string): Promise<SourceFeeRule> {
  return withTransaction(async (client: PoolClient) => {
    const { rows } = await client.query(
      `INSERT INTO source_fee_rules
         (source_code, source_name_en, source_name_ar, fee_type, fee_value, deduct_from, is_general, is_active, valid_from, valid_until, last_modified_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        input.sourceCode,
        input.sourceNameEn,
        input.sourceNameAr,
        input.feeType,
        input.feeValue,
        input.deductFrom ?? 'clinic',
        input.isGeneral ?? true,
        input.isActive ?? true,
        input.validFrom,
        input.validUntil ?? null,
        userId,
      ],
    );

    const rates = (!input.isGeneral && input.specialtyRates?.length)
      ? input.specialtyRates
      : [];
    if (rates.length) await replaceSpecialtyRates(client, input.sourceCode, rates);

    return rowToSource(rows[0] as Record<string, unknown>, rates);
  });
}

export async function updateSource(sourceCode: string, input: UpdateSourceInput, userId: string): Promise<SourceFeeRule> {
  return withTransaction(async (client: PoolClient) => {
    const fields: string[] = ['last_modified_by = $1', 'last_modified_at = NOW()'];
    const values: unknown[] = [userId];
    let idx = 2;

    if (input.sourceNameEn !== undefined) { fields.push(`source_name_en = $${idx++}`); values.push(input.sourceNameEn); }
    if (input.sourceNameAr !== undefined) { fields.push(`source_name_ar = $${idx++}`); values.push(input.sourceNameAr); }
    if (input.feeType       !== undefined) { fields.push(`fee_type = $${idx++}`);       values.push(input.feeType); }
    if (input.feeValue      !== undefined) { fields.push(`fee_value = $${idx++}`);      values.push(input.feeValue); }
    if (input.deductFrom    !== undefined) { fields.push(`deduct_from = $${idx++}`);    values.push(input.deductFrom); }
    if (input.isGeneral     !== undefined) { fields.push(`is_general = $${idx++}`);     values.push(input.isGeneral); }
    if (input.isActive      !== undefined) { fields.push(`is_active = $${idx++}`);      values.push(input.isActive); }
    if (input.validFrom     !== undefined) { fields.push(`valid_from = $${idx++}`);     values.push(input.validFrom); }
    if ('validUntil' in input)             { fields.push(`valid_until = $${idx++}`);    values.push(input.validUntil ?? null); }

    values.push(sourceCode);
    const { rows } = await client.query(
      `UPDATE source_fee_rules SET ${fields.join(', ')} WHERE source_code = $${idx} RETURNING *`,
      values,
    );
    if (!rows.length) throw Object.assign(new Error('Source not found'), { statusCode: 404, code: 'NOT_FOUND' });

    const isGeneralNow = (rows[0] as Record<string, unknown>).is_general as boolean;
    const rates = (!isGeneralNow && input.specialtyRates !== undefined)
      ? input.specialtyRates
      : undefined;

    if (rates !== undefined) {
      await replaceSpecialtyRates(client, sourceCode, rates);
    } else if (isGeneralNow) {
      await client.query(`DELETE FROM source_specialty_rates WHERE source_code = $1`, [sourceCode]);
    }

    const finalRates = rates ?? await fetchSpecialtyRates(pool as unknown as { query: typeof pool.query }, sourceCode);
    return rowToSource(rows[0] as Record<string, unknown>, finalRates);
  });
}

export async function deleteSource(sourceCode: string): Promise<void> {
  const result = await pool.query(
    `DELETE FROM source_fee_rules WHERE source_code = $1`,
    [sourceCode],
  );
  if (result.rowCount === 0) throw Object.assign(new Error('Source not found'), { statusCode: 404, code: 'NOT_FOUND' });
}

export async function updatePaymentStatusByAppointmentId(appointmentId: string, status: string): Promise<void> {
  await pool.query(
    `UPDATE financial_transactions SET payment_status = $2 WHERE appointment_id = $1`,
    [appointmentId, status],
  );
}

export async function refundTransactionByAppointmentId(appointmentId: string): Promise<void> {
  await pool.query(
    `UPDATE financial_transactions SET payment_status = 'refunded' WHERE appointment_id = $1`,
    [appointmentId],
  );
}

// ─── Bulk Operations ──────────────────────────────────────────────────────────

export async function bulkDeleteTransactions(
  ids: string[],
  reason: string,
  performedBy: string,
  branchId: number,
  ipAddress?: string,
): Promise<{ deletedCount: number }> {
  return withTransaction(async (client: PoolClient) => {
    const { rows: existing } = await client.query(
      `SELECT id, payment_status FROM financial_transactions WHERE id = ANY($1::uuid[]) FOR UPDATE`,
      [ids],
    );

    const reconciled = (existing as Record<string, unknown>[]).filter((r) => r.payment_status === 'reconciled');
    if (reconciled.length > 0) {
      throw Object.assign(new Error('Cannot delete reconciled transactions'), { statusCode: 403, code: 'RECONCILED_TRANSACTIONS' });
    }

    const { rows: snapshot } = await client.query(
      `SELECT * FROM financial_transactions WHERE id = ANY($1::uuid[])`,
      [ids],
    );

    await client.query(`DELETE FROM transaction_extra_services WHERE transaction_id = ANY($1::uuid[])`, [ids]);

    const { rowCount } = await client.query(
      `DELETE FROM financial_transactions WHERE id = ANY($1::uuid[])`,
      [ids],
    );

    await client.query(
      `INSERT INTO billing_bulk_audit_log
         (action_type, performed_by, affected_ids, deleted_snapshot, reason, ip_address, branch_id)
       VALUES ('BULK_DELETE', $1, $2, $3, $4, $5, $6)`,
      [performedBy, ids, JSON.stringify(snapshot), reason, ipAddress ?? null, branchId],
    );

    return { deletedCount: rowCount ?? 0 };
  });
}

export async function bulkUpdatePaymentMethod(
  ids: string[],
  paymentMethod: string,
  reason: string,
  performedBy: string,
  branchId: number,
  ipAddress?: string,
): Promise<{ updatedCount: number }> {
  return withTransaction(async (client: PoolClient) => {
    const { rows: before } = await client.query(
      `SELECT id, payment_method FROM financial_transactions WHERE id = ANY($1::uuid[]) FOR UPDATE`,
      [ids],
    );

    const { rowCount } = await client.query(
      `UPDATE financial_transactions SET payment_method = $2 WHERE id = ANY($1::uuid[])`,
      [ids, paymentMethod],
    );

    const changes = {
      field: 'payment_method',
      before: (before as Record<string, unknown>[]).map((r) => ({ id: r.id, value: r.payment_method })),
      after: ids.map((id) => ({ id, value: paymentMethod })),
    };

    await client.query(
      `INSERT INTO billing_bulk_audit_log
         (action_type, performed_by, affected_ids, changes, reason, ip_address, branch_id)
       VALUES ('BULK_EDIT', $1, $2, $3, $4, $5, $6)`,
      [performedBy, ids, JSON.stringify(changes), reason, ipAddress ?? null, branchId],
    );

    return { updatedCount: rowCount ?? 0 };
  });
}
