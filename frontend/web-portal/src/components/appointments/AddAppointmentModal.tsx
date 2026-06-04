'use client';

import { useState, useEffect, useCallback, useRef, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Calendar, Clock, Search, AlertCircle, AlertTriangle, CalendarPlus,
  FlaskConical, X, UserPlus, Building2, Globe, Zap, Phone,
  Banknote, CreditCard, Smartphone, Pencil, Paperclip, ExternalLink,
  Plus, Trash2,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useLang } from '@/contexts/LanguageContext';
import { useDoctors, useSpecialties } from '@/hooks/useDoctors';
import { usePatients } from '@/hooks/usePatients';
import { useProcedures } from '@/hooks/useProcedures';
import { useDebounce } from '@/hooks/useDebounce';
import { useRouter } from 'next/navigation';
import { appointmentApi, patientApi, fileApi, billingApi } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { useAppointments } from '@/hooks/useAppointments';
import { cn } from '@/lib/utils';
import type { Appointment, Doctor, Patient, Specialty } from '@fadl/types';

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

const PAYMENT_METHODS = [
  { value: 'cash',     labelAr: 'كاش',      labelEn: 'Cash',     Icon: Banknote },
  { value: 'visa',     labelAr: 'فيزا',      labelEn: 'Visa',     Icon: CreditCard },
  { value: 'instapay', labelAr: 'إنستاباي', labelEn: 'InstaPay', Icon: Smartphone },
] as const;

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = Math.min(h * 60 + m + mins, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function diffMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

function makeKey() { return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }

function roundUpTo5(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const rounded = Math.ceil(m / 5) * 5;
  if (rounded >= 60) return `${String((h + 1) % 24).padStart(2, '0')}:00`;
  return `${String(h).padStart(2, '0')}:${String(rounded).padStart(2, '0')}`;
}

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function todayYMD(): string {
  return new Date().toISOString().split('T')[0];
}

function snapDuration(mins: number): number {
  const opts = [10, 15, 20, 30, 45, 60, 90];
  return opts.reduce((prev, cur) => Math.abs(cur - mins) < Math.abs(prev - mins) ? cur : prev);
}

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
function PatientPicker({ lang, t, value, onChange, disabled }: {
  lang: 'ar' | 'en'; t: (a: string, b: string) => string;
  value: Patient | null; onChange: (p: Patient | null) => void;
  disabled?: boolean;
}) {
  const [q, setQ]               = useState('');
  const [open, setOpen]         = useState(false);
  const [creating, setCreating] = useState(false);
  const inputRef                = useRef<HTMLInputElement>(null);
  const dropRef                 = useRef<HTMLDivElement>(null);
  const [dropStyle, setDropStyle] = useState<React.CSSProperties>({});
  const dq                      = useDebounce(q, 150);
  const canSearch               = dq.trim().length >= 1;

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
        {!disabled && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-200 font-medium px-2 py-1 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
          >
            {t('تغيير', 'Change')}
          </button>
        )}
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
          placeholder={t('اكتب اسم المريض أو رقم الهاتف...', 'Name or phone...')}
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
          type="button"
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
      <div className="space-y-1 max-h-72 overflow-y-auto pe-0.5">
        {filtered.map((d) => {
          const spec = specMap.get(d.specialtyId);
          const dName = lang === 'ar' ? (d.nameAr ?? d.nameEn) : d.nameEn;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => onChange(d)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-100 dark:border-neutral-700 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all text-start group"
            >
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0 group-hover:scale-110 transition-transform">
                {dName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors">{dName}</p>
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
          <div className="py-5 text-center text-xs text-gray-400">{t('لا يوجد أطباء', 'No doctors found')}</div>
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
  /** When provided, the modal runs in edit mode */
  editAppointment?: Appointment;
  /** Pre-selected patient object for edit mode */
  editPatient?: Patient | null;
  /** Pre-selected doctor object for edit mode */
  editDoctor?: Doctor | null;
}

export function AddAppointmentModal({
  open, onClose, defaultDate, onCreated,
  editAppointment, editPatient, editDoctor,
}: AddAppointmentModalProps) {
  const { lang, t } = useLang();
  const { toast } = useToast();
  const qc = useQueryClient();
  const router = useRouter();
  const { data: specialties = [] } = useSpecialties();
  const { data: proceduresData } = useProcedures({ isActive: true, limit: 100 });
  const procedures = proceduresData?.data ?? [];

  const isEdit = !!editAppointment;

  const [patient,       setPatient]       = useState<Patient | null>(editPatient ?? null);
  const [doctor,        setDoctor]        = useState<Doctor | null>(editDoctor ?? null);
  const [date,          setDate]          = useState(editAppointment?.appointmentDate ?? defaultDate ?? new Date().toISOString().split('T')[0]);
  const [time,          setTime]          = useState(editAppointment?.startTime ?? '09:00');
  const [duration,      setDuration]      = useState(
    editAppointment ? diffMinutes(editAppointment.startTime, editAppointment.endTime) : 20
  );
  const [apptType,      setApptType]      = useState<'in_person' | 'online' | 'walk_in'>(
    (editAppointment?.appointmentType ?? 'in_person') as 'in_person' | 'online' | 'walk_in'
  );
  const [source,        setSource]        = useState(editAppointment?.patientSource ?? "Cl.'s");
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'visa' | 'instapay' | null>(
    editAppointment?.paymentMethod ?? null
  );
  const [charge,        setCharge]        = useState(editAppointment?.approvedCharge != null ? String(editAppointment.approvedCharge) : '');
  const [notes,         setNotes]         = useState(editAppointment?.notes ?? '');
  const [procedureId,   setProcedureId]   = useState(editAppointment?.procedureId ?? '');
  const [showBillingWarn, setShowBillingWarn] = useState(false);
  const [procCost,      setProcCost]      = useState(editAppointment?.procedureCost != null ? String(editAppointment.procedureCost) : '');
  const [errors,        setErrors]        = useState<Record<string, string>>({});
  const [attachment,    setAttachment]    = useState<File | null>(null);

  // Billing line items (edit mode only — persisted to transaction_extra_services)
  type ExtraLine = { key: string; serviceName: string; cost: string };
  const [extraLines,         setExtraLines]         = useState<ExtraLine[]>([]);
  const [extraLinesLoading,  setExtraLinesLoading]  = useState(false);

  const timeManuallyEdited     = useRef(false);
  const durationManuallyEdited = useRef(false);
  const fileInputRef           = useRef<HTMLInputElement>(null);

  // Query doctor's existing appointments for the selected date (create mode only)
  const { data: doctorAppts, isFetching: apptsFetching } = useAppointments(
    !isEdit && !!doctor && !!date
      ? { doctorId: doctor.id, date, limit: 100 }
      : {},
  );

  // Check for existing appointment: same patient + same doctor + same date (create mode only)
  const TERMINAL_STATUSES = ['Canc.', 'Ref.', 'Resch.'];
  const duplicateAppt = !isEdit && patient && doctorAppts?.data
    ? (doctorAppts.data.find(
        (a) => a.patientId === patient.patientId &&
               a.appointmentDate === date &&
               !TERMINAL_STATUSES.includes(a.status),
      ) ?? null)
    : null;

  // Auto-fill next available time slot + duration from the last appointment
  useEffect(() => {
    if (isEdit || !doctor || !date) return;
    const appts = doctorAppts?.data ?? [];
    const isToday = date === todayYMD();

    if (appts.length > 0) {
      const lastAppt = appts.sort((a, b) => a.endTime.localeCompare(b.endTime)).at(-1)!;
      if (!timeManuallyEdited.current) {
        const nextSlot = isToday
          ? (lastAppt.endTime > nowHHMM() ? lastAppt.endTime : roundUpTo5(nowHHMM()))
          : lastAppt.endTime;
        setTime(nextSlot);
      }
      if (!durationManuallyEdited.current) {
        setDuration(snapDuration(diffMinutes(lastAppt.startTime, lastAppt.endTime)));
      }
    } else {
      if (!timeManuallyEdited.current) {
        setTime(isToday ? roundUpTo5(nowHHMM()) : '09:00');
      }
    }
  }, [doctor, date, doctorAppts, isEdit]);

  // Reset manual-edit flags when doctor or date changes
  useEffect(() => {
    timeManuallyEdited.current     = false;
    durationManuallyEdited.current = false;
  }, [doctor?.id, date]);

  // Sync when editAppointment changes (modal re-used)
  useEffect(() => {
    if (!open) return;
    timeManuallyEdited.current     = false;
    durationManuallyEdited.current = false;
    setPatient(editPatient ?? null);
    setDoctor(editDoctor ?? null);
    if (editAppointment) {
      setDate(editAppointment.appointmentDate);
      setTime(editAppointment.startTime);
      setDuration(diffMinutes(editAppointment.startTime, editAppointment.endTime));
      setApptType((editAppointment.appointmentType ?? 'in_person') as 'in_person' | 'online' | 'walk_in');
      setSource(editAppointment.patientSource ?? "Cl.'s");
      setPaymentMethod(editAppointment.paymentMethod ?? null);
      setCharge(editAppointment.approvedCharge != null ? String(editAppointment.approvedCharge) : '');
      setNotes(editAppointment.notes ?? '');
      setProcedureId(editAppointment.procedureId ?? '');
      setProcCost(editAppointment.procedureCost != null ? String(editAppointment.procedureCost) : '');
    } else {
      setDate(defaultDate ?? new Date().toISOString().split('T')[0]);
      setTime('09:00');
      setDuration(20);
      setApptType('in_person');
      setSource("Cl.'s");
      setPaymentMethod(null);
      setCharge('');
      setNotes('');
      setProcedureId('');
      setProcCost('');
    }
    setErrors({});
    setAttachment(null);
    setExtraLines([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editAppointment?.id]);

  // Load existing billing line items when editing an appointment that has a fee set
  useEffect(() => {
    if (!open || !isEdit || !editAppointment || !charge) return;
    setExtraLinesLoading(true);
    billingApi
      .get<{ data: Array<{ id: string; serviceName: string; cost: number }> }>(
        `/transactions/by-appointment/${editAppointment.id}/extra-services`,
      )
      .then((res) => {
        setExtraLines(
          res.data.data.map((s) => ({ key: s.id, serviceName: s.serviceName, cost: String(s.cost) })),
        );
      })
      .catch(() => { /* no billing record yet — start with empty list */ })
      .finally(() => setExtraLinesLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editAppointment?.id]);

  useEffect(() => {
    if (!procedureId) { setProcCost(''); return; }
    const proc = procedures.find((p) => p.id === procedureId);
    if (proc && proc.basePrice != null) setProcCost(String(proc.basePrice));
  }, [procedureId, procedures]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!patient || !doctor) throw new Error('Missing required fields');
      if (!paymentMethod) throw new Error('Payment method required');

      let appointmentId: string;

      if (isEdit && editAppointment) {
        // Edit mode — PATCH
        const body: Record<string, unknown> = {
          doctorId:        doctor.id,
          specialtyId:     doctor.specialtyId,
          appointmentDate: date,
          startTime:       time,
          endTime:         addMinutes(time, duration),
          appointmentType: apptType,
          patientSource:   source,
          paymentMethod:   paymentMethod,
          notes:           notes || null,
          procedureId:     procedureId || null,
        };
        if (charge)    body.approvedCharge = Number(charge);
        if (procCost)  body.procedureCost  = Number(procCost);
        await appointmentApi.patch(`/appointments/${editAppointment.id}`, body);
        appointmentId = editAppointment.id;
      } else {
        // Create mode — POST
        const body: Record<string, unknown> = {
          patientId:       patient.patientId,
          doctorId:        doctor.id,
          specialtyId:     doctor.specialtyId,
          appointmentDate: date,
          startTime:       time,
          endTime:         addMinutes(time, duration),
          appointmentType: apptType,
          patientSource:   source,
          paymentMethod:   paymentMethod,
          idempotencyKey:  makeKey(),
        };
        if (charge)      body.approvedCharge = Number(charge);
        if (notes)       body.notes          = notes;
        if (procedureId) body.procedureId    = procedureId;
        if (procCost)    body.procedureCost  = Number(procCost);
        const res = await appointmentApi.post<{ data: { id: string } }>('/appointments', body);
        appointmentId = res.data.data.id;
      }

      // Persist billing line items (edit mode only, when billing record exists)
      if (isEdit && charge) {
        const validLines = extraLines.filter((l) => l.serviceName.trim() && l.cost.trim());
        await billingApi.put(`/transactions/by-appointment/${appointmentId}/extra-services`, {
          items: validLines.map((l) => ({ serviceName: l.serviceName.trim(), cost: Number(l.cost) })),
        });
      }

      // Upload attachment if provided (presigned PUT via file-service)
      if (attachment) {
        const initRes = await fileApi.post<{ data: { fileId: string; uploadUrl: string } }>('/files/initiate', {
          originalName: attachment.name,
          mimeType:     attachment.type || 'application/octet-stream',
          sizeBytes:    attachment.size,
          entityType:   'other',
          entityId:     appointmentId,
          description:  'Appointment attachment',
        });
        const uploadRes = await fetch(initRes.data.data.uploadUrl, {
          method:  'PUT',
          body:    attachment,
          headers: { 'Content-Type': attachment.type || 'application/octet-stream' },
        });
        if (!uploadRes.ok) throw new Error(`File upload failed: ${uploadRes.status} ${uploadRes.statusText}`);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      qc.invalidateQueries({ queryKey: ['rooms'] });
      qc.invalidateQueries({ queryKey: ['room-availability'] });
      if (isEdit && extraLines.filter((l) => l.serviceName.trim()).length > 0) {
        toast(
          t('تم تحديث الخدمات الإضافية. تم تعديل تسوية الطبيب بنجاح.', 'Extra service added. Billing and doctor settlements updated successfully.'),
          'success',
        );
      }
      onCreated?.();
      onClose();
    },
  });

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!patient)             e.patient       = t('اختر مريضاً', 'Select a patient');
    if (!doctor)              e.doctor        = t('اختر طبيباً', 'Select a doctor');
    if (!date)                e.date          = t('التاريخ مطلوب', 'Date required');
    if (charge.trim() === '') e.charge        = t('التعرفة مطلوبة', 'Session fee is required');

    if (!paymentMethod)       e.paymentMethod = t('طريقة الدفع مطلوبة', 'Payment method is required to confirm this booking.');
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    // Warn admin when the session fee changes on an existing appointment —
    // the billing transaction will be updated automatically.
    const originalCharge = editAppointment?.approvedCharge;
    const newCharge = charge ? Number(charge) : null;
    if (isEdit && originalCharge != null && newCharge != null && newCharge !== originalCharge) {
      setShowBillingWarn(true);
      return;
    }
    mutation.mutate();
  }

  const inputCls = 'w-full h-10 rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600 transition-shadow';

  return (
    <>
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? t('تعديل الموعد', 'Edit Appointment') : t('موعد جديد', 'New Appointment')}
      subtitle={isEdit ? t('تحديث بيانات الموعد', 'Update appointment details') : t('احجز موعدًا لمريض مع الطبيب', 'Schedule a patient visit')}
      maxWidth="800"
      stretch
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={mutation.isPending}>
            {t('إلغاء', 'Cancel')}
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={mutation.isPending || !paymentMethod || (!isEdit && apptsFetching)}
            className="gap-2 min-w-[140px]"
          >
            {isEdit ? <Pencil className="w-4 h-4" /> : <CalendarPlus className="w-4 h-4" />}
            {mutation.isPending
              ? (isEdit ? t('جاري الحفظ...', 'Saving...') : t('جاري الحجز...', 'Booking...'))
              : (isEdit ? t('حفظ التغييرات', 'Save Changes') : t('تأكيد الحجز', 'Confirm Booking'))}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate>

        {/* Error banner — full width */}
        {(mutation.isError || Object.keys(errors).length > 0) && (() => {
          const errObj = mutation.error as { response?: { data?: { error?: { code?: string; message?: string } } } };
          const code   = errObj?.response?.data?.error?.code;
          const apiMsg = errObj?.response?.data?.error?.message;

          let title: string;
          let description: React.ReactNode;

          if (mutation.isError && (code === 'DOUBLE_BOOKING' || (errObj as { response?: { status?: number } })?.response?.status === 409)) {
            title       = t('تعارض في الموعد', 'Time slot conflict');
            description = t('هذا الموعد محجوز بالفعل. اختر وقتاً آخر.', 'This time slot is already booked. Please pick another time.');
          } else if (mutation.isError) {
            title       = t('فشل الحجز', 'Booking failed');
            description = apiMsg ?? (mutation.error as Error)?.message ?? t('حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.', 'An unexpected error occurred. Please try again.');
          } else {
            title       = t('حقول مطلوبة مفقودة', 'Required fields missing');
            description = (
              <ul className="list-disc ms-5 mt-1 space-y-0.5">
                {Object.values(errors).map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            );
          }

          return (
            <div className="flex items-start gap-3 p-4 mb-5 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl">
              <AlertCircle className="w-5 h-5 shrink-0 text-red-500 mt-0.5" />
              <div className="text-sm text-red-700 dark:text-red-400 flex-1">
                <p className="font-semibold mb-1">{title}</p>
                <div className="text-red-600 dark:text-red-300/90 text-xs leading-relaxed">{description}</div>
              </div>
            </div>
          );
        })()}

        {/* Duplicate appointment warning — amber, non-blocking */}
        {duplicateAppt && (
          <div className="flex items-start gap-3 p-4 mb-5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl">
            <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500 mt-0.5" />
            <div className="text-sm text-amber-800 dark:text-amber-300 flex-1">
              <p className="font-semibold mb-1">{t('موعد مسبق موجود', 'Existing appointment detected')}</p>
              <p className="text-amber-700 dark:text-amber-400/90 text-xs leading-relaxed">
                {t(
                  `هذا المريض لديه بالفعل موعد مع نفس الطبيب في هذا اليوم (${duplicateAppt.startTime?.slice(0, 5) ?? ''} — الحالة: ${duplicateAppt.status}). يمكنك المتابعة إذا كان ذلك مقصوداً.`,
                  `This patient already has an appointment with this doctor today (${duplicateAppt.startTime?.slice(0, 5) ?? ''} — status: ${duplicateAppt.status}). You may still proceed if intentional.`,
                )}
              </p>
            </div>
          </div>
        )}

        {/* ── SINGLE COLUMN LAYOUT ── */}
        <div className="space-y-6">

          {/* Step 1 — Patient */}
          <StepSection step={1} title={t('المريض', 'Patient')} badge="bg-emerald-600">
            <PatientPicker lang={lang} t={t} value={patient} onChange={setPatient} disabled={isEdit} />
            {errors.patient && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.patient}</p>}
          </StepSection>

          {/* Step 2 — Doctor */}
          <StepSection step={2} title={t('الطبيب', 'Doctor')} badge="bg-blue-600">
            <DoctorPicker lang={lang} t={t} value={doctor} onChange={setDoctor} specialties={specialties} />
            {errors.doctor && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.doctor}</p>}
          </StepSection>

          {/* Step 3 — Schedule */}
          <StepSection step={3} title={t('الجدول', 'Schedule')} badge="bg-indigo-600">
            <div className="space-y-2">
              <div className="space-y-1">
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
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Clock className="absolute inset-y-0 start-3 my-auto w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                    <input type="time" className={cn(inputCls, 'ps-8')} value={time} step={60 * 5}
                      onChange={(e) => { timeManuallyEdited.current = true; setTime(e.target.value); }} />
                  </div>
                  <span className="text-gray-400 font-mono text-sm shrink-0 select-none">→</span>
                  <div className={cn(inputCls, 'flex-1 flex items-center font-mono text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-neutral-900 cursor-default select-none')}>
                    {addMinutes(time, duration)}
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <label className="field-label">{t('المدة', 'Duration')}</label>
                <select className={cn(inputCls, 'cursor-pointer')} value={duration}
                  onChange={(e) => { durationManuallyEdited.current = true; setDuration(Number(e.target.value)); }}>
                  {[10, 15, 20, 30, 45, 60, 90].map((m) => (
                    <option key={m} value={m}>{m} {t('د', 'min')}</option>
                  ))}
                </select>
              </div>
            </div>
          </StepSection>

          {/* Step 4 — Details (type + source + fees + payment + notes) */}
          <StepSection step={4} title={t('التفاصيل', 'Details')} badge="bg-primary-600">
            <div className="space-y-4">

              {/* Appointment type — full-width rows */}
              <div className="space-y-1.5">
                <label className="field-label">{t('نوع الموعد', 'Appointment Type')}</label>
                <div className="space-y-1.5">
                  {APPT_TYPES.map(({ value: v, labelAr, labelEn, Icon }) => {
                    const active = apptType === v;
                    return (
                      <button key={v} type="button" onClick={() => setApptType(v as typeof apptType)}
                        className={cn(
                          'w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-semibold transition-all text-start',
                          active
                            ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
                            : 'bg-white dark:bg-neutral-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-neutral-700 hover:border-primary-400 hover:text-primary-600 dark:hover:text-primary-400',
                        )}>
                        <Icon className="w-4 h-4 shrink-0" />
                        {lang === 'ar' ? labelAr : labelEn}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Patient source */}
              <div className="space-y-1.5">
                <label className="field-label">{t('مصدر المريض', 'Patient Source')}</label>
                <div className="flex flex-wrap gap-1.5">
                  {PATIENT_SOURCES.map((s) => {
                    const active = source === s.code;
                    return (
                      <button key={s.code} type="button"
                        onClick={() => setSource(s.code as Parameters<typeof setSource>[0])}
                        className={cn(
                          'px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all',
                          active
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                            : 'bg-white dark:bg-neutral-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-neutral-700 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400',
                        )}>
                        {lang === 'ar' ? s.labelAr : s.code}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Fees */}
              <div className="rounded-xl border border-gray-100 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-900 p-4 space-y-3">
                <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                  {t('الرسوم', 'Fees')}
                </p>

                <div className="space-y-1">
                  <label className={cn('field-label', errors.charge && 'text-red-500')}>
                    {t('التعرفة', 'Session Fee')}
                    <span className="text-red-500 ms-0.5">*</span>
                  </label>
                  <div className="relative flex">
                    <span className="inline-flex items-center px-3 rounded-s-xl border border-e-0 border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-bold text-gray-500 dark:text-gray-400 select-none">
                      EGP
                    </span>
                    <input
                      type="number" min="0" step="50"
                      className={cn('flex-1 h-10 rounded-e-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-600 transition-shadow [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none', errors.charge && 'border-red-400 focus:ring-red-400')}
                      placeholder="0" value={charge} onChange={(e) => setCharge(e.target.value)} dir="ltr"
                    />
                  </div>
                  {errors.charge && <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.charge}</p>}
                </div>

                <div className="space-y-2 pt-1 border-t border-gray-100 dark:border-neutral-800">
                  <p className="flex items-center gap-1.5 text-[10px] font-bold text-violet-500 dark:text-violet-400 uppercase tracking-widest pt-1">
                    <FlaskConical className="w-3 h-3" />
                    {t('خدمة إضافية', 'Extra Service')}
                  </p>
                  <div className="space-y-2">
                    <select
                      className={cn(inputCls, 'cursor-pointer border-violet-100 dark:border-violet-900/40 focus:ring-violet-500 text-xs')}
                      value={procedureId} onChange={(e) => setProcedureId(e.target.value)}
                    >
                      <option value="">{t('لا شيء', 'None')}</option>
                      {procedures.map((p) => (
                        <option key={p.id} value={p.id}>{lang === 'ar' ? (p.nameAr ?? p.nameEn) : p.nameEn}</option>
                      ))}
                    </select>
                    {procedureId && (
                      <div className="relative flex">
                        <span className="inline-flex items-center px-2.5 rounded-s-xl border border-e-0 border-violet-200 dark:border-violet-800 text-[10px] font-bold text-violet-500 select-none">
                          EGP
                        </span>
                        <input
                          type="number" min="0" step="10"
                          className="flex-1 h-10 rounded-e-xl border border-violet-200 dark:border-violet-800 bg-white dark:bg-neutral-800 px-3 text-sm font-semibold tabular-nums text-violet-700 dark:text-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-500 transition-shadow [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          placeholder="0" value={procCost} onChange={(e) => setProcCost(e.target.value)} dir="ltr"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Payment method */}
              <div className="rounded-xl border border-gray-100 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-900 p-4 space-y-2.5">
                <label className={cn('text-[10px] font-bold uppercase tracking-widest block', errors.paymentMethod ? 'text-red-500' : 'text-gray-500 dark:text-gray-400')}>
                  {t('طريقة الدفع', 'Payment Method')}
                  <span className="text-red-500 ms-0.5">*</span>
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {PAYMENT_METHODS.map(({ value: v, labelAr, labelEn, Icon }) => {
                    const active = paymentMethod === v;
                    return (
                      <button key={v} type="button" onClick={() => setPaymentMethod(v)}
                        className={cn(
                          'flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-semibold transition-all',
                          active
                            ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                            : errors.paymentMethod
                            ? 'bg-white dark:bg-neutral-800 text-red-400 border-red-300 dark:border-red-700 hover:border-teal-400'
                            : 'bg-white dark:bg-neutral-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-neutral-700 hover:border-teal-400 hover:text-teal-600 dark:hover:text-teal-400',
                        )}>
                        <Icon className="w-4 h-4" />
                        {lang === 'ar' ? labelAr : labelEn}
                      </button>
                    );
                  })}
                </div>
                {errors.paymentMethod && (
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />{errors.paymentMethod}
                  </p>
                )}
              </div>

              {/* Notes */}
              <div className="rounded-xl border border-gray-100 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-900 p-4 space-y-2">
                <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest block">
                  {t('ملاحظات', 'Notes')}
                </label>
                <textarea
                  rows={3}
                  className="w-full rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600 transition-shadow resize-none"
                  placeholder={t('ملاحظات اختيارية...', 'Optional notes...')}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              {/* Billing line items — edit mode only, requires a session fee */}
              {isEdit && (
                <div className="rounded-xl border border-teal-100 dark:border-teal-900/40 bg-teal-50/60 dark:bg-teal-950/20 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold text-teal-600 dark:text-teal-400 uppercase tracking-widest">
                      {t('خدمات إضافية (فوترة)', 'Billing Line Items')}
                    </p>
                    {!charge && (
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 italic">
                        {t('أضف التعرفة أولاً', 'Add session fee first')}
                      </span>
                    )}
                  </div>

                  {extraLinesLoading ? (
                    <p className="text-xs text-gray-400 text-center py-2">{t('جاري التحميل...', 'Loading...')}</p>
                  ) : (
                    <div className="space-y-2">
                      {extraLines.map((line, idx) => (
                        <div key={line.key} className="flex items-center gap-2">
                          <input
                            type="text"
                            className="flex-1 h-9 rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-shadow"
                            placeholder={t('اسم الخدمة', 'Service name')}
                            value={line.serviceName}
                            disabled={!charge}
                            onChange={(e) => {
                              const updated = [...extraLines];
                              updated[idx] = { ...updated[idx], serviceName: e.target.value };
                              setExtraLines(updated);
                            }}
                          />
                          <div className="relative flex shrink-0 w-28">
                            <span className="inline-flex items-center px-2 rounded-s-xl border border-e-0 border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-[10px] font-bold text-gray-500 select-none">
                              EGP
                            </span>
                            <input
                              type="number" min="0" step="10"
                              className="w-full h-9 rounded-e-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2 text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-shadow [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                              placeholder="0" value={line.cost} disabled={!charge}
                              onChange={(e) => {
                                const updated = [...extraLines];
                                updated[idx] = { ...updated[idx], cost: e.target.value };
                                setExtraLines(updated);
                              }}
                              dir="ltr"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => setExtraLines(extraLines.filter((_, i) => i !== idx))}
                            className="shrink-0 text-gray-300 hover:text-red-400 dark:text-gray-600 dark:hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}

                      {extraLines.length > 0 && (
                        <div className="flex justify-end pt-1">
                          <span className="text-xs font-semibold text-teal-700 dark:text-teal-300 tabular-nums">
                            {t('المجموع', 'Total')}: {extraLines.reduce((s, l) => s + (Number(l.cost) || 0), 0).toLocaleString()} EGP
                          </span>
                        </div>
                      )}

                      <button
                        type="button"
                        disabled={!charge}
                        onClick={() => setExtraLines([...extraLines, { key: makeKey(), serviceName: '', cost: '' }])}
                        className="flex items-center gap-1.5 text-xs font-medium text-teal-600 dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        {t('إضافة خدمة', 'Add service')}
                      </button>
                    </div>
                  )}
                </div>
              )}

            </div>
          </StepSection>

          {/* Step 5 — Attachment */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0">5</span>
              <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">{t('مرفقات', 'Attachment')}</span>
              <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">{t('اختياري', 'optional')}</span>
              <div className="flex-1 h-px bg-gray-100 dark:bg-neutral-700" />
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
              onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
            />
            {attachment ? (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
                <Paperclip className="w-4 h-4 text-amber-500 shrink-0" />
                <span className="text-xs font-medium text-amber-800 dark:text-amber-300 truncate flex-1">{attachment.name}</span>
                <button
                  type="button"
                  onClick={() => { setAttachment(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                  className="text-amber-400 hover:text-amber-600 dark:hover:text-amber-300 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-16 rounded-xl border-2 border-dashed border-gray-200 dark:border-neutral-700 hover:border-amber-400 dark:hover:border-amber-700 hover:bg-amber-50/50 dark:hover:bg-amber-950/20 transition-all flex flex-col items-center justify-center gap-1 group"
              >
                <Paperclip className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-amber-400 transition-colors" />
                <span className="text-xs text-gray-400 dark:text-gray-500 group-hover:text-amber-500 dark:group-hover:text-amber-400 transition-colors">{t('إرفاق تقرير طبي', 'Attach medical report')}</span>
                <span className="text-[10px] text-gray-300 dark:text-gray-600">PDF / JPG / PNG</span>
              </button>
            )}
          </div>

        </div>{/* end single column */}

      </form>
    </Modal>

    {/* ── Billing fee-change confirmation dialog ─────────────────────────── */}
    {showBillingWarn && editAppointment && createPortal(
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="relative w-full max-w-sm mx-4 rounded-2xl bg-white dark:bg-neutral-900 shadow-2xl p-6 flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {t('تعديل التعرفة سيؤثر على الفاتورة', 'Fee change will update billing')}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {t(
                  `التعرفة ستتغير من ${editAppointment.approvedCharge} إلى ${charge} — سيتم إعادة حساب حصة الطبيب والعيادة تلقائياً.`,
                  `Fee will change from ${editAppointment.approvedCharge} → ${charge} — doctor & clinic shares will be recalculated automatically.`,
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button
              className="w-full rounded-xl bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white text-sm font-semibold py-2.5 transition-colors"
              onClick={() => { setShowBillingWarn(false); mutation.mutate(); }}
            >
              {t('تأكيد التعديل', 'Confirm changes')}
            </button>

            <button
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-700 text-sm font-medium text-gray-700 dark:text-gray-300 py-2.5 transition-colors"
              onClick={() => {
                setShowBillingWarn(false);
                onClose();
                router.push(`/billing?highlightApptId=${editAppointment.id}`);
              }}
            >
              <ExternalLink className="h-4 w-4" />
              {t('عرض في الفواتير', 'View billing record')}
            </button>

            <button
              className="w-full rounded-xl text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 py-2 transition-colors"
              onClick={() => setShowBillingWarn(false)}
            >
              {t('إلغاء', 'Cancel')}
            </button>
          </div>
        </div>
      </div>,
      document.body,
    )}
    </>
  );
}
