'use client';

import { Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLang } from '@/contexts/LanguageContext';
import { useQueue, useQueueStats, useCallPatient } from '@/hooks/useQueue';

interface QueueDashboardWidgetProps {
  doctorId: string;
  date?: string;
}

export function QueueDashboardWidget({ doctorId, date }: QueueDashboardWidgetProps) {
  const { t } = useLang();
  const { data: entries = [] } = useQueue(doctorId, date);
  const { data: stats } = useQueueStats(doctorId, date);

  const nextWaiting = entries.find((e) => e.status === 'waiting');
  const callNext = useCallPatient(nextWaiting?.id ?? '');

  if (!stats) return null;

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-neutral-700 p-4 bg-white dark:bg-neutral-800 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('طابور الانتظار', 'Patient Queue')}</h3>
        <span className="text-xs text-gray-500">{t('اليوم', 'Today')}</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="text-center p-2 rounded-xl bg-blue-50 dark:bg-blue-950/30">
          <p className="text-xl font-bold text-blue-700 dark:text-blue-400">{stats.waiting}</p>
          <p className="text-[10px] text-blue-600 dark:text-blue-500">{t('انتظار', 'Waiting')}</p>
        </div>
        <div className="text-center p-2 rounded-xl bg-green-50 dark:bg-green-950/30">
          <p className="text-xl font-bold text-green-700 dark:text-green-400">{stats.inSession}</p>
          <p className="text-[10px] text-green-600 dark:text-green-500">{t('داخل', 'In Session')}</p>
        </div>
        <div className="text-center p-2 rounded-xl bg-gray-50 dark:bg-neutral-700/40">
          <p className="text-xl font-bold text-gray-700 dark:text-gray-300">{stats.completed}</p>
          <p className="text-[10px] text-gray-500">{t('اكتمل', 'Done')}</p>
        </div>
      </div>

      {stats.avgSessionMinutes > 0 && (
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          {t('متوسط الجلسة', 'Avg session')}: {stats.avgSessionMinutes}{t('د', 'm')}
          {' · '}
          {t('انتظار التالي', 'Next wait')}: ~{stats.estimatedWaitForNext}{t('د', 'm')}
        </p>
      )}

      {nextWaiting && (
        <button
          type="button"
          onClick={() => callNext.mutate()}
          disabled={callNext.isPending}
          className={cn(
            'w-full flex items-center justify-center gap-2 h-9 rounded-xl text-sm font-medium transition-all',
            'bg-amber-500 hover:bg-amber-600 text-white',
            callNext.isPending && 'opacity-60 cursor-not-allowed',
          )}
        >
          <Phone className="w-4 h-4" />
          {t('نادِ التالي', 'Call Next')} #{nextWaiting.position}
        </button>
      )}
    </div>
  );
}
