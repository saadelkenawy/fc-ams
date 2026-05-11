'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { CalendarPlus, ChevronLeft, ChevronRight, CalendarDays, MoreVertical, Pencil, Trash2, Check, X, Search, SlidersHorizontal, CalendarOff } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, AppointmentStatusBadge } from '@/components/ui/Badge';
import { useLang } from '@/contexts/LanguageContext';
import { formatTime, cn } from '@/lib/utils';
import { useAppointments } from '@/hooks/useAppointments';
import { useDoctors, useDoctorMap, useSpecialtyMap } from '@/hooks/useDoctors';
import { usePatientMap } from '@/hooks/usePatients';
import { useDebounce } from '@/hooks/useDebounce';
import { AddAppointmentModal } from '@/components/appointments/AddAppointmentModal';
import { appointmentApi } from '@/lib/api';
import type { Appointment, AppointmentStatus } from '@fadl/types';

// Allowed forward transitions shown in the UI
const TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  'TBC':    ['Ok!', 'Conf.', 'Canc.'],
  'Ok!':    ['Conf.', 'Canc.'],
  'Conf.':  ['Comp.', 'Canc.'],
  'Comp.':  [],
  'Canc.':  [],
  'Resch.': [],
  'Inf.':   ['TBC', 'Ok!'],
};

const STATUS_LABELS: Record<AppointmentStatus, { ar: string; en: string }> = {
  'TBC':    { ar: 'انتظار',  en: 'TBC' },
  'Ok!':    { ar: 'موافق',   en: 'Confirmed' },
  'Conf.':  { ar: 'مؤكد',    en: 'Checked-in' },
  'Comp.':  { ar: 'مكتمل',   en: 'Complete' },
  'Canc.':  { ar: 'ملغي',    en: 'Cancelled' },
  'Resch.': { ar: 'معاد جدولة', en: 'Rescheduled' },
  'Inf.':   { ar: 'مُبلَّغ',  en: 'Informed' },
};

const STATUS_TABS: { status: AppointmentStatus | 'all'; labelAr: string; labelEn: string }[] = [
  { status: 'all',   labelAr: 'الكل',   labelEn: 'All'       },
  { status: 'TBC',   labelAr: 'انتظار', labelEn: 'TBC'       },
  { status: 'Ok!',   labelAr: 'موافق',  labelEn: 'Ok!'       },
  { status: 'Conf.', labelAr: 'مؤكد',   labelEn: 'Confirmed' },
  { status: 'Comp.', labelAr: 'مكتمل',  labelEn: 'Complete'  },
  { status: 'Canc.', labelAr: 'ملغي',   labelEn: 'Cancelled' },
];

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function formatName(str: string): string {
  return str.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

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
  onStatusChange: (appt: Appointment) => void;
  onDelete: (appt: Appointment) => void;
}

function ActionMenu({ appointment, lang, t, onStatusChange, onDelete }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const canChange = (TRANSITIONS[appointment.status] ?? []).length > 0;
  const isTerminal = appointment.status === 'Comp.' || appointment.status === 'Canc.' || appointment.status === 'Resch.';

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  if (isTerminal) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-700 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute end-0 top-8 z-50 w-44 rounded-xl border border-gray-100 dark:border-neutral-700 bg-white dark:bg-neutral-800 shadow-lg py-1 text-sm">
          {canChange && (
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); onStatusChange(appointment); }}
              className="w-full flex items-center gap-2.5 px-4 py-2 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-neutral-700 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5 text-primary-500" />
              {t('تغيير الحالة', 'Change Status')}
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setOpen(false); onDelete(appointment); }}
            className="w-full flex items-center gap-2.5 px-4 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {t('حذف الموعد', 'Delete')}
          </button>
        </div>
      )}
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
}

function StatusModal({ appointment, lang, t, onClose, onDone }: StatusModalProps) {
  const [selected, setSelected] = useState<AppointmentStatus | null>(null);
  const allowed = TRANSITIONS[appointment.status] ?? [];

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

// ── Delete confirm modal ───────────────────────────────────────────────────

interface DeleteModalProps {
  appointment: Appointment;
  patientName: string;
  lang: 'ar' | 'en';
  t: (ar: string, en: string) => string;
  onClose: () => void;
  onDone: () => void;
}

function DeleteModal({ appointment, patientName, lang, t, onClose, onDone }: DeleteModalProps) {
  const mutation = useMutation({
    mutationFn: async () => {
      await appointmentApi.delete(`/appointments/${appointment.id}`);
    },
    onSuccess: () => { onDone(); onClose(); },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm mx-4 bg-white dark:bg-neutral-800 rounded-2xl shadow-xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
            <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t('حذف الموعد', 'Delete Appointment')}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {patientName} — {appointment.appointmentDate} {formatTime(appointment.startTime)}
            </p>
          </div>
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-300 mb-5">
          {t('هل أنت متأكد من حذف هذا الموعد؟ لا يمكن التراجع عن هذا الإجراء.', 'Are you sure you want to delete this appointment? This action cannot be undone.')}
        </p>

        {mutation.isError && (
          <p className="text-xs text-red-500 mb-3">{t('فشل الحذف', 'Delete failed')}</p>
        )}

        <div className="flex gap-2">
          <Button
            className="flex-1 bg-red-600 hover:bg-red-700 text-white border-0"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? t('جاري الحذف...', 'Deleting...') : t('حذف', 'Delete')}
          </Button>
          <Button variant="ghost" onClick={onClose}>{t('إلغاء', 'Cancel')}</Button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function AppointmentsPage() {
  const { lang, t } = useLang();
  const qc = useQueryClient();
  const [activeTab,  setActiveTab]  = useState<AppointmentStatus | 'all'>('all');
  const [date,       setDate]       = useState(todayStr);
  const [doctorId,   setDoctorId]   = useState<string>('');
  const [addOpen,    setAddOpen]    = useState(false);
  const [statusAppt, setStatusAppt] = useState<Appointment | null>(null);
  const [deleteAppt, setDeleteAppt] = useState<Appointment | null>(null);

  // Advanced filters (client-side)
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [typeFilter,    setTypeFilter]    = useState('');
  const [sourceFilter,  setSourceFilter]  = useState('');
  const debouncedPatient = useDebounce(patientSearch, 250);

  const { data, isLoading, isError, refetch } = useAppointments({
    date,
    limit:    100,
    doctorId: doctorId || undefined,
  });
  const appointments = data?.data ?? [];
  const doctorMap    = useDoctorMap();
  const specialtyMap = useSpecialtyMap();
  const patientMap   = usePatientMap();
  const { data: doctorList } = useDoctors({ isActive: true, limit: 200 });

  const hasActiveFilters = !!(patientSearch || typeFilter || sourceFilter);

  const filtered = useMemo(() => {
    let list = activeTab === 'all' ? appointments : appointments.filter((a) => a.status === activeTab);
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

  // Unique sources in current day's data
  const availableSources = useMemo(() => [...new Set(appointments.map((a) => a.patientSource).filter(Boolean))].sort(), [appointments]);

  const visible = filtered;

  function shiftDate(days: number) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().split('T')[0]);
  }

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ['appointments'] });
  }

  const isToday = date === todayStr();

  return (
    <div className="space-y-5 max-w-7xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-bold font-display text-gray-900 dark:text-gray-100 animate-slide-down">
          {t('المواعيد', 'Appointments')}
        </h2>
        <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5 animate-slide-down" style={{ animationDelay: '40ms' }}>
          <CalendarPlus className="w-4 h-4" />
          {t('موعد جديد', 'New Appointment')}
        </Button>
      </div>

      {/* Date nav + doctor filter + status tabs */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
          {/* Date navigation */}
          <div className="flex items-center gap-2">
            <button onClick={() => shiftDate(-1)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-700 text-gray-500 dark:text-gray-300 transition-colors">
              {lang === 'ar' ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-9 rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-gray-900 dark:text-gray-100 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
            />
            <button onClick={() => shiftDate(1)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-700 text-gray-500 dark:text-gray-300 transition-colors">
              {lang === 'ar' ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            {!isToday && (
              <button onClick={() => setDate(todayStr())} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors border border-primary-100 dark:border-primary-800">
                <CalendarDays className="w-3.5 h-3.5" />{t('اليوم', 'Today')}
              </button>
            )}
          </div>

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
          <div className="relative flex-1 min-w-40">
            <Search className="absolute inset-y-0 start-3 my-auto w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={patientSearch}
              onChange={(e) => setPatientSearch(e.target.value)}
              placeholder={t('بحث باسم المريض...', 'Search patient...')}
              className="w-full h-9 rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-gray-800 dark:text-gray-200 placeholder:text-gray-400 ps-8 pe-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
            />
            {patientSearch && (
              <button onClick={() => setPatientSearch('')} className="absolute inset-y-0 end-2 my-auto text-gray-300 hover:text-gray-500">
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

        {/* Status tabs */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="pill-tab-bar overflow-x-auto">
            {STATUS_TABS.map((tab) => {
              const count = tab.status === 'all' ? appointments.length : (statusCounts[tab.status] ?? 0);
              return (
                <button
                  key={tab.status}
                  onClick={() => setActiveTab(tab.status)}
                  className={`pill-tab whitespace-nowrap flex items-center gap-1.5 ${activeTab === tab.status ? 'active' : ''}`}
                >
                  {lang === 'ar' ? tab.labelAr : tab.labelEn}
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none ${
                      activeTab === tab.status ? 'bg-white/25 text-white' : 'bg-gray-100 dark:bg-neutral-700 text-gray-600 dark:text-gray-300'
                    }`}>
                      {count}
                    </span>
                </button>
              );
            })}
          </div>
          {hasActiveFilters && (
            <span className="text-xs text-gray-400">
              {visible.length} / {appointments.length} {t('موعد', 'appts')}
            </span>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50 dark:border-neutral-700 bg-gray-50/50 dark:bg-neutral-900/40">
                  {[t('الوقت','Time'), t('المريض','Patient'), t('الطبيب','Doctor'), t('التخصص','Specialty'), t('المصدر','Source'), t('الحالة','Status'), t('الغرفة','Room'), t('الرسوم','Charge'), ''].map((h, i) => (
                    <th key={i} className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}
              </tbody>
            </table>
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
            <div className="min-h-[400px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-white dark:bg-neutral-800 shadow-sm">
                  <tr className="border-b border-gray-50 dark:border-neutral-700 bg-gray-50/50 dark:bg-neutral-900/40">
                    <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('الوقت', 'Time')}</th>
                    <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('المريض', 'Patient')}</th>
                    <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('الطبيب', 'Doctor')}</th>
                    <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('التخصص', 'Specialty')}</th>
                    <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('المصدر', 'Source')}</th>
                    <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('الحالة', 'Status')}</th>
                    <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('الغرفة', 'Room')}</th>
                    <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('الرسوم', 'Charge')}</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((a) => {
                    const doctor    = a.doctorId ? doctorMap.get(a.doctorId) : null;
                    const specialty = a.specialtyId ? specialtyMap.get(a.specialtyId) : null;
                    const patient   = patientMap.get(a.patientId);
                    const patName   = patient
                      ? formatName(lang === 'ar' ? (patient.nameAr ?? patient.nameEn) : patient.nameEn)
                      : a.patientId.slice(-8).toUpperCase();
                    return (
                      <tr key={a.id} className="border-b border-gray-50 dark:border-neutral-700/50 hover:bg-gray-50/50 dark:hover:bg-neutral-700/30 transition-colors">
                        <td className="px-5 py-3.5 font-mono text-gray-600 dark:text-gray-300 text-xs" dir="ltr">{formatTime(a.startTime)}</td>
                        <td className="px-5 py-3.5 font-medium text-gray-900 dark:text-gray-100 max-w-[180px] truncate" title={patName}>
                          {patName}
                        </td>
                        <td className="px-5 py-3.5 text-gray-600 dark:text-gray-300">
                          {doctor ? (lang === 'ar' ? (doctor.nameAr ?? doctor.nameEn) : doctor.nameEn) : '—'}
                        </td>
                        <td className="px-5 py-3.5 text-gray-600 dark:text-gray-300">
                          {specialty ? (lang === 'ar' ? specialty.nameAr : specialty.nameEn) : '—'}
                        </td>
                        <td className="px-5 py-3.5">
                          {a.patientSource
                            ? <span className="text-xs bg-gray-100 dark:bg-neutral-700 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded font-mono">{a.patientSource}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-5 py-3.5">
                          <AppointmentStatusBadge status={a.status} lang={lang} />
                        </td>
                        <td className="px-5 py-3.5">
                          {a.roomCode
                            ? <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">{a.roomCode}</span>
                            : <span className="text-gray-300 dark:text-gray-600">—</span>}
                        </td>
                        <td className="px-5 py-3.5 font-mono text-gray-700 dark:text-gray-200 tabular-nums">
                          {a.approvedCharge != null ? `${a.approvedCharge} ${t('ج', 'EGP')}` : '—'}
                        </td>
                        <td className="px-3 py-3.5">
                          <ActionMenu
                            appointment={a}
                            lang={lang}
                            t={t}
                            onStatusChange={setStatusAppt}
                            onDelete={setDeleteAppt}
                          />
                        </td>
                      </tr>
                    );
                  })}
                  {visible.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-5 py-12 text-center text-gray-400 dark:text-gray-300">
                        {hasActiveFilters
                          ? t('لا توجد نتائج تطابق الفلتر', 'No appointments match the filter')
                          : t('لا توجد مواعيد', 'No appointments found')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AddAppointmentModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        defaultDate={date}
        onCreated={() => { setAddOpen(false); void refetch(); }}
      />

      {statusAppt && (
        <StatusModal
          appointment={statusAppt}
          lang={lang}
          t={t}
          onClose={() => setStatusAppt(null)}
          onDone={invalidate}
        />
      )}

      {deleteAppt && (
        <DeleteModal
          appointment={deleteAppt}
          patientName={
            (() => {
              const p = patientMap.get(deleteAppt.patientId);
              return p ? formatName(lang === 'ar' ? (p.nameAr ?? p.nameEn) : p.nameEn) : deleteAppt.patientId.slice(-8).toUpperCase();
            })()
          }
          lang={lang}
          t={t}
          onClose={() => setDeleteAppt(null)}
          onDone={invalidate}
        />
      )}
    </div>
  );
}
