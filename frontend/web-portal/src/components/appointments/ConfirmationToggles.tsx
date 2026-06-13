'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stethoscope, User, DoorOpen, Check, Loader2 } from 'lucide-react';
import { appointmentApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Appointment, RoomDetail } from '@fadl/types';

// ── Room readiness ────────────────────────────────────────────────────────────
// The clinic/room confirmation is auto-derived (never stored): the room
// assigned to the appointment — directly, or via the doctor's day assignment —
// must be active and still have free slots. Mirrors the server's
// computeRoomReady so the UI and the auto-confirm gate agree.
export function isRoomReady(appt: Appointment, rooms: RoomDetail[]): boolean {
  const room = rooms.find((r) =>
    (appt.roomCode && r.roomCode === appt.roomCode) ||
    r.assignedDoctor?.id === appt.doctorId,
  );
  if (!room) return false;
  return room.isActive && room.status !== 'inactive' && room.appointmentsRemaining > 0;
}

interface ConfirmationTogglesProps {
  appointment: Appointment;
  rooms: RoomDetail[];
  lang: 'ar' | 'en';
  t: (ar: string, en: string) => string;
  /** compact = row dots; full = labelled buttons for the popover */
  variant?: 'compact' | 'full';
}

type Segment = 'doctor' | 'patient' | 'room';

export function ConfirmationToggles({ appointment, rooms, lang, t, variant = 'compact' }: ConfirmationTogglesProps) {
  const qc = useQueryClient();

  // Local, self-consistent state seeded from props and advanced from each
  // mutation response. Necessary because some parents (the status modal) hold a
  // one-time snapshot that never refreshes — without this, a second toggle
  // would resend a stale `version` and 409, and the UI wouldn't reflect the
  // first toggle. Re-seeded whenever a different appointment is shown.
  const [doctorConfirmed, setDoctorConfirmed]   = useState(appointment.doctorConfirmed);
  const [patientConfirmed, setPatientConfirmed] = useState(appointment.patientConfirmed);
  const [status, setStatus]                     = useState(appointment.status);
  const [version, setVersion]                   = useState(appointment.version);
  // null = follow auto-derived room readiness; boolean = manual override.
  const [roomOverride, setRoomOverride]         = useState<boolean | null>(null);

  useEffect(() => {
    setDoctorConfirmed(appointment.doctorConfirmed);
    setPatientConfirmed(appointment.patientConfirmed);
    setStatus(appointment.status);
    setVersion(appointment.version);
    setRoomOverride(null);
  }, [appointment.id, appointment.version, appointment.doctorConfirmed, appointment.patientConfirmed, appointment.status]);

  const autoRoomReady = isRoomReady(appointment, rooms);
  const roomReady = roomOverride ?? autoRoomReady;

  // Confirmations are frozen once the visit has started or closed.
  const locked = status !== 'TBC' && status !== 'Ok!';

  const mutation = useMutation({
    mutationFn: async (body: { doctorConfirmed?: boolean; patientConfirmed?: boolean; roomConfirmed?: boolean }) => {
      const { data } = await appointmentApi.patch<{ data: Appointment }>(
        `/appointments/${appointment.id}/confirmations`,
        { ...body, version },
      );
      return data.data;
    },
    onSuccess: (updated) => {
      // Advance local state from the authoritative response.
      setDoctorConfirmed(updated.doctorConfirmed);
      setPatientConfirmed(updated.patientConfirmed);
      setStatus(updated.status);
      setVersion(updated.version);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      qc.invalidateQueries({ queryKey: ['rooms'] });
    },
  });

  function toggle(seg: Segment, e: React.MouseEvent) {
    e.stopPropagation();
    if (locked || mutation.isPending) return;
    if (seg === 'doctor')  mutation.mutate({ doctorConfirmed:  !doctorConfirmed });
    if (seg === 'patient') mutation.mutate({ patientConfirmed: !patientConfirmed });
    // Room is auto-derived — clicking forces a manual override for this call.
    if (seg === 'room') {
      const next = !roomReady;
      setRoomOverride(next);
      mutation.mutate({ roomConfirmed: next });
    }
  }

  const segs: Array<{ key: Segment; on: boolean; Icon: typeof User; ar: string; en: string }> = [
    { key: 'doctor',  on: doctorConfirmed,  Icon: Stethoscope, ar: 'الطبيب',  en: 'Doctor'  },
    { key: 'patient', on: patientConfirmed, Icon: User,        ar: 'المريض',  en: 'Patient' },
    { key: 'room',    on: roomReady,        Icon: DoorOpen,    ar: 'الغرفة',  en: 'Room'    },
  ];
  const greenCount = segs.filter((s) => s.on).length;

  if (variant === 'compact') {
    return (
      <div className="inline-flex items-center gap-1" data-testid="confirm-toggles-compact" data-confirmed={String(greenCount)} title={t(`${greenCount}/3 مؤكد`, `${greenCount}/3 confirmed`)}>
        {segs.map(({ key, on, Icon, ar, en }) => (
          <button
            key={key}
            type="button"
            onClick={(e) => toggle(key, e)}
            disabled={locked || mutation.isPending}
            data-testid={`confirm-${key}`}
            data-on={on ? 'true' : 'false'}
            title={`${lang === 'ar' ? ar : en}${on ? ' ✓' : ''}${key === 'room' ? t(' (تلقائي)', ' (auto)') : ''}`}
            className={cn(
              'w-5 h-5 rounded-full flex items-center justify-center transition-all',
              on
                ? 'bg-emerald-500 text-white shadow-sm'
                : 'bg-gray-100 dark:bg-neutral-700 text-gray-400 dark:text-gray-500',
              !locked && 'hover:ring-2 hover:ring-emerald-300 dark:hover:ring-emerald-700 cursor-pointer',
              locked && 'opacity-60 cursor-default',
            )}
          >
            <Icon className="w-2.5 h-2.5" />
          </button>
        ))}
      </div>
    );
  }

  // full variant — labelled toggles for the status popover/modal
  return (
    <div className="space-y-2" data-testid="confirm-toggles-full" data-confirmed={String(greenCount)} data-status={status}>
      {segs.map(({ key, on, Icon, ar, en }) => (
        <button
          key={key}
          type="button"
          onClick={(e) => toggle(key, e)}
          disabled={locked || mutation.isPending}
          data-testid={`confirm-${key}`}
          data-on={on}
          className={cn(
            'w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all text-sm font-medium',
            on
              ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
              : 'border-gray-100 dark:border-neutral-700 text-gray-600 dark:text-gray-300 hover:border-gray-200 dark:hover:border-neutral-600',
            locked && 'opacity-60 cursor-not-allowed',
          )}
        >
          <span className="flex items-center gap-2.5">
            <Icon className="w-4 h-4" />
            {lang === 'ar' ? ar : en}
            {key === 'room' && (
              <span className="text-[10px] font-normal text-gray-400">{t('تلقائي', 'auto')}</span>
            )}
          </span>
          {on ? <Check className="w-4 h-4" /> : <span className="w-4 h-4 rounded-full border-2 border-current opacity-30" />}
        </button>
      ))}
      <p className="text-xs text-center pt-1 text-gray-500 dark:text-gray-400">
        {mutation.isPending ? (
          <span className="inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />{t('جاري الحفظ...', 'Saving...')}</span>
        ) : greenCount === 3 ? (
          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{t('مؤكد بالكامل — تم تأكيد الموعد', 'All confirmed — appointment is now Confirmed')}</span>
        ) : (
          t(`${greenCount}/3 مؤكد — في الانتظار`, `${greenCount}/3 confirmed — pending`)
        )}
      </p>
    </div>
  );
}
