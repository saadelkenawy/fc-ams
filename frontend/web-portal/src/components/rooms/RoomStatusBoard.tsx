'use client';

import { useState } from 'react';
import { useRooms, useRoomSSE, useAssignRoom, useReleaseRoom } from '@/hooks/useRooms';
import { useDoctors } from '@/hooks/useDoctors';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useLang } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';
import type { RoomDetail } from '@fadl/types';

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  occupied:  { color: '#10b981', dot: '●', labelEn: 'Occupied',  labelAr: 'مشغولة' },
  reserved:  { color: '#f59e0b', dot: '◑', labelEn: 'Reserved',  labelAr: 'محجوزة' },
  available: { color: '#64748b', dot: '●', labelEn: 'Available', labelAr: 'متاحة' },
  inactive:  { color: '#ef4444', dot: '✕', labelEn: 'Inactive',  labelAr: 'غير نشطة' },
} as const;

// ── Room Card ─────────────────────────────────────────────────────────────────

function RoomCard({
  room,
  onAssign,
  onRelease,
}: {
  room: RoomDetail;
  onAssign: (room: RoomDetail) => void;
  onRelease: (room: RoomDetail) => void;
}) {
  const { lang } = useLang();
  const cfg = STATUS_CONFIG[room.status];

  return (
    <div
      className={cn(
        'relative flex flex-col gap-3 rounded-2xl border p-5 transition-all duration-200',
        'bg-white/5 backdrop-blur-sm',
        room.status === 'occupied' ? 'border-emerald-500/30' :
        room.status === 'reserved' ? 'border-amber-500/30' :
        room.status === 'inactive' ? 'border-red-500/20 opacity-60' :
        'border-white/10',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xl font-bold text-white">{room.roomCode}</span>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ color: cfg.color, background: `${cfg.color}20` }}>
          {cfg.dot} {lang === 'ar' ? cfg.labelAr : cfg.labelEn}
        </span>
      </div>

      <p className="text-sm text-slate-400">{room.roomName}{room.floor != null ? ` · Floor ${room.floor}` : ''}</p>

      {/* Doctor info */}
      {room.assignedDoctor ? (
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium text-white truncate">
            {room.assignedDoctor.nameEn ?? `Dr. ${room.assignedDoctor.id.slice(0, 8)}`}
          </p>
          {room.assignedDoctor.specialtyNameEn && (
            <p className="text-xs text-slate-400 truncate">{room.assignedDoctor.specialtyNameEn}</p>
          )}
          {room.assignedDoctor.doctorStatus === 'on_his_way' && (
            <p className="text-xs text-amber-400">On his way…</p>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-500 italic">No doctor assigned</p>
      )}

      {/* Stats */}
      {room.status !== 'available' && room.status !== 'inactive' && (
        <div className="flex items-center gap-4 text-xs text-slate-400">
          <span>{room.appointmentsToday} total</span>
          <span className="text-slate-500">·</span>
          <span>{room.appointmentsRemaining} remaining</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-auto pt-2 border-t border-white/10">
        {(room.status === 'available' || room.status === 'inactive') && room.isActive && (
          <Button size="sm" variant="outline" onClick={() => onAssign(room)} className="flex-1 text-xs">
            Assign Doctor
          </Button>
        )}
        {(room.status === 'occupied' || room.status === 'reserved') && (
          <Button size="sm" variant="outline" onClick={() => onRelease(room)} className="flex-1 text-xs text-red-400 border-red-400/30 hover:bg-red-400/10">
            Release Room
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Assign Doctor Modal ───────────────────────────────────────────────────────

function AssignDoctorModal({
  room,
  onClose,
}: {
  room: RoomDetail;
  onClose: () => void;
}) {
  const today = new Date().toISOString().split('T')[0];
  const [doctorId, setDoctorId] = useState('');
  const [date, setDate] = useState(today);
  const [fromTime, setFromTime] = useState('08:00');
  const [untilTime, setUntilTime] = useState('18:00');
  const [error, setError] = useState('');

  const { data: doctorsResp } = useDoctors();
  const doctors = doctorsResp?.data ?? [];
  const assign = useAssignRoom();

  async function handleAssign() {
    if (!doctorId) { setError('Please select a doctor'); return; }
    setError('');
    try {
      const result = await assign.mutateAsync({ roomCode: room.roomCode, doctorId, date, fromTime, untilTime });
      const msg = `Dr. assigned to ${room.roomCode}. ${result.appointmentsUpdated} appointment${result.appointmentsUpdated !== 1 ? 's' : ''} updated automatically.`;
      alert(msg);
      onClose();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: { message?: string } } } };
      setError(err.response?.data?.error?.message ?? 'Assignment failed');
    }
  }

  return (
    <Modal open onClose={onClose} title={`Assign Doctor to ${room.roomCode}`}>
      <div className="flex flex-col gap-4">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Room</label>
          <div className="px-3 py-2 rounded-lg bg-white/5 text-white text-sm">{room.roomCode} — {room.roomName}</div>
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">Doctor</label>
          <select
            value={doctorId}
            onChange={(e) => setDoctorId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-primary-500"
          >
            <option value="">Select doctor…</option>
            {doctors.filter((d) => d.isActive).map((d) => (
              <option key={d.id} value={d.id}>{d.nameEn}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Date</label>
            <input
              type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-primary-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">From</label>
            <input
              type="time" value={fromTime} onChange={(e) => setFromTime(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-primary-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Until</label>
            <input
              type="time" value={untilTime} onChange={(e) => setUntilTime(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-primary-500"
            />
          </div>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={handleAssign} disabled={assign.isPending} className="flex-1">
            {assign.isPending ? 'Assigning…' : 'Assign'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Release Confirm ───────────────────────────────────────────────────────────

function ReleaseConfirmModal({ room, onClose }: { room: RoomDetail; onClose: () => void }) {
  const release = useReleaseRoom();

  async function handleRelease() {
    await release.mutateAsync({ roomCode: room.roomCode });
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={`Release ${room.roomCode}`}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-300">
          Release <strong>{room.roomCode}</strong>
          {room.assignedDoctor ? ` (currently assigned)` : ''}? The room will become available immediately.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Back</Button>
          <Button onClick={handleRelease} disabled={release.isPending} className="flex-1 bg-red-600 hover:bg-red-500">
            {release.isPending ? 'Releasing…' : 'Release Room'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Room Dots (sidebar indicator) ─────────────────────────────────────────────

export function RoomDots({ date }: { date?: string }) {
  const { data: rooms = [] } = useRooms(date);
  const statusColors = { occupied: '#10b981', reserved: '#f59e0b', available: '#64748b', inactive: '#ef4444' };

  return (
    <div className="flex items-center gap-1">
      {rooms.map((r) => (
        <div
          key={r.roomCode}
          title={`${r.roomCode} · ${r.status}`}
          className="w-2 h-2 rounded-full"
          style={{ background: statusColors[r.status] }}
        />
      ))}
    </div>
  );
}

// ── Main Board ────────────────────────────────────────────────────────────────

export function RoomStatusBoard({ date }: { date?: string }) {
  const { data: rooms = [], isLoading } = useRooms(date);
  const [assignTarget, setAssignTarget] = useState<RoomDetail | null>(null);
  const [releaseTarget, setReleaseTarget] = useState<RoomDetail | null>(null);

  useRoomSSE(date);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-48 rounded-2xl bg-white/5 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {rooms.map((room) => (
          <RoomCard
            key={room.roomCode}
            room={room}
            onAssign={setAssignTarget}
            onRelease={setReleaseTarget}
          />
        ))}
      </div>

      {assignTarget && (
        <AssignDoctorModal room={assignTarget} onClose={() => setAssignTarget(null)} />
      )}
      {releaseTarget && (
        <ReleaseConfirmModal room={releaseTarget} onClose={() => setReleaseTarget(null)} />
      )}
    </>
  );
}
