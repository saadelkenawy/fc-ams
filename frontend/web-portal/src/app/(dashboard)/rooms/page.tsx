'use client';

import { useState } from 'react';
import { DoorOpen } from 'lucide-react';
import { RoomStatusBoard } from '@/components/rooms/RoomStatusBoard';

export default function RoomsPage() {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-600/20 flex items-center justify-center">
            <DoorOpen className="w-5 h-5 text-primary-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Room Status Board</h1>
            <p className="text-sm text-slate-400">Real-time clinic room assignments</p>
          </div>
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-primary-500"
        />
      </div>

      <RoomStatusBoard date={date} />
    </div>
  );
}
