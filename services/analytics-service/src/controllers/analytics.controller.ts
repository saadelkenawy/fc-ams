import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { billingClient, patientClient, appointmentClient, doctorClient } from '../clients/internal';
import { buildPdf, buildInvoicePdf } from '../utils/pdf';
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
  approvedCharge?: string | number;
  doctorShare?: string | number;
  clinicShare?: string | number;
  patientSource?: string;
  transactionDate?: string;
  doctorId?: string;
}

interface ApptRow {
  status?: string;
  appointmentDate?: string;
  doctorId?: string;
  specialtyId?: number;
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
  doctorId:   string;
  nameEn:     string;
  nameAr:     string;
  specialtyId: number | null;
  revenue:    number;
  appointments: number;
  share:      number;
}

const SPECIALTY_LABELS: Record<number, SourceLabel> = {
  1:  { en: 'Gynecology & Infertility', ar: 'النساء والعقم' },
  2:  { en: 'Pediatrics & Newborn',     ar: 'الأطفال والمواليد' },
  4:  { en: 'Dentistry',                ar: 'الأسنان' },
  5:  { en: 'Psychiatry',               ar: 'الطب النفسي' },
  6:  { en: 'Physiotherapy',            ar: 'العلاج الطبيعي' },
  7:  { en: 'Dermatology',              ar: 'الجلدية' },
  11: { en: 'Dietitian & Nutrition',    ar: 'التغذية' },
  13: { en: 'Ophthalmology',            ar: 'العيون' },
  17: { en: 'Diabetes & Endocrinology', ar: 'السكر والغدد الصماء' },
  18: { en: 'Gastroenterology',         ar: 'الجهاز الهضمي' },
  24: { en: 'Internal Medicine',        ar: 'الباطنة' },
  25: { en: 'Neurology',                ar: 'الأعصاب' },
  27: { en: 'General Surgery',          ar: 'الجراحة العامة' },
  28: { en: 'Urology',                  ar: 'المسالك البولية' },
  30: { en: 'Cardiology',               ar: 'القلب' },
  32: { en: 'Oncology',                 ar: 'الأورام' },
  36: { en: 'ENT',                      ar: 'الأنف والأذن والحنجرة' },
  38: { en: 'Orthopedics',              ar: 'العظام' },
};

const DOW_LABELS: SourceLabel[] = [
  { en: 'Sunday',    ar: 'الأحد' },
  { en: 'Monday',    ar: 'الاثنين' },
  { en: 'Tuesday',   ar: 'الثلاثاء' },
  { en: 'Wednesday', ar: 'الأربعاء' },
  { en: 'Thursday',  ar: 'الخميس' },
  { en: 'Friday',    ar: 'الجمعة' },
  { en: 'Saturday',  ar: 'السبت' },
];

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
  return (tx.transactionDate ?? '').slice(0, 7);
}

async function fetchTransactions(maxRows: number): Promise<TxRow[]> {
  const PAGE = 100;
  const all: TxRow[] = [];
  try {
    let page = 1;
    while (all.length < maxRows) {
      const res = await billingClient.get<{ data: TxRow[]; totalPages?: number } | TxRow[]>(
        '/transactions',
        { params: { limit: PAGE, page } },
      );
      const body = res.data;
      const rows: TxRow[] = Array.isArray(body)
        ? body
        : ((body as { data: TxRow[] }).data ?? []);
      all.push(...rows);
      const totalPages = Array.isArray(body) ? 1 : ((body as { totalPages?: number }).totalPages ?? 1);
      if (rows.length < PAGE || page >= totalPages) break;
      page++;
    }
  } catch { /* billing unreachable — return what we have */ }
  return all.slice(0, maxRows);
}

async function fetchAppointments(maxRows: number): Promise<ApptRow[]> {
  const PAGE = 100;
  const all: ApptRow[] = [];
  try {
    let page = 1;
    while (all.length < maxRows) {
      const res = await appointmentClient.get<{ data: ApptRow[]; totalPages?: number } | ApptRow[]>(
        '/appointments',
        { params: { limit: PAGE, page } },
      );
      const body = res.data;
      const rows: ApptRow[] = Array.isArray(body)
        ? body
        : ((body as { data: ApptRow[] }).data ?? []);
      all.push(...rows);
      const totalPages = Array.isArray(body) ? 1 : ((body as { totalPages?: number }).totalPages ?? 1);
      if (rows.length < PAGE || page >= totalPages) break;
      page++;
    }
  } catch { /* appointment service unreachable */ }
  return all.slice(0, maxRows);
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
    const charge = toNum(tx.approvedCharge);
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
    entry.revenue      += toNum(tx.approvedCharge);
    entry.doctorShare  += toNum(tx.doctorShare);
    entry.clinicShare  += toNum(tx.clinicShare);
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
    const src = tx.patientSource ?? 'Unknown';
    if (!map.has(src)) map.set(src, { count: 0, revenue: 0 });
    const entry = map.get(src)!;
    entry.count   += 1;
    entry.revenue += toNum(tx.approvedCharge);
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
    const id = tx.doctorId ?? 'unknown';
    if (!map.has(id)) map.set(id, { revenue: 0, appointments: 0 });
    const entry = map.get(id)!;
    entry.revenue      += toNum(tx.approvedCharge);
    entry.appointments += 1;
  }

  const totalRevenue = Array.from(map.values()).reduce((s, e) => s + e.revenue, 0);

  const ranked = Array.from(map.entries())
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, topN);

  // Resolve doctor names in one batch call
  const nameMap = new Map<string, { nameEn: string; nameAr: string; specialtyId: number | null }>();
  try {
    const ids = ranked.map(([id]) => id).filter((id) => id !== 'unknown');
    if (ids.length) {
      const res = await doctorClient.get<{ data?: { id: string; nameEn: string; nameAr?: string; specialtyId?: number }[] }>(
        '/doctors',
        { params: { limit: 100 } },
      );
      for (const d of res.data.data ?? []) {
        nameMap.set(d.id, { nameEn: d.nameEn, nameAr: d.nameAr ?? d.nameEn, specialtyId: d.specialtyId ?? null });
      }
    }
  } catch { /* doctor service unreachable — return IDs only */ }

  const data: DoctorStat[] = ranked.map(([doctorId, stats]) => {
    const info = nameMap.get(doctorId);
    return {
      doctorId,
      nameEn:      info?.nameEn     ?? doctorId,
      nameAr:      info?.nameAr     ?? doctorId,
      specialtyId: info?.specialtyId ?? null,
      revenue:      stats.revenue,
      appointments: stats.appointments,
      share:        totalRevenue === 0 ? 0 : Math.round((stats.revenue / totalRevenue) * 1000) / 10,
    };
  });

  void reply.send({ success: true, data });
}

// ── Settlement Report ──────────────────────────────────────────────────────

interface TxDetail {
  transactionDate?: string;
  approvedCharge?: string | number;
  doctorShare?: string | number;
  sourceFeeAmount?: string | number;
  patientSource?: string;
  status?: string;
}

export async function getSettlementReport(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  let query: z.infer<typeof settlementQuerySchema>;
  try {
    query = settlementQuerySchema.parse(req.query);
  } catch {
    void reply.status(400).send({ success: false, error: { code: 'INVALID_PARAMS', message: 'Invalid query parameters' } });
    return;
  }

  const params: Record<string, string> = {};
  if (query.dateFrom)  params.dateFrom = query.dateFrom;
  if (query.dateTo)    params.dateTo   = query.dateTo;
  if (query.doctorId)  params.doctorId = query.doctorId;
  params.limit = '500';
  params.status = 'paid';

  let txns: TxDetail[] = [];
  try {
    const res = await billingClient.get<{ data?: TxDetail[] } | TxDetail[]>('/transactions', { params });
    const body = res.data;
    txns = Array.isArray(body) ? body : ((body as { data?: TxDetail[] }).data ?? []);
  } catch { txns = []; }

  const totalGross  = txns.reduce((s, t) => s + toNum(t.approvedCharge), 0);
  const totalDoctor = txns.reduce((s, t) => s + toNum(t.doctorShare), 0);
  const totalSource = txns.reduce((s, t) => s + toNum(t.sourceFeeAmount), 0);
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

  const rows: TxRow[] = txns.length > 0
    ? txns.map((t) => ({
        date:        (t.transactionDate ?? '').slice(0, 10),
        charge:      fmt(t.approvedCharge),
        doctorShare: fmt(t.doctorShare),
        sourceFee:   fmt(t.sourceFeeAmount),
        net:         fmt(toNum(t.doctorShare) - toNum(t.sourceFeeAmount)),
        source:      String(t.patientSource ?? ''),
        status:      String(t.status ?? ''),
      }))
    : [{ date: '—', charge: '—', doctorShare: '—', sourceFee: '—', net: '—', source: 'No transactions found for this period', status: '—' }];

  const buffer = await buildPdf({
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
    .send(buffer);
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
    e.revenue     += toNum(tx.approvedCharge);
    e.doctorShare += toNum(tx.doctorShare);
    e.clinicShare += toNum(tx.clinicShare);
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

  const buffer = await buildPdf({
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
    .send(buffer);
}

// ── Specialty Breakdown ────────────────────────────────────────────────────

interface SpecialtyStat {
  specialtyId:  number;
  specialtyEn:  string;
  specialtyAr:  string;
  revenue:      number;
  appointments: number;
  noShowRate:   number;
  sharePct:     number;
}

export async function getSpecialtyBreakdown(_req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const [appts, txns] = await Promise.all([
    fetchAppointments(2000),
    fetchTransactions(1000),
  ]);

  // Build doctorId → specialtyId from appointments (appointments carry specialtyId)
  const doctorSpecialty = new Map<string, number>();
  for (const a of appts) {
    if (a.doctorId && a.specialtyId) doctorSpecialty.set(a.doctorId, a.specialtyId);
  }

  // Revenue per doctorId from billing
  const doctorRevenue = new Map<string, number>();
  for (const tx of txns) {
    const id = tx.doctorId ?? 'unknown';
    doctorRevenue.set(id, (doctorRevenue.get(id) ?? 0) + toNum(tx.approvedCharge));
  }

  // Aggregate counts and no-shows per specialtyId from appointments
  const specMap = new Map<number, { revenue: number; count: number; noShow: number }>();
  for (const a of appts) {
    const sid = a.specialtyId;
    if (!sid) continue;
    if (!specMap.has(sid)) specMap.set(sid, { revenue: 0, count: 0, noShow: 0 });
    const e = specMap.get(sid)!;
    e.count += 1;
    if (a.status === 'Canc.') e.noShow += 1;
  }

  // Add billing revenue into each specialty bucket via doctorId mapping
  for (const [docId, rev] of doctorRevenue) {
    const sid = doctorSpecialty.get(docId);
    if (!sid) continue;
    if (!specMap.has(sid)) specMap.set(sid, { revenue: 0, count: 0, noShow: 0 });
    specMap.get(sid)!.revenue += rev;
  }

  const totalRevenue = Array.from(specMap.values()).reduce((s, e) => s + e.revenue, 0);

  const data: SpecialtyStat[] = Array.from(specMap.entries())
    .map(([specialtyId, e]) => {
      const label = SPECIALTY_LABELS[specialtyId] ?? { en: `Specialty ${specialtyId}`, ar: `تخصص ${specialtyId}` };
      return {
        specialtyId,
        specialtyEn:  label.en,
        specialtyAr:  label.ar,
        revenue:      e.revenue,
        appointments: e.count,
        noShowRate:   e.count === 0 ? 0 : Math.round((e.noShow / e.count) * 1000) / 10,
        sharePct:     totalRevenue === 0 ? 0 : Math.round((e.revenue / totalRevenue) * 1000) / 10,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  void reply.send({ success: true, data });
}

// ── Single-Transaction Invoice PDF ──────────────────────────────────────────

interface TxDetail2 {
  id: string;
  transactionDate?: string;
  patientId?: string;
  doctorId?: string;
  approvedCharge?: string | number;
  sourceFeeAmount?: string | number;
  vatRate?: number;
  paymentMethod?: string;
  paymentStatus?: string;
  visitType?: string;
  isRefund?: boolean;
  refundReason?: string;
  patientSource?: string;
}

interface PersonRecord { nameEn?: string; nameAr?: string; }

export async function getInvoicePdf(
  req: FastifyRequest<{ Params: { txId: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const { txId } = req.params;

  let tx: TxDetail2 | null = null;
  try {
    const res = await billingClient.get<TxDetail2 | { data?: TxDetail2 }>(`/transactions/${txId}`);
    const body = res.data;
    tx = (body && 'id' in body) ? body as TxDetail2 : ((body as { data?: TxDetail2 }).data ?? null);
  } catch {
    void reply.status(404).send({ error: 'Transaction not found' });
    return;
  }

  if (!tx) {
    void reply.status(404).send({ error: 'Transaction not found' });
    return;
  }

  let patientName = `Patient #${String(tx.patientId ?? '').slice(-8).toUpperCase()}`;
  let doctorName  = 'Fadl Clinic';

  if (tx.patientId) {
    try {
      const pr = await patientClient.get<PersonRecord | { data?: PersonRecord }>(`/patients/${tx.patientId}`);
      const pd = (pr.data && 'nameEn' in pr.data) ? pr.data as PersonRecord : ((pr.data as { data?: PersonRecord }).data ?? null);
      if (pd) patientName = pd.nameEn ?? pd.nameAr ?? patientName;
    } catch { /* non-critical */ }
  }

  if (tx.doctorId) {
    try {
      const dr = await doctorClient.get<PersonRecord | { data?: PersonRecord }>(`/doctors/${tx.doctorId}`);
      const dd = (dr.data && 'nameEn' in dr.data) ? dr.data as PersonRecord : ((dr.data as { data?: PersonRecord }).data ?? null);
      if (dd) doctorName = dd.nameEn ?? dd.nameAr ?? doctorName;
    } catch { /* non-critical */ }
  }

  const VISIT_LABEL: Record<string, string> = {
    consultation: 'Consultation & Examination',
    operative:    'Operative Procedure',
    online:       'Online Teleconsult',
  };
  const PAY_LABEL: Record<string, string> = {
    cash:          'Cash',
    instapay:      'InstaPay',
    bank_transfer: 'Bank Transfer',
    vfc_wallet:    'VFC Wallet',
    mobile_wallet: 'Mobile Wallet',
  };

  const charge    = toNum(tx.approvedCharge);
  const sourceFee = toNum(tx.sourceFeeAmount);

  const buffer = await buildInvoicePdf({
    invoiceId:     `INV-${String(tx.id).slice(-8).toUpperCase()}`,
    date:          tx.transactionDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    patientName,
    doctorName,
    visitType:     VISIT_LABEL[tx.visitType ?? ''] ?? 'Consultation & Examination',
    charge,
    sourceFee,
    vatRate:       tx.vatRate ?? 0.14,
    paymentMethod: PAY_LABEL[tx.paymentMethod ?? ''] ?? (tx.paymentMethod ?? 'Cash'),
    status:        tx.paymentStatus ?? 'paid',
    isRefund:      tx.isRefund ?? false,
    refundReason:  tx.refundReason,
  });

  void reply.type('application/pdf')
    .header('Content-Disposition', `attachment; filename="invoice-${String(tx.id).slice(-8).toUpperCase()}.pdf"`)
    .send(buffer);
}

// ── No-Show Rate by Day of Week ─────────────────────────────────────────────

export async function getNoShowByDay(_req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const appts = await fetchAppointments(2000);

  const dayMap = new Map<number, { total: number; cancelled: number }>();
  for (const a of appts) {
    if (!a.appointmentDate) continue;
    const dow = new Date(`${a.appointmentDate}T00:00:00`).getDay();
    if (!dayMap.has(dow)) dayMap.set(dow, { total: 0, cancelled: 0 });
    const e = dayMap.get(dow)!;
    e.total += 1;
    if (a.status === 'Canc.') e.cancelled += 1;
  }

  const data = [0, 1, 2, 3, 4, 5, 6].map((dow) => {
    const e     = dayMap.get(dow) ?? { total: 0, cancelled: 0 };
    const label = DOW_LABELS[dow];
    return {
      dayOfWeek:  dow,
      dayEn:      label.en,
      dayAr:      label.ar,
      total:      e.total,
      cancelled:  e.cancelled,
      noShowRate: e.total === 0 ? 0 : Math.round((e.cancelled / e.total) * 1000) / 10,
    };
  });

  void reply.send({ success: true, data });
}
