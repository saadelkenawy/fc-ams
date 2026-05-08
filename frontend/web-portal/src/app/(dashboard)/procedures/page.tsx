'use client';

import { useState } from 'react';
import { Search, Filter } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { useProcedures, type Procedure } from '@/hooks/useProcedures';
import { useDebounce } from '@/hooks/useDebounce';
import { useLang } from '@/contexts/LanguageContext';
import { formatCurrency } from '@/lib/utils';
import type { VariantProps } from 'class-variance-authority';

const PROCEDURE_TYPES = ['all', 'consultation', 'follow_up', 'operative', 'lab_test', 'imaging', 'settling_fee'] as const;
type ProcedureTypeFilter = typeof PROCEDURE_TYPES[number];

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

export default function ProceduresPage() {
  const { lang, t } = useLang();
  const locale = lang === 'ar' ? 'ar-EG' : 'en-US';

  const [searchQuery, setSearchQuery] = useState('');
  const debouncedQuery = useDebounce(searchQuery, 400);
  const [typeFilter, setTypeFilter] = useState<ProcedureTypeFilter>('all');
  const [showInactive, setShowInactive] = useState(false);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useProcedures({
    q:             debouncedQuery || undefined,
    procedureType: typeFilter === 'all' ? undefined : typeFilter,
    isActive:      showInactive ? undefined : true,
    page,
    limit:         PAGE_SIZE,
  });

  const procedures = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function handleTypeChange(type: ProcedureTypeFilter) {
    setTypeFilter(type);
    setPage(1);
  }

  function handleSearch(q: string) {
    setSearchQuery(q);
    setPage(1);
  }

  function handleToggleInactive() {
    setShowInactive((prev) => !prev);
    setPage(1);
  }

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold font-display text-gray-900 dark:text-gray-100">
            {t('الإجراءات الطبية', 'Medical Procedures')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {t('كتالوج الإجراءات والخدمات', 'Procedures & Services Catalogue')}
          </p>
        </div>
        <div className="relative w-64">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            className="ps-9"
            placeholder={t('ابحث عن إجراء...', 'Search procedures...')}
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>
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
          onClick={handleToggleInactive}
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-neutral-700 bg-gray-50/50 dark:bg-neutral-800/50">
                <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs">
                  {t('الكود', 'Code')}
                </th>
                <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs">
                  {t('الاسم', 'Name')}
                </th>
                <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs">
                  {t('النوع', 'Type')}
                </th>
                <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs">
                  {t('السعر', 'Price')}
                </th>
                <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs hidden md:table-cell">
                  {t('المدة', 'Duration')}
                </th>
                <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs hidden lg:table-cell">
                  {t('يتطلب موافقة', 'Auth Required')}
                </th>
                <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs">
                  {t('الحالة', 'Status')}
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-50 dark:border-neutral-700/50">
                      <td colSpan={7} className="px-5 py-3">
                        <div className="animate-pulse bg-gray-200 dark:bg-neutral-700 rounded h-5" />
                      </td>
                    </tr>
                  ))
                : procedures.length === 0
                ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center text-gray-400 dark:text-gray-500">
                        {t('لا توجد إجراءات', 'No procedures found')}
                      </td>
                    </tr>
                  )
                : procedures.map((proc: Procedure) => (
                    <tr key={proc.id} className="border-b border-gray-50 dark:border-neutral-700/50 hover:bg-gray-50/50 dark:hover:bg-neutral-700/30 transition-colors">
                      <td className="px-5 py-3.5 font-mono text-xs text-gray-600 dark:text-gray-400">
                        {proc.code}
                      </td>
                      <td className="px-5 py-3.5 font-medium text-gray-900 dark:text-gray-100">
                        {lang === 'ar' && proc.nameAr ? proc.nameAr : proc.nameEn}
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge variant={TYPE_BADGE[proc.procedureType] ?? 'default'}>
                          {t(
                            TYPE_LABELS[proc.procedureType]?.ar ?? proc.procedureType,
                            TYPE_LABELS[proc.procedureType]?.en ?? proc.procedureType,
                          )}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 font-mono tabular-nums text-gray-700 dark:text-gray-300">
                        {formatCurrency(proc.basePrice, 'EGP', locale)}
                      </td>
                      <td className="px-5 py-3.5 text-gray-600 dark:text-gray-400 hidden md:table-cell">
                        {formatDuration(proc.durationMinutes)}
                      </td>
                      <td className="px-5 py-3.5 hidden lg:table-cell">
                        {proc.requiresPreAuth
                          ? <Badge variant="warning">{t('نعم', 'Yes')}</Badge>
                          : <Badge variant="default">{t('لا', 'No')}</Badge>}
                      </td>
                      <td className="px-5 py-3.5">
                        {proc.isActive
                          ? <Badge variant="success" dot>{t('نشط', 'Active')}</Badge>
                          : <Badge variant="outline" dot>{t('غير نشط', 'Inactive')}</Badge>}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>

          {/* Pagination */}
          {!isLoading && total > 0 && (
            <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100 dark:border-neutral-700">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                {t('السابق', 'Previous')}
              </Button>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {t(`صفحة ${page} من ${totalPages}`, `Page ${page} of ${totalPages}`)}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                {t('التالي', 'Next')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
