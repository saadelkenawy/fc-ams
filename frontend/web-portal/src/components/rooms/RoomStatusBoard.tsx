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
  occupied: {
    label:    { en: 'Occupied',  ar: 'مشغولة'   },
    card:     'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/40',
    badge:    'text-red-700 dark:text-red-400',
    dot:      'bg-red-500',
    dotPulse: true,
    progress: 'bg-red-500',
  },
  reserved: {
    label:    { en: 'Reserved',  ar: 'محجوزة'   },
    card:     'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40',
    badge:    'text-amber-700 dark:text-amber-400',
    dot:      'bg-amber-500',
    dotPulse: false,
    progress: 'bg-amber-500',
  },
  available: {
    label:    { en: 'Available', ar: 'متاحة'    },
    card:     'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40',
    badge:    'text-emerald-700 dark:text-emerald-400',
    dot:      'bg-emerald-500',
    dotPulse: false,
    progress: 'bg-emerald-500',
  },
  cleaning: {
    label:    { en: 'Cleaning',  ar: 'تنظيف'   },
    card:     'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40',
    badge:    'text-amber-700 dark:text-amber-400',
    dot:      'bg-amber-400',
    dotPulse: false,
    progress: 'bg-amber-400',
  },
  inactive: {
    label:    { en: 'Inactive',  ar: 'غير نشطة' },
    card:     'bg-gray-50 dark:bg-neutral-800/30 border-gray-200 dark:border-neutral-700',
    badge:    'text-gray-400 dark:text-gray-500',
    dot:      'bg-gray-400',
    dotPulse: false,
    progress: 'bg-gray-400',
  },
} as const;

// ── Session progress bar ──────────────────────────────────────────────────────

function SessionProgress({ done, total, color }: { done: number; total: number; color: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 rounded-full bg-gray-200 dark:bg-neutral-700 overflow-hidden">
        <div
          className={cn('h-full w-full origin-left transition-transform duration-700', color)}
          style={{ transform: `scaleX(${pct / 100})` }}
        />
      </div>
      <span className="text-[10px] font-mono tabular-nums text-gray-500 w-8 text-end">{done}/{total}</span>
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
        ? 'bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-300'
        : 'bg-gray-100 dark:bg-neutral-800 text-gray-500 dark:text-gray-400',
    )}>
      <span className={cn(
        'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0',
        isCurrent
          ? 'bg-emerald-500 text-white'
          : 'bg-gray-200 dark:bg-neutral-700 text-gray-600 dark:text-gray-300',
      )}>
        {entry.position}
      </span>
      <span className="truncate flex-1">{label}</span>
      {!isCurrent && entry.estimatedWaitMinutes != null && (
        <span className="text-[10px] text-gray-400 flex-shrink-0">~{entry.estimatedWaitMinutes}m</span>
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
      // error surfaced via isError below
    }
  }

  return (
    <Modal open onClose={onClose} title={`Next Patient: ${room.roomCode}`}>
      <div className="flex flex-col gap-4">
        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30 p-3.5 text-sm space-y-1.5 text-emerald-700 dark:text-emerald-300">
          <p>✓ Current session will be marked complete</p>
          <p>✓ Billing record will be created automatically</p>
          {nextEntry
            ? <p>✓ Patient #{nextEntry.position} will be called next</p>
            : <p className="text-gray-500">No more patients waiting; queue will be empty</p>}
        </div>
        {nextPatient.isError && (
          <p className="text-xs text-red-600 dark:text-red-400">
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
  const { lang, t } = useLang();
  const [expanded, setExpanded] = useState(false);
  const [showNextModal, setShowNextModal] = useState(false);

  const cfg = STATUS_CONFIG[room.status] ?? STATUS_CONFIG.inactive;
  const canExpand = room.status !== 'inactive';
  const hasDoctor = !!room.assignedDoctor?.id;

  const doctorId = room.assignedDoctor?.id ?? '';
  const { data: queue = [] } = useQueue(doctorId, date, expanded && hasDoctor);

  const inSessionEntry = queue.find((q) => q.status === 'in_session');
  const calledEntry    = queue.find((q) => q.status === 'called');
  const currentEntry   = inSessionEntry ?? calledEntry ?? null;
  const waitingEntries = queue.filter((q) => q.status === 'waiting').slice(0, 3);
  const nextWaiting    = waitingEntries[0] ?? null;

  const done       = room.appointmentsToday - room.appointmentsRemaining;
  const doctorName = room.assignedDoctor?.nameEn ?? (hasDoctor ? 'Unknown Doctor' : null);
  const isActive   = room.status === 'occupied' || room.status === 'reserved';

  return (
    <>
      <div className={cn(
        'relative flex flex-col rounded-xl border transition-all duration-200 overflow-hidden hover:shadow-md',
        cfg.card,
        room.status === 'inactive' && 'opacity-60',
      )}>

        {/* ── Always-visible header ──────────────────────────────────────── */}
        <button
          onClick={() => canExpand && setExpanded((v) => !v)}
          className={cn('flex flex-col gap-2.5 p-5 text-start w-full', canExpand && 'cursor-pointer')}
          disabled={!canExpand}
        >
          {/* Room code + status */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-lg bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 flex items-center justify-center font-bold text-gray-900 dark:text-gray-100 shadow-sm flex-shrink-0 text-sm">
                {room.roomCode}
              </span>
              <div>
                <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm leading-tight">
                  {room.roomName}{room.floor != null ? ` · Floor ${room.floor}` : ''}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {doctorName ?? t('لا يوجد طبيب', 'No doctor assigned')}
                </p>
              </div>
            </div>

            {/* Status badge */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className={cn(
                'w-2 h-2 rounded-full flex-shrink-0',
                cfg.dot,
                cfg.dotPulse && 'animate-pulse',
              )} />
              <span className={cn('text-xs font-semibold', cfg.badge)}>
                {lang === 'ar' ? cfg.label.ar : cfg.label.en}
              </span>
            </div>
          </div>

          {/* Doctor specialty */}
          {room.assignedDoctor?.specialtyNameEn && (
            <p className="text-xs text-gray-400 dark:text-gray-500 -mt-1">
              {room.assignedDoctor.specialtyNameEn}
            </p>
          )}

          {/* Progress bar */}
          {isActive && room.appointmentsToday > 0 && (
            <SessionProgress done={done} total={room.appointmentsToday} color={cfg.progress} />
          )}
          {isActive && room.appointmentsToday === 0 && (
            <p className="text-xs text-gray-500">{room.appointmentsRemaining} patients remaining</p>
          )}

          {/* Occupied patient pill */}
          {room.status === 'occupied' && currentEntry == null && isActive && (
            <p className="text-xs text-gray-400 italic">{t('لا توجد جلسة نشطة', 'No active session')}</p>
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
          <div className="border-t border-gray-200 dark:border-neutral-700 px-5 pt-3.5 pb-5 flex flex-col gap-3">

            {/* Queue list */}
            {isActive && (
              <div className="flex flex-col gap-1.5">
                <p className="text-[10px] uppercase tracking-widest text-gray-400 dark:text-gray-500 font-medium mb-0.5">
                  {t('قائمة الانتظار', 'Queue')}
                </p>
                {currentEntry
                  ? <QueuePill entry={currentEntry} isCurrent />
                  : <p className="text-xs text-gray-400 italic">{t('لا توجد جلسة نشطة', 'No active session')}</p>
                }
                {waitingEntries.length > 0
                  ? waitingEntries.map((e) => <QueuePill key={e.id} entry={e} isCurrent={false} />)
                  : currentEntry === null && (
                    <p className="text-xs text-gray-400 italic">{t('لا يوجد مرضى في الانتظار', 'No patients waiting')}</p>
                  )
                }
                {room.appointmentsRemaining > waitingEntries.length + (currentEntry ? 1 : 0) && (
                  <p className="text-[10px] text-gray-400 ps-2">
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
                  {t('المريض التالي ←', 'Next Patient →')}
                </Button>
              )}
              {room.status === 'available' && room.isActive && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onAssign(room)}
                  className="w-full text-xs"
                >
                  {t('تعيين طبيب', 'Assign Doctor')}
                </Button>
              )}
              {isActive && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onRelease(room)}
                  className="w-full text-xs text-red-600 dark:text-red-400 border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                >
                  {t('تحرير الغرفة', 'Release Room')}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* ── Chevron toggle ─────────────────────────────────────────────── */}
        {canExpand && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="absolute bottom-2.5 end-2.5 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
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

  const inputCls = 'w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:border-primary-500';
  const labelCls = 'block text-xs text-gray-500 dark:text-gray-400 mb-1';

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
          <label className={labelCls}>Room</label>
          <div className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 text-gray-900 dark:text-gray-100 text-sm">
            {room.roomCode}: {room.roomName}
          </div>
        </div>
        <div>
          <label className={labelCls}>Doctor</label>
          <select
            value={doctorId}
            onChange={(e) => setDoctorId(e.target.value)}
            className={inputCls}
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
              <label className={labelCls}>{lbl}</label>
              <input
                type={type}
                value={val}
                onChange={(e) => set(e.target.value)}
                className={inputCls}
              />
            </div>
          ))}
        </div>
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
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
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Release <strong>{room.roomCode}</strong>? The room will become available immediately.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Back</Button>
          <Button
            onClick={() => { void release.mutateAsync({ roomCode: room.roomCode }).then(onClose); }}
            disabled={release.isPending}
            className="flex-1 bg-red-600 hover:bg-red-500 text-white"
          >
            {release.isPending ? 'Releasing…' : 'Release Room'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Room status dots (sidebar widget) ────────────────────────────────────────

export function RoomDots({ date }: { date?: string }) {
  const { data: rooms = [] } = useRooms(date);
  const colors = { occupied: '#ef4444', reserved: '#f59e0b', available: '#10b981', cleaning: '#f59e0b', inactive: '#9ca3af' };
  return (
    <div className="flex items-center gap-1">
      {rooms.map((r) => (
        <div
          key={r.roomCode}
          title={`${r.roomCode} · ${r.status}`}
          className="w-2 h-2 rounded-full"
          style={{ background: colors[r.status as keyof typeof colors] ?? '#9ca3af' }}
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
          <div key={i} className="h-44 rounded-xl bg-gray-100 dark:bg-neutral-800 animate-pulse" />
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
