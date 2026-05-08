'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Plus, Filter, MoreHorizontal, Loader2, UserPlus, Pencil, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useLang } from '@/contexts/LanguageContext';
import { formatDate } from '@/lib/utils';
import { usePatients, useDeletePatient } from '@/hooks/usePatients';
import { useDebounce } from '@/hooks/useDebounce';
import { AddPatientModal } from '@/components/patients/AddPatientModal';
import { EditPatientModal } from '@/components/patients/EditPatientModal';
import { useToast } from '@/components/ui/Toast';
import type { Patient } from '@fadl/types';

function useOutsideClick(ref: React.RefObject<HTMLDivElement>, handler: () => void) {
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) handler();
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [ref, handler]);
}

function RowMenu({ patient, onEdit, onDelete, lang, t }: {
  patient: Patient;
  onEdit: () => void;
  onDelete: () => void;
  lang: 'ar' | 'en';
  t: (ar: string, en: string) => string;
}) {
  const router = useRouter();
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
            onClick={(e) => { e.stopPropagation(); setOpen(false); router.push(`/patients/${patient.patientId}`); }}
          >
            <UserPlus className="w-3.5 h-3.5 text-gray-400" />
            {t('عرض الملف', 'View Profile')}
          </button>
          <button
            className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-neutral-700 transition-colors"
            onClick={(e) => { e.stopPropagation(); setOpen(false); onEdit(); }}
          >
            <Pencil className="w-3.5 h-3.5 text-gray-400" />
            {t('تعديل البيانات', 'Edit')}
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

export default function PatientsPage() {
  const { lang, t } = useLang();
  const router = useRouter();
  const { toast } = useToast();
  const [query, setQuery]               = useState('');
  const [addOpen, setAddOpen]           = useState(false);
  const [editPatient, setEditPatient]   = useState<Patient | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Patient | null>(null);
  const debouncedQuery                  = useDebounce(query, 300);

  const { data, isLoading, isError } = usePatients({ q: debouncedQuery || undefined, limit: 50 });
  const deletePatient = useDeletePatient();

  const patients = data?.data ?? [];
  const total    = data?.total ?? 0;

  function handleDelete() {
    if (!deleteTarget) return;
    deletePatient.mutate(deleteTarget.patientId, {
      onSuccess: () => {
        toast(t('تم حذف المريض', 'Patient deleted'), 'success');
        setDeleteTarget(null);
      },
      onError: () => toast(t('حدث خطأ', 'An error occurred'), 'error'),
    });
  }

  return (
    <div className="space-y-5 max-w-7xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div className="animate-slide-down">
          <h2 className="text-xl font-bold font-display text-gray-900 dark:text-gray-100">{t('المرضى', 'Patients')}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-300 mt-0.5">
            {t(`${total} مريض مسجل`, `${total} registered patients`)}
          </p>
        </div>
        <div className="flex items-center gap-2 animate-slide-down" style={{ animationDelay: '40ms' }}>
          <Button variant="outline" size="sm">
            <Filter className="w-4 h-4" />
            {t('فلتر', 'Filter')}
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5">
            <UserPlus className="w-4 h-4" />
            {t('مريض جديد', 'New Patient')}
          </Button>
        </div>
      </div>

      <Card className="animate-slide-up">
        <div className="p-5 border-b border-gray-50 dark:border-neutral-700">
          <Input
            placeholder={t('بحث بالاسم، الموبايل، أو الرقم القومي...', 'Search by name, mobile, or national ID...')}
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
              {t('تعذّر تحميل البيانات', 'Failed to load patients')}
            </div>
          )}
          {!isLoading && !isError && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-50 dark:border-neutral-700 bg-gray-50/50 dark:bg-neutral-900/40">
                    <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('المريض', 'Patient')}</th>
                    <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('الموبايل', 'Mobile')}</th>
                    <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('تاريخ الميلاد', 'Date of Birth')}</th>
                    <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('المصدر', 'Source')}</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {patients.map((p, i) => (
                    <tr
                      key={p.patientId}
                      onClick={() => router.push(`/patients/${p.patientId}`)}
                      className="border-b border-gray-50 dark:border-neutral-700/50 hover:bg-gray-50/50 dark:hover:bg-neutral-700/30 transition-colors cursor-pointer animate-slide-in-right"
                      style={{ animationDelay: `${i * 25}ms` }}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-primary-700 dark:text-primary-400 text-xs font-bold flex-shrink-0">
                            {(lang === 'ar' ? (p.nameAr ?? p.nameEn) : p.nameEn).charAt(0)}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-gray-100">{lang === 'ar' ? (p.nameAr ?? p.nameEn) : p.nameEn}</p>
                            <p className="text-xs text-gray-400 dark:text-gray-300 font-mono">{p.nationalId ?? '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-gray-600 dark:text-gray-300 font-mono text-xs">{p.mobile}</td>
                      <td className="px-5 py-3.5 text-gray-600 dark:text-gray-300">
                        {p.dateOfBirth ? formatDate(p.dateOfBirth, lang === 'ar' ? 'ar-EG' : 'en-US') : '—'}
                      </td>
                      <td className="px-5 py-3.5">
                        {p.sourceFirstVisit ? (
                          <Badge variant={['VEZ', 'EKF', 'DO'].includes(p.sourceFirstVisit) ? 'info' : 'default'}>
                            {p.sourceFirstVisit}
                          </Badge>
                        ) : '—'}
                      </td>
                      <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                        <RowMenu
                          patient={p}
                          lang={lang}
                          t={t}
                          onEdit={() => setEditPatient(p)}
                          onDelete={() => setDeleteTarget(p)}
                        />
                      </td>
                    </tr>
                  ))}
                  {patients.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-16 text-center">
                        <div className="flex flex-col items-center gap-3 text-gray-400">
                          <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-neutral-800 flex items-center justify-center">
                            <Plus className="w-5 h-5" />
                          </div>
                          <p className="text-sm">{t('لا توجد نتائج', 'No results found')}</p>
                          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
                            {t('إضافة مريض', 'Add Patient')}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AddPatientModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={(id) => router.push(`/patients/${id}`)}
      />

      {editPatient && (
        <EditPatientModal open={!!editPatient} onClose={() => setEditPatient(null)} patient={editPatient} />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deletePatient.isPending}
        title={t('حذف المريض', 'Delete Patient')}
        message={
          deleteTarget
            ? t(
                `هل أنت متأكد من حذف ${deleteTarget.nameAr ?? deleteTarget.nameEn}؟ لا يمكن التراجع عن هذا الإجراء.`,
                `Are you sure you want to delete ${deleteTarget.nameEn}? This action cannot be undone.`,
              )
            : ''
        }
        confirmLabel={t('حذف', 'Delete')}
      />
    </div>
  );
}
