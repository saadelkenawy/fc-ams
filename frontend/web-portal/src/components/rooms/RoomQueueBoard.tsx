'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Clock, GripVertical, Loader2, BellOff, DoorOpen, Stethoscope,
  CalendarPlus, MoreHorizontal, Check, CheckCircle2, CalendarClock, Pencil, UserCheck,
} from 'lucide-react';
import { useRooms, useRoomSSE } from '@/hooks/useRooms';
import { useQueue } from '@/hooks/useQueue';
import { useAppointments } from '@/hooks/useAppointments';
import { usePatientBatch } from '@/hooks/usePatients';
import { useLang } from '@/contexts/LanguageContext';
import { useToast } from '@/components/ui/Toast';
import { appointmentApi } from '@/lib/api';
import { cn, localDateISO } from '@/lib/utils';
import type { Appointment, PatientQueueEntry, RoomDetail } from '@fadl/types';
import { AssignDoctorModal, ReleaseConfirmModal } from './RoomStatusBoard';
import { RoomTimelineModal } from './RoomTimelineModal';

// ── Row state model ───────────────────────────────────────────────────────────
// Four legend states (matching RoomTimelineModal) + an "assigned" state for
// scheduled appointments that have not checked into the queue yet.

type RowState = 'in_service' | 'queued' | 'assigned' | 'cancelled' | 'completed';

const STATE_STYLES: Record<RowState, {
  bar: string; rail: string; dot: string; labelAr: string; labelEn: string;
}> = {
  in_service: {
    bar:  'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700',
    rail: 'bg-emerald-500', dot: 'bg-emerald-500',
    labelAr: 'في الكشف الآن', labelEn: 'In service',
  },
  queued: {
    bar:  'bg-sky-50 dark:bg-sky-950/40 border-sky-300 dark:border-sky-700',
    rail: 'bg-sky-400', dot: 'bg-sky-400',
    labelAr: 'في الانتظار', labelEn: 'In queue',
  },
  assigned: {
    bar:  'bg-violet-50 dark:bg-violet-950/40 border-violet-200 dark:border-violet-800',
    rail: 'bg-violet-400', dot: 'bg-violet-400',
    labelAr: 'تم التعيين', labelEn: 'Assigned',
  },
  cancelled: {
    bar:  'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 opacity-80',
    rail: 'bg-rose-400', dot: 'bg-rose-400',
    labelAr: 'ملغي', labelEn: 'Cancelled',
  },
  completed: {
    bar:  'bg-gray-100 dark:bg-neutral-800 border-gray-200 dark:border-neutral-600 opacity-85',
    rail: 'bg-gray-400', dot: 'bg-gray-400',
    labelAr: 'انتهى الكشف', labelEn: 'Completed',
  },
};

// Legend mirrors the mockup: four states only. The "assigned" state still
// renders its own row badge ("Provider Assigned") but is intentionally omitted
// from the legend strip to match queue.png.
const LEGEND: RowState[] = ['in_service', 'queued', 'cancelled', 'completed'];

function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

// ── Timeline panel for one active room ─────────────────────────────────────────

const ROW_H = 48;        // px height of each appointment lane
const ROW_GAP = 18;      // px vertical gap between lanes (room for the connector elbow)
const MIN_BAR_PCT = 22;  // floor on bar width so name + time stay readable
const GUTTER_W = 44;     // px left time-gutter
const BADGE_W = 184;     // px fixed status-badge column
const CHECK_W = 28;      // px right completion-check column

function RoomTimelinePanel({
  room, date, onRelease, onTimeline,
}: {
  room: RoomDetail;
  date: string;
  onRelease: (r: RoomDetail) => void;
  onTimeline: (r: RoomDetail) => void;
}) {
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

  const queueByAppt = useMemo(() => {
    const m = new Map<string, PatientQueueEntry>();
    for (const q of queue) m.set(q.appointmentId, q);
    return m;
  }, [queue]);

  function rowState(a: Appointment): RowState {
    if (a.status === 'Canc.' || a.status === 'Resch.' || a.status === 'Ref.') return 'cancelled';
    if (a.status === 'Comp.') return 'completed';
    const q = queueByAppt.get(a.id);
    if (q?.status === 'in_session') return 'in_service';
    if (q) return 'queued';
    return 'assigned';
  }

  // ── Drag to swap two slots (atomic server call) ─────────────────────────────
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);
  const swap = useMutation({
    mutationFn: ({ a, b }: { a: Appointment; b: Appointment }) =>
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
    setDropId(null);
    if (!dragId || dragId === targetId || swap.isPending) return;
    const a = appointments.find((x) => x.id === dragId);
    const b = appointments.find((x) => x.id === targetId);
    setDragId(null);
    if (a && b) swap.mutate({ a, b });
  }

  // ── Horizontal time scale ───────────────────────────────────────────────────
  const dayStart = appointments.length ? toMin(appointments[0].startTime) : 8 * 60;
  const dayEnd = appointments.length
    ? Math.max(...appointments.map((a) => Math.max(toMin(a.endTime), toMin(a.startTime) + 15)))
    : 18 * 60;
  const span = Math.max(dayEnd - dayStart, 60);

  // Whole-hour tick marks across the axis
  const hourTicks = useMemo(() => {
    const ticks: number[] = [];
    const first = Math.ceil(dayStart / 60) * 60;
    for (let m = first; m <= dayEnd; m += 60) ticks.push(m);
    return ticks;
  }, [dayStart, dayEnd]);

  const docName = room.assignedDoctor
    ? (lang === 'ar' ? (room.assignedDoctor.nameAr ?? room.assignedDoctor.nameEn) : room.assignedDoctor.nameEn)
    : null;
  const inSessionCount = queue.filter((q) => q.status === 'in_session').length;
  const roomName = lang === 'ar' ? (room.nameAr ?? room.nameEn) : room.nameEn;

  // Per-row geometry — bar offset/width by time, plus the left-gutter hour label
  // (shown only when the start hour changes from the row above).
  const rows = useMemo(() => {
    let prevHour = -1;
    return appointments.map((a) => {
      const start = toMin(a.startTime);
      const end = Math.max(toMin(a.endTime), start + 15);
      const width = Math.max(((end - start) / span) * 100, MIN_BAR_PCT);
      const clampedLeft = Math.min(Math.max(((start - dayStart) / span) * 100, 0), 100 - width);
      const hour = Math.floor(start / 60);
      const showHour = hour !== prevHour;
      prevHour = hour;
      return {
        appt: a,
        clampedLeft,
        width,
        xStart: clampedLeft,
        xEnd: clampedLeft + width,
        hourLabel: `${String(hour).padStart(2, '0')}:00`,
        showHour,
      };
    });
  }, [appointments, dayStart, span]);

  const laneHeight = appointments.length * (ROW_H + ROW_GAP);

  return (
    <section className="rounded-2xl border border-gray-200/80 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/60 backdrop-blur-sm shadow-sm overflow-hidden">
      {/* Panel header */}
      <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-gray-100 dark:border-neutral-800">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 text-white flex items-center justify-center font-bold text-sm shadow-sm flex-shrink-0">
            {room.roomCode}
          </span>
          <div className="min-w-0">
            <h3 className="font-display font-bold text-gray-900 dark:text-gray-100 text-[15px] leading-tight truncate">
              {roomName}
              {room.floor != null && (
                <span className="font-normal text-gray-400"> · {t('الطابق', 'Floor')} {room.floor}</span>
              )}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate" dir="ltr">
              {docName ? `${t('د.', 'Dr.')} ${docName}` : t('بدون طبيب', 'No doctor')} · {date}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold',
            inSessionCount > 0
              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
              : 'bg-gray-100 dark:bg-neutral-800 text-gray-500 dark:text-gray-400',
          )}>
            <span className={cn('w-1.5 h-1.5 rounded-full', inSessionCount > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400')} />
            {inSessionCount > 0 ? t('جلسة نشطة', 'Active session') : t('لا توجد جلسة', 'No active session')}
          </span>
          <button
            type="button"
            onClick={() => onTimeline(room)}
            title={t('الجدول الزمني', 'Timeline')}
            className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors"
          >
            <CalendarClock className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onRelease(room)}
            title={t('تحرير الغرفة', 'Release room')}
            className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 pt-3 text-[11px] text-gray-500 dark:text-gray-400">
        {LEGEND.map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={cn('w-2 h-2 rounded-full', STATE_STYLES[k].dot)} />
            {lang === 'ar' ? STATE_STYLES[k].labelAr : STATE_STYLES[k].labelEn}
          </span>
        ))}
      </div>

      {/* Body */}
      {!doctorId ? (
        <p className="py-10 text-center text-sm text-gray-400">
          {t('لا يوجد طبيب معيّن لهذه الغرفة', 'No doctor assigned to this room')}
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
        <div className="px-5 py-4 overflow-x-auto" dir="ltr">
          <div className="min-w-[560px]">
            {/* Top hour axis (aligned to the bar track) */}
            <div className="flex">
              <div style={{ width: GUTTER_W }} className="flex-shrink-0" />
              <div className="relative flex-1 h-5 mb-1">
                {hourTicks.map((m) => (
                  <span
                    key={m}
                    className="absolute top-0 -translate-x-1/2 text-[10px] font-mono text-gray-400 tabular-nums"
                    style={{ left: `${((m - dayStart) / span) * 100}%` }}
                  >
                    {String(Math.floor(m / 60)).padStart(2, '0')}:{String(m % 60).padStart(2, '0')}
                  </span>
                ))}
              </div>
              <div style={{ width: BADGE_W + CHECK_W }} className="flex-shrink-0" />
            </div>

            {/* Lanes */}
            <div className="relative" style={{ height: laneHeight }}>
              {/* Connector spine: stepped elbow from each bar's end to the next bar's start */}
              <div
                className="absolute top-0 bottom-0 pointer-events-none"
                style={{ left: GUTTER_W, right: BADGE_W + CHECK_W }}
              >
                {rows.slice(0, -1).map((r, i) => {
                  const next = rows[i + 1];
                  const yBottom = i * (ROW_H + ROW_GAP) + ROW_H;
                  const yMid = yBottom + ROW_GAP / 2;
                  const yTop = (i + 1) * (ROW_H + ROW_GAP);
                  const xA = r.xEnd;
                  const xB = next.xStart;
                  const lo = Math.min(xA, xB);
                  const hi = Math.max(xA, xB);
                  const line = 'bg-gray-200 dark:bg-neutral-700';
                  return (
                    <div key={r.appt.id}>
                      {/* down from bar end */}
                      <span className={cn('absolute w-px', line)} style={{ left: `${xA}%`, top: yBottom, height: yMid - yBottom }} />
                      {/* horizontal run */}
                      <span className={cn('absolute h-px', line)} style={{ left: `${lo}%`, width: `${hi - lo}%`, top: yMid }} />
                      {/* down into next bar */}
                      <span className={cn('absolute w-px', line)} style={{ left: `${xB}%`, top: yMid, height: yTop - yMid }} />
                      {/* node dot at the elbow start */}
                      <span className={cn('absolute w-1.5 h-1.5 rounded-full -translate-x-1/2 -translate-y-1/2', 'bg-gray-300 dark:bg-neutral-600')} style={{ left: `${xA}%`, top: yBottom }} />
                    </div>
                  );
                })}
              </div>

              {rows.map((r, i) => {
                const a = r.appt;
                const st = rowState(a);
                const s = STATE_STYLES[st];
                const q = queueByAppt.get(a.id);
                const name = patientMap.get(a.patientId);
                const display = name
                  ? (lang === 'ar' ? (name.nameAr ?? name.nameEn) : name.nameEn)
                  : `#${a.patientId.slice(-6).toUpperCase()}`;
                const checkedIn = !!q;
                const isCompleted = st === 'completed';
                const isConfirmed = a.status === 'Ok!' || st === 'in_service';
                const top = i * (ROW_H + ROW_GAP);

                return (
                  <div key={a.id} className="absolute inset-x-0 flex items-stretch" style={{ top, height: ROW_H }}>
                    {/* Left time-gutter */}
                    <div style={{ width: GUTTER_W }} className="flex-shrink-0 flex items-start pt-0.5 text-[10px] font-mono text-gray-400 tabular-nums">
                      {r.showHour ? r.hourLabel : ''}
                    </div>

                    {/* Bar track */}
                    <div className="relative flex-1">
                      <div
                        draggable={!swap.isPending}
                        onDragStart={() => setDragId(a.id)}
                        onDragEnd={() => { setDragId(null); setDropId(null); }}
                        onDragOver={(e) => { e.preventDefault(); if (dragId && dragId !== a.id) setDropId(a.id); }}
                        onDragLeave={() => setDropId((p) => (p === a.id ? null : p))}
                        onDrop={(e) => { e.preventDefault(); handleDrop(a.id); }}
                        title={t('اسحب لتبديل الموعد', 'Drag onto another row to swap slots')}
                        className={cn(
                          'group/bar absolute top-0 h-full rounded-xl border ps-2.5 pe-2 flex items-center gap-2 overflow-hidden',
                          'cursor-grab active:cursor-grabbing transition-shadow hover:shadow-md',
                          s.bar,
                          dragId === a.id && 'opacity-50 shadow-lg',
                          dropId === a.id && 'ring-2 ring-primary-500 ring-offset-1 dark:ring-offset-neutral-900',
                        )}
                        style={{ left: `${r.clampedLeft}%`, width: `${r.width}%` }}
                      >
                        <span className={cn('absolute left-0 inset-y-1.5 w-1 rounded-full', s.rail)} />
                        <GripVertical className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 truncate leading-tight">
                            {display}
                          </p>
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 font-mono flex items-center gap-1 leading-tight" dir="ltr">
                            <Clock className="w-2.5 h-2.5" />
                            {a.startTime.slice(0, 5)}–{a.endTime.slice(0, 5)}
                          </p>
                        </div>
                        {/* Inline row actions — appear on hover */}
                        <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover/bar:opacity-100 focus-within:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => onTimeline(room)}
                            title={t('تعديل الجدول', 'Edit schedule')}
                            className="p-1 rounded-md text-gray-400 hover:text-primary-600 hover:bg-white/60 dark:hover:bg-neutral-900/60"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onTimeline(room)}
                            title={t('المزيد', 'More')}
                            className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-white/60 dark:hover:bg-neutral-900/60"
                          >
                            <MoreHorizontal className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Fixed status-badge column */}
                    <div style={{ width: BADGE_W }} className="flex-shrink-0 flex items-center justify-end gap-1.5 ps-3">
                      {st === 'assigned' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-300 border border-violet-200 dark:border-violet-800">
                          <UserCheck className="w-3 h-3" />
                          {t('تم التعيين', 'Provider Assigned')}
                        </span>
                      ) : st === 'cancelled' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                          {lang === 'ar' ? s.labelAr : s.labelEn}
                        </span>
                      ) : (
                        <>
                          {checkedIn && !isCompleted && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-neutral-700 bg-white/60 dark:bg-neutral-900/40">
                              <Check className="w-3 h-3 text-emerald-500" />
                              {t('تم الحضور', 'Check-In')}
                            </span>
                          )}
                          <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold text-white', s.rail)}>
                            {lang === 'ar' ? s.labelAr : s.labelEn}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Right completion check */}
                    <div style={{ width: CHECK_W }} className="flex-shrink-0 flex items-center justify-center">
                      {isCompleted ? (
                        <CheckCircle2 className="w-4 h-4 text-gray-400" />
                      ) : isConfirmed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <Check className="w-4 h-4 text-gray-300 dark:text-neutral-600" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {swap.isPending && (
              <p className="mt-3 text-xs text-gray-400 flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" />
                {t('جاري تبديل الموعدين...', 'Swapping slots...')}
              </p>
            )}
          </div>

          {/* Footer legend (repeated, matching the mockup) */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2 pt-3 border-t border-gray-100 dark:border-neutral-800 text-[11px] text-gray-500 dark:text-gray-400">
            {LEGEND.map((k) => (
              <span key={k} className="flex items-center gap-1.5">
                <span className={cn('w-2 h-2 rounded-full', STATE_STYLES[k].dot)} />
                {lang === 'ar' ? STATE_STYLES[k].labelAr : STATE_STYLES[k].labelEn}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ── Idle / available room card (right rail) ────────────────────────────────────

function IdleRoomCard({ room, onAssign }: { room: RoomDetail; onAssign: (r: RoomDetail) => void }) {
  const { lang, t } = useLang();
  const roomName = lang === 'ar' ? (room.nameAr ?? room.nameEn) : room.nameEn;
  const available = room.status === 'available' && room.isActive;

  const tone = available
    ? 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-200/70 dark:border-emerald-900/40'
    : 'bg-gray-50 dark:bg-neutral-800/40 border-gray-200 dark:border-neutral-700';

  return (
    <div className={cn('group relative rounded-xl border p-3.5 transition-all hover:shadow-sm', tone, !available && 'opacity-70')}>
      <div className="flex items-start gap-3">
        {/* Code chip — left */}
        <span className="w-9 h-9 rounded-lg bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 flex items-center justify-center text-[11px] font-bold text-gray-700 dark:text-gray-200 shadow-sm flex-shrink-0">
          {room.roomCode}
        </span>

        {/* Name + meta — middle */}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm leading-tight truncate">{roomName}</p>
          {room.floor != null && (
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug">{t('الطابق', 'Floor')} {room.floor}</p>
          )}
          <p className="text-xs text-gray-400 dark:text-gray-500 leading-snug truncate">{t('لا يوجد طبيب', 'No doctor assigned')}</p>
        </div>

        {/* Assign affordance + status — top-right cluster */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {available && (
            <button
              type="button"
              onClick={() => onAssign(room)}
              title={t('تعيين طبيب', 'Assign doctor')}
              className="p-1 rounded-md text-gray-400 hover:text-primary-600 hover:bg-white/70 dark:hover:bg-neutral-900/60 transition-colors"
            >
              <CalendarPlus className="w-4 h-4" />
            </button>
          )}
          <span className={cn(
            'inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap',
            available ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400',
          )}>
            <span className={cn('w-1.5 h-1.5 rounded-full', available ? 'bg-emerald-500' : 'bg-gray-400')} />
            {available ? t('متاحة', 'Available') : t('غير نشطة', 'Inactive')}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Main board ─────────────────────────────────────────────────────────────────

export function RoomQueueBoard({ date }: { date?: string }) {
  const today = date ?? localDateISO();
  const { t } = useLang();
  const { data: rooms = [], isLoading } = useRooms(today);

  const [assignTarget, setAssignTarget] = useState<RoomDetail | null>(null);
  const [releaseTarget, setReleaseTarget] = useState<RoomDetail | null>(null);
  const [timelineTarget, setTimelineTarget] = useState<RoomDetail | null>(null);

  useRoomSSE(today);

  const activeRooms = rooms.filter((r) => r.status === 'occupied' || r.status === 'reserved');
  const idleRooms = rooms.filter((r) => r.status === 'available' || r.status === 'inactive');
  const cleaningCount = rooms.filter((r) => r.status === 'inactive').length;
  const availableCount = rooms.filter((r) => r.status === 'available').length;

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 space-y-5">
          {[1, 2].map((i) => <div key={i} className="h-72 rounded-2xl bg-gray-100 dark:bg-neutral-800 animate-pulse" />)}
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl bg-gray-100 dark:bg-neutral-800 animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
        {/* Left: active-room timelines */}
        <div className="xl:col-span-2 space-y-5">
          {activeRooms.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/40 py-16 text-center">
              <Stethoscope className="w-8 h-8 mx-auto text-gray-300 dark:text-neutral-600" />
              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                {t('لا توجد غرف نشطة حالياً', 'No active rooms right now')}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {t('عيّن طبيباً لغرفة متاحة لبدء جلسة', 'Assign a doctor to an available room to start a session')}
              </p>
            </div>
          ) : (
            activeRooms.map((room) => (
              <RoomTimelinePanel
                key={room.roomCode ?? room.id}
                room={room}
                date={today}
                onRelease={setReleaseTarget}
                onTimeline={setTimelineTarget}
              />
            ))
          )}
        </div>

        {/* Right rail */}
        <aside className="space-y-4">
          {/* Cleaning / alarms */}
          <div className="rounded-xl border border-gray-200/80 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/60 p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-gray-400 dark:text-gray-500 font-semibold">
                {t('تنظيف', 'Cleaning')}
              </p>
              <p className="text-2xl font-display font-bold text-gray-900 dark:text-gray-100 mt-0.5 tabular-nums">
                {cleaningCount}
              </p>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">
                {t('لا توجد تنبيهات', 'No alarms')}
              </p>
            </div>
            <span className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-950/30 text-amber-400 flex items-center justify-center">
              <BellOff className="w-5 h-5" />
            </span>
          </div>

          {/* Available rooms */}
          <div>
            <div className="flex items-center justify-between mb-2.5 px-0.5">
              <h3 className="text-[11px] uppercase tracking-widest text-gray-400 dark:text-gray-500 font-semibold flex items-center gap-1.5">
                <DoorOpen className="w-3.5 h-3.5" />
                {t('غرف متاحة', 'Available Rooms')}
              </h3>
              <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {availableCount}
              </span>
            </div>
            {idleRooms.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500 italic px-1 py-4 text-center">
                {t('كل الغرف مشغولة', 'All rooms are occupied')}
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-3">
                {idleRooms.map((room) => (
                  <IdleRoomCard key={room.roomCode ?? room.id} room={room} onAssign={setAssignTarget} />
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Modals (reused from RoomStatusBoard) */}
      {assignTarget && (
        <AssignDoctorModal room={assignTarget} initialDate={today} onClose={() => setAssignTarget(null)} />
      )}
      {releaseTarget && (
        <ReleaseConfirmModal room={releaseTarget} onClose={() => setReleaseTarget(null)} />
      )}
      {timelineTarget && (
        <RoomTimelineModal room={timelineTarget} date={today} onClose={() => setTimelineTarget(null)} />
      )}
    </>
  );
}
