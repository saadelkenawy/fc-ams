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

// Source fee percentages by patient source code
const SOURCE_FEES: Record<string, number> = {
  VEZ: 10,
  EKF: 8,
  SHL: 5,
  DO: 0,
};

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

    const sourceFeePercentage = SOURCE_FEES[input.patientSource] ?? 0;
    const sourceFeeAmount = input.approvedCharge * sourceFeePercentage / 100;
    const grossRevenue = input.approvedCharge + (input.procedureCost ?? 0);
    const doctorShare = grossRevenue * input.splitDoctorPercentage / 100;
    const clinicShare = grossRevenue * input.splitClinicPercentage / 100;
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
      `SELECT id FROM financial_transactions WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (!existing.length) {
      throw Object.assign(new Error('Transaction not found'), { code: 'TRANSACTION_NOT_FOUND', statusCode: 404 });
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
      `SELECT ft.*, d.name_en AS doctor_name_en
       FROM financial_transactions ft
       JOIN doctors d ON ft.doctor_id = d.id
       WHERE ft.doctor_id = $1
         AND ft.transaction_date BETWEEN $2 AND $3`,
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
    const doctorNameEn = (rows[0] as Record<string, unknown>).doctor_name_en as string;

    const totalConsultations = rows.filter((r) => !(r as Record<string, unknown>).procedure_id).length;
    const totalProcedures = rows.filter((r) => (r as Record<string, unknown>).procedure_id).length;
    const grossRevenue = transactions.reduce((s, t) => s + t.grossRevenue, 0);
    const doctorShare = transactions.reduce((s, t) => s + t.doctorShare, 0);
    const clinicShare = transactions.reduce((s, t) => s + t.clinicShare, 0);
    const totalSourceFees = transactions.reduce((s, t) => s + t.sourceFeeAmount, 0);
    const netPayable = doctorShare - totalSourceFees;

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
         WHERE transaction_date BETWEEN $1 AND $2 AND doctor_id IS NOT NULL`,
        [params.from, params.to],
      ),
      client.query(
        `SELECT
           ft.doctor_id,
           d.name_en AS doctor_name_en,
           COUNT(*) FILTER (WHERE ft.procedure_id IS NULL)::int AS total_consultations,
           COUNT(*) FILTER (WHERE ft.procedure_id IS NOT NULL)::int AS total_procedures,
           SUM(ft.gross_revenue)          AS gross_revenue,
           SUM(ft.doctor_share)           AS doctor_share,
           SUM(ft.clinic_share)           AS clinic_share,
           SUM(ft.source_fee_amount)      AS total_source_fees,
           SUM(ft.doctor_share) - SUM(ft.source_fee_amount) AS net_payable
         FROM financial_transactions ft
         JOIN doctors d ON ft.doctor_id = d.id
         WHERE ft.transaction_date BETWEEN $1 AND $2
           AND ft.doctor_id IS NOT NULL
         GROUP BY ft.doctor_id, d.name_en
         ORDER BY gross_revenue DESC
         LIMIT $3 OFFSET $4`,
        [params.from, params.to, limit, offset],
      ),
    ]);

    const total = (countRows[0] as { total: number }).total;

    const data = dataRows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        doctorId: row.doctor_id as string,
        doctorNameEn: row.doctor_name_en as string,
        period: { from: params.from, to: params.to },
        totalConsultations: Number(row.total_consultations),
        totalProcedures: Number(row.total_procedures),
        grossRevenue: Number(row.gross_revenue),
        doctorShare: Number(row.doctor_share),
        clinicShare: Number(row.clinic_share),
        totalSourceFees: Number(row.total_source_fees),
        netPayable: Number(row.net_payable),
        status: 'pending' as PaymentStatus,
      };
    });

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  });
}
