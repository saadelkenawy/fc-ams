'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, GripVertical, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useLang } from '@/contexts/LanguageContext';
import { useToast } from '@/components/ui/Toast';
import { useAppointments } from '@/hooks/useAppointments';
import { useQueue } from '@/hooks/useQueue';
import { usePatientBatch } from '@/hooks/usePatients';
import { appointmentApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Appointment, RoomDetail } from '@fadl/types';

const MIN_BOX_PX = 52;
const PX_PER_MIN = 2.6;

type BoxState = 'in_service' | 'queued' | 'cancelled' | 'completed';

const STATE_STYLES: Record<BoxState, { box: string; chip: string; labelAr: string; labelEn: string }> = {
  in_service: {
    box: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-400 dark:border-emerald-600',
    chip: 'bg-emerald-500',
    labelAr: 'في الكشف الآن', labelEn: 'In service',
  },
  queued: {
    box: 'bg-sky-50 dark:bg-sky-950/40 border-sky-300 dark:border-sky-700',
    chip: 'bg-sky-400',
    labelAr: 'في الانتظار', labelEn: 'In queue',
  },
  cancelled: {
    box: 'bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800 opacity-75',
    chip: 'bg-red-500',
    labelAr: 'ملغي', labelEn: 'Cancelled',
  },
  completed: {
    box: 'bg-gray-100 dark:bg-neutral-800 border-gray-300 dark:border-neutral-600 opacity-80',
    chip: 'bg-gray-400',
    labelAr: 'انتهى الكشف', labelEn: 'Completed',
  },
};

function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

interface RoomTimelineModalProps {
  room: RoomDetail;
  date: string;
  onClose: () => void;
}

export function RoomTimelineModal({ room, date, onClose }: RoomTimelineModalProps) {
  const { lang, t } = useLang();
  const { toast } = useToast();
  const qc = useQueryClient();
  const doctorId = room.assignedDoctor?.id;

  const { data: apptsResp, isLoading } = useAppointments(
    doctorId ? { doctorId, date, limit: 100 } : {},
    { enabled: !!doctorId },
  );
  const appointments = useMemo(
    () => (apptsResp?.data ?? []).slice().sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [apptsResp],
  );
  const { data: queue = [] } = useQueue(doctorId ?? '', date, !!doctorId);
  const patientMap = usePatientBatch(appointments.map((a) => a.patientId));

  const inSession = useMemo(
    () => new Set(queue.filter((q) => q.status === 'in_session').map((q) => q.appointmentId)),
    [queue],
  );

  function boxState(a: Appointment): BoxState {
    if (a.status === 'Canc.' || a.status === 'Resch.' || a.status === 'Ref.') return 'cancelled';
    if (a.status === 'Comp.') return 'completed';
    if (inSession.has(a.id)) return 'in_service';
    return 'queued';
  }

  // Drag one appointment box onto another to swap their time slots.
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const swap = useMutation({
    mutationFn: async ({ a, b }: { a: Appointment; b: Appointment }) =>
      // Single atomic server call: the two slots are exchanged in one
      // transaction (one UPDATE statement), so a failure can never strand an
      // appointment on a temporary slot.
      appointmentApi.post('/appointments/swap', { appointmentIdA: a.id, appointmentIdB: b.id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      toast(t('تم تبديل الموعدين', 'Slots swapped'), 'success');
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      toast(msg ?? t('تعذّر تبديل الموعدين', 'Failed to swap slots'), 'error');
    },
  });

  function handleDrop(targetId: string) {
    setDropTargetId(null);
    if (!dragId || dragId === targetId || swap.isPending) return;
    const a = appointments.find((x) => x.id === dragId);
    const b = appointments.find((x) => x.id === targetId);
    setDragId(null);
    if (a && b) swap.mutate({ a, b });
  }

  // Proportional vertical timeline: boxes positioned by start time.
  const dayStart = appointments.length ? toMin(appointments[0].startTime) : 0;
  const dayEnd = appointments.length
    ? Math.max(...appointments.map((a) => toMin(a.endTime)))
    : 0;

  const docName = room.assignedDoctor
    ? (lang === 'ar' ? (room.assignedDoctor.nameAr ?? room.assignedDoctor.nameEn) : room.assignedDoctor.nameEn)
    : null;

  return (
    <Modal
      open
      onClose={onClose}
      title={`${room.roomCode ?? room.code} — ${t('الجدول الزمني', 'Timeline')}`}
      subtitle={docName ? `${t('د.', 'Dr.')} ${docName} · ${date}` : date}
      maxWidth="2xl"
    >
      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-4 text-xs text-gray-600 dark:text-gray-300">
        {(Object.keys(STATE_STYLES) as BoxState[]).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={cn('w-2.5 h-2.5 rounded-full', STATE_STYLES[k].chip)} />
            {lang === 'ar' ? STATE_STYLES[k].labelAr : STATE_STYLES[k].labelEn}
          </span>
        ))}
      </div>

      {!doctorId ? (
        <p className="py-10 text-center text-sm text-gray-400">
          {t('لا يوجد طبيب معيّن لهذه الغرفة في هذا اليوم', 'No doctor assigned to this room on this date')}
        </p>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-10 text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin me-2" />
          {t('جاري التحميل...', 'Loading...')}
        </div>
      ) : appointments.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-400">
          {t('لا توجد مواعيد في هذا اليوم', 'No appointments on this date')}
        </p>
      ) : (
        <div className="relative flex gap-3">
          {/* Hour ruler */}
          <div className="relative w-12 flex-shrink-0 text-[10px] font-mono text-gray-400" style={{ height: Math.max((dayEnd - dayStart) * PX_PER_MIN, MIN_BOX_PX) }}>
            {Array.from({ length: Math.ceil((dayEnd - dayStart) / 60) + 1 }, (_, i) => {
              const m = dayStart + i * 60;
              if (m > dayEnd) return null;
              return (
                <span key={i} className="absolute -translate-y-1/2" style={{ top: (m - dayStart) * PX_PER_MIN }} dir="ltr">
                  {String(Math.floor(m / 60)).padStart(2, '0')}:{String(m % 60).padStart(2, '0')}
                </span>
              );
            })}
          </div>

          {/* Appointment boxes */}
          <div className="relative flex-1" style={{ height: Math.max((dayEnd - dayStart) * PX_PER_MIN, MIN_BOX_PX) }}>
            {appointments.map((a) => {
              const st = boxState(a);
              const s = STATE_STYLES[st];
              const top = (toMin(a.startTime) - dayStart) * PX_PER_MIN;
              const h = Math.max((toMin(a.endTime) - toMin(a.startTime)) * PX_PER_MIN, MIN_BOX_PX);
              const name = patientMap.get(a.patientId);
              const display = name
                ? (lang === 'ar' ? (name.nameAr ?? name.nameEn) : name.nameEn)
                : `#${a.patientId.slice(-6).toUpperCase()}`;
              return (
                <div
                  key={a.id}
                  draggable={!swap.isPending}
                  onDragStart={() => setDragId(a.id)}
                  onDragEnd={() => { setDragId(null); setDropTargetId(null); }}
                  onDragOver={(e) => { e.preventDefault(); if (dragId && dragId !== a.id) setDropTargetId(a.id); }}
                  onDragLeave={() => setDropTargetId((p) => (p === a.id ? null : p))}
                  onDrop={(e) => { e.preventDefault(); handleDrop(a.id); }}
                  className={cn(
                    'absolute inset-x-0 rounded-xl border-2 px-3 py-1.5 cursor-grab active:cursor-grabbing transition-shadow flex items-center gap-2 overflow-hidden',
                    s.box,
                    dragId === a.id && 'opacity-50 shadow-lg',
                    dropTargetId === a.id && 'ring-2 ring-primary-500 ring-offset-1',
                  )}
                  style={{ top, height: h }}
                  title={t('اسحب لتبديل الموعد مع موعد آخر', 'Drag onto another box to swap slots')}
                >
                  <GripVertical className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{display}</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 font-mono flex items-center gap-1" dir="ltr">
                      <Clock className="w-3 h-3" />
                      {a.startTime.slice(0, 5)}–{a.endTime.slice(0, 5)}
                    </p>
                  </div>
                  <span className={cn('text-[10px] text-white px-2 py-0.5 rounded-full flex-shrink-0', s.chip)}>
                    {lang === 'ar' ? s.labelAr : s.labelEn}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {swap.isPending && (
        <p className="mt-3 text-xs text-gray-400 flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" />
          {t('جاري تبديل الموعدين...', 'Swapping slots...')}
        </p>
      )}
    </Modal>
  );
}
