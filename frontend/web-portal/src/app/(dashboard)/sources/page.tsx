'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Plus, Trash2, Edit3, Save, X, Share2, CheckCircle,
  AlertCircle, Loader2, Info, PlusCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/StatCard';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useLang } from '@/contexts/LanguageContext';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import {
  useSources, useCreateSource, useUpdateSource, useDeleteSource,
  type SourceFeeRule, type CreateSourceInput, type SpecialtyRate,
} from '@/hooks/useSources';
import { useSpecialties } from '@/hooks/useDoctors';

// ─── Schema ──────────────────────────────────────────────────────────────────

const specialtyRateSchema = z.object({
  specialtyId: z.number().int().positive(),
  feeValue: z.coerce.number().min(0, 'Must be ≥ 0'),
});

const sourceSchema = z.object({
  sourceCode:     z.string().min(1, 'Required').max(50).regex(/^[\w.'/-]+$/, 'No spaces — use letters, numbers, dots or hyphens'),
  sourceNameEn:   z.string().min(1, 'Required').max(100),
  sourceNameAr:   z.string().min(1, 'Required').max(100),
  feeType:        z.enum(['percentage', 'fixed']),
  feeValue:       z.coerce.number().min(0, 'Must be ≥ 0'),
  deductFrom:     z.enum(['clinic', 'doctor', 'both']),
  isGeneral:      z.boolean(),
  isActive:       z.boolean(),
  validFrom:      z.string().min(1, 'Required'),
  validUntil:     z.string().optional(),
  specialtyRates: z.array(specialtyRateSchema).optional(),
});
type SourceFormValues = z.infer<typeof sourceSchema>;

// ─── Helper constants ─────────────────────────────────────────────────────────

const DEDUCT_LABELS: Record<string, { ar: string; en: string }> = {
  clinic: { ar: 'من العيادة', en: 'Clinic pays' },
  doctor: { ar: 'من الطبيب',  en: 'Doctor pays' },
  both:   { ar: 'مشترك',      en: 'Shared' },
};

const DEDUCT_VARIANT: Record<string, 'default' | 'warning' | 'info'> = {
  clinic: 'default',
  doctor: 'warning',
  both:   'info',
};

// ─── Add / Edit Modal ─────────────────────────────────────────────────────────

function SourceModal({
  initial,
  onClose,
}: {
  initial: SourceFeeRule | null;
  onClose: () => void;
}) {
  const { lang, t } = useLang();
  const { toast }   = useToast();
  const create = useCreateSource();
  const update = useUpdateSource();
  const isEdit = !!initial;

  const { data: specialties = [] } = useSpecialties();

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<SourceFormValues>({
    resolver: zodResolver(sourceSchema),
    defaultValues: {
      sourceCode:     initial?.sourceCode     ?? '',
      sourceNameEn:   initial?.sourceNameEn   ?? '',
      sourceNameAr:   initial?.sourceNameAr   ?? '',
      feeType:        initial?.feeType        ?? 'percentage',
      feeValue:       initial?.feeValue       ?? 0,
      deductFrom:     initial?.deductFrom     ?? 'clinic',
      isGeneral:      initial?.isGeneral      ?? true,
      isActive:       initial?.isActive       ?? true,
      validFrom:      initial?.validFrom      ?? new Date().toISOString().split('T')[0],
      validUntil:     initial?.validUntil     ?? '',
      specialtyRates: initial?.specialtyRates ?? [],
    },
  });

  const feeType        = watch('feeType');
  const isGeneral      = watch('isGeneral');
  const specialtyRates = watch('specialtyRates') ?? [];

  function addSpecialtyRow() {
    const usedIds = new Set(specialtyRates.map((r) => r.specialtyId));
    const nextSpecialty = specialties.find((s) => !usedIds.has(s.id));
    if (!nextSpecialty) return;
    setValue('specialtyRates', [...specialtyRates, { specialtyId: nextSpecialty.id, feeValue: 0 }]);
  }

  function removeSpecialtyRow(idx: number) {
    setValue('specialtyRates', specialtyRates.filter((_, i) => i !== idx));
  }

  function updateSpecialtyRow(idx: number, field: keyof SpecialtyRate, value: number) {
    const next = specialtyRates.map((r, i) => i === idx ? { ...r, [field]: value } : r);
    setValue('specialtyRates', next);
  }

  async function onSubmit(values: SourceFormValues) {
    const payload: CreateSourceInput = {
      ...values,
      feeValue:       Number(values.feeValue),
      validUntil:     values.validUntil || undefined,
      specialtyRates: values.isGeneral ? [] : (values.specialtyRates ?? []),
    };
    try {
      if (isEdit) {
        await update.mutateAsync({ code: initial!.sourceCode, ...payload });
        toast(t('تم تحديث المصدر', 'Source updated'), 'success');
      } else {
        await create.mutateAsync(payload);
        toast(t('تمت إضافة المصدر', 'Source added'), 'success');
      }
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      toast(msg ?? t('تعذّر الحفظ. حاول مرة أخرى.', "Couldn't save source. Try again."), 'error');
    }
  }

  function Field({ id, labelAr, labelEn, type = 'text', readOnly = false }: {
    id: keyof SourceFormValues; labelAr: string; labelEn: string; type?: string; readOnly?: boolean;
  }) {
    return (
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {lang === 'ar' ? labelAr : labelEn}
        </label>
        <input
          type={type}
          readOnly={readOnly}
          {...register(id)}
          className={cn(
            'w-full h-10 rounded-lg border px-3 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary-600',
            'bg-white dark:bg-neutral-800 text-gray-900 dark:text-gray-100',
            'border-gray-200 dark:border-neutral-600',
            readOnly && 'bg-gray-50 dark:bg-neutral-900 cursor-not-allowed',
            errors[id] && 'border-red-400',
          )}
        />
        {errors[id] && <p className="text-xs text-red-500">{errors[id]?.message as string}</p>}
      </div>
    );
  }

  const usedSpecialtyIds = new Set(specialtyRates.map((r) => r.specialtyId));
  const canAddMore = specialties.some((s) => !usedSpecialtyIds.has(s.id));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-neutral-700">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
            {isEdit ? t('تعديل مصدر', 'Edit Source') : t('إضافة مصدر جديد', 'Add New Source')}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Code */}
          <Field id="sourceCode" labelAr="كود المصدر" labelEn="Source Code" readOnly={isEdit} />

          {/* Names */}
          <div className="grid grid-cols-2 gap-3">
            <Field id="sourceNameEn" labelAr="الاسم بالإنجليزية" labelEn="Name (EN)" />
            <Field id="sourceNameAr" labelAr="الاسم بالعربية"    labelEn="Name (AR)" />
          </div>

          {/* Fee type + value */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('نوع الرسوم', 'Fee Type')}
              </label>
              <select
                {...register('feeType')}
                className="w-full h-10 rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-600"
              >
                <option value="percentage">{t('نسبة مئوية', 'Percentage %')}</option>
                <option value="fixed">{t('مبلغ ثابت', 'Fixed Amount')}</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {feeType === 'percentage' ? t('النسبة الافتراضية %', 'Default Rate %') : t('المبلغ EGP', 'Amount EGP')}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                {...register('feeValue')}
                className={cn(
                  'w-full h-10 rounded-lg border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600',
                  'bg-white dark:bg-neutral-800 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-neutral-600',
                  errors.feeValue && 'border-red-400',
                )}
              />
              {errors.feeValue && <p className="text-xs text-red-500">{errors.feeValue.message}</p>}
            </div>
          </div>

          {/* General rate toggle */}
          {feeType === 'percentage' && (
            <label className="flex items-center gap-3 cursor-pointer px-3 py-2.5 rounded-lg border border-gray-200 dark:border-neutral-600 hover:border-primary-400/50 transition-colors">
              <input
                type="checkbox"
                {...register('isGeneral')}
                className="w-4 h-4 accent-primary-600 rounded flex-shrink-0"
              />
              <div>
                <p className="text-sm text-gray-700 dark:text-gray-200">
                  {t('نسبة موحدة لجميع التخصصات', 'General rate (all specialties)')}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {t('إلغاء التحديد يتيح تحديد نسب مختلفة لكل تخصص', 'Uncheck to set per-specialty rates')}
                </p>
              </div>
            </label>
          )}

          {/* Per-specialty rates section */}
          {feeType === 'percentage' && !isGeneral && (
            <div className="space-y-2 animate-slide-down">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('نسب التخصصات', 'Specialty Rates')}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {t('التخصصات غير المُدرجة تستخدم النسبة الافتراضية', 'Unlisted specialties use the default rate')}
                </p>
              </div>

              {specialtyRates.length > 0 && (
                <div className="space-y-2">
                  {specialtyRates.map((row, idx) => {
                    const otherUsed = new Set(specialtyRates.filter((_, i) => i !== idx).map((r) => r.specialtyId));
                    return (
                      <div key={idx} className="flex items-center gap-2">
                        <select
                          value={row.specialtyId}
                          onChange={(e) => updateSpecialtyRow(idx, 'specialtyId', Number(e.target.value))}
                          className="flex-1 h-9 rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-600"
                        >
                          {specialties
                            .filter((s) => !otherUsed.has(s.id))
                            .map((s) => (
                              <option key={s.id} value={s.id}>{s.nameEn}</option>
                            ))
                          }
                        </select>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={row.feeValue}
                          onChange={(e) => updateSpecialtyRow(idx, 'feeValue', Number(e.target.value))}
                          placeholder="0"
                          className="w-24 h-9 rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-600 tabular-nums"
                        />
                        <span className="text-sm text-gray-400">%</span>
                        <button
                          type="button"
                          onClick={() => removeSpecialtyRow(idx)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex-shrink-0"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {canAddMore && (
                <button
                  type="button"
                  onClick={addSpecialtyRow}
                  className="flex items-center gap-1.5 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
                >
                  <PlusCircle className="w-4 h-4" />
                  {t('إضافة تخصص', 'Add Specialty')}
                </button>
              )}

              {specialtyRates.length === 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-500 italic">
                  {t('لم تُضف تخصصات بعد؛ ستُطبّق النسبة الافتراضية على الجميع', 'No specialties added; the default rate applies to all procedures.')}
                </p>
              )}
            </div>
          )}

          {/* Deduct from */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('تُخصم من', 'Deduct From')}
            </label>
            <select
              {...register('deductFrom')}
              className="w-full h-10 rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-600"
            >
              <option value="clinic">{t('العيادة', 'Clinic')}</option>
              <option value="doctor">{t('الطبيب',  'Doctor')}</option>
              <option value="both">{t('مشترك',    'Both')}</option>
            </select>
          </div>

          {/* Valid from / until */}
          <div className="grid grid-cols-2 gap-3">
            <Field id="validFrom"  labelAr="صالح من"  labelEn="Valid From"  type="date" />
            <Field id="validUntil" labelAr="صالح حتى" labelEn="Valid Until" type="date" />
          </div>

          {/* Active toggle */}
          <label className="flex items-center gap-3 cursor-pointer pt-1">
            <input type="checkbox" {...register('isActive')} className="w-4 h-4 accent-primary-600 rounded" />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {t('مصدر نشط (يظهر في الاختيارات)', 'Active (appears in dropdowns)')}
            </span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              {t('إلغاء', 'Cancel')}
            </Button>
            <Button type="submit" size="sm" loading={isSubmitting}>
              <Save className="w-4 h-4" />
              {isEdit ? t('حفظ التغييرات', 'Save Changes') : t('إضافة المصدر', 'Add Source')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Source row ───────────────────────────────────────────────────────────────

function SourceRow({
  source,
  lang,
  t,
  onEdit,
  onDelete,
}: {
  source: SourceFeeRule;
  lang: 'ar' | 'en';
  t: (ar: string, en: string) => string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const hasSpecialtyRates = !source.isGeneral && source.specialtyRates.length > 0;

  const deduct = DEDUCT_LABELS[source.deductFrom];
  const deductVariant = DEDUCT_VARIANT[source.deductFrom];

  return (
    <tr>
      <td>
        <span className="font-mono text-xs font-bold text-primary-700 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 px-2 py-0.5 rounded">
          {source.sourceCode}
        </span>
      </td>
      <td>
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{source.sourceNameEn}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500">{source.sourceNameAr}</p>
      </td>
      <td>
        <div className="flex items-center gap-1.5">
          <span className={cn(
            'text-sm font-semibold tabular-nums',
            source.feeValue === 0 ? 'text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-100',
          )}>
            {source.feeType === 'percentage' ? `${source.feeValue}%` : `${source.feeValue} EGP`}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {source.feeType === 'percentage' ? t('افتراضي', 'default') : t('ثابت', 'flat')}
          </span>
          {hasSpecialtyRates && (
            <span
              title={source.specialtyRates.map((r) => `#${r.specialtyId}: ${r.feeValue}%`).join('\n')}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 border border-violet-200/50 dark:border-violet-700/50 cursor-default"
            >
              {source.specialtyRates.length} {t('تخصص', 'spec')}
            </span>
          )}
        </div>
      </td>
      <td>
        <Badge variant={deductVariant} className="text-[11px]">
          {lang === 'ar' ? deduct.ar : deduct.en}
        </Badge>
      </td>
      <td>
        {source.isActive ? (
          <Badge variant="success" dot className="text-[11px]">{t('نشط', 'Active')}</Badge>
        ) : (
          <Badge variant="outline" className="text-[11px]">{t('معطّل', 'Inactive')}</Badge>
        )}
      </td>
      <td className="text-xs text-gray-500 dark:text-gray-400 font-mono">
        {source.validFrom}
        {source.validUntil && (
          <span className="text-gray-300 dark:text-gray-600"> → {source.validUntil}</span>
        )}
      </td>
      <td>
        <div className="fc-row-actions">
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
            title={t('تعديل', 'Edit')}
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            title={t('حذف', 'Delete')}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SourcesPage() {
  const { lang, t } = useLang();
  const { toast }   = useToast();

  const { data: sources = [], isLoading, isError } = useSources();
  const deleteSource = useDeleteSource();

  const [modalSource, setModalSource] = useState<SourceFeeRule | null | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<SourceFeeRule | null>(null);

  const activeCount      = sources.filter((s) => s.isActive).length;
  const feeCount         = sources.filter((s) => s.feeValue > 0).length;
  const specialtyCount   = sources.filter((s) => !s.isGeneral && s.specialtyRates.length > 0).length;

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteSource.mutateAsync(deleteTarget.sourceCode);
      toast(t('تم حذف المصدر', 'Source deleted'), 'success');
    } catch {
      toast(t('تعذّر الحذف. حاول مرة أخرى.', "Couldn't delete source. Try again."), 'error');
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <div className="fc-page">
      {/* Page header */}
      <div className="fc-page-head">
        <div>
          <h2 className="fc-page-title">{t('مصادر المرضى', 'Patient Sources')}</h2>
          <p className="fc-page-sub">{t('إدارة مصادر الإحالة ورسوم المنصات', 'Manage referral sources and platform fee rules')}</p>
        </div>
        <div className="fc-page-actions">
          <Button size="sm" onClick={() => setModalSource(null)}>
            <Plus className="w-4 h-4" />
            {t('إضافة مصدر', 'Add Source')}
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          title={t('إجمالي المصادر', 'Total Sources')}
          value={String(sources.length)}
          icon={<Share2 className="w-5 h-5" />}
          color="blue"
        />
        <StatCard
          title={t('مصادر نشطة', 'Active')}
          value={String(activeCount)}
          icon={<CheckCircle className="w-5 h-5" />}
          color="emerald"
        />
        <StatCard
          title={t('لها رسوم', 'With Fees')}
          value={String(feeCount)}
          icon={<AlertCircle className="w-5 h-5" />}
          color="amber"
        />
        <StatCard
          title={t('نسب متخصصة', 'Specialty Rates')}
          value={String(specialtyCount)}
          icon={<Info className="w-5 h-5" />}
          color="violet"
          description={t('مصادر لها نسب حسب التخصص', 'sources with per-specialty rates')}
        />
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-3 text-sm text-blue-800 dark:text-blue-300">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>
          {t(
            'كود المصدر يُستخدم في المواعيد والفواتير لحساب رسوم المنصة تلقائياً. يمكن تحديد نسب مختلفة لكل تخصص؛ التخصصات غير المُدرجة تستخدم النسبة الافتراضية.',
            'Source code is used in appointments and billing to auto-calculate platform fees. Per-specialty rates override the default; unlisted specialties use the default rate.',
          )}
        </span>
      </div>

      {/* Table */}
      <div className="fc-card">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 dark:border-neutral-700">
          <Share2 className="w-4 h-4 text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {t('قائمة المصادر', 'Sources List')}
          </h3>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin me-2" />
            {t('جاري التحميل...', 'Loading...')}
          </div>
        ) : isError ? (
          <div className="py-12 text-center text-red-500 dark:text-red-400 text-sm">
            {t('تعذّر تحميل المصادر', 'Failed to load sources')}
          </div>
        ) : sources.length === 0 ? (
          <div className="py-16 text-center">
            <Share2 className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('لا توجد مصادر بعد', 'No sources yet')}</p>
            <button
              onClick={() => setModalSource(null)}
              className="mt-2 text-sm text-primary-600 dark:text-primary-400 hover:underline"
            >
              {t('+ إضافة أول مصدر', '+ Add first source')}
            </button>
          </div>
        ) : (
          <div className="fc-table-wrap">
            <table className="fc-table">
              <thead>
                <tr>
                  {[
                    t('الكود', 'Code'),
                    t('الاسم', 'Name'),
                    t('الرسوم', 'Fee'),
                    t('تُخصم من', 'Deducted From'),
                    t('الحالة', 'Status'),
                    t('الفترة', 'Period'),
                    '',
                  ].map((label, i) => (
                    <th key={i}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => (
                  <SourceRow
                    key={s.sourceCode}
                    source={s}
                    lang={lang}
                    t={t}
                    onEdit={() => setModalSource(s)}
                    onDelete={() => setDeleteTarget(s)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit modal */}
      {modalSource !== undefined && (
        <SourceModal initial={modalSource} onClose={() => setModalSource(undefined)} />
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        title={t('حذف المصدر', 'Delete Source')}
        message={t(
          `هل تريد حذف المصدر "${deleteTarget?.sourceCode}"؟ لن يمكن التراجع عن هذا الإجراء.`,
          `Delete source "${deleteTarget?.sourceCode}"? This cannot be undone.`,
        )}
        confirmLabel={t('حذف', 'Delete')}
        loading={deleteSource.isPending}
        onConfirm={() => void handleDelete()}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
