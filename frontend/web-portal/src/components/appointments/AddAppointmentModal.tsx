'use client';

import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, Clock, Search, User, Stethoscope, AlertCircle, CalendarPlus, FlaskConical, X } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useLang } from '@/contexts/LanguageContext';
import { useDoctors, useSpecialties } from '@/hooks/useDoctors';
import { usePatients } from '@/hooks/usePatients';
import { useProcedures } from '@/hooks/useProcedures';
import { useDebounce } from '@/hooks/useDebounce';
import { appointmentApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Doctor, Patient, Specialty } from '@fadl/types';

const PATIENT_SOURCES = [
  { code: "Cl.'s",  labelAr: 'مريض العيادة',   labelEn: 'Clinic Direct' },
  { code: "Dr.'s",  labelAr: 'إحالة طبيب',      labelEn: 'Doctor Referral' },
  { code: 'VEZ',    labelAr: 'فيزيتا',           labelEn: 'Vizita' },
  { code: 'Ex-VEZ', labelAr: 'فيزيتا (سابق)',   labelEn: 'Ex-Vizita' },
  { code: 'EKF',    labelAr: 'اكشف',             labelEn: 'Ekshf' },
  { code: 'Ex-EKF', labelAr: 'اكشف (سابق)',     labelEn: 'Ex-Ekshf' },
  { code: 'DO',     labelAr: 'كلينيدو',          labelEn: 'CliniDo' },
  { code: 'Ex-DO',  labelAr: 'كلينيدو (سابق)',  labelEn: 'Ex-CliniDo' },
  { code: 'SHL',    labelAr: 'شامل',             labelEn: 'Shamel' },
];

const APPT_TYPES = [
  { value: 'in_person', labelAr: 'حضوري', labelEn: 'In Person' },
  { value: 'online',    labelAr: 'أونلاين', labelEn: 'Online' },
  { value: 'walk_in',   labelAr: 'بدون موعد', labelEn: 'Walk-in' },
];

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function makeKey() { return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }

// ── Patient picker ────────────────────────────────────────────────────────────
function PatientPicker({ lang, t, value, onChange }: {
  lang: 'ar' | 'en'; t: (a: string, b: string) => string;
  value: Patient | null; onChange: (p: Patient | null) => void;
}) {
  const [q, setQ]   = useState('');
  const [open, setOpen] = useState(false);
  const dq      = useDebounce(q, 280);
  const canSearch = dq.trim().length >= 2;

  const { data, isFetching } = usePatients(
    canSearch ? { query: dq, limit: 10, enabled: true } : { enabled: false },
  );
  const results: Patient[] = canSearch ? (data?.data ?? []) : [];

  const handleSelect = useCallback((p: Patient) => {
    onChange(p);
    setQ('');
    setOpen(false);
  }, [onChange]);

  if (value) {
    return (
      <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
            {(lang === 'ar' ? (value.nameAr ?? value.nameEn) : value.nameEn).charAt(0)}
          </div>
          <div>
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
              {lang === 'ar' ? (value.nameAr ?? value.nameEn) : value.nameEn}
            </p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-mono" dir="ltr">{value.mobile}</p>
          </div>
        </div>
        <button onClick={() => onChange(null)} className="text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-300 text-xs underline">
          {t('تغيير', 'Change')}
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute inset-y-0 start-3 my-auto w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          className="w-full h-10 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 ps-9 pe-3 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600 transition-shadow"
          placeholder={t('اكتب اسم المريض أو رقم الهاتف (٢ أحرف على الأقل)...', 'Type name or phone (min 2 chars)...')}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
        {isFetching && (
          <div className="absolute inset-y-0 end-3 my-auto w-3.5 h-3.5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
        )}
        {q && (
          <button
            type="button"
            onClick={() => { setQ(''); setOpen(false); }}
            className="absolute inset-y-0 end-8 my-auto text-gray-300 hover:text-gray-500"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full start-0 end-0 z-20 mt-1 bg-white dark:bg-neutral-800 border border-gray-100 dark:border-neutral-700 rounded-xl shadow-xl overflow-hidden">
          {results.map((p) => (
            <button
              key={p.patientId}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(p); }}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-neutral-700 transition-colors text-start border-b border-gray-50 dark:border-neutral-700/50 last:border-0"
            >
              <div className="w-7 h-7 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-primary-700 dark:text-primary-400 text-xs font-bold shrink-0">
                {(lang === 'ar' ? (p.nameAr ?? p.nameEn) : p.nameEn).charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {lang === 'ar' ? (p.nameAr ?? p.nameEn) : p.nameEn}
                </p>
                <p className="text-xs text-gray-400 font-mono" dir="ltr">{p.mobile}</p>
              </div>
            </button>
          ))}
        </div>
      )}
      {open && canSearch && !isFetching && results.length === 0 && (
        <div className="absolute top-full start-0 end-0 z-20 mt-1 bg-white dark:bg-neutral-800 border border-gray-100 dark:border-neutral-700 rounded-xl shadow-xl px-4 py-3 text-sm text-gray-400">
          {t('لم يُعثر على مريض', 'No patient found')}
        </div>
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
  const [q, setQ]         = useState('');
  const [specId, setSpecId] = useState('');
  const { data } = useDoctors({ isActive: true, limit: 200 });
  const all: Doctor[] = data?.data ?? [];

  const filtered = all.filter((d) => {
    const name = (lang === 'ar' ? (d.nameAr ?? d.nameEn) : d.nameEn).toLowerCase();
    const matchQ    = !q || name.includes(q.toLowerCase());
    const matchSpec = !specId || String(d.specialtyId) === specId;
    return matchQ && matchSpec;
  }).slice(0, 12);

  const specMap = new Map(specialties.map((s) => [s.id, s]));

  if (value) {
    const spec = specMap.get(value.specialtyId);
    return (
      <div className="flex items-center justify-between p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
            {(lang === 'ar' ? (value.nameAr ?? value.nameEn) : value.nameEn).charAt(0)}
          </div>
          <div>
            <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">
              {lang === 'ar' ? (value.nameAr ?? value.nameEn) : value.nameEn}
            </p>
            <p className="text-xs text-blue-600 dark:text-blue-400">
              {spec ? (lang === 'ar' ? spec.nameAr : spec.nameEn) : ''}
            </p>
          </div>
        </div>
        <button onClick={() => onChange(null)} className="text-blue-500 hover:text-blue-700 text-xs underline">
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
            className="w-full h-10 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 ps-9 pe-3 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600"
            placeholder={t('بحث باسم الطبيب...', 'Search doctor name...')}
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
          className="h-10 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2 text-xs text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-600 max-w-[140px]"
          value={specId}
          onChange={(e) => setSpecId(e.target.value)}
        >
          <option value="">{t('كل التخصصات', 'All Specialties')}</option>
          {specialties.sort((a, b) => a.nameEn.localeCompare(b.nameEn)).map((s) => (
            <option key={s.id} value={String(s.id)}>
              {lang === 'ar' ? s.nameAr : s.nameEn}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto pr-0.5">
        {filtered.map((d) => {
          const spec = specMap.get(d.specialtyId);
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => onChange(d)}
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-gray-100 dark:border-neutral-700 hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all text-start"
            >
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                {(lang === 'ar' ? (d.nameAr ?? d.nameEn) : d.nameEn).charAt(0)}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">
                  {lang === 'ar' ? (d.nameAr ?? d.nameEn) : d.nameEn}
                </p>
                <p className="text-[10px] text-gray-400 truncate">
                  {spec ? (lang === 'ar' ? spec.nameAr : spec.nameEn) : ''}
                </p>
              </div>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-2 py-4 text-center text-xs text-gray-400">
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

  // When a procedure is selected, pre-fill cost if procedure has a price
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

  const inputClass = 'w-full h-10 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600 transition-shadow';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('موعد جديد', 'New Appointment')}
      subtitle={t('احجز موعداً لمريض مع الطبيب', 'Book a patient appointment')}
      maxWidth="3xl"
      stretch
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={mutation.isPending}>
            {t('إلغاء', 'Cancel')}
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={mutation.isPending} className="gap-2 min-w-[130px]">
            <CalendarPlus className="w-4 h-4" />
            {mutation.isPending ? t('جاري الحجز...', 'Booking...') : t('تأكيد الحجز', 'Confirm Booking')}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {mutation.isError && (
          <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg text-red-700 dark:text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {t('حدث خطأ، يرجى التحقق من البيانات.', 'An error occurred. Please check and try again.')}
          </div>
        )}

        {/* Two-column layout on large screens */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Left: Patient + Doctor */}
          <div className="space-y-5">
            {/* Patient */}
            <div>
              <p className="form-section-title"><User className="w-3.5 h-3.5" />{t('المريض', 'Patient')}</p>
              <PatientPicker lang={lang} t={t} value={patient} onChange={setPatient} />
              {errors.patient && <p className="text-xs text-red-500 mt-1">{errors.patient}</p>}
            </div>

            {/* Doctor */}
            <div>
              <p className="form-section-title"><Stethoscope className="w-3.5 h-3.5" />{t('الطبيب', 'Doctor')}</p>
              <DoctorPicker lang={lang} t={t} value={doctor} onChange={setDoctor} specialties={specialties} />
              {errors.doctor && <p className="text-xs text-red-500 mt-1">{errors.doctor}</p>}
            </div>
          </div>

          {/* Right: Date/Time + Details */}
          <div className="space-y-5">
            {/* Date & Time */}
            <div>
              <p className="form-section-title"><Calendar className="w-3.5 h-3.5" />{t('الوقت', 'Date & Time')}</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1">
                  <label className="field-label">{t('التاريخ', 'Date')}</label>
                  <input type="date" className={cn(inputClass, errors.date && 'border-red-400')} value={date} onChange={(e) => setDate(e.target.value)} />
                  {errors.date && <p className="text-xs text-red-500 mt-1">{errors.date}</p>}
                </div>
                <div>
                  <label className="field-label">{t('الوقت', 'Time')}</label>
                  <div className="relative">
                    <Clock className="absolute inset-y-0 start-3 my-auto w-4 h-4 text-gray-400 pointer-events-none" />
                    <input type="time" className={cn(inputClass, 'ps-9')} value={time} step={60 * 20} onChange={(e) => setTime(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="field-label">{t('المدة (د)', 'Duration')}</label>
                  <select className={cn(inputClass, 'cursor-pointer')} value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                    {[10, 15, 20, 30, 45, 60, 90].map((m) => (
                      <option key={m} value={m}>{m} {t('د', 'min')}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Type & Source */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="field-label">{t('نوع الموعد', 'Appt. Type')}</label>
                <select className={cn(inputClass, 'cursor-pointer')} value={apptType} onChange={(e) => setApptType(e.target.value as typeof apptType)}>
                  {APPT_TYPES.map((a) => (
                    <option key={a.value} value={a.value}>{lang === 'ar' ? a.labelAr : a.labelEn}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">{t('مصدر المريض', 'Source')}</label>
                <select className={cn(inputClass, 'cursor-pointer')} value={source} onChange={(e) => setSource(e.target.value)}>
                  {PATIENT_SOURCES.map((s) => (
                    <option key={s.code} value={s.code}>
                      {lang === 'ar' ? `${s.labelAr} (${s.code})` : `${s.labelEn} (${s.code})`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Charge + Notes */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="field-label">{t('التعرفة (جنيه)', 'Session Fee (EGP)')}</label>
                <div className="relative">
                  <span className="absolute inset-y-0 start-3 flex items-center text-gray-400 text-xs font-mono pointer-events-none">EGP</span>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    className={cn(inputClass, 'ps-12')}
                    placeholder="0"
                    value={charge}
                    onChange={(e) => setCharge(e.target.value)}
                    dir="ltr"
                  />
                </div>
              </div>
              <div>
                <label className="field-label">{t('ملاحظات', 'Notes')}</label>
                <input className={inputClass} placeholder={t('اختياري...', 'Optional...')} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>

            {/* Extra service (optional) */}
            <div>
              <p className="form-section-title text-violet-600 dark:text-violet-400">
                <FlaskConical className="w-3.5 h-3.5" />
                {t('خدمة إضافية (اختياري)', 'Extra Service (optional)')}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="field-label">{t('الإجراء / الخدمة', 'Procedure / Service')}</label>
                  <select
                    className={cn(inputClass, 'cursor-pointer')}
                    value={procedureId}
                    onChange={(e) => setProcedureId(e.target.value)}
                  >
                    <option value="">{t('— لا شيء —', '— None —')}</option>
                    {procedures.map((p) => (
                      <option key={p.id} value={p.id}>
                        {lang === 'ar' ? (p.nameAr ?? p.nameEn) : p.nameEn}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label">{t('تكلفة الخدمة (EGP)', 'Service Cost (EGP)')}</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 start-3 flex items-center text-violet-400 text-xs font-mono pointer-events-none">EGP</span>
                    <input
                      type="number"
                      min="0"
                      step="10"
                      className={cn(inputClass, 'ps-12', !procedureId && 'opacity-50 cursor-not-allowed')}
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
          </div>
        </div>

        {/* Summary */}
        {patient && doctor && (
          <div className="p-3 rounded-xl bg-gray-50 dark:bg-neutral-800/60 border border-gray-100 dark:border-neutral-700 text-xs text-gray-600 dark:text-gray-300">
            <span className="font-semibold text-gray-900 dark:text-gray-100">
              {lang === 'ar' ? (patient.nameAr ?? patient.nameEn) : patient.nameEn}
            </span>
            {' → '}
            <span className="font-semibold text-gray-900 dark:text-gray-100">
              {lang === 'ar' ? (doctor.nameAr ?? doctor.nameEn) : doctor.nameEn}
            </span>
            {' — '}
            {date} {t('الساعة', 'at')} {time}
            {charge && <span className="ms-2 font-mono text-primary-700 dark:text-primary-400">{Number(charge).toLocaleString()} EGP</span>}
            {procedureId && procCost && (
              <span className="ms-2 font-mono text-violet-600 dark:text-violet-400">
                + {Number(procCost).toLocaleString()} EGP {t('خدمة', 'svc')}
              </span>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}
