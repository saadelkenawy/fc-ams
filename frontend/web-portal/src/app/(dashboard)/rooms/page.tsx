'use client';

import { localDateISO } from '@/lib/utils';
import { useState } from 'react';
import { useRooms } from '@/hooks/useRooms';
import { RoomQueueBoard } from '@/components/rooms/RoomQueueBoard';
import { useLang } from '@/contexts/LanguageContext';

export default function RoomsPage() {
  const [date, setDate] = useState(localDateISO());
  const { t } = useLang();
  const { data: rooms = [] } = useRooms(date);

  const occupied  = rooms.filter(r => r.status === 'occupied' || r.status === 'reserved').length;
  const available = rooms.filter(r => r.status === 'available').length;
  const cleaning  = rooms.filter(r => r.status === 'inactive').length;

  const pills = [
    { label: t('مشغولة', 'Occupied'),  value: occupied,  dot: 'bg-rose-500'    },
    { label: t('متاحة', 'Available'),  value: available, dot: 'bg-emerald-500' },
    { label: t('تنظيف', 'Cleaning'),   value: cleaning,  dot: 'bg-amber-400'   },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Header banner */}
      <div className="relative overflow-hidden rounded-2xl border border-rose-100/80 dark:border-rose-950/40 bg-gradient-to-r from-rose-50 via-orange-50/60 to-amber-50/40 dark:from-rose-950/30 dark:via-neutral-900 dark:to-neutral-900 px-6 py-5">
        <div className="absolute -right-10 -top-12 w-44 h-44 rounded-full bg-rose-200/30 dark:bg-rose-900/20 blur-2xl pointer-events-none" />
        <div className="relative flex items-start justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-display font-bold text-gray-900 dark:text-gray-100">
              {t('إعدادات الغرف', 'Room Settings')}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {t('عرض وإدارة حالة غرف الفحص في الوقت الفعلي', 'View and manage your room status in real time')}
            </p>

            {/* Status pills */}
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {pills.map((p) => (
                <span
                  key={p.label}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/70 dark:bg-neutral-900/60 border border-white/60 dark:border-neutral-800 text-xs font-medium text-gray-700 dark:text-gray-300 shadow-sm"
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} />
                  {p.label}
                  <span className="font-bold tabular-nums text-gray-900 dark:text-gray-100">{p.value}</span>
                </span>
              ))}
            </div>
          </div>

          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:border-primary-500 shadow-sm"
          />
        </div>
      </div>

      <RoomQueueBoard date={date} />
    </div>
  );
}
