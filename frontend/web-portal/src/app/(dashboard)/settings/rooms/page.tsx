'use client';

import { useState } from 'react';
import { Settings, Save } from 'lucide-react';
import { useRooms, useRoomStats, useUpdateRoom } from '@/hooks/useRooms';
import { Button } from '@/components/ui/Button';
import type { RoomDetail } from '@fadl/types';

function RoomSettingsRow({ room }: { room: RoomDetail }) {
  const [name, setName] = useState(room.roomName);
  const [floor, setFloor] = useState<string>(room.floor?.toString() ?? '');
  const [desc, setDesc] = useState(room.description ?? '');
  const [active, setActive] = useState(room.isActive);
  const [saved, setSaved] = useState(false);

  const update = useUpdateRoom();

  async function handleSave() {
    await update.mutateAsync({
      roomCode: room.roomCode,
      roomName: name,
      floor: floor ? parseInt(floor, 10) : null,
      description: desc || null,
      isActive: active,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="flex flex-col gap-4 p-5 rounded-2xl bg-white/5 border border-white/10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-white">{room.roomCode}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${room.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
            {active ? 'Active' : 'Inactive'}
          </span>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-xs text-slate-400">Enable</span>
          <input
            type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)}
            className="w-4 h-4 accent-primary-500"
          />
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2">
          <label htmlFor="room-name" className="block text-xs text-slate-400 mb-1">Room Name</label>
          <input
            id="room-name"
            value={name} onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-primary-500"
          />
        </div>
        <div>
          <label htmlFor="room-floor" className="block text-xs text-slate-400 mb-1">Floor</label>
          <input
            id="room-floor"
            type="number" value={floor} onChange={(e) => setFloor(e.target.value)}
            placeholder="e.g. 2"
            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-primary-500"
          />
        </div>
      </div>

      <div>
        <label htmlFor="room-desc" className="block text-xs text-slate-400 mb-1">Description / Directions</label>
        <input
          id="room-desc"
          value={desc} onChange={(e) => setDesc(e.target.value)}
          placeholder="e.g. Turn left from reception, end of corridor"
          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-primary-500"
        />
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={update.isPending} className="gap-2">
          <Save className="w-3.5 h-3.5" />
          {saved ? 'Saved!' : update.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

function StatsSection() {
  const { data: stats = [] } = useRoomStats();
  if (!stats.length) return null;
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-slate-300">Usage Statistics</h2>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {stats.map((s) => (
          <div key={s.roomCode} className="p-4 rounded-xl bg-white/5 border border-white/10 flex flex-col gap-1">
            <span className="text-base font-bold text-white">{s.roomCode}</span>
            <span className="text-xs text-slate-400">Today: {s.appointmentsToday}</span>
            <span className="text-xs text-slate-400">Avg/day: {s.avgOccupancyThisMonth}</span>
            {s.topDoctorNameEn && <span className="text-xs text-slate-500 truncate">{s.topDoctorNameEn}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function RoomSettingsPage() {
  const { data: rooms = [], isLoading } = useRooms();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
          <Settings className="w-5 h-5 text-slate-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Room Settings</h1>
          <p className="text-sm text-slate-400">Configure names, floors, and descriptions for each room</p>
        </div>
      </div>

      <StatsSection />

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-40 rounded-2xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {rooms.map((room) => <RoomSettingsRow key={room.roomCode} room={room} />)}
        </div>
      )}
    </div>
  );
}
