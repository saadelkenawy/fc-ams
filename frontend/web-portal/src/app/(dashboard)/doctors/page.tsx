'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Calendar, TrendingUp, MoreHorizontal, Loader2, Stethoscope, Pencil, Trash2, PowerOff, Power } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useLang } from '@/contexts/LanguageContext';
import { useDoctors, useSpecialtyMap, useToggleDoctorActive, useDeleteDoctor } from '@/hooks/useDoctors';
import { AddDoctorModal } from '@/components/doctors/AddDoctorModal';
import { EditDoctorModal } from '@/components/doctors/EditDoctorModal';
import { useToast } from '@/components/ui/Toast';
import type { Doctor } from '@fadl/types';

const PAYMENT_LABELS: Record<string, { ar: string; en: string }> = {
  cash:          { ar: 'كاش',          en: 'Cash' },
  instapay:      { ar: 'انستاباي',     en: 'InstaPay' },
  bank_transfer: { ar: 'تحويل بنكي',   en: 'Bank Transfer' },
  vfc_wallet:    { ar: 'محفظة VFC',    en: 'VFC Wallet' },
  mobile_wallet: { ar: 'محفظة موبايل', en: 'Mobile Wallet' },
};

function useOutsideClick(ref: React.RefObject<HTMLDivElement>, handler: () => void) {
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) handler();
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [ref, handler]);
}

function RowMenu({ doctor, onEdit, onToggle, onDelete, t }: {
  doctor: Doctor;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  lang?: 'ar' | 'en';
  t: (ar: string, en: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null!);
  useOutsideClick(ref, () => setOpen(false));

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded transition-colors"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute end-0 top-8 z-50 w-44 bg-white dark:bg-neutral-800 rounded-xl shadow-lg border border-gray-100 dark:border-neutral-700 py-1 animate-fade-in">
          <button
            className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-neutral-700 transition-colors"
            onClick={(e) => { e.stopPropagation(); setOpen(false); onEdit(); }}
          >
            <Pencil className="w-3.5 h-3.5 text-gray-400" />
            {t('تعديل البيانات', 'Edit')}
          </button>
          <button
            className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-neutral-700 transition-colors"
            onClick={(e) => { e.stopPropagation(); setOpen(false); onToggle(); }}
          >
            {doctor.isActive
              ? <PowerOff className="w-3.5 h-3.5 text-amber-500" />
              : <Power      className="w-3.5 h-3.5 text-green-500" />}
            {doctor.isActive ? t('تعطيل', 'Deactivate') : t('تفعيل', 'Activate')}
          </button>
          <div className="my-1 border-t border-gray-100 dark:border-neutral-700" />
          <button
            className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            onClick={(e) => { e.stopPropagation(); setOpen(false); onDelete(); }}
          >
            <Trash2 className="w-3.5 h-3.5" />
            {t('حذف', 'Delete')}
          </button>
        </div>
      )}
    </div>
  );
}

export default function DoctorsPage() {
  const { lang, t } = useLang();
  const { toast } = useToast();
  const [query, setQuery]             = useState('');
  const [selected, setSelected]       = useState<string | null>(null);
  const [addOpen, setAddOpen]         = useState(false);
  const [editDoctor, setEditDoctor]   = useState<Doctor | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Doctor | null>(null);

  const { data, isLoading, isError } = useDoctors({ limit: 100 });
  const specialtyMap   = useSpecialtyMap();
  const toggleActive   = useToggleDoctorActive();
  const deleteDoctor   = useDeleteDoctor();

  const allDoctors = data?.data ?? [];
  const filtered   = allDoctors.filter((d) =>
    (lang === 'ar' ? (d.nameAr ?? d.nameEn) : d.nameEn).toLowerCase().includes(query.toLowerCase()),
  );
  const activeCount = allDoctors.filter((d) => d.isActive).length;
  const doctor      = allDoctors.find((d) => d.id === selected) ?? null;

  function handleToggle(d: Doctor) {
    toggleActive.mutate({ id: d.id, isActive: !d.isActive }, {
      onSuccess: () => toast(
        d.isActive ? t('تم تعطيل الطبيب', 'Doctor deactivated') : t('تم تفعيل الطبيب', 'Doctor activated'),
        'success',
      ),
      onError: () => toast(t('حدث خطأ', 'An error occurred'), 'error'),
    });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    deleteDoctor.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast(t('تم حذف الطبيب', 'Doctor deleted'), 'success');
        if (selected === deleteTarget.id) setSelected(null);
        setDeleteTarget(null);
      },
      onError: () => toast(t('حدث خطأ', 'An error occurred'), 'error'),
    });
  }

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
                          <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                            <RowMenu
                              doctor={d}
                              lang={lang}
                              t={t}
                              onEdit={() => setEditDoctor(d)}
                              onToggle={() => handleToggle(d)}
                              onDelete={() => setDeleteTarget(d)}
                            />
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

        {doctor && (
          <DoctorDetailPanel
            doctor={doctor}
            lang={lang}
            t={t}
            onEdit={() => setEditDoctor(doctor)}
            onToggle={() => handleToggle(doctor)}
            onDelete={() => setDeleteTarget(doctor)}
          />
        )}
      </div>

      <AddDoctorModal open={addOpen} onClose={() => setAddOpen(false)} onCreated={() => setAddOpen(false)} />

      {editDoctor && (
        <EditDoctorModal open={!!editDoctor} onClose={() => setEditDoctor(null)} doctor={editDoctor} />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleteDoctor.isPending}
        title={t('حذف الطبيب', 'Delete Doctor')}
        message={
          deleteTarget
            ? t(
                `هل أنت متأكد من حذف د. ${deleteTarget.nameAr ?? deleteTarget.nameEn}؟ لا يمكن التراجع عن هذا الإجراء.`,
                `Are you sure you want to delete ${deleteTarget.nameEn}? This action cannot be undone.`,
              )
            : ''
        }
        confirmLabel={t('حذف', 'Delete')}
      />
    </div>
  );
}

function DoctorDetailPanel({ doctor, lang, t, onEdit, onToggle, onDelete }: {
  doctor: Doctor;
  lang: 'ar' | 'en';
  t: (ar: string, en: string) => string;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
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
          <div className="flex items-start gap-3 mb-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold text-white flex-shrink-0"
              style={{ background: 'var(--gradient-sidebar)' }}
            >
              {(lang === 'ar' ? (doctor.nameAr ?? doctor.nameEn) : doctor.nameEn).charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                {lang === 'ar' ? (doctor.nameAr ?? doctor.nameEn) : doctor.nameEn}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-300">
                {spec ? (lang === 'ar' ? spec.nameAr : spec.nameEn) : `#${doctor.specialtyId}`}
              </p>
            </div>
            <Badge variant={doctor.isActive ? 'success' : 'default'} dot className="text-[10px] flex-shrink-0">
              {doctor.isActive ? t('نشط', 'Active') : t('غير نشط', 'Inactive')}
            </Badge>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={onEdit}>
              <Pencil className="w-3.5 h-3.5" />
              {t('تعديل', 'Edit')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={`flex-1 gap-1.5 ${doctor.isActive ? 'text-amber-600 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30' : 'text-green-600 border-green-300 hover:bg-green-50 dark:hover:bg-green-950/30'}`}
              onClick={onToggle}
            >
              {doctor.isActive ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
              {doctor.isActive ? t('تعطيل', 'Deactivate') : t('تفعيل', 'Activate')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950/30"
              onClick={onDelete}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
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
