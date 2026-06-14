'use client';

// ── Shared doctor-form building blocks ─────────────────────────────────────────
// Both AddDoctorModal (create) and EditDoctorModal (update) compose these so the
// two flows can never drift again: identical specialty cards, per-specialty
// revenue splits, free-text sub-specialties, and the consultation-hours editor.

import { useState } from 'react';
import { Layers, TrendingUp, X, Plus, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Doctor, Specialty, VisitTypeSplits, DoctorConsultationHours } from '@fadl/types';

export const DAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

// Split presets matching Excel patterns from data.md
export const SPLIT_PRESETS = [
  { label: '50/50', dr: 50, cl: 50 },
  { label: '70/30', dr: 70, cl: 30 },
  { label: '37.5/62.5', dr: 37.5, cl: 62.5 },
  { label: '80/20', dr: 80, cl: 20 },
  { label: '30/70', dr: 30, cl: 70 },
];

export const PAYMENT_METHODS = [
  { value: 'instapay',      labelAr: 'انستاباي',      labelEn: 'InstaPay' },
  { value: 'cash',          labelAr: 'كاش',            labelEn: 'Cash' },
  { value: 'mobile_wallet', labelAr: 'محفظة موبايل',  labelEn: 'Mobile Wallet' },
  { value: 'bank_transfer', labelAr: 'تحويل بنكي',    labelEn: 'Bank Transfer' },
  { value: 'vfc_wallet',    labelAr: 'محفظة VFC',     labelEn: 'VFC Wallet' },
];

export interface SplitValues { doctor: number; clinic: number; }

export interface SpecialtySplits {
  consultation: SplitValues;
  operative: SplitValues;
  online: SplitValues;
}

export interface SpecialtyEntry {
  specialtyId: string;          // catalogue id, '' until chosen
  subSpecialties: string[];     // free-text labels
  splits: SpecialtySplits;
}

export interface ConsultHourRow {
  enabled: boolean;
  startTime: string;
  endTime: string;
  slotDurationMins: number;
  maxPatients: number;
}

export interface IdentityForm {
  nameAr: string;
  nameEn: string;
  mobile: string;
  isOnlineDoctor: boolean;
  paymentMethod: string;
  paymentChannel: string;
  allowOverbooking: boolean;
}

export const inputClass =
  'w-full h-10 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent transition-shadow';

export const defaultSplits = (): SpecialtySplits => ({
  consultation: { doctor: 50, clinic: 50 },
  operative:    { doctor: 80, clinic: 20 },
  online:       { doctor: 70, clinic: 30 },
});

export const newEntry = (): SpecialtyEntry => ({ specialtyId: '', subSpecialties: [], splits: defaultSplits() });

export const emptyIdentity = (): IdentityForm => ({
  nameAr: '', nameEn: '', mobile: '',
  isOnlineDoctor: false, paymentMethod: 'instapay', paymentChannel: '', allowOverbooking: false,
});

export const DEFAULT_CONSULT_HOURS: ConsultHourRow[] = Array.from({ length: 7 }, () => ({
  enabled: false,
  startTime: '09:00',
  endTime: '17:00',
  slotDurationMins: 15,
  maxPatients: 20,
}));

export function mobileToE164(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('20') && digits.length === 12) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 11) return `+20${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith('1')) return `+20${digits}`;
  return `+${digits}`;
}

const specLabel = (s: Specialty, lang: 'ar' | 'en') =>
  lang === 'ar' ? `${s.nameAr} (${s.code})` : `${s.nameEn} (${s.code})`;

// ── Seed form state from an existing doctor ────────────────────────────────────

const toSplit = (vts: VisitTypeSplits): SpecialtySplits => ({
  consultation: { doctor: vts.consultation.doctorPercentage, clinic: vts.consultation.clinicPercentage },
  operative:    { doctor: vts.operative.doctorPercentage,    clinic: vts.operative.clinicPercentage },
  online:       { doctor: vts.online.doctorPercentage,       clinic: vts.online.clinicPercentage },
});

export function entriesFromDoctor(doctor: Doctor): SpecialtyEntry[] {
  const base = doctor.revenueSplits;
  const subFor = (sid: number): string[] => {
    const v = doctor.subSpecialtyIds?.[String(sid)];
    return Array.isArray(v) ? v.map(String).filter(Boolean) : [];
  };

  // Primary: prefer structured sub-specialties, fall back to the legacy single field.
  let primarySubs = subFor(doctor.specialtyId);
  if (primarySubs.length === 0 && doctor.subSpecialty) {
    primarySubs = doctor.subSpecialty.split(',').map((s) => s.trim()).filter(Boolean);
  }

  const primary: SpecialtyEntry = {
    specialtyId: String(doctor.specialtyId),
    subSpecialties: primarySubs,
    splits: toSplit(base),
  };
  const additional = (doctor.secondarySpecialtyIds ?? []).map((sid) => ({
    specialtyId: String(sid),
    subSpecialties: subFor(sid),
    splits: toSplit(doctor.revenueSplits.bySpecialty?.[String(sid)] ?? base),
  }));
  return [primary, ...additional];
}

export function identityFromDoctor(d: Doctor): IdentityForm {
  return {
    nameAr: d.nameAr ?? '',
    nameEn: d.nameEn ?? '',
    mobile: d.mobile.replace(/^\+20/, '0'),
    isOnlineDoctor: d.isOnlineDoctor,
    paymentMethod: d.paymentMethod ?? '',
    paymentChannel: '',
    allowOverbooking: d.allowOverbooking,
  };
}

export function consultRowsFromApi(hours: DoctorConsultationHours[]): ConsultHourRow[] {
  return DEFAULT_CONSULT_HOURS.map((def, day) => {
    const h = hours.find((x) => x.dayOfWeek === day && x.isActive);
    if (!h) return { ...def };
    return {
      enabled: true,
      startTime: h.startTime.slice(0, 5),
      endTime: h.endTime.slice(0, 5),
      slotDurationMins: h.slotDurationMins,
      maxPatients: h.maxPatients,
    };
  });
}

// ── Build the create/update request body ───────────────────────────────────────

export interface DoctorBody {
  mobile: string;
  nameEn: string;
  nameAr?: string;
  specialtyId: number;
  secondarySpecialtyIds: number[];
  subSpecialty?: string;
  subSpecialtyIds?: Record<string, string[]>;
  isOnlineDoctor: boolean;
  revenueSplits: Doctor['revenueSplits'];
  paymentMethod?: Doctor['paymentMethod'];
  allowOverbooking: boolean;
  overbookingBufferPercentage: number;
}

export function buildDoctorBody(
  identity: IdentityForm,
  entries: SpecialtyEntry[],
  overbookingBufferPercentage: number,
): DoctorBody {
  const toPct = (v: SplitValues) => ({ doctorPercentage: v.doctor, clinicPercentage: v.clinic });
  const primary = entries[0];
  const additional = entries.slice(1).filter((e) => e.specialtyId);

  const bySpecialty = Object.fromEntries(
    additional.map((e) => [String(Number(e.specialtyId)), {
      consultation: toPct(e.splits.consultation),
      operative:    toPct(e.splits.operative),
      online:       toPct(e.splits.online),
    }]),
  );
  const subSpecialtyIds = Object.fromEntries(
    entries
      .filter((e) => e.specialtyId && e.subSpecialties.length > 0)
      .map((e) => [String(Number(e.specialtyId)), e.subSpecialties]),
  );

  return {
    mobile:      mobileToE164(identity.mobile),
    nameEn:      identity.nameEn || identity.nameAr,
    nameAr:      identity.nameAr || undefined,
    specialtyId: Number(primary.specialtyId),
    secondarySpecialtyIds: additional.map((e) => Number(e.specialtyId)),
    // Keep the legacy single field mirrored to the primary specialty's labels.
    subSpecialty: primary.subSpecialties.join(', ') || undefined,
    subSpecialtyIds: Object.keys(subSpecialtyIds).length ? subSpecialtyIds : undefined,
    isOnlineDoctor: identity.isOnlineDoctor,
    revenueSplits: {
      consultation: toPct(primary.splits.consultation),
      operative:    toPct(primary.splits.operative),
      online:       toPct(primary.splits.online),
      ...(Object.keys(bySpecialty).length ? { bySpecialty } : {}),
    },
    paymentMethod:   (identity.paymentMethod || undefined) as Doctor['paymentMethod'],
    allowOverbooking: identity.allowOverbooking,
    overbookingBufferPercentage,
  };
}

export function validateDoctor(
  identity: IdentityForm,
  entries: SpecialtyEntry[],
  t: (ar: string, en: string) => string,
): Record<string, string> {
  const e: Record<string, string> = {};
  if (!identity.nameAr.trim() && !identity.nameEn.trim()) e.nameAr = t('الاسم مطلوب', 'Name required');
  if (!identity.mobile.trim()) e.mobile = t('الموبايل مطلوب', 'Mobile required');
  else if (identity.mobile.replace(/\D/g, '').length < 10) e.mobile = t('رقم غير صحيح', 'Invalid number');

  if (!entries[0].specialtyId) e.spec_0 = t('التخصص الأساسي مطلوب', 'Primary specialty required');

  const ids = entries.map((x) => x.specialtyId).filter(Boolean);
  if (new Set(ids).size !== ids.length) e.specialties = t('لا يمكن تكرار نفس التخصص', 'A specialty cannot be repeated');

  entries.forEach((entry, i) => {
    if (!entry.specialtyId && i > 0) { e[`spec_${i}`] = t('اختر التخصص أو احذف الصف', 'Choose a specialty or remove the row'); return; }
    const bad = (['consultation', 'operative', 'online'] as const)
      .some((k) => entry.splits[k].doctor + entry.splits[k].clinic !== 100);
    if (bad) e[`spec_${i}`] = t('مجموع كل نسبة يجب أن يساوي 100%', 'Each split must sum to 100%');
  });

  return e;
}

// ── Grouped specialty <option> list ────────────────────────────────────────────

export function GroupedOptions({ specialties, lang, exclude }: { specialties: Specialty[]; lang: 'ar' | 'en'; exclude?: Set<number> }) {
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

// ── Revenue-split row (draggable bar) ──────────────────────────────────────────

export function SplitRow({ label, value, onChange, lang }: {
  label: string; value: SplitValues;
  onChange: (v: SplitValues) => void; lang: 'ar' | 'en';
}) {
  return (
    <div className="p-2.5 rounded-xl bg-white dark:bg-neutral-800/60 border border-gray-100 dark:border-neutral-700">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{label}</span>
        <div className="flex gap-1">
          {SPLIT_PRESETS.map((p) => (
            <button key={p.label} type="button" onClick={() => onChange({ doctor: p.dr, clinic: p.cl })}
              className={cn('px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all',
                value.doctor === p.dr
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-50 dark:bg-neutral-700 text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-neutral-600 border border-gray-200 dark:border-neutral-600',
              )}>{p.label}</button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="relative h-2 group">
            <div className="absolute inset-0 bg-gray-200 dark:bg-neutral-700 rounded-full overflow-hidden">
              <div className="h-full w-full bg-primary-600 origin-left transition-transform duration-150" style={{ transform: `scaleX(${value.doctor / 100})` }} />
            </div>
            <input
              type="range" min={0} max={100} step={0.5} value={value.doctor}
              onChange={(e) => { const dr = Number(e.target.value); onChange({ doctor: dr, clinic: Math.round((100 - dr) * 2) / 2 }); }}
              aria-label={`${label} — doctor share`}
              className="absolute inset-x-0 -inset-y-1.5 w-full opacity-0 cursor-pointer"
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white border-2 border-primary-600 shadow pointer-events-none transition-all duration-150 group-hover:scale-110"
              style={{ insetInlineStart: `calc(${value.doctor}% - 7px)` }}
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

// ── Specialty card (specialty select + free-text sub-specialties + splits) ──────

export function SpecialtyCard({
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
  const [subDraft, setSubDraft] = useState('');

  function commitSub() {
    const v = subDraft.trim();
    if (!v) return;
    if (!entry.subSpecialties.some((x) => x.toLowerCase() === v.toLowerCase())) {
      onChange({ ...entry, subSpecialties: [...entry.subSpecialties, v] });
    }
    setSubDraft('');
  }
  function removeSub(label: string) {
    onChange({ ...entry, subSpecialties: entry.subSpecialties.filter((x) => x !== label) });
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

      {/* Specialty + free-text sub-specialties */}
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
          <input
            className={inputClass}
            value={subDraft}
            placeholder={t('اكتب ثم Enter للإضافة…', 'Type then Enter to add…')}
            onChange={(e) => setSubDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commitSub(); }
              else if (e.key === 'Backspace' && !subDraft && entry.subSpecialties.length) {
                removeSub(entry.subSpecialties[entry.subSpecialties.length - 1]);
              }
            }}
            onBlur={commitSub}
          />
        </div>
      </div>

      {/* Sub-specialty chips */}
      {entry.subSpecialties.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {entry.subSpecialties.map((label) => (
            <span key={label} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-600 text-xs text-gray-700 dark:text-gray-200">
              {label}
              <button type="button" onClick={() => removeSub(label)} className="text-gray-400 hover:text-red-600">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
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

// ── Specialties section (cards + "add another") ────────────────────────────────

export function SpecialtiesSection({
  entries, specialties, lang, t, errors, onChangeEntry, onAdd, onRemove,
}: {
  entries: SpecialtyEntry[];
  specialties: Specialty[];
  lang: 'ar' | 'en';
  t: (ar: string, en: string) => string;
  errors: Record<string, string | undefined>;
  onChangeEntry: (i: number, e: SpecialtyEntry) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
}) {
  return (
    <>
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
            onChange={(e) => onChangeEntry(i, e)}
            onRemove={i > 0 ? () => onRemove(i) : undefined}
            error={errors[`spec_${i}`]}
          />
        ))}
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-gray-300 dark:border-neutral-600 text-sm font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors w-full justify-center"
        >
          <Plus className="w-4 h-4" />
          {t('إضافة تخصص آخر', 'Add another specialty')}
        </button>
      </div>
    </>
  );
}

// ── Consultation-hours editor ──────────────────────────────────────────────────

export function ConsultationHoursEditor({
  rows, lang, t, onChange,
}: {
  rows: ConsultHourRow[];
  lang: 'ar' | 'en';
  t: (ar: string, en: string) => string;
  onChange: (rows: ConsultHourRow[]) => void;
}) {
  function patch(i: number, p: Partial<ConsultHourRow>) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  }
  return (
    <>
      <p className="form-section-title">
        <Clock className="w-3.5 h-3.5" />
        {t('ساعات العمل', 'Consultation Hours')}
      </p>
      <div className="rounded-xl border border-gray-100 dark:border-neutral-700 overflow-hidden">
        {rows.map((row, i) => (
          <div
            key={i}
            className={cn('flex items-center gap-2 px-3 py-2 text-sm',
              i % 2 === 0 ? 'bg-gray-50 dark:bg-neutral-800/40' : 'bg-white dark:bg-neutral-900/10')}
          >
            <label className="flex items-center gap-2 w-28 shrink-0 cursor-pointer">
              <input
                type="checkbox" className="w-3.5 h-3.5 accent-primary-600"
                checked={row.enabled}
                onChange={(e) => patch(i, { enabled: e.target.checked })}
              />
              <span className={cn('font-medium', !row.enabled && 'text-gray-400 dark:text-gray-500')}>
                {lang === 'ar' ? DAYS_AR[i] : DAYS_EN[i]}
              </span>
            </label>
            {row.enabled ? (
              <div className="flex items-center gap-2 flex-1 flex-wrap">
                <input
                  type="time" className="h-8 rounded border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 text-xs w-24"
                  value={row.startTime} onChange={(e) => patch(i, { startTime: e.target.value })}
                />
                <span className="text-gray-400 text-xs">–</span>
                <input
                  type="time" className="h-8 rounded border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 text-xs w-24"
                  value={row.endTime} onChange={(e) => patch(i, { endTime: e.target.value })}
                />
                <div className="flex items-center gap-1">
                  <label className="text-[10px] text-gray-500 shrink-0">{t('كل', 'Every')}</label>
                  <select
                    className="h-8 rounded border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-1 text-xs w-16"
                    value={row.slotDurationMins} onChange={(e) => patch(i, { slotDurationMins: Number(e.target.value) })}
                  >
                    {[10, 15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m}{t('د', 'm')}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  <label className="text-[10px] text-gray-500 shrink-0">{t('أقصى', 'Max')}</label>
                  <input
                    type="number" className="h-8 rounded border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 text-xs w-14"
                    min={1} max={200}
                    value={row.maxPatients} onChange={(e) => patch(i, { maxPatients: Number(e.target.value) })}
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
    </>
  );
}

/** Map enabled consultation-hour rows to the bulk PUT payload. */
export function consultHoursPayload(rows: ConsultHourRow[]) {
  return rows
    .map((h, i) => ({ ...h, dayOfWeek: i }))
    .filter((h) => h.enabled)
    .map(({ dayOfWeek, startTime, endTime, slotDurationMins, maxPatients }) => ({
      dayOfWeek, startTime, endTime, slotDurationMins, maxPatients,
    }));
}
