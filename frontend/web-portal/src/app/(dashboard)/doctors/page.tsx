'use client';

import { useState } from 'react';
import { Plus, Search, Calendar, TrendingUp, MoreHorizontal, Star } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { useLang } from '@/contexts/LanguageContext';
import { formatCurrency } from '@/lib/utils';

const MOCK_DOCTORS = [
  {
    id: 'd1', nameAr: 'د. هدى إبراهيم',    nameEn: 'Dr. Hoda Ibrahim',
    specialtyAr: 'النساء والعقم', specialtyEn: 'Gynecology & Infertility',
    mobile: '+201011112222', isOnline: false, isActive: true,
    splits: { consultation: 50, operative: 80, online: 70 },
    todayAppointments: 12, monthRevenue: 48_000, rating: 4.9,
    paymentMethod: 'instapay',
  },
  {
    id: 'd2', nameAr: 'د. خالد رشاد',      nameEn: 'Dr. Khaled Rashad',
    specialtyAr: 'الأطفال والمواليد', specialtyEn: 'Pediatrics & Newborn',
    mobile: '+201022223333', isOnline: false, isActive: true,
    splits: { consultation: 50, operative: 80, online: 70 },
    todayAppointments: 9, monthRevenue: 32_000, rating: 4.7,
    paymentMethod: 'bank_transfer',
  },
  {
    id: 'd3', nameAr: 'د. سامر نور',       nameEn: 'Dr. Samer Nour',
    specialtyAr: 'القلب', specialtyEn: 'Cardiology',
    mobile: '+201033334444', isOnline: true, isActive: true,
    splits: { consultation: 60, operative: 80, online: 70 },
    todayAppointments: 7, monthRevenue: 55_000, rating: 4.8,
    paymentMethod: 'cash',
  },
  {
    id: 'd4', nameAr: 'د. رانيا سعيد',     nameEn: 'Dr. Rania Said',
    specialtyAr: 'الجلدية', specialtyEn: 'Dermatology',
    mobile: '+201044445555', isOnline: false, isActive: true,
    splits: { consultation: 50, operative: 75, online: 70 },
    todayAppointments: 10, monthRevenue: 38_000, rating: 4.6,
    paymentMethod: 'instapay',
  },
  {
    id: 'd5', nameAr: 'د. محمود طه',       nameEn: 'Dr. Mahmoud Taha',
    specialtyAr: 'الباطنة', specialtyEn: 'Internal Medicine',
    mobile: '+201055556666', isOnline: false, isActive: false,
    splits: { consultation: 50, operative: 80, online: 70 },
    todayAppointments: 0, monthRevenue: 0, rating: 4.5,
    paymentMethod: 'cash',
  },
];

const PAYMENT_LABELS: Record<string, { ar: string; en: string }> = {
  cash:          { ar: 'كاش',         en: 'Cash' },
  instapay:      { ar: 'انستاباي',    en: 'InstaPay' },
  bank_transfer: { ar: 'تحويل بنكي',  en: 'Bank Transfer' },
  vfc_wallet:    { ar: 'محفظة VFC',   en: 'VFC Wallet' },
  mobile_wallet: { ar: 'محفظة موبايل', en: 'Mobile Wallet' },
};

export default function DoctorsPage() {
  const { lang, t } = useLang();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const filtered = MOCK_DOCTORS.filter((d) =>
    (lang === 'ar' ? d.nameAr : d.nameEn).toLowerCase().includes(query.toLowerCase()) ||
    (lang === 'ar' ? d.specialtyAr : d.specialtyEn).toLowerCase().includes(query.toLowerCase()),
  );

  const doctor = MOCK_DOCTORS.find((d) => d.id === selected);

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold font-display text-gray-900">{t('الأطباء', 'Doctors')}</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {t(`${MOCK_DOCTORS.filter(d => d.isActive).length} طبيب نشط`, `${MOCK_DOCTORS.filter(d => d.isActive).length} active doctors`)}
          </p>
        </div>
        <Button size="sm">
          <Plus className="w-4 h-4" />
          {t('إضافة طبيب', 'Add Doctor')}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Doctors list */}
        <div className={selected ? 'lg:col-span-2' : 'lg:col-span-3'}>
          <Card>
            <div className="p-5 border-b border-gray-50">
              <Input
                placeholder={t('بحث بالاسم أو التخصص...', 'Search by name or specialty...')}
                icon={<Search className="w-4 h-4" />}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                lang={lang}
              />
            </div>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-50 bg-gray-50/50">
                    <th className="text-start px-5 py-3 font-medium text-gray-500 text-xs">{t('الطبيب', 'Doctor')}</th>
                    <th className="text-start px-5 py-3 font-medium text-gray-500 text-xs">{t('التخصص', 'Specialty')}</th>
                    {!selected && <>
                      <th className="text-start px-5 py-3 font-medium text-gray-500 text-xs">{t('اليوم', 'Today')}</th>
                      <th className="text-start px-5 py-3 font-medium text-gray-500 text-xs">{t('إيرادات الشهر', 'Month Revenue')}</th>
                      <th className="text-start px-5 py-3 font-medium text-gray-500 text-xs">{t('التقييم', 'Rating')}</th>
                    </>}
                    <th className="text-start px-5 py-3 font-medium text-gray-500 text-xs">{t('الحالة', 'Status')}</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((d) => (
                    <tr
                      key={d.id}
                      onClick={() => setSelected(selected === d.id ? null : d.id)}
                      className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer ${selected === d.id ? 'bg-primary-50/50' : ''}`}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                            style={{ background: 'var(--gradient-sidebar)', color: 'white' }}>
                            {(lang === 'ar' ? d.nameAr : d.nameEn).split(' ')[1]?.charAt(0) ?? 'د'}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{lang === 'ar' ? d.nameAr : d.nameEn}</p>
                            <p className="text-xs text-gray-400 font-mono">{d.mobile}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-gray-600 text-sm">
                        {lang === 'ar' ? d.specialtyAr : d.specialtyEn}
                        {d.isOnline && (
                          <Badge variant="info" className="ms-2 text-[10px]">
                            {t('أونلاين', 'Online')}
                          </Badge>
                        )}
                      </td>
                      {!selected && <>
                        <td className="px-5 py-3.5 text-gray-700 tabular-nums font-mono">
                          {d.todayAppointments} {t('موعد', 'appts')}
                        </td>
                        <td className="px-5 py-3.5 text-gray-700 font-mono tabular-nums">
                          {formatCurrency(d.monthRevenue, 'EGP', lang === 'ar' ? 'ar-EG' : 'en-US')}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1 text-amber-500">
                            <Star className="w-3.5 h-3.5 fill-current" />
                            <span className="text-sm font-medium text-gray-700 tabular-nums">{d.rating}</span>
                          </div>
                        </td>
                      </>}
                      <td className="px-5 py-3.5">
                        <Badge variant={d.isActive ? 'success' : 'default'} dot>
                          {d.isActive ? t('نشط', 'Active') : t('غير نشط', 'Inactive')}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5">
                        <button className="text-gray-400 hover:text-gray-600">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>

        {/* Doctor detail panel */}
        {doctor && (
          <div className="space-y-4 animate-fade-in">
            {/* Profile */}
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold text-white flex-shrink-0"
                    style={{ background: 'var(--gradient-sidebar)' }}>
                    {(lang === 'ar' ? doctor.nameAr : doctor.nameEn).split(' ')[1]?.charAt(0) ?? 'د'}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{lang === 'ar' ? doctor.nameAr : doctor.nameEn}</h3>
                    <p className="text-sm text-gray-500">{lang === 'ar' ? doctor.specialtyAr : doctor.specialtyEn}</p>
                    <div className="flex items-center gap-1 mt-0.5 text-amber-500">
                      <Star className="w-3 h-3 fill-current" />
                      <span className="text-xs font-medium text-gray-600">{doctor.rating}/5.0</span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-gray-400 text-xs mb-1">{t('مواعيد اليوم', "Today's Appts")}</p>
                    <p className="font-bold text-gray-900 font-mono tabular-nums text-lg">{doctor.todayAppointments}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-gray-400 text-xs mb-1">{t('إيرادات الشهر', 'Month Revenue')}</p>
                    <p className="font-bold text-gray-900 font-mono tabular-nums">{formatCurrency(doctor.monthRevenue, 'EGP', 'en-US')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Revenue splits */}
            <Card>
              <CardHeader><CardTitle>{t('نسب الأرباح', 'Revenue Splits')}</CardTitle></CardHeader>
              <CardContent className="space-y-3 pt-3">
                {[
                  { labelAr: 'كشف عيادة',   labelEn: 'Consultation', pct: doctor.splits.consultation },
                  { labelAr: 'إجراء عملي',   labelEn: 'Operative',    pct: doctor.splits.operative },
                  { labelAr: 'استشارة أونلاين', labelEn: 'Online',    pct: doctor.splits.online },
                ].map((s) => (
                  <div key={s.labelEn}>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-gray-600">{lang === 'ar' ? s.labelAr : s.labelEn}</span>
                      <div className="flex gap-3">
                        <span className="font-semibold text-primary-700">{t('طبيب', 'Dr')} {s.pct}%</span>
                        <span className="text-gray-400">{t('عيادة', 'Clinic')} {100 - s.pct}%</span>
                      </div>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-primary-600 transition-all duration-500"
                        style={{ width: `${s.pct}%` }} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Payment info */}
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">{t('طريقة الدفع', 'Payment Method')}</span>
                  <Badge variant="outline">
                    {lang === 'ar'
                      ? PAYMENT_LABELS[doctor.paymentMethod]?.ar
                      : PAYMENT_LABELS[doctor.paymentMethod]?.en}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" className="flex-1">
                <Calendar className="w-4 h-4" />
                {t('الجدول', 'Schedule')}
              </Button>
              <Button size="sm" className="flex-1">
                <TrendingUp className="w-4 h-4" />
                {t('التسوية', 'Settlement')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
