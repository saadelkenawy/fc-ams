'use client';

import { useState } from 'react';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { AppointmentStatusBadge } from '@/components/ui/Badge';
import { useLang } from '@/contexts/LanguageContext';
import { formatTime } from '@/lib/utils';
import type { AppointmentStatus } from '@fadl/types';

const STATUS_TABS: { status: AppointmentStatus | 'all'; labelAr: string; labelEn: string }[] = [
  { status: 'all',   labelAr: 'الكل',   labelEn: 'All'       },
  { status: 'TBC',   labelAr: 'انتظار', labelEn: 'TBC'       },
  { status: 'Ok!',   labelAr: 'موافق',  labelEn: 'Ok!'       },
  { status: 'Conf.', labelAr: 'مؤكد',   labelEn: 'Confirmed' },
  { status: 'Comp.', labelAr: 'مكتمل',  labelEn: 'Complete'  },
  { status: 'Canc.', labelAr: 'ملغي',   labelEn: 'Cancelled' },
];

const MOCK = [
  { id: 'a1', time: '09:00', patientAr: 'سارة محمود', patientEn: 'Sara Mahmoud', doctorAr: 'د. هدى إبراهيم', doctorEn: 'Dr. Hoda Ibrahim',   specialtyAr: 'نساء',   specialtyEn: 'Gynecology',   status: 'Conf.' as AppointmentStatus, source: "Cl.'s", charge: 350 },
  { id: 'a2', time: '09:30', patientAr: 'أحمد حسن',   patientEn: 'Ahmed Hassan', doctorAr: 'د. خالد رشاد',   doctorEn: 'Dr. Khaled Rashad', specialtyAr: 'أطفال', specialtyEn: 'Pediatrics',   status: 'TBC'   as AppointmentStatus, source: 'VEZ',    charge: 200 },
  { id: 'a3', time: '10:00', patientAr: 'منى علي',    patientEn: 'Mona Ali',     doctorAr: 'د. هدى إبراهيم', doctorEn: 'Dr. Hoda Ibrahim',   specialtyAr: 'نساء',   specialtyEn: 'Gynecology',   status: 'Ok!'   as AppointmentStatus, source: "Dr.'s", charge: 350 },
  { id: 'a4', time: '11:00', patientAr: 'خالد عمر',   patientEn: 'Khaled Omar',  doctorAr: 'د. سامر نور',    doctorEn: 'Dr. Samer Nour',    specialtyAr: 'قلب',    specialtyEn: 'Cardiology',   status: 'Comp.' as AppointmentStatus, source: "Cl.'s", charge: 400 },
  { id: 'a5', time: '11:30', patientAr: 'نادية سامي', patientEn: 'Nadia Sami',   doctorAr: 'د. رانيا سعيد',  doctorEn: 'Dr. Rania Said',    specialtyAr: 'جلدية', specialtyEn: 'Dermatology',  status: 'Canc.' as AppointmentStatus, source: 'EKF',    charge: 300 },
];

export default function AppointmentsPage() {
  const { lang, t } = useLang();
  const [activeTab, setActiveTab] = useState<AppointmentStatus | 'all'>('all');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const filtered = activeTab === 'all' ? MOCK : MOCK.filter((a) => a.status === activeTab);

  function shiftDate(days: number) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().split('T')[0]);
  }

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-bold font-display text-gray-900 dark:text-gray-100">{t('المواعيد', 'Appointments')}</h2>
        <Button size="sm">
          <Plus className="w-4 h-4" />
          {t('موعد جديد', 'New Appointment')}
        </Button>
      </div>

      {/* Date nav + status tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
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
        </div>

        <div className="pill-tab-bar overflow-x-auto">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.status}
              onClick={() => setActiveTab(tab.status)}
              className={`pill-tab whitespace-nowrap ${activeTab === tab.status ? 'active' : ''}`}
            >
              {lang === 'ar' ? tab.labelAr : tab.labelEn}
            </button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
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
              {filtered.map((a) => (
                <tr key={a.id} className="border-b border-gray-50 dark:border-neutral-700/50 hover:bg-gray-50/50 dark:hover:bg-neutral-700/30 transition-colors cursor-pointer">
                  <td className="px-5 py-3.5 font-mono text-gray-600 dark:text-gray-300 text-xs">{formatTime(a.time)}</td>
                  <td className="px-5 py-3.5 font-medium text-gray-900 dark:text-gray-100">{lang === 'ar' ? a.patientAr : a.patientEn}</td>
                  <td className="px-5 py-3.5 text-gray-600 dark:text-gray-300">{lang === 'ar' ? a.doctorAr : a.doctorEn}</td>
                  <td className="px-5 py-3.5 text-gray-600 dark:text-gray-300">{lang === 'ar' ? a.specialtyAr : a.specialtyEn}</td>
                  <td className="px-5 py-3.5"><AppointmentStatusBadge status={a.status} lang={lang} /></td>
                  <td className="px-5 py-3.5 font-mono text-gray-700 dark:text-gray-200 tabular-nums">
                    {a.charge} {t('ج', 'EGP')}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-gray-400 dark:text-gray-300">
                    {t('لا توجد مواعيد', 'No appointments found')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
