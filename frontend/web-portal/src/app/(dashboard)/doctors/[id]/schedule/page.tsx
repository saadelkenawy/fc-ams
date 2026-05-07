'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Clock, Calendar, Plus, Trash2, Edit3, Save, X,
  CheckCircle, AlertTriangle, Loader2, CalendarX,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { useLang } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';
import {
  useDoctorSchedules,
  useDoctorScheduleOverrides,
  useUpsertSchedule,
  useCreateOverride,
} from '@/hooks/useDoctors';
import { doctorApi } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import type { DoctorSchedule, DoctorScheduleOverride } from '@fadl/types';

/* ── Constants ───────────────────────────────────────────────────────── */

const DAYS = [
  { num: 0, ar: 'الأحد',    en: 'Sunday' },
  { num: 1, ar: 'الاثنين',  en: 'Monday' },
  { num: 2, ar: 'الثلاثاء', en: 'Tuesday' },
  { num: 3, ar: 'الأربعاء', en: 'Wednesday' },
  { num: 4, ar: 'الخميس',   en: 'Thursday' },
  { num: 5, ar: 'الجمعة',   en: 'Friday' },
  { num: 6, ar: 'السبت',    en: 'Saturday' },
] as const;

const SLOT_DURATIONS = [10, 15, 20, 30, 45, 60] as const;

const OVERRIDE_TYPES: { key: DoctorScheduleOverride['overrideType']; ar: string; en: string; color: string }[] = [
  { key: 'unavailable',  ar: 'غير متاح',       en: 'Unavailable',  color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  { key: 'custom_hours', ar: 'ساعات مخصصة',    en: 'Custom Hours',  color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  { key: 'holiday',      ar: 'إجازة',           en: 'Holiday',       color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
];

function slotsPerDay(start: string, end: string, duration: number): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const totalMinutes = (eh * 60 + em) - (sh * 60 + sm);
  return totalMinutes > 0 ? Math.floor(totalMinutes / duration) : 0;
}

/* ── Day card ────────────────────────────────────────────────────────── */

function DayCard({
  day,
  schedule,
  lang,
  doctorId,
}: {
  day: typeof DAYS[number];
  schedule?: DoctorSchedule;
  lang: 'ar' | 'en';
  doctorId: string;
}) {
  const { t } = useLang();
  const upsert = useUpsertSchedule(doctorId);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    startTime:           schedule?.startTime           ?? '09:00',
    endTime:             schedule?.endTime             ?? '17:00',
    slotDurationMinutes: schedule?.slotDurationMinutes ?? 20,
    validFrom:           schedule?.validFrom           ?? new Date().toISOString().split('T')[0],
  });

  const isActive = !!schedule?.isActive;
  const slots = schedule ? slotsPerDay(schedule.startTime, schedule.endTime, schedule.slotDurationMinutes) : 0;

  async function handleSave() {
    await upsert.mutateAsync({ dayOfWeek: day.num, ...form });
    setEditing(false);
  }

  async function handleDeactivate() {
    await upsert.mutateAsync({
      dayOfWeek:            day.num,
      startTime:            schedule!.startTime,
      endTime:              schedule!.endTime,
      slotDurationMinutes:  schedule!.slotDurationMinutes,
      validFrom:            schedule!.validFrom,
    });
  }

  return (
    <div className={cn(
      'rounded-2xl border transition-all duration-200 overflow-hidden',
      isActive
        ? 'border-gray-100 dark:border-neutral-700 bg-white dark:bg-neutral-800 shadow-sm hover:shadow-md'
        : 'border-dashed border-gray-200 dark:border-neutral-700 bg-gray-50/50 dark:bg-neutral-900/40',
    )}>
      {/* Day header */}
      <div className={cn(
        'flex items-center justify-between px-4 py-3',
        isActive ? 'border-b border-gray-50 dark:border-neutral-700' : '',
      )}>
        <div className="flex items-center gap-2.5">
          <div className={cn(
            'w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold',
            isActive ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-neutral-700 text-gray-400 dark:text-gray-500',
          )}>
            {day.num === 0 ? 'S' : day.num === 1 ? 'M' : day.num === 2 ? 'T' : day.num === 3 ? 'W' : day.num === 4 ? 'T' : day.num === 5 ? 'F' : 'S'}
          </div>
          <span className={cn('font-semibold text-sm', isActive ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500')}>
            {lang === 'ar' ? day.ar : day.en}
          </span>
          {isActive && (
            <Badge variant="success" dot className="text-[10px]">{t('نشط', 'Active')}</Badge>
          )}
        </div>
        <div className="flex gap-1">
          {isActive && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
              title={t('تعديل', 'Edit')}
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
          )}
          {!isActive && (
            <button
              onClick={() => setEditing(true)}
              className="px-2.5 py-1 rounded-lg text-xs font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
            >
              {t('+ تفعيل', '+ Enable')}
            </button>
          )}
        </div>
      </div>

      {/* Active day details */}
      {isActive && !editing && (
        <div className="px-4 py-3 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
            <Clock className="w-3.5 h-3.5" />
            <span className="font-mono">{schedule!.startTime} – {schedule!.endTime}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-500">
            <span className="font-medium text-gray-800 dark:text-gray-200">{slots}</span>
            <span>{t('موعد', 'slots')} · {schedule!.slotDurationMinutes}{t('د', 'min')}</span>
          </div>
        </div>
      )}

      {/* Edit form */}
      {editing && (
        <div className="px-4 py-4 space-y-3 bg-gray-50/50 dark:bg-neutral-900/30">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">{t('من', 'Start')}</label>
              <input
                type="time"
                value={form.startTime}
                onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                className="w-full h-9 rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-600 font-mono"
              />
            </div>
            <div>
              <label className="field-label">{t('إلى', 'End')}</label>
              <input
                type="time"
                value={form.endTime}
                onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                className="w-full h-9 rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-600 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="field-label">{t('مدة الموعد', 'Slot Duration')}</label>
            <div className="flex gap-1.5 flex-wrap">
              {SLOT_DURATIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => setForm((f) => ({ ...f, slotDurationMinutes: d }))}
                  className={cn(
                    'px-3 py-1 rounded-lg text-xs font-medium transition-colors border',
                    form.slotDurationMinutes === d
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'border-gray-200 dark:border-neutral-600 text-gray-600 dark:text-gray-400 hover:border-primary-400',
                  )}
                >
                  {d}{t('د', 'min')}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="field-label">{t('صالح من', 'Valid From')}</label>
            <input
              type="date"
              value={form.validFrom}
              onChange={(e) => setForm((f) => ({ ...f, validFrom: e.target.value }))}
              className="h-9 rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-600"
            />
          </div>

          {/* Preview */}
          {form.startTime && form.endTime && form.slotDurationMinutes && (
            <div className="flex items-center gap-2 text-xs text-primary-700 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 rounded-lg px-3 py-2">
              <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>
                {slotsPerDay(form.startTime, form.endTime, form.slotDurationMinutes)}{' '}
                {t('موعد يومياً', 'slots per day')}
              </span>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={handleSave} loading={upsert.isPending} className="gap-1">
              <Save className="w-3.5 h-3.5" />
              {t('حفظ', 'Save')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
              <X className="w-3.5 h-3.5" />
              {t('إلغاء', 'Cancel')}
            </Button>
          </div>

          {upsert.isError && (
            <p className="text-xs text-red-500">{t('تعذّر الحفظ', 'Save failed')}</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Override form dialog ─────────────────────────────────────────────── */

function AddOverrideForm({
  doctorId,
  onDone,
}: {
  doctorId: string;
  onDone: () => void;
}) {
  const { lang, t } = useLang();
  const create = useCreateOverride(doctorId);
  const [form, setForm] = useState({
    overrideDate:   '',
    overrideType:   'unavailable' as DoctorScheduleOverride['overrideType'],
    customStartTime:'',
    customEndTime:  '',
    reason:         '',
    notifyPatients: false,
  });

  async function handleSubmit() {
    if (!form.overrideDate) return;
    await create.mutateAsync({
      overrideDate:    form.overrideDate,
      overrideType:    form.overrideType,
      ...(form.overrideType === 'custom_hours' && {
        customStartTime: form.customStartTime || undefined,
        customEndTime:   form.customEndTime || undefined,
      }),
      reason:         form.reason || undefined,
      notifyPatients: form.notifyPatients,
    });
    onDone();
  }

  return (
    <div className="modal-overlay" onClick={onDone}>
      <div className="modal-panel max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-neutral-700">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t('إضافة استثناء', 'Add Override')}</h3>
          <button onClick={onDone} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Date */}
          <div>
            <label className="field-label">{t('التاريخ', 'Date')}</label>
            <input
              type="date"
              value={form.overrideDate}
              onChange={(e) => setForm((f) => ({ ...f, overrideDate: e.target.value }))}
              className="w-full h-10 rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-600"
            />
          </div>

          {/* Type */}
          <div>
            <label className="field-label">{t('نوع الاستثناء', 'Override Type')}</label>
            <div className="grid grid-cols-3 gap-2">
              {OVERRIDE_TYPES.map((ot) => (
                <button
                  key={ot.key}
                  onClick={() => setForm((f) => ({ ...f, overrideType: ot.key }))}
                  className={cn(
                    'py-2 rounded-xl text-xs font-semibold border-2 transition-colors',
                    form.overrideType === ot.key
                      ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                      : 'border-gray-200 dark:border-neutral-600 text-gray-600 dark:text-gray-400 hover:border-gray-300',
                  )}
                >
                  {lang === 'ar' ? ot.ar : ot.en}
                </button>
              ))}
            </div>
          </div>

          {/* Custom hours */}
          {form.overrideType === 'custom_hours' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label">{t('من', 'Start')}</label>
                <input
                  type="time"
                  value={form.customStartTime}
                  onChange={(e) => setForm((f) => ({ ...f, customStartTime: e.target.value }))}
                  className="w-full h-10 rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-600 font-mono"
                />
              </div>
              <div>
                <label className="field-label">{t('إلى', 'End')}</label>
                <input
                  type="time"
                  value={form.customEndTime}
                  onChange={(e) => setForm((f) => ({ ...f, customEndTime: e.target.value }))}
                  className="w-full h-10 rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-600 font-mono"
                />
              </div>
            </div>
          )}

          {/* Reason */}
          <div>
            <label className="field-label">{t('السبب (اختياري)', 'Reason (optional)')}</label>
            <input
              type="text"
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder={t('مثال: إجازة سنوية', 'e.g. Annual leave')}
              className="w-full h-10 rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-600"
            />
          </div>

          {/* Notify patients */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.notifyPatients}
              onChange={(e) => setForm((f) => ({ ...f, notifyPatients: e.target.checked }))}
              className="w-4 h-4 accent-primary-600 rounded"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {t('إبلاغ المرضى المحجوزين', 'Notify booked patients')}
            </span>
          </label>

          {create.isError && (
            <p className="text-xs text-red-500">{t('فشل الحفظ، حاول مرة أخرى', 'Failed to save, please try again')}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 dark:border-neutral-700">
          <Button variant="outline" size="sm" onClick={onDone}>{t('إلغاء', 'Cancel')}</Button>
          <Button size="sm" onClick={handleSubmit} loading={create.isPending} disabled={!form.overrideDate}>
            {t('حفظ الاستثناء', 'Save Override')}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── Override list item ───────────────────────────────────────────────── */

function OverrideItem({
  override,
  lang,
}: {
  override: DoctorScheduleOverride;
  lang: 'ar' | 'en';
}) {
  const typeInfo = OVERRIDE_TYPES.find((t) => t.key === override.overrideType)!;
  const dateLabel = new Date(override.overrideDate + 'T12:00:00').toLocaleDateString(
    lang === 'ar' ? 'ar-EG' : 'en-US',
    { weekday: 'short', day: 'numeric', month: 'short' },
  );

  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-50 dark:border-neutral-700/50 last:border-0">
      <div className={cn('px-2.5 py-1 rounded-lg text-[11px] font-semibold flex-shrink-0', typeInfo.color)}>
        {lang === 'ar' ? typeInfo.ar : typeInfo.en}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{dateLabel}</p>
        {override.overrideType === 'custom_hours' && override.customStartTime && (
          <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
            {override.customStartTime} – {override.customEndTime}
          </p>
        )}
        {override.reason && (
          <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{override.reason}</p>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        {override.notifyPatients && (
          <span className="text-[10px] text-blue-500" title={lang === 'ar' ? 'سيتم إبلاغ المرضى' : 'Patients notified'}>
            🔔
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Visual week grid ─────────────────────────────────────────────────── */

function WeekVisualGrid({
  schedules,
  lang,
}: {
  schedules: DoctorSchedule[];
  lang: 'ar' | 'en';
}) {
  const scheduleByDay = new Map(schedules.map((s) => [s.dayOfWeek, s]));

  return (
    <div className="flex gap-1">
      {DAYS.map((day) => {
        const sched = scheduleByDay.get(day.num as 0|1|2|3|4|5|6);
        const active = sched?.isActive ?? false;
        const slots = active ? slotsPerDay(sched!.startTime, sched!.endTime, sched!.slotDurationMinutes) : 0;

        return (
          <div key={day.num} className="flex-1 flex flex-col items-center gap-1.5">
            <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
              {lang === 'ar' ? day.ar.slice(0, 3) : day.en.slice(0, 3)}
            </span>
            <div
              className={cn(
                'w-full rounded-xl flex flex-col items-center justify-center gap-0.5 py-3 transition-all',
                active
                  ? 'bg-primary-600 text-white shadow-md'
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
  );
}

/* ── Main page ───────────────────────────────────────────────────────── */

export default function DoctorSchedulePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { lang, t } = useLang();
  const [showOverrideForm, setShowOverrideForm] = useState(false);

  const doctorId = params.id;
  const today = new Date().toISOString().split('T')[0];

  const { data: schedules = [], isLoading: schedLoading } = useDoctorSchedules(doctorId);
  const { data: overrides = [], isLoading: ovLoading } = useDoctorScheduleOverrides(doctorId, today);

  const scheduleByDay = new Map(schedules.map((s) => [s.dayOfWeek, s]));
  const activeDays = schedules.filter((s) => s.isActive).length;
  const totalSlotsPerWeek = schedules
    .filter((s) => s.isActive)
    .reduce((sum, s) => sum + slotsPerDay(s.startTime, s.endTime, s.slotDurationMinutes), 0);

  const upcomingOverrides = overrides.slice(0, 10);

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4 animate-slide-down">
        <button
          onClick={() => router.push('/doctors')}
          className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        >
          <ArrowLeft className={cn('w-5 h-5', lang === 'ar' && 'rotate-180')} />
        </button>
        <div className="flex-1">
          <h2 className="text-xl font-bold font-display text-gray-900 dark:text-gray-100">
            {t('إدارة الجدول', 'Schedule Management')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 font-mono">{doctorId.slice(-12).toUpperCase()}</p>
        </div>
        <Button size="sm" onClick={() => setShowOverrideForm(true)} className="gap-1.5">
          <CalendarX className="w-4 h-4" />
          {t('إضافة استثناء', 'Add Override')}
        </Button>
      </div>

      {/* Stats strip */}
      {!schedLoading && (
        <div className="grid grid-cols-3 gap-4 stagger animate-slide-up">
          {[
            { labelAr: 'أيام العمل',         labelEn: 'Working Days',     value: activeDays,         unit: t('أيام', 'days') },
            { labelAr: 'مواعيد أسبوعية',     labelEn: 'Weekly Slots',     value: totalSlotsPerWeek,  unit: t('موعد', 'slots') },
            { labelAr: 'استثناءات قادمة',    labelEn: 'Upcoming Overrides', value: upcomingOverrides.length, unit: '' },
          ].map((stat) => (
            <div key={stat.labelEn} className="bg-white dark:bg-neutral-800 rounded-2xl border border-gray-100 dark:border-neutral-700 shadow-sm px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">
                {lang === 'ar' ? stat.labelAr : stat.labelEn}
              </p>
              <p className="text-2xl font-bold font-mono tabular-nums text-gray-900 dark:text-gray-100">
                {stat.value}
                {stat.unit && <span className="text-sm font-normal text-gray-400 ms-1">{stat.unit}</span>}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Week visual */}
      {!schedLoading && schedules.length > 0 && (
        <Card>
          <CardHeader><CardTitle>{t('نظرة عامة على الأسبوع', 'Weekly Overview')}</CardTitle></CardHeader>
          <CardContent>
            <WeekVisualGrid schedules={schedules} lang={lang} />
          </CardContent>
        </Card>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Day cards */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
              {t('الجدول الأسبوعي', 'Weekly Schedule')}
            </h3>
            {schedLoading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
          </div>
          {DAYS.map((day) => (
            <DayCard
              key={day.num}
              day={day}
              schedule={scheduleByDay.get(day.num as 0|1|2|3|4|5|6)}
              lang={lang}
              doctorId={doctorId}
            />
          ))}
        </div>

        {/* Overrides panel */}
        <div className="space-y-3">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
              {t('الاستثناءات القادمة', 'Upcoming Overrides')}
            </h3>
            {ovLoading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
          </div>

          <Card>
            <CardContent className="py-2">
              {!ovLoading && upcomingOverrides.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-gray-400">
                  <Calendar className="w-8 h-8" />
                  <p className="text-xs text-center">{t('لا استثناءات قادمة', 'No upcoming overrides')}</p>
                  <button
                    onClick={() => setShowOverrideForm(true)}
                    className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
                  >
                    {t('+ إضافة استثناء', '+ Add override')}
                  </button>
                </div>
              ) : (
                upcomingOverrides.map((ov) => (
                  <OverrideItem key={ov.id} override={ov} lang={lang} />
                ))
              )}
            </CardContent>
          </Card>

          {/* Legend */}
          <Card>
            <CardContent className="py-3">
              <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                {t('أنواع الاستثناءات', 'Override Types')}
              </p>
              <div className="space-y-2">
                {OVERRIDE_TYPES.map((ot) => (
                  <div key={ot.key} className="flex items-center gap-2">
                    <span className={cn('px-2 py-0.5 rounded-md text-[10px] font-semibold', ot.color)}>
                      {lang === 'ar' ? ot.ar : ot.en}
                    </span>
                    <span className="text-[11px] text-gray-500 dark:text-gray-400">
                      {ot.key === 'unavailable'  && t('يوم عمل لا مواعيد فيه', 'Day blocked — no bookings')}
                      {ot.key === 'custom_hours' && t('ساعات عمل مخصصة لهذا اليوم', 'Different hours for this day')}
                      {ot.key === 'holiday'      && t('إجازة رسمية أو شخصية', 'Official or personal leave')}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {showOverrideForm && (
        <AddOverrideForm doctorId={doctorId} onDone={() => setShowOverrideForm(false)} />
      )}
    </div>
  );
}
