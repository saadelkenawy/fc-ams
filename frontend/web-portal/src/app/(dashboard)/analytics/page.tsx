'use client';

import { useState } from 'react';
import { TrendingUp, TrendingDown, Users, Calendar, DollarSign, Activity, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { KpiCard } from '@/components/ui/KpiCard';
import { Badge } from '@/components/ui/Badge';
import { useLang } from '@/contexts/LanguageContext';
import { formatCurrency } from '@/lib/utils';

// Mock analytics data — wire to analytics-service when available
const MONTHLY_REVENUE = [
  { month: 'Oct', monthAr: 'أكت', revenue: 180_000, appointments: 420 },
  { month: 'Nov', monthAr: 'نوف', revenue: 210_000, appointments: 490 },
  { month: 'Dec', monthAr: 'ديس', revenue: 195_000, appointments: 455 },
  { month: 'Jan', monthAr: 'يناير', revenue: 240_000, appointments: 560 },
  { month: 'Feb', monthAr: 'فبراير', revenue: 225_000, appointments: 530 },
  { month: 'Mar', monthAr: 'مارس', revenue: 270_000, appointments: 620 },
  { month: 'Apr', monthAr: 'أبريل', revenue: 258_000, appointments: 600 },
];

const SPECIALTY_STATS = [
  { specialtyAr: 'النساء والعقم',      specialtyEn: 'Gynecology & Infertility', revenue: 110_000, appointments: 240, noShowRate: 8,  growthPct: 12 },
  { specialtyAr: 'القلب',              specialtyEn: 'Cardiology',               revenue: 85_000,  appointments: 180, noShowRate: 5,  growthPct: 18 },
  { specialtyAr: 'الجلدية',            specialtyEn: 'Dermatology',              revenue: 63_000,  appointments: 200, noShowRate: 12, growthPct: -3 },
  { specialtyAr: 'الأطفال والمواليد',  specialtyEn: 'Pediatrics & Newborn',     revenue: 52_000,  appointments: 195, noShowRate: 7,  growthPct: 5 },
  { specialtyAr: 'الباطنة',            specialtyEn: 'Internal Medicine',        revenue: 38_000,  appointments: 140, noShowRate: 15, growthPct: -8 },
];

const PATIENT_SOURCES = [
  { sourceAr: 'مرضى العيادة', sourceEn: "Clinic's",   pct: 38, count: 235, color: '#DC2626' },
  { sourceAr: 'مرضى الدكتور', sourceEn: "Doctor's",   pct: 28, count: 173, color: '#F87171' },
  { sourceAr: 'VEZ',           sourceEn: 'VEZ',        pct: 14, count: 87,  color: '#6366F1' },
  { sourceAr: 'EKF',           sourceEn: 'EKF',        pct: 10, count: 62,  color: '#8B5CF6' },
  { sourceAr: 'أونلاين',      sourceEn: 'Online',     pct: 6,  count: 37,  color: '#EC4899' },
  { sourceAr: 'أخرى',         sourceEn: 'Other',      pct: 4,  count: 25,  color: '#94A3B8' },
];

const PERIODS = ['week', 'month', 'quarter', 'year'] as const;
type Period = typeof PERIODS[number];

const PERIOD_LABELS: Record<Period, { ar: string; en: string }> = {
  week:    { ar: 'أسبوع', en: 'Week' },
  month:   { ar: 'شهر',   en: 'Month' },
  quarter: { ar: 'ربع',   en: 'Quarter' },
  year:    { ar: 'سنة',   en: 'Year' },
};

// Simple SVG bar chart — no external dep required
function BarChart({ data, lang }: { data: typeof MONTHLY_REVENUE; lang: string }) {
  const maxRevenue = Math.max(...data.map((d) => d.revenue));
  return (
    <div className="flex items-end gap-2 h-44 pt-4">
      {data.map((d, i) => {
        const heightPct = (d.revenue / maxRevenue) * 100;
        const isLast = i === data.length - 1;
        return (
          <div key={d.month} className="flex-1 flex flex-col items-center gap-1 group">
            <div className="relative w-full flex flex-col items-center">
              {/* Tooltip */}
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 hidden group-hover:flex bg-gray-900 text-white text-[10px] px-2 py-1 rounded-md whitespace-nowrap z-10 pointer-events-none">
                {formatCurrency(d.revenue, 'EGP', 'en-US')}
              </div>
              <div
                className={`w-full rounded-t-md transition-all duration-300 ${isLast ? 'bg-primary-600' : 'bg-primary-200 group-hover:bg-primary-400'}`}
                style={{ height: `${(heightPct / 100) * 140}px` }}
              />
            </div>
            <span className="text-[10px] text-gray-400 tabular-nums">
              {lang === 'ar' ? d.monthAr : d.month}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Horizontal stacked bar for source breakdown
function SourceBar({ sources, lang }: { sources: typeof PATIENT_SOURCES; lang: string }) {
  return (
    <div className="space-y-3">
      <div className="flex h-5 rounded-full overflow-hidden gap-0.5">
        {sources.map((s) => (
          <div
            key={s.sourceEn}
            title={`${lang === 'ar' ? s.sourceAr : s.sourceEn} — ${s.pct}%`}
            style={{ width: `${s.pct}%`, backgroundColor: s.color }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {sources.map((s) => (
          <div key={s.sourceEn} className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
            <span>{lang === 'ar' ? s.sourceAr : s.sourceEn}</span>
            <span className="font-semibold tabular-nums text-gray-900">{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { lang, t } = useLang();
  const [period, setPeriod] = useState<Period>('month');

  const currentMonth = MONTHLY_REVENUE[MONTHLY_REVENUE.length - 1];
  const prevMonth    = MONTHLY_REVENUE[MONTHLY_REVENUE.length - 2];
  const revenueGrowth = Math.round(((currentMonth.revenue - prevMonth.revenue) / prevMonth.revenue) * 100);
  const apptGrowth    = Math.round(((currentMonth.appointments - prevMonth.appointments) / prevMonth.appointments) * 100);
  const totalPatients = PATIENT_SOURCES.reduce((s, p) => s + p.count, 0);
  const avgNoShow     = Math.round(SPECIALTY_STATS.reduce((s, x) => s + x.noShowRate, 0) / SPECIALTY_STATS.length);

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold font-display text-gray-900">{t('التحليلات', 'Analytics')}</h2>
          <p className="text-sm text-gray-500 mt-0.5">{t('إبريل 2026', 'April 2026')}</p>
        </div>
        <div className="flex gap-2">
          {/* Period selector */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  period === p
                    ? 'bg-white text-primary-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
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
        <KpiCard
          title="Total Revenue"
          titleAr="إجمالي الإيرادات"
          value={formatCurrency(currentMonth.revenue, 'EGP', lang === 'ar' ? 'ar-EG' : 'en-US')}
          icon={<DollarSign className="w-5 h-5" />}
          change={revenueGrowth}
          lang={lang as 'ar' | 'en'}
          featured
        />
        <KpiCard
          title="Total Appointments"
          titleAr="إجمالي المواعيد"
          value={currentMonth.appointments.toString()}
          icon={<Calendar className="w-5 h-5" />}
          change={apptGrowth}
          lang={lang as 'ar' | 'en'}
        />
        <KpiCard
          title="Unique Patients"
          titleAr="المرضى الفريدون"
          value={totalPatients.toString()}
          icon={<Users className="w-5 h-5" />}
          change={8}
          lang={lang as 'ar' | 'en'}
        />
        <KpiCard
          title="No-Show Rate"
          titleAr="معدل الغياب"
          value={`${avgNoShow}%`}
          icon={<Activity className="w-5 h-5" />}
          change={-2}
          lang={lang as 'ar' | 'en'}
        />
      </div>

      {/* Revenue chart + source breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t('الإيرادات الشهرية', 'Monthly Revenue')}</CardTitle>
            <span className="text-xs text-gray-400">{t('آخر 7 أشهر', 'Last 7 months')}</span>
          </CardHeader>
          <CardContent>
            <BarChart data={MONTHLY_REVENUE} lang={lang} />
            <div className="flex gap-6 mt-4 pt-4 border-t border-gray-50">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">{t('الشهر الحالي', 'Current month')}</p>
                <p className="font-bold tabular-nums font-mono text-gray-900">
                  {formatCurrency(currentMonth.revenue, 'EGP', 'en-US')}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">{t('نمو شهري', 'MoM growth')}</p>
                <p className={`font-bold tabular-nums font-mono flex items-center gap-1 ${revenueGrowth >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {revenueGrowth >= 0
                    ? <TrendingUp className="w-3.5 h-3.5" />
                    : <TrendingDown className="w-3.5 h-3.5" />}
                  {revenueGrowth > 0 ? '+' : ''}{revenueGrowth}%
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">{t('متوسط/موعد', 'Avg / appt')}</p>
                <p className="font-bold tabular-nums font-mono text-gray-900">
                  {formatCurrency(Math.round(currentMonth.revenue / currentMonth.appointments), 'EGP', 'en-US')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t('مصادر المرضى', 'Patient Sources')}</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <SourceBar sources={PATIENT_SOURCES} lang={lang} />
            <div className="space-y-2">
              {PATIENT_SOURCES.map((s) => (
                <div key={s.sourceEn} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="text-gray-700">{lang === 'ar' ? s.sourceAr : s.sourceEn}</span>
                  </div>
                  <span className="font-mono tabular-nums font-medium text-gray-900">{s.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Specialty breakdown */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t('أداء التخصصات', 'Specialty Performance')}</CardTitle>
          <span className="text-xs text-gray-400">{t('إبريل 2026', 'April 2026')}</span>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50 bg-gray-50/50">
                <th className="text-start px-5 py-3 font-medium text-gray-500 text-xs">{t('التخصص', 'Specialty')}</th>
                <th className="text-start px-5 py-3 font-medium text-gray-500 text-xs">{t('الإيرادات', 'Revenue')}</th>
                <th className="text-start px-5 py-3 font-medium text-gray-500 text-xs hidden md:table-cell">{t('المواعيد', 'Appointments')}</th>
                <th className="text-start px-5 py-3 font-medium text-gray-500 text-xs">{t('معدل الغياب', 'No-Show %')}</th>
                <th className="text-start px-5 py-3 font-medium text-gray-500 text-xs">{t('النمو', 'Growth')}</th>
                <th className="text-start px-5 py-3 font-medium text-gray-500 text-xs hidden lg:table-cell">{t('الحصة', 'Share')}</th>
              </tr>
            </thead>
            <tbody>
              {SPECIALTY_STATS.map((s) => {
                const totalRevenue = SPECIALTY_STATS.reduce((acc, x) => acc + x.revenue, 0);
                const sharePct = Math.round((s.revenue / totalRevenue) * 100);
                return (
                  <tr key={s.specialtyEn} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-gray-900">
                      {lang === 'ar' ? s.specialtyAr : s.specialtyEn}
                    </td>
                    <td className="px-5 py-3.5 font-mono tabular-nums text-gray-700">
                      {formatCurrency(s.revenue, 'EGP', 'en-US')}
                    </td>
                    <td className="px-5 py-3.5 tabular-nums text-gray-600 hidden md:table-cell">
                      {s.appointments}
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge variant={s.noShowRate > 10 ? 'danger' : s.noShowRate > 7 ? 'warning' : 'success'}>
                        {s.noShowRate}%
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`flex items-center gap-1 text-xs font-medium tabular-nums ${s.growthPct >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {s.growthPct >= 0
                          ? <TrendingUp className="w-3.5 h-3.5" />
                          : <TrendingDown className="w-3.5 h-3.5" />}
                        {s.growthPct > 0 ? '+' : ''}{s.growthPct}%
                      </span>
                    </td>
                    <td className="px-5 py-3.5 hidden lg:table-cell">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden w-20">
                          <div className="h-full bg-primary-500 rounded-full" style={{ width: `${sharePct}%` }} />
                        </div>
                        <span className="text-xs text-gray-500 tabular-nums w-8">{sharePct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* No-show trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader><CardTitle>{t('معدل الغياب حسب اليوم', 'No-Show Rate by Day')}</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              {[
                { dayAr: 'الأحد',    dayEn: 'Sunday',    rate: 6 },
                { dayAr: 'الاثنين',  dayEn: 'Monday',    rate: 9 },
                { dayAr: 'الثلاثاء', dayEn: 'Tuesday',   rate: 7 },
                { dayAr: 'الأربعاء', dayEn: 'Wednesday', rate: 14 },
                { dayAr: 'الخميس',   dayEn: 'Thursday',  rate: 11 },
                { dayAr: 'الجمعة',   dayEn: 'Friday',    rate: 18 },
              ].map((d) => (
                <div key={d.dayEn}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-600 w-20">{lang === 'ar' ? d.dayAr : d.dayEn}</span>
                    <span className={`font-semibold tabular-nums ${d.rate >= 15 ? 'text-red-500' : d.rate >= 10 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {d.rate}%
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${d.rate >= 15 ? 'bg-red-400' : d.rate >= 10 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                      style={{ width: `${(d.rate / 20) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t('أعلى الأطباء إيراداً', 'Top Doctors by Revenue')}</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { rankNum: 1, nameAr: 'د. سامر نور',   nameEn: 'Dr. Samer Nour',   revenue: 55_000, growthPct: 18 },
                { rankNum: 2, nameAr: 'د. هدى إبراهيم', nameEn: 'Dr. Hoda Ibrahim',revenue: 48_000, growthPct: 12 },
                { rankNum: 3, nameAr: 'د. رانيا سعيد',  nameEn: 'Dr. Rania Said',  revenue: 38_000, growthPct: -3 },
                { rankNum: 4, nameAr: 'د. خالد رشاد',   nameEn: 'Dr. Khaled Rashad',revenue: 32_000, growthPct: 5 },
              ].map((dr) => {
                const maxRev = 55_000;
                return (
                  <div key={dr.rankNum} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-gray-300 tabular-nums w-4">{dr.rankNum}</span>
                    <div className="flex-1">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-medium text-gray-800">{lang === 'ar' ? dr.nameAr : dr.nameEn}</span>
                        <div className="flex items-center gap-2">
                          <span className={`flex items-center gap-0.5 ${dr.growthPct >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            {dr.growthPct >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {dr.growthPct > 0 ? '+' : ''}{dr.growthPct}%
                          </span>
                          <span className="font-mono tabular-nums text-gray-700">{formatCurrency(dr.revenue, 'EGP', 'en-US')}</span>
                        </div>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
