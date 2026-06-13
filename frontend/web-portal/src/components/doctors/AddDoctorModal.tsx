'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stethoscope, Phone, BadgeDollarSign, CreditCard, AlertCircle, TrendingUp, Clock, Loader2, Plus, X, Layers } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useLang } from '@/contexts/LanguageContext';
import { useSpecialties } from '@/hooks/useDoctors';
import { doctorApi } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { useTranslateName } from '@/hooks/useTranslateName';
import type { Specialty } from '@fadl/types';

const DAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

interface ConsultHourRow {
  enabled: boolean;
  startTime: string;
  endTime: string;
  slotDurationMins: number;
  maxPatients: number;
}

// Split presets matching Excel patterns from data.md
const SPLIT_PRESETS = [
  { label: '50/50', dr: 50, cl: 50 },
  { label: '70/30', dr: 70, cl: 30 },
  { label: '37.5/62.5', dr: 37.5, cl: 62.5 },
  { label: '80/20', dr: 80, cl: 20 },
  { label: '30/70', dr: 30, cl: 70 },
];

const PAYMENT_METHODS = [
  { value: 'instapay',      labelAr: 'انستاباي',      labelEn: 'InstaPay' },
  { value: 'cash',          labelAr: 'كاش',            labelEn: 'Cash' },
  { value: 'mobile_wallet', labelAr: 'محفظة موبايل',  labelEn: 'Mobile Wallet' },
  { value: 'bank_transfer', labelAr: 'تحويل بنكي',    labelEn: 'Bank Transfer' },
  { value: 'vfc_wallet',    labelAr: 'محفظة VFC',     labelEn: 'VFC Wallet' },
];

interface SplitValues { doctor: number; clinic: number; }

interface SpecialtySplits {
  consultation: SplitValues;
  operative: SplitValues;
  online: SplitValues;
}

interface SpecialtyEntry {
  specialtyId: string;        // catalogue id, '' until chosen
  subSpecialtyIds: number[];  // catalogue ids
  splits: SpecialtySplits;
}

interface FormData {
  nameAr: string;
  nameEn: string;
  mobile: string;
  isOnlineDoctor: boolean;
  paymentMethod: string;
  paymentChannel: string;
  allowOverbooking: boolean;
}

const defaultSplits = (): SpecialtySplits => ({
  consultation: { doctor: 50, clinic: 50 },
  operative:    { doctor: 80, clinic: 20 },
  online:       { doctor: 70, clinic: 30 },
});

const newEntry = (): SpecialtyEntry => ({ specialtyId: '', subSpecialtyIds: [], splits: defaultSplits() });

function mobileToE164(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('20') && digits.length === 12) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 11) return `+20${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith('1')) return `+20${digits}`;
  return `+${digits}`;
}

const specLabel = (s: Specialty, lang: 'ar' | 'en') =>
  lang === 'ar' ? `${s.nameAr} (${s.code})` : `${s.nameEn} (${s.code})`;

/** Grouped <option> list, optionally excluding a set of ids. */
function GroupedOptions({ specialties, lang, exclude }: { specialties: Specialty[]; lang: 'ar' | 'en'; exclude?: Set<number> }) {
  const grouped = specialties
    .filter((s) => !exclude?.has(s.id))
    .reduce<Record<string, Specialty[]>>((acc, s) => {
      const cat = s.category ?? 'other';
      (acc[cat] ??= []).push(s);
      return acc;
    }, {});
  return (
    <>
      {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([cat, specs]) => (
        <optgroup key={cat} label={cat.charAt(0).toUpperCase() + cat.slice(1)}>
          {specs.sort((a, b) => (a.nameEn > b.nameEn ? 1 : -1)).map((s) => (
            <option key={s.id} value={s.id}>{specLabel(s, lang)}</option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

function SplitRow({
  label, value, onChange, lang,
}: {
  label: string;
  value: SplitValues;
  onChange: (v: SplitValues) => void;
  lang: 'ar' | 'en';
}) {
  return (
    <div className="p-2.5 rounded-xl bg-white dark:bg-neutral-800/60 border border-gray-100 dark:border-neutral-700">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{label}</span>
        <div className="flex gap-1">
          {SPLIT_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => onChange({ doctor: p.dr, clinic: p.cl })}
              className={cn(
                'px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all',
                value.doctor === p.dr
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-50 dark:bg-neutral-700 text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-neutral-600 border border-gray-200 dark:border-neutral-600',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="h-2 bg-gray-200 dark:bg-neutral-700 rounded-full overflow-hidden">
            <div
              className="h-full w-full bg-primary-600 origin-left transition-transform duration-300"
              style={{ transform: `scaleX(${value.doctor / 100})` }}
            />
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-primary-700 dark:text-primary-400 font-bold font-mono w-12 text-end">
            {lang === 'ar' ? 'د.' : 'Dr'} {value.doctor}%
          </span>
          <span className="text-gray-400">·</span>
          <span className="text-gray-500 dark:text-gray-400 font-mono w-16">
            {lang === 'ar' ? 'ع.' : 'Cl'} {value.clinic}%
          </span>
        </div>
      </div>
    </div>
  );
}

/** Specialty card: specialty select + catalogue sub-specialties + full splits. */
function SpecialtyCard({
  entry, index, specialties, lang, t, onChange, onRemove, error,
}: {
  entry: SpecialtyEntry;
  index: number;
  specialties: Specialty[];
  lang: 'ar' | 'en';
  t: (ar: string, en: string) => string;
  onChange: (e: SpecialtyEntry) => void;
  onRemove?: () => void;
  error?: string;
}) {
  const isPrimary = index === 0;
  const specMap = new Map(specialties.map((s) => [s.id, s]));
  const selfId = entry.specialtyId ? Number(entry.specialtyId) : undefined;
  const inputClass = 'w-full h-10 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-600 transition-shadow';

  const subExclude = new Set<number>(entry.subSpecialtyIds);
  if (selfId) subExclude.add(selfId);

  function addSub(id: number) {
    if (!id || entry.subSpecialtyIds.includes(id)) return;
    onChange({ ...entry, subSpecialtyIds: [...entry.subSpecialtyIds, id] });
  }
  function removeSub(id: number) {
    onChange({ ...entry, subSpecialtyIds: entry.subSpecialtyIds.filter((x) => x !== id) });
  }
  function setSplit(key: keyof SpecialtySplits, v: SplitValues) {
    onChange({ ...entry, splits: { ...entry.splits, [key]: v } });
  }

  return (
    <div className={cn(
      'rounded-2xl border p-3 space-y-3',
      isPrimary
        ? 'border-primary-200 dark:border-primary-900/50 bg-primary-50/40 dark:bg-primary-950/20'
        : 'border-gray-200 dark:border-neutral-700 bg-gray-50/60 dark:bg-neutral-900/30 ms-4 relative',
    )}>
      {!isPrimary && (
        <span className="absolute -start-4 top-6 h-px w-4 bg-gray-300 dark:bg-neutral-600" aria-hidden />
      )}
      <div className="flex items-center justify-between">
        <span className={cn('text-xs font-bold uppercase tracking-wide flex items-center gap-1.5',
          isPrimary ? 'text-primary-700 dark:text-primary-300' : 'text-gray-500 dark:text-gray-400')}>
          <Layers className="w-3.5 h-3.5" />
          {isPrimary ? t('التخصص الأساسي', 'Primary Specialty') : t(`تخصص إضافي ${index}`, `Additional Specialty ${index}`)}
        </span>
        {onRemove && (
          <button type="button" onClick={onRemove}
            className="p-1 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            title={t('إزالة', 'Remove')}>
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Specialty + sub-specialties */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label">{t('التخصص', 'Specialty')}{isPrimary ? ' *' : ''}</label>
          <select
            className={cn(inputClass, 'cursor-pointer', error && 'border-red-400')}
            value={entry.specialtyId}
            onChange={(e) => onChange({ ...entry, specialtyId: e.target.value })}
          >
            <option value="">{t('اختر التخصص', 'Select a specialty')}</option>
            <GroupedOptions specialties={specialties} lang={lang} />
          </select>
        </div>
        <div>
          <label className="field-label">{t('التخصصات الفرعية', 'Sub-Specialties')}</label>
          <select
            className={cn(inputClass, 'cursor-pointer')}
            value=""
            onChange={(e) => { addSub(Number(e.target.value)); e.currentTarget.selectedIndex = 0; }}
          >
            <option value="">{t('أضف تخصص فرعي…', 'Add a sub-specialty…')}</option>
            <GroupedOptions specialties={specialties} lang={lang} exclude={subExclude} />
          </select>
        </div>
      </div>

      {/* Sub-specialty chips */}
      {entry.subSpecialtyIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {entry.subSpecialtyIds.map((id) => {
            const s = specMap.get(id);
            return (
              <span key={id} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-600 text-xs text-gray-700 dark:text-gray-200">
                {s ? (lang === 'ar' ? s.nameAr : s.nameEn) : `#${id}`}
                <button type="button" onClick={() => removeSub(id)} className="text-gray-400 hover:text-red-600">
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Per-specialty full splits */}
      <div className="space-y-2 pt-1">
        <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1">
          <TrendingUp className="w-3 h-3" />
          {t('نسب الأرباح', 'Revenue Splits')}
        </p>
        <SplitRow label={t('كشف (consultation)', 'Consultation')} value={entry.splits.consultation} onChange={(v) => setSplit('consultation', v)} lang={lang} />
        <SplitRow label={t('إجراء عملي (operative)', 'Operative')} value={entry.splits.operative} onChange={(v) => setSplit('operative', v)} lang={lang} />
        <SplitRow label={t('أونلاين (online)', 'Online')} value={entry.splits.online} onChange={(v) => setSplit('online', v)} lang={lang} />
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

const DEFAULT_CONSULT_HOURS: ConsultHourRow[] = Array.from({ length: 7 }, () => ({
  enabled: false,
  startTime: '09:00',
  endTime: '17:00',
  slotDurationMins: 15,
  maxPatients: 20,
}));

interface AddDoctorModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (id: string) => void;
}

export function AddDoctorModal({ open, onClose, onCreated }: AddDoctorModalProps) {
  const { lang, t } = useLang();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: specialties = [] } = useSpecialties();
  const { translate, translating } = useTranslateName();

  const [form, setForm] = useState<FormData>({
    nameAr: '', nameEn: '', mobile: '',
    isOnlineDoctor: false,
    paymentMethod: 'instapay', paymentChannel: '',
    allowOverbooking: false,
  });
  const [entries, setEntries] = useState<SpecialtyEntry[]>([newEntry()]);
  const [consultHours, setConsultHours] = useState<ConsultHourRow[]>(DEFAULT_CONSULT_HOURS);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});

  function resetAll() {
    setForm({ nameAr: '', nameEn: '', mobile: '', isOnlineDoctor: false, paymentMethod: 'instapay', paymentChannel: '', allowOverbooking: false });
    setEntries([newEntry()]);
    setConsultHours(DEFAULT_CONSULT_HOURS);
    setErrors({});
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const toPct = (v: SplitValues) => ({ doctorPercentage: v.doctor, clinicPercentage: v.clinic });
      const primary = entries[0];
      const additional = entries.slice(1);

      const bySpecialty = Object.fromEntries(
        additional.map((e) => [String(Number(e.specialtyId)), {
          consultation: toPct(e.splits.consultation),
          operative:    toPct(e.splits.operative),
          online:       toPct(e.splits.online),
        }]),
      );
      const subSpecialtyIds = Object.fromEntries(
        entries
          .filter((e) => e.specialtyId && e.subSpecialtyIds.length > 0)
          .map((e) => [String(Number(e.specialtyId)), e.subSpecialtyIds]),
      );

      const body = {
        mobile:      mobileToE164(form.mobile),
        nameEn:      form.nameEn || form.nameAr,
        nameAr:      form.nameAr || undefined,
        specialtyId: Number(primary.specialtyId),
        secondarySpecialtyIds: additional.map((e) => Number(e.specialtyId)),
        subSpecialtyIds: Object.keys(subSpecialtyIds).length ? subSpecialtyIds : undefined,
        isOnlineDoctor: form.isOnlineDoctor,
        revenueSplits: {
          consultation: toPct(primary.splits.consultation),
          operative:    toPct(primary.splits.operative),
          online:       toPct(primary.splits.online),
          ...(Object.keys(bySpecialty).length ? { bySpecialty } : {}),
        },
        paymentMethod:   form.paymentMethod || undefined,
        allowOverbooking: form.allowOverbooking,
        overbookingBufferPercentage: 10,
      };
      const { data } = await doctorApi.post<{ data: { id: string } }>('/doctors', body);
      const created = data.data;

      const hours = consultHours.map((h, i) => ({ ...h, dayOfWeek: i })).filter((h) => h.enabled);
      if (hours.length > 0) {
        await doctorApi.put(`/doctors/${created.id}/consultation-hours/bulk`, { hours });
      }
      return created;
    },
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['doctors'] });
      toast(t('تم إضافة الطبيب بنجاح', 'Doctor added successfully'), 'success');
      onCreated?.(created.id);
      onClose();
      resetAll();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string; error?: string } } })?.response?.data?.message
        ?? (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? t('حدث خطأ. يرجى المحاولة مرة أخرى.', 'An error occurred. Please try again.');
      toast(msg, 'error');
    },
  });

  function set<K extends keyof FormData>(key: K, val: FormData[K]) {
    setForm((p) => ({ ...p, [key]: val }));
    if (errors[key]) setErrors((p) => ({ ...p, [key]: undefined }));
  }

  function updateEntry(i: number, e: SpecialtyEntry) {
    setEntries((prev) => prev.map((x, idx) => (idx === i ? e : x)));
    setErrors((p) => ({ ...p, [`spec_${i}`]: undefined, specialties: undefined }));
  }
  function addSpecialty() {
    setEntries((prev) => [...prev, newEntry()]);
  }
  function removeSpecialty(i: number) {
    setEntries((prev) => prev.filter((_, idx) => idx !== i));
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.nameAr.trim() && !form.nameEn.trim()) e.nameAr = t('الاسم مطلوب', 'Name required');
    if (!form.mobile.trim()) { e.mobile = t('الموبايل مطلوب', 'Mobile required'); }
    else if (form.mobile.replace(/\D/g, '').length < 10) e.mobile = t('رقم غير صحيح', 'Invalid number');

    if (!entries[0].specialtyId) e.spec_0 = t('التخصص الأساسي مطلوب', 'Primary specialty required');

    const ids = entries.map((x) => x.specialtyId).filter(Boolean);
    if (new Set(ids).size !== ids.length) e.specialties = t('لا يمكن تكرار نفس التخصص', 'A specialty cannot be repeated');

    entries.forEach((entry, i) => {
      if (!entry.specialtyId && i > 0) { e[`spec_${i}`] = t('اختر التخصص أو احذف الصف', 'Choose a specialty or remove the row'); return; }
      const bad = (['consultation', 'operative', 'online'] as const)
        .some((k) => entry.splits[k].doctor + entry.splits[k].clinic !== 100);
      if (bad) e[`spec_${i}`] = t('مجموع كل نسبة يجب أن يساوي 100%', 'Each split must sum to 100%');
    });

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    mutation.mutate();
  }

  const inputClass = 'w-full h-10 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent transition-shadow';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('إضافة طبيب جديد', 'Add New Doctor')}
      subtitle={t('أدخل بيانات الطبيب وشروط التعاقد', 'Enter doctor profile and contract terms')}
      maxWidth="2xl"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={mutation.isPending}>
            {t('إلغاء', 'Cancel')}
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={mutation.isPending} className="gap-2 min-w-[130px]">
            <Stethoscope className="w-4 h-4" />
            {mutation.isPending ? t('جاري الحفظ...', 'Saving...') : t('حفظ الطبيب', 'Save Doctor')}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-1 stagger" noValidate>
        {mutation.isError && (
          <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg text-red-700 dark:text-red-400 text-sm mb-4">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {t('حدث خطأ. يرجى المحاولة مرة أخرى.', 'An error occurred. Please try again.')}
          </div>
        )}

        {/* ── Identity ── */}
        <p className="form-section-title">
          <Stethoscope className="w-3.5 h-3.5" />
          {t('بيانات الطبيب', 'Doctor Profile')}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">{t('الاسم بالعربي *', 'Name (Arabic) *')}</label>
            <div className="relative">
              <input
                className={cn(inputClass, errors.nameAr && 'border-red-400', translating === 'ar' && 'pe-8')}
                placeholder="د. اسم الطبيب"
                value={form.nameAr}
                onChange={(e) => set('nameAr', e.target.value)}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (lang === 'ar' && v && !form.nameEn.trim()) {
                    translate(v, 'ar').then((r) => { if (r) set('nameEn', r); });
                  }
                }}
                dir="rtl"
              />
              {translating === 'ar' && <Loader2 className="absolute inset-y-0 end-2.5 my-auto w-4 h-4 text-primary-500 animate-spin pointer-events-none" />}
            </div>
            {errors.nameAr && <p className="text-xs text-red-500 mt-1">{errors.nameAr}</p>}
          </div>
          <div>
            <label className="field-label">{t('الاسم بالإنجليزي', 'Name (English)')}</label>
            <div className="relative">
              <input
                className={cn(inputClass, translating === 'en' && 'pe-8')}
                placeholder="Dr. Name"
                value={form.nameEn}
                onChange={(e) => set('nameEn', e.target.value)}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (lang === 'en' && v && !form.nameAr.trim()) {
                    translate(v, 'en').then((r) => { if (r) set('nameAr', r); });
                  }
                }}
                dir="ltr"
              />
              {translating === 'en' && <Loader2 className="absolute inset-y-0 end-2.5 my-auto w-4 h-4 text-primary-500 animate-spin pointer-events-none" />}
            </div>
          </div>
        </div>

        {/* ── Contact ── */}
        <p className="form-section-title">
          <Phone className="w-3.5 h-3.5" />
          {t('التواصل', 'Contact')}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">{t('رقم الموبايل *', 'Mobile *')}</label>
            <div className="relative">
              <span className="absolute inset-y-0 start-3 flex items-center text-gray-400 text-xs font-mono pointer-events-none">+20</span>
              <input
                className={cn(inputClass, 'ps-10', errors.mobile && 'border-red-400')}
                placeholder="1XXXXXXXXX"
                value={form.mobile}
                onChange={(e) => set('mobile', e.target.value)}
                inputMode="tel"
                dir="ltr"
              />
            </div>
            {errors.mobile && <p className="text-xs text-red-500 mt-1">{errors.mobile}</p>}
          </div>
          <div className="flex items-end gap-3 pb-1">
            <label className={cn('flex items-center gap-2.5 cursor-pointer select-none px-4 py-2.5 rounded-xl border transition-all', form.isOnlineDoctor ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/30' : 'border-gray-200 dark:border-neutral-700')}>
              <input type="checkbox" className="w-4 h-4 rounded accent-blue-600" checked={form.isOnlineDoctor} onChange={(e) => set('isOnlineDoctor', e.target.checked)} />
              <span className="text-sm text-gray-700 dark:text-gray-300">{t('طبيب أونلاين', 'Online Doctor')}</span>
            </label>
            <label className={cn('flex items-center gap-2.5 cursor-pointer select-none px-4 py-2.5 rounded-xl border transition-all', form.allowOverbooking ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/30' : 'border-gray-200 dark:border-neutral-700')}>
              <input type="checkbox" className="w-4 h-4 rounded accent-amber-600" checked={form.allowOverbooking} onChange={(e) => set('allowOverbooking', e.target.checked)} />
              <span className="text-sm text-gray-700 dark:text-gray-300">{t('تجاوز الطاقة', 'Allow Overbooking')}</span>
            </label>
          </div>
        </div>

        {/* ── Specialties & per-specialty revenue splits ── */}
        <p className="form-section-title">
          <Layers className="w-3.5 h-3.5" />
          {t('التخصصات ونسب الأرباح', 'Specialties & Revenue Splits')}
        </p>
        {errors.specialties && <p className="text-xs text-red-500 -mt-1 mb-2">{errors.specialties}</p>}
        <div className="space-y-3">
          {entries.map((entry, i) => (
            <SpecialtyCard
              key={i}
              entry={entry}
              index={i}
              specialties={specialties}
              lang={lang}
              t={t}
              onChange={(e) => updateEntry(i, e)}
              onRemove={i > 0 ? () => removeSpecialty(i) : undefined}
              error={errors[`spec_${i}`]}
            />
          ))}
          <button
            type="button"
            onClick={addSpecialty}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-gray-300 dark:border-neutral-600 text-sm font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors w-full justify-center"
          >
            <Plus className="w-4 h-4" />
            {t('إضافة تخصص آخر', 'Add another specialty')}
          </button>
        </div>

        {/* ── Consultation Hours ── */}
        <p className="form-section-title">
          <Clock className="w-3.5 h-3.5" />
          {t('ساعات العمل', 'Consultation Hours')}
        </p>
        <div className="rounded-xl border border-gray-100 dark:border-neutral-700 overflow-hidden">
          {consultHours.map((row, i) => (
            <div
              key={i}
              className={cn(
                'flex items-center gap-2 px-3 py-2 text-sm',
                i % 2 === 0 ? 'bg-gray-50 dark:bg-neutral-800/40' : 'bg-white dark:bg-neutral-900/10',
              )}
            >
              <label className="flex items-center gap-2 w-28 shrink-0 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-3.5 h-3.5 accent-primary-600"
                  checked={row.enabled}
                  onChange={(e) => {
                    const next = [...consultHours];
                    next[i] = { ...next[i], enabled: e.target.checked };
                    setConsultHours(next);
                  }}
                />
                <span className={cn('font-medium', !row.enabled && 'text-gray-400 dark:text-gray-500')}>
                  {lang === 'ar' ? DAYS_AR[i] : DAYS_EN[i]}
                </span>
              </label>
              {row.enabled ? (
                <div className="flex items-center gap-2 flex-1 flex-wrap">
                  <input
                    type="time"
                    className="h-8 rounded border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 text-xs w-24"
                    value={row.startTime}
                    onChange={(e) => { const n = [...consultHours]; n[i] = { ...n[i], startTime: e.target.value }; setConsultHours(n); }}
                  />
                  <span className="text-gray-400 text-xs">–</span>
                  <input
                    type="time"
                    className="h-8 rounded border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 text-xs w-24"
                    value={row.endTime}
                    onChange={(e) => { const n = [...consultHours]; n[i] = { ...n[i], endTime: e.target.value }; setConsultHours(n); }}
                  />
                  <div className="flex items-center gap-1">
                    <label className="text-[10px] text-gray-500 shrink-0">{t('كل', 'Every')}</label>
                    <select
                      className="h-8 rounded border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-1 text-xs w-16"
                      value={row.slotDurationMins}
                      onChange={(e) => { const n = [...consultHours]; n[i] = { ...n[i], slotDurationMins: Number(e.target.value) }; setConsultHours(n); }}
                    >
                      {[10,15,20,30,45,60].map((m) => <option key={m} value={m}>{m}{t('د', 'm')}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-1">
                    <label className="text-[10px] text-gray-500 shrink-0">{t('أقصى', 'Max')}</label>
                    <input
                      type="number"
                      className="h-8 rounded border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 text-xs w-14"
                      min={1} max={200}
                      value={row.maxPatients}
                      onChange={(e) => { const n = [...consultHours]; n[i] = { ...n[i], maxPatients: Number(e.target.value) }; setConsultHours(n); }}
                    />
                    <span className="text-[10px] text-gray-400">{t('مريض', 'pts')}</span>
                  </div>
                </div>
              ) : (
                <span className="text-xs text-gray-400 dark:text-gray-500 italic">{t('غير متاح', 'Day off')}</span>
              )}
            </div>
          ))}
        </div>

        {/* ── Payment ── */}
        <p className="form-section-title">
          <CreditCard className="w-3.5 h-3.5" />
          <BadgeDollarSign className="w-3.5 h-3.5" />
          {t('طريقة استلام الأتعاب', 'Settlement Method')}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">{t('طريقة الدفع', 'Payment Method')}</label>
            <select className={cn(inputClass, 'cursor-pointer')} value={form.paymentMethod} onChange={(e) => set('paymentMethod', e.target.value)}>
              <option value="">{t('اختر', 'Select')}</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {lang === 'ar' ? m.labelAr : m.labelEn}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">
              {form.paymentMethod === 'instapay' ? t('حساب انستاباي', 'InstaPay Account') :
               form.paymentMethod === 'bank_transfer' ? t('رقم الحساب البنكي', 'Bank Account') :
               t('رقم المحفظة', 'Wallet Number')}
            </label>
            <input
              className={inputClass}
              placeholder={form.paymentMethod === 'instapay' ? '01XXXXXXXXX' : ''}
              value={form.paymentChannel}
              onChange={(e) => set('paymentChannel', e.target.value)}
              dir="ltr"
            />
          </div>
        </div>
      </form>
    </Modal>
  );
}
