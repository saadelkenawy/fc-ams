'use client';

import { useState, useMemo } from 'react';
import { CalendarPlus, ChevronLeft, ChevronRight, Loader2, CalendarDays } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { AppointmentStatusBadge } from '@/components/ui/Badge';
import { useLang } from '@/contexts/LanguageContext';
import { formatTime } from '@/lib/utils';
import { useAppointments } from '@/hooks/useAppointments';
import { useDoctorMap, useSpecialtyMap } from '@/hooks/useDoctors';
import { usePatientMap } from '@/hooks/usePatients';
import { AddAppointmentModal } from '@/components/appointments/AddAppointmentModal';
import type { AppointmentStatus } from '@fadl/types';

const STATUS_TABS: { status: AppointmentStatus | 'all'; labelAr: string; labelEn: string }[] = [
  { status: 'all',   labelAr: 'الكل',   labelEn: 'All'       },
  { status: 'TBC',   labelAr: 'انتظار', labelEn: 'TBC'       },
  { status: 'Ok!',   labelAr: 'موافق',  labelEn: 'Ok!'       },
  { status: 'Conf.', labelAr: 'مؤكد',   labelEn: 'Confirmed' },
  { status: 'Comp.', labelAr: 'مكتمل',  labelEn: 'Complete'  },
  { status: 'Canc.', labelAr: 'ملغي',   labelEn: 'Cancelled' },
];

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function SkeletonRow() {
  return (
    <tr className="border-b border-gray-50 dark:border-neutral-800">
      {[40, 60, 55, 45, 35, 30].map((w, i) => (
        <td key={i} className="px-5 py-3.5">
          <div className="h-3.5 rounded-full bg-gray-100 dark:bg-neutral-700 animate-pulse" style={{ width: `${w}%` }} />
        </td>
      ))}
    </tr>
  );
}

export default function AppointmentsPage() {
  const { lang, t } = useLang();
  const [activeTab, setActiveTab] = useState<AppointmentStatus | 'all'>('all');
  const [date, setDate]           = useState(todayStr);
  const [addOpen, setAddOpen]     = useState(false);

  /* always fetch all statuses so we can show counts per tab */
  const { data, isLoading, isError, refetch } = useAppointments({ date, limit: 200 });
  const appointments = data?.data ?? [];
  const doctorMap    = useDoctorMap();
  const specialtyMap = useSpecialtyMap();
  const patientMap   = usePatientMap();

  const statusCounts = useMemo(() => {
    const m: Record<string, number> = {};
    appointments.forEach((a) => { m[a.status] = (m[a.status] ?? 0) + 1; });
    return m;
  }, [appointments]);

  const visible = activeTab === 'all'
    ? appointments
    : appointments.filter((a) => a.status === activeTab);

  function shiftDate(days: number) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().split('T')[0]);
  }

  const isToday = date === todayStr();

  return (
    <div className="space-y-5 max-w-7xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-bold font-display text-gray-900 dark:text-gray-100 animate-slide-down">
          {t('المواعيد', 'Appointments')}
        </h2>
        <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5 animate-slide-down" style={{ animationDelay: '40ms' }}>
          <CalendarPlus className="w-4 h-4" />
          {t('موعد جديد', 'New Appointment')}
        </Button>
      </div>

      {/* Date nav + status tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            onClick={() => shiftDate(-1)}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-700 text-gray-500 dark:text-gray-300 transition-colors"
          >
            {lang === 'ar' ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-gray-900 dark:text-gray-100 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
          />
          <button
            onClick={() => shiftDate(1)}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-700 text-gray-500 dark:text-gray-300 transition-colors"
          >
            {lang === 'ar' ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          {!isToday && (
            <button
              onClick={() => setDate(todayStr())}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors border border-primary-100 dark:border-primary-800"
            >
              <CalendarDays className="w-3.5 h-3.5" />
              {t('اليوم', 'Today')}
            </button>
          )}
        </div>

        <div className="pill-tab-bar overflow-x-auto">
          {STATUS_TABS.map((tab) => {
            const count = tab.status === 'all' ? appointments.length : (statusCounts[tab.status] ?? 0);
            return (
              <button
                key={tab.status}
                onClick={() => setActiveTab(tab.status)}
                className={`pill-tab whitespace-nowrap flex items-center gap-1.5 ${activeTab === tab.status ? 'active' : ''}`}
              >
                {lang === 'ar' ? tab.labelAr : tab.labelEn}
                {count > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none ${
                    activeTab === tab.status
                      ? 'bg-white/25 text-white'
                      : 'bg-gray-100 dark:bg-neutral-700 text-gray-600 dark:text-gray-300'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50 dark:border-neutral-700 bg-gray-50/50 dark:bg-neutral-900/40">
                  {[t('الوقت','Time'), t('المريض','Patient'), t('الطبيب','Doctor'), t('التخصص','Specialty'), t('الحالة','Status'), t('الرسوم','Charge')].map((h) => (
                    <th key={h} className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}
              </tbody>
            </table>
          )}
          {isError && (
            <div className="py-12 text-center text-red-500 dark:text-red-400 text-sm">
              {t('تعذّر تحميل المواعيد', 'Failed to load appointments')}
              <button onClick={() => void refetch()} className="ms-2 underline text-gray-500 hover:text-gray-700">
                {t('إعادة المحاولة', 'Retry')}
              </button>
            </div>
          )}
          {!isLoading && !isError && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-50 dark:border-neutral-700 bg-gray-50/50 dark:bg-neutral-900/40">
                    <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('الوقت', 'Time')}</th>
                    <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('المريض', 'Patient')}</th>
                    <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('الطبيب', 'Doctor')}</th>
                    <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('التخصص', 'Specialty')}</th>
                    <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('الحالة', 'Status')}</th>
                    <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('الرسوم', 'Charge')}</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((a) => {
                    const doctor    = a.doctorId ? doctorMap.get(a.doctorId) : null;
                    const specialty = a.specialtyId ? specialtyMap.get(a.specialtyId) : null;
                    const patient   = patientMap.get(a.patientId);
                    const patName   = patient
                      ? (lang === 'ar' ? (patient.nameAr ?? patient.nameEn) : patient.nameEn)
                      : a.patientId.slice(-8).toUpperCase();
                    return (
                      <tr key={a.id} className="border-b border-gray-50 dark:border-neutral-700/50 hover:bg-gray-50/50 dark:hover:bg-neutral-700/30 transition-colors cursor-pointer">
                        <td className="px-5 py-3.5 font-mono text-gray-600 dark:text-gray-300 text-xs" dir="ltr">{formatTime(a.startTime)}</td>
                        <td className="px-5 py-3.5 font-medium text-gray-900 dark:text-gray-100 max-w-[180px] truncate" title={patName}>
                          {patName}
                        </td>
                        <td className="px-5 py-3.5 text-gray-600 dark:text-gray-300">
                          {doctor ? (lang === 'ar' ? (doctor.nameAr ?? doctor.nameEn) : doctor.nameEn) : '—'}
                        </td>
                        <td className="px-5 py-3.5 text-gray-600 dark:text-gray-300">
                          {specialty ? (lang === 'ar' ? specialty.nameAr : specialty.nameEn) : '—'}
                        </td>
                        <td className="px-5 py-3.5"><AppointmentStatusBadge status={a.status} lang={lang} /></td>
                        <td className="px-5 py-3.5 font-mono text-gray-700 dark:text-gray-200 tabular-nums">
                          {a.approvedCharge != null ? `${a.approvedCharge} ${t('ج', 'EGP')}` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                  {visible.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center text-gray-400 dark:text-gray-300">
                        {t('لا توجد مواعيد', 'No appointments found')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AddAppointmentModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        defaultDate={date}
        onCreated={() => { setAddOpen(false); void refetch(); }}
      />
    </div>
  );
}
