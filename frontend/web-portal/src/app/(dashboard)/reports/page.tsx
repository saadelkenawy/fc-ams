'use client';

import { useState } from 'react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { useQueryClient } from '@tanstack/react-query';
import {
  TrendingUp, TrendingDown, Download, Printer, Loader2, DollarSign, Activity, PieChart,
  RefreshCw, ChevronLeft, ChevronRight, BarChart2, Layers, FileDown,
} from 'lucide-react';
import { downloadCSV } from '@/lib/export';
import { analyticsApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useLang } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { useTransactions, useSettlements } from '@/hooks/useBilling';
import { useDoctors, useSpecialties } from '@/hooks/useDoctors';
import { useMonthlyRevenue, useSpecialtyBreakdown, useFinancialSummary, useSourceBreakdown, useAppointmentActivitySummary } from '@/hooks/useAnalytics';
import { useSources } from '@/hooks/useSources';
import type { DoctorSettlement } from '@fadl/types';

const REPORT_TABS = [
  { key: 'financial',   iconEl: DollarSign, labelAr: 'الملخص المالي',     labelEn: 'Financial Summary' },
  { key: 'settlements', iconEl: TrendingUp, labelAr: 'تسويات الأطباء',    labelEn: 'Doctor Settlements' },
  { key: 'sources',     iconEl: PieChart,   labelAr: 'مصادر المرضى',      labelEn: 'Patient Sources' },
  { key: 'activity',    iconEl: Activity,   labelAr: 'نشاط المواعيد',      labelEn: 'Appointment Activity' },
  { key: 'trends',      iconEl: BarChart2,  labelAr: 'الاتجاهات الشهرية', labelEn: 'Monthly Trends' },
  { key: 'specialties', iconEl: Layers,     labelAr: 'التخصصات',           labelEn: 'Specialties' },
] as const;
type ReportTab = typeof REPORT_TABS[number]['key'];

function monthRange(year: number, month: number) {
  const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

async function openPdf(path: string) {
  try {
    const res = await analyticsApi.get(path, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data as Blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  } catch (err) {
    console.error('Failed to download PDF', err);
  }
}

function StatRow({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-50 dark:border-neutral-700/50 last:border-0">
      <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
      <div className="text-end">
        <span className="text-sm font-semibold font-mono tabular-nums text-gray-900 dark:text-gray-100">{value}</span>
        {sub && <p className="text-xs text-gray-400 dark:text-gray-500">{sub}</p>}
      </div>
    </div>
  );
}

/* ──────────────── Financial Summary ──────────────── */
const PAY_LABEL_MAP: Record<string, Record<string, string>> = {
  en: { cash: 'Cash', instapay: 'InstaPay', bank_transfer: 'Bank Transfer', vfc_wallet: 'VFC Wallet', mobile_wallet: 'Mobile Wallet' },
  ar: { cash: 'كاش', instapay: 'InstaPay', bank_transfer: 'حوالة بنكية', vfc_wallet: 'VFC Wallet', mobile_wallet: 'محفظة موبايل' },
};
const VISIT_LABEL_MAP: Record<string, Record<string, string>> = {
  en: { consultation: 'Consultation', operative: 'Operative', online: 'Online' },
  ar: { consultation: 'استشارة', operative: 'إجراء', online: 'أونلاين' },
};
const VISIT_COLORS: Record<string, string> = {
  consultation: 'bg-primary-500',
  operative:    'bg-violet-500',
  online:       'bg-cyan-500',
};
const PAY_COLORS = ['bg-primary-500', 'bg-violet-500', 'bg-cyan-500', 'bg-amber-500', 'bg-rose-500'];

function FinancialReport({ lang, locale, from, to }: { lang: string; locale: string; from: string; to: string }) {
  const month = from.slice(0, 7);
  const { data, isLoading, isError } = useFinancialSummary(month);

  const payLabel = (k: string) => PAY_LABEL_MAP[lang]?.[k] ?? PAY_LABEL_MAP.en[k] ?? k;
  const visitLabel = (k: string) => VISIT_LABEL_MAP[lang]?.[k] ?? VISIT_LABEL_MAP.en[k] ?? k;

  if (isLoading) return (
    <div className="flex items-center justify-center py-20 text-gray-400">
      <Loader2 className="w-5 h-5 animate-spin me-2" />
      {lang === 'ar' ? 'جاري التحميل...' : 'Loading...'}
    </div>
  );
  if (isError || !data) return (
    <div className="flex items-center justify-center py-20 text-red-400 text-sm">
      {lang === 'ar' ? 'فشل تحميل البيانات — يرجى تحديث الصفحة.' : 'Failed to load financial data — please refresh the page.'}
    </div>
  );

  const { kpis, dailyBreakdown, byPaymentMethod, byVisitType, topDoctors, recentTransactions } = data;
  const maxDayRevenue   = Math.max(...dailyBreakdown.map((d) => d.revenue), 1);
  const totalPayments   = Object.values(byPaymentMethod).reduce((s, v) => s + v, 0) || 1;
  const totalVisit      = Object.values(byVisitType).reduce((s, v) => s + v, 0) || 1;

  const kpiCards = [
    {
      label: lang === 'ar' ? 'إجمالي الإيرادات' : 'Total Revenue',
      value: formatCurrency(kpis.totalRevenue, 'EGP', locale),
      sub:   `${kpis.transactionCount} ${lang === 'ar' ? 'معاملة' : 'transactions'}`,
      color: 'text-emerald-600 dark:text-emerald-400',
      bg:    'bg-emerald-50 dark:bg-emerald-900/20',
      icon:  <TrendingUp className="w-5 h-5" />,
    },
    {
      label: lang === 'ar' ? 'أرصدة معلقة' : 'Outstanding',
      value: formatCurrency(kpis.outstanding, 'EGP', locale),
      sub:   lang === 'ar' ? 'قيد الانتظار' : 'Pending collection',
      color: 'text-amber-600 dark:text-amber-400',
      bg:    'bg-amber-50 dark:bg-amber-900/20',
      icon:  <Activity className="w-5 h-5" />,
    },
    {
      label: lang === 'ar' ? 'المصروفات' : 'Total Expenses',
      value: formatCurrency(kpis.totalExpenses, 'EGP', locale),
      sub:   lang === 'ar' ? 'مشتريات موردين' : 'Procurement',
      color: 'text-rose-600 dark:text-rose-400',
      bg:    'bg-rose-50 dark:bg-rose-900/20',
      icon:  <TrendingDown className="w-5 h-5" />,
    },
    {
      label: lang === 'ar' ? 'صافي الربح' : 'Net Profit',
      value: formatCurrency(kpis.netProfit, 'EGP', locale),
      sub:   `${kpis.profitMargin}% ${lang === 'ar' ? 'هامش' : 'margin'}`,
      color: kpis.netProfit >= 0 ? 'text-primary-600 dark:text-primary-400' : 'text-rose-600 dark:text-rose-400',
      bg:    kpis.netProfit >= 0 ? 'bg-primary-50 dark:bg-primary-900/20' : 'bg-rose-50 dark:bg-rose-900/20',
      icon:  <DollarSign className="w-5 h-5" />,
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between gap-2 mb-3">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 leading-snug">{kpi.label}</p>
                <span className={`flex-shrink-0 p-1.5 rounded-lg ${kpi.bg} ${kpi.color}`}>{kpi.icon}</span>
              </div>
              <p className={`text-xl font-bold font-mono tabular-nums ${kpi.color}`}>{kpi.value}</p>
              {kpi.sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{kpi.sub}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Daily Revenue Trend */}
      {dailyBreakdown.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{lang === 'ar' ? 'الإيرادات اليومية' : 'Daily Revenue Trend'}</CardTitle>
            <Button size="sm" variant="outline" onClick={() => openPdf(`/reports/settlement?dateFrom=${from}&dateTo=${to}`)}>
              <FileDown className="w-3.5 h-3.5" />
              PDF
            </Button>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-px h-32">
              {dailyBreakdown.map((d) => {
                const pct = (d.revenue / maxDayRevenue) * 100;
                return (
                  <div
                    key={d.date}
                    className="flex-1 flex flex-col items-center gap-0.5 group"
                    title={`${d.date}: ${formatCurrency(d.revenue, 'EGP', locale)}`}
                  >
                    <div
                      className="w-full bg-primary-500/80 hover:bg-primary-600 rounded-t transition-colors cursor-default"
                      style={{ height: `${Math.max(pct, 2)}%` }}
                    />
                    {dailyBreakdown.length <= 31 && (
                      <span className="text-[9px] text-gray-400 leading-none">{d.date.slice(8)}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment Methods + Visit Types */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>{lang === 'ar' ? 'طرق السداد' : 'Payment Methods'}</CardTitle></CardHeader>
          <CardContent>
            {Object.entries(byPaymentMethod).length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">{lang === 'ar' ? 'لا توجد بيانات' : 'No data'}</p>
            )}
            {Object.entries(byPaymentMethod).sort((a, b) => b[1] - a[1]).map(([method, amount], i) => {
              const pct = (amount / totalPayments) * 100;
              return (
                <div key={method} className="mb-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-600 dark:text-gray-400">{payLabel(method)}</span>
                    <div className="flex gap-3">
                      <span className="text-gray-400">{pct.toFixed(1)}%</span>
                      <span className="font-mono font-medium text-gray-900 dark:text-gray-100">{formatCurrency(amount, 'EGP', locale)}</span>
                    </div>
                  </div>
                  <div className="h-2 bg-gray-100 dark:bg-neutral-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full origin-left transition-transform duration-500 ${PAY_COLORS[i % PAY_COLORS.length]}`}
                      style={{ transform: `scaleX(${pct / 100})` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{lang === 'ar' ? 'أنواع الزيارات' : 'Visit Types'}</CardTitle></CardHeader>
          <CardContent>
            {Object.keys(byVisitType).length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">{lang === 'ar' ? 'لا توجد بيانات' : 'No data'}</p>
            )}
            {Object.keys(byVisitType).length > 0 && (
              <>
                <div className="flex h-3 rounded-full overflow-hidden mb-4 gap-px">
                  {Object.entries(byVisitType).sort((a, b) => b[1] - a[1]).map(([vt, amt]) => (
                    <div
                      key={vt}
                      className={`${VISIT_COLORS[vt] ?? 'bg-gray-400'} transition-all`}
                      style={{ width: `${(amt / totalVisit) * 100}%` }}
                      title={`${visitLabel(vt)}: ${formatCurrency(amt, 'EGP', locale)}`}
                    />
                  ))}
                </div>
                {Object.entries(byVisitType).sort((a, b) => b[1] - a[1]).map(([vt, amt]) => (
                  <div key={vt} className="flex items-center justify-between py-2.5 border-b border-gray-50 dark:border-neutral-700/50 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${VISIT_COLORS[vt] ?? 'bg-gray-400'}`} />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{visitLabel(vt)}</span>
                    </div>
                    <div className="text-end">
                      <span className="text-sm font-mono font-medium text-gray-900 dark:text-gray-100">{formatCurrency(amt, 'EGP', locale)}</span>
                      <span className="text-xs text-gray-400 ms-2">{((amt / totalVisit) * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                ))}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Performing Doctors */}
      {topDoctors.length > 0 && (
        <Card>
          <CardHeader><CardTitle>{lang === 'ar' ? 'أعلى الأطباء إيراداً' : 'Top Performing Doctors'}</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50 dark:border-neutral-700 bg-gray-50/50 dark:bg-neutral-900/40">
                  <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">#</th>
                  <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{lang === 'ar' ? 'الطبيب' : 'Doctor'}</th>
                  <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{lang === 'ar' ? 'المعاملات' : 'Txns'}</th>
                  <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{lang === 'ar' ? 'الإيرادات' : 'Revenue'}</th>
                  <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{lang === 'ar' ? 'حصة الطبيب' : 'Dr. Share'}</th>
                  <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{lang === 'ar' ? 'حصة العيادة' : 'Clinic'}</th>
                </tr>
              </thead>
              <tbody>
                {topDoctors.map((dr, i) => (
                  <tr key={dr.doctorId} className="border-b border-gray-50 dark:border-neutral-700/50 hover:bg-gray-50/50 dark:hover:bg-neutral-700/30 transition-colors">
                    <td className="px-5 py-3 text-gray-400 tabular-nums">{i + 1}</td>
                    <td className="px-5 py-3 font-medium text-gray-900 dark:text-gray-100">{lang === 'ar' ? dr.nameAr : dr.nameEn}</td>
                    <td className="px-5 py-3 tabular-nums text-gray-600 dark:text-gray-400">{formatNumber(dr.transactions, locale)}</td>
                    <td className="px-5 py-3 font-mono tabular-nums text-gray-900 dark:text-gray-100">{formatCurrency(dr.revenue, 'EGP', locale)}</td>
                    <td className="px-5 py-3 font-mono tabular-nums text-violet-600 dark:text-violet-400">{formatCurrency(dr.doctorShare, 'EGP', locale)}</td>
                    <td className="px-5 py-3 font-mono tabular-nums text-emerald-600 dark:text-emerald-400">{formatCurrency(dr.revenue - dr.doctorShare, 'EGP', locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Recent High-Value Transactions */}
      {recentTransactions.length > 0 && (
        <Card>
          <CardHeader><CardTitle>{lang === 'ar' ? 'أعلى المعاملات قيمةً' : 'Top Transactions by Value'}</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50 dark:border-neutral-700 bg-gray-50/50 dark:bg-neutral-900/40">
                  <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{lang === 'ar' ? 'التاريخ' : 'Date'}</th>
                  <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{lang === 'ar' ? 'نوع الزيارة' : 'Type'}</th>
                  <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{lang === 'ar' ? 'طريقة الدفع' : 'Payment'}</th>
                  <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{lang === 'ar' ? 'المصدر' : 'Source'}</th>
                  <th className="text-end px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{lang === 'ar' ? 'المبلغ' : 'Amount'}</th>
                </tr>
              </thead>
              <tbody>
                {recentTransactions.map((tx) => (
                  <tr key={tx.id || tx.transactionDate} className="border-b border-gray-50 dark:border-neutral-700/50 hover:bg-gray-50/50 dark:hover:bg-neutral-700/30 transition-colors">
                    <td className="px-5 py-3 tabular-nums text-gray-600 dark:text-gray-400">{tx.transactionDate}</td>
                    <td className="px-5 py-3"><Badge variant="outline">{visitLabel(tx.visitType)}</Badge></td>
                    <td className="px-5 py-3 text-gray-600 dark:text-gray-400">{payLabel(tx.paymentMethod)}</td>
                    <td className="px-5 py-3"><Badge variant="outline">{tx.patientSource}</Badge></td>
                    <td className="px-5 py-3 text-end font-mono font-semibold tabular-nums text-gray-900 dark:text-gray-100">{formatCurrency(tx.approvedCharge, 'EGP', locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ──────────────── Doctor Settlements ──────────────── */
function SettlementsReport({ lang, locale, from, to, doctorId }: { lang: string; locale: string; from: string; to: string; doctorId?: string }) {
  const { data, isLoading, isError } = useSettlements({ from, to });
  const { data: doctorsData } = useDoctors({ limit: 100 });
  const allDoctors = doctorsData?.data ?? [];
  const rawSettlements = data?.data ?? [];
  const settlements = doctorId ? rawSettlements.filter((s: DoctorSettlement) => s.doctorId === doctorId) : rawSettlements;
  const [settlBodyRef] = useAutoAnimate();

  if (isLoading) return (
    <div className="flex items-center justify-center py-20 text-gray-400">
      <Loader2 className="w-5 h-5 animate-spin me-2" />
      Loading...
    </div>
  );
  if (isError) return (
    <div className="flex items-center justify-center py-20 text-red-400 text-sm">
      Failed to load settlement data — please refresh the page.
    </div>
  );

  const totalDue = settlements.reduce((s: number, d: DoctorSettlement) => s + (d.doctorShare ?? 0), 0);

  return (
    <div className="animate-fade-in space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{lang === 'ar' ? 'إجمالي مستحق' : 'Total Due'}</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-primary-700 dark:text-primary-400">{formatCurrency(totalDue, 'EGP', locale)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{lang === 'ar' ? 'عدد الأطباء' : 'Doctors'}</p>
            <p className="text-2xl font-bold font-mono text-gray-900 dark:text-gray-100">{formatNumber(settlements.length, locale)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 flex items-start justify-between gap-2">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{lang === 'ar' ? 'الفترة' : 'Period'}</p>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{new Date(from).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US', { month: 'long', year: 'numeric' })}</p>
            </div>
            <Button size="sm" variant="outline" className="mt-0.5 flex-shrink-0" onClick={() => openPdf(`/reports/settlement?dateFrom=${from}&dateTo=${to}`)}>
              <FileDown className="w-3.5 h-3.5" />
              PDF
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50 dark:border-neutral-700 bg-gray-50/50 dark:bg-neutral-900/40">
                <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{lang === 'ar' ? 'الطبيب'         : 'Doctor'}</th>
                <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{lang === 'ar' ? 'معاملات'        : 'Txns'}</th>
                <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{lang === 'ar' ? 'إجمالي المحصل' : 'Total Charged'}</th>
                <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{lang === 'ar' ? 'حصة الطبيب'    : 'Doctor Share'}</th>
                <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{lang === 'ar' ? 'الحالة'         : 'Status'}</th>
                <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400" />
              </tr>
            </thead>
            <tbody ref={settlBodyRef}>
              {settlements.map((s: DoctorSettlement, i: number) => {
                const dr = allDoctors.find((d) => d.id === s.doctorId);
                const drName = lang === 'ar' ? (dr?.nameAr ?? dr?.nameEn ?? s.doctorId) : (dr?.nameEn ?? s.doctorId);
                const drNameEn = dr?.nameEn ?? String(s.doctorId ?? '');
                return (
                  <tr key={s.doctorId ?? i} className="border-b border-gray-50 dark:border-neutral-700/50 hover:bg-gray-50/50 dark:hover:bg-neutral-700/30 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-gray-900 dark:text-gray-100">{drName}</td>
                    <td className="px-5 py-3.5 font-mono tabular-nums text-gray-600 dark:text-gray-400">{formatNumber(s.totalConsultations ?? 0, locale)}</td>
                    <td className="px-5 py-3.5 font-mono tabular-nums text-gray-700 dark:text-gray-300">{formatCurrency(s.grossRevenue ?? 0, 'EGP', locale)}</td>
                    <td className="px-5 py-3.5 font-mono tabular-nums font-semibold text-primary-700 dark:text-primary-400">{formatCurrency(s.doctorShare ?? 0, 'EGP', locale)}</td>
                    <td className="px-5 py-3.5">
                      {(s.status === 'paid' || s.status === 'reconciled')
                        ? <Badge variant="success">{lang === 'ar' ? 'مُسوَّى' : 'Settled'}</Badge>
                        : s.status === 'approved'
                        ? <Badge variant="default">{lang === 'ar' ? 'معتمد' : 'Approved'}</Badge>
                        : <Badge variant="warning">{lang === 'ar' ? 'بانتظار التسوية' : 'Pending'}</Badge>}
                    </td>
                    <td className="px-5 py-3.5">
                      {s.doctorId && (
                        <button
                          type="button"
                          title={lang === 'ar' ? 'تحميل PDF' : 'Download PDF'}
                          className="text-gray-400 hover:text-primary-600 transition-colors"
                          onClick={() => openPdf(`/reports/settlement?doctorId=${s.doctorId}&dateFrom=${from}&dateTo=${to}&doctorName=${encodeURIComponent(drNameEn)}`)}
                        >
                          <FileDown className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {settlements.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400">{lang === 'ar' ? 'لا بيانات' : 'No data'}</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

/* ──────────────── Source Breakdown ──────────────── */
const SOURCE_COLORS: Record<string, string> = {
  VEZ:     '#D97706',
  EKF:     '#F87171',
  DO:      '#6366F1',
  SHL:     '#10B981',
  "Cl.'s": '#F59E0B',
  "Dr.'s": '#8B5CF6',
};

function SourcesReport({ lang, locale, from, to }: { lang: string; locale: string; from: string; to: string }) {
  const { data: sources, isLoading, isError } = useSourceBreakdown(from, to);
  const { data: feeRules }   = useSources();
  const { data: specialties } = useSpecialties();

  const specialtyMap = new Map<number, string>();
  specialties?.forEach((s) => specialtyMap.set(s.id, lang === 'ar' ? s.nameAr : s.nameEn));

  const sorted = (sources ?? []).slice().sort((a, b) => b.uniquePatients - a.uniquePatients);
  const totalPatients = sorted.reduce((s, r) => s + r.uniquePatients, 0);

  if (isLoading) return <div className="flex items-center justify-center py-20 text-gray-400"><Loader2 className="w-5 h-5 animate-spin me-2" /></div>;
  if (isError)   return <div className="flex items-center justify-center py-20 text-red-400 text-sm">{lang === 'ar' ? 'تعذّر تحميل بيانات المصادر' : 'Failed to load source data — please refresh the page.'}</div>;

  return (
    <div className="animate-fade-in space-y-5">

      {/* ── Patient distribution ── */}
      <Card>
        <CardHeader>
          <CardTitle>{lang === 'ar' ? 'توزيع المرضى حسب المصدر' : 'Patient Distribution by Source'}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-4 rounded-full overflow-hidden gap-0.5 mb-5">
            {sorted.map((row) => (
              <div
                key={row.sourceCode}
                style={{ width: `${row.patientPct}%`, backgroundColor: SOURCE_COLORS[row.sourceCode] ?? '#94A3B8' }}
                title={`${row.sourceNameEn}: ${row.patientPct}%`}
              />
            ))}
          </div>
          <div className="space-y-3">
            {sorted.map((row) => (
              <div key={row.sourceCode}>
                <div className="flex justify-between text-xs mb-1">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: SOURCE_COLORS[row.sourceCode] ?? '#94A3B8' }} />
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      {lang === 'ar' ? row.sourceNameAr : row.sourceNameEn}
                    </span>
                  </div>
                  <div className="flex gap-4 text-end">
                    <span className="font-mono tabular-nums text-gray-500">
                      {formatNumber(row.uniquePatients, locale)} {lang === 'ar' ? 'مريض' : 'pts'}
                    </span>
                    <span className="font-mono tabular-nums font-semibold text-gray-900 dark:text-gray-100 w-12">
                      {row.patientPct.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div className="h-2 bg-gray-100 dark:bg-neutral-700 rounded-full overflow-hidden">
                  <div
                    className="h-full origin-left transition-transform duration-500"
                    style={{ width: '100%', transform: `scaleX(${row.patientPct / 100})`, backgroundColor: SOURCE_COLORS[row.sourceCode] ?? '#94A3B8' }}
                  />
                </div>
              </div>
            ))}
          </div>
          {totalPatients > 0 && (
            <p className="mt-4 text-xs text-gray-400">
              {lang === 'ar'
                ? `إجمالي المرضى الفريدين: ${formatNumber(totalPatients, locale)}`
                : `Total unique patients: ${formatNumber(totalPatients, locale)}`}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Revenue & mediator fees ── */}
      <Card>
        <CardHeader>
          <CardTitle>{lang === 'ar' ? 'الإيرادات ورسوم الوسيط' : 'Revenue & Mediator Fees'}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/50">
                <th className="px-5 py-3 text-start font-medium text-gray-500 dark:text-gray-400">{lang === 'ar' ? 'المصدر' : 'Source'}</th>
                <th className="px-5 py-3 text-end font-medium text-gray-500 dark:text-gray-400">{lang === 'ar' ? 'المرضى' : 'Patients'}</th>
                <th className="px-5 py-3 text-end font-medium text-gray-500 dark:text-gray-400">{lang === 'ar' ? 'الإيرادات' : 'Revenue'}</th>
                <th className="px-5 py-3 text-end font-medium text-gray-500 dark:text-gray-400">{lang === 'ar' ? 'رسوم الوسيط' : 'Mediator Fee'}</th>
                <th className="px-5 py-3 text-end font-medium text-gray-500 dark:text-gray-400">{lang === 'ar' ? 'الصافي' : 'Net Revenue'}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.sourceCode} className="border-b border-gray-50 dark:border-neutral-700/50 hover:bg-gray-50/50 dark:hover:bg-neutral-800/30">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: SOURCE_COLORS[row.sourceCode] ?? '#94A3B8' }} />
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {lang === 'ar' ? row.sourceNameAr : row.sourceNameEn}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-end font-mono tabular-nums text-gray-700 dark:text-gray-300">
                    {formatNumber(row.uniquePatients, locale)}
                  </td>
                  <td className="px-5 py-3 text-end font-mono tabular-nums text-gray-900 dark:text-gray-100">
                    {formatCurrency(row.revenue, 'EGP', locale)}
                  </td>
                  <td className="px-5 py-3 text-end font-mono tabular-nums text-amber-600 dark:text-amber-400">
                    {row.sourceFees > 0 ? formatCurrency(row.sourceFees, 'EGP', locale) : '—'}
                  </td>
                  <td className="px-5 py-3 text-end font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
                    {formatCurrency(row.revenue - row.sourceFees, 'EGP', locale)}
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-gray-400">
                    {lang === 'ar' ? 'لا بيانات' : 'No data'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* ── Mediator rate configuration ── */}
      {feeRules && feeRules.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{lang === 'ar' ? 'نسب رسوم الوسطاء حسب التخصص' : 'Mediator Fee Rates by Specialty'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {feeRules.filter((r) => r.isActive).map((rule) => (
              <div key={rule.sourceCode} className="rounded-lg border border-gray-100 dark:border-neutral-700 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: SOURCE_COLORS[rule.sourceCode] ?? '#94A3B8' }}
                    />
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                      {lang === 'ar' ? rule.sourceNameAr : rule.sourceNameEn}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="text-xs">
                      {rule.feeType === 'percentage'
                        ? `${rule.feeValue}%`
                        : formatCurrency(rule.feeValue, 'EGP', locale)}
                    </Badge>
                    <Badge variant="outline" className="text-xs capitalize">
                      {lang === 'ar'
                        ? (rule.deductFrom === 'clinic' ? 'من العيادة' : rule.deductFrom === 'doctor' ? 'من الطبيب' : 'مشترك')
                        : rule.deductFrom}
                    </Badge>
                  </div>
                </div>
                {rule.specialtyRates.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {rule.specialtyRates.map((sr) => (
                      <div
                        key={sr.specialtyId}
                        className="flex items-center justify-between rounded-md bg-gray-50 dark:bg-neutral-800 px-3 py-1.5 text-xs"
                      >
                        <span className="text-gray-600 dark:text-gray-400 truncate me-2">
                          {specialtyMap.get(sr.specialtyId) ?? `Specialty ${sr.specialtyId}`}
                        </span>
                        <span className="font-mono font-semibold text-amber-700 dark:text-amber-400 flex-shrink-0">
                          {rule.feeType === 'percentage' ? `${sr.feeValue}%` : formatCurrency(sr.feeValue, 'EGP', locale)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ──────────────── Activity Report ──────────────── */
function ActivityReport({ lang, locale, from, to, doctorId }: { lang: string; locale: string; from: string; to: string; doctorId?: string }) {
  const { data: doctorsData } = useDoctors({ limit: 100 });
  const { data, isLoading, isError } = useTransactions({ limit: 500, dateFrom: from, dateTo: to, doctorId });
  const { data: summary, isLoading: summaryLoading } = useAppointmentActivitySummary(from, to);
  const txns = (data?.data ?? []).filter((t) =>
    t.paymentStatus === 'approved' || t.paymentStatus === 'paid' || t.paymentStatus === 'reconciled',
  );
  const allDoctors = doctorsData?.data ?? [];

  const byDoctor: Record<string, { name: string; nameAr?: string; count: number; revenue: number; drShare: number }> = {};
  txns.forEach((t) => {
    const dId = t.doctorId ?? 'unknown';
    if (!byDoctor[dId]) {
      const dr = allDoctors.find((d) => d.id === dId);
      byDoctor[dId] = { name: dr?.nameEn ?? dId, nameAr: dr?.nameAr, count: 0, revenue: 0, drShare: 0 };
    }
    byDoctor[dId].count++;
    byDoctor[dId].revenue  += t.approvedCharge;
    byDoctor[dId].drShare  += t.doctorShare;
  });

  const sorted = Object.entries(byDoctor).sort((a, b) => b[1].revenue - a[1].revenue);
  const maxRev = sorted[0]?.[1]?.revenue ?? 1;
  const [activityBodyRef] = useAutoAnimate();

  if (isLoading) return <div className="flex items-center justify-center py-20 text-gray-400"><Loader2 className="w-5 h-5 animate-spin me-2" /></div>;
  if (isError)   return <div className="flex items-center justify-center py-20 text-red-400 text-sm">Failed to load activity data — please refresh the page.</div>;

  const statusCards = [
    {
      label:   lang === 'ar' ? 'مكتملة'   : 'Closed',
      value:   summary?.closed      ?? 0,
      color:   'text-emerald-600 dark:text-emerald-400',
      bg:      'bg-emerald-50 dark:bg-emerald-900/20',
    },
    {
      label:   lang === 'ar' ? 'مدفوعة'   : 'Paid',
      value:   summary?.paid        ?? 0,
      color:   'text-primary-600 dark:text-primary-400',
      bg:      'bg-primary-50 dark:bg-primary-900/20',
    },
    {
      label:   lang === 'ar' ? 'ملغية'    : 'Cancelled',
      value:   summary?.cancelled   ?? 0,
      color:   'text-rose-600 dark:text-rose-400',
      bg:      'bg-rose-50 dark:bg-rose-900/20',
    },
    {
      label:   lang === 'ar' ? 'مُسترجعة' : 'Refunded',
      value:   summary?.refunded    ?? 0,
      color:   'text-amber-600 dark:text-amber-400',
      bg:      'bg-amber-50 dark:bg-amber-900/20',
    },
    {
      label:   lang === 'ar' ? 'معاد جدولتها' : 'Rescheduled',
      value:   summary?.rescheduled ?? 0,
      color:   'text-violet-600 dark:text-violet-400',
      bg:      'bg-violet-50 dark:bg-violet-900/20',
    },
    {
      label:   lang === 'ar' ? 'مجدولة'   : 'Scheduled',
      value:   summary?.scheduled   ?? 0,
      color:   'text-cyan-600 dark:text-cyan-400',
      bg:      'bg-cyan-50 dark:bg-cyan-900/20',
    },
  ];

  return (
    <div className="animate-fade-in space-y-5">
      {/* Status KPI cards */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
        {statusCards.map((card) => (
          <Card key={card.label}>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 leading-tight">{card.label}</p>
              {summaryLoading
                ? <div className="h-7 w-12 bg-gray-100 dark:bg-neutral-700 rounded animate-pulse" />
                : <p className={`text-2xl font-bold font-mono tabular-nums ${card.color}`}>{formatNumber(card.value, locale)}</p>
              }
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Doctor performance table */}
      <Card>
        <CardHeader>
          <CardTitle>{lang === 'ar'
            ? `أداء الأطباء: ${new Date(from).toLocaleString('ar-EG', { month: 'long', year: 'numeric' })}`
            : `Doctor Performance: ${new Date(from).toLocaleString('en-US', { month: 'long', year: 'numeric' })}`}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50 dark:border-neutral-700 bg-gray-50/50 dark:bg-neutral-900/40">
                <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">#</th>
                <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{lang === 'ar' ? 'الطبيب'       : 'Doctor'}</th>
                <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{lang === 'ar' ? 'مرضى'         : 'Patients'}</th>
                <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{lang === 'ar' ? 'الإيرادات'    : 'Revenue'}</th>
                <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{lang === 'ar' ? 'حصة الطبيب'  : 'Dr. Share'}</th>
                <th className="px-5 py-3 w-32" />
              </tr>
            </thead>
            <tbody ref={activityBodyRef}>
              {sorted.map(([dId, stats], i) => {
                const pct = maxRev > 0 ? (stats.revenue / maxRev) * 100 : 0;
                return (
                  <tr key={dId} className="border-b border-gray-50 dark:border-neutral-700/50 hover:bg-gray-50/50 dark:hover:bg-neutral-700/30 transition-colors">
                    <td className="px-5 py-3.5 text-xs font-bold text-gray-300 dark:text-gray-600">{formatNumber(i + 1, locale)}</td>
                    <td className="px-5 py-3.5 font-medium text-gray-900 dark:text-gray-100">{lang === 'ar' ? (stats.nameAr ?? stats.name) : stats.name}</td>
                    <td className="px-5 py-3.5 font-mono tabular-nums text-gray-600 dark:text-gray-400">{formatNumber(stats.count, locale)}</td>
                    <td className="px-5 py-3.5 font-mono tabular-nums font-medium text-gray-900 dark:text-gray-100">{formatCurrency(stats.revenue, 'EGP', locale)}</td>
                    <td className="px-5 py-3.5 font-mono tabular-nums text-primary-700 dark:text-primary-400">{formatCurrency(stats.drShare, 'EGP', locale)}</td>
                    <td className="px-5 py-3.5">
                      <div className="h-1.5 bg-gray-100 dark:bg-neutral-700 rounded-full overflow-hidden w-28">
                        <div className="h-full w-full bg-primary-500 origin-left transition-transform duration-500" style={{ transform: `scaleX(${pct / 100})` }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400">{lang === 'ar' ? 'لا بيانات' : 'No data'}</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

/* ──────────────── Monthly Trends ──────────────── */
function TrendsReport({ lang, locale }: { lang: string; locale: string }) {
  const [months, setMonths] = useState(12);
  const { data = [], isLoading, isError } = useMonthlyRevenue(months);
  const [bodyRef] = useAutoAnimate();

  const withGrowth = data.map((d, i) => {
    const prev = i > 0 ? data[i - 1].revenue : null;
    const mom = prev === null || prev === 0 ? null : ((d.revenue - prev) / prev) * 100;
    return { ...d, mom };
  });

  const totalRevenue  = data.reduce((s, d) => s + d.revenue, 0);
  const totalDrShare  = data.reduce((s, d) => s + d.doctorShare, 0);
  const totalClnShare = data.reduce((s, d) => s + d.clinicShare, 0);
  const avgPerMonth   = data.length > 0 ? totalRevenue / data.length : 0;

  if (isLoading) return <div className="flex items-center justify-center py-20 text-gray-400"><Loader2 className="w-5 h-5 animate-spin me-2" />Loading...</div>;
  if (isError)   return <div className="flex items-center justify-center py-20 text-red-400 text-sm">Failed to load trends — please refresh the page.</div>;

  return (
    <div className="animate-fade-in space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: lang === 'ar' ? 'إجمالي الإيرادات' : 'Total Revenue',   value: formatCurrency(totalRevenue,  'EGP', locale) },
          { label: lang === 'ar' ? 'حصة الأطباء'      : "Doctors' Share",  value: formatCurrency(totalDrShare,  'EGP', locale) },
          { label: lang === 'ar' ? 'حصة العيادة'      : "Clinic's Share",  value: formatCurrency(totalClnShare, 'EGP', locale) },
          { label: lang === 'ar' ? 'متوسط شهري'       : 'Monthly Avg',     value: formatCurrency(avgPerMonth,   'EGP', locale) },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="pt-5">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{item.label}</p>
              <p className="text-xl font-bold font-mono tabular-nums text-gray-900 dark:text-gray-100">{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>
            {lang === 'ar' ? `الاتجاهات: آخر ${formatNumber(months, locale)} أشهر` : `Trends: Last ${months} months`}
          </CardTitle>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex gap-1 bg-gray-100 dark:bg-neutral-800 rounded-full p-0.5 text-xs">
              {[6, 12, 24].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setMonths(n)}
                  className={`px-2.5 py-1 rounded-full font-medium transition-all focus:outline-none ${
                    months === n
                      ? 'bg-white dark:bg-neutral-700 text-primary-700 dark:text-primary-300 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  {n}{lang === 'ar' ? 'ش' : 'm'}
                </button>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={() => openPdf(`/reports/financial-summary?months=${months}`)}>
              <FileDown className="w-3.5 h-3.5" />
              PDF
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50 dark:border-neutral-700 bg-gray-50/50 dark:bg-neutral-900/40">
                <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{lang === 'ar' ? 'الشهر'       : 'Month'}</th>
                <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{lang === 'ar' ? 'الإيرادات'   : 'Revenue'}</th>
                <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">{lang === 'ar' ? 'حصة الأطباء' : 'Dr. Share'}</th>
                <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">{lang === 'ar' ? 'حصة العيادة' : 'Clinic'}</th>
                <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{lang === 'ar' ? 'معاملات'     : 'Txns'}</th>
                <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{lang === 'ar' ? 'نمو شهري'    : 'MoM'}</th>
                <th className="px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 hidden lg:table-cell" />
              </tr>
            </thead>
            <tbody ref={bodyRef}>
              {[...withGrowth].reverse().map((d) => {
                const maxRev = Math.max(...withGrowth.map((r) => r.revenue), 1);
                const barPct = maxRev > 0 ? (d.revenue / maxRev) * 100 : 0;
                return (
                  <tr key={d.month} className="border-b border-gray-50 dark:border-neutral-700/50 hover:bg-gray-50/50 dark:hover:bg-neutral-700/30 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-gray-900 dark:text-gray-100">
                      {new Date(d.month + '-01').toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US', { month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-5 py-3.5 font-mono tabular-nums font-semibold text-gray-900 dark:text-gray-100">
                      {formatCurrency(d.revenue, 'EGP', locale)}
                    </td>
                    <td className="px-5 py-3.5 font-mono tabular-nums text-gray-600 dark:text-gray-400 hidden md:table-cell">
                      {formatCurrency(d.doctorShare, 'EGP', locale)}
                    </td>
                    <td className="px-5 py-3.5 font-mono tabular-nums text-gray-600 dark:text-gray-400 hidden md:table-cell">
                      {formatCurrency(d.clinicShare, 'EGP', locale)}
                    </td>
                    <td className="px-5 py-3.5 font-mono tabular-nums text-gray-500 dark:text-gray-400">
                      {formatNumber(d.appointments, locale)}
                    </td>
                    <td className="px-5 py-3.5">
                      {d.mom === null ? (
                        <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                      ) : (
                        <span className={`flex items-center gap-1 text-xs font-semibold ${d.mom >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                          {d.mom >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {d.mom >= 0 ? '+' : ''}{d.mom.toFixed(1)}%
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 hidden lg:table-cell">
                      <div className="h-1.5 bg-gray-100 dark:bg-neutral-700 rounded-full overflow-hidden w-24">
                        <div className="h-full w-full bg-primary-500 origin-left transition-transform duration-500" style={{ transform: `scaleX(${barPct / 100})` }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {withGrowth.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-400">{lang === 'ar' ? 'لا بيانات' : 'No data'}</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

/* ──────────────── Specialties ──────────────── */
function SpecialtiesReport({ lang, locale }: { lang: string; locale: string }) {
  const { data = [], isLoading, isError } = useSpecialtyBreakdown();
  const [bodyRef] = useAutoAnimate();

  const totalRevenue = data.reduce((s, d) => s + d.revenue, 0);
  const totalAppts   = data.reduce((s, d) => s + d.appointments, 0);

  if (isLoading) return <div className="flex items-center justify-center py-20 text-gray-400"><Loader2 className="w-5 h-5 animate-spin me-2" />Loading...</div>;
  if (isError)   return <div className="flex items-center justify-center py-20 text-red-400 text-sm">Failed to load specialties — please refresh the page.</div>;

  return (
    <div className="animate-fade-in space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{lang === 'ar' ? 'إجمالي الإيرادات' : 'Total Revenue'}</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-gray-900 dark:text-gray-100">{formatCurrency(totalRevenue, 'EGP', locale)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{lang === 'ar' ? 'إجمالي المواعيد' : 'Total Appointments'}</p>
            <p className="text-2xl font-bold font-mono text-gray-900 dark:text-gray-100">{formatNumber(totalAppts, locale)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{lang === 'ar' ? 'عدد التخصصات' : 'Specialties'}</p>
            <p className="text-2xl font-bold font-mono text-gray-900 dark:text-gray-100">{formatNumber(data.length, locale)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{lang === 'ar' ? 'أداء التخصصات' : 'Specialty Performance'}</CardTitle>
          <span className="text-xs text-gray-400 dark:text-gray-500 italic">
            {lang === 'ar' ? 'بيانات تراكمية — لا تتأثر بمحدد الشهر' : 'All-time data — not month-filtered'}
          </span>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50 dark:border-neutral-700 bg-gray-50/50 dark:bg-neutral-900/40">
                <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">#</th>
                <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{lang === 'ar' ? 'التخصص'      : 'Specialty'}</th>
                <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{lang === 'ar' ? 'الإيرادات'   : 'Revenue'}</th>
                <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">{lang === 'ar' ? 'المواعيد' : 'Appts'}</th>
                <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{lang === 'ar' ? 'معدل الغياب' : 'No-Show'}</th>
                <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 hidden lg:table-cell">{lang === 'ar' ? 'الحصة' : 'Share'}</th>
              </tr>
            </thead>
            <tbody ref={bodyRef}>
              {data.map((s, i) => (
                <tr key={s.specialtyId} className="border-b border-gray-50 dark:border-neutral-700/50 hover:bg-gray-50/50 dark:hover:bg-neutral-700/30 transition-colors">
                  <td className="px-5 py-3.5 text-xs font-bold text-gray-300 dark:text-gray-600">{formatNumber(i + 1, locale)}</td>
                  <td className="px-5 py-3.5 font-medium text-gray-900 dark:text-gray-100">
                    {lang === 'ar' ? s.specialtyAr : s.specialtyEn}
                  </td>
                  <td className="px-5 py-3.5 font-mono tabular-nums font-semibold text-gray-900 dark:text-gray-100">
                    {formatCurrency(s.revenue, 'EGP', locale)}
                  </td>
                  <td className="px-5 py-3.5 font-mono tabular-nums text-gray-600 dark:text-gray-400 hidden md:table-cell">
                    {formatNumber(s.appointments, locale)}
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge variant={s.noShowRate > 10 ? 'danger' : s.noShowRate > 7 ? 'warning' : 'success'}>
                      {formatNumber(s.noShowRate, locale)}%
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5 hidden lg:table-cell">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-100 dark:bg-neutral-700 rounded-full overflow-hidden w-20">
                        <div className="h-full w-full bg-primary-500 origin-left" style={{ transform: `scaleX(${s.sharePct / 100})` }} />
                      </div>
                      <span className="text-xs text-gray-500 dark:text-gray-400 w-8">{formatNumber(s.sharePct, locale)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400">{lang === 'ar' ? 'لا بيانات' : 'No data'}</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

/* ──────────────── Page ──────────────── */
export default function ReportsPage() {
  const { lang, t } = useLang();
  const { user } = useAuth();
  const isDoctor  = user?.role === 'doctor';
  const doctorId  = isDoctor ? (user?.doctorId ?? undefined) : undefined;

  const visibleTabs = isDoctor
    ? REPORT_TABS.filter((rt) => rt.key === 'settlements' || rt.key === 'activity')
    : REPORT_TABS;

  const [tab, setTab] = useState<ReportTab>(() => isDoctor ? 'activity' : 'financial');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const locale = lang === 'ar' ? 'ar-EG' : 'en-US';
  const qc = useQueryClient();

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const { from, to } = monthRange(selectedMonth.year, selectedMonth.month);

  function prevMonth() {
    setSelectedMonth((m) => {
      const d = new Date(m.year, m.month - 1, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }
  function nextMonth() {
    setSelectedMonth((m) => {
      const d = new Date(m.year, m.month + 1, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }
  const isCurrentMonth = selectedMonth.year === now.getFullYear() && selectedMonth.month === now.getMonth();

  const monthPickerHidden = tab === 'trends' || tab === 'specialties';

  const { data: txnData }     = useTransactions({ limit: 500, dateFrom: from, dateTo: to });
  const { data: settlData }   = useSettlements({ from, to });
  const { data: doctorsData } = useDoctors({ limit: 100 });

  async function handleRefresh() {
    setIsRefreshing(true);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['transactions'] }),
      qc.invalidateQueries({ queryKey: ['settlements'] }),
      qc.invalidateQueries({ queryKey: ['doctors'] }),
      qc.invalidateQueries({ queryKey: ['analytics'] }),
    ]);
    setIsRefreshing(false);
  }

  function handleExportCSV() {
    const txns        = txnData?.data ?? [];
    const settlements = settlData?.data ?? [];
    const allDoctors  = doctorsData?.data ?? [];

    if (tab === 'financial') {
      const rows = txns.filter((t) => t.paymentStatus === 'approved' || t.paymentStatus === 'paid' || t.paymentStatus === 'reconciled').map((t) => ({
        Date:                   t.createdAt?.slice(0, 10) ?? '',
        Source:                 t.patientSource,
        'Payment Method':       t.paymentMethod ?? 'cash',
        'Charged (EGP)':        t.approvedCharge,
        'Source Fee (EGP)':     t.sourceFeeAmount,
        'Net Revenue (EGP)':    t.grossRevenue,
        "Doctor's Share (EGP)": t.doctorShare,
        "Clinic's Share (EGP)": t.clinicShare,
      }));
      downloadCSV(rows, 'financial-summary');
    } else if (tab === 'settlements') {
      const rows = settlements.map((s: DoctorSettlement) => {
        const dr = allDoctors.find((d) => d.id === s.doctorId);
        return {
          'Doctor (EN)':           dr?.nameEn ?? s.doctorId,
          'Doctor (AR)':           dr?.nameAr ?? '',
          Consultations:           s.totalConsultations ?? 0,
          'Total Charged (EGP)':   s.grossRevenue ?? 0,
          "Doctor's Share (EGP)":  s.doctorShare ?? 0,
          Status:                  (s.status === 'paid' || s.status === 'reconciled') ? 'Settled' : s.status === 'approved' ? 'Approved' : 'Pending',
        };
      });
      downloadCSV(rows, 'doctor-settlements');
    } else if (tab === 'sources') {
      const bySource: Record<string, { count: number; revenue: number; fees: number }> = {};
      txns.forEach((t) => {
        if (!bySource[t.patientSource]) bySource[t.patientSource] = { count: 0, revenue: 0, fees: 0 };
        bySource[t.patientSource].count++;
        bySource[t.patientSource].revenue += t.approvedCharge;
        bySource[t.patientSource].fees    += t.sourceFeeAmount;
      });
      const rows = Object.entries(bySource).sort((a, b) => b[1].revenue - a[1].revenue).map(([src, s]) => ({
        Source:          src,
        Transactions:    s.count,
        'Revenue (EGP)': s.revenue,
        'Fees (EGP)':    s.fees,
        'Net (EGP)':     s.revenue - s.fees,
      }));
      downloadCSV(rows, 'patient-sources');
    } else if (tab === 'activity') {
      const byDoctor: Record<string, { name: string; count: number; revenue: number; drShare: number }> = {};
      txns.forEach((t) => {
        const dId = t.doctorId ?? 'unknown';
        if (!byDoctor[dId]) {
          const dr = allDoctors.find((d) => d.id === dId);
          byDoctor[dId] = { name: dr?.nameEn ?? dId, count: 0, revenue: 0, drShare: 0 };
        }
        byDoctor[dId].count++;
        byDoctor[dId].revenue  += t.approvedCharge;
        byDoctor[dId].drShare  += t.doctorShare;
      });
      const rows = Object.values(byDoctor).sort((a, b) => b.revenue - a.revenue).map((d, i) => ({
        Rank:                   i + 1,
        Doctor:                 d.name,
        Patients:               d.count,
        'Revenue (EGP)':        d.revenue,
        "Doctor's Share (EGP)": d.drShare,
      }));
      downloadCSV(rows, 'doctor-activity');
    }
    // trends and specialties are not month-scoped; no CSV from parent context
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div className="animate-slide-down">
          <h2 className="text-2xl font-bold font-display text-gray-900 dark:text-gray-100">{t('التقارير', 'Reports')}</h2>
          {!monthPickerHidden && (
            <div className="flex items-center gap-1 mt-0.5">
              <button type="button" onClick={prevMonth} className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-neutral-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <p className="text-sm text-gray-500 dark:text-gray-300 min-w-[110px] text-center">
                {new Date(selectedMonth.year, selectedMonth.month, 1).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US', { month: 'long', year: 'numeric' })}
              </p>
              <button type="button" onClick={nextMonth} disabled={isCurrentMonth} className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-neutral-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
          {monthPickerHidden && (
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
              {lang === 'ar' ? 'بيانات تراكمية' : 'Aggregate view'}
            </p>
          )}
        </div>
        <div className="flex gap-2 animate-slide-down" style={{ animationDelay: '40ms' }}>
          <Button size="sm" variant="outline" onClick={() => void handleRefresh()} disabled={isRefreshing}>
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{t('تحديث', 'Refresh')}</span>
          </Button>
          {!monthPickerHidden && (
            <Button size="sm" variant="outline" onClick={handleExportCSV}>
              <Download className="w-4 h-4" />
              {t('تصدير CSV', 'Export CSV')}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer className="w-4 h-4" />
            <span className="sr-only">{t('طباعة', 'Print')}</span>
          </Button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-1 p-1 bg-white dark:bg-neutral-800 rounded-xl shadow-1 border border-gray-100 dark:border-neutral-700 w-fit">
        {visibleTabs.map((rt) => {
          const Icon   = rt.iconEl;
          const active = tab === rt.key;
          return (
            <button
              key={rt.key}
              type="button"
              onClick={() => setTab(rt.key)}
              aria-pressed={active}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 ${
                active
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-700 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="hidden sm:inline">{lang === 'ar' ? rt.labelAr : rt.labelEn}</span>
            </button>
          );
        })}
      </div>

      {tab === 'financial'   && <FinancialReport   lang={lang} locale={locale} from={from} to={to} />}
      {tab === 'settlements' && <SettlementsReport lang={lang} locale={locale} from={from} to={to} doctorId={doctorId} />}
      {tab === 'sources'     && <SourcesReport     lang={lang} locale={locale} from={from} to={to} />}
      {tab === 'activity'    && <ActivityReport    lang={lang} locale={locale} from={from} to={to} doctorId={doctorId} />}
      {tab === 'trends'      && <TrendsReport      lang={lang} locale={locale} />}
      {tab === 'specialties' && <SpecialtiesReport lang={lang} locale={locale} />}
    </div>
  );
}
