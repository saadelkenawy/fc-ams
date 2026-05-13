'use client';

import { useState, useEffect, useCallback, useRef, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Calendar, Clock, Search, User, Stethoscope, AlertCircle, CalendarPlus,
  FlaskConical, X, UserPlus, Building2, Globe, Zap, ChevronRight, Phone,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useLang } from '@/contexts/LanguageContext';
import { useDoctors, useSpecialties } from '@/hooks/useDoctors';
import { usePatients } from '@/hooks/usePatients';
import { useProcedures } from '@/hooks/useProcedures';
import { useDebounce } from '@/hooks/useDebounce';
import { appointmentApi, patientApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Doctor, Patient, Specialty } from '@fadl/types';

const PATIENT_SOURCES = [
  { code: "Cl.'s",  labelAr: 'عيادة',    labelEn: 'Clinic' },
  { code: "Dr.'s",  labelAr: 'إحالة',    labelEn: 'Referral' },
  { code: 'VEZ',    labelAr: 'فيزيتا',   labelEn: 'Vizita' },
  { code: 'Ex-VEZ', labelAr: 'Ex-VEZ',   labelEn: 'Ex-VEZ' },
  { code: 'EKF',    labelAr: 'اكشف',     labelEn: 'Ekshf' },
  { code: 'Ex-EKF', labelAr: 'Ex-EKF',   labelEn: 'Ex-EKF' },
  { code: 'DO',     labelAr: 'كلينيدو',  labelEn: 'CliniDo' },
  { code: 'Ex-DO',  labelAr: 'Ex-DO',    labelEn: 'Ex-DO' },
  { code: 'SHL',    labelAr: 'شامل',     labelEn: 'Shamel' },
];

const APPT_TYPES = [
  { value: 'in_person', labelAr: 'حضوري',     labelEn: 'In Person', Icon: Building2 },
  { value: 'online',    labelAr: 'أونلاين',   labelEn: 'Online',    Icon: Globe },
  { value: 'walk_in',   labelAr: 'بدون موعد', labelEn: 'Walk-in',   Icon: Zap },
];

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function makeKey() { return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }

function normalizeEgyptianMobile(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('20') && digits.length === 12) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 11)  return `+20${digits.slice(1)}`;
  if (digits.length === 10)                             return `+20${digits}`;
  return raw.trim();
}

// ── Step section wrapper ──────────────────────────────────────────────────────
function StepSection({ step, title, badge, children }: {
  step: number; title: string; badge: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2.5">
        <span className={cn('w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0', badge)}>
          {step}
        </span>
        <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">{title}</span>
        <div className="flex-1 h-px bg-gray-100 dark:bg-neutral-700" />
      </div>
      {children}
    </div>
  );
}

// ── Quick-create patient ──────────────────────────────────────────────────────
function QuickCreatePatient({ lang, t, prefillName, onCreated, onCancel }: {
  lang: 'ar' | 'en'; t: (a: string, b: string) => string;
  prefillName: string;
  onCreated: (p: Patient) => void;
  onCancel: () => void;
}) {
  const [nameEn, setNameEn] = useState(prefillName);
  const [nameAr, setNameAr] = useState('');
  const [mobile, setMobile] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const normalizedMobile = normalizeEgyptianMobile(mobile);
  const mobileValid = /^\+20[0-9]{10}$/.test(normalizedMobile);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!nameEn.trim()) { setError(t('الاسم مطلوب', 'Name is required')); return; }
    if (!mobileValid)   { setError(t('يجب إدخال رقم مصري صحيح', 'Enter a valid Egyptian mobile')); return; }
    setError('');
    setSaving(true);
    try {
      const res = await patientApi.post('/patients', {
        nameEn: nameEn.trim(),
        nameAr: nameAr.trim() || undefined,
        mobile: normalizedMobile,
      });
      onCreated(res.data.data as Patient);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg ?? t('فشل إنشاء المريض', 'Failed to create patient'));
    } finally {
      setSaving(false);
    }
  }

  const fieldCls = 'h-9 rounded-lg border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600 transition-shadow w-full bg-white dark:bg-neutral-800 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-neutral-600';

  return (
    <div className="mt-2 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-4 space-y-3">
      <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5 uppercase tracking-wide">
        <UserPlus className="w-3.5 h-3.5" />{t('مريض جديد', 'New Patient')}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <input className={fieldCls} placeholder={t('الاسم بالإنجليزية *', 'Name EN *')} value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
        <input className={fieldCls} placeholder={t('الاسم بالعربية', 'Name AR')} value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" />
        <div className="col-span-2 relative">
          <span className="absolute inset-y-0 start-3 flex items-center text-xs font-mono text-gray-400 pointer-events-none">+20</span>
          <input
            className={cn(fieldCls, 'ps-12 font-mono', mobile && !mobileValid ? 'border-red-400 focus:ring-red-400' : '')}
            placeholder="01XXXXXXXXX *"
            value={mobile}
            onChange={(e) => { setMobile(e.target.value); setError(''); }}
            dir="ltr"
            type="tel"
          />
          {mobile && !mobileValid && <p className="text-[11px] text-red-500 mt-1">{t('مثال: 01012345678', 'e.g. 01012345678')}</p>}
          {mobile && mobileValid && <p className="text-[11px] text-emerald-600 mt-1">✓ {normalizedMobile}</p>}
        </div>
      </div>
      {error && <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-2.5 py-1.5">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={saving || !nameEn.trim() || !mobileValid}
          onClick={handleCreate}
          className="flex-1 h-8 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? t('جاري الحفظ...', 'Saving...') : t('إنشاء وتحديد', 'Create & Select')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-8 px-3 rounded-lg border border-gray-200 dark:border-neutral-600 text-xs text-gray-500 hover:bg-gray-50 dark:hover:bg-neutral-700 transition-colors"
        >
          {t('إلغاء', 'Cancel')}
        </button>
      </div>
    </div>
  );
}

// ── Patient picker ────────────────────────────────────────────────────────────
function PatientPicker({ lang, t, value, onChange }: {
  lang: 'ar' | 'en'; t: (a: string, b: string) => string;
  value: Patient | null; onChange: (p: Patient | null) => void;
}) {
  const [q, setQ]               = useState('');
  const [open, setOpen]         = useState(false);
  const [creating, setCreating] = useState(false);
  const inputRef                = useRef<HTMLInputElement>(null);
  const dropRef                 = useRef<HTMLDivElement>(null);
  const [dropStyle, setDropStyle] = useState<React.CSSProperties>({});
  const dq                      = useDebounce(q, 280);
  const canSearch               = dq.trim().length >= 2;

  const { data, isFetching } = usePatients(
    canSearch ? { query: dq, limit: 10, enabled: true } : { enabled: false },
  );
  const results: Patient[] = canSearch ? (data?.data ?? []) : [];

  const updatePosition = useCallback(() => {
    if (!inputRef.current) return;
    const r = inputRef.current.getBoundingClientRect();
    setDropStyle({ position: 'fixed', top: r.bottom + 4, left: r.left, width: r.width, zIndex: 9999 });
  }, []);

  useEffect(() => { if (open) updatePosition(); }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (
        inputRef.current && !inputRef.current.contains(e.target as Node) &&
        dropRef.current  && !dropRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelect = useCallback((p: Patient) => {
    onChange(p);
    setQ('');
    setOpen(false);
    setCreating(false);
  }, [onChange]);

  if (value) {
    const name = lang === 'ar' ? (value.nameAr ?? value.nameEn) : value.nameEn;
    return (
      <div className="flex items-center justify-between p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-sm">
            {name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200 leading-tight">{name}</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-mono flex items-center gap-1 mt-0.5" dir="ltr">
              <Phone className="w-3 h-3" />{value.mobile}
            </p>
          </div>
        </div>
        <button
          onClick={() => onChange(null)}
          className="text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-200 font-medium px-2 py-1 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
        >
          {t('تغيير', 'Change')}
        </button>
      </div>
    );
  }

  const showDrop = open && (results.length > 0 || (canSearch && !isFetching));

  return (
    <div>
      <div className="relative">
        <Search className="absolute inset-y-0 start-3 my-auto w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          ref={inputRef}
          className="w-full h-10 rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 ps-9 pe-9 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600 transition-shadow"
          placeholder={t('اكتب اسم المريض أو رقم الهاتف...', 'Name or phone (min 2 chars)...')}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setCreating(false); updatePosition(); }}
          onFocus={() => { setOpen(true); updatePosition(); }}
        />
        {isFetching && <div className="absolute inset-y-0 end-3 my-auto w-3.5 h-3.5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />}
        {q && !isFetching && (
          <button type="button" onClick={() => { setQ(''); setOpen(false); }} className="absolute inset-y-0 end-3 my-auto text-gray-300 hover:text-gray-500">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {showDrop && typeof document !== 'undefined' && createPortal(
        <div ref={dropRef} style={dropStyle} className="bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-xl shadow-2xl overflow-hidden">
          {results.map((p) => {
            const pName = lang === 'ar' ? (p.nameAr ?? p.nameEn) : p.nameEn;
            return (
              <button
                key={p.patientId}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); handleSelect(p); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors text-start border-b border-gray-50 dark:border-neutral-700/50 last:border-0"
              >
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                  {pName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{pName}</p>
                  <p className="text-xs text-gray-400 font-mono" dir="ltr">{p.mobile}</p>
                </div>
              </button>
            );
          })}
          {canSearch && !isFetching && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); setOpen(false); setCreating(true); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors text-start border-t border-gray-100 dark:border-neutral-700"
            >
              <div className="w-7 h-7 rounded-full bg-primary-600 flex items-center justify-center shrink-0">
                <UserPlus className="w-3.5 h-3.5 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-primary-700 dark:text-primary-300">{t('إنشاء مريض جديد', 'Create new patient')}</p>
                <p className="text-xs text-primary-500 dark:text-primary-400 truncate">"{q}"</p>
              </div>
            </button>
          )}
        </div>,
        document.body,
      )}

      {creating && (
        <QuickCreatePatient lang={lang} t={t} prefillName={q} onCreated={handleSelect} onCancel={() => setCreating(false)} />
      )}
    </div>
  );
}

// ── Doctor picker ─────────────────────────────────────────────────────────────
function DoctorPicker({ lang, t, value, onChange, specialties }: {
  lang: 'ar' | 'en'; t: (a: string, b: string) => string;
  value: Doctor | null; onChange: (d: Doctor | null) => void;
  specialties: Specialty[];
}) {
  const [q, setQ]       = useState('');
  const [specId, setSpecId] = useState('');
  const { data } = useDoctors({ isActive: true, limit: 200 });
  const all: Doctor[] = data?.data ?? [];
  const specMap = new Map(specialties.map((s) => [s.id, s]));

  const filtered = all.filter((d) => {
    const name = (lang === 'ar' ? (d.nameAr ?? d.nameEn) : d.nameEn).toLowerCase();
    return (!q || name.includes(q.toLowerCase())) && (!specId || String(d.specialtyId) === specId);
  }).slice(0, 12);

  if (value) {
    const spec = specMap.get(value.specialtyId);
    const dName = lang === 'ar' ? (value.nameAr ?? value.nameEn) : value.nameEn;
    return (
      <div className="flex items-center justify-between p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-sm">
            {dName.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold text-blue-900 dark:text-blue-200 leading-tight">{dName}</p>
            {spec && (
              <span className="text-[11px] bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full font-medium mt-0.5 inline-block">
                {lang === 'ar' ? spec.nameAr : spec.nameEn}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => onChange(null)}
          className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 font-medium px-2 py-1 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
        >
          {t('تغيير', 'Change')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute inset-y-0 start-3 my-auto w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            className="w-full h-9 rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 ps-9 pe-3 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600 transition-shadow"
            placeholder={t('بحث باسم الطبيب...', 'Search doctor...')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {q && (
            <button type="button" onClick={() => setQ('')} className="absolute inset-y-0 end-2 my-auto text-gray-300 hover:text-gray-500">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <select
          className="h-9 rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2 text-xs text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-600 max-w-[130px]"
          value={specId}
          onChange={(e) => setSpecId(e.target.value)}
        >
          <option value="">{t('كل التخصصات', 'All')}</option>
          {specialties.sort((a, b) => a.nameEn.localeCompare(b.nameEn)).map((s) => (
            <option key={s.id} value={String(s.id)}>{lang === 'ar' ? s.nameAr : s.nameEn}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto pr-0.5">
        {filtered.map((d) => {
          const spec = specMap.get(d.specialtyId);
          const dName = lang === 'ar' ? (d.nameAr ?? d.nameEn) : d.nameEn;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => onChange(d)}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-gray-100 dark:border-neutral-700 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all text-start group"
            >
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0 group-hover:scale-110 transition-transform">
                {dName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors">
                  {dName}
                </p>
                {spec && (
                  <p className="text-[10px] text-blue-500 dark:text-blue-400 truncate font-medium">
                    {lang === 'ar' ? spec.nameAr : spec.nameEn}
                  </p>
                )}
              </div>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-2 py-5 text-center text-xs text-gray-400">
            {t('لا يوجد أطباء', 'No doctors found')}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
interface AddAppointmentModalProps {
  open: boolean;
  onClose: () => void;
  defaultDate?: string;
  onCreated?: () => void;
}

export function AddAppointmentModal({ open, onClose, defaultDate, onCreated }: AddAppointmentModalProps) {
  const { lang, t } = useLang();
  const qc = useQueryClient();
  const { data: specialties = [] } = useSpecialties();
  const { data: proceduresData } = useProcedures({ isActive: true, limit: 100 });
  const procedures = proceduresData?.data ?? [];

  const [patient,     setPatient]     = useState<Patient | null>(null);
  const [doctor,      setDoctor]      = useState<Doctor | null>(null);
  const [date,        setDate]        = useState(defaultDate ?? new Date().toISOString().split('T')[0]);
  const [time,        setTime]        = useState('09:00');
  const [duration,    setDuration]    = useState(20);
  const [apptType,    setApptType]    = useState<'in_person' | 'online' | 'walk_in'>('in_person');
  const [source,      setSource]      = useState("Cl.'s");
  const [charge,      setCharge]      = useState('');
  const [notes,       setNotes]       = useState('');
  const [procedureId, setProcedureId] = useState('');
  const [procCost,    setProcCost]    = useState('');
  const [errors,      setErrors]      = useState<Record<string, string>>({});

  useEffect(() => { if (defaultDate) setDate(defaultDate); }, [defaultDate]);

  useEffect(() => {
    if (!procedureId) { setProcCost(''); return; }
    const proc = procedures.find((p) => p.id === procedureId);
    if (proc && proc.basePrice != null) setProcCost(String(proc.basePrice));
  }, [procedureId, procedures]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!patient || !doctor) throw new Error('Missing required fields');
      const body: Record<string, unknown> = {
        patientId:       patient.patientId,
        doctorId:        doctor.id,
        appointmentDate: date,
        startTime:       time,
        endTime:         addMinutes(time, duration),
        appointmentType: apptType,
        patientSource:   source,
        idempotencyKey:  makeKey(),
      };
      if (charge)      body.approvedCharge = Number(charge);
      if (notes)       body.notes          = notes;
      if (procedureId) body.procedureId    = procedureId;
      if (procCost)    body.procedureCost  = Number(procCost);
      await appointmentApi.post('/appointments', body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['appointments'] });
      onCreated?.();
      onClose();
      setPatient(null); setDoctor(null); setCharge(''); setNotes('');
      setProcedureId(''); setProcCost(''); setErrors({});
    },
  });

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!patient) e.patient = t('اختر مريضاً', 'Select a patient');
    if (!doctor)  e.doctor  = t('اختر طبيباً', 'Select a doctor');
    if (!date)    e.date    = t('التاريخ مطلوب', 'Date required');
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    mutation.mutate();
  }

  const inputCls = 'w-full h-10 rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600 transition-shadow';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('موعد جديد', 'New Appointment')}
      subtitle={t('احجز موعدًا لمريض مع الطبيب', 'Schedule a patient visit')}
      maxWidth="xl"
      stretch
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={mutation.isPending}>
            {t('إلغاء', 'Cancel')}
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={mutation.isPending} className="gap-2 min-w-[140px]">
            <CalendarPlus className="w-4 h-4" />
            {mutation.isPending ? t('جاري الحجز...', 'Booking...') : t('تأكيد الحجز', 'Confirm Booking')}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>

        {/* Error banner */}
        {mutation.isError && (
          <div className="flex items-center gap-2.5 p-3.5 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl text-red-700 dark:text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {t('حدث خطأ، يرجى التحقق من البيانات.', 'An error occurred. Please check and try again.')}
          </div>
        )}


            {/* Step 1 — Patient */}
            <StepSection step={1} title={t('المريض', 'Patient')} badge="bg-emerald-600">
              <PatientPicker lang={lang} t={t} value={patient} onChange={setPatient} />
              {errors.patient && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.patient}</p>}
            </StepSection>

            {/* Step 2 — Doctor */}
            <StepSection step={2} title={t('الطبيب', 'Doctor')} badge="bg-blue-600">
              <DoctorPicker lang={lang} t={t} value={doctor} onChange={setDoctor} specialties={specialties} />
              {errors.doctor && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.doctor}</p>}
            </StepSection>

            {/* Step 3 — Schedule */}
            <StepSection step={3} title={t('الجدول', 'Schedule')} badge="bg-indigo-600">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1 space-y-1">
                  <label className="field-label">{t('التاريخ', 'Date')}</label>
                  <input
                    type="date"
                    className={cn(inputCls, errors.date && 'border-red-400 focus:ring-red-400')}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                  {errors.date && <p className="text-xs text-red-500">{errors.date}</p>}
                </div>
                <div className="space-y-1">
                  <label className="field-label">{t('الوقت', 'Time')}</label>
                  <div className="relative">
                    <Clock className="absolute inset-y-0 start-3 my-auto w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                    <input type="time" className={cn(inputCls, 'ps-8')} value={time} step={60 * 5} onChange={(e) => setTime(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="field-label">{t('المدة', 'Duration')}</label>
                  <select className={cn(inputCls, 'cursor-pointer')} value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                    {[10, 15, 20, 30, 45, 60, 90].map((m) => (
                      <option key={m} value={m}>{m} {t('د', 'min')}</option>
                    ))}
                  </select>
                </div>
              </div>
            </StepSection>

            {/* Step 4 — Details */}
            <StepSection step={4} title={t('التفاصيل', 'Details')} badge="bg-primary-600">
              <div className="space-y-3">

                {/* Appointment type — icon buttons */}
                <div className="space-y-1.5">
                  <label className="field-label">{t('نوع الموعد', 'Appointment Type')}</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {APPT_TYPES.map(({ value: v, labelAr, labelEn, Icon }) => {
                      const active = apptType === v;
                      return (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setApptType(v as typeof apptType)}
                          className={cn(
                            'flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-semibold transition-all',
                            active
                              ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
                              : 'bg-white dark:bg-neutral-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-neutral-700 hover:border-primary-400 hover:text-primary-600 dark:hover:text-primary-400',
                          )}
                        >
                          <Icon className="w-4 h-4" />
                          {lang === 'ar' ? labelAr : labelEn}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Patient source — pill chips */}
                <div className="space-y-1.5">
                  <label className="field-label">{t('مصدر المريض', 'Patient Source')}</label>
                  <div className="flex flex-wrap gap-1.5">
                    {PATIENT_SOURCES.map((s) => {
                      const active = source === s.code;
                      return (
                        <button
                          key={s.code}
                          type="button"
                          onClick={() => setSource(s.code)}
                          className={cn(
                            'px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all',
                            active
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                              : 'bg-white dark:bg-neutral-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-neutral-700 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400',
                          )}
                        >
                          {lang === 'ar' ? s.labelAr : s.code}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Session fee + Notes */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="field-label">{t('التعرفة', 'Session Fee')}</label>
                    <div className="relative flex">
                      <span className="inline-flex items-center px-3 rounded-s-xl border border-e-0 border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-700 text-xs font-bold text-gray-500 dark:text-gray-400 select-none">
                        EGP
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="50"
                        className="flex-1 h-10 rounded-e-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-600 transition-shadow [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        placeholder="0"
                        value={charge}
                        onChange={(e) => setCharge(e.target.value)}
                        dir="ltr"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="field-label">{t('ملاحظات', 'Notes')}</label>
                    <input className={inputCls} placeholder={t('اختياري...', 'Optional...')} value={notes} onChange={(e) => setNotes(e.target.value)} />
                  </div>
                </div>

              </div>
            </StepSection>

            {/* Extra service (optional) */}
            <div className="rounded-xl border border-violet-100 dark:border-violet-900/40 bg-violet-50/50 dark:bg-violet-900/10 p-3.5 space-y-2.5">
              <p className="flex items-center gap-2 text-xs font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider">
                <FlaskConical className="w-3.5 h-3.5" />
                {t('خدمة إضافية (اختياري)', 'Extra Service (optional)')}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="field-label">{t('الإجراء', 'Procedure')}</label>
                  <select
                    className={cn(inputCls, 'cursor-pointer border-violet-200 dark:border-violet-800 focus:ring-violet-500')}
                    value={procedureId}
                    onChange={(e) => setProcedureId(e.target.value)}
                  >
                    <option value="">{t('لا شيء', 'None')}</option>
                    {procedures.map((p) => (
                      <option key={p.id} value={p.id}>{lang === 'ar' ? (p.nameAr ?? p.nameEn) : p.nameEn}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="field-label">{t('التكلفة (EGP)', 'Cost (EGP)')}</label>
                  <div className="relative flex">
                    <span className={cn('inline-flex items-center px-2.5 rounded-s-xl border border-e-0 border-violet-200 dark:border-violet-800 text-[10px] font-bold text-violet-500 select-none', !procedureId && 'opacity-40')}>
                      EGP
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="10"
                      className={cn('flex-1 h-10 rounded-e-xl border border-violet-200 dark:border-violet-800 bg-white dark:bg-neutral-800 px-3 text-sm font-semibold tabular-nums text-violet-700 dark:text-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-500 transition-shadow [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none', !procedureId && 'opacity-40 cursor-not-allowed bg-gray-50 dark:bg-neutral-900')}
                      placeholder="0"
                      value={procCost}
                      disabled={!procedureId}
                      onChange={(e) => setProcCost(e.target.value)}
                      dir="ltr"
                    />
                  </div>
                </div>
              </div>
            </div>

        {/* ── Booking summary bar ── */}
        {patient && doctor && (
          <div className="rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-100 dark:border-blue-900/40 px-4 py-3.5">
            <p className="text-[10px] font-bold text-blue-500 dark:text-blue-400 uppercase tracking-widest mb-2">
              {t('ملخص الحجز', 'Booking Summary')}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
              <span className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                  {(lang === 'ar' ? (patient.nameAr ?? patient.nameEn) : patient.nameEn).charAt(0).toUpperCase()}
                </span>
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  {lang === 'ar' ? (patient.nameAr ?? patient.nameEn) : patient.nameEn}
                </span>
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <span className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                  {(lang === 'ar' ? (doctor.nameAr ?? doctor.nameEn) : doctor.nameEn).charAt(0).toUpperCase()}
                </span>
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  {lang === 'ar' ? (doctor.nameAr ?? doctor.nameEn) : doctor.nameEn}
                </span>
              </span>
              <span className="text-gray-300 dark:text-neutral-600">•</span>
              <span className="flex items-center gap-1 text-gray-500 dark:text-gray-400 font-mono text-xs">
                <Calendar className="w-3.5 h-3.5" />{date}
              </span>
              <span className="flex items-center gap-1 text-gray-500 dark:text-gray-400 font-mono text-xs">
                <Clock className="w-3.5 h-3.5" />{time}
              </span>
              {charge && (
                <span className="ms-auto font-mono font-bold text-primary-700 dark:text-primary-400">
                  {Number(charge).toLocaleString()} EGP
                </span>
              )}
              {procedureId && procCost && (
                <span className="font-mono text-violet-600 dark:text-violet-400 text-xs">
                  + {Number(procCost).toLocaleString()} EGP {t('خدمة', 'svc')}
                </span>
              )}
            </div>
          </div>
        )}

      </form>
    </Modal>
  );
}
