'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  CalendarPlus, ChevronLeft, ChevronRight,
  MoreVertical, Pencil, Trash2, Check, X,
  Search, SlidersHorizontal, ShieldAlert, Loader2,
  LayoutList, Clock,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { AppointmentStatusBadge } from '@/components/ui/Badge';
import { useLang } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { formatTime, cn } from '@/lib/utils';
import { useAppointments } from '@/hooks/useAppointments';
import { useDoctors, useDoctorMap, useSpecialtyMap } from '@/hooks/useDoctors';
import { usePatientMap } from '@/hooks/usePatients';
import { useDebounce } from '@/hooks/useDebounce';
import { AddAppointmentModal } from '@/components/appointments/AddAppointmentModal';
import { appointmentApi } from '@/lib/api';
import type { Appointment, AppointmentStatus, Patient, Doctor } from '@fadl/types';

// ── State machine ──────────────────────────────────────────────────────────

const TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  'TBC':    ['Ok!', 'Canc.', 'Ref.'],
  'Ok!':    ['Comp.', 'Canc.', 'Ref.'],
  'Conf.':  ['Comp.', 'Canc.', 'Ref.'],
  'Comp.':  [],
  'Canc.':  ['Ref.'],
  'Resch.': [],
  'Inf.':   ['TBC', 'Ok!'],
  'Ref.':   [],
};

const STATUS_LABELS: Record<AppointmentStatus, { ar: string; en: string }> = {
  'TBC':    { ar: 'انتظار',      en: 'TBC'          },
  'Ok!':    { ar: 'موافق',       en: 'Confirmed'    },
  'Conf.':  { ar: 'مؤكد',        en: 'Checked-in'   },
  'Comp.':  { ar: 'مكتمل',       en: 'Complete'     },
  'Canc.':  { ar: 'ملغي',        en: 'Cancelled'    },
  'Resch.': { ar: 'معاد جدولة',  en: 'Rescheduled'  },
  'Inf.':   { ar: 'مُبلَّغ',      en: 'Informed'     },
  'Ref.':   { ar: 'مسترد',       en: 'Refunded'     },
};

// ── Status filter chips ────────────────────────────────────────────────────

const STATUS_FILTERS = [
  { k: 'all',    labelAr: 'الكل',    labelEn: 'All',       color: '#475569' },
  { k: 'TBC',    labelAr: 'انتظار',  labelEn: 'Pending',   color: '#F59E0B' },
  { k: 'Ok!',    labelAr: 'موافق',   labelEn: 'Ok!',       color: '#3B82F6' },
  { k: 'Conf.',  labelAr: 'مؤكد',    labelEn: 'Confirmed', color: '#10B981' },
  { k: 'Comp.',  labelAr: 'مكتمل',   labelEn: 'Complete',  color: '#6366F1' },
  { k: 'Canc.',  labelAr: 'ملغي',    labelEn: 'Cancelled', color: '#EF4444' },
] as const;

type StatusFilterKey = (typeof STATUS_FILTERS)[number]['k'];

const STATUS_COLORS: Record<string, string> = {
  'TBC':    '#F59E0B',
  'Ok!':    '#3B82F6',
  'Conf.':  '#10B981',
  'Comp.':  '#6366F1',
  'Canc.':  '#EF4444',
  'Resch.': '#8B5CF6',
  'Inf.':   '#94A3B8',
  'Ref.':   '#94A3B8',
};

// ── Helpers ────────────────────────────────────────────────────────────────

function todayStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function formatName(str: string): string {
  return str.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

function parseTimeMinutes(timeStr: string): number {
  const t = formatTime(timeStr);
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

// ── Skeleton ───────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-b border-gray-50 dark:border-neutral-800">
      {[40, 60, 55, 45, 35, 30, 20].map((w, i) => (
        <td key={i} className="px-5 py-3.5">
          <div className="h-3.5 rounded-full bg-gray-100 dark:bg-neutral-700 animate-pulse" style={{ width: `${w}%` }} />
        </td>
      ))}
    </tr>
  );
}

// ── Action menu ────────────────────────────────────────────────────────────

interface ActionMenuProps {
  appointment: Appointment;
  lang: 'ar' | 'en';
  t: (ar: string, en: string) => string;
  userRole: string;
  onStatusChange: (appt: Appointment) => void;
  onEdit: (appt: Appointment) => void;
  onDelete: (appt: Appointment) => void;
}

function ActionMenu({ appointment, lang, t, userRole, onStatusChange, onEdit, onDelete }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const allTransitions = TRANSITIONS[appointment.status] ?? [];
  const visibleTransitions = userRole === 'admin' ? allTransitions : allTransitions.filter((s) => s !== 'Ref.');
  const canChange = visibleTransitions.length > 0;
  const isTerminal = ['Comp.', 'Canc.', 'Resch.', 'Ref.'].includes(appointment.status);
  const canEdit = !isTerminal && (userRole === 'admin' || userRole === 'receptionist');
  const canDelete = userRole === 'admin' && appointment.status !== 'Comp.';

  const openMenu = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const menuH = 90;
    const menuW = 192;
    // clientWidth/clientHeight exclude the OS scrollbar gutter
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const spaceBelow = vh - r.bottom;
    const top = spaceBelow >= menuH ? r.bottom + 4 : r.top - menuH - 4;
    const rawLeft = lang === 'ar' ? r.left : r.right - menuW;
    // clamp so the dropdown never overlaps the scrollbar or bleeds off screen
    const left = Math.max(4, Math.min(rawLeft, vw - menuW - 4));
    setMenuStyle({ position: 'fixed', top, left, width: menuW, zIndex: 9999 });
    setOpen((v) => !v);
  }, [lang]);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  // close on scroll so menu doesn't float away from its anchor
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    return () => window.removeEventListener('scroll', close, true);
  }, [open]);

  const menu = open ? (
    <div
      ref={menuRef}
      style={menuStyle}
      className="rounded-xl border border-gray-100 dark:border-neutral-700 bg-white dark:bg-neutral-800 shadow-lg py-1 text-sm overflow-hidden"
    >
      {canChange && (
        <button
          onClick={(e) => { e.stopPropagation(); setOpen(false); onStatusChange(appointment); }}
          className="w-full flex items-center gap-2.5 px-4 py-2 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-neutral-700 transition-colors"
        >
          <Check className="w-3.5 h-3.5 text-primary-500" />
          {t('تغيير الحالة', 'Change Status')}
        </button>
      )}
      {canDelete ? (
        <button
          onClick={(e) => { e.stopPropagation(); setOpen(false); onDelete(appointment); }}
          className="w-full flex items-center gap-2.5 px-4 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          {t('حذف الموعد', 'Delete')}
        </button>
      ) : (
        <button
          disabled
          title={t('الحذف للمدير فقط', 'Only administrators can delete')}
          className="w-full flex items-center gap-2.5 px-4 py-2 text-gray-300 dark:text-gray-600 cursor-not-allowed"
        >
          <Trash2 className="w-3.5 h-3.5" />
          {t('حذف الموعد', 'Delete')}
        </button>
      )}
    </div>
  ) : null;

  return (
    <div className="flex items-center gap-1">
      {canEdit && (
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(appointment); }}
          className="p-1.5 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20 text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
          title={t('تعديل الموعد', 'Edit appointment')}
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      )}
      {(canChange || canDelete || userRole === 'receptionist') && (
        <>
          <button
            ref={btnRef}
            onClick={openMenu}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-700 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {typeof document !== 'undefined' && createPortal(menu, document.body)}
        </>
      )}
    </div>
  );
}

// ── Bulk delete modal ──────────────────────────────────────────────────────

interface BulkDeleteModalProps {
  ids: string[];
  lang: 'ar' | 'en';
  t: (ar: string, en: string) => string;
  onClose: () => void;
  onDeleted: () => void;
}

function BulkDeleteModal({ ids, lang, t, onClose, onDeleted }: BulkDeleteModalProps) {
  const [password, setPassword] = useState('');
  const [reason,   setReason]   = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [progress, setProgress] = useState(0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) { setError(t('كلمة المرور مطلوبة', 'Password is required')); return; }
    if (reason.length < 10) { setError(t('السبب يجب أن يكون 10 أحرف على الأقل', 'Reason must be at least 10 characters')); return; }
    setError('');
    setLoading(true);
    let done = 0;
    for (const id of ids) {
      try {
        await appointmentApi.delete(`/appointments/${id}`, { data: { password, reason } });
      } catch {
        // continue
      }
      done++;
      setProgress(Math.round((done / ids.length) * 100));
    }
    setLoading(false);
    onDeleted();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md mx-4 bg-white dark:bg-neutral-800 rounded-2xl shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-neutral-700">
          <div className="p-2 rounded-xl bg-red-50 dark:bg-red-900/20">
            <ShieldAlert className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
              {t(`حذف ${ids.length} موعد`, `Delete ${ids.length} appointment${ids.length > 1 ? 's' : ''}`)}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('هذا الإجراء لا يمكن التراجع عنه', 'This action cannot be undone')}
            </p>
          </div>
          <button onClick={onClose} className="ms-auto text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300">{t('كلمة المرور', 'Password')}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('كلمة مرورك', 'Your password')}
              className="w-full h-10 rounded-xl border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-700 px-3 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500"
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300">{t('سبب الحذف', 'Reason for deletion')}</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('يجب أن يكون 10 أحرف على الأقل...', 'At least 10 characters...')}
              rows={3}
              className="w-full rounded-xl border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
            />
            <p className="text-[10px] text-gray-400">{reason.length}/10 {t('حرف كحد أدنى', 'chars min')}</p>
          </div>
          {loading && (
            <div className="space-y-1">
              <div className="h-1.5 rounded-full bg-gray-100 dark:bg-neutral-700 overflow-hidden">
                <div className="h-full bg-red-500 rounded-full transition-all duration-200" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs text-gray-400 text-center">{progress}%</p>
            </div>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 h-10 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" />{t('جاري الحذف...', 'Deleting...')}</> : t('تأكيد الحذف', 'Confirm Delete')}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 h-10 rounded-xl border border-gray-200 dark:border-neutral-600 text-gray-600 dark:text-gray-300 text-sm hover:bg-gray-50 dark:hover:bg-neutral-700 transition-colors"
            >
              {t('إلغاء', 'Cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Status change modal ────────────────────────────────────────────────────

interface StatusModalProps {
  appointment: Appointment;
  lang: 'ar' | 'en';
  t: (ar: string, en: string) => string;
  onClose: () => void;
  onDone: () => void;
  userRole: string;
}

function StatusModal({ appointment, lang, t, onClose, onDone, userRole }: StatusModalProps) {
  const [selected, setSelected] = useState<AppointmentStatus | null>(null);
  const allAllowed = TRANSITIONS[appointment.status] ?? [];
  const allowed = userRole === 'admin' ? allAllowed : allAllowed.filter((s) => s !== 'Ref.');

  const mutation = useMutation({
    mutationFn: async (status: AppointmentStatus) => {
      await appointmentApi.patch(`/appointments/${appointment.id}/status`, {
        status,
        version: appointment.version,
      });
    },
    onSuccess: () => { onDone(); onClose(); },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm mx-4 bg-white dark:bg-neutral-800 rounded-2xl shadow-xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t('تغيير حالة الموعد', 'Change Appointment Status')}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          {t('الحالة الحالية:', 'Current status:')}
          {' '}<AppointmentStatusBadge status={appointment.status} lang={lang} />
        </p>
        <div className="space-y-2">
          {allowed.map((s) => (
            <button
              key={s}
              onClick={() => setSelected(s)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all text-sm font-medium ${
                selected === s
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                  : 'border-gray-100 dark:border-neutral-700 text-gray-700 dark:text-gray-200 hover:border-gray-200 dark:hover:border-neutral-600'
              }`}
            >
              <span>{lang === 'ar' ? STATUS_LABELS[s].ar : STATUS_LABELS[s].en}</span>
              {selected === s && <Check className="w-4 h-4" />}
            </button>
          ))}
        </div>
        {mutation.isError && (
          <p className="text-xs text-red-500 mt-3">
            {t('فشل تغيير الحالة. تأكد من التسلسل الصحيح.', 'Status change failed. Check valid transition.')}
          </p>
        )}
        <div className="flex gap-2 mt-5">
          <Button
            className="flex-1"
            disabled={!selected || mutation.isPending}
            onClick={() => selected && mutation.mutate(selected)}
          >
            {mutation.isPending ? t('جاري الحفظ...', 'Saving...') : t('تطبيق', 'Apply')}
          </Button>
          <Button variant="ghost" onClick={onClose}>{t('إلغاء', 'Cancel')}</Button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

const DAY_SHORT_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_SHORT_AR = ['إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت', 'أحد'];
const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

export default function AppointmentsPage() {
  const { lang, t } = useLang();
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();

  const [activeTab,      setActiveTab]      = useState<StatusFilterKey>('all');
  const [date,           setDate]           = useState(todayStr);
  const [doctorId,       setDoctorId]       = useState<string>('');
  const [view,           setView]           = useState<'list' | 'timeline'>('list');
  const [addOpen,        setAddOpen]        = useState(false);
  const [statusAppt,     setStatusAppt]     = useState<Appointment | null>(null);
  const [editAppt,       setEditAppt]       = useState<Appointment | null>(null);
  const [editPatientSt,  setEditPatientSt]  = useState<Patient | null>(null);
  const [editDoctorSt,   setEditDoctorSt]   = useState<Doctor | null>(null);
  const [selectedIds,    setSelectedIds]    = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [showAdvanced,   setShowAdvanced]   = useState(false);
  const [patientSearch,  setPatientSearch]  = useState('');
  const [typeFilter,     setTypeFilter]     = useState('');
  const [sourceFilter,   setSourceFilter]   = useState('');

  const debouncedPatient = useDebounce(patientSearch, 250);

  const { data, isLoading, isError, refetch } = useAppointments({
    date,
    limit:    100,
    doctorId: doctorId || undefined,
  });
  const appointments  = data?.data ?? [];
  const doctorMap     = useDoctorMap();
  const specialtyMap  = useSpecialtyMap();
  const patientMap    = usePatientMap();
  const { data: doctorList } = useDoctors({ isActive: true, limit: 200 });

  const hasActiveFilters = !!(patientSearch || typeFilter || sourceFilter);

  const filtered = useMemo(() => {
    let list = activeTab === 'all'
      ? appointments
      : appointments.filter((a) => a.status === activeTab);
    if (debouncedPatient.trim()) {
      const q = debouncedPatient.toLowerCase();
      list = list.filter((a) => {
        const p = patientMap.get(a.patientId);
        const name = p ? (p.nameAr ?? p.nameEn ?? '').toLowerCase() + ' ' + p.nameEn.toLowerCase() : '';
        return name.includes(q);
      });
    }
    if (typeFilter)   list = list.filter((a) => a.appointmentType === typeFilter);
    if (sourceFilter) list = list.filter((a) => a.patientSource === sourceFilter);
    return list;
  }, [appointments, activeTab, debouncedPatient, patientMap, typeFilter, sourceFilter]);

  const statusCounts = useMemo(() => {
    const m: Record<string, number> = {};
    appointments.forEach((a) => { m[a.status] = (m[a.status] ?? 0) + 1; });
    return m;
  }, [appointments]);

  const availableSources = useMemo(
    () => [...new Set(appointments.map((a) => a.patientSource).filter(Boolean))].sort(),
    [appointments],
  );

  // KPI counters
  const kpiConfirmed  = (statusCounts['Conf.'] ?? 0) + (statusCounts['Ok!'] ?? 0);
  const kpiPending    = statusCounts['TBC']   ?? 0;
  const kpiCancelled  = statusCounts['Canc.'] ?? 0;
  const kpiCompleted  = statusCounts['Comp.'] ?? 0;
  const attendancePct = appointments.length > 0
    ? Math.round(((kpiConfirmed + kpiCompleted) / appointments.length) * 100)
    : 0;

  // Week strip
  const weekDays = useMemo(() => {
    const [y, mo, dd] = date.split('-').map(Number);
    const d = new Date(y, mo - 1, dd);
    const monOffset = (d.getDay() + 6) % 7;
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(y, mo - 1, dd - monOffset + i);
      return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    });
  }, [date]);

  function shiftWeek(dir: 1 | -1) {
    const [y, mo, dd] = date.split('-').map(Number);
    const d = new Date(y, mo - 1, dd + dir * 7);
    setDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ['appointments'] });
  }

  function handleEdit(a: Appointment) {
    setEditAppt(a);
    setEditPatientSt(patientMap.get(a.patientId) ?? null);
    setEditDoctorSt(a.doctorId ? (doctorMap.get(a.doctorId) ?? null) : null);
  }

  function handleDelete(a: Appointment) {
    router.push(`/billing?deleteApptId=${a.id}`);
  }

  function closeEdit() {
    setEditAppt(null);
    setEditPatientSt(null);
    setEditDoctorSt(null);
  }

  const [tbodyRef] = useAutoAnimate();

  const isAdmin = user?.role === 'admin';
  const isToday = date === todayStr();
  const allVisibleIds = filtered.map((a) => a.id);
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedIds.has(id));
  const someSelected = !allSelected && allVisibleIds.some((id) => selectedIds.has(id));

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(allVisibleIds));
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Date label for subtitle
  const dateLabel = useMemo(() => {
    const [y, mo, dd] = date.split('-').map(Number);
    const d = new Date(y, mo - 1, dd);
    return lang === 'ar'
      ? d.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      : d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }, [date, lang]);

  return (
    <div className="fc-page">
      {/* Page header */}
      <div className="fc-page-head">
        <div>
          <h2 className="fc-page-title">{t('المواعيد', 'Appointments')}</h2>
          <p className="fc-page-sub">
            {dateLabel} · {filtered.length}{appointments.length !== filtered.length ? `/${appointments.length}` : ''} {t('موعد', 'appointments')}
          </p>
        </div>
        <div className="fc-page-actions">
          <button className="fc-btn fc-btn-primary fc-btn-sm" onClick={() => setAddOpen(true)}>
            <CalendarPlus className="w-4 h-4" />
            {t('موعد جديد', 'New Appointment')}
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="fc-apt-kpi-row">
        <div className="fc-apt-kpi">
          <div className="fc-apt-kpi-bar" style={{ background: '#3B82F6' }} />
          <div className="fc-apt-kpi-num">{appointments.length}</div>
          <div className="fc-apt-kpi-lab">{t('إجمالي اليوم', 'Total today')}</div>
        </div>
        <div className="fc-apt-kpi">
          <div className="fc-apt-kpi-bar" style={{ background: '#10B981' }} />
          <div className="fc-apt-kpi-num">{kpiConfirmed}</div>
          <div className="fc-apt-kpi-lab">{t('مؤكد', 'Confirmed')}</div>
        </div>
        <div className="fc-apt-kpi">
          <div className="fc-apt-kpi-bar" style={{ background: '#F59E0B' }} />
          <div className="fc-apt-kpi-num">{kpiPending}</div>
          <div className="fc-apt-kpi-lab">{t('انتظار', 'Pending')}</div>
        </div>
        <div className="fc-apt-kpi">
          <div className="fc-apt-kpi-bar" style={{ background: '#EF4444' }} />
          <div className="fc-apt-kpi-num">{kpiCancelled}</div>
          <div className="fc-apt-kpi-lab">{t('ملغي', 'Cancelled')}</div>
        </div>
        <div className="fc-apt-kpi">
          <div className="fc-apt-kpi-bar" style={{ background: '#8B5CF6' }} />
          <div className="fc-apt-kpi-num">{attendancePct}%</div>
          <div className="fc-apt-kpi-lab">{t('الحضور', 'Attendance')}</div>
        </div>
      </div>

      {/* Day picker */}
      <div className="fc-apt-daypicker">
        <button
          className="fc-apt-daynav"
          onClick={() => shiftWeek(lang === 'ar' ? 1 : -1)}
          aria-label={t('الأسبوع السابق', 'Previous week')}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        {weekDays.map((dayStr, i) => {
          const isActive = dayStr === date;
          const dayNum = parseInt(dayStr.split('-')[2], 10);
          return (
            <button
              key={dayStr}
              className={`fc-apt-day${isActive ? ' is-on' : ''}`}
              onClick={() => setDate(dayStr)}
            >
              <span className="fc-apt-day-name">{lang === 'ar' ? DAY_SHORT_AR[i] : DAY_SHORT_EN[i]}</span>
              <span className="fc-apt-day-num">{dayNum}</span>
            </button>
          );
        })}
        <button
          className="fc-apt-daynav"
          onClick={() => shiftWeek(lang === 'ar' ? -1 : 1)}
          aria-label={t('الأسبوع التالي', 'Next week')}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        {!isToday && (
          <button
            onClick={() => setDate(todayStr())}
            className="fc-btn fc-btn-outline fc-btn-sm"
            style={{ marginInlineStart: 4 }}
          >
            {t('اليوم', 'Today')}
          </button>
        )}
      </div>

      {/* Toolbar: doctor select + patient search + advanced + view toggle */}
      <div className="fc-apt-toolbar">
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
          {/* Doctor filter */}
          <select
            value={doctorId}
            onChange={(e) => { setDoctorId(e.target.value); setActiveTab('all'); }}
            className="h-9 rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-gray-700 dark:text-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600 min-w-[160px]"
          >
            <option value="">{t('كل الأطباء', 'All Doctors')}</option>
            {(doctorList?.data ?? []).map((d) => (
              <option key={d.id} value={d.id}>{lang === 'ar' ? (d.nameAr ?? d.nameEn) : d.nameEn}</option>
            ))}
          </select>

          {/* Patient search */}
          <div className="fc-dr-search" style={{ flex: 1, minWidth: '160px' }}>
            <span className="fc-dr-search-icon"><Search className="w-3.5 h-3.5" /></span>
            <input
              type="text"
              value={patientSearch}
              onChange={(e) => setPatientSearch(e.target.value)}
              placeholder={t('بحث باسم المريض...', 'Search patient...')}
            />
            {patientSearch && (
              <button className="fc-dr-search-clear" onClick={() => setPatientSearch('')}>
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Advanced toggle */}
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className={cn(
              'flex items-center gap-1.5 h-9 px-3 rounded-lg border text-sm transition-colors',
              showAdvanced
                ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                : 'border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50',
            )}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            {t('متقدم', 'Advanced')}
            {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-primary-500" />}
          </button>

          {hasActiveFilters && (
            <button
              onClick={() => { setPatientSearch(''); setTypeFilter(''); setSourceFilter(''); }}
              className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
            >
              <X className="w-3 h-3" />{t('مسح', 'Clear')}
            </button>
          )}
        </div>

        {/* View toggle */}
        <div className="fc-apt-view-toggle">
          <button className={`fc-apt-view${view === 'list' ? ' is-on' : ''}`} onClick={() => setView('list')}>
            <LayoutList className="w-3.5 h-3.5" />
            {t('قائمة', 'List')}
          </button>
          <button className={`fc-apt-view${view === 'timeline' ? ' is-on' : ''}`} onClick={() => setView('timeline')}>
            <Clock className="w-3.5 h-3.5" />
            {t('جدول', 'Timeline')}
          </button>
        </div>
      </div>

      {/* Advanced filter panel */}
      {showAdvanced && (
        <div className="rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/60 px-4 py-3 flex flex-wrap gap-4 items-end">
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-500">{t('نوع الموعد', 'Appointment Type')}</p>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-9 rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-gray-700 dark:text-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
            >
              <option value="">{t('الكل', 'All types')}</option>
              <option value="in_person">{t('حضوري', 'In Person')}</option>
              <option value="online">{t('أونلاين', 'Online')}</option>
              <option value="walk_in">{t('بدون موعد', 'Walk-in')}</option>
            </select>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-500">{t('مصدر المريض', 'Patient Source')}</p>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="h-9 rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-gray-700 dark:text-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
            >
              <option value="">{t('الكل', 'All sources')}</option>
              {availableSources.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <button
            onClick={() => { setPatientSearch(''); setTypeFilter(''); setSourceFilter(''); }}
            className="h-9 px-3 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-800 hover:bg-gray-50 flex items-center gap-1"
          >
            <X className="w-3 h-3" />{t('مسح الفلاتر', 'Clear filters')}
          </button>
        </div>
      )}

      {/* Status filter chips */}
      <div className="fc-apt-filter-strip">
        {STATUS_FILTERS.map((f) => {
          const count = f.k === 'all' ? appointments.length : (statusCounts[f.k] ?? 0);
          const isOn  = activeTab === f.k;
          return (
            <button
              key={f.k}
              className={`fc-apt-filter${isOn ? ' is-on' : ''}`}
              onClick={() => setActiveTab(f.k)}
              style={isOn ? { background: f.color + '22', color: f.color, borderColor: f.color + '44' } : undefined}
            >
              <span className="fc-apt-filter-dot" style={{ background: f.color }} />
              {lang === 'ar' ? f.labelAr : f.labelEn}
              <span className="fc-apt-filter-count">{count}</span>
            </button>
          );
        })}
        {hasActiveFilters && (
          <span className="text-xs text-gray-400 self-center ms-1">
            {filtered.length}/{appointments.length} {t('موعد', 'appts')}
          </span>
        )}
      </div>

      {/* Selection action bar */}
      {isAdmin && selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <span className="text-sm font-medium text-red-700 dark:text-red-300">
            {t(`${selectedIds.size} موعد محدد`, `${selectedIds.size} selected`)}
          </span>
          <button
            onClick={() => setBulkDeleteOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {t('حذف المحدد', 'Delete Selected')}
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="ms-auto text-xs text-red-400 hover:text-red-600 flex items-center gap-1"
          >
            <X className="w-3 h-3" />{t('إلغاء التحديد', 'Clear')}
          </button>
        </div>
      )}

      {/* ── List view ── */}
      {view === 'list' && (
        <div className="fc-card">
          {isLoading && (
            <div className="fc-table-wrap">
              <table className="fc-table">
                <thead>
                  <tr>
                    {isAdmin && <th style={{ width: '40px' }} />}
                    {[t('الوقت','Time'), t('المريض','Patient'), t('الطبيب','Doctor'), t('التخصص','Specialty'), t('المصدر','Source'), t('الحالة','Status'), t('الغرفة','Room'), t('الرسوم','Charge'), ''].map((h, i) => (
                      <th key={i}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}
                </tbody>
              </table>
            </div>
          )}
          {isError && (
            <div className="py-12 text-center text-red-500 dark:text-red-400 text-sm">
              {t('تعذّر تحميل المواعيد', 'Failed to load appointments')}
              <button onClick={() => void refetch()} className="ms-2 underline text-gray-500 hover:text-gray-700">
                {t('إعادة المحاولة', 'Retry')}
              </button>
            </div>
          )}
          {!isLoading && !isError && (
            <div className="fc-table-wrap">
              <table className="fc-table">
                <thead>
                  <tr>
                    {isAdmin && (
                      <th style={{ width: '40px' }}>
                        <input
                          type="checkbox"
                          checked={allSelected}
                          ref={(el) => { if (el) el.indeterminate = someSelected; }}
                          onChange={toggleAll}
                          className="w-4 h-4 rounded border-gray-300 dark:border-neutral-600 text-red-600 focus:ring-red-500 cursor-pointer"
                        />
                      </th>
                    )}
                    <th>{t('الوقت', 'Time')}</th>
                    <th>{t('المريض', 'Patient')}</th>
                    <th>{t('الطبيب', 'Doctor')}</th>
                    <th>{t('التخصص', 'Specialty')}</th>
                    <th>{t('المصدر', 'Source')}</th>
                    <th>{t('الحالة', 'Status')}</th>
                    <th>{t('الغرفة', 'Room')}</th>
                    <th>{t('الرسوم', 'Charge')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody ref={tbodyRef}>
                  {filtered.map((a) => {
                    const doctor    = a.doctorId ? doctorMap.get(a.doctorId) : null;
                    const specialty = a.specialtyId ? specialtyMap.get(a.specialtyId) : null;
                    const patient   = patientMap.get(a.patientId);
                    const patName   = patient
                      ? formatName(lang === 'ar' ? (patient.nameAr ?? patient.nameEn) : patient.nameEn)
                      : a.patientId.slice(-8).toUpperCase();
                    const isSelected = selectedIds.has(a.id);
                    return (
                      <tr key={a.id} className={isSelected ? 'is-selected' : undefined}>
                        {isAdmin && (
                          <td>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleOne(a.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="w-4 h-4 rounded border-gray-300 dark:border-neutral-600 text-red-600 focus:ring-red-500 cursor-pointer"
                            />
                          </td>
                        )}
                        <td>
                          <div className="fc-time" dir="ltr">{formatTime(a.startTime, lang)}</div>
                        </td>
                        <td>
                          <div className="fc-pat">
                            <div>
                              <div className="fc-pat-name">{patName}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="fc-doc">
                            <span className="fc-doc-name">
                              {doctor ? (lang === 'ar' ? (doctor.nameAr ?? doctor.nameEn) : doctor.nameEn) : '—'}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span style={{ font: '500 12px/1 var(--font-body)', color: 'var(--color-gray-500)' }}>
                            {specialty ? (lang === 'ar' ? specialty.nameAr : specialty.nameEn) : '—'}
                          </span>
                        </td>
                        <td>
                          {a.patientSource
                            ? <span className="fc-src">{a.patientSource}</span>
                            : <span style={{ color: 'var(--color-gray-300)' }}>—</span>}
                        </td>
                        <td>
                          <AppointmentStatusBadge status={a.status} lang={lang} />
                        </td>
                        <td>
                          {a.roomCode
                            ? <span className="fc-apt-room">{a.roomCode}</span>
                            : <span style={{ color: 'var(--color-gray-300)' }}>—</span>}
                        </td>
                        <td>
                          <span style={{ font: '600 13px/1 var(--font-mono)', color: 'var(--color-gray-700)', fontVariantNumeric: 'tabular-nums' }} dir="ltr">
                            {a.approvedCharge != null ? `${a.approvedCharge} ${t('ج', 'EGP')}` : '—'}
                          </span>
                        </td>
                        <td>
                          <div className="fc-row-actions">
                            <ActionMenu
                              appointment={a}
                              lang={lang}
                              t={t}
                              userRole={user?.role ?? ''}
                              onStatusChange={setStatusAppt}
                              onEdit={handleEdit}
                              onDelete={handleDelete}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={isAdmin ? 10 : 9} style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--color-gray-400)' }}>
                        {hasActiveFilters
                          ? t('لا توجد نتائج تطابق الفلتر', 'No appointments match the filter')
                          : t('لا توجد مواعيد مجدولة بعد', 'No appointments scheduled yet.')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Timeline view ── */}
      {view === 'timeline' && (
        <div className="fc-card" style={{ padding: '16px' }}>
          {isLoading ? (
            <div style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-gray-400)' }}>
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : (
            <div className="fc-apt-timeline">
              {HOURS.map((h, i) => (
                <div key={h} className="fc-apt-tl-hour" style={{ top: i * 80 }}>
                  <span className="fc-apt-tl-label" dir="ltr">{h}:00</span>
                </div>
              ))}
              {filtered.map((a) => {
                const totalMin = parseTimeMinutes(a.startTime);
                const startH   = Math.floor(totalMin / 60);
                const startM   = totalMin % 60;
                const top      = Math.max(0, (startH - HOURS[0]) * 80 + (startM / 60) * 80);
                const height   = Math.max(24, (30 / 60) * 80 - 4);
                const doctor   = a.doctorId ? doctorMap.get(a.doctorId) : null;
                const patient  = patientMap.get(a.patientId);
                const patName  = patient
                  ? formatName(lang === 'ar' ? (patient.nameAr ?? patient.nameEn) : patient.nameEn)
                  : a.patientId.slice(-8).toUpperCase();
                const borderColor = STATUS_COLORS[a.status] ?? '#94A3B8';
                return (
                  <div
                    key={a.id}
                    className="fc-apt-tl-block"
                    style={{ top, height, borderLeftColor: borderColor }}
                    onClick={() => setStatusAppt(a)}
                  >
                    <div className="fc-apt-tl-time" dir="ltr">{formatTime(a.startTime, lang)}</div>
                    <div>
                      <div className="fc-apt-tl-name">{patName}</div>
                      <div className="fc-apt-tl-sub">
                        {doctor ? (lang === 'ar' ? (doctor.nameAr ?? doctor.nameEn) : doctor.nameEn) : '—'}
                        {a.roomCode ? ` · ${a.roomCode}` : ''}
                      </div>
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && !isLoading && (
                <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', color: 'var(--color-gray-400)', fontSize: '14px' }}>
                  {t('لا توجد مواعيد', 'No appointments')}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Modals ── */}
      <AddAppointmentModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        defaultDate={date}
        onCreated={() => { setAddOpen(false); void refetch(); }}
      />

      <AddAppointmentModal
        open={!!editAppt}
        onClose={closeEdit}
        defaultDate={date}
        onCreated={() => { closeEdit(); void refetch(); }}
        editAppointment={editAppt ?? undefined}
        editPatient={editPatientSt}
        editDoctor={editDoctorSt}
      />

      {statusAppt && (
        <StatusModal
          appointment={statusAppt}
          lang={lang}
          t={t}
          onClose={() => setStatusAppt(null)}
          onDone={invalidate}
          userRole={user?.role ?? ''}
        />
      )}

      {bulkDeleteOpen && (
        <BulkDeleteModal
          ids={[...selectedIds]}
          lang={lang}
          t={t}
          onClose={() => setBulkDeleteOpen(false)}
          onDeleted={() => { setSelectedIds(new Set()); invalidate(); }}
        />
      )}
    </div>
  );
}
