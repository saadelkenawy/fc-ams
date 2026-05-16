'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Filter, UserPlus, Users, UserCheck, TrendingUp, Globe } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { ActionButtons } from '@/components/ui/ActionButtons';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Pagination } from '@/components/ui/Pagination';
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
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [query, setQuery]               = useState(() => searchParams.get('query') ?? '');
  const [page, setPage]                 = useState(1);
  const [limit, setLimit]               = useState(10);
  const [futureOnly, setFutureOnly]     = useState(false);
  const [addOpen, setAddOpen]           = useState(false);
  const [editPatient, setEditPatient]   = useState<Patient | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Patient | null>(null);

  useEffect(() => {
    const urlQuery = searchParams.get('query');
    if (urlQuery) setQuery(urlQuery);
  }, [searchParams]);

  const debouncedQuery = useDebounce(query, 300);
  const deletePatient  = useDeletePatient();

  const { data, isLoading, isError } = usePatients({
    query: debouncedQuery || undefined,
    page,
    limit,
    isFutureSource: futureOnly || undefined,
  });

  const patients = data?.data ?? [];
  const total    = data?.total ?? 0;

  const vezCount = patients.filter((p) => p.sourceFirstVisit === 'VEZ').length;
  const newCount = patients.filter((p) => {
    if (!p.createdAt) return false;
    const created = new Date(p.createdAt);
    const now = new Date();
    return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
  }).length;

  function handleSearch(q: string) { setQuery(q); setPage(1); }
  function handlePageChange(p: number) { setPage(p); }
  function handleLimitChange(l: number) { setLimit(l); setPage(1); }
  function handleFutureToggle() { setFutureOnly((v) => !v); setPage(1); }

  function handleDelete() {
    if (!deleteTarget) return;
    deletePatient.mutate(deleteTarget.patientId, {
      onSuccess: () => {
        toast(t('تم حذف المريض', 'Patient deleted'), 'success');
        setDeleteTarget(null);
      },
      onError: () => toast(t('تعذّر حذف المريض. حاول مرة أخرى.', "Couldn't delete patient. Refresh and try again."), 'error'),
    });
  }

  const [activeFilter, setActiveFilter] = useState<'all' | 'future'>('all');

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
            <div className="flex items-center gap-1.5">
              <p className="font-medium text-gray-900 dark:text-gray-100">{lang === 'ar' ? (p.nameAr ?? p.nameEn) : p.nameEn}</p>
              {p.isFutureSource && (
                <span title={t('مصدر Cl.&apos;s مستقبلي', "Future Cl.'s Source")} className="text-primary-500 text-xs leading-none select-none">◈</span>
              )}
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 font-mono" dir="ltr">{p.nationalId ?? '—'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'mobile',
      header: t('الموبايل', 'Mobile'),
      render: (p) => <span className="text-gray-600 dark:text-gray-300 font-mono text-xs" dir="ltr">{p.mobile}</span>,
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
          <h2 className="text-2xl font-bold font-display text-gray-900 dark:text-gray-100">{t('المرضى', 'Patients')}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-1">
            <span>{total}</span>
            <span>{t('مريض مسجل', 'registered patients')}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 animate-slide-down" style={{ animationDelay: '40ms' }}>
          <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5">
            <UserPlus className="w-4 h-4" />
            {t('مريض جديد', 'New Patient')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={t('إجمالي المرضى', 'Total Patients')}
          value={total || '—'}
          icon={<Users className="w-5 h-5" />}
          color="blue"
          description={t('مريض مسجل', 'registered patients')}
        />
        <StatCard
          title={t('هذا الشهر', 'This Month')}
          value={isLoading ? '…' : newCount}
          icon={<UserCheck className="w-5 h-5" />}
          color="emerald"
          description={t('في هذه الصفحة', 'on this page')}
        />
        <StatCard
          title={t('مصادر خارجية', 'External Sources')}
          value={isLoading ? '…' : patients.filter((p) => p.sourceFirstVisit && p.sourceFirstVisit !== '').length}
          icon={<Globe className="w-5 h-5" />}
          color="amber"
          description={t('في هذه الصفحة', 'on this page')}
        />
        <StatCard
          title={t('مرضى VEZ', 'VEZ Source')}
          value={isLoading ? '…' : vezCount}
          icon={<TrendingUp className="w-5 h-5" />}
          color="violet"
          description={t('من مصدر VEZ', 'from VEZ source')}
        />
      </div>

      <Card className="animate-slide-up">
        <div className="flex items-center gap-3 p-5 border-b border-gray-100 dark:border-neutral-700 flex-wrap">
          <div className="flex-1 min-w-48">
            <Input
              placeholder={t('بحث بالاسم، الموبايل، أو الرقم القومي...', 'Search by name, mobile, or national ID...')}
              icon={<Search className="w-4 h-4" />}
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              lang={lang}
            />
          </div>
          <button
            onClick={() => { setActiveFilter('all'); if (futureOnly) handleFutureToggle(); }}
            className={`h-9 px-3.5 rounded-full text-xs font-medium border transition-all whitespace-nowrap ${
              activeFilter === 'all'
                ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-700 text-primary-700 dark:text-primary-400'
                : 'bg-white dark:bg-neutral-800 border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-neutral-600'
            }`}
          >
            {t('الكل', 'All')}
          </button>
          <button
            onClick={() => { setActiveFilter('future'); if (!futureOnly) handleFutureToggle(); }}
            className={`h-9 px-3.5 rounded-full text-xs font-medium border transition-all whitespace-nowrap ${
              activeFilter === 'future'
                ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-700 text-primary-700 dark:text-primary-400'
                : 'bg-white dark:bg-neutral-800 border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-neutral-600'
            }`}
          >
            <span className="text-xs me-1">◈</span>
            {t('المستقبلية', 'Future')}
          </button>
        </div>
        <CardContent className="p-0">
          <DataTable
            columns={columns}
            data={patients}
            getRowKey={(p) => p.patientId}
            onRowClick={(p) => router.push(`/patients/${p.patientId}`)}
            loading={isLoading}
            error={isError}
            emptyMessage={t('لا يوجد مرضى يطابق البحث', 'No patients match that search.')}
            onAddNew={() => setAddOpen(true)}
            addNewLabel={t('إضافة مريض', 'Add Patient')}
            errorMessage={t('تعذّر تحميل البيانات', 'Failed to load patients')}
          />
          <Pagination
            page={page}
            total={total}
            limit={limit}
            onPageChange={handlePageChange}
            onLimitChange={handleLimitChange}
            pageSizes={[10, 25, 50]}
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
        loading={deletePatient.isLoading}
        title={t('حذف المريض', 'Delete Patient')}
        message={
          deleteTarget
            ? t(
                `هل أنت متأكد من حذف ${deleteTarget.nameAr ?? deleteTarget.nameEn}؟ لا يمكن التراجع عن هذا الإجراء.`,
                `Delete ${deleteTarget.nameEn}? This removes their record permanently.`,
              )
            : ''
        }
        confirmLabel={t('حذف', 'Delete')}
      />
    </div>
  );
}
