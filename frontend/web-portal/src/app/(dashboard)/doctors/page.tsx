'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, Calendar, TrendingUp, MoreHorizontal, Loader2, Stethoscope } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { useLang } from '@/contexts/LanguageContext';
import { useDoctors, useSpecialtyMap } from '@/hooks/useDoctors';
import { AddDoctorModal } from '@/components/doctors/AddDoctorModal';
import type { Doctor } from '@fadl/types';

const PAYMENT_LABELS: Record<string, { ar: string; en: string }> = {
  cash:          { ar: 'كاش',          en: 'Cash' },
  instapay:      { ar: 'انستاباي',     en: 'InstaPay' },
  bank_transfer: { ar: 'تحويل بنكي',   en: 'Bank Transfer' },
  vfc_wallet:    { ar: 'محفظة VFC',    en: 'VFC Wallet' },
  mobile_wallet: { ar: 'محفظة موبايل', en: 'Mobile Wallet' },
};

export default function DoctorsPage() {
  const { lang, t } = useLang();
  const [query, setQuery]       = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [addOpen, setAddOpen]   = useState(false);

  const { data, isLoading, isError } = useDoctors({ limit: 100 });
  const specialtyMap = useSpecialtyMap();

  const allDoctors = data?.data ?? [];
  const filtered   = allDoctors.filter((d) =>
    (lang === 'ar' ? (d.nameAr ?? d.nameEn) : d.nameEn).toLowerCase().includes(query.toLowerCase()),
  );
  const activeCount = allDoctors.filter((d) => d.isActive).length;
  const doctor      = allDoctors.find((d) => d.id === selected) ?? null;

  return (
    <div className="space-y-5 max-w-7xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div className="animate-slide-down">
          <h2 className="text-xl font-bold font-display text-gray-900 dark:text-gray-100">{t('الأطباء', 'Doctors')}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-300 mt-0.5">
            {t(`${activeCount} طبيب نشط`, `${activeCount} active doctors`)}
          </p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5 animate-slide-down" style={{ animationDelay: '40ms' }}>
          <Stethoscope className="w-4 h-4" />
          {t('إضافة طبيب', 'Add Doctor')}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Doctor list */}
        <div className={selected ? 'lg:col-span-2' : 'lg:col-span-3'}>
          <Card>
            <div className="p-5 border-b border-gray-50 dark:border-neutral-700">
              <Input
                placeholder={t('بحث بالاسم...', 'Search by name...')}
                icon={<Search className="w-4 h-4" />}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                lang={lang}
              />
            </div>
            <CardContent className="p-0">
              {isLoading && (
                <div className="flex items-center justify-center py-16 text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin me-2" />
                  {t('جاري التحميل...', 'Loading...')}
                </div>
              )}
              {isError && (
                <div className="py-12 text-center text-red-500 dark:text-red-400 text-sm">
                  {t('تعذّر تحميل البيانات', 'Failed to load doctors')}
                </div>
              )}
              {!isLoading && !isError && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-50 dark:border-neutral-700 bg-gray-50/50 dark:bg-neutral-900/40">
                      <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('الطبيب', 'Doctor')}</th>
                      <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('التخصص', 'Specialty')}</th>
                      <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('الحالة', 'Status')}</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((d) => {
                      const spec = specialtyMap.get(d.specialtyId);
                      return (
                        <tr
                          key={d.id}
                          onClick={() => setSelected(selected === d.id ? null : d.id)}
                          className={`border-b border-gray-50 dark:border-neutral-700/50 hover:bg-gray-50/50 dark:hover:bg-neutral-700/30 transition-colors cursor-pointer ${
                            selected === d.id ? 'bg-primary-50/50 dark:bg-primary-900/20' : ''
                          }`}
                        >
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div
                                className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 text-white"
                                style={{ background: 'var(--gradient-sidebar)' }}
                              >
                                {(lang === 'ar' ? (d.nameAr ?? d.nameEn) : d.nameEn).charAt(0)}
                              </div>
                              <div>
                                <p className="font-medium text-gray-900 dark:text-gray-100">{lang === 'ar' ? (d.nameAr ?? d.nameEn) : d.nameEn}</p>
                                <p className="text-xs text-gray-400 dark:text-gray-300 font-mono">{d.mobile}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-gray-600 dark:text-gray-300 text-sm">
                            {spec ? (lang === 'ar' ? spec.nameAr : spec.nameEn) : `#${d.specialtyId}`}
                            {d.isOnlineDoctor && (
                              <Badge variant="info" className="ms-2 text-[10px]">
                                {t('أونلاين', 'Online')}
                              </Badge>
                            )}
                          </td>
                          <td className="px-5 py-3.5">
                            <Badge variant={d.isActive ? 'success' : 'default'} dot>
                              {d.isActive ? t('نشط', 'Active') : t('غير نشط', 'Inactive')}
                            </Badge>
                          </td>
                          <td className="px-5 py-3.5">
                            <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-5 py-12 text-center text-gray-400 dark:text-gray-300">
                          {t('لا توجد نتائج', 'No results found')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Doctor detail panel ── */}
        {doctor && <DoctorDetailPanel doctor={doctor} lang={lang} t={t} />}
      </div>

      <AddDoctorModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => setAddOpen(false)}
      />
    </div>
  );
}

function DoctorDetailPanel({
  doctor,
  lang,
  t,
}: {
  doctor: Doctor;
  lang: 'ar' | 'en';
  t: (ar: string, en: string) => string;
}) {
  const router = useRouter();
  const specialtyMap = useSpecialtyMap();
  const spec = specialtyMap.get(doctor.specialtyId);
  const splits = [
    { labelAr: 'كشف عيادة',      labelEn: 'Consultation', split: doctor.revenueSplits.consultation },
    { labelAr: 'إجراء عملي',      labelEn: 'Operative',    split: doctor.revenueSplits.operative },
    { labelAr: 'استشارة أونلاين', labelEn: 'Online',       split: doctor.revenueSplits.online },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold text-white flex-shrink-0"
              style={{ background: 'var(--gradient-sidebar)' }}
            >
              {(lang === 'ar' ? (doctor.nameAr ?? doctor.nameEn) : doctor.nameEn).charAt(0)}
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                {lang === 'ar' ? (doctor.nameAr ?? doctor.nameEn) : doctor.nameEn}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-300">
                {spec ? (lang === 'ar' ? spec.nameAr : spec.nameEn) : `#${doctor.specialtyId}`}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t('نسب الأرباح', 'Revenue Splits')}</CardTitle></CardHeader>
        <CardContent className="space-y-3 pt-3">
          {splits.map((s) => (
            <div key={s.labelEn}>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-gray-600 dark:text-gray-300">{lang === 'ar' ? s.labelAr : s.labelEn}</span>
                <div className="flex gap-3">
                  <span className="font-semibold text-primary-700 dark:text-primary-400">
                    {t('طبيب', 'Dr')} {s.split.doctorPercentage}%
                  </span>
                  <span className="text-gray-400 dark:text-gray-300">
                    {t('عيادة', 'Clinic')} {s.split.clinicPercentage}%
                  </span>
                </div>
              </div>
              <div className="h-2 bg-gray-100 dark:bg-neutral-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary-600 transition-all duration-500"
                  style={{ width: `${s.split.doctorPercentage}%` }}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {doctor.paymentMethod && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-300">{t('طريقة الدفع', 'Payment Method')}</span>
              <Badge variant="outline">
                {lang === 'ar'
                  ? (PAYMENT_LABELS[doctor.paymentMethod]?.ar ?? doctor.paymentMethod)
                  : (PAYMENT_LABELS[doctor.paymentMethod]?.en ?? doctor.paymentMethod)}
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2">
        <Button variant="secondary" size="sm" className="flex-1" onClick={() => router.push(`/doctors/${doctor.id}/schedule`)}>
          <Calendar className="w-4 h-4" />
          {t('الجدول', 'Schedule')}
        </Button>
        <Button size="sm" className="flex-1">
          <TrendingUp className="w-4 h-4" />
          {t('التسوية', 'Settlement')}
        </Button>
      </div>
    </div>
  );
}
