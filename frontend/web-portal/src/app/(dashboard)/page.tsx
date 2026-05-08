'use client';

import { Users, CalendarDays, TrendingUp, Clock, Stethoscope, Activity } from 'lucide-react';
import { StatCard } from '@/components/ui/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { AppointmentStatusBadge } from '@/components/ui/Badge';
import { useLang } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { formatTime } from '@/lib/utils';
import { useTodayAppointments } from '@/hooks/useAppointments';
import { useDoctors, useDoctorMap, useSpecialtyMap } from '@/hooks/useDoctors';
import { usePatients } from '@/hooks/usePatients';

export default function DashboardPage() {
  const { lang, t } = useLang();
  const { user }    = useAuth();
  const now  = new Date();
  const hour = now.getHours();
  const greetAr = hour < 12 ? 'صباح الخير' : hour < 17 ? 'مساء الخير' : 'مساء النور';
  const greetEn = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const { data: apptData, isLoading: apptLoading } = useTodayAppointments();
  const { data: doctorData }   = useDoctors({ limit: 1 });
  const { data: patientData }  = usePatients({ limit: 1 });
  const appointments  = apptData?.data ?? [];
  const doctorMap     = useDoctorMap();
  const specialtyMap  = useSpecialtyMap();

  const pendingConfirm = appointments.filter((a) => a.status === 'TBC').length;
  const totalDoctors   = doctorData?.total ?? 0;
  const totalPatients  = patientData?.total ?? 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fade-in">
      {/* Greeting */}
      <div className="animate-slide-down">
        <h2 className="text-2xl font-bold font-display text-gray-900 dark:text-gray-100">
          {t(`${greetAr}،`, `${greetEn},`)} {lang === 'ar' ? user?.nameAr : user?.nameEn}
        </h2>
        <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
          {t(
            `${now.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
            `${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
          )}
        </p>
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
          description={`${pendingConfirm} ${t('بانتظار التأكيد', 'pending confirm')}`}
        />
        <StatCard
          title={t('الحالات المعلقة', 'Pending Cases')}
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
                  {appointments.slice(0, 10).map((appt) => {
                    const spec = appt.specialtyId ? specialtyMap.get(appt.specialtyId) : null;
                    return (
                      <tr key={appt.id} className="border-b border-gray-50 dark:border-neutral-800 hover:bg-blue-50/40 dark:hover:bg-blue-900/10 transition-colors">
                        <td className="px-5 py-3.5 font-mono text-gray-600 dark:text-gray-300 text-xs">
                          {appt.patientId.slice(-8).toUpperCase()}
                        </td>
                        <td className="px-5 py-3.5 text-gray-600 dark:text-gray-300 font-mono tabular-nums">
                          {formatTime(appt.startTime)}
                        </td>
                        <td className="px-5 py-3.5 text-gray-600 dark:text-gray-300">
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
              {appointments.slice(0, 5).map((appt) => {
                const doctor = appt.doctorId ? doctorMap.get(appt.doctorId) : null;
                const spec   = appt.specialtyId ? specialtyMap.get(appt.specialtyId) : null;
                return (
                  <div key={appt.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50 dark:bg-neutral-800/60">
                    <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-700 dark:text-primary-400 text-xs font-bold flex-shrink-0">
                      {appt.patientId.slice(-1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-gray-900 dark:text-gray-100 text-sm font-medium font-mono truncate">
                        {appt.patientId.slice(-8).toUpperCase()}
                      </p>
                      <p className="text-gray-500 dark:text-gray-400 text-xs truncate">
                        {doctor
                          ? (lang === 'ar' ? (doctor.nameAr ?? doctor.nameEn) : doctor.nameEn)
                          : (spec ? (lang === 'ar' ? spec.nameAr : spec.nameEn) : '—')}
                      </p>
                    </div>
                    <span className="text-gray-500 dark:text-gray-400 text-xs font-mono flex-shrink-0">{appt.startTime}</span>
                  </div>
                );
              })}
              {!apptLoading && appointments.length === 0 && (
                <p className="text-gray-400 dark:text-gray-500 text-sm text-center py-4">
                  {t('لا مواعيد', 'No appointments')}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
