'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Calendar, TrendingUp, Stethoscope, PowerOff, Power, Users, Wifi } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { StatCard } from '@/components/ui/StatCard';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { ActionButtons } from '@/components/ui/ActionButtons';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Pagination } from '@/components/ui/Pagination';
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

export default function DoctorsPage() {
  const { lang, t } = useLang();
  const { toast } = useToast();
  const [query, setQuery]             = useState('');
  const [page, setPage]               = useState(1);
  const [limit, setLimit]             = useState(10);
  const [selected, setSelected]       = useState<string | null>(null);
  const [addOpen, setAddOpen]         = useState(false);
  const [editDoctor, setEditDoctor]   = useState<Doctor | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Doctor | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'online'>('all');

  const { data, isLoading, isError } = useDoctors({ limit: 500 });
  const specialtyMap   = useSpecialtyMap();
  const toggleActive   = useToggleDoctorActive();
  const deleteDoctor   = useDeleteDoctor();

  const allDoctors   = data?.data ?? [];
  const filtered     = allDoctors.filter((d) => {
    const nameMatch = (lang === 'ar' ? (d.nameAr ?? d.nameEn) : d.nameEn).toLowerCase().includes(query.toLowerCase());
    if (!nameMatch) return false;
    if (statusFilter === 'active') return d.isActive;
    if (statusFilter === 'online') return d.isOnlineDoctor;
    return true;
  });
  const activeCount  = allDoctors.filter((d) => d.isActive).length;
  const inactiveCount = allDoctors.filter((d) => !d.isActive).length;
  const onlineCount  = allDoctors.filter((d) => d.isOnlineDoctor).length;
  const pagedDoctors = filtered.slice((page - 1) * limit, page * limit);
  const doctor      = allDoctors.find((d) => d.id === selected) ?? null;

  function handleSearch(q: string) { setQuery(q); setPage(1); }

  function handleToggle(d: Doctor) {
    toggleActive.mutate({ id: d.id, isActive: !d.isActive }, {
      onSuccess: () => toast(
        d.isActive ? t('تم تعطيل الطبيب', 'Doctor deactivated') : t('تم تفعيل الطبيب', 'Doctor activated'),
        'success',
      ),
      onError: () => toast(t('تعذّر تحديث الحالة. حاول مرة أخرى.', "Couldn't update status. Try again."), 'error'),
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
      onError: () => toast(t('تعذّر حذف الطبيب. حاول مرة أخرى.', "Couldn't delete doctor. Refresh and try again."), 'error'),
    });
  }

  const columns: Column<Doctor>[] = [
    {
      key: 'doctor',
      header: t('الطبيب', 'Doctor'),
      render: (d) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary-600 flex items-center justify-center text-sm font-bold flex-shrink-0 text-white">
            {(lang === 'ar' ? (d.nameAr ?? d.nameEn) : d.nameEn).charAt(0)}
          </div>
          <div>
            <p className="font-medium text-gray-900 dark:text-gray-100">{lang === 'ar' ? (d.nameAr ?? d.nameEn) : d.nameEn}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 font-mono" dir="ltr">{d.mobile}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'specialty',
      header: t('التخصص', 'Specialty'),
      render: (d) => {
        const spec = specialtyMap.get(d.specialtyId);
        return (
          <span className="text-gray-600 dark:text-gray-300">
            {spec ? (lang === 'ar' ? spec.nameAr : spec.nameEn) : `#${d.specialtyId}`}
            {d.isOnlineDoctor && (
              <Badge variant="info" className="ms-2 text-[10px]">{t('أونلاين', 'Online')}</Badge>
            )}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: t('الحالة', 'Status'),
      render: (d) => (
        <Badge variant={d.isActive ? 'success' : 'default'} dot>
          {d.isActive ? t('نشط', 'Active') : t('غير نشط', 'Inactive')}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (d) => (
        <ActionButtons
          onEdit={() => setEditDoctor(d)}
          onDelete={() => setDeleteTarget(d)}
          editTitle={t('تعديل', 'Edit doctor')}
          deleteTitle={t('حذف', 'Delete doctor')}
        />
      ),
    },
  ];

  return (
    <div className="space-y-5 max-w-7xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div className="animate-slide-down">
          <h2 className="text-2xl font-bold font-display text-gray-900 dark:text-gray-100">{t('الأطباء', 'Doctors')}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-1">
            <span>{activeCount}</span>
            <span>{t('طبيب نشط', 'active doctors')}</span>
          </p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5 animate-slide-down" style={{ animationDelay: '40ms' }}>
          <Stethoscope className="w-4 h-4" />
          {t('إضافة طبيب', 'Add Doctor')}
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={t('إجمالي الأطباء', 'Total Doctors')}
          value={isLoading ? '…' : allDoctors.length}
          icon={<Stethoscope className="w-5 h-5" />}
          color="blue"
          description={t('طبيب مسجل', 'registered')}
        />
        <StatCard
          title={t('نشط', 'Active')}
          value={isLoading ? '…' : activeCount}
          icon={<Users className="w-5 h-5" />}
          color="emerald"
          description={t('طبيب نشط', 'active doctors')}
        />
        <StatCard
          title={t('غير نشط', 'Inactive')}
          value={isLoading ? '…' : inactiveCount}
          icon={<PowerOff className="w-5 h-5" />}
          color="amber"
          description={t('في الاحتياط', 'on hold')}
        />
        <StatCard
          title={t('أونلاين', 'Online')}
          value={isLoading ? '…' : onlineCount}
          icon={<Wifi className="w-5 h-5" />}
          color="violet"
          description={t('طبيب أونلاين', 'online doctors')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className={selected ? 'lg:col-span-2' : 'lg:col-span-3'}>
          <Card>
            <div className="flex items-center gap-3 p-5 border-b border-gray-100 dark:border-neutral-700 flex-wrap">
              <div className="flex-1 min-w-48">
                <Input
                  placeholder={t('بحث بالاسم...', 'Search by name...')}
                  icon={<Search className="w-4 h-4" />}
                  value={query}
                  onChange={(e) => handleSearch(e.target.value)}
                  lang={lang}
                />
              </div>
              {(['all', 'active', 'online'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => { setStatusFilter(f); setPage(1); }}
                  className={`h-9 px-3.5 rounded-full text-xs font-medium border transition-all whitespace-nowrap ${
                    statusFilter === f
                      ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-700 text-primary-700 dark:text-primary-400'
                      : 'bg-white dark:bg-neutral-800 border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-neutral-600'
                  }`}
                >
                  {f === 'all' ? t('الكل', 'All') : f === 'active' ? t('نشط', 'Active') : t('أونلاين', 'Online')}
                </button>
              ))}
            </div>
            <CardContent className="p-0">
              <DataTable
                columns={columns}
                data={pagedDoctors}
                getRowKey={(d) => d.id}
                onRowClick={(d) => setSelected(selected === d.id ? null : d.id)}
                selectedKey={selected}
                loading={isLoading}
                error={isError}
                emptyMessage={t('لا يوجد أطباء يطابق البحث', 'No doctors match that search.')}
                onAddNew={() => setAddOpen(true)}
                addNewLabel={t('إضافة طبيب', 'Add Doctor')}
                errorMessage={t('تعذّر تحميل البيانات', 'Failed to load doctors')}
              />
              <Pagination
                page={page}
                total={filtered.length}
                limit={limit}
                onPageChange={setPage}
                onLimitChange={(l) => { setLimit(l); setPage(1); }}
                pageSizes={[10, 25, 50]}
              />
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
        loading={deleteDoctor.isLoading}
        title={t('حذف الطبيب', 'Delete Doctor')}
        message={
          deleteTarget
            ? t(
                `هل أنت متأكد من حذف د. ${deleteTarget.nameAr ?? deleteTarget.nameEn}؟ لا يمكن التراجع عن هذا الإجراء.`,
                `Delete Dr. ${deleteTarget.nameEn}? Their profile and schedule will be removed permanently.`,
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
            <div className="w-20 h-20 rounded-2xl bg-primary-600 flex items-center justify-center text-3xl font-bold text-white flex-shrink-0">
              {(lang === 'ar' ? (doctor.nameAr ?? doctor.nameEn) : doctor.nameEn).charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                {lang === 'ar' ? (doctor.nameAr ?? doctor.nameEn) : doctor.nameEn}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {spec ? (lang === 'ar' ? spec.nameAr : spec.nameEn) : `#${doctor.specialtyId}`}
              </p>
            </div>
            <Badge variant={doctor.isActive ? 'success' : 'default'} dot className="text-[10px] flex-shrink-0">
              {doctor.isActive ? t('نشط', 'Active') : t('غير نشط', 'Inactive')}
            </Badge>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={onEdit}>
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
              className="text-danger border-danger-100 hover:bg-danger-50 dark:hover:bg-red-950/30"
              onClick={onDelete}
            >
              {t('حذف', 'Del')}
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
                  <span className="text-gray-400 dark:text-gray-500">
                    {t('عيادة', 'Clinic')} {s.split.clinicPercentage}%
                  </span>
                </div>
              </div>
              <div className="h-2 bg-gray-100 dark:bg-neutral-700 rounded-full overflow-hidden">
                <div
                  className="h-full w-full bg-primary-600 origin-left transition-transform duration-500"
                  style={{ transform: `scaleX(${s.split.doctorPercentage / 100})` }}
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
              <span className="text-sm text-gray-500 dark:text-gray-400">{t('طريقة الدفع', 'Payment Method')}</span>
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
