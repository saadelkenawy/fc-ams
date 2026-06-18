'use client';
import { CTable, CTableHead, CTableBody, CTableRow, CTableHeaderCell, CTableDataCell } from '@coreui/react';

import { useState } from 'react';
import { Search, Filter, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, ClipboardList, CheckCircle, DollarSign, Clock, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatCard } from '@/components/ui/StatCard';
import {
  useProcedures,
  useCreateProcedure,
  useUpdateProcedure,
  useDeleteProcedure,
  type Procedure,
  type ProcedurePayload,
} from '@/hooks/useProcedures';
import { useDebounce } from '@/hooks/useDebounce';
import { useLang } from '@/contexts/LanguageContext';
import { useTranslateName } from '@/hooks/useTranslateName';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency } from '@/lib/utils';
import { Pagination } from '@/components/ui/Pagination';

const PROCEDURE_TYPES = ['all', 'consultation', 'follow_up', 'operative', 'lab_test', 'imaging', 'settling_fee'] as const;
type ProcedureTypeFilter = typeof PROCEDURE_TYPES[number];

const PROC_TYPES_SELECTABLE = ['consultation', 'follow_up', 'operative', 'settling_fee', 'lab_test', 'imaging'] as const;

const TYPE_LABELS: Record<string, { ar: string; en: string }> = {
  consultation: { ar: 'كشف',        en: 'Consultation' },
  follow_up:    { ar: 'متابعة',     en: 'Follow-up' },
  operative:    { ar: 'جراحة',      en: 'Operative' },
  settling_fee: { ar: 'رسوم تسوية', en: 'Settling Fee' },
  lab_test:     { ar: 'تحليل',      en: 'Lab Test' },
  imaging:      { ar: 'أشعة',       en: 'Imaging' },
};

type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'outline';

const TYPE_BADGE: Record<string, BadgeVariant> = {
  consultation: 'info',
  follow_up:    'outline',
  operative:    'purple',
  lab_test:     'warning',
  imaging:      'success',
  settling_fee: 'default',
};

const PAGE_SIZE = 20;

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

const EMPTY_FORM: ProcedurePayload = {
  code: '',
  nameEn: '',
  nameAr: '',
  procedureType: 'consultation',
  specialtyId: 1,
  basePrice: 0,
  durationMinutes: 30,
  requiresPreAuth: false,
  isActive: true,
};

interface ProcedureFormProps {
  value: ProcedurePayload;
  onChange: (v: ProcedurePayload) => void;
  t: (ar: string, en: string) => string;
}

function ProcedureForm({ value, onChange, t }: ProcedureFormProps) {
  const { lang } = useLang();
  const { translate, translating } = useTranslateName();

  function set<K extends keyof ProcedurePayload>(key: K, val: ProcedurePayload[K]) {
    onChange({ ...value, [key]: val });
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('الكود', 'Code')} *</label>
        <Input value={value.code} onChange={(e) => set('code', e.target.value)} placeholder="e.g. CONS-001" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('النوع', 'Type')} *</label>
        <select
          value={value.procedureType}
          onChange={(e) => set('procedureType', e.target.value as ProcedurePayload['procedureType'])}
          className="w-full rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm px-3 py-2 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-600"
        >
          {PROC_TYPES_SELECTABLE.map((type) => (
            <option key={type} value={type}>{TYPE_LABELS[type].en}</option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2 relative">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('الاسم (إنجليزي)', 'Name (English)')} *</label>
        <Input
          value={value.nameEn}
          className={translating === 'en' ? 'pe-8' : ''}
          onChange={(e) => set('nameEn', e.target.value)}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (lang === 'en' && v && !(value.nameAr ?? '').trim()) {
              translate(v, 'en').then((r) => { if (r) onChange({ ...value, nameAr: r }); });
            }
          }}
          placeholder="Procedure name in English"
        />
        {translating === 'en' && <Loader2 className="absolute bottom-3.5 end-2.5 w-4 h-4 text-primary-500 animate-spin pointer-events-none" />}
      </div>
      <div className="sm:col-span-2 relative">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('الاسم (عربي)', 'Name (Arabic)')}</label>
        <Input
          value={value.nameAr ?? ''}
          className={translating === 'ar' ? 'pe-8' : ''}
          onChange={(e) => set('nameAr', e.target.value)}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (lang === 'ar' && v && !value.nameEn.trim()) {
              translate(v, 'ar').then((r) => { if (r) onChange({ ...value, nameEn: r }); });
            }
          }}
          placeholder="اسم الإجراء بالعربي"
          dir="rtl"
        />
        {translating === 'ar' && <Loader2 className="absolute bottom-3.5 end-2.5 w-4 h-4 text-primary-500 animate-spin pointer-events-none" />}
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('السعر الأساسي (EGP)', 'Base Price (EGP)')} *</label>
        <Input
          type="number"
          min={0}
          value={value.basePrice}
          onChange={(e) => set('basePrice', Number(e.target.value))}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('المدة (دقيقة)', 'Duration (min)')} *</label>
        <Input
          type="number"
          min={1}
          value={value.durationMinutes}
          onChange={(e) => set('durationMinutes', Number(e.target.value))}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('رقم التخصص', 'Specialty ID')} *</label>
        <Input
          type="number"
          min={1}
          value={value.specialtyId}
          onChange={(e) => set('specialtyId', Number(e.target.value))}
        />
      </div>
      <div className="flex flex-col justify-end gap-3">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={value.requiresPreAuth}
            onChange={(e) => set('requiresPreAuth', e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">{t('يتطلب موافقة مسبقة', 'Requires Pre-Auth')}</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={value.isActive}
            onChange={(e) => set('isActive', e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">{t('نشط', 'Active')}</span>
        </label>
      </div>
    </div>
  );
}

export default function ProceduresPage() {
  const { lang, t } = useLang();
  const locale = lang === 'ar' ? 'ar-EG' : 'en-US';
  const { toast } = useToast();

  const [searchQuery, setSearchQuery]   = useState('');
  const debouncedQuery                   = useDebounce(searchQuery, 400);
  const [typeFilter, setTypeFilter]     = useState<ProcedureTypeFilter>('all');
  const [showInactive, setShowInactive] = useState(false);
  const [page, setPage]                 = useState(1);
  const [limit, setLimit]               = useState(PAGE_SIZE);

  const [modalOpen, setModalOpen]       = useState(false);
  const [editTarget, setEditTarget]     = useState<Procedure | null>(null);
  const [formData, setFormData]         = useState<ProcedurePayload>(EMPTY_FORM);

  const [deleteTarget, setDeleteTarget] = useState<Procedure | null>(null);

  const { data, isLoading } = useProcedures({
    q:             debouncedQuery || undefined,
    procedureType: typeFilter === 'all' ? undefined : typeFilter,
    isActive:      showInactive ? undefined : true,
    page,
    limit,
  });

  const { data: allData }       = useProcedures({ limit: 1 });
  const { data: activeData }    = useProcedures({ isActive: true, limit: 1 });

  const createProcedure = useCreateProcedure();
  const updateProcedure = useUpdateProcedure();
  const deleteProcedure = useDeleteProcedure();

  const procedures    = data?.data ?? [];
  const total         = data?.total ?? 0;
  const totalAll      = allData?.total ?? total;
  const activeTotal   = activeData?.total ?? 0;
  const avgPrice      = procedures.length > 0
    ? Math.round(procedures.reduce((s, p) => s + p.basePrice, 0) / procedures.length)
    : 0;
  const avgDuration   = procedures.length > 0
    ? Math.round(procedures.reduce((s, p) => s + p.durationMinutes, 0) / procedures.length)
    : 0;

  function openAddModal() {
    setEditTarget(null);
    setFormData(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEditModal(proc: Procedure) {
    setEditTarget(proc);
    setFormData({
      code:             proc.code,
      nameEn:           proc.nameEn,
      nameAr:           proc.nameAr ?? '',
      procedureType:    proc.procedureType,
      specialtyId:      proc.specialtyId,
      basePrice:        proc.basePrice,
      durationMinutes:  proc.durationMinutes,
      requiresPreAuth:  proc.requiresPreAuth,
      isActive:         proc.isActive,
    });
    setModalOpen(true);
  }

  async function handleSubmit() {
    if (!formData.code.trim() || !formData.nameEn.trim()) {
      toast(t('أضف اسمًا ورمزًا للإجراء للمتابعة', 'Add a name and code to continue.'), 'error');
      return;
    }
    try {
      if (editTarget) {
        await updateProcedure.mutateAsync({ id: editTarget.id, ...formData });
        toast(t('تم تحديث الإجراء', 'Procedure updated'), 'success');
      } else {
        await createProcedure.mutateAsync(formData);
        toast(t('تم إضافة الإجراء', 'Procedure added'), 'success');
      }
      setModalOpen(false);
    } catch {
      toast(t('تعذّر الحفظ. حاول مرة أخرى.', "Couldn't save. Try again."), 'error');
    }
  }

  async function handleToggleStatus(proc: Procedure) {
    try {
      await updateProcedure.mutateAsync({ id: proc.id, isActive: !proc.isActive });
      toast(
        proc.isActive
          ? t('تم تعطيل الإجراء', 'Procedure deactivated')
          : t('تم تفعيل الإجراء', 'Procedure activated'),
        'success',
      );
    } catch {
      toast(t('تعذّر تحديث الحالة. حاول مرة أخرى.', "Couldn't update status. Try again."), 'error');
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteProcedure.mutateAsync(deleteTarget.id);
      toast(t('تم حذف الإجراء', 'Procedure deleted'), 'success');
      setDeleteTarget(null);
    } catch {
      toast(t('تعذّر الحذف. حاول مرة أخرى.', "Couldn't delete. Try again."), 'error');
    }
  }

  function handleTypeChange(type: ProcedureTypeFilter) { setTypeFilter(type); setPage(1); }
  function handleSearch(q: string) { setSearchQuery(q); setPage(1); }

  const isSaving = createProcedure.isPending || updateProcedure.isPending;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold font-display text-gray-900 dark:text-gray-100">
            {t('الإجراءات الطبية', 'Medical Procedures')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {t('كتالوج الإجراءات والخدمات', 'Procedures & Services Catalogue')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-56">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              className="ps-9"
              placeholder={t('ابحث عن إجراء...', 'Search procedures...')}
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>
          <Button onClick={openAddModal} size="sm" className="gap-1.5 flex-shrink-0">
            <Plus className="w-4 h-4" />
            {t('إجراء جديد', 'New Procedure')}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={t('الإجمالي', 'Total')}
          value={totalAll}
          color="blue"
          icon={<ClipboardList className="w-5 h-5" />}
          description={t('إجراء', 'procedures')}
        />
        <StatCard
          title={t('نشط', 'Active')}
          value={activeTotal}
          color="emerald"
          icon={<CheckCircle className="w-5 h-5" />}
          description={t('متاح', 'available')}
        />
        <StatCard
          title={t('متوسط السعر', 'Avg. Price')}
          value={`EGP ${avgPrice.toLocaleString()}`}
          color="amber"
          icon={<DollarSign className="w-5 h-5" />}
          description={t('لكل إجراء', 'per procedure')}
        />
        <StatCard
          title={t('متوسط المدة', 'Avg. Duration')}
          value={`${avgDuration}m`}
          color="violet"
          icon={<Clock className="w-5 h-5" />}
          description={t('دقيقة', 'minutes')}
        />
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 bg-gray-100 dark:bg-neutral-800 rounded-lg p-1 flex-wrap">
          {PROCEDURE_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => handleTypeChange(type)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                typeFilter === type
                  ? 'bg-white dark:bg-neutral-700 text-primary-700 dark:text-primary-300 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {type === 'all'
                ? t('الكل', 'All')
                : t(TYPE_LABELS[type].ar, TYPE_LABELS[type].en)}
            </button>
          ))}
        </div>

        <button
          onClick={() => { setShowInactive((p) => !p); setPage(1); }}
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border transition-all ${
            showInactive
              ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300'
              : 'border-gray-200 dark:border-neutral-600 text-gray-500 dark:text-gray-400 hover:border-gray-300'
          }`}
        >
          <Filter className="w-3.5 h-3.5" />
          {t('إظهار غير النشطة', 'Show inactive')}
        </button>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t('قائمة الإجراءات', 'Procedures List')}</CardTitle>
          {!isLoading && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {t(`${total} إجراء`, `${total} procedures`)}
            </span>
          )}
        </CardHeader>
        <CardContent className="p-0 mt-4">
          <CTable className="w-full text-sm">
            <CTableHead>
              <CTableRow className="border-b border-gray-100 dark:border-neutral-700 bg-gray-50/50 dark:bg-neutral-800/50">
                <CTableHeaderCell className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs">{t('الكود', 'Code')}</CTableHeaderCell>
                <CTableHeaderCell className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs">{t('الاسم', 'Name')}</CTableHeaderCell>
                <CTableHeaderCell className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs">{t('النوع', 'Type')}</CTableHeaderCell>
                <CTableHeaderCell className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs">{t('السعر', 'Price')}</CTableHeaderCell>
                <CTableHeaderCell className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs hidden md:table-cell">{t('المدة', 'Duration')}</CTableHeaderCell>
                <CTableHeaderCell className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs hidden lg:table-cell">{t('يتطلب موافقة', 'Auth Req.')}</CTableHeaderCell>
                <CTableHeaderCell className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs">{t('الحالة', 'Status')}</CTableHeaderCell>
                <CTableHeaderCell className="text-end px-5 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs">{t('إجراءات', 'Actions')}</CTableHeaderCell>
              </CTableRow>
            </CTableHead>
            <CTableBody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <CTableRow key={i} className="border-b border-gray-50 dark:border-neutral-700/50">
                      <CTableDataCell colSpan={8} className="px-5 py-3">
                        <div className="animate-pulse bg-gray-200 dark:bg-neutral-700 rounded h-5" />
                      </CTableDataCell>
                    </CTableRow>
                  ))
                : procedures.length === 0
                ? (
                    <CTableRow>
                      <CTableDataCell colSpan={8} className="px-5 py-12 text-center text-gray-400 dark:text-gray-500">
                        {t('لا توجد إجراءات', 'No procedures found')}
                      </CTableDataCell>
                    </CTableRow>
                  )
                : procedures.map((proc: Procedure) => (
                    <CTableRow key={proc.id} className="border-b border-gray-50 dark:border-neutral-700/50 hover:bg-gray-50/50 dark:hover:bg-neutral-700/30 transition-colors">
                      <CTableDataCell className="px-5 py-3.5 font-mono text-xs text-gray-600 dark:text-gray-400">
                        {proc.code}
                      </CTableDataCell>
                      <CTableDataCell className="px-5 py-3.5 font-medium text-gray-900 dark:text-gray-100">
                        {lang === 'ar' && proc.nameAr ? proc.nameAr : proc.nameEn}
                      </CTableDataCell>
                      <CTableDataCell className="px-5 py-3.5">
                        <Badge variant={TYPE_BADGE[proc.procedureType] ?? 'default'}>
                          {t(
                            TYPE_LABELS[proc.procedureType]?.ar ?? proc.procedureType,
                            TYPE_LABELS[proc.procedureType]?.en ?? proc.procedureType,
                          )}
                        </Badge>
                      </CTableDataCell>
                      <CTableDataCell className="px-5 py-3.5 font-mono tabular-nums text-gray-700 dark:text-gray-300">
                        {formatCurrency(proc.basePrice, 'EGP', locale)}
                      </CTableDataCell>
                      <CTableDataCell className="px-5 py-3.5 text-gray-600 dark:text-gray-400 hidden md:table-cell">
                        {formatDuration(proc.durationMinutes)}
                      </CTableDataCell>
                      <CTableDataCell className="px-5 py-3.5 hidden lg:table-cell">
                        {proc.requiresPreAuth
                          ? <Badge variant="warning">{t('نعم', 'Yes')}</Badge>
                          : <Badge variant="default">{t('لا', 'No')}</Badge>}
                      </CTableDataCell>
                      <CTableDataCell className="px-5 py-3.5">
                        <button
                          onClick={() => handleToggleStatus(proc)}
                          className="flex items-center gap-1.5 group"
                          title={proc.isActive ? t('تعطيل', 'Deactivate') : t('تفعيل', 'Activate')}
                        >
                          {proc.isActive
                            ? <ToggleRight className="w-5 h-5 text-emerald-500 group-hover:text-emerald-600" />
                            : <ToggleLeft className="w-5 h-5 text-gray-400 group-hover:text-gray-500" />}
                          <span className={`text-xs font-medium ${proc.isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'}`}>
                            {proc.isActive ? t('نشط', 'Active') : t('غير نشط', 'Inactive')}
                          </span>
                        </button>
                      </CTableDataCell>
                      <CTableDataCell className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEditModal(proc)}
                            className="p-1.5 rounded-md text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
                            title={t('تعديل', 'Edit')}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(proc)}
                            className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            title={t('حذف', 'Delete')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </CTableDataCell>
                    </CTableRow>
                  ))}
            </CTableBody>
          </CTable>

          {!isLoading && total > 0 && (
            <Pagination
              page={page}
              total={total}
              limit={limit}
              onPageChange={setPage}
              onLimitChange={(l) => { setLimit(l); setPage(1); }}
              pageSizes={[10, 20, 50]}
            />
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editTarget ? t('تعديل الإجراء', 'Edit Procedure') : t('إجراء جديد', 'New Procedure')}
        subtitle={editTarget ? editTarget.nameEn : t('أضف إجراءً طبياً جديداً', 'Add a new medical procedure')}
        maxWidth="lg"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setModalOpen(false)} disabled={isSaving}>
              {t('إلغاء', 'Cancel')}
            </Button>
            <Button size="sm" onClick={() => handleSubmit()} disabled={isSaving} className="min-w-[100px]">
              {isSaving
                ? t('جارٍ الحفظ...', 'Saving...')
                : editTarget
                  ? t('حفظ التعديلات', 'Save Changes')
                  : t('إضافة', 'Add Procedure')}
            </Button>
          </>
        }
      >
        <ProcedureForm value={formData} onChange={setFormData} t={t} />
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => handleDelete()}
        title={t('حذف الإجراء', 'Delete Procedure')}
        message={
          deleteTarget
            ? t(
                `هل أنت متأكد من حذف الإجراء "${deleteTarget.nameEn}"؟ لا يمكن التراجع عن هذا الإجراء.`,
                `Are you sure you want to delete "${deleteTarget.nameEn}"? This action cannot be undone.`,
              )
            : ''
        }
        confirmLabel={t('حذف', 'Delete')}
        loading={deleteProcedure.isPending}
      />
    </div>
  );
}
