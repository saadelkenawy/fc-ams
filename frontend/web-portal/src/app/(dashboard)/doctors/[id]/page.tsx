'use client';

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, Stethoscope, Wallet, TrendingUp, Clock,
  Calendar, Users, Star, Wifi, Pencil, ReceiptText,
  Loader2, Banknote,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/StatCard';
import { useLang } from '@/contexts/LanguageContext';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { billingApi } from '@/lib/api';
import {
  useDoctors,
  useSpecialtyMap,
  useDoctorSchedules,
} from '@/hooks/useDoctors';
import type { DoctorSettlement } from '@fadl/types';

/* ── helpers ─────────────────────────────────────────────────────────── */

function getMonthBounds(year: number, month: number) {
  const from = new Date(year, month, 1).toISOString().split('T')[0];
  const to   = new Date(year, month + 1, 0).toISOString().split('T')[0];
  return { from, to };
}

function slotsPerDay(start: string, end: string, dur: number): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const mins = eh * 60 + em - (sh * 60 + sm);
  return mins > 0 ? Math.floor(mins / dur) : 0;
}

const TABS = [
  { key: 'overview',  labelAr: 'نظرة عامة', labelEn: 'Overview'  },
  { key: 'schedule',  labelAr: 'الجدول',    labelEn: 'Schedule'  },
  { key: 'earnings',  labelAr: 'الأرباح',   labelEn: 'Earnings'  },
] as const;

type TabKey = typeof TABS[number]['key'];

const DAYS = [
  { num: 0, ar: 'الأحد',    en: 'Sun' },
  { num: 1, ar: 'الاثنين',  en: 'Mon' },
  { num: 2, ar: 'الثلاثاء', en: 'Tue' },
  { num: 3, ar: 'الأربعاء', en: 'Wed' },
  { num: 4, ar: 'الخميس',   en: 'Thu' },
  { num: 5, ar: 'الجمعة',   en: 'Fri' },
  { num: 6, ar: 'السبت',    en: 'Sat' },
] as const;

const PAYMENT_LABELS: Record<string, { ar: string; en: string }> = {
  cash:          { ar: 'كاش',          en: 'Cash' },
  instapay:      { ar: 'انستاباي',     en: 'InstaPay' },
  bank_transfer: { ar: 'تحويل بنكي',   en: 'Bank Transfer' },
  vfc_wallet:    { ar: 'محفظة VFC',    en: 'VFC Wallet' },
  mobile_wallet: { ar: 'محفظة موبايل', en: 'Mobile Wallet' },
};

/* ── page ────────────────────────────────────────────────────────────── */

export default function DoctorProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router   = useRouter();
  const { lang, t } = useLang();
  const locale   = lang === 'ar' ? 'ar-EG' : 'en-US';

  const [tab, setTab] = useState<TabKey>('overview');

  /* doctor data */
  const { data: doctorsData, isLoading: doctorLoading } = useDoctors({ limit: 500 });
  const specialtyMap = useSpecialtyMap();
  const doctor = doctorsData?.data.find((d) => d.id === id) ?? null;

  const docName    = doctor ? (lang === 'ar' ? (doctor.nameAr ?? doctor.nameEn) : doctor.nameEn) : '…';
  const docInitial = docName.replace(/^د[.،]\s*|^Dr[.\s]/i, '').charAt(0).toUpperCase();
  const spec       = doctor ? specialtyMap.get(doctor.specialtyId) : null;
  const specName   = spec ? (lang === 'ar' ? spec.nameAr : spec.nameEn) : `#${doctor?.specialtyId ?? ''}`;

  /* schedule data (for overview stats + schedule tab) */
  const { data: schedules = [], isLoading: schedLoading } = useDoctorSchedules(id);
  const activeDays       = schedules.filter((s) => s.isActive).length;
  const totalWeeklySlots = schedules
    .filter((s) => s.isActive)
    .reduce((sum, s) => sum + slotsPerDay(s.startTime, s.endTime, s.slotDurationMinutes), 0);

  /* earnings state */
  const now   = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const { from, to } = useMemo(() => getMonthBounds(year, month), [year, month]);

  function shiftMonth(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }

  const { data: settlement, isLoading: settlLoading, isError: settlError } = useQuery({
    queryKey: ['admin-doctor-settlement', id, from, to],
    queryFn: async () => {
      const { data } = await billingApi.get<{ data: DoctorSettlement }>('/settlements/doctor', {
        params: { doctorId: id, from, to },
      });
      return data.data;
    },
    enabled: tab === 'earnings' && !!id,
    staleTime: 30_000,
  });

  const transactions = settlement?.transactions ?? [];
  const monthLabel = new Date(year, month, 1).toLocaleString(locale, { month: 'long', year: 'numeric' });

  /* loading */
  if (doctorLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin me-2" />
        {t('جاري التحميل...', 'Loading...')}
      </div>
    );
  }

  if (!doctor) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          {t('لم يتم العثور على الطبيب', 'Doctor not found')}
        </p>
      </div>
    );
  }

  const splits = [
    { labelAr: 'كشف عيادة',       labelEn: 'Consultation', split: doctor.revenueSplits.consultation },
    { labelAr: 'إجراء عملي',      labelEn: 'Operative',    split: doctor.revenueSplits.operative },
    { labelAr: 'استشارة أونلاين', labelEn: 'Online',       split: doctor.revenueSplits.online },
  ];

  return (
    <div className="space-y-5 max-w-5xl mx-auto animate-fade-in">

      {/* Back */}
      <button
        onClick={() => router.push('/doctors')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors group"
      >
        <ArrowLeft className={cn('w-4 h-4 transition-transform group-hover:-translate-x-0.5', lang === 'ar' && 'rotate-180')} />
        {t('عودة إلى الأطباء', 'Back to Doctors')}
      </button>

      {/* Hero card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-5 flex-wrap">
            {/* Avatar */}
            <div className="w-20 h-20 rounded-2xl bg-primary-600 text-white flex items-center justify-center text-3xl font-bold flex-shrink-0 shadow-md">
              {docInitial}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-display font-bold text-gray-900 dark:text-gray-100">{docName}</h2>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap text-sm text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1.5">
                      <Stethoscope className="w-3.5 h-3.5" />
                      {specName}
                    </span>
                    {doctor.subSpecialty && (
                      <span className="text-gray-400 dark:text-gray-500">· {doctor.subSpecialty}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
                  {doctor.isOnlineDoctor && (
                    <Badge variant="info" dot>{t('أونلاين', 'Online')}</Badge>
                  )}
                  <Badge variant={doctor.isActive ? 'success' : 'default'} dot>
                    {doctor.isActive ? t('نشط', 'Active') : t('غير نشط', 'Inactive')}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`/doctors/${id}/schedule`)}
                  >
                    <Calendar className="w-4 h-4" />
                    {t('الجدول', 'Schedule')}
                  </Button>
                  <Button size="sm">
                    <Pencil className="w-4 h-4" />
                    {t('تعديل', 'Edit')}
                  </Button>
                </div>
              </div>

              {/* Mini stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5 pt-4 border-t border-gray-100 dark:border-neutral-700">
                {[
                  {
                    icon: <Calendar className="w-4 h-4 text-primary-600 dark:text-primary-400" />,
                    value: schedLoading ? '…' : activeDays,
                    label: t('أيام عمل', 'Work Days'),
                  },
                  {
                    icon: <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />,
                    value: schedLoading ? '…' : totalWeeklySlots,
                    label: t('مواعيد أسبوعية', 'Weekly Slots'),
                  },
                  {
                    icon: <Wifi className="w-4 h-4 text-blue-500" />,
                    value: doctor.isOnlineDoctor ? t('متاح', 'Available') : t('غير متاح', 'N/A'),
                    label: t('استشارة بُعد', 'Teleconsult'),
                  },
                  {
                    icon: <Star className="w-4 h-4 text-amber-500" />,
                    value: `${doctor.revenueSplits.consultation.doctorPercentage}%`,
                    label: t('حصة الطبيب', 'Dr. Split'),
                  },
                ].map((s, i) => (
                  <div key={i} className="text-center p-3 rounded-xl bg-gray-50 dark:bg-neutral-900/40">
                    <div className="flex justify-center mb-1.5">{s.icon}</div>
                    <p className="font-bold text-gray-900 dark:text-gray-100 font-mono tabular-nums text-sm">{s.value}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-neutral-700">
        {TABS.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === tb.key
                ? 'border-primary-600 text-primary-700 dark:text-primary-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200',
            )}
          >
            {lang === 'ar' ? tb.labelAr : tb.labelEn}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Doctor info */}
          <Card>
            <CardHeader><CardTitle>{t('بيانات الطبيب', 'Doctor Info')}</CardTitle></CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-0">
                {[
                  {
                    labelAr: 'التخصص',
                    labelEn: 'Specialty',
                    value: specName,
                  },
                  {
                    labelAr: 'الاستشارة عن بُعد',
                    labelEn: 'Teleconsult',
                    value: doctor.isOnlineDoctor ? t('متاح', 'Available') : t('غير متاح', 'Unavailable'),
                  },
                  {
                    labelAr: 'الحالة',
                    labelEn: 'Status',
                    value: doctor.isActive ? t('نشط', 'Active') : t('غير نشط', 'Inactive'),
                  },
                  {
                    labelAr: 'طريقة الدفع',
                    labelEn: 'Payment',
                    value: doctor.paymentMethod
                      ? (lang === 'ar'
                        ? (PAYMENT_LABELS[doctor.paymentMethod]?.ar ?? doctor.paymentMethod)
                        : (PAYMENT_LABELS[doctor.paymentMethod]?.en ?? doctor.paymentMethod))
                      : '—',
                  },
                  {
                    labelAr: 'الفرع',
                    labelEn: 'Branch',
                    value: `#${doctor.branchId}`,
                  },
                ].map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-2.5 border-b border-gray-50 dark:border-neutral-700/50 last:border-0"
                  >
                    <span className="text-sm text-gray-500 dark:text-gray-400">{lang === 'ar' ? item.labelAr : item.labelEn}</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Revenue splits */}
          <Card>
            <CardHeader><CardTitle>{t('نسب الأرباح', 'Revenue Splits')}</CardTitle></CardHeader>
            <CardContent className="space-y-4 pt-0">
              {splits.map((s) => (
                <div key={s.labelEn}>
                  <div className="flex justify-between text-xs mb-2">
                    <span className="text-gray-600 dark:text-gray-300 font-medium">
                      {lang === 'ar' ? s.labelAr : s.labelEn}
                    </span>
                    <div className="flex gap-3">
                      <span className="font-semibold text-primary-700 dark:text-primary-400">
                        {t('طبيب', 'Dr')} {s.split.doctorPercentage}%
                      </span>
                      <span className="text-gray-400 dark:text-gray-500">
                        {t('عيادة', 'Clinic')} {s.split.clinicPercentage}%
                      </span>
                    </div>
                  </div>
                  <div className="h-2 bg-gray-100 dark:bg-neutral-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary-600 rounded-full transition-all duration-500"
                      style={{ width: `${s.split.doctorPercentage}%` }}
                    />
                  </div>
                </div>
              ))}

              <div className="pt-2 flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1"
                  onClick={() => router.push(`/doctors/${id}/schedule`)}
                >
                  <Calendar className="w-4 h-4" />
                  {t('إدارة الجدول', 'Manage Schedule')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => setTab('earnings')}
                >
                  <TrendingUp className="w-4 h-4" />
                  {t('الأرباح', 'Earnings')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Schedule ── */}
      {tab === 'schedule' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('الجدول الأسبوعي', 'Weekly Schedule')}</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/doctors/${id}/schedule`)}
              >
                {t('إدارة كاملة', 'Full Management')}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {schedLoading ? (
              <div className="flex items-center justify-center py-10 text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin me-2" />
                {t('جاري التحميل...', 'Loading...')}
              </div>
            ) : (
              <>
                {/* Visual week grid */}
                <div className="flex gap-1.5 mb-6">
                  {DAYS.map((day) => {
                    const sched = schedules.find((s) => s.dayOfWeek === day.num);
                    const active = sched?.isActive ?? false;
                    const slots  = active && sched ? slotsPerDay(sched.startTime, sched.endTime, sched.slotDurationMinutes) : 0;
                    return (
                      <div key={day.num} className="flex-1 flex flex-col items-center gap-1.5">
                        <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase">
                          {lang === 'ar' ? day.ar.slice(0, 3) : day.en}
                        </span>
                        <div
                          className={cn(
                            'w-full rounded-xl flex flex-col items-center justify-center gap-0.5 py-3 transition-all',
                            active
                              ? 'bg-primary-600 text-white shadow-sm'
                              : 'bg-gray-100 dark:bg-neutral-800 text-gray-300 dark:text-gray-600',
                          )}
                          style={{ minHeight: '72px' }}
                        >
                          {active ? (
                            <>
                              <span className="text-[11px] font-mono font-semibold">{slots}</span>
                              <span className="text-[9px] text-white/70">{lang === 'ar' ? 'موعد' : 'slots'}</span>
                              <span className="text-[9px] text-white/60 font-mono">{sched!.startTime.slice(0, 5)}</span>
                            </>
                          ) : (
                            <span className="text-[10px]">—</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Day rows */}
                <div className="space-y-2">
                  {schedules.filter((s) => s.isActive).length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-8 text-gray-400">
                      <Calendar className="w-8 h-8" />
                      <p className="text-sm">{t('لا يوجد جدول مُفعَّل', 'No active schedule configured')}</p>
                      <button
                        onClick={() => router.push(`/doctors/${id}/schedule`)}
                        className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
                      >
                        {t('+ إضافة جدول', '+ Configure schedule')}
                      </button>
                    </div>
                  ) : (
                    schedules
                      .filter((s) => s.isActive)
                      .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
                      .map((s) => {
                        const day = DAYS.find((d) => d.num === s.dayOfWeek)!;
                        const slots = slotsPerDay(s.startTime, s.endTime, s.slotDurationMinutes);
                        return (
                          <div
                            key={s.id}
                            className="flex items-center gap-4 p-3 rounded-xl bg-gray-50 dark:bg-neutral-900/40"
                          >
                            <span className="w-20 text-sm font-semibold text-gray-700 dark:text-gray-300 flex-shrink-0">
                              {lang === 'ar' ? day.ar : day.en}
                            </span>
                            <Clock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            <span className="font-mono text-sm text-gray-600 dark:text-gray-400 flex-1" dir="ltr">
                              {s.startTime} – {s.endTime}
                            </span>
                            <Badge variant="info" className="text-[10px]">
                              {slots} {t('موعد', 'slots')} · {s.slotDurationMinutes}{t('د', 'min')}
                            </Badge>
                          </div>
                        );
                      })
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Earnings ── */}
      {tab === 'earnings' && (
        <div className="space-y-4">
          {/* Month picker */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => shiftMonth(-1)}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-700 text-gray-500 dark:text-gray-300 transition-colors"
            >
              {lang === 'ar' ? '›' : '‹'}
            </button>
            <div className="flex items-center gap-2 border border-gray-200 dark:border-neutral-600 rounded-lg px-3 py-1.5">
              <input
                type="month"
                value={`${year}-${String(month + 1).padStart(2, '0')}`}
                onChange={(e) => {
                  const [y, m] = e.target.value.split('-').map(Number);
                  setYear(y);
                  setMonth(m - 1);
                }}
                className="bg-transparent text-sm text-gray-900 dark:text-gray-100 focus:outline-none"
              />
            </div>
            <button
              onClick={() => shiftMonth(1)}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-700 text-gray-500 dark:text-gray-300 transition-colors"
            >
              {lang === 'ar' ? '‹' : '›'}
            </button>
            <span className="text-sm text-gray-500 dark:text-gray-400 ms-1">{monthLabel}</span>
          </div>

          {settlLoading ? (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin me-2" />
              {t('جاري التحميل...', 'Loading...')}
            </div>
          ) : settlError ? (
            <div className="py-10 text-center text-red-500 dark:text-red-400 text-sm">
              {t('تعذّر تحميل بيانات الأرباح', 'Failed to load earnings data')}
            </div>
          ) : (
            <>
              {/* KPI cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard
                  title={t('إجمالي الإيرادات', 'Gross Revenue')}
                  value={formatCurrency(settlement?.grossRevenue ?? 0, 'EGP', locale)}
                  icon={<TrendingUp className="w-5 h-5" />}
                  color="blue"
                  description={t('هذا الشهر', 'this month')}
                />
                <StatCard
                  title={t('حصة الطبيب', 'Doctor Share')}
                  value={formatCurrency(settlement?.doctorShare ?? 0, 'EGP', locale)}
                  icon={<Wallet className="w-5 h-5" />}
                  color="emerald"
                  description={t('بعد نسبة العيادة', 'after clinic cut')}
                />
                <StatCard
                  title={t('الصافي المستحق', 'Net Payable')}
                  value={formatCurrency(settlement?.netPayable ?? 0, 'EGP', locale)}
                  icon={<Banknote className="w-5 h-5" />}
                  color="violet"
                  description={t('بانتظار الصرف', 'awaiting disbursement')}
                />
              </div>

              {/* Settlement summary */}
              {(() => {
                const settledAmt = transactions
                  .filter((tx) => tx.paymentStatus === 'paid' || tx.paymentStatus === 'reconciled')
                  .reduce((sum, tx) => sum + tx.approvedCharge, 0);
                const gross      = settlement?.grossRevenue ?? 0;
                const pendingAmt = Math.max(0, gross - settledAmt);
                const pct        = gross ? (settledAmt / gross) * 100 : 0;
                const sessions   = (settlement?.totalConsultations ?? 0) + (settlement?.totalProcedures ?? 0);

                return (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle>{t('ملخص التسوية', 'Settlement Summary')}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                          { labelAr: 'الجلسات',   labelEn: 'Sessions', value: String(sessions) },
                          { labelAr: 'الإجمالي',  labelEn: 'Gross',    value: formatCurrency(gross, 'EGP', locale) },
                          { labelAr: 'المُسوَّى', labelEn: 'Settled',  value: formatCurrency(settledAmt, 'EGP', locale) },
                          { labelAr: 'المعلق',    labelEn: 'Pending',  value: formatCurrency(pendingAmt, 'EGP', locale) },
                        ].map(({ labelAr, labelEn, value }) => (
                          <div key={labelEn} className="text-center p-3 rounded-xl bg-gray-50 dark:bg-neutral-900/40">
                            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">{t(labelAr, labelEn)}</p>
                            <p className="text-sm font-semibold font-mono tabular-nums text-gray-900 dark:text-gray-100">{value}</p>
                          </div>
                        ))}
                      </div>
                      <div>
                        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1.5">
                          <span>{t('نسبة التسوية', 'Settlement ratio')}</span>
                          <span className="font-medium text-emerald-600 dark:text-emerald-400">{Math.round(pct)}%</span>
                        </div>
                        <div className="h-2.5 bg-gray-100 dark:bg-neutral-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })()}

              {/* Transactions table */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle>{t('تفاصيل المعاملات', 'Transaction Details')}</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {transactions.length === 0 ? (
                    <div className="py-12 text-center">
                      <ReceiptText className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                      <p className="text-gray-400 dark:text-gray-500 text-sm">
                        {t('لا توجد معاملات في هذه الفترة', 'No transactions in this period')}
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-50 dark:border-neutral-700 bg-gray-50/50 dark:bg-neutral-900/40">
                            <th className="text-start px-5 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">{t('التاريخ', 'Date')}</th>
                            <th className="text-start px-5 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">{t('المريض', 'Patient')}</th>
                            <th className="text-end px-5 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">{t('الرسوم', 'Charge')}</th>
                            <th className="text-end px-5 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">{t('حصة الطبيب', 'Dr. Share')}</th>
                            <th className="text-start px-5 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">{t('الحالة', 'Status')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {transactions.map((tx) => (
                            <tr
                              key={tx.id}
                              className="border-b border-gray-50 dark:border-neutral-700/50 hover:bg-gray-50/50 dark:hover:bg-neutral-700/30 transition-colors"
                            >
                              <td className="px-5 py-3.5 text-gray-500 dark:text-gray-400 text-xs">
                                {formatDate(tx.transactionDate, locale)}
                              </td>
                              <td className="px-5 py-3.5 font-mono text-xs text-gray-600 dark:text-gray-300">
                                #{tx.patientId.slice(-8).toUpperCase()}
                              </td>
                              <td className="px-5 py-3.5 text-end font-mono tabular-nums text-gray-900 dark:text-gray-100 font-medium">
                                {formatCurrency(tx.approvedCharge, 'EGP', locale)}
                              </td>
                              <td className="px-5 py-3.5 text-end font-mono tabular-nums text-primary-700 dark:text-primary-400 font-semibold">
                                {formatCurrency(tx.doctorShare, 'EGP', locale)}
                              </td>
                              <td className="px-5 py-3.5">
                                <Badge
                                  variant={
                                    tx.paymentStatus === 'paid' || tx.paymentStatus === 'reconciled'
                                      ? 'success'
                                      : tx.paymentStatus === 'pending'
                                        ? 'warning'
                                        : 'default'
                                  }
                                  dot
                                >
                                  {tx.paymentStatus}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}
    </div>
  );
}
