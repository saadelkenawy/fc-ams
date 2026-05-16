'use client';

import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

type Color = 'blue' | 'amber' | 'emerald' | 'green' | 'violet' | 'rose' | 'cyan';

const STATCARD_COLORS: Record<Color, { bg: string; icon: string; bar: string }> = {
  blue:    { bg: 'bg-blue-50',    icon: 'text-blue-600',    bar: 'bg-blue-500' },
  amber:   { bg: 'bg-amber-50',   icon: 'text-amber-600',   bar: 'bg-amber-500' },
  emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600', bar: 'bg-emerald-500' },
  green:   { bg: 'bg-green-50',   icon: 'text-green-600',   bar: 'bg-green-500' },
  violet:  { bg: 'bg-violet-50',  icon: 'text-violet-600',  bar: 'bg-violet-500' },
  rose:    { bg: 'bg-rose-50',    icon: 'text-rose-600',    bar: 'bg-rose-500' },
  cyan:    { bg: 'bg-cyan-50',    icon: 'text-cyan-600',    bar: 'bg-cyan-500' },
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
  const c = STATCARD_COLORS[color] ?? STATCARD_COLORS.blue;
  return (
    <div className={cn(
      'group bg-white rounded-2xl p-5 border border-gray-100 shadow-2 hover:shadow-3 transition-all duration-300 hover:-translate-y-0.5 relative overflow-hidden',
      className,
    )}>
      <div className={`absolute top-0 start-0 end-0 h-0.5 ${c.bar}`} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide mb-2 text-gray-500">{title}</p>
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
          {description && <p className="text-xs mt-2.5 text-gray-500">{description}</p>}
        </div>
        <div className={cn(
          'w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-200 group-hover:scale-110',
          c.bg, c.icon,
        )}>
          {icon}
        </div>
      </div>
    </div>
  );
}
