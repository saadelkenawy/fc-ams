'use client';

import { useState } from 'react';
import { Search, Plus, CheckCircle, Clock, UserCheck, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { AppointmentStatusBadge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { useLang } from '@/contexts/LanguageContext';
import { formatTime } from '@/lib/utils';
import type { AppointmentStatus } from '@fadl/types';

// Module 11 — Receptionist Quick-Entry UI
// Optimized for front-desk: minimum clicks, high-volume walk-in

const QUEUE = [
  { id: 'q1', num: 1, patientAr: 'سارة محمود', patientEn: 'Sara Mahmoud', type: 'scheduled', time: '09:00', status: 'Conf.' as AppointmentStatus, doctorAr: 'د. هدى', doctorEn: 'Dr. Hoda', wait: 0 },
  { id: 'q2', num: 2, patientAr: 'أحمد حسن',   patientEn: 'Ahmed Hassan', type: 'walk_in',   time: '09:15', status: 'TBC' as AppointmentStatus,  doctorAr: 'د. هدى', doctorEn: 'Dr. Hoda', wait: 15 },
  { id: 'q3', num: 3, patientAr: 'منى علي',    patientEn: 'Mona Ali',    type: 'scheduled', time: '10:00', status: 'Ok!' as AppointmentStatus,  doctorAr: 'د. هدى', doctorEn: 'Dr. Hoda', wait: 30 },
];

const TBC_ALERTS = [
  { id: 't1', patientAr: 'أحمد حسن', patientEn: 'Ahmed Hassan', since: '2h 10m', mobile: '+201123456789' },
];

export default function ReceptionistPage() {
  const { lang, t } = useLang();
  const [searchVal, setSearchVal] = useState('');

  return (
    <div className="space-y-5 max-w-6xl mx-auto" data-density="compact">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-bold font-display text-gray-900">{t('الإدخال السريع', 'Quick Entry')}</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline">
            <UserCheck className="w-4 h-4" />
            {t('تسجيل مريض', 'Register Patient')}
          </Button>
          <Button size="sm">
            <Plus className="w-4 h-4" />
            {t('موعد جديد', 'New Appointment')}
          </Button>
        </div>
      </div>

      {/* TBC alerts — two-hour rule */}
      {TBC_ALERTS.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-semibold text-amber-800">
              {t('تنبيهات قاعدة الساعتين', 'Two-Hour Rule Alerts')}
            </span>
          </div>
          <div className="space-y-2">
            {TBC_ALERTS.map((a) => (
              <div key={a.id} className="flex items-center justify-between bg-white rounded-lg px-4 py-2.5 border border-amber-100">
                <div>
                  <span className="font-medium text-gray-900 text-sm">{lang === 'ar' ? a.patientAr : a.patientEn}</span>
                  <span className="text-gray-400 text-xs mx-2">·</span>
                  <span className="text-amber-600 text-xs">{t(`منذ ${a.since}`, `Pending for ${a.since}`)}</span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="success">
                    <CheckCircle className="w-3.5 h-3.5" />
                    {t('تأكيد', 'Confirm')}
                  </Button>
                  <Button size="sm" variant="outline">{t('إلغاء', 'Cancel')}</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Patient search — fast lookup */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>{t('بحث عن مريض', 'Patient Lookup')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder={t('موبايل أو اسم...', 'Mobile or name...')}
                icon={<Search className="w-4 h-4" />}
                value={searchVal}
                onChange={(e) => setSearchVal(e.target.value)}
                lang={lang}
              />
              <p className="text-xs text-gray-400 text-center py-6">
                {t('أدخل الموبايل أو الاسم للبحث', 'Enter mobile or name to search')}
              </p>
              <Button variant="secondary" className="w-full" size="sm">
                <Plus className="w-4 h-4" />
                {t('تسجيل مريض جديد', 'Register New Patient')}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Live queue board */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t('قائمة الانتظار المباشرة', 'Live Queue Board')}</CardTitle>
              <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                <span className="status-dot bg-emerald-500 w-1.5 h-1.5" />
                {t('مباشر', 'Live')}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-50 bg-gray-50/50">
                    <th className="text-start px-4 py-2.5 font-medium text-gray-500 text-xs w-10">#</th>
                    <th className="text-start px-4 py-2.5 font-medium text-gray-500 text-xs">{t('المريض', 'Patient')}</th>
                    <th className="text-start px-4 py-2.5 font-medium text-gray-500 text-xs">{t('النوع', 'Type')}</th>
                    <th className="text-start px-4 py-2.5 font-medium text-gray-500 text-xs">{t('الحالة', 'Status')}</th>
                    <th className="text-start px-4 py-2.5 font-medium text-gray-500 text-xs">{t('الانتظار', 'Wait')}</th>
                    <th className="px-4 py-2.5 text-xs" />
                  </tr>
                </thead>
                <tbody>
                  {QUEUE.map((q) => (
                    <tr key={q.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 font-bold text-gray-400 font-mono tabular-nums">{q.num}</td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-gray-900">{lang === 'ar' ? q.patientAr : q.patientEn}</p>
                          <p className="text-xs text-gray-400">{lang === 'ar' ? q.doctorAr : q.doctorEn} · {formatTime(q.time)}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${q.type === 'walk_in' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}`}>
                          {q.type === 'walk_in' ? t('حضور مباشر', 'Walk-in') : t('موعد', 'Scheduled')}
                        </span>
                      </td>
                      <td className="px-4 py-3"><AppointmentStatusBadge status={q.status} lang={lang} /></td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {q.wait > 0 ? (
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{q.wait}{t('د', 'm')}</span>
                        ) : (
                          <span className="text-emerald-600 flex items-center gap-1"><CheckCircle className="w-3 h-3" />{t('الآن', 'Now')}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5 justify-end">
                          <Button size="sm" variant="success" className="h-7 px-2 text-xs">
                            {t('دخول', 'Check In')}
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs">
                            {t('تأجيل', 'Delay')}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
