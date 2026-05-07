'use client';

import { Users, CalendarDays, TrendingUp, Clock, HeartPulse, AlertCircle } from 'lucide-react';
import { KpiCard } from '@/components/ui/KpiCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { AppointmentStatusBadge } from '@/components/ui/Badge';
import { useLang } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, formatTime } from '@/lib/utils';
import type { AppointmentStatus } from '@fadl/types';

const MOCK_KPIS = {
  todayPatients: 48,
  todayRevenue:  12_400,
  pendingConfirm: 7,
  avgWait: 18,
};

const MOCK_APPOINTMENTS = [
  { id: '1', patientNameAr: 'سارة محمود', patientNameEn: 'Sara Mahmoud', time: '09:30', specialty: 'نساء',   specialtyEn: 'Gynecology',   status: 'Conf.' as AppointmentStatus, source: "Cl.'s" },
  { id: '2', patientNameAr: 'أحمد حسن',   patientNameEn: 'Ahmed Hassan', time: '10:00', specialty: 'أطفال', specialtyEn: 'Pediatrics',   status: 'TBC'   as AppointmentStatus, source: 'VEZ'    },
  { id: '3', patientNameAr: 'منى علي',    patientNameEn: 'Mona Ali',     time: '10:30', specialty: 'نساء',   specialtyEn: 'Gynecology',   status: 'Ok!'   as AppointmentStatus, source: "Dr.'s" },
  { id: '4', patientNameAr: 'خالد عمر',   patientNameEn: 'Khaled Omar',  time: '11:00', specialty: 'قلب',    specialtyEn: 'Cardiology',   status: 'Comp.' as AppointmentStatus, source: "Cl.'s" },
  { id: '5', patientNameAr: 'نادية سامي', patientNameEn: 'Nadia Sami',   time: '11:30', specialty: 'جلدية', specialtyEn: 'Dermatology',  status: 'Canc.' as AppointmentStatus, source: 'EKF'   },
];

const MOCK_ALERTS = [
  { id: '1', msgAr: 'موعد مؤكد منذ أكثر من ساعتين بدون تأكيد مريض — أحمد حسن', msgEn: 'Appointment TBC for 2h+ without patient confirm — Ahmed Hassan' },
  { id: '2', msgAr: 'د. هدى متأخرة 20 دقيقة — 4 مرضى في الانتظار',              msgEn: 'Dr. Hoda is 20 min delayed — 4 patients waiting' },
];

export default function DashboardPage() {
  const { lang, t } = useLang();
  const { user } = useAuth();
  const now  = new Date();
  const hour = now.getHours();
  const greetAr = hour < 12 ? 'صباح الخير' : hour < 17 ? 'مساء الخير' : 'مساء النور';
  const greetEn = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Greeting */}
      <div>
        <h2 className="text-2xl font-bold font-display text-gray-900 dark:text-gray-100">
          {t(`${greetAr}،`, `${greetEn},`)} {lang === 'ar' ? user?.nameAr : user?.nameEn} 👋
        </h2>
        <p className="text-gray-500 dark:text-gray-300 mt-1 text-sm">
          {t(
            `${now.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
            `${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
          )}
        </p>
      </div>

      {/* Alerts */}
      {MOCK_ALERTS.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            {MOCK_ALERTS.map((a) => (
              <p key={a.id} className="text-sm text-amber-800 dark:text-amber-300">
                {lang === 'ar' ? a.msgAr : a.msgEn}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Today's Patients" titleAr="مرضى اليوم"
          value={MOCK_KPIS.todayPatients} change={12}
          changeLabel={t('من أمس', 'vs yesterday')}
          icon={<Users className="w-5 h-5" />}
          iconBg="bg-blue-50 dark:bg-blue-900/30"
          lang={lang} featured
        />
        <KpiCard
          title="Today's Revenue" titleAr="إيرادات اليوم"
          value={formatCurrency(MOCK_KPIS.todayRevenue, 'EGP', lang === 'ar' ? 'ar-EG' : 'en-US')}
          change={8.5} changeLabel={t('من أمس', 'vs yesterday')}
          icon={<TrendingUp className="w-5 h-5" />}
          iconBg="bg-emerald-50 dark:bg-emerald-900/30"
          lang={lang}
        />
        <KpiCard
          title="Pending Confirm" titleAr="بانتظار التأكيد"
          value={MOCK_KPIS.pendingConfirm} change={-2}
          icon={<CalendarDays className="w-5 h-5" />}
          iconBg="bg-amber-50 dark:bg-amber-900/30"
          lang={lang}
        />
        <KpiCard
          title="Avg Wait Time" titleAr="متوسط الانتظار"
          value={`${MOCK_KPIS.avgWait} ${t('د', 'min')}`}
          change={-5} changeLabel={t('من الأسبوع الماضي', 'vs last week')}
          icon={<Clock className="w-5 h-5" />}
          iconBg="bg-violet-50 dark:bg-violet-900/30"
          lang={lang}
        />
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Appointments table */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle>{t('مواعيد اليوم', "Today's Appointments")}</CardTitle>
              <span className="text-xs text-gray-400 dark:text-gray-300 font-normal">{t('الكل', 'See all')}</span>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-50 dark:border-neutral-700 bg-gray-50/50 dark:bg-neutral-900/40">
                    <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('المريض', 'Patient')}</th>
                    <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('الوقت', 'Time')}</th>
                    <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('التخصص', 'Specialty')}</th>
                    <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('الحالة', 'Status')}</th>
                    <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('المصدر', 'Source')}</th>
                  </tr>
                </thead>
                <tbody>
                  {MOCK_APPOINTMENTS.map((appt) => (
                    <tr key={appt.id} className="border-b border-gray-50 dark:border-neutral-700/50 hover:bg-gray-50/50 dark:hover:bg-neutral-700/30 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-gray-900 dark:text-gray-100">
                        {lang === 'ar' ? appt.patientNameAr : appt.patientNameEn}
                      </td>
                      <td className="px-5 py-3.5 text-gray-600 dark:text-gray-300 font-mono tabular-nums">
                        {formatTime(appt.time)}
                      </td>
                      <td className="px-5 py-3.5 text-gray-600 dark:text-gray-300">
                        {lang === 'ar' ? appt.specialty : appt.specialtyEn}
                      </td>
                      <td className="px-5 py-3.5">
                        <AppointmentStatusBadge status={appt.status} lang={lang} />
                      </td>
                      <td className="px-5 py-3.5 text-gray-500 dark:text-gray-300 text-xs">{appt.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>

        {/* Floating schedule panel — always crimson gradient, visible in both modes */}
        <div>
          <div className="glass-primary rounded-2xl p-5 panel-floating">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-white">{t('الجدول السريع', 'Quick Schedule')}</h3>
              <HeartPulse className="w-5 h-5 text-white/60" />
            </div>
            <div className="space-y-3">
              {MOCK_APPOINTMENTS.slice(0, 4).map((appt) => (
                <div key={appt.id} className="flex items-center gap-3 bg-white/10 rounded-lg px-3 py-2.5">
                  <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {(lang === 'ar' ? appt.patientNameAr : appt.patientNameEn).charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-white text-sm font-medium truncate">
                      {lang === 'ar' ? appt.patientNameAr : appt.patientNameEn}
                    </p>
                    <p className="text-white/60 text-xs">{lang === 'ar' ? appt.specialty : appt.specialtyEn}</p>
                  </div>
                  <span className="text-white/80 text-xs font-mono flex-shrink-0">{appt.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
