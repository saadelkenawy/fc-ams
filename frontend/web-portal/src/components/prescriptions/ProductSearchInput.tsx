'use client';

import { useState, useEffect, useRef, useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X, Pill, Sparkles, AlertTriangle } from 'lucide-react';
import { ehrApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { ProductSearchResult } from '@fadl/types';

interface Props {
  /** Controlled display text — trade name after selection, or whatever the user typed */
  value: string;
  /** UUID of the selected product; when set, input is read-only */
  productId?: string;
  lang: 'ar' | 'en';
  /** Pass 'medicine' or 'cosmetic' to restrict results; omit for both */
  typeFilter?: 'medicine' | 'cosmetic';
  onChange: (text: string) => void;
  onSelect: (product: ProductSearchResult) => void;
  onClear: () => void;
}

const TYPE_ICON = {
  medicine: Pill,
  cosmetic: Sparkles,
};

export function ProductSearchInput({
  value,
  productId,
  lang,
  typeFilter,
  onChange,
  onSelect,
  onClear,
}: Props) {
  const inputId     = useId();
  const listId      = useId();
  const inputRef    = useRef<HTMLInputElement>(null);
  const listRef     = useRef<HTMLUListElement>(null);

  const [open,      setOpen]      = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [debounced, setDebounced] = useState('');

  // 250 ms debounce — only while unlocked
  useEffect(() => {
    if (productId) return;
    const t = setTimeout(() => setDebounced(value), 250);
    return () => clearTimeout(t);
  }, [value, productId]);

  // Reset activeIdx when results change
  useEffect(() => { setActiveIdx(-1); }, [debounced]);

  const { data: results = [], isFetching } = useQuery<ProductSearchResult[]>({
    queryKey: ['products-search', debounced, typeFilter],
    queryFn: async () => {
      const res = await ehrApi.get('/products/search', {
        params: { q: debounced, ...(typeFilter ? { type: typeFilter } : {}), limit: 20 },
      });
      return (res.data as { data: ProductSearchResult[] }).data;
    },
    enabled: debounced.length >= 2 && !productId,
    staleTime: 60_000,
    keepPreviousData: true,
  });

  const isOpen = open && !productId && results.length > 0;

  // Scroll active item into view
  useEffect(() => {
    if (activeIdx < 0 || !listRef.current) return;
    const el = listRef.current.children[activeIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  function handleSelect(product: ProductSearchResult) {
    onSelect(product);
    setOpen(false);
    setActiveIdx(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        if (activeIdx >= 0) {
          e.preventDefault();
          handleSelect(results[activeIdx]);
        }
        break;
      case 'Escape':
        setOpen(false);
        break;
    }
  }

  const placeholder = lang === 'ar'
    ? 'ابحث بالاسم التجاري أو الفعّال…'
    : 'Search trade or generic name…';

  const label = lang === 'ar' ? 'الدواء / المنتج' : 'Medication / Product';

  return (
    <div className="relative flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-xs font-medium text-gray-600 dark:text-gray-400">
        {label}
      </label>

      {/* ── input wrapper ── */}
      <div className="relative">
        {/* left icon */}
        {productId ? (
          <Pill className="absolute start-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-500 pointer-events-none" />
        ) : (
          <Search className={cn(
            'absolute start-2.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none',
            isFetching ? 'text-primary-500 animate-pulse' : 'text-gray-400',
          )} />
        )}

        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={listId}
          aria-activedescendant={activeIdx >= 0 ? `${listId}-opt-${activeIdx}` : undefined}
          type="text"
          value={value}
          readOnly={!!productId}
          placeholder={placeholder}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => { if (!productId && value.length >= 2) setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={handleKeyDown}
          className={cn(
            'w-full h-10 rounded-lg border text-sm ps-8 pe-8',
            'focus:outline-none focus:ring-2 focus:ring-primary-600 transition-colors',
            productId
              ? 'border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/20 text-gray-900 dark:text-gray-100 cursor-default'
              : 'border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-gray-900 dark:text-gray-100',
          )}
        />

        {/* clear button — only when a product is locked in */}
        {productId && (
          <button
            type="button"
            onClick={() => { onClear(); inputRef.current?.focus(); }}
            aria-label={lang === 'ar' ? 'إلغاء الاختيار' : 'Clear selection'}
            className="absolute end-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* ── dropdown ── */}
      {isOpen && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={lang === 'ar' ? 'نتائج البحث' : 'Search results'}
          className={cn(
            'absolute top-full z-30 mt-1 w-full rounded-xl',
            'border border-gray-200 dark:border-neutral-600',
            'bg-white dark:bg-neutral-800 shadow-xl',
            'max-h-72 overflow-y-auto',
          )}
        >
          {results.map((product, idx) => {
            const Icon = TYPE_ICON[product.type] ?? Pill;
            const isActive = idx === activeIdx;
            const displayName = lang === 'ar' && product.tradeNameAr
              ? product.tradeNameAr
              : product.tradeNameEn;

            return (
              <li
                key={product.id}
                id={`${listId}-opt-${idx}`}
                role="option"
                aria-selected={isActive}
                onMouseDown={() => handleSelect(product)}
                onMouseEnter={() => setActiveIdx(idx)}
                className={cn(
                  'flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors',
                  isActive
                    ? 'bg-primary-50 dark:bg-primary-900/30'
                    : 'hover:bg-gray-50 dark:hover:bg-neutral-700',
                  idx > 0 && 'border-t border-gray-100 dark:border-neutral-700',
                )}
              >
                {/* type icon */}
                <span className={cn(
                  'mt-0.5 flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center',
                  product.type === 'medicine'
                    ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400'
                    : 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400',
                )}>
                  <Icon className="w-3.5 h-3.5" />
                </span>

                {/* names */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {displayName}
                  </p>
                  {product.genericNameEn && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {product.genericNameEn}
                      {product.strength && (
                        <span className="ms-1.5 text-gray-400">· {product.strength}</span>
                      )}
                    </p>
                  )}
                </div>

                {/* badges — right side */}
                <div className="flex-shrink-0 flex flex-col items-end gap-1 pt-0.5">
                  {product.formCode && (
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-mono font-medium bg-gray-100 dark:bg-neutral-700 text-gray-600 dark:text-gray-400 uppercase">
                      {product.formCode}
                    </span>
                  )}
                  <div className="flex gap-1">
                    {product.prescriptionRequired && (
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400">
                        Rx
                      </span>
                    )}
                    {product.controlledSubstance && (
                      <span
                        title={lang === 'ar' ? 'مادة مخدرة' : 'Controlled substance'}
                        className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400"
                      >
                        <AlertTriangle className="w-2.5 h-2.5" />C
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
