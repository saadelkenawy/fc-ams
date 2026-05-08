import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { billingClient, patientClient } from '../clients/internal';
import { buildPdf } from '../utils/pdf';
import type { PdfColumn } from '../utils/pdf';

const monthsSchema = z.object({
  months: z.coerce.number().int().min(1).max(24).default(7),
});

const topNSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(5),
});

const settlementQuerySchema = z.object({
  doctorId:   z.string().uuid().optional(),
  dateFrom:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  doctorName: z.string().max(200).optional(),
});

interface TxRow {
  approved_charge?: string | number;
  doctor_share?: string | number;
  clinic_share?: string | number;
  patient_source?: string;
  transaction_date?: string;
  doctor_id?: string;
}

interface ApptRow {
  status?: string;
  appointment_date?: string;
  doctor_id?: string;
}

interface SourceLabel {
  en: string;
  ar: string;
}

interface MonthlyRevenue {
  month: string;
  revenue: number;
  doctorShare: number;
  clinicShare: number;
  appointments: number;
}

interface SourceStat {
  sourceCode:   string;
  sourceNameEn: string;
  sourceNameAr: string;
  count:        number;
  pct:          number;
  revenue:      number;
}

interface DoctorStat {
  doctorId: string;
  revenue: number;
  appointments: number;
  share: number;
}

const SOURCE_LABELS: Record<string, SourceLabel> = {
  "Cl.'s": { en: 'Clinic Direct',    ar: 'مباشر'       },
  "Dr.'s": { en: 'Doctor Referral',  ar: 'إحالة طبيب'  },
  'VEZ':   { en: 'Vizita',           ar: 'فيزيتا'      },
  'EKF':   { en: 'Ekshf',            ar: 'اكشف'        },
  'DO':    { en: 'CliniDo',          ar: 'كلينيدو'     },
  'SHL':   { en: 'Shamel',           ar: 'شامل'        },
};

function toNum(val: string | number | undefined): number {
  return parseFloat(String(val ?? 0)) || 0;
}

function currentYearMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function prevYearMonth(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
}

function txMonth(tx: TxRow): string {
  return (tx.transaction_date ?? '').slice(0, 7);
}

async function fetchTransactions(limit: number): Promise<TxRow[]> {
  try {
    const res = await billingClient.get<{ data: TxRow[] } | TxRow[]>(
      '/transactions',
      { params: { limit } },
    );
    const body = res.data;
    if (Array.isArray(body)) return body;
    if (body && Array.isArray((body as { data: TxRow[] }).data)) {
      return (body as { data: TxRow[] }).data;
    }
    return [];
  } catch {
    return [];
  }
}

export async function getOverview(_req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const [txns, patientsRes] = await Promise.allSettled([
    fetchTransactions(500),
    patientClient.get<{ total?: number; data?: unknown[] }>('/patients', { params: { limit: 1 } }).catch(() => null),
  ]);

  const transactions = txns.status === 'fulfilled' ? txns.value : [];

  const thisMonth = currentYearMonth();
  const lastMonth = prevYearMonth();

  let currentRevenue  = 0;
  let previousRevenue = 0;
  let currentAppts    = 0;

  for (const tx of transactions) {
    const m = txMonth(tx);
    const charge = toNum(tx.approved_charge);
    if (m === thisMonth) { currentRevenue += charge; currentAppts++; }
    if (m === lastMonth) previousRevenue += charge;
  }

  const growthPct = previousRevenue === 0
    ? 0
    : Math.round(((currentRevenue - previousRevenue) / previousRevenue) * 1000) / 10;

  let totalPatients = 0;
  if (patientsRes.status === 'fulfilled' && patientsRes.value) {
    const body = patientsRes.value.data;
    totalPatients = body?.total ?? (Array.isArray(body?.data) ? body.data.length : 0);
  }

  void reply.send({
    success: true,
    data: {
      revenue:      { current: currentRevenue, previous: previousRevenue, growthPct },
      appointments: { current: currentAppts,   previous: 0, growthPct: 0 },
      patients:     { total: totalPatients },
      noShowRate:   { current: 0 },
    },
  });
}

export async function getMonthlyRevenue(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { months } = monthsSchema.parse(req.query);
  const transactions = await fetchTransactions(1000);

  const map = new Map<string, MonthlyRevenue>();

  for (const tx of transactions) {
    const m = txMonth(tx);
    if (!m) continue;
    if (!map.has(m)) {
      map.set(m, { month: m, revenue: 0, doctorShare: 0, clinicShare: 0, appointments: 0 });
    }
    const entry = map.get(m)!;
    entry.revenue      += toNum(tx.approved_charge);
    entry.doctorShare  += toNum(tx.doctor_share);
    entry.clinicShare  += toNum(tx.clinic_share);
    entry.appointments += 1;
  }

  const sorted = Array.from(map.values())
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-months);

  void reply.send({ success: true, data: sorted });
}

export async function getSourceBreakdown(_req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const transactions = await fetchTransactions(1000);

  const map = new Map<string, { count: number; revenue: number }>();

  for (const tx of transactions) {
    const src = tx.patient_source ?? 'Unknown';
    if (!map.has(src)) map.set(src, { count: 0, revenue: 0 });
    const entry = map.get(src)!;
    entry.count   += 1;
    entry.revenue += toNum(tx.approved_charge);
  }

  const total = transactions.length;

  const data: SourceStat[] = Array.from(map.entries()).map(([source, stats]) => {
    const label = SOURCE_LABELS[source] ?? { en: source, ar: source };
    return {
      sourceCode:   source,
      sourceNameEn: label.en,
      sourceNameAr: label.ar,
      count:        stats.count,
      pct:          total === 0 ? 0 : Math.round((stats.count / total) * 1000) / 10,
      revenue:      stats.revenue,
    };
  });

  void reply.send({ success: true, data });
}

export async function getTopDoctors(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { limit: topN } = topNSchema.parse(req.query);
  const transactions = await fetchTransactions(1000);

  const map = new Map<string, { revenue: number; appointments: number }>();

  for (const tx of transactions) {
    const id = tx.doctor_id ?? 'unknown';
    if (!map.has(id)) map.set(id, { revenue: 0, appointments: 0 });
    const entry = map.get(id)!;
    entry.revenue      += toNum(tx.approved_charge);
    entry.appointments += 1;
  }

  const totalRevenue = Array.from(map.values()).reduce((s, e) => s + e.revenue, 0);

  const data: DoctorStat[] = Array.from(map.entries())
    .map(([doctorId, stats]) => ({
      doctorId,
      revenue:      stats.revenue,
      appointments: stats.appointments,
      share:        totalRevenue === 0 ? 0 : Math.round((stats.revenue / totalRevenue) * 1000) / 10,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, topN);

  void reply.send({ success: true, data });
}

// ── Settlement Report ──────────────────────────────────────────────────────

interface TxDetail {
  transaction_date?: string;
  approved_charge?: string | number;
  doctor_share?: string | number;
  source_fee_amount?: string | number;
  patient_source?: string;
  status?: string;
}

export async function getSettlementReport(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const query = settlementQuerySchema.parse(req.query);
  const params: Record<string, string> = {};
  if (query.dateFrom)  params.dateFrom = query.dateFrom;
  if (query.dateTo)    params.dateTo   = query.dateTo;
  if (query.doctorId)  params.doctorId = query.doctorId;
  params.limit = '500';

  let txns: TxDetail[] = [];
  try {
    const res = await billingClient.get<{ data?: TxDetail[] } | TxDetail[]>('/transactions', { params });
    const body = res.data;
    txns = Array.isArray(body) ? body : ((body as { data?: TxDetail[] }).data ?? []);
  } catch { txns = []; }

  const totalGross  = txns.reduce((s, t) => s + toNum(t.approved_charge), 0);
  const totalDoctor = txns.reduce((s, t) => s + toNum(t.doctor_share), 0);
  const totalSource = txns.reduce((s, t) => s + toNum(t.source_fee_amount), 0);
  const net         = totalDoctor - totalSource;

  const fmt = (n: unknown) => `EGP ${Number(n ?? 0).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  type TxRow = { date: string; charge: string; doctorShare: string; sourceFee: string; net: string; source: string; status: string };

  const columns: PdfColumn<TxRow>[] = [
    { header: 'Date',         key: 'date',        width: 75 },
    { header: 'Gross',        key: 'charge',       width: 80 },
    { header: 'Dr. Share',    key: 'doctorShare',  width: 80 },
    { header: 'Source Fee',   key: 'sourceFee',    width: 80 },
    { header: 'Net',          key: 'net',          width: 80 },
    { header: 'Source',       key: 'source',       width: 60 },
    { header: 'Status',       key: 'status',       width: 60 },
  ];

  const rows: TxRow[] = txns.map((t) => ({
    date:        (t.transaction_date ?? '').slice(0, 10),
    charge:      fmt(t.approved_charge),
    doctorShare: fmt(t.doctor_share),
    sourceFee:   fmt(t.source_fee_amount),
    net:         fmt(toNum(t.doctor_share) - toNum(t.source_fee_amount)),
    source:      String(t.patient_source ?? ''),
    status:      String(t.status ?? ''),
  }));

  const stream = buildPdf({
    title:    `Settlement Report — ${query.doctorName ?? query.doctorId ?? 'All Doctors'}`,
    subtitle: `Period: ${query.dateFrom ?? 'All time'} → ${query.dateTo ?? 'Today'} | ${txns.length} transactions`,
    columns,
    rows,
    summary: [
      { label: 'Total Gross',   value: fmt(totalGross)  },
      { label: 'Doctor Share',  value: fmt(totalDoctor) },
      { label: 'Source Fees',   value: fmt(totalSource) },
      { label: 'Net Payable',   value: fmt(net)         },
    ],
  });

  void reply.type('application/pdf')
    .header('Content-Disposition', `attachment; filename="settlement-${Date.now()}.pdf"`)
    .send(stream);
}

// ── Monthly Financial Summary Report ──────────────────────────────────────

export async function getFinancialSummaryReport(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { months } = z.object({ months: z.coerce.number().int().min(1).max(24).default(6) }).parse(req.query);
  const transactions = await fetchTransactions(1000);

  const map = new Map<string, { revenue: number; doctorShare: number; clinicShare: number; count: number }>();

  for (const tx of transactions) {
    const m = txMonth(tx);
    if (!m) continue;
    if (!map.has(m)) map.set(m, { revenue: 0, doctorShare: 0, clinicShare: 0, count: 0 });
    const e = map.get(m)!;
    e.revenue     += toNum(tx.approved_charge);
    e.doctorShare += toNum(tx.doctor_share);
    e.clinicShare += toNum(tx.clinic_share);
    e.count       += 1;
  }

  const sorted = Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-months);

  const fmt = (n: number) => `EGP ${n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  type MonthRow = { month: string; revenue: string; doctorShare: string; clinicShare: string; txCount: string };

  const columns: PdfColumn<MonthRow>[] = [
    { header: 'Month',         key: 'month',       width: 90 },
    { header: 'Total Revenue', key: 'revenue',     width: 110 },
    { header: 'Doctor Share',  key: 'doctorShare',  width: 110 },
    { header: 'Clinic Share',  key: 'clinicShare',  width: 110 },
    { header: 'Transactions',  key: 'txCount',      width: 95 },
  ];

  const rows: MonthRow[] = sorted.map(([month, e]) => ({
    month,
    revenue:     fmt(e.revenue),
    doctorShare: fmt(e.doctorShare),
    clinicShare: fmt(e.clinicShare),
    txCount:     String(e.count),
  }));

  const totalRevenue = sorted.reduce((s, [, e]) => s + e.revenue, 0);
  const totalDoctor  = sorted.reduce((s, [, e]) => s + e.doctorShare, 0);
  const totalClinic  = sorted.reduce((s, [, e]) => s + e.clinicShare, 0);

  const stream = buildPdf({
    title:    'Monthly Financial Summary',
    subtitle: `Last ${months} months | Generated ${new Date().toLocaleDateString('en')}`,
    columns,
    rows,
    summary: [
      { label: 'Total Revenue',   value: fmt(totalRevenue) },
      { label: 'Doctor Shares',   value: fmt(totalDoctor)  },
      { label: 'Clinic Earnings', value: fmt(totalClinic)  },
      { label: 'Avg / Month',     value: fmt(totalRevenue / Math.max(sorted.length, 1)) },
    ],
  });

  void reply.type('application/pdf')
    .header('Content-Disposition', `attachment; filename="financial-summary-${Date.now()}.pdf"`)
    .send(stream);
}
