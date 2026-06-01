'use client';

import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

type Color = 'blue' | 'amber' | 'emerald' | 'green' | 'violet' | 'rose' | 'cyan';

const STATCARD_COLORS: Record<Color, { bg: string; icon: string; bar: string; spark: string }> = {
  blue:    { bg: 'bg-blue-50    dark:bg-blue-900/20',    icon: 'text-blue-600    dark:text-blue-400',    bar: 'bg-blue-500',    spark: '#3B82F6' },
  amber:   { bg: 'bg-amber-50   dark:bg-amber-900/20',   icon: 'text-amber-600   dark:text-amber-400',   bar: 'bg-amber-500',   spark: '#F59E0B' },
  emerald: { bg: 'bg-emerald-50 dark:bg-emerald-900/20', icon: 'text-emerald-600 dark:text-emerald-400', bar: 'bg-emerald-500', spark: '#10B981' },
  green:   { bg: 'bg-green-50   dark:bg-green-900/20',   icon: 'text-green-600   dark:text-green-400',   bar: 'bg-green-500',   spark: '#22C55E' },
  violet:  { bg: 'bg-violet-50  dark:bg-violet-900/20',  icon: 'text-violet-600  dark:text-violet-400',  bar: 'bg-violet-500',  spark: '#8B5CF6' },
  rose:    { bg: 'bg-rose-50    dark:bg-rose-900/20',    icon: 'text-rose-600    dark:text-rose-400',    bar: 'bg-rose-500',    spark: '#F43F5E' },
  cyan:    { bg: 'bg-cyan-50    dark:bg-cyan-900/20',    icon: 'text-cyan-600    dark:text-cyan-400',    bar: 'bg-cyan-500',    spark: '#06B6D4' },
};

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const h = 28;
  const n = values.length;
  const max = Math.max(...values, 1);
  const pts = values
    .map((v, i) => `${(i / (n - 1)) * 100},${h - (v / max) * (h - 4)}`)
    .join(' ');
  return (
    <svg viewBox={`0 0 100 ${h}`} width="100%" height={h} preserveAspectRatio="none" aria-hidden="true" className="opacity-60">
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  description?: string;
  color?: Color;
  trend?: { value: number; up: boolean; label?: string };
  sparkline?: number[];
  className?: string;
}

export function StatCard({ title, value, icon, description, color = 'blue', trend, sparkline, className }: StatCardProps) {
  const c = STATCARD_COLORS[color] ?? STATCARD_COLORS.blue;
  return (
    <div className={cn(
      'group bg-white dark:bg-neutral-900 rounded-2xl p-5 border border-gray-100 dark:border-neutral-800 shadow-2 hover:shadow-3 transition-all duration-300 hover:-translate-y-0.5 relative overflow-hidden',
      className,
    )}>
      <div className={`absolute top-0 start-0 end-0 h-0.5 ${c.bar}`} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide mb-2 text-gray-500 dark:text-gray-400">{title}</p>
          <p className="text-2xl font-bold font-mono tabular-nums leading-none text-gray-900 dark:text-gray-100">{value}</p>
          {trend && (
            <div className={cn(
              'flex items-center gap-1 mt-2 text-xs font-medium',
              trend.up ? 'text-emerald-600' : 'text-red-500',
            )}>
              {trend.up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              <span>{trend.up ? '+' : ''}{trend.value}%</span>
              {trend.label && <span className="text-gray-400 font-normal">{trend.label}</span>}
            </div>
          )}
          {description && <p className="text-xs mt-2.5 text-gray-500 dark:text-gray-400">{description}</p>}
        </div>
        <div className={cn(
          'w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-200 group-hover:scale-110',
          c.bg, c.icon,
        )}>
          {icon}
        </div>
      </div>
      {sparkline && sparkline.length > 1 && (
        <div className="mt-3 -mx-1">
          <Sparkline values={sparkline} color={c.spark} />
        </div>
      )}
    </div>
  );
}
