'use client';

import { useState } from 'react';
import { TrendingUp, TrendingDown, Users, Calendar, DollarSign, Activity, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatCard } from '@/components/ui/StatCard';
import { Badge } from '@/components/ui/Badge';
import { useLang } from '@/contexts/LanguageContext';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { useAnalyticsOverview, useMonthlyRevenue, useSourceBreakdown, useSpecialtyBreakdown, useNoShowByDay, useTopDoctors } from '@/hooks/useAnalytics';
import type { MonthlyRevenue, SourceStat, SpecialtyStat, NoShowDay, DoctorStat } from '@/hooks/useAnalytics';

const SOURCE_COLORS = ['#2563EB', '#7C3AED', '#0891B2', '#059669', '#D97706', '#6366F1'];

const PERIODS = ['week', 'month', 'quarter', 'year'] as const;
type Period = typeof PERIODS[number];

const PERIOD_LABELS: Record<Period, { ar: string; en: string }> = {
  week:    { ar: 'أسبوع', en: 'Week' },
  month:   { ar: 'شهر',   en: 'Month' },
  quarter: { ar: 'ربع',   en: 'Quarter' },
  year:    { ar: 'سنة',   en: 'Year' },
};

function shortMonth(ym: string, locale: string): string {
  return new Date(ym + '-01').toLocaleString(locale, { month: 'short' });
}

interface ChartBar {
  month: string;
  monthAr: string;
  revenue: number;
  appointments: number;
}

function BarChart({ data, locale }: { data: ChartBar[]; locale: string }) {
  const maxRevenue = Math.max(...data.map((d) => d.revenue), 1);
  const isAr = locale === 'ar-EG';
  return (
    <div className="flex items-end gap-2 h-44 pt-4">
      {data.map((d, i) => {
        const heightPct = (d.revenue / maxRevenue) * 100;
        const isLast = i === data.length - 1;
        return (
          <div key={d.month + i} className="flex-1 flex flex-col items-center gap-1 group">
            <div className="relative w-full flex flex-col items-center">
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 hidden group-hover:flex bg-gray-900 text-white text-[10px] px-2 py-1 rounded-md whitespace-nowrap z-10 pointer-events-none">
                {formatCurrency(d.revenue, 'EGP', locale)}
              </div>
              <div
                className={`w-full rounded-t-md transition-all duration-300 ${isLast ? 'bg-primary-600' : 'bg-primary-200 dark:bg-primary-800 group-hover:bg-primary-400'}`}
                style={{ height: `${(heightPct / 100) * 140}px` }}
              />
            </div>
            <span className="text-[10px] text-gray-400 dark:text-gray-500">
              {isAr ? d.monthAr : d.month}
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface SourceBarItem {
  sourceAr: string;
  sourceEn: string;
  pct: number;
  count: number;
  color: string;
}

function SourceBar({ sources, locale, lang }: { sources: SourceBarItem[]; locale: string; lang: string }) {
  const isAr = lang === 'ar';
  return (
    <div className="space-y-3">
      <div className="flex h-5 rounded-full overflow-hidden gap-0.5">
        {sources.map((s) => (
          <div
            key={s.sourceEn}
            title={`${isAr ? s.sourceAr : s.sourceEn} — ${formatNumber(s.pct, locale)}%`}
            style={{ width: `${s.pct}%`, backgroundColor: s.color }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {sources.map((s) => (
          <div key={s.sourceEn} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
            <span>{isAr ? s.sourceAr : s.sourceEn}</span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">{formatNumber(s.pct, locale)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function pct(n: number, locale: string, showPlus = false): string {
  const abs = Math.abs(n);
  const sign = n > 0 && showPlus ? '+' : n < 0 ? '-' : '';
  return `${sign}${formatNumber(abs, locale)}%`;
}

function KpiSkeleton() {
  return <div className="h-8 animate-pulse bg-gray-200 dark:bg-neutral-700 rounded w-24" />;
}

export default function AnalyticsPage() {
  const { lang, t } = useLang();
  const [period, setPeriod] = useState<Period>('month');

  const locale = lang === 'ar' ? 'ar-EG' : 'en-US';

  const { data: overview, isLoading: overviewLoading } = useAnalyticsOverview();
  const { data: monthlyRevenue = [], isLoading: revenueLoading } = useMonthlyRevenue(7);
  const { data: sourceBreakdown = [], isLoading: sourcesLoading } = useSourceBreakdown();
  const { data: specialtyData = [], isLoading: specialtiesLoading } = useSpecialtyBreakdown();
  const { data: noShowByDay = [], isLoading: noShowLoading } = useNoShowByDay();
  const { data: topDoctors = [], isLoading: topDoctorsLoading } = useTopDoctors(5);

  const chartData: ChartBar[] = monthlyRevenue.map((d: MonthlyRevenue) => ({
    month:        shortMonth(d.month, 'en-US'),
    monthAr:      shortMonth(d.month, 'ar-EG'),
    revenue:      d.revenue,
    appointments: d.appointments,
  }));

  const lastBar  = chartData[chartData.length - 1];

  const currentRevenue  = overview?.revenue.current      ?? lastBar?.revenue      ?? 0;
  const revenueGrowth   = overview?.revenue.growthPct    ?? 0;
  const currentAppts    = overview?.appointments.current ?? lastBar?.appointments ?? 0;
  const apptGrowth      = overview?.appointments.growthPct ?? 0;
  const totalPatients   = overview?.patients.total       ?? 0;
  const noShowRate      = overview?.noShowRate.current   ?? 0;

  const avgPerAppt = currentAppts > 0 ? Math.round(currentRevenue / currentAppts) : 0;

  const sourcesForDisplay: SourceBarItem[] = sourceBreakdown.map((s: SourceStat, idx: number) => ({
    sourceAr: s.sourceNameAr,
    sourceEn: s.sourceNameEn,
    pct:      s.pct,
    count:    s.count,
    color:    SOURCE_COLORS[idx % SOURCE_COLORS.length],
  }));

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold font-display text-gray-900 dark:text-gray-100">{t('التحليلات', 'Analytics')}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {new Date().toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US', { month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex gap-2">
          <div className="flex gap-1 bg-gray-100 dark:bg-neutral-800 rounded-lg p-1">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  period === p
                    ? 'bg-white dark:bg-neutral-700 text-primary-700 dark:text-primary-300 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                {t(PERIOD_LABELS[p].ar, PERIOD_LABELS[p].en)}
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline">
            <Download className="w-4 h-4" />
            {t('تصدير', 'Export')}
          </Button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {overviewLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl p-5 border bg-white dark:bg-neutral-900 border-gray-100 dark:border-neutral-800 shadow-1">
              <KpiSkeleton />
            </div>
          ))
        ) : (
          <>
            <StatCard
              title={t('إجمالي الإيرادات', 'Total Revenue')}
              value={formatCurrency(currentRevenue, 'EGP', locale)}
              icon={<DollarSign className="w-5 h-5" />}
              color="blue"
              trend={revenueGrowth !== 0 ? { value: Math.abs(revenueGrowth), up: revenueGrowth > 0 } : undefined}
            />
            <StatCard
              title={t('إجمالي المواعيد', 'Total Appointments')}
              value={formatNumber(currentAppts, locale)}
              icon={<Calendar className="w-5 h-5" />}
              color="green"
              trend={apptGrowth !== 0 ? { value: Math.abs(apptGrowth), up: apptGrowth > 0 } : undefined}
            />
            <StatCard
              title={t('المرضى الفريدون', 'Unique Patients')}
              value={formatNumber(totalPatients, locale)}
              icon={<Users className="w-5 h-5" />}
              color="violet"
              trend={{ value: 8, up: true }}
            />
            <StatCard
              title={t('معدل الغياب', 'No-Show Rate')}
              value={`${formatNumber(noShowRate, locale)}%`}
              icon={<Activity className="w-5 h-5" />}
              color="amber"
              trend={{ value: 2, up: false }}
            />
          </>
        )}
      </div>

      {/* Revenue chart + source breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t('الإيرادات الشهرية', 'Monthly Revenue')}</CardTitle>
            <span className="text-xs text-gray-400 dark:text-gray-500">{t('آخر 7 أشهر', 'Last 7 months')}</span>
          </CardHeader>
          <CardContent>
            {revenueLoading ? (
              <div className="h-44 animate-pulse bg-gray-100 dark:bg-neutral-700 rounded-lg" />
            ) : (
              <BarChart data={chartData} locale={locale} />
            )}
            <div className="flex gap-6 mt-4 pt-4 border-t border-gray-50 dark:border-neutral-700">
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">{t('الشهر الحالي', 'Current month')}</p>
                <p className="font-bold tabular-nums font-mono text-gray-900 dark:text-gray-100">
                  {overviewLoading
                    ? <span className="inline-block h-5 w-24 animate-pulse bg-gray-200 dark:bg-neutral-700 rounded" />
                    : formatCurrency(currentRevenue, 'EGP', locale)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">{t('نمو شهري', 'MoM growth')}</p>
                <p className={`font-bold tabular-nums font-mono flex items-center gap-1 ${revenueGrowth >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {overviewLoading
                    ? <span className="inline-block h-5 w-16 animate-pulse bg-gray-200 dark:bg-neutral-700 rounded" />
                    : (
                      <>
                        {revenueGrowth >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                        {pct(revenueGrowth, locale, true)}
                      </>
                    )}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">{t('متوسط/موعد', 'Avg / appt')}</p>
                <p className="font-bold tabular-nums font-mono text-gray-900 dark:text-gray-100">
                  {overviewLoading
                    ? <span className="inline-block h-5 w-24 animate-pulse bg-gray-200 dark:bg-neutral-700 rounded" />
                    : formatCurrency(avgPerAppt, 'EGP', locale)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t('مصادر المرضى', 'Patient Sources')}</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            {sourcesLoading ? (
              <div className="space-y-3">
                <div className="h-5 animate-pulse bg-gray-200 dark:bg-neutral-700 rounded-full" />
                <div className="h-24 animate-pulse bg-gray-100 dark:bg-neutral-700/50 rounded-lg" />
              </div>
            ) : (
              <>
                <SourceBar sources={sourcesForDisplay} locale={locale} lang={lang} />
                <div className="space-y-2">
                  {sourcesForDisplay.map((s) => (
                    <div key={s.sourceEn} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                        <span className="text-gray-700 dark:text-gray-300">{lang === 'ar' ? s.sourceAr : s.sourceEn}</span>
                      </div>
                      <span className="font-mono tabular-nums font-medium text-gray-900 dark:text-gray-100">
                        {formatNumber(s.count, locale)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Specialty breakdown */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t('أداء التخصصات', 'Specialty Performance')}</CardTitle>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {new Date().toLocaleString(locale, { month: 'long', year: 'numeric' })}
          </span>
        </CardHeader>
        <CardContent className="p-0">
          {specialtiesLoading ? (
            <div className="space-y-2 p-5">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-8 animate-pulse bg-gray-100 dark:bg-neutral-700 rounded" />
              ))}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50 dark:border-neutral-700 bg-gray-50/50 dark:bg-neutral-800/50">
                  <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs">{t('التخصص', 'Specialty')}</th>
                  <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs">{t('الإيرادات', 'Revenue')}</th>
                  <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs hidden md:table-cell">{t('المواعيد', 'Appointments')}</th>
                  <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs">{t('معدل الغياب', 'No-Show %')}</th>
                  <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs hidden lg:table-cell">{t('الحصة', 'Share')}</th>
                </tr>
              </thead>
              <tbody>
                {specialtyData.map((s: SpecialtyStat) => (
                  <tr key={s.specialtyId} className="border-b border-gray-50 dark:border-neutral-700/50 hover:bg-gray-50/50 dark:hover:bg-neutral-700/30 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-gray-900 dark:text-gray-100">
                      {lang === 'ar' ? s.specialtyAr : s.specialtyEn}
                    </td>
                    <td className="px-5 py-3.5 font-mono tabular-nums text-gray-700 dark:text-gray-300">
                      {formatCurrency(s.revenue, 'EGP', locale)}
                    </td>
                    <td className="px-5 py-3.5 tabular-nums text-gray-600 dark:text-gray-400 hidden md:table-cell">
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
                          <div className="h-full bg-primary-500 rounded-full" style={{ width: `${s.sharePct}%` }} />
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400 w-8">{formatNumber(s.sharePct, locale)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* No-show by day + specialty share mini bars */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader><CardTitle>{t('معدل الغياب حسب اليوم', 'No-Show Rate by Day')}</CardTitle></CardHeader>
          <CardContent>
            {noShowLoading ? (
              <div className="space-y-2.5">
                {[...Array(7)].map((_, i) => <div key={i} className="h-6 animate-pulse bg-gray-100 dark:bg-neutral-700 rounded" />)}
              </div>
            ) : (
              <div className="space-y-2.5">
                {noShowByDay.filter((d: NoShowDay) => d.total > 0).map((d: NoShowDay) => (
                  <div key={d.dayOfWeek}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-600 dark:text-gray-400 w-24">
                        {lang === 'ar' ? d.dayAr : d.dayEn}
                        <span className="ml-1 text-gray-400 dark:text-gray-500">({formatNumber(d.total, locale)})</span>
                      </span>
                      <span className={`font-semibold ${d.noShowRate >= 15 ? 'text-red-500' : d.noShowRate >= 10 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {formatNumber(d.noShowRate, locale)}%
                      </span>
                    </div>
                    <div className="h-2 bg-gray-100 dark:bg-neutral-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${d.noShowRate >= 15 ? 'bg-red-400' : d.noShowRate >= 10 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                        style={{ width: `${Math.min((d.noShowRate / 25) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
                {!noShowLoading && noShowByDay.every((d: NoShowDay) => d.total === 0) && (
                  <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
                    {t('لا توجد بيانات', 'No data available')}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t('أعلى الأطباء إيراداً', 'Top Doctors by Revenue')}</CardTitle></CardHeader>
          <CardContent>
            {topDoctorsLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => <div key={i} className="h-8 animate-pulse bg-gray-100 dark:bg-neutral-700 rounded" />)}
              </div>
            ) : (
              <div className="space-y-3">
                {topDoctors.map((dr: DoctorStat, idx: number) => {
                  const maxRev = topDoctors[0]?.revenue ?? 1;
                  return (
                    <div key={dr.doctorId} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-gray-300 dark:text-gray-600 w-4">
                        {formatNumber(idx + 1, locale)}
                      </span>
                      <div className="flex-1">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium text-gray-800 dark:text-gray-200">
                            {lang === 'ar' ? dr.nameAr : dr.nameEn}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-400">{formatNumber(dr.appointments, locale)} appts</span>
                            <span className="font-mono tabular-nums text-gray-700 dark:text-gray-300">
                              {formatCurrency(dr.revenue, 'EGP', locale)}
                            </span>
                          </div>
                        </div>
                        <div className="h-2 bg-gray-100 dark:bg-neutral-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary-600 rounded-full transition-all duration-500"
                            style={{ width: `${(dr.revenue / maxRev) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
