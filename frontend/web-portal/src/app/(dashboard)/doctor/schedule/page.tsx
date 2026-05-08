'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, CheckCircle, XCircle, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, AppointmentStatusBadge } from '@/components/ui/Badge';
import { useLang } from '@/contexts/LanguageContext';
import { formatTime, formatDate } from '@/lib/utils';
import { useAppointments } from '@/hooks/useAppointments';
import { doctorApi, appointmentApi } from '@/lib/api';
import type { DoctorSchedule } from '@fadl/types';

const DAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const DAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getUser() {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem('fadl_user') ?? '{}');
  } catch {
    return {};
  }
}

function getDayDates(): { dayIndex: number; dateStr: string; label: string; labelAr: string }[] {
  const today = new Date();
  const todayDow = today.getDay(); // 0 = Sun
  // Build a 7-day window starting from the nearest Sunday
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - todayDow);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return {
      dayIndex: i,
      dateStr: d.toISOString().split('T')[0],
      label: DAYS_EN[i],
      labelAr: DAYS_AR[i],
    };
  });
}

export default function DoctorSchedulePage() {
  const { lang, t } = useLang();
  const qc = useQueryClient();

  const user = getUser();
  const doctorId = user.doctorId as string | undefined;

  const today = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(today);

  const days = useMemo(() => getDayDates(), []);

  // Today's (or selected date's) appointments for this doctor
  const { data: apptData, isLoading: apptLoading } = useAppointments({
    doctorId,
    date: selectedDate,
    limit: 50,
  });
  const appointments = apptData?.data ?? [];

  // Recurring schedule
  const { data: scheduleData, isLoading: schedLoading } = useQuery({
    queryKey: ['doctor-schedules', doctorId],
    queryFn: async () => {
      if (!doctorId) return [] as DoctorSchedule[];
      const { data } = await doctorApi.get<{ data: DoctorSchedule[] }>(`/doctors/${doctorId}/schedules`);
      return data.data ?? [];
    },
    enabled: !!doctorId,
    staleTime: 60_000,
  });
  const schedules = scheduleData ?? [];

  // Status update mutation
  const updateStatus = useMutation({
    mutationFn: async ({ id, status, version }: { id: string; status: string; version: number }) => {
      await appointmentApi.patch(`/appointments/${id}/status`, { status, version });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['appointments'] });
    },
  });

  if (!doctorId) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          {t('هذه الصفحة متاحة للأطباء فقط', 'This page is available for doctors only')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold font-display text-gray-900 dark:text-gray-100">
            {t('جدولي', 'My Schedule')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {t('مواعيد اليوم والجدول الأسبوعي', 'Today\'s appointments & weekly schedule')}
          </p>
        </div>
      </div>

      {/* Weekly Day Pills */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {days.map((day) => {
          const isToday = day.dateStr === today;
          const isSelected = day.dateStr === selectedDate;
          return (
            <button
              key={day.dateStr}
              onClick={() => setSelectedDate(day.dateStr)}
              className={[
                'flex flex-col items-center px-4 py-2.5 rounded-xl text-xs font-medium flex-shrink-0 transition-all duration-150 border',
                isSelected
                  ? 'bg-primary-600 text-white border-primary-700 shadow-md'
                  : isToday
                    ? 'border-primary-300 dark:border-primary-600 text-primary-700 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 hover:bg-primary-100 dark:hover:bg-primary-900/30'
                    : 'border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-gray-300 bg-white dark:bg-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-700',
              ].join(' ')}
            >
              <span className="font-semibold text-sm">
                {lang === 'ar' ? day.labelAr : day.label}
              </span>
              <span className={['text-[10px] mt-0.5', isSelected ? 'text-primary-100' : 'text-gray-400 dark:text-gray-500'].join(' ')}>
                {new Date(day.dateStr).getDate()}
              </span>
              {isToday && !isSelected && (
                <span className="w-1 h-1 rounded-full bg-primary-500 mt-1" />
              )}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Today's Appointments */}
        <div className="lg:col-span-2 space-y-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            {t('مواعيد اليوم', "Today's Appointments")}
            {' '}
            <span className="text-gray-400 dark:text-gray-500 normal-case font-normal">
              — {formatDate(selectedDate, lang === 'ar' ? 'ar-EG' : 'en-US')}
            </span>
          </h3>

          {apptLoading && (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin me-2" />
              {t('جاري التحميل...', 'Loading...')}
            </div>
          )}

          {!apptLoading && appointments.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <Clock className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400 dark:text-gray-500 text-sm">
                  {t('لا توجد مواعيد في هذا اليوم', 'No appointments for this day')}
                </p>
              </CardContent>
            </Card>
          )}

          {!apptLoading && appointments.map((appt) => (
            <Card key={appt.id} className="transition-all">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    {/* Time block */}
                    <div className="bg-primary-50 dark:bg-primary-900/30 rounded-lg px-3 py-2 text-center flex-shrink-0">
                      <p className="text-primary-700 dark:text-primary-400 font-mono text-sm font-semibold">
                        {formatTime(appt.startTime)}
                      </p>
                      <p className="text-primary-500 dark:text-primary-500 font-mono text-[10px]">
                        {formatTime(appt.endTime)}
                      </p>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-mono text-xs text-gray-500 dark:text-gray-400">
                          #{appt.patientId.slice(-8).toUpperCase()}
                        </p>
                        <AppointmentStatusBadge status={appt.status} lang={lang} />
                        <Badge variant="outline" className="text-[10px]">
                          {appt.patientSource}
                        </Badge>
                      </div>
                      {appt.notes && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                          {appt.notes}
                        </p>
                      )}
                      {appt.approvedCharge != null && (
                        <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 font-mono">
                          {appt.approvedCharge} {t('ج.م', 'EGP')}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    {appt.status !== 'Comp.' && appt.status !== 'Canc.' && (
                      <Button
                        size="sm"
                        variant="success"
                        className="h-7 px-2.5 text-xs"
                        loading={updateStatus.isPending}
                        onClick={() =>
                          updateStatus.mutate({ id: appt.id, status: 'Comp.', version: appt.version })
                        }
                      >
                        <CheckCircle className="w-3 h-3" />
                        {t('مكتمل', 'Comp.')}
                      </Button>
                    )}
                    {appt.status !== 'Comp.' && appt.status !== 'Canc.' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2.5 text-xs text-red-500 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20"
                        loading={updateStatus.isPending}
                        onClick={() =>
                          updateStatus.mutate({ id: appt.id, status: 'Canc.', version: appt.version })
                        }
                      >
                        <XCircle className="w-3 h-3" />
                        {t('غياب', 'No-show')}
                      </Button>
                    )}
                    {(appt.status === 'Comp.' || appt.status === 'Canc.') && (
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 text-center px-2">
                        {t('محدّث', 'Updated')}
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Recurring Schedule Panel */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            {t('الجدول الأسبوعي', 'Weekly Schedule')}
          </h3>

          {schedLoading && (
            <div className="flex items-center justify-center py-8 text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin me-2" />
              {t('جاري التحميل...', 'Loading...')}
            </div>
          )}

          {!schedLoading && schedules.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-gray-400 dark:text-gray-500 text-sm">
                  {t('لم يُحدَّد جدول أسبوعي', 'No recurring schedule set')}
                </p>
              </CardContent>
            </Card>
          )}

          {!schedLoading && (
            <Card>
              <CardContent className="p-3 space-y-1">
                {DAYS_EN.map((_, dow) => {
                  const daySched = schedules.filter((s) => s.dayOfWeek === dow && s.isActive);
                  const labelAr = DAYS_AR[dow];
                  const labelEn = DAYS_EN[dow];
                  return (
                    <div
                      key={dow}
                      className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-neutral-700/40 transition-colors"
                    >
                      <span className="w-12 text-xs font-medium text-gray-700 dark:text-gray-300 flex-shrink-0">
                        {lang === 'ar' ? labelAr : labelEn}
                      </span>
                      <div className="flex flex-wrap gap-1 flex-1">
                        {daySched.length === 0 ? (
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">
                            {t('إجازة', 'Off')}
                          </span>
                        ) : (
                          daySched.map((s) => (
                            <span
                              key={s.id}
                              className="text-[10px] bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 rounded px-1.5 py-0.5 font-mono"
                            >
                              {s.startTime} – {s.endTime}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Quick stats for selected day */}
          {!apptLoading && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                  {t('ملخص اليوم', 'Day Summary')}
                </p>
                <div className="space-y-2">
                  {[
                    { labelAr: 'الإجمالي', labelEn: 'Total', value: appointments.length, color: 'text-gray-900 dark:text-gray-100' },
                    { labelAr: 'مكتملة', labelEn: 'Completed', value: appointments.filter((a) => a.status === 'Comp.').length, color: 'text-emerald-600 dark:text-emerald-400' },
                    { labelAr: 'غائبون', labelEn: 'No-shows', value: appointments.filter((a) => a.status === 'Canc.').length, color: 'text-red-500 dark:text-red-400' },
                    { labelAr: 'قادمون', labelEn: 'Remaining', value: appointments.filter((a) => !['Comp.', 'Canc.'].includes(a.status)).length, color: 'text-primary-600 dark:text-primary-400' },
                  ].map((item) => (
                    <div key={item.labelEn} className="flex items-center justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400 text-xs">
                        {lang === 'ar' ? item.labelAr : item.labelEn}
                      </span>
                      <span className={`font-mono font-semibold ${item.color}`}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
