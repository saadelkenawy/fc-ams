'use client';

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
  const roomReady = isRoomReady(appointment, rooms);

  // Confirmations are frozen once the visit has started or closed.
  const locked = appointment.status !== 'TBC' && appointment.status !== 'Ok!';

  const mutation = useMutation({
    mutationFn: async (body: { doctorConfirmed?: boolean; patientConfirmed?: boolean; roomConfirmed?: boolean }) => {
      await appointmentApi.patch(`/appointments/${appointment.id}/confirmations`, {
        ...body,
        version: appointment.version,
      });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      qc.invalidateQueries({ queryKey: ['rooms'] });
    },
  });

  function toggle(seg: Segment, e: React.MouseEvent) {
    e.stopPropagation();
    if (locked || mutation.isPending) return;
    if (seg === 'doctor')  mutation.mutate({ doctorConfirmed:  !appointment.doctorConfirmed });
    if (seg === 'patient') mutation.mutate({ patientConfirmed: !appointment.patientConfirmed });
    // Room is auto-derived — clicking forces a one-time manual override.
    if (seg === 'room')    mutation.mutate({ roomConfirmed:    !roomReady });
  }

  const segs: Array<{ key: Segment; on: boolean; Icon: typeof User; ar: string; en: string }> = [
    { key: 'doctor',  on: appointment.doctorConfirmed,  Icon: Stethoscope, ar: 'الطبيب',  en: 'Doctor'  },
    { key: 'patient', on: appointment.patientConfirmed, Icon: User,        ar: 'المريض',  en: 'Patient' },
    { key: 'room',    on: roomReady,                    Icon: DoorOpen,    ar: 'الغرفة',  en: 'Room'    },
  ];
  const greenCount = segs.filter((s) => s.on).length;

  if (variant === 'compact') {
    return (
      <div className="inline-flex items-center gap-1" title={t(`${greenCount}/3 مؤكد`, `${greenCount}/3 confirmed`)}>
        {segs.map(({ key, on, Icon, ar, en }) => (
          <button
            key={key}
            type="button"
            onClick={(e) => toggle(key, e)}
            disabled={locked || mutation.isPending}
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
    <div className="space-y-2">
      {segs.map(({ key, on, Icon, ar, en }) => (
        <button
          key={key}
          type="button"
          onClick={(e) => toggle(key, e)}
          disabled={locked || mutation.isPending}
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
