'use client';

import { useState } from 'react';
import { Users, Phone, PlayCircle, CheckCircle2, Clock, UserX, RotateCcw, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLang } from '@/contexts/LanguageContext';
import { useQueue, useQueueStats, useCallPatient, useStartSession, useCompleteSession, useMarkNoShow, useCancelFromQueue, useRejoinQueue } from '@/hooks/useQueue';
import type { PatientQueueEntry, QueueStatus } from '@fadl/types';

const STATUS_CONFIG: Record<QueueStatus, { labelAr: string; labelEn: string; bg: string; text: string; dot: string }> = {
  waiting:    { labelAr: 'انتظار',    labelEn: 'Waiting',     bg: 'bg-blue-50 dark:bg-blue-950/30',    text: 'text-blue-700 dark:text-blue-400',    dot: 'bg-blue-500'    },
  called:     { labelAr: 'تم النداء', labelEn: 'Called',      bg: 'bg-amber-50 dark:bg-amber-950/30',  text: 'text-amber-700 dark:text-amber-400',  dot: 'bg-amber-500'   },
  in_session: { labelAr: 'داخل',     labelEn: 'In Session',  bg: 'bg-green-50 dark:bg-green-950/30',  text: 'text-green-700 dark:text-green-400',  dot: 'bg-green-500'   },
  completed:  { labelAr: 'اكتمل',    labelEn: 'Completed',   bg: 'bg-gray-50 dark:bg-neutral-800/40', text: 'text-gray-500 dark:text-gray-400',     dot: 'bg-gray-400'    },
  cancelled:  { labelAr: 'ملغي',     labelEn: 'Cancelled',   bg: 'bg-red-50 dark:bg-red-950/30',      text: 'text-red-600 dark:text-red-400',      dot: 'bg-red-500'     },
  no_show:    { labelAr: 'لم يحضر',  labelEn: 'No-Show',     bg: 'bg-orange-50 dark:bg-orange-950/30', text: 'text-orange-600 dark:text-orange-400', dot: 'bg-orange-500' },
};

function QueueEntryCard({ entry }: { entry: PatientQueueEntry }) {
  const { lang, t } = useLang();
  const cfg = STATUS_CONFIG[entry.status];
  const call = useCallPatient(entry.id);
  const start = useStartSession(entry.id);
  const complete = useCompleteSession(entry.id);
  const noShow = useMarkNoShow(entry.id);
  const cancel = useCancelFromQueue(entry.id);
  const rejoin = useRejoinQueue(entry.id);

  const isPending = call.isPending || start.isPending || complete.isPending || noShow.isPending || cancel.isPending;

  return (
    <div className={cn('flex items-center gap-3 p-3 rounded-xl border', cfg.bg, 'border-transparent')}>
      {/* Position badge */}
      <div className={cn(
        'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0',
        entry.status === 'in_session' ? 'bg-green-600 text-white' :
        entry.status === 'called' ? 'bg-amber-500 text-white' :
        entry.status === 'waiting' ? 'bg-blue-600 text-white' :
        'bg-gray-300 dark:bg-neutral-600 text-gray-600 dark:text-gray-300',
      )}>
        {['completed', 'cancelled', 'no_show'].includes(entry.status) ? '–' : entry.position}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
          {t(`مريض #${entry.patientId.slice(0, 8)}`, `Patient #${entry.patientId.slice(0, 8)}`)}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={cn('text-[10px] font-medium flex items-center gap-1', cfg.text)}>
            <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
            {lang === 'ar' ? cfg.labelAr : cfg.labelEn}
          </span>
          {entry.estimatedWaitMinutes !== undefined && entry.status === 'waiting' && (
            <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
              <Clock className="w-2.5 h-2.5" />
              ~{entry.estimatedWaitMinutes}{t('د', 'm')}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {entry.status === 'waiting' && (
          <>
            <button
              type="button"
              onClick={() => call.mutate()}
              disabled={isPending}
              className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-950/30 transition-colors"
              title={t('نادِ المريض', 'Call patient')}
            >
              <Phone className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => cancel.mutate()}
              disabled={isPending}
              className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
              title={t('إلغاء', 'Cancel')}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
        {entry.status === 'called' && (
          <>
            <button
              type="button"
              onClick={() => start.mutate()}
              disabled={isPending}
              className="p-1.5 rounded-lg text-green-600 hover:bg-green-100 dark:hover:bg-green-950/30 transition-colors"
              title={t('بدء الجلسة', 'Start session')}
            >
              <PlayCircle className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => noShow.mutate()}
              disabled={isPending}
              className="p-1.5 rounded-lg text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950/30 transition-colors"
              title={t('لم يحضر', 'No-show')}
            >
              <UserX className="w-3.5 h-3.5" />
            </button>
          </>
        )}
        {entry.status === 'in_session' && (
          <button
            type="button"
            onClick={() => complete.mutate()}
            disabled={isPending}
            className="p-1.5 rounded-lg text-green-700 hover:bg-green-100 dark:hover:bg-green-950/30 transition-colors"
            title={t('إنهاء الجلسة', 'Complete')}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
          </button>
        )}
        {['cancelled', 'no_show'].includes(entry.status) && (
          <button
            type="button"
            onClick={() => rejoin.mutate()}
            disabled={isPending}
            className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
            title={t('إعادة تسجيل', 'Rejoin queue')}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

interface QueueBoardProps {
  doctorId: string;
  date?: string;
}

export function QueueBoard({ doctorId, date }: QueueBoardProps) {
  const { t } = useLang();
  const [showCompleted, setShowCompleted] = useState(false);
  const { data: entries = [], isLoading } = useQueue(doctorId, date);
  const { data: stats } = useQueueStats(doctorId, date);

  const active = entries.filter((e) => ['waiting', 'called', 'in_session'].includes(e.status));
  const done = entries.filter((e) => ['completed', 'cancelled', 'no_show'].includes(e.status));

  return (
    <div className="space-y-3">
      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: t('انتظار', 'Waiting'),   value: stats.waiting,   dot: 'bg-blue-500'  },
            { label: t('تم النداء', 'Called'), value: stats.called,    dot: 'bg-amber-500' },
            { label: t('داخل', 'In Session'), value: stats.inSession, dot: 'bg-green-500' },
            { label: t('اكتمل', 'Done'),       value: stats.completed, dot: 'bg-gray-400'  },
          ].map((s) => (
            <div key={s.label} className="flex flex-col items-center p-2 rounded-xl bg-gray-50 dark:bg-neutral-800/40">
              <div className="flex items-center gap-1 mb-0.5">
                <span className={cn('w-2 h-2 rounded-full', s.dot)} />
                <span className="text-[10px] text-gray-500 dark:text-gray-400">{s.label}</span>
              </div>
              <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{s.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Active queue */}
      <div className="space-y-1.5">
        {isLoading ? (
          <div className="flex items-center justify-center h-20 text-gray-400 text-sm">{t('جاري التحميل...', 'Loading...')}</div>
        ) : active.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 text-gray-400">
            <Users className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-sm">{t('لا يوجد مرضى في الانتظار', 'No patients in queue')}</p>
          </div>
        ) : (
          active.map((e) => <QueueEntryCard key={e.id} entry={e} />)
        )}
      </div>

      {/* Completed / cancelled toggle */}
      {done.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowCompleted((p) => !p)}
            className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            {showCompleted ? t('إخفاء المنتهية', 'Hide completed') : t(`عرض المنتهية (${done.length})`, `Show completed (${done.length})`)}
          </button>
          {showCompleted && (
            <div className="mt-1.5 space-y-1.5">
              {done.map((e) => <QueueEntryCard key={e.id} entry={e} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
