'use client';

import { Plus, RefreshCcw } from 'lucide-react';
import { Button } from './Button';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  getRowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  selectedKey?: string | null;
  loading?: boolean;
  error?: boolean;
  emptyMessage?: string;
  onAddNew?: () => void;
  addNewLabel?: string;
  errorMessage?: string;
  onRetry?: () => void;
  caption?: string;
}

export function DataTable<T>({
  columns, data, getRowKey, onRowClick, selectedKey,
  loading, error, emptyMessage = 'No results found',
  onAddNew, addNewLabel = 'Add New',
  errorMessage = 'Failed to load data',
  onRetry,
  caption,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="overflow-x-auto" aria-busy="true" aria-label="Loading…">
        <table className="w-full text-sm">
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-b border-gray-50 dark:border-neutral-800">
                {columns.map((col) => (
                  <td key={col.key} className={`px-5 py-3.5 ${col.className ?? ''}`}>
                    <div className="h-4 bg-gray-100 dark:bg-neutral-800 rounded animate-pulse" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-12 text-center">
        <p className="text-red-500 dark:text-red-400 text-sm mb-3">{errorMessage}</p>
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RefreshCcw className="w-3.5 h-3.5" aria-hidden="true" />
            Retry
          </Button>
        )}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="py-16 text-center">
        <div className="flex flex-col items-center gap-3 text-gray-400 dark:text-gray-500">
          <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-neutral-800 flex items-center justify-center">
            <Plus className="w-6 h-6" aria-hidden="true" />
          </div>
          <p className="text-sm font-medium">{emptyMessage}</p>
          {onAddNew && (
            <Button size="sm" variant="outline" onClick={onAddNew}>
              {addNewLabel}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-gray-100 dark:border-neutral-700 bg-gray-50/50 dark:bg-neutral-900/40">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={`text-start px-5 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide ${col.className ?? ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => {
            const key = getRowKey(row);
            const isClickable = !!onRowClick;
            return (
              <tr
                key={key}
                onClick={() => onRowClick?.(row)}
                onKeyDown={isClickable ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onRowClick!(row);
                  }
                } : undefined}
                role={isClickable ? 'button' : undefined}
                tabIndex={isClickable ? 0 : undefined}
                aria-selected={isClickable && selectedKey === key ? true : undefined}
                className={`border-b border-gray-50 dark:border-neutral-800 transition-colors animate-fade-in ${
                  isClickable ? 'cursor-pointer hover:bg-blue-50/40 dark:hover:bg-blue-900/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-600' : ''
                } ${selectedKey === key ? 'bg-blue-50/60 dark:bg-blue-900/15' : ''}`}
                style={{ animationDelay: `${i * 20}ms` }}
              >
                {columns.map((col) => (
                  <td key={col.key} className={`px-5 py-3.5 ${col.className ?? ''}`}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
