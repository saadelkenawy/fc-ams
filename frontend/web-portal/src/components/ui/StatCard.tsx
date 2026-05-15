'use client';

import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

type Color = 'primary' | 'blue' | 'green' | 'amber' | 'violet' | 'red';

const COLOR_MAP: Record<Color, { icon: string; badge: string; trend: string }> = {
  primary:{ icon: 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400', badge: 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300', trend: 'text-primary-600' },
  blue:   { icon: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',   badge: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300',   trend: 'text-blue-600' },
  green:  { icon: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400', badge: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300', trend: 'text-emerald-600' },
  amber:  { icon: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',  badge: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300',   trend: 'text-amber-600' },
  violet: { icon: 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400', badge: 'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300', trend: 'text-violet-600' },
  red:    { icon: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',    badge: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300',     trend: 'text-red-600' },
};

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  description?: string;
  color?: Color;
  trend?: { value: number; up: boolean; label?: string };
  className?: string;
}

export function StatCard({ title, value, icon, description, color = 'blue', trend, className }: StatCardProps) {
  const c = COLOR_MAP[color];
  return (
    <div className={cn(
      'bg-white dark:bg-neutral-900 rounded-xl border border-gray-100 dark:border-neutral-800 p-5 flex flex-col gap-4 shadow-1 transition-all duration-200 hover:shadow-2 hover:-translate-y-0.5',
      className,
    )}>
      <div className="flex items-start justify-between">
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', c.icon)}>
          {icon}
        </div>
        {trend && (
          <div className={cn('flex items-center gap-1 text-xs font-semibold rounded-full px-2 py-1', c.badge)}>
            {trend.up
              ? <TrendingUp className="w-3 h-3" />
              : <TrendingDown className="w-3 h-3" />}
            {Math.abs(trend.value)}%
          </div>
        )}
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 font-display animate-value-in">{value}</p>
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mt-0.5">{title}</p>
        {description && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{description}</p>
        )}
      </div>
    </div>
  );
}
