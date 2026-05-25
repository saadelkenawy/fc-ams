'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  TrendingUp, Download, Printer, Loader2, DollarSign, Activity, PieChart, RefreshCw,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { downloadCSV } from '@/lib/export';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useLang } from '@/contexts/LanguageContext';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { useTransactions, useSettlements } from '@/hooks/useBilling';
import { useDoctors } from '@/hooks/useDoctors';
import type { DoctorSettlement } from '@fadl/types';

const REPORT_TABS = [
  { key: 'financial',    iconEl: DollarSign,  labelAr: 'الملخص المالي',     labelEn: 'Financial Summary' },
  { key: 'settlements',  iconEl: TrendingUp,  labelAr: 'تسويات الأطباء',    labelEn: 'Doctor Settlements' },
  { key: 'sources',      iconEl: PieChart,    labelAr: 'مصادر المرضى',      labelEn: 'Patient Sources' },
  { key: 'activity',     iconEl: Activity,    labelAr: 'نشاط المواعيد',      labelEn: 'Appointment Activity' },
] as const;
type ReportTab = typeof REPORT_TABS[number]['key'];

function monthRange(year: number, month: number) {
  const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
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
function FinancialReport({ lang, locale, from, to }: { lang: string; locale: string; from: string; to: string }) {
  const { data, isLoading, isError } = useTransactions({ limit: 500, dateFrom: from, dateTo: to });
  const txns = data?.data ?? [];

  const approved = txns.filter((t) =>
    t.paymentStatus === 'approved' || t.paymentStatus === 'paid' || t.paymentStatus === 'reconciled',
  );
  const totalCharged   = approved.reduce((s, t) => s + t.approvedCharge, 0);
  const totalFees      = approved.reduce((s, t) => s + t.sourceFeeAmount, 0);
  const totalGross     = approved.reduce((s, t) => s + t.grossRevenue, 0);
  const totalDrShare   = approved.reduce((s, t) => s + t.doctorShare, 0);
  const totalClnShare  = approved.reduce((s, t) => s + t.clinicShare, 0);

  const byMethod: Record<string, number> = {};
  approved.forEach((t) => {
    const m = t.paymentMethod ?? 'cash';
    byMethod[m] = (byMethod[m] ?? 0) + t.approvedCharge;
  });

  const bySource: Record<string, { count: number; revenue: number; fees: number }> = {};
  approved.forEach((t) => {
    if (!bySource[t.patientSource]) bySource[t.patientSource] = { count: 0, revenue: 0, fees: 0 };
    bySource[t.patientSource].count++;
    bySource[t.patientSource].revenue += t.approvedCharge;
    bySource[t.patientSource].fees    += t.sourceFeeAmount;
  });

  if (isLoading) return (
    <div className="flex items-center justify-center py-20 text-gray-400">
      <Loader2 className="w-5 h-5 animate-spin me-2" />
      Loading...
    </div>
  );
  if (isError) return (
    <div className="flex items-center justify-center py-20 text-red-400 text-sm">
      Failed to load financial data — please refresh the page.
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
      <Card>
        <CardHeader><CardTitle>{lang === 'ar' ? 'ملخص الإيرادات' : 'Revenue Summary'}</CardTitle></CardHeader>
        <CardContent>
          <StatRow label={lang === 'ar' ? 'إجمالي المحصل' : 'Total Charged'}    value={formatCurrency(totalCharged,  'EGP', locale)} />
          <StatRow label={lang === 'ar' ? 'رسوم المصادر'  : 'Platform Fees'}    value={formatCurrency(totalFees,     'EGP', locale)} sub={`${totalCharged > 0 ? ((totalFees / totalCharged) * 100).toFixed(1) : 0}%`} />
          <StatRow label={lang === 'ar' ? 'الإيراد الصافي' : 'Net Revenue'}      value={formatCurrency(totalGross,    'EGP', locale)} />
          <StatRow label={lang === 'ar' ? 'حصة الأطباء'   : "Doctors' Share"}   value={formatCurrency(totalDrShare,  'EGP', locale)} sub={`${totalGross > 0 ? ((totalDrShare / totalGross) * 100).toFixed(1) : 0}%`} />
          <StatRow label={lang === 'ar' ? 'حصة العيادة'   : "Clinic's Share"}   value={formatCurrency(totalClnShare, 'EGP', locale)} sub={`${totalGross > 0 ? ((totalClnShare / totalGross) * 100).toFixed(1) : 0}%`} />
          <StatRow label={lang === 'ar' ? 'عدد المعاملات' : 'Transactions'}     value={formatNumber(approved.length, locale)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{lang === 'ar' ? 'طرق السداد' : 'Payment Methods'}</CardTitle></CardHeader>
        <CardContent>
          {Object.entries(byMethod).sort((a, b) => b[1] - a[1]).map(([method, amount]) => {
            const pct = totalCharged > 0 ? (amount / totalCharged) * 100 : 0;
            return (
              <div key={method} className="mb-3">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-600 dark:text-gray-400 capitalize">{method.replace('_', ' ')}</span>
                  <div className="flex gap-3">
                    <span className="text-gray-400">{pct.toFixed(1)}%</span>
                    <span className="font-mono font-medium text-gray-900 dark:text-gray-100">{formatCurrency(amount, 'EGP', locale)}</span>
                  </div>
                </div>
                <div className="h-2 bg-gray-100 dark:bg-neutral-700 rounded-full overflow-hidden">
                  <div className="h-full w-full bg-primary-500 origin-left transition-transform duration-500" style={{ transform: `scaleX(${pct / 100})` }} />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader><CardTitle>{lang === 'ar' ? 'تحليل المصادر' : 'Source Analysis'}</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50 dark:border-neutral-700 bg-gray-50/50 dark:bg-neutral-900/40">
                <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{lang === 'ar' ? 'المصدر' : 'Source'}</th>
                <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{lang === 'ar' ? 'المعاملات' : 'Txns'}</th>
                <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{lang === 'ar' ? 'الإيرادات' : 'Revenue'}</th>
                <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{lang === 'ar' ? 'الرسوم' : 'Fees'}</th>
                <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{lang === 'ar' ? 'صافي' : 'Net'}</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(bySource).sort((a, b) => b[1].revenue - a[1].revenue).map(([src, stats]) => (
                <tr key={src} className="border-b border-gray-50 dark:border-neutral-700/50 hover:bg-gray-50/50 dark:hover:bg-neutral-700/30 transition-colors">
                  <td className="px-5 py-3.5"><Badge variant="outline">{src}</Badge></td>
                  <td className="px-5 py-3.5 font-mono tabular-nums text-gray-600 dark:text-gray-400">{formatNumber(stats.count, locale)}</td>
                  <td className="px-5 py-3.5 font-mono tabular-nums text-gray-900 dark:text-gray-100">{formatCurrency(stats.revenue, 'EGP', locale)}</td>
                  <td className="px-5 py-3.5 font-mono tabular-nums text-red-500">{formatCurrency(stats.fees, 'EGP', locale)}</td>
                  <td className="px-5 py-3.5 font-mono tabular-nums text-emerald-600 dark:text-emerald-400">{formatCurrency(stats.revenue - stats.fees, 'EGP', locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

/* ──────────────── Doctor Settlements ──────────────── */
function SettlementsReport({ lang, locale, from, to }: { lang: string; locale: string; from: string; to: string }) {
  const { data, isLoading, isError } = useSettlements({ from, to });
  const { data: doctorsData } = useDoctors({ limit: 100 });
  const allDoctors = doctorsData?.data ?? [];
  const settlements = data?.data ?? [];

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
          <CardContent className="pt-5">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{lang === 'ar' ? 'الفترة' : 'Period'}</p>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{new Date(from).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US', { month: 'long', year: 'numeric' })}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50 dark:border-neutral-700 bg-gray-50/50 dark:bg-neutral-900/40">
                <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{lang === 'ar' ? 'الطبيب' : 'Doctor'}</th>
                <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{lang === 'ar' ? 'معاملات' : 'Txns'}</th>
                <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{lang === 'ar' ? 'إجمالي المحصل' : 'Total Charged'}</th>
                <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{lang === 'ar' ? 'حصة الطبيب' : 'Doctor Share'}</th>
                <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
              </tr>
            </thead>
            <tbody>
              {settlements.map((s: DoctorSettlement, i: number) => {
                const dr = allDoctors.find((d) => d.id === s.doctorId);
                const drName = lang === 'ar' ? (dr?.nameAr ?? dr?.nameEn ?? s.doctorId) : (dr?.nameEn ?? s.doctorId);
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
                </tr>
                );
              })}
              {settlements.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-gray-400">{lang === 'ar' ? 'لا بيانات' : 'No data'}</td></tr>
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
  VEZ:  '#D97706', EKF:  '#F87171', DO:   '#6366F1',
  SHL:  '#10B981', 'Cl.s':'#F59E0B', 'Ref.':'#8B5CF6',
};

function SourcesReport({ lang, locale, from, to }: { lang: string; locale: string; from: string; to: string }) {
  const { data, isLoading, isError } = useTransactions({ limit: 500, dateFrom: from, dateTo: to });
  const txns = (data?.data ?? []).filter((t) =>
    t.paymentStatus === 'approved' || t.paymentStatus === 'paid' || t.paymentStatus === 'reconciled',
  );

  const bySource: Record<string, { count: number; revenue: number }> = {};
  txns.forEach((t) => {
    if (!bySource[t.patientSource]) bySource[t.patientSource] = { count: 0, revenue: 0 };
    bySource[t.patientSource].count++;
    bySource[t.patientSource].revenue += t.approvedCharge;
  });
  const total = Object.values(bySource).reduce((s, v) => s + v.count, 0);
  const sorted = Object.entries(bySource).sort((a, b) => b[1].count - a[1].count);

  if (isLoading) return <div className="flex items-center justify-center py-20 text-gray-400"><Loader2 className="w-5 h-5 animate-spin me-2" /></div>;
  if (isError) return <div className="flex items-center justify-center py-20 text-red-400 text-sm">Failed to load source data — please refresh the page.</div>;

  return (
    <div className="animate-fade-in space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader><CardTitle>{lang === 'ar' ? 'توزيع المصادر' : 'Source Distribution'}</CardTitle></CardHeader>
          <CardContent>
            <div className="flex h-4 rounded-full overflow-hidden gap-0.5 mb-4">
              {sorted.map(([src, stats]) => {
                const pct = total > 0 ? (stats.count / total) * 100 : 0;
                return <div key={src} style={{ width: `${pct}%`, backgroundColor: SOURCE_COLORS[src] ?? '#94A3B8' }} title={`${src}: ${pct.toFixed(1)}%`} />;
              })}
            </div>
            <div className="space-y-3">
              {sorted.map(([src, stats]) => {
                const pct = total > 0 ? (stats.count / total) * 100 : 0;
                return (
                  <div key={src}>
                    <div className="flex justify-between text-xs mb-1">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: SOURCE_COLORS[src] ?? '#94A3B8' }} />
                        <span className="font-medium text-gray-700 dark:text-gray-300">{src}</span>
                      </div>
                      <div className="flex gap-4">
                        <span className="font-mono tabular-nums text-gray-500">{formatNumber(stats.count, locale)} {lang === 'ar' ? 'معاملة' : 'txns'}</span>
                        <span className="font-mono tabular-nums font-semibold text-gray-900 dark:text-gray-100">{pct.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="h-2 bg-gray-100 dark:bg-neutral-700 rounded-full overflow-hidden">
                      <div className="h-full w-full origin-left transition-transform duration-500" style={{ transform: `scaleX(${pct / 100})`, backgroundColor: SOURCE_COLORS[src] ?? '#94A3B8' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{lang === 'ar' ? 'إيرادات حسب المصدر' : 'Revenue by Source'}</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {sorted.map(([src, stats]) => {
                const totalRev = Object.values(bySource).reduce((s, v) => s + v.revenue, 0);
                const pct = totalRev > 0 ? (stats.revenue / totalRev) * 100 : 0;
                return (
                  <div key={src} className="flex items-center justify-between py-2 border-b border-gray-50 dark:border-neutral-700/50 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: SOURCE_COLORS[src] ?? '#94A3B8' }} />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{src}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-400">{pct.toFixed(1)}%</span>
                      <span className="text-sm font-mono tabular-nums font-medium text-gray-900 dark:text-gray-100">{formatCurrency(stats.revenue, 'EGP', locale)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ──────────────── Activity Report ──────────────── */
function ActivityReport({ lang, locale, from, to }: { lang: string; locale: string; from: string; to: string }) {
  const { data: doctorsData } = useDoctors({ limit: 100 });
  const { data, isLoading, isError } = useTransactions({ limit: 500, dateFrom: from, dateTo: to });
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
    byDoctor[dId].revenue += t.approvedCharge;
    byDoctor[dId].drShare += t.doctorShare;
  });

  const sorted = Object.entries(byDoctor).sort((a, b) => b[1].revenue - a[1].revenue);
  const maxRev = sorted[0]?.[1]?.revenue ?? 1;

  if (isLoading) return <div className="flex items-center justify-center py-20 text-gray-400"><Loader2 className="w-5 h-5 animate-spin me-2" /></div>;
  if (isError) return <div className="flex items-center justify-center py-20 text-red-400 text-sm">Failed to load activity data — please refresh the page.</div>;

  return (
    <div className="animate-fade-in">
      <Card>
        <CardHeader>
          <CardTitle>{lang === 'ar' ? `أداء الأطباء: ${new Date(from).toLocaleString('ar-EG', { month: 'long', year: 'numeric' })}` : `Doctor Performance: ${new Date(from).toLocaleString('en-US', { month: 'long', year: 'numeric' })}`}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50 dark:border-neutral-700 bg-gray-50/50 dark:bg-neutral-900/40">
                <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">#</th>
                <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{lang === 'ar' ? 'الطبيب' : 'Doctor'}</th>
                <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{lang === 'ar' ? 'مرضى' : 'Patients'}</th>
                <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{lang === 'ar' ? 'الإيرادات' : 'Revenue'}</th>
                <th className="text-start px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">{lang === 'ar' ? 'حصة الطبيب' : 'Dr. Share'}</th>
                <th className="px-5 py-3 w-32" />
              </tr>
            </thead>
            <tbody>
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

/* ──────────────── Page ──────────────── */
export default function ReportsPage() {
  const { lang, t } = useLang();
  const [tab, setTab] = useState<ReportTab>('financial');
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

  const { data: txnData }      = useTransactions({ limit: 500, dateFrom: from, dateTo: to });
  const { data: settlData }    = useSettlements({ from, to });
  const { data: doctorsData }  = useDoctors({ limit: 100 });

  async function handleRefresh() {
    setIsRefreshing(true);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['transactions'] }),
      qc.invalidateQueries({ queryKey: ['settlements'] }),
      qc.invalidateQueries({ queryKey: ['doctors'] }),
    ]);
    setIsRefreshing(false);
  }

  function handleExportCSV() {
    const txns       = txnData?.data ?? [];
    const settlements = settlData?.data ?? [];
    const allDoctors  = doctorsData?.data ?? [];

    if (tab === 'financial') {
      const rows = txns.filter((t) => t.paymentStatus === 'approved' || t.paymentStatus === 'paid' || t.paymentStatus === 'reconciled').map((t) => ({
        Date:           t.createdAt?.slice(0, 10) ?? '',
        Source:         t.patientSource,
        'Payment Method': t.paymentMethod ?? 'cash',
        'Charged (EGP)': t.approvedCharge,
        'Source Fee (EGP)': t.sourceFeeAmount,
        'Net Revenue (EGP)': t.grossRevenue,
        "Doctor's Share (EGP)": t.doctorShare,
        "Clinic's Share (EGP)": t.clinicShare,
      }));
      downloadCSV(rows, 'financial-summary');
    } else if (tab === 'settlements') {
      const rows = settlements.map((s: import('@fadl/types').DoctorSettlement) => {
        const dr = allDoctors.find((d) => d.id === s.doctorId);
        return {
          'Doctor (EN)':        dr?.nameEn ?? s.doctorId,
          'Doctor (AR)':        dr?.nameAr ?? '',
          Consultations:        s.totalConsultations ?? 0,
          'Total Charged (EGP)': s.grossRevenue ?? 0,
          "Doctor's Share (EGP)": s.doctorShare ?? 0,
          Status:               (s.status === 'paid' || s.status === 'reconciled') ? 'Settled' : s.status === 'approved' ? 'Approved' : 'Pending',
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
        Source:           src,
        Transactions:     s.count,
        'Revenue (EGP)':  s.revenue,
        'Fees (EGP)':     s.fees,
        'Net (EGP)':      s.revenue - s.fees,
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
        Rank:               i + 1,
        Doctor:             d.name,
        Patients:           d.count,
        'Revenue (EGP)':    d.revenue,
        "Doctor's Share (EGP)": d.drShare,
      }));
      downloadCSV(rows, 'doctor-activity');
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div className="animate-slide-down">
          <h2 className="text-2xl font-bold font-display text-gray-900 dark:text-gray-100">{t('التقارير', 'Reports')}</h2>
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
        </div>
        <div className="flex gap-2 animate-slide-down" style={{ animationDelay: '40ms' }}>
          <Button size="sm" variant="outline" onClick={() => void handleRefresh()} disabled={isRefreshing}>
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{t('تحديث', 'Refresh')}</span>
          </Button>
          <Button size="sm" variant="outline" onClick={handleExportCSV}>
            <Download className="w-4 h-4" />
            {t('تصدير CSV', 'Export CSV')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer className="w-4 h-4" />
            <span className="sr-only">{t('طباعة', 'Print')}</span>
          </Button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 bg-white dark:bg-neutral-800 rounded-xl shadow-1 border border-gray-100 dark:border-neutral-700 w-fit">
        {REPORT_TABS.map((rt) => {
          const Icon = rt.iconEl;
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
      {tab === 'settlements' && <SettlementsReport lang={lang} locale={locale} from={from} to={to} />}
      {tab === 'sources'     && <SourcesReport     lang={lang} locale={locale} from={from} to={to} />}
      {tab === 'activity'    && <ActivityReport    lang={lang} locale={locale} from={from} to={to} />}
    </div>
  );
}
