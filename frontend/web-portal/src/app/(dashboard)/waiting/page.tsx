'use client';

import { useMemo } from 'react';
import { Monitor, UserRound, Users, Stethoscope, ArrowRight, Clock } from 'lucide-react';
import { useLang } from '@/contexts/LanguageContext';
import { useRooms, useRoomAssignments, type RoomAssignmentWithCode } from '@/hooks/useRooms';
import { useDoctorMap } from '@/hooks/useDoctors';
import { useQueue } from '@/hooks/useQueue';
import { usePatientBatch } from '@/hooks/usePatients';
import { cn, localDateISO } from '@/lib/utils';
import type { RoomDetail } from '@fadl/types';

const TODAY = () => localDateISO();

function nowHHMM(): string {
  return new Date().toTimeString().slice(0, 5);
}

/** The assignment that starts after the room's current one ends — the
 *  "next doctor" shown to waiting patients. */
function nextAssignment(
  room: RoomDetail,
  assignments: RoomAssignmentWithCode[],
): RoomAssignmentWithCode | null {
  const forRoom = assignments
    .filter((a) => a.roomCode === room.roomCode && a.status !== 'released')
    .sort((a, b) => a.assignedFrom.localeCompare(b.assignedFrom));
  const currentDoctorId = room.assignedDoctor?.id;
  if (currentDoctorId) {
    const idx = forRoom.findIndex((a) => a.doctorId === currentDoctorId);
    return idx >= 0 ? (forRoom[idx + 1] ?? null) : (forRoom[0] ?? null);
  }
  // No doctor right now — the next doctor is the first assignment still ahead
  return forRoom.find((a) => a.assignedFrom.slice(0, 5) >= nowHHMM()) ?? forRoom[0] ?? null;
}

function RoomPanel({ room, assignments }: { room: RoomDetail; assignments: RoomAssignmentWithCode[] }) {
  const { lang, t } = useLang();
  const doctorMap = useDoctorMap();
  const doctorId = room.assignedDoctor?.id ?? '';

  const { data: queue = [] } = useQueue(doctorId, TODAY(), !!doctorId);
  const current = queue.find((q) => q.status === 'in_session') ?? queue.find((q) => q.status === 'called') ?? null;
  const next = queue.filter((q) => q.status === 'waiting').sort((a, b) => a.position - b.position)[0] ?? null;

  const patientMap = usePatientBatch([current?.patientId, next?.patientId].filter(Boolean) as string[]);
  const pname = (pid?: string) => {
    if (!pid) return null;
    const p = patientMap.get(pid);
    return p ? (lang === 'ar' ? (p.nameAr ?? p.nameEn) : p.nameEn) : '…';
  };

  const docName = room.assignedDoctor
    ? (lang === 'ar' ? (room.assignedDoctor.nameAr ?? room.assignedDoctor.nameEn) : room.assignedDoctor.nameEn)
    : null;

  const upcoming = nextAssignment(room, assignments);
  const upcomingDoctor = upcoming ? doctorMap.get(upcoming.doctorId) : null;
  const upcomingName = upcomingDoctor
    ? (lang === 'ar' ? (upcomingDoctor.nameAr ?? upcomingDoctor.nameEn) : upcomingDoctor.nameEn)
    : null;

  return (
    <div className="rounded-3xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 overflow-hidden shadow-sm flex flex-col">
      {/* Clinic number header */}
      <div className="bg-primary-600 text-white px-6 py-4 flex items-center justify-between">
        <span className="text-3xl font-display font-bold tracking-wide">{room.roomCode}</span>
        <span className="text-sm opacity-90 flex items-center gap-2">
          <Stethoscope className="w-4 h-4" />
          {docName ? `${t('د.', 'Dr.')} ${docName}` : t('لا يوجد طبيب حالياً', 'No doctor on duty')}
        </span>
      </div>

      <div className="p-6 space-y-5 flex-1">
        {/* Now serving */}
        <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 p-5 text-center">
          <p className="text-xs uppercase tracking-widest text-emerald-600 dark:text-emerald-400 font-semibold flex items-center justify-center gap-1.5 mb-2">
            <UserRound className="w-3.5 h-3.5" />
            {t('في الكشف الآن', 'Now Serving')}
          </p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 truncate">
            {current ? (pname(current.patientId) ?? `#${current.position}`) : '—'}
          </p>
          {current && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
              {t('رقم الدور', 'Queue #')} {current.position}
            </p>
          )}
        </div>

        {/* Next patient */}
        <div className="rounded-2xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900/40 p-4 text-center">
          <p className="text-xs uppercase tracking-widest text-sky-600 dark:text-sky-400 font-semibold flex items-center justify-center gap-1.5 mb-1">
            <Users className="w-3.5 h-3.5" />
            {t('المريض التالي', 'Next Patient')}
          </p>
          <p className="text-lg font-semibold text-gray-800 dark:text-gray-200 truncate">
            {next ? (pname(next.patientId) ?? `#${next.position}`) : t('لا يوجد', 'None waiting')}
          </p>
        </div>

        {/* Next doctor (after the current doctor finishes) */}
        {upcomingName && upcoming?.doctorId !== room.assignedDoctor?.id && (
          <div className="rounded-2xl bg-gray-50 dark:bg-neutral-800/60 border border-gray-200 dark:border-neutral-700 p-4 flex items-center gap-3">
            <ArrowRight className={cn('w-4 h-4 text-gray-400 flex-shrink-0', lang === 'ar' && 'rotate-180')} />
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-widest text-gray-400 font-semibold">
                {t('الطبيب التالي', 'Next Doctor')}
              </p>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
                {t('د.', 'Dr.')} {upcomingName}
              </p>
              <p className="text-[11px] text-gray-400 font-mono flex items-center gap-1" dir="ltr">
                <Clock className="w-3 h-3" />
                {upcoming!.assignedFrom.slice(0, 5)}–{upcoming!.assignedUntil.slice(0, 5)}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function WaitingScreenPage() {
  const { t } = useLang();
  const today = useMemo(TODAY, []);
  const { data: rooms = [] } = useRooms(today);
  const { data: assignments = [] } = useRoomAssignments(today, 15_000);

  const activeRooms = rooms.filter((r) => r.isActive && r.roomCode);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-primary-600 text-white flex items-center justify-center">
          <Monitor className="w-5 h-5" />
        </span>
        <div>
          <h1 className="text-xl font-display font-bold text-gray-900 dark:text-gray-100">
            {t('شاشة الانتظار', 'Waiting Screen')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('المريض الحالي والتالي لكل عيادة — تحديث تلقائي', 'Now serving & next patient per clinic — auto-refreshing')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
        {activeRooms.map((room) => (
          <RoomPanel key={room.roomCode} room={room} assignments={assignments} />
        ))}
        {activeRooms.length === 0 && (
          <p className="col-span-full py-16 text-center text-gray-400 text-sm">
            {t('لا توجد عيادات نشطة', 'No active clinics')}
          </p>
        )}
      </div>
    </div>
  );
}
