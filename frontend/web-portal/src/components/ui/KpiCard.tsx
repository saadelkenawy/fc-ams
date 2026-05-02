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
}

export function KpiCard({
  title, titleAr, value, change, changeLabel, icon,
  iconBg = 'bg-primary-50 dark:bg-primary-900/30',
  lang = 'ar', featured,
}: KpiCardProps) {
  const displayTitle = lang === 'ar' ? (titleAr ?? title) : title;
  const isPositive = (change ?? 0) > 0;
  const isNeutral  = change === 0 || change === undefined;

  return (
    <div className={cn(
      'rounded-xl p-5 border transition-all duration-200 hover:shadow-3',
      featured
        ? 'bg-gradient-to-br from-primary-600 to-primary-800 text-white border-primary-700 shadow-4'
        : 'bg-white dark:bg-neutral-800 border-gray-100 dark:border-neutral-700 shadow-2',
    )}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={cn('text-sm font-medium mb-1', featured ? 'text-primary-100' : 'text-gray-500 dark:text-gray-300')}>
            {displayTitle}
          </p>
          <p className={cn('text-3xl font-bold font-mono tabular-nums', featured ? 'text-white' : 'text-gray-900 dark:text-gray-100')}>
            {value}
          </p>
          {change !== undefined && (
            <div className={cn(
              'flex items-center gap-1 mt-2 text-xs font-medium',
              featured ? 'text-primary-100' : isPositive ? 'text-emerald-600' : 'text-red-500',
            )}>
              {isNeutral
                ? <Minus className="w-3 h-3" />
                : isPositive
                  ? <TrendingUp className="w-3 h-3" />
                  : <TrendingDown className="w-3 h-3" />}
              <span>{isPositive ? '+' : ''}{change}%</span>
              {changeLabel && (
                <span className={featured ? 'text-primary-200' : 'text-gray-400 dark:text-gray-300'}>
                  {changeLabel}
                </span>
              )}
            </div>
          )}
        </div>
        <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0', featured ? 'bg-white/20' : iconBg)}>
          <span className={featured ? 'text-white' : 'text-primary-600 dark:text-primary-400'}>{icon}</span>
        </div>
      </div>
    </div>
  );
}
