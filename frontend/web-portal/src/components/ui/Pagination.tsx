'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLang } from '@/contexts/LanguageContext';

interface PaginationProps {
  page: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  onLimitChange?: (limit: number) => void;
  pageSizes?: number[];
  className?: string;
}

export function Pagination({
  page, total, limit, onPageChange, onLimitChange,
  pageSizes = [10, 25, 50], className,
}: PaginationProps) {
  const { t, lang } = useLang();
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to   = Math.min(page * limit, total);

  function getPageNumbers(): (number | '...')[] {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | '...')[] = [1];
    if (page > 3) pages.push('...');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
      pages.push(i);
    }
    if (page < totalPages - 2) pages.push('...');
    pages.push(totalPages);
    return pages;
  }

  return (
    <div className={cn('flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3 border-t border-gray-100 dark:border-neutral-700', className)}>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {total === 0
          ? t('لا توجد نتائج', 'No results')
          : t(`عرض ${from}–${to} من ${total}`, `Showing ${from}–${to} of ${total}`)}
      </p>

      <div className="flex items-center gap-3">
        {onLimitChange && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500 dark:text-gray-400">{t('لكل صفحة:', 'Per page:')}</span>
            <select
              value={limit}
              onChange={(e) => { onLimitChange(Number(e.target.value)); onPageChange(1); }}
              className="text-xs border border-gray-200 dark:border-neutral-600 rounded-md px-2 py-1 bg-white dark:bg-neutral-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              {pageSizes.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}

        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="p-1.5 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {lang === 'ar' ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>

          {getPageNumbers().map((p, i) =>
            p === '...'
              ? <span key={`el-${i}`} className="w-7 text-center text-xs text-gray-400">…</span>
              : (
                <button
                  key={p}
                  onClick={() => onPageChange(p as number)}
                  className={cn(
                    'w-7 h-7 text-xs rounded-md font-medium transition-colors',
                    p === page
                      ? 'bg-primary-600 text-white'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-neutral-700',
                  )}
                >
                  {p}
                </button>
              )
          )}

          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="p-1.5 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {lang === 'ar' ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
