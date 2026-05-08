'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Filter, UserPlus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { ActionButtons } from '@/components/ui/ActionButtons';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useLang } from '@/contexts/LanguageContext';
import { formatDate } from '@/lib/utils';
import { usePatients, useDeletePatient } from '@/hooks/usePatients';
import { useDebounce } from '@/hooks/useDebounce';
import { AddPatientModal } from '@/components/patients/AddPatientModal';
import { EditPatientModal } from '@/components/patients/EditPatientModal';
import { useToast } from '@/components/ui/Toast';
import type { Patient } from '@fadl/types';

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

  const columns: Column<Patient>[] = [
    {
      key: 'patient',
      header: t('المريض', 'Patient'),
      render: (p) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-primary-700 dark:text-primary-400 text-xs font-bold flex-shrink-0">
            {(lang === 'ar' ? (p.nameAr ?? p.nameEn) : p.nameEn).charAt(0)}
          </div>
          <div>
            <p className="font-medium text-gray-900 dark:text-gray-100">{lang === 'ar' ? (p.nameAr ?? p.nameEn) : p.nameEn}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 font-mono">{p.nationalId ?? '—'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'mobile',
      header: t('الموبايل', 'Mobile'),
      render: (p) => <span className="text-gray-600 dark:text-gray-300 font-mono text-xs">{p.mobile}</span>,
    },
    {
      key: 'dob',
      header: t('تاريخ الميلاد', 'Date of Birth'),
      render: (p) => (
        <span className="text-gray-600 dark:text-gray-300">
          {p.dateOfBirth ? formatDate(p.dateOfBirth, lang === 'ar' ? 'ar-EG' : 'en-US') : '—'}
        </span>
      ),
    },
    {
      key: 'source',
      header: t('المصدر', 'Source'),
      render: (p) => p.sourceFirstVisit
        ? <Badge variant={['VEZ', 'EKF', 'DO'].includes(p.sourceFirstVisit) ? 'info' : 'default'}>{p.sourceFirstVisit}</Badge>
        : <span className="text-gray-400">—</span>,
    },
    {
      key: 'actions',
      header: '',
      render: (p) => (
        <ActionButtons
          onEdit={() => setEditPatient(p)}
          onDelete={() => setDeleteTarget(p)}
          editTitle={t('تعديل', 'Edit patient')}
          deleteTitle={t('حذف', 'Delete patient')}
        />
      ),
    },
  ];

  return (
    <div className="space-y-5 max-w-7xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div className="animate-slide-down">
          <h2 className="text-xl font-bold font-display text-gray-900 dark:text-gray-100">{t('المرضى', 'Patients')}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
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
        <div className="p-5 border-b border-gray-100 dark:border-neutral-700">
          <Input
            placeholder={t('بحث بالاسم، الموبايل، أو الرقم القومي...', 'Search by name, mobile, or national ID...')}
            icon={<Search className="w-4 h-4" />}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            lang={lang}
          />
        </div>
        <CardContent className="p-0">
          <DataTable
            columns={columns}
            data={patients}
            getRowKey={(p) => p.patientId}
            onRowClick={(p) => router.push(`/patients/${p.patientId}`)}
            loading={isLoading}
            error={isError}
            emptyMessage={t('لا توجد نتائج', 'No results found')}
            onAddNew={() => setAddOpen(true)}
            addNewLabel={t('إضافة مريض', 'Add Patient')}
            errorMessage={t('تعذّر تحميل البيانات', 'Failed to load patients')}
          />
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
