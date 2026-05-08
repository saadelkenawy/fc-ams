import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface KpiCardProps {
  title: string;
  titleAr?: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon: ReactNode;
  iconBg?: string;
  lang?: 'ar' | 'en';
  featured?: boolean;
  accent?: 'blue' | 'amber' | 'emerald' | 'violet' | 'rose' | 'cyan';
}

const ACCENT_MAP = {
  blue:    { bg: 'bg-blue-50 dark:bg-blue-900/20',    icon: 'text-blue-600 dark:text-blue-400',    bar: 'bg-blue-500' },
  amber:   { bg: 'bg-amber-50 dark:bg-amber-900/20',  icon: 'text-amber-600 dark:text-amber-400',  bar: 'bg-amber-500' },
  emerald: { bg: 'bg-emerald-50 dark:bg-emerald-900/20', icon: 'text-emerald-600 dark:text-emerald-400', bar: 'bg-emerald-500' },
  violet:  { bg: 'bg-violet-50 dark:bg-violet-900/20', icon: 'text-violet-600 dark:text-violet-400', bar: 'bg-violet-500' },
  rose:    { bg: 'bg-rose-50 dark:bg-rose-900/20',    icon: 'text-rose-600 dark:text-rose-400',    bar: 'bg-rose-500' },
  cyan:    { bg: 'bg-cyan-50 dark:bg-cyan-900/20',    icon: 'text-cyan-600 dark:text-cyan-400',    bar: 'bg-cyan-500' },
};

export function KpiCard({
  title, titleAr, value, change, changeLabel, icon,
  iconBg, lang = 'ar', featured, accent,
}: KpiCardProps) {
  const displayTitle = lang === 'ar' ? (titleAr ?? title) : title;
  const isPositive = (change ?? 0) > 0;
  const isNeutral  = change === 0 || change === undefined;
  const accentStyle = accent ? ACCENT_MAP[accent] : null;
  const resolvedIconBg = iconBg ?? accentStyle?.bg ?? 'bg-primary-50 dark:bg-primary-900/30';
  const resolvedIconColor = accentStyle?.icon ?? 'text-primary-600 dark:text-primary-400';

  return (
    <div className={cn(
      'group rounded-2xl p-5 border transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg relative overflow-hidden',
      featured
        ? 'text-white border-primary-700/50 shadow-lg'
        : 'bg-white dark:bg-neutral-800 border-gray-100 dark:border-neutral-700 shadow-sm',
    )}
      style={featured ? { background: 'var(--gradient-sidebar)' } : undefined}
    >
      {/* Subtle top border accent */}
      {!featured && accent && (
        <div className={cn('absolute top-0 start-0 end-0 h-0.5 rounded-t-2xl', accentStyle?.bar)} />
      )}
      {/* Background glow on hover */}
      {featured && (
        <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      )}

      <div className="flex items-start justify-between gap-3 relative">
        <div className="min-w-0">
          <p className={cn('text-xs font-semibold uppercase tracking-wide mb-2', featured ? 'text-white/70' : 'text-gray-500 dark:text-gray-400')}>
            {displayTitle}
          </p>
          <p className={cn('text-2xl font-bold font-mono tabular-nums leading-none', featured ? 'text-white' : 'text-gray-900 dark:text-gray-100')}>
            {value}
          </p>
          {change !== undefined && (
            <div className={cn(
              'flex items-center gap-1 mt-2.5 text-xs font-medium',
              featured
                ? 'text-white/80'
                : isNeutral
                  ? 'text-gray-400'
                  : isPositive
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-500 dark:text-red-400',
            )}>
              {isNeutral
                ? <Minus className="w-3 h-3" />
                : isPositive
                  ? <TrendingUp className="w-3 h-3" />
                  : <TrendingDown className="w-3 h-3" />}
              <span>{isPositive ? '+' : ''}{change}%</span>
              {changeLabel && (
                <span className={featured ? 'text-white/50' : 'text-gray-400 dark:text-gray-500 font-normal'}>
                  {changeLabel}
                </span>
              )}
            </div>
          )}
        </div>
        <div className={cn(
          'w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-200 group-hover:scale-110',
          featured ? 'bg-white/20' : resolvedIconBg,
        )}>
          <span className={featured ? 'text-white' : resolvedIconColor}>{icon}</span>
        </div>
      </div>
    </div>
  );
}
