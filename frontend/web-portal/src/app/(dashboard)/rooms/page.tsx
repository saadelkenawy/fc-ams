'use client';

import { useState } from 'react';
import { UserCheck, DoorOpen, Sparkles } from 'lucide-react';
import { RoomStatusBoard } from '@/components/rooms/RoomStatusBoard';
import { StatCard } from '@/components/ui/StatCard';
import { useRooms } from '@/hooks/useRooms';
import { useLang } from '@/contexts/LanguageContext';

export default function RoomsPage() {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const { t } = useLang();
  const { data: rooms = [] } = useRooms(date);

  const occupied  = rooms.filter(r => r.status === 'occupied').length;
  const available = rooms.filter(r => r.status === 'available').length;
  const cleaning  = rooms.filter(r => r.status === 'inactive').length;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-display font-bold text-gray-900 dark:text-gray-100">
            {t('إعدادات الغرف', 'Room Settings')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {t('عرض وإدارة حالة غرف الفحص في الوقت الفعلي', 'View and manage exam room status in real-time')}
          </p>
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="px-3 py-2 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:border-primary-500"
        />
      </div>

      {/* Status summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title={t('مشغولة', 'Occupied')}
          value={occupied}
          color="rose"
          icon={<UserCheck className="w-5 h-5" />}
          description={t('غرفة', 'rooms')}
        />
        <StatCard
          title={t('متاحة', 'Available')}
          value={available}
          color="emerald"
          icon={<DoorOpen className="w-5 h-5" />}
          description={t('غرفة', 'rooms')}
        />
        <StatCard
          title={t('تنظيف', 'Cleaning')}
          value={cleaning}
          color="amber"
          icon={<Sparkles className="w-5 h-5" />}
          description={t('غرفة', 'rooms')}
        />
      </div>

      <RoomStatusBoard date={date} />
    </div>
  );
}
