'use client';

import { useState, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useRooms, useRoomSSE, useAutoAssignRoom, useReleaseRoom, useNextPatient } from '@/hooks/useRooms';
import { useQueue } from '@/hooks/useQueue';
import { useDoctors, useSpecialtyMap } from '@/hooks/useDoctors';
import { useDoctorsOnDate } from '@/hooks/useAppointments';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useLang } from '@/contexts/LanguageContext';
import { identityApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { RoomDetail, PatientQueueEntry, ApiResponse } from '@fadl/types';

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

type AssignStep = 'select' | 'confirm' | 'done';

function AssignDoctorModal({ room, initialDate, onClose }: { room: RoomDetail; initialDate: string; onClose: () => void }) {
  const [step, setStep]         = useState<AssignStep>('select');
  const [doctorId, setDoctorId] = useState('');
  const [date, setDate]         = useState(initialDate);
  const [fromTime, setFromTime] = useState('08:00');
  const [untilTime, setUntilTime] = useState('18:00');
  const [error, setError]       = useState('');
  const [assignedRoom, setAssignedRoom] = useState('');

  const { data: doctorsResp } = useDoctors();
  const allDoctors = doctorsResp?.data ?? [];

  const specialtyMap = useSpecialtyMap();

  // Lightweight fetch: which doctors have non-cancelled appointments on this date
  const { data: doctorDateEntries = [] } = useDoctorsOnDate(date);

  const doctorApptCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of doctorDateEntries) {
      counts.set(e.doctorId, e.appointmentCount);
    }
    return counts;
  }, [doctorDateEntries]);

  // Active doctors who have appointments on the selected date, sorted by count desc
  const doctorsWithAppts = useMemo(() =>
    allDoctors
      .filter((d) => d.isActive && doctorApptCounts.has(d.id))
      .sort((a, b) => (doctorApptCounts.get(b.id) ?? 0) - (doctorApptCounts.get(a.id) ?? 0)),
    [allDoctors, doctorApptCounts],
  );

  const selectedDoctor  = allDoctors.find((d) => d.id === doctorId);
  const specialtyName   = selectedDoctor ? (specialtyMap.get(selectedDoctor.specialtyId)?.nameEn ?? 'this specialty') : '';
  const apptCount       = doctorId ? (doctorApptCounts.get(doctorId) ?? 0) : 0;
  const autoAssign      = useAutoAssignRoom();

  const inputCls = 'w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:border-primary-500';
  const labelCls = 'block text-xs text-gray-500 dark:text-gray-400 mb-1';

  async function handleAutoAssign() {
    setError('');
    try {
      const result = await autoAssign.mutateAsync({ doctorId, date, fromTime, untilTime });
      setAssignedRoom(result.roomCode);
      setStep('done');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: { message?: string } } } };
      setError(err.response?.data?.error?.message ?? 'Auto-assign failed. No available rooms.');
    }
  }

  // ── Step: done ────────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <Modal open onClose={onClose} title="Room Assigned">
        <div className="flex flex-col gap-4">
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30 p-4 text-sm space-y-1.5 text-emerald-700 dark:text-emerald-300">
            <p className="font-semibold">✓ Room {assignedRoom} assigned successfully</p>
            <p>Dr. {selectedDoctor?.nameEn} → Room {assignedRoom} on {date}</p>
            <p>{apptCount} appointment{apptCount !== 1 ? 's' : ''} linked to this room</p>
          </div>
          <Button onClick={onClose} className="w-full">Close</Button>
        </div>
      </Modal>
    );
  }

  // ── Step: confirm ─────────────────────────────────────────────────────────
  if (step === 'confirm') {
    return (
      <Modal open onClose={onClose} title="Confirm Room Facilities">
        <div className="flex flex-col gap-4">
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 p-4 text-sm space-y-2">
            <p className="font-semibold text-gray-900 dark:text-gray-100">Dr. {selectedDoctor?.nameEn}</p>
            <p className="text-gray-600 dark:text-gray-400">
              Specialty: <span className="font-medium text-gray-900 dark:text-gray-100">{specialtyName}</span>
            </p>
            <p className="text-gray-600 dark:text-gray-400">
              {apptCount} appointment{apptCount !== 1 ? 's' : ''} on {date} · {fromTime}–{untilTime}
            </p>
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Please confirm the available room is fully equipped for{' '}
            <strong>{specialtyName}</strong> requirements before auto-assigning.
          </p>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setError(''); setStep('select'); }} disabled={autoAssign.isPending} className="flex-1">
              Back
            </Button>
            <Button
              onClick={() => { void handleAutoAssign(); }}
              disabled={autoAssign.isPending}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-60"
            >
              {autoAssign.isPending
                ? <span className="flex items-center gap-2 justify-center"><svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" /></svg>Assigning…</span>
                : 'Facilities Ready — Auto-Assign Room'}
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  // ── Step: select ──────────────────────────────────────────────────────────
  return (
    <Modal open onClose={onClose} title={`Assign Doctor to ${room.roomCode}`}>
      <div className="flex flex-col gap-4">
        <div>
          <label className={labelCls}>Room</label>
          <div className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 text-gray-900 dark:text-gray-100 text-sm">
            {room.roomCode}: {room.roomName}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {([['Date', 'date', date, setDate], ['From', 'time', fromTime, setFromTime], ['Until', 'time', untilTime, setUntilTime]] as const).map(([lbl, type, val, set]) => (
            <div key={lbl}>
              <label className={labelCls}>{lbl}</label>
              <input type={type} value={val} onChange={(e) => set(e.target.value)} className={inputCls} />
            </div>
          ))}
        </div>

        <div>
          <label className={labelCls}>
            Doctor
            {doctorsWithAppts.length > 0
              ? <span className="ms-1 text-emerald-600 dark:text-emerald-400">— {doctorsWithAppts.length} with appointments on {date}</span>
              : <span className="ms-1 text-amber-500">— none found for this date</span>}
          </label>
          <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className={inputCls}>
            <option value="">Select doctor…</option>
            {doctorsWithAppts.length > 0 ? (
              doctorsWithAppts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nameEn} · {doctorApptCounts.get(d.id)} appt{(doctorApptCounts.get(d.id) ?? 0) !== 1 ? 's' : ''}
                </option>
              ))
            ) : (
              allDoctors.filter((d) => d.isActive).map((d) => (
                <option key={d.id} value={d.id}>{d.nameEn} (no appointments)</option>
              ))
            )}
          </select>
          {doctorsWithAppts.length === 0 && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
              No doctors have appointments on this date. You can still assign manually.
            </p>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={() => setStep('confirm')} disabled={!doctorId} className="flex-1">
            Next: Confirm Facilities
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Release Confirm Modal ─────────────────────────────────────────────────────

function ReleaseConfirmModal({ room, onClose }: { room: RoomDetail; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [pwError, setPwError]   = useState('');
  const release = useReleaseRoom();
  const hasAppointments = room.appointmentsRemaining > 0;

  const verifyPw = useMutation({
    mutationFn: async (pw: string) => {
      const { data } = await identityApi.post<ApiResponse<{ valid: boolean }>>('/auth/verify-password', { password: pw });
      return data.data!;
    },
  });

  async function handleRelease() {
    if (hasAppointments) {
      if (!password) { setPwError('Password required to release a room with active appointments'); return; }
      let valid = false;
      try {
        const res = await verifyPw.mutateAsync(password);
        valid = res.valid;
      } catch {
        setPwError('Credential verification failed. Please try again.');
        return;
      }
      if (!valid) { setPwError('Incorrect password. Release cancelled.'); return; }
    }
    try {
      await release.mutateAsync({ roomCode: room.roomCode });
      onClose();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: { message?: string } } } };
      setPwError(err.response?.data?.error?.message ?? 'Release failed. Please retry.');
    }
  }

  const isPending = release.isPending || verifyPw.isPending;

  return (
    <Modal open onClose={onClose} title={`Release ${room.roomCode}`}>
      <div className="flex flex-col gap-4">
        {hasAppointments ? (
          <div className="rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 p-3.5 text-sm space-y-1.5">
            <p className="font-semibold text-red-700 dark:text-red-300">
              ⚠ {room.appointmentsRemaining} remaining appointment{room.appointmentsRemaining !== 1 ? 's' : ''} today
            </p>
            <p className="text-red-600 dark:text-red-400">
              Releasing this room will unassign those appointments. Enter your admin password to confirm.
            </p>
          </div>
        ) : (
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Release <strong>{room.roomCode}</strong>? The room will become available immediately.
          </p>
        )}

        {hasAppointments && (
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Admin Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setPwError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && password) void handleRelease(); }}
              placeholder="Enter your password to confirm"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:border-primary-500"
              autoFocus
              autoComplete="current-password"
            />
            {pwError && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{pwError}</p>}
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} disabled={isPending} className="flex-1">Back</Button>
          <Button
            onClick={() => { void handleRelease(); }}
            disabled={isPending || (hasAppointments && !password)}
            className="flex-1 bg-red-600 hover:bg-red-500 text-white disabled:opacity-60"
          >
            {isPending
              ? <span className="flex items-center gap-2 justify-center"><svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" /></svg>Processing…</span>
              : 'Release Room'}
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
        <AssignDoctorModal room={assignTarget} initialDate={today} onClose={() => setAssignTarget(null)} />
      )}
      {releaseTarget && (
        <ReleaseConfirmModal room={releaseTarget} onClose={() => setReleaseTarget(null)} />
      )}
    </>
  );
}
