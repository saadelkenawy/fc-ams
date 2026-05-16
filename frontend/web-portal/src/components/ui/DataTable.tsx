'use client';

import { Loader2, Plus } from 'lucide-react';
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
}

export function DataTable<T>({
  columns, data, getRowKey, onRowClick, selectedKey,
  loading, error, emptyMessage = 'No results found',
  onAddNew, addNewLabel = 'Add New',
  errorMessage = 'Failed to load data',
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400 dark:text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin me-2" />
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-12 text-center text-red-500 dark:text-red-400 text-sm">
        {errorMessage}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="py-16 text-center">
        <div className="flex flex-col items-center gap-3 text-gray-400 dark:text-gray-500">
          <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-neutral-800 flex items-center justify-center">
            <Plus className="w-6 h-6" />
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
        <thead>
          <tr className="border-b border-gray-100 dark:border-neutral-700 bg-gray-50/50 dark:bg-neutral-900/40">
            {columns.map((col) => (
              <th
                key={col.key}
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
            return (
              <tr
                key={key}
                onClick={() => onRowClick?.(row)}
                className={`border-b border-gray-50 dark:border-neutral-800 transition-colors animate-fade-in ${
                  onRowClick ? 'cursor-pointer hover:bg-blue-50/40 dark:hover:bg-blue-900/10' : ''
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
