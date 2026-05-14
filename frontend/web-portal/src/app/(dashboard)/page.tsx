'use client';

import { useState } from 'react';
import { Users, CalendarDays, TrendingUp, Clock, Stethoscope, Activity, CalendarPlus, RefreshCw } from 'lucide-react';
import { StatCard } from '@/components/ui/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { AppointmentStatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useLang } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { formatTime } from '@/lib/utils';
import { useTodayAppointments } from '@/hooks/useAppointments';
import { useDoctors, useDoctorMap, useSpecialtyMap } from '@/hooks/useDoctors';
import { usePatients, usePatientMap } from '@/hooks/usePatients';
import { AddAppointmentModal } from '@/components/appointments/AddAppointmentModal';
import type { AppointmentStatus } from '@fadl/types';

const STATUS_COLORS: Record<AppointmentStatus, string> = {
  'TBC':   'bg-amber-400',
  'Ok!':   'bg-blue-400',
  'Conf.': 'bg-emerald-400',
  'Comp.': 'bg-gray-400',
  'Canc.': 'bg-red-400',
  'Resch.':'bg-violet-400',
  'Inf.':  'bg-pink-300',
  'Ref.':  'bg-violet-300',
};

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr className="border-b border-gray-50 dark:border-neutral-800">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-5 py-3.5">
          <div className="h-3.5 rounded-full bg-gray-100 dark:bg-neutral-700 animate-pulse" style={{ width: `${60 + (i * 17) % 30}%` }} />
        </td>
      ))}
    </tr>
  );
}

export default function DashboardPage() {
  const { lang, t } = useLang();
  const { user }    = useAuth();
  const [addOpen, setAddOpen] = useState(false);
  const now  = new Date();
  const hour = now.getHours();
  const greetAr = hour < 12 ? 'صباح الخير' : hour < 17 ? 'مساء الخير' : 'مساء النور';
  const greetEn = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const { data: apptData, isLoading: apptLoading, refetch } = useTodayAppointments();
  const { data: doctorData }   = useDoctors({ limit: 1 });
  const { data: patientData }  = usePatients({ limit: 1 });
  const appointments  = apptData?.data ?? [];
  const doctorMap     = useDoctorMap();
  const specialtyMap  = useSpecialtyMap();
  const patientMap    = usePatientMap();

  const pendingConfirm = appointments.filter((a) => a.status === 'TBC').length;
  const confirmedCount = appointments.filter((a) => a.status === 'Conf.').length;
  const totalDoctors   = doctorData?.total ?? 0;
  const totalPatients  = patientData?.total ?? 0;

  /* status distribution for mini bar */
  const statusCounts = appointments.reduce<Record<string, number>>((acc, a) => {
    acc[a.status] = (acc[a.status] ?? 0) + 1;
    return acc;
  }, {});
  const total = appointments.length || 1;

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fade-in">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4 animate-slide-down">
        <div>
          <h2 className="text-2xl font-bold font-display text-gray-900 dark:text-gray-100">
            {t(`${greetAr}،`, `${greetEn},`)} {lang === 'ar' ? user?.nameAr : user?.nameEn}
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
            {t(
              now.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
              now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={() => void refetch()} title={t('تحديث', 'Refresh')}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5">
            <CalendarPlus className="w-4 h-4" />
            {t('موعد جديد', 'New Appointment')}
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={t('الأطباء', 'Total Doctors')}
          value={totalDoctors || '—'}
          icon={<Stethoscope className="w-5 h-5" />}
          color="blue"
          description={t('طبيب مسجل', 'registered doctors')}
        />
        <StatCard
          title={t('المرضى', 'Total Patients')}
          value={totalPatients || '—'}
          icon={<Users className="w-5 h-5" />}
          color="green"
          description={t('مريض مسجل', 'registered patients')}
        />
        <StatCard
          title={t('مواعيد اليوم', "Today's Appointments")}
          value={apptLoading ? '…' : appointments.length}
          icon={<CalendarDays className="w-5 h-5" />}
          color="amber"
          description={`${confirmedCount} ${t('مؤكد', 'confirmed')}`}
        />
        <StatCard
          title={t('بانتظار التأكيد', 'Pending Confirm')}
          value={apptLoading ? '…' : pendingConfirm}
          icon={<Clock className="w-5 h-5" />}
          color="violet"
          description={t('تحتاج مراجعة', 'need review')}
        />
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Appointments table */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary-600" />
                <CardTitle>{t('مواعيد اليوم', "Today's Appointments")}</CardTitle>
              </div>
              <span className="text-xs text-gray-400 dark:text-gray-500 font-normal bg-gray-100 dark:bg-neutral-800 px-2.5 py-1 rounded-full">
                {apptData?.total ?? 0} {t('موعد', 'total')}
              </span>
            </CardHeader>

            {/* Status distribution bar */}
            {!apptLoading && appointments.length > 0 && (
              <div className="px-5 pb-3">
                <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
                  {Object.entries(statusCounts).map(([status, count]) => (
                    <div
                      key={status}
                      className={STATUS_COLORS[status as AppointmentStatus] ?? 'bg-gray-300'}
                      style={{ width: `${(count / total) * 100}%` }}
                      title={`${status}: ${count}`}
                    />
                  ))}
                </div>
              </div>
            )}

            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-neutral-700 bg-surface dark:bg-neutral-900/40">
                    <th className="text-start px-5 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">{t('المريض', 'Patient')}</th>
                    <th className="text-start px-5 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">{t('الوقت', 'Time')}</th>
                    <th className="text-start px-5 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">{t('التخصص', 'Specialty')}</th>
                    <th className="text-start px-5 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">{t('الحالة', 'Status')}</th>
                    <th className="text-start px-5 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">{t('المصدر', 'Source')}</th>
                  </tr>
                </thead>
                <tbody>
                  {apptLoading && Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={5} />)}
                  {!apptLoading && appointments.slice(0, 10).map((appt) => {
                    const spec    = appt.specialtyId ? specialtyMap.get(appt.specialtyId) : null;
                    const patient = patientMap.get(appt.patientId);
                    const patName = patient
                      ? (lang === 'ar' ? (patient.nameAr ?? patient.nameEn) : patient.nameEn)
                      : appt.patientId.slice(-8).toUpperCase();
                    return (
                      <tr key={appt.id} className="border-b border-gray-50 dark:border-neutral-800 hover:bg-blue-50/40 dark:hover:bg-blue-900/10 transition-colors">
                        <td className="px-5 py-3.5 font-medium text-gray-800 dark:text-gray-200 text-sm max-w-[160px] truncate" title={patName}>
                          {patName}
                        </td>
                        <td className="px-5 py-3.5 text-gray-600 dark:text-gray-300 font-mono tabular-nums text-xs" dir="ltr">
                          {formatTime(appt.startTime)}
                        </td>
                        <td className="px-5 py-3.5 text-gray-600 dark:text-gray-300 text-sm">
                          {spec ? (lang === 'ar' ? spec.nameAr : spec.nameEn) : '—'}
                        </td>
                        <td className="px-5 py-3.5">
                          <AppointmentStatusBadge status={appt.status} lang={lang} />
                        </td>
                        <td className="px-5 py-3.5 text-gray-500 dark:text-gray-400 text-xs">{appt.patientSource}</td>
                      </tr>
                    );
                  })}
                  {!apptLoading && appointments.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-12 text-center text-gray-400 dark:text-gray-500">
                        {t('لا توجد مواعيد اليوم', 'No appointments today')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>

        {/* Quick schedule panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary-600" />
                <CardTitle>{t('الجدول السريع', 'Quick Schedule')}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              {apptLoading && Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50 dark:bg-neutral-800/60 animate-pulse">
                  <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-neutral-700 flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 rounded-full bg-gray-200 dark:bg-neutral-700 w-3/4" />
                    <div className="h-2.5 rounded-full bg-gray-100 dark:bg-neutral-700/60 w-1/2" />
                  </div>
                </div>
              ))}
              {!apptLoading && appointments.slice(0, 6).map((appt) => {
                const doctor  = appt.doctorId ? doctorMap.get(appt.doctorId) : null;
                const spec    = appt.specialtyId ? specialtyMap.get(appt.specialtyId) : null;
                const patient = patientMap.get(appt.patientId);
                const patName = patient
                  ? (lang === 'ar' ? (patient.nameAr ?? patient.nameEn) : patient.nameEn)
                  : appt.patientId.slice(-4).toUpperCase();
                const initial = patName.charAt(0).toUpperCase();
                return (
                  <div key={appt.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50 dark:bg-neutral-800/60 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-700 dark:text-primary-400 text-xs font-bold flex-shrink-0">
                      {initial}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-gray-900 dark:text-gray-100 text-sm font-medium truncate">{patName}</p>
                      <p className="text-gray-500 dark:text-gray-400 text-xs truncate">
                        {doctor
                          ? (lang === 'ar' ? (doctor.nameAr ?? doctor.nameEn) : doctor.nameEn)
                          : (spec ? (lang === 'ar' ? spec.nameAr : spec.nameEn) : '—')}
                      </p>
                    </div>
                    <span className="text-gray-500 dark:text-gray-400 text-xs font-mono flex-shrink-0" dir="ltr">{formatTime(appt.startTime)}</span>
                  </div>
                );
              })}
              {!apptLoading && appointments.length === 0 && (
                <p className="text-gray-400 dark:text-gray-500 text-sm text-center py-4">
                  {t('لا مواعيد اليوم', 'No appointments today')}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <AddAppointmentModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        defaultDate={now.toISOString().split('T')[0]}
        onCreated={() => { setAddOpen(false); void refetch(); }}
      />
    </div>
  );
}
