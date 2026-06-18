'use client';

import { TrendingUp, TrendingDown } from 'lucide-react';
import { CWidgetStatsA } from '@coreui/react';
import { CChartLine } from '@coreui/react-chartjs';
import { cn } from '@/lib/utils';

type Color = 'blue' | 'amber' | 'emerald' | 'green' | 'violet' | 'rose' | 'cyan';

/** Map the legacy StatCard palette onto CoreUI themed widget colors. */
const COLOR_MAP: Record<Color, string> = {
  blue:    'primary',
  amber:   'warning',
  emerald: 'success',
  green:   'success',
  violet:  'info',
  rose:    'danger',
  cyan:    'info',
};

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

/**
 * StatCard now renders CoreUI's CWidgetStatsA (solid themed widget with an
 * optional sparkline footer) while keeping the original prop API so existing
 * call sites across all pages render in the CoreUI style untouched.
 */
export function StatCard({ title, value, icon, description, color = 'blue', trend, sparkline, className }: StatCardProps) {
  const widgetColor = COLOR_MAP[color] ?? 'primary';

  return (
    <CWidgetStatsA
      className={cn('mb-0', className)}
      color={widgetColor}
      value={<>{value}</>}
      title={
        <div className="d-flex flex-column gap-1">
          <span>{title}</span>
          {trend && (
            <span className={cn('d-inline-flex align-items-center gap-1 small', trend.up ? 'text-white' : 'text-white-50')}>
              {trend.up ? <TrendingUp style={{ width: 12, height: 12 }} /> : <TrendingDown style={{ width: 12, height: 12 }} />}
              {trend.up ? '+' : ''}{trend.value}%{trend.label ? ` ${trend.label}` : ''}
            </span>
          )}
          {description && <span className="small text-white-50">{description}</span>}
        </div>
      }
      action={<span className="text-white-50 d-inline-flex">{icon}</span>}
      chart={
        sparkline && sparkline.length > 1 ? (
          <CChartLine
            className="mt-3 mx-3"
            style={{ height: 40 }}
            data={{
              labels: sparkline.map((_, i) => i),
              datasets: [
                {
                  label: title,
                  backgroundColor: 'transparent',
                  borderColor: 'rgba(255,255,255,.55)',
                  pointBackgroundColor: 'rgba(255,255,255,.55)',
                  data: sparkline,
                },
              ],
            }}
            options={{
              plugins: { legend: { display: false } },
              maintainAspectRatio: false,
              scales: { x: { display: false }, y: { display: false } },
              elements: { line: { borderWidth: 2, tension: 0.4 }, point: { radius: 0, hitRadius: 10, hoverRadius: 4 } },
            }}
          />
        ) : undefined
      }
    />
  );
}
