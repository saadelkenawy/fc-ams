'use client';

import { useState } from 'react';
import { useRooms, useRoomSSE, useAssignRoom, useReleaseRoom, useNextPatient } from '@/hooks/useRooms';
import { useQueue } from '@/hooks/useQueue';
import { useDoctors } from '@/hooks/useDoctors';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useLang } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';
import type { RoomDetail, PatientQueueEntry } from '@fadl/types';

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  occupied:  {
    label: { en: 'Occupied',  ar: 'مشغولة'   },
    ring: 'ring-1 ring-emerald-500/30 bg-emerald-500/[0.04]',
    badge: 'text-emerald-400 bg-emerald-500/15',
    dot: 'bg-emerald-400 shadow-[0_0_6px_#10b981]',
    progress: 'bg-emerald-500',
  },
  reserved:  {
    label: { en: 'Reserved',  ar: 'محجوزة'   },
    ring: 'ring-1 ring-amber-500/30 bg-amber-500/[0.04]',
    badge: 'text-amber-400 bg-amber-500/15',
    dot: 'bg-amber-400 shadow-[0_0_6px_#f59e0b]',
    progress: 'bg-amber-500',
  },
  available: {
    label: { en: 'Available', ar: 'متاحة'    },
    ring: 'ring-1 ring-white/10 bg-white/[0.03]',
    badge: 'text-slate-400 bg-slate-500/15',
    dot: 'bg-slate-600',
    progress: 'bg-slate-500',
  },
  inactive:  {
    label: { en: 'Inactive',  ar: 'غير نشطة' },
    ring: 'ring-1 ring-red-500/20 bg-red-500/[0.03]',
    badge: 'text-red-400 bg-red-500/15',
    dot: 'bg-red-400',
    progress: 'bg-red-500',
  },
} as const;

// ── Session progress bar ──────────────────────────────────────────────────────

function SessionProgress({ done, total, color }: { done: number; total: number; color: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-700', color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] text-slate-500 tabular-nums w-8 text-right">{done}/{total}</span>
    </div>
  );
}

// ── Queue pill ────────────────────────────────────────────────────────────────

function QueuePill({ entry, isCurrent }: { entry: PatientQueueEntry; isCurrent: boolean }) {
  const label = isCurrent
    ? entry.status === 'called' ? 'Called, waiting to enter' : 'In Session'
    : `Patient #${entry.position}`;
  return (
    <div className={cn(
      'flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-all',
      isCurrent
        ? 'bg-emerald-500/15 border border-emerald-500/25 text-emerald-300'
        : 'bg-white/5 text-slate-400',
    )}>
      <span className={cn(
        'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0',
        isCurrent ? 'bg-emerald-500 text-black' : 'bg-white/10 text-slate-300',
      )}>
        {entry.position}
      </span>
      <span className="truncate flex-1">{label}</span>
      {!isCurrent && entry.estimatedWaitMinutes != null && (
        <span className="text-[10px] text-slate-500 flex-shrink-0">~{entry.estimatedWaitMinutes}m</span>
      )}
    </div>
  );
}

// ── Next-patient confirm modal ─────────────────────────────────────────────────

function NextPatientModal({
  room,
  currentEntry,
  nextEntry,
  onClose,
}: {
  room: RoomDetail;
  currentEntry: PatientQueueEntry;
  nextEntry: PatientQueueEntry | null;
  onClose: () => void;
}) {
  const nextPatient = useNextPatient();

  async function handleConfirm() {
    try {
      await nextPatient.mutateAsync({ roomCode: room.roomCode, appointmentId: currentEntry.appointmentId });
      onClose();
    } catch {
      // error is surfaced via isPending state; modal stays open
    }
  }

  return (
    <Modal open onClose={onClose} title={`Next Patient: ${room.roomCode}`}>
      <div className="flex flex-col gap-4">
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3.5 text-sm space-y-1.5 text-emerald-300">
          <p>✓ Current session will be marked complete</p>
          <p>✓ Billing record will be created automatically</p>
          {nextEntry
            ? <p>✓ Patient #{nextEntry.position} will be called next</p>
            : <p className="text-slate-400">No more patients waiting; queue will be empty</p>}
        </div>
        {nextPatient.isError && (
          <p className="text-xs text-red-400">
            {(nextPatient.error as { response?: { data?: { error?: { message?: string } } } })
              ?.response?.data?.error?.message ?? 'Operation failed. Please retry.'}
          </p>
        )}
        <div className="flex gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={nextPatient.isPending} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={() => { void handleConfirm(); }}
            disabled={nextPatient.isPending}
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-60"
          >
            {nextPatient.isPending ? (
              <span className="flex items-center gap-2 justify-center">
                <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" />
                </svg>
                Processing…
              </span>
            ) : 'Confirm & Call Next'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Room Card ─────────────────────────────────────────────────────────────────

function RoomCard({
  room,
  date,
  onAssign,
  onRelease,
}: {
  room: RoomDetail;
  date: string;
  onAssign: (r: RoomDetail) => void;
  onRelease: (r: RoomDetail) => void;
}) {
  const { lang } = useLang();
  const [expanded, setExpanded] = useState(false);
  const [showNextModal, setShowNextModal] = useState(false);

  const cfg = STATUS_CONFIG[room.status];
  const canExpand = room.status !== 'inactive';
  const hasDoctor = !!room.assignedDoctor?.id;

  const doctorId = room.assignedDoctor?.id ?? '';
  const { data: queue = [] } = useQueue(doctorId, date, expanded && hasDoctor);

  const inSessionEntry = queue.find((q) => q.status === 'in_session');
  const calledEntry    = queue.find((q) => q.status === 'called');
  const currentEntry   = inSessionEntry ?? calledEntry ?? null;
  const waitingEntries = queue.filter((q) => q.status === 'waiting').slice(0, 3);
  const nextWaiting    = waitingEntries[0] ?? null;

  const done = room.appointmentsToday - room.appointmentsRemaining;
  const doctorName = room.assignedDoctor?.nameEn ?? (hasDoctor ? 'Unknown Doctor' : null);
  const isActive = room.status === 'occupied' || room.status === 'reserved';

  return (
    <>
      <div className={cn(
        'relative flex flex-col rounded-2xl transition-all duration-200 overflow-hidden',
        cfg.ring,
        room.status === 'inactive' && 'opacity-60',
      )}>

        {/* ── Always-visible header ──────────────────────────────────────── */}
        <button
          onClick={() => canExpand && setExpanded((v) => !v)}
          className={cn('flex flex-col gap-2.5 p-5 text-left w-full', canExpand && 'cursor-pointer')}
          disabled={!canExpand}
        >
          {/* Room code + status */}
          <div className="flex items-start justify-between gap-2">
            <span className="text-2xl font-bold text-white tracking-tight leading-none">{room.roomCode}</span>
            <span className={cn('flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0', cfg.badge)}>
              <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', cfg.dot)} />
              {lang === 'ar' ? cfg.label.ar : cfg.label.en}
            </span>
          </div>

          {/* Room subtitle */}
          <p className="text-xs text-slate-500 -mt-1">
            {room.roomName}{room.floor != null ? ` · Floor ${room.floor}` : ''}
          </p>

          {/* Doctor */}
          {doctorName ? (
            <div>
              <p className="text-sm font-medium text-white truncate">{doctorName}</p>
              {room.assignedDoctor?.specialtyNameEn && (
                <p className="text-xs text-slate-400 mt-0.5">{room.assignedDoctor.specialtyNameEn}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500 italic">No doctor assigned</p>
          )}

          {/* Progress bar */}
          {isActive && room.appointmentsToday > 0 && (
            <SessionProgress done={done} total={room.appointmentsToday} color={cfg.progress} />
          )}
          {isActive && room.appointmentsToday === 0 && (
            <p className="text-xs text-slate-500">{room.appointmentsRemaining} patients remaining</p>
          )}
        </button>

        {/* ── Expandable content ─────────────────────────────────────────── */}
        <div
          className={cn(
            'transition-all duration-300 ease-in-out overflow-hidden',
            expanded ? 'max-h-80 opacity-100' : 'max-h-0 opacity-0 pointer-events-none',
          )}
          aria-hidden={!expanded}
        >
          <div className="border-t border-white/10 px-5 pt-3.5 pb-5 flex flex-col gap-3">

            {/* Queue list */}
            {isActive && (
              <div className="flex flex-col gap-1.5">
                <p className="text-[10px] uppercase tracking-widest text-slate-600 font-medium mb-0.5">Queue</p>
                {currentEntry
                  ? <QueuePill entry={currentEntry} isCurrent />
                  : <p className="text-xs text-slate-500 italic">No active session</p>
                }
                {waitingEntries.length > 0
                  ? waitingEntries.map((e) => <QueuePill key={e.id} entry={e} isCurrent={false} />)
                  : currentEntry === null && (
                    <p className="text-xs text-slate-500 italic">No patients waiting</p>
                  )
                }
                {room.appointmentsRemaining > waitingEntries.length + (currentEntry ? 1 : 0) && (
                  <p className="text-[10px] text-slate-500 pl-2">
                    +{room.appointmentsRemaining - waitingEntries.length - (currentEntry ? 1 : 0)} more waiting
                  </p>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-2">
              {room.status === 'occupied' && currentEntry && (
                <Button
                  size="sm"
                  onClick={() => setShowNextModal(true)}
                  className="w-full text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  Next Patient →
                </Button>
              )}
              {room.status === 'available' && room.isActive && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onAssign(room)}
                  className="w-full text-xs"
                >
                  Assign Doctor
                </Button>
              )}
              {isActive && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onRelease(room)}
                  className="w-full text-xs text-red-400 border-red-400/30 hover:bg-red-400/10"
                >
                  Release Room
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* ── Chevron toggle ─────────────────────────────────────────────── */}
        {canExpand && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="absolute bottom-2.5 right-2.5 w-5 h-5 flex items-center justify-center text-slate-600 hover:text-slate-400 transition-colors"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              className={cn('transition-transform duration-300', expanded && 'rotate-180')}
            >
              <path d="M1.5 3.5L5 7L8.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>

      {showNextModal && currentEntry && (
        <NextPatientModal
          room={room}
          currentEntry={currentEntry}
          nextEntry={nextWaiting}
          onClose={() => setShowNextModal(false)}
        />
      )}
    </>
  );
}

// ── Assign Doctor Modal ───────────────────────────────────────────────────────

function AssignDoctorModal({ room, onClose }: { room: RoomDetail; onClose: () => void }) {
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
      alert(`Dr. assigned to ${room.roomCode}. ${result.appointmentsUpdated} appointment${result.appointmentsUpdated !== 1 ? 's' : ''} updated.`);
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
          <div className="px-3 py-2 rounded-lg bg-white/5 text-white text-sm">{room.roomCode}: {room.roomName}</div>
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
          {([['Date', 'date', date, setDate], ['From', 'time', fromTime, setFromTime], ['Until', 'time', untilTime, setUntilTime]] as const).map(([lbl, type, val, set]) => (
            <div key={lbl}>
              <label className="block text-xs text-slate-400 mb-1">{lbl}</label>
              <input
                type={type}
                value={val}
                onChange={(e) => set(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-primary-500"
              />
            </div>
          ))}
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={() => { void handleAssign(); }} disabled={assign.isPending} className="flex-1">
            {assign.isPending ? 'Assigning…' : 'Assign'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Release Confirm Modal ─────────────────────────────────────────────────────

function ReleaseConfirmModal({ room, onClose }: { room: RoomDetail; onClose: () => void }) {
  const release = useReleaseRoom();
  return (
    <Modal open onClose={onClose} title={`Release ${room.roomCode}`}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-300">
          Release <strong>{room.roomCode}</strong>? The room will become available immediately.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Back</Button>
          <Button
            onClick={() => { void release.mutateAsync({ roomCode: room.roomCode }).then(onClose); }}
            disabled={release.isPending}
            className="flex-1 bg-red-600 hover:bg-red-500"
          >
            {release.isPending ? 'Releasing…' : 'Release Room'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Room status dots (sidebar) ────────────────────────────────────────────────

export function RoomDots({ date }: { date?: string }) {
  const { data: rooms = [] } = useRooms(date);
  const colors = { occupied: '#10b981', reserved: '#f59e0b', available: '#64748b', inactive: '#ef4444' };
  return (
    <div className="flex items-center gap-1">
      {rooms.map((r) => (
        <div
          key={r.roomCode}
          title={`${r.roomCode} · ${r.status}`}
          className="w-2 h-2 rounded-full"
          style={{ background: colors[r.status] }}
        />
      ))}
    </div>
  );
}

// ── Main Board ────────────────────────────────────────────────────────────────

export function RoomStatusBoard({ date }: { date?: string }) {
  const today = date ?? new Date().toISOString().split('T')[0];
  const { data: rooms = [], isLoading } = useRooms(today);
  const [assignTarget, setAssignTarget] = useState<RoomDetail | null>(null);
  const [releaseTarget, setReleaseTarget] = useState<RoomDetail | null>(null);

  useRoomSSE(today);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-44 rounded-2xl bg-white/5 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 items-start">
        {rooms.map((room) => (
          <RoomCard
            key={room.roomCode}
            room={room}
            date={today}
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
