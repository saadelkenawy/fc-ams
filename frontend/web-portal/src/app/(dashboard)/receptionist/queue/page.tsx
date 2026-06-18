'use client';
import { CTable, CTableHead, CTableBody, CTableRow, CTableHeaderCell, CTableDataCell } from '@coreui/react';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, Clock, AlertTriangle, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { AppointmentStatusBadge } from '@/components/ui/Badge';
import { useLang } from '@/contexts/LanguageContext';
import { formatTime } from '@/lib/utils';
import { useTodayAppointments } from '@/hooks/useAppointments';
import { usePatientBatch } from '@/hooks/usePatients';
import { appointmentApi } from '@/lib/api';
import type { Appointment } from '@fadl/types';

function QueueSkeleton() {
  return (
    <>
      {[1, 2, 3, 4].map((n) => (
        <CTableRow key={n} className="border-b border-gray-50 dark:border-neutral-700/50">
          {[1, 2, 3, 4, 5, 6].map((c) => (
            <CTableDataCell key={c} className="px-4 py-3">
              <div className="h-4 bg-gray-100 dark:bg-neutral-700 rounded animate-pulse" />
            </CTableDataCell>
          ))}
        </CTableRow>
      ))}
    </>
  );
}

const STATUS_ORDER: Record<string, number> = {
  'Conf.': 0,
  'Ok!':   1,
  'TBC':   2,
  'Inf.':  3,
  'Comp.': 4,
  'Canc.': 5,
};

export default function ReceptionistQueuePage() {
  const { lang, t } = useLang();
  const queryClient = useQueryClient();

  const { data: apptData, isFetching } = useTodayAppointments();
  const appointments: Appointment[] = apptData?.data ?? [];

  const patientIds = appointments.map((a) => a.patientId);
  const patientMap = usePatientBatch(patientIds);

  const sorted = [...appointments].sort((a, b) => {
    const sa = STATUS_ORDER[a.status] ?? 99;
    const sb = STATUS_ORDER[b.status] ?? 99;
    if (sa !== sb) return sa - sb;
    return a.startTime.localeCompare(b.startTime);
  });

  const waiting   = appointments.filter((a) => !['Comp.', 'Canc.'].includes(a.status)).length;
  const completed = appointments.filter((a) => a.status === 'Comp.').length;
  const inRoom    = appointments.filter((a) => !!a.checkedInAt && a.status !== 'Comp.' && a.status !== 'Canc.').length;

  const { mutate: checkIn } = useMutation({
    mutationFn: (id: string) => appointmentApi.post(`/appointments/${id}/checkin`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['appointments'] }),
  });

  const { mutate: updateStatus } = useMutation({
    mutationFn: ({ id, status, version }: { id: string; status: string; version: number }) =>
      appointmentApi.patch(`/appointments/${id}/status`, { status, version }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['appointments'] }),
  });

  function resolvePatientName(patientId: string) {
    const p = patientMap.get(patientId);
    return p ? (lang === 'ar' ? (p.nameAr ?? p.nameEn) : p.nameEn) : `#${patientId.slice(0, 8)}`;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-bold font-display text-gray-900 dark:text-gray-100">
          {t('لوحة الانتظار', 'Queue Board')}
        </h2>
        <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          {t('مباشر', 'Live')}
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { labelAr: 'في الانتظار', labelEn: 'Waiting',   value: waiting,   color: 'text-amber-600 dark:text-amber-400',   bg: 'bg-amber-50 dark:bg-amber-950/30' },
          { labelAr: 'داخل الغرفة', labelEn: 'In Room',   value: inRoom,    color: 'text-primary-600 dark:text-primary-400', bg: 'bg-primary-50 dark:bg-primary-900/20' },
          { labelAr: 'مكتملة',      labelEn: 'Completed', value: completed, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
        ].map((item) => (
          <div key={item.labelEn} className={`rounded-xl p-3 text-center ${item.bg}`}>
            <p className={`text-2xl font-bold font-mono ${item.color}`}>{item.value}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {lang === 'ar' ? item.labelAr : item.labelEn}
            </p>
          </div>
        ))}
      </div>

      {/* TBC alerts */}
      {appointments.filter((a) => a.status === 'TBC').length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl p-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            {t(
              `${appointments.filter((a) => a.status === 'TBC').length} موعد بحاجة إلى تأكيد (قاعدة الساعتين)`,
              `${appointments.filter((a) => a.status === 'TBC').length} appointment(s) need confirmation (two-hour rule)`,
            )}
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('قائمة اليوم', "Today's Queue")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isFetching && sorted.length === 0 ? (
            <div className="overflow-x-auto">
              <CTable className="w-full text-sm">
                <CTableBody><QueueSkeleton /></CTableBody>
              </CTable>
            </div>
          ) : sorted.length === 0 ? (
            <div className="py-16 text-center">
              <Users className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 dark:text-gray-500 text-sm">
                {t('لا توجد مواعيد اليوم', 'No appointments today')}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <CTable className="w-full text-sm">
                <CTableHead>
                  <CTableRow className="border-b border-gray-50 dark:border-neutral-700 bg-gray-50/50 dark:bg-neutral-900/40">
                    <CTableHeaderCell className="text-start px-4 py-2.5 font-medium text-gray-500 dark:text-gray-300 text-xs w-10">#</CTableHeaderCell>
                    <CTableHeaderCell className="text-start px-4 py-2.5 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('المريض', 'Patient')}</CTableHeaderCell>
                    <CTableHeaderCell className="text-start px-4 py-2.5 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('الوقت', 'Time')}</CTableHeaderCell>
                    <CTableHeaderCell className="text-start px-4 py-2.5 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('النوع', 'Type')}</CTableHeaderCell>
                    <CTableHeaderCell className="text-start px-4 py-2.5 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('الحالة', 'Status')}</CTableHeaderCell>
                    <CTableHeaderCell className="text-start px-4 py-2.5 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('الانتظار', 'Wait')}</CTableHeaderCell>
                    <CTableHeaderCell className="px-4 py-2.5 text-xs" />
                  </CTableRow>
                </CTableHead>
                <CTableBody>
                  {sorted.map((a) => {
                    const isDone = a.status === 'Comp.' || a.status === 'Canc.';
                    return (
                      <CTableRow
                        key={a.id}
                        className={[
                          'border-b border-gray-50 dark:border-neutral-700/50 transition-colors',
                          isDone
                            ? 'opacity-50'
                            : 'hover:bg-gray-50/50 dark:hover:bg-neutral-700/30',
                        ].join(' ')}
                      >
                        <CTableDataCell className="px-4 py-3 font-bold text-gray-400 dark:text-gray-300 font-mono tabular-nums">
                          {a.queueNumber ?? '—'}
                        </CTableDataCell>
                        <CTableDataCell className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                          {resolvePatientName(a.patientId)}
                        </CTableDataCell>
                        <CTableDataCell className="px-4 py-3 text-gray-500 dark:text-gray-400 font-mono text-xs">
                          {formatTime(a.startTime)}
                        </CTableDataCell>
                        <CTableDataCell className="px-4 py-3">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            a.appointmentType === 'walk_in'
                              ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300'
                              : a.appointmentType === 'online'
                              ? 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300'
                              : 'bg-gray-100 dark:bg-neutral-700 text-gray-600 dark:text-gray-300'
                          }`}>
                            {a.appointmentType === 'walk_in'
                              ? t('حضور مباشر', 'Walk-in')
                              : a.appointmentType === 'online'
                              ? t('أونلاين', 'Online')
                              : t('موعد', 'Scheduled')}
                          </span>
                        </CTableDataCell>
                        <CTableDataCell className="px-4 py-3">
                          <AppointmentStatusBadge status={a.status} lang={lang} />
                        </CTableDataCell>
                        <CTableDataCell className="px-4 py-3 text-gray-500 dark:text-gray-300 text-xs">
                          {(a.waitingTimeMinutes ?? 0) > 0 ? (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {a.waitingTimeMinutes}{t('د', 'm')}
                            </span>
                          ) : (
                            <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" />{t('الآن', 'Now')}
                            </span>
                          )}
                        </CTableDataCell>
                        <CTableDataCell className="px-4 py-3">
                          {!isDone && (
                            <div className="flex gap-1.5 justify-end">
                                      {!a.checkedInAt && (
                                <Button
                                  size="sm"
                                  variant="success"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => checkIn(a.id)}
                                >
                                  {t('دخول', 'Check In')}
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs text-red-500 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20"
                                onClick={() => updateStatus({ id: a.id, status: 'Canc.', version: a.version })}
                              >
                                {t('إلغاء', 'Cancel')}
                              </Button>
                            </div>
                          )}
                        </CTableDataCell>
                      </CTableRow>
                    );
                  })}
                </CTableBody>
              </CTable>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
