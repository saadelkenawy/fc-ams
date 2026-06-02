import React from 'react';
import { cn } from '@/lib/utils';

// ─── Base pulse bar ───────────────────────────────────────────────────────────

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-gray-100 dark:bg-neutral-700',
        className,
      )}
      style={style}
    />
  );
}

// ─── Table skeleton ───────────────────────────────────────────────────────────

export function SkeletonRow({ cols = 4, widths }: { cols?: number; widths?: string[] }) {
  return (
    <tr className="border-b border-gray-50 dark:border-neutral-800">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-5 py-3.5">
          <Skeleton
            className="h-3.5 rounded-full"
            style={{ width: widths?.[i] ?? `${55 + (i * 17) % 35}%` } as React.CSSProperties}
          />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonTable({ rows = 5, cols = 4, widths }: { rows?: number; cols?: number; widths?: string[] }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} cols={cols} widths={widths} />
      ))}
    </>
  );
}

// ─── Card skeleton ────────────────────────────────────────────────────────────

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="bg-white dark:bg-neutral-800 rounded-xl border border-gray-100 dark:border-neutral-700 p-5 space-y-3">
      <Skeleton className="h-4 w-1/3" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-3" style={{ width: `${70 + (i * 13) % 25}%` } as React.CSSProperties} />
      ))}
    </div>
  );
}

// ─── Stat card skeleton ───────────────────────────────────────────────────────

export function SkeletonStatCard() {
  return (
    <div className="bg-white dark:bg-neutral-800 rounded-xl border border-gray-100 dark:border-neutral-700 p-5">
      <div className="flex items-center justify-between mb-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
      <Skeleton className="h-7 w-20 mb-2" />
      <Skeleton className="h-3 w-28" />
    </div>
  );
}
