'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Save, Pill, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { ProductSearchInput } from './ProductSearchInput';
import { useLang } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';
import { ehrApi } from '@/lib/api';
import type { Prescription, RxForm, RxFrequency, RxTiming, ProductSearchResult } from '@fadl/types';

/* ── label maps ──────────────────────────────────────────────────────────── */

const FORM_OPTIONS: { value: RxForm; labelEn: string; labelAr: string }[] = [
  { value: 'cap', labelEn: 'Capsule',   labelAr: 'كبسولة' },
  { value: 'tab', labelEn: 'Tablet',    labelAr: 'قرص' },
  { value: 'syr', labelEn: 'Syrup',     labelAr: 'شراب' },
  { value: 'inj', labelEn: 'Injection', labelAr: 'حقنة' },
  { value: 'gtt', labelEn: 'Drop',      labelAr: 'نقطة' },
];

const FREQUENCY_OPTIONS: { value: RxFrequency; labelEn: string; labelAr: string; abbr: string }[] = [
  { value: 'od',  abbr: 'q.d.', labelEn: 'Once daily',         labelAr: 'مرة يومياً' },
  { value: 'bid', abbr: 'b.i.d', labelEn: 'Twice daily',       labelAr: 'مرتين يومياً' },
  { value: 'tid', abbr: 't.i.d', labelEn: 'Three times daily', labelAr: 'ثلاث مرات يومياً' },
  { value: 'qid', abbr: 'q.i.d', labelEn: 'Four times daily',  labelAr: 'أربع مرات يومياً' },
  { value: 'q4h', abbr: 'q4h',   labelEn: 'Every 4 hours',     labelAr: 'كل 4 ساعات' },
];

const TIMING_OPTIONS: { value: RxTiming; labelEn: string; labelAr: string; abbr: string }[] = [
  { value: 'ac',   abbr: 'a.c.',  labelEn: 'Before meals', labelAr: 'قبل الأكل' },
  { value: 'pc',   abbr: 'p.c.',  labelEn: 'After meals',  labelAr: 'بعد الأكل' },
  { value: 'hs',   abbr: 'h.s.',  labelEn: 'At bedtime',   labelAr: 'عند النوم' },
  { value: 'prn',  abbr: 'p.r.n', labelEn: 'As needed',    labelAr: 'عند الحاجة' },
  { value: 'stat', abbr: 'stat',  labelEn: 'Immediately',  labelAr: 'فوراً' },
  { value: 'none', abbr: '—',     labelEn: 'None',         labelAr: 'لا يوجد' },
];

const ROUTE_PRESETS = [
  { en: 'Take orally',         ar: 'تناول عن طريق الفم' },
  { en: 'Apply topically',     ar: 'استخدام موضعي' },
  { en: 'For external use only', ar: 'للاستخدام الخارجي فقط' },
  { en: 'Shake well before use', ar: 'رج جيداً قبل الاستخدام' },
  { en: 'Dissolve under tongue', ar: 'أذب تحت اللسان' },
];

/* ── types ───────────────────────────────────────────────────────────────── */

// RxForm values that map directly to product_forms codes in the dictionary
const RX_FORM_SET = new Set<string>(['cap', 'tab', 'syr', 'inj', 'gtt']);

interface ItemRow {
  _key: string;
  productId?: string;
  medicationName: string;
  medicationId?: string;
  form: RxForm;
  dosageValue: string;
  dosageUnit: string;
  frequency: RxFrequency;
  timing: RxTiming;
  routeInstruction: string;
  durationDays: string;
  dispenseQuantity: string;
}

interface Props {
  encounterId?: string;
  patientId: string;
  doctorId: string;
  patientName?: string;
  onSuccess?: (rx: Prescription) => void;
  onCancel?: () => void;
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

function emptyItem(idx: number): ItemRow {
  return {
    _key:            `item-${Date.now()}-${idx}`,
    productId:       undefined,
    medicationName:  '',
    form:            'tab',
    dosageValue:     '',
    dosageUnit:      'mg',
    frequency:       'od',
    timing:          'none',
    routeInstruction:'',
    durationDays:    '',
    dispenseQuantity:'',
  };
}

function SelectField({
  label, labelAr, value, onChange, options, lang, id,
}: {
  label: string;
  labelAr: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  lang: 'ar' | 'en';
  id: string;
}) {
  const displayLabel = lang === 'ar' ? labelAr : label;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-gray-600 dark:text-gray-400">
        {displayLabel}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'w-full h-10 rounded-lg border border-gray-200 dark:border-neutral-600',
            'bg-white dark:bg-neutral-800 text-sm text-gray-900 dark:text-gray-100',
            'px-3 appearance-none focus:outline-none focus:ring-2 focus:ring-primary-600',
            'transition-colors',
          )}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
      </div>
    </div>
  );
}

/* ── main component ──────────────────────────────────────────────────────── */

export function PrescriptionForm({ encounterId, patientId, doctorId, patientName, onSuccess, onCancel }: Props) {
  const { lang, t } = useLang();
  const queryClient = useQueryClient();

  const [diagnosis, setDiagnosis]   = useState('');
  const [notes, setNotes]           = useState('');
  const [items, setItems]           = useState<ItemRow[]>([emptyItem(0)]);
  const [error, setError]           = useState('');

  /* ── item helpers ──────────────────────────────────────────────────────── */

  function addItem() {
    setItems((prev) => [...prev, emptyItem(prev.length)]);
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((it) => it._key !== key));
  }

  function patchItem<K extends keyof ItemRow>(key: string, field: K, val: ItemRow[K]) {
    setItems((prev) =>
      prev.map((it) => (it._key === key ? { ...it, [field]: val } : it)),
    );
  }

  /* ── submit ────────────────────────────────────────────────────────────── */

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        encounterId,
        patientId,
        doctorId,
        diagnosis: diagnosis.trim() || undefined,
        notes: notes.trim() || undefined,
        items: items.map((it, i) => ({
          productId:        it.productId || undefined,
          medicationId:     it.medicationId,
          medicationName:   it.medicationName.trim() || undefined,
          form:             it.form,
          dosageValue:      it.dosageValue ? Number(it.dosageValue) : undefined,
          dosageUnit:       it.dosageUnit.trim() || undefined,
          frequency:        it.frequency,
          timing:           it.timing,
          routeInstruction: it.routeInstruction.trim() || undefined,
          durationDays:     it.durationDays ? Number(it.durationDays) : undefined,
          dispenseQuantity: it.dispenseQuantity ? Number(it.dispenseQuantity) : undefined,
          sortOrder:        i,
        })),
      };
      const res = await ehrApi.post('/prescriptions', payload);
      return (res.data as { data: Prescription }).data;
    },
    onSuccess: (rx) => {
      void queryClient.invalidateQueries({ queryKey: ['prescriptions'] });
      onSuccess?.(rx);
    },
    onError: () => {
      setError(t('حدث خطأ أثناء الحفظ. يرجى المحاولة مجدداً.', 'An error occurred. Please try again.'));
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const incomplete = items.some((it) => !it.productId && !it.medicationName.trim());
    if (incomplete) {
      setError(t('يرجى اختيار دواء أو إدخال اسمه لجميع البنود.', 'Please select or enter a medication name for every item.'));
      return;
    }

    createMutation.mutate();
  }

  /* ── render ────────────────────────────────────────────────────────────── */

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">

      {/* header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/30">
          <Pill className="h-5 w-5 text-primary-600" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {t('وصفة طبية جديدة', 'New Prescription')}
          </h2>
          {patientName && (
            <p className="text-xs text-gray-500 dark:text-gray-400">{patientName}</p>
          )}
        </div>
      </div>

      {/* diagnosis */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
          {t('التشخيص', 'Diagnosis')}
        </label>
        <textarea
          value={diagnosis}
          onChange={(e) => setDiagnosis(e.target.value)}
          rows={2}
          placeholder={t('أدخل التشخيص…', 'Enter diagnosis…')}
          className={cn(
            'w-full rounded-lg border border-gray-200 dark:border-neutral-600',
            'bg-white dark:bg-neutral-800 text-sm text-gray-900 dark:text-gray-100',
            'px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary-600',
            'transition-colors',
          )}
        />
      </div>

      {/* medication items */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            {t('الأدوية', 'Medications')}
            <Badge className="ms-2" variant="outline">{items.length}</Badge>
          </h3>
          <Button type="button" variant="secondary" size="sm" onClick={addItem}>
            <Plus className="h-4 w-4" />
            {t('إضافة دواء', 'Add Medication')}
          </Button>
        </div>

        {items.map((item, idx) => (
          <div
            key={item._key}
            className={cn(
              'relative rounded-xl border border-gray-200 dark:border-neutral-700',
              'bg-gray-50 dark:bg-neutral-800/50 p-4 flex flex-col gap-4',
            )}
          >
            {/* item index badge + remove */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                {t('دواء', 'Item')} {idx + 1}
              </span>
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeItem(item._key)}
                  className="text-red-500 hover:text-red-700 transition-colors"
                  aria-label={t('حذف الدواء', 'Remove medication')}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* row 1: medication name + form + dosage */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <ProductSearchInput
                value={item.medicationName}
                productId={item.productId}
                lang={lang}
                typeFilter="medicine"
                onChange={(v) => patchItem(item._key, 'medicationName', v)}
                onSelect={(product: ProductSearchResult) => {
                  const displayName = lang === 'ar' && product.tradeNameAr
                    ? product.tradeNameAr
                    : product.tradeNameEn;
                  patchItem(item._key, 'productId', product.id);
                  patchItem(item._key, 'medicationName', displayName);
                  // auto-fill form only for RxForm-compatible codes
                  if (product.formCode && RX_FORM_SET.has(product.formCode)) {
                    patchItem(item._key, 'form', product.formCode as RxForm);
                  }
                  // auto-fill dosage unit from strength string, e.g. "500 mg" → "mg"
                  if (product.strength) {
                    const unit = product.strength.match(/[a-z%µ]+/i)?.[0]?.toLowerCase();
                    if (unit) patchItem(item._key, 'dosageUnit', unit);
                  }
                }}
                onClear={() => {
                  patchItem(item._key, 'productId', undefined);
                  patchItem(item._key, 'medicationName', '');
                }}
              />

              <SelectField
                id={`${item._key}-form`}
                label="Form" labelAr="الشكل"
                lang={lang}
                value={item.form}
                onChange={(v) => patchItem(item._key, 'form', v as RxForm)}
                options={FORM_OPTIONS.map((o) => ({
                  value: o.value,
                  label: lang === 'ar' ? o.labelAr : o.labelEn,
                }))}
              />

              <div className="flex gap-2">
                <Input
                  label="Dose" labelAr="الجرعة"
                  lang={lang}
                  type="number"
                  min="0"
                  step="any"
                  placeholder="500"
                  value={item.dosageValue}
                  onChange={(e) => patchItem(item._key, 'dosageValue', e.target.value)}
                  className="flex-1"
                />
                <Input
                  label="Unit" labelAr="الوحدة"
                  lang={lang}
                  placeholder="mg"
                  value={item.dosageUnit}
                  onChange={(e) => patchItem(item._key, 'dosageUnit', e.target.value)}
                  className="w-20"
                />
              </div>
            </div>

            {/* row 2: frequency + timing */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <SelectField
                id={`${item._key}-frequency`}
                label="Frequency" labelAr="التكرار"
                lang={lang}
                value={item.frequency}
                onChange={(v) => patchItem(item._key, 'frequency', v as RxFrequency)}
                options={FREQUENCY_OPTIONS.map((o) => ({
                  value: o.value,
                  label: `${o.abbr} — ${lang === 'ar' ? o.labelAr : o.labelEn}`,
                }))}
              />

              <SelectField
                id={`${item._key}-timing`}
                label="Timing" labelAr="التوقيت"
                lang={lang}
                value={item.timing}
                onChange={(v) => patchItem(item._key, 'timing', v as RxTiming)}
                options={TIMING_OPTIONS.map((o) => ({
                  value: o.value,
                  label: o.value === 'none' ? (lang === 'ar' ? o.labelAr : o.labelEn) : `${o.abbr} — ${lang === 'ar' ? o.labelAr : o.labelEn}`,
                }))}
              />
            </div>

            {/* row 3: route instruction presets */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                {t('تعليمات الاستخدام', 'Instructions')}
              </span>
              <div className="flex flex-wrap gap-1.5 mb-1">
                {ROUTE_PRESETS.map((p) => {
                  const label = lang === 'ar' ? p.ar : p.en;
                  const active = item.routeInstruction === p.en;
                  return (
                    <button
                      key={p.en}
                      type="button"
                      onClick={() => patchItem(item._key, 'routeInstruction', active ? '' : p.en)}
                      className={cn(
                        'rounded-full px-2.5 py-0.5 text-xs border transition-colors',
                        active
                          ? 'bg-primary-600 text-white border-primary-600'
                          : 'border-gray-200 dark:border-neutral-600 text-gray-600 dark:text-gray-400 hover:border-primary-400',
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <input
                type="text"
                value={item.routeInstruction}
                onChange={(e) => patchItem(item._key, 'routeInstruction', e.target.value)}
                placeholder={t('أو اكتب تعليمات مخصصة…', 'Or type custom instructions…')}
                className={cn(
                  'w-full h-9 rounded-lg border border-gray-200 dark:border-neutral-600',
                  'bg-white dark:bg-neutral-800 text-sm text-gray-900 dark:text-gray-100',
                  'px-3 focus:outline-none focus:ring-2 focus:ring-primary-600 transition-colors',
                )}
              />
            </div>

            {/* row 4: duration + quantity */}
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Duration (days)" labelAr="المدة (أيام)"
                lang={lang}
                type="number"
                min="1"
                placeholder="7"
                value={item.durationDays}
                onChange={(e) => patchItem(item._key, 'durationDays', e.target.value)}
              />
              <Input
                label="Dispense Qty" labelAr="الكمية"
                lang={lang}
                type="number"
                min="1"
                placeholder="14"
                value={item.dispenseQuantity}
                onChange={(e) => patchItem(item._key, 'dispenseQuantity', e.target.value)}
              />
            </div>
          </div>
        ))}
      </div>

      {/* notes */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
          {t('ملاحظات إضافية', 'Additional Notes')}
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder={t('ملاحظات للصيدلاني…', 'Notes for the pharmacist…')}
          className={cn(
            'w-full rounded-lg border border-gray-200 dark:border-neutral-600',
            'bg-white dark:bg-neutral-800 text-sm text-gray-900 dark:text-gray-100',
            'px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary-600 transition-colors',
          )}
        />
      </div>

      {/* error */}
      {error && (
        <p className="rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {/* actions */}
      <div className="flex justify-end gap-3">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={createMutation.isLoading}>
            {t('إلغاء', 'Cancel')}
          </Button>
        )}
        <Button type="submit" variant="primary" disabled={createMutation.isLoading}>
          <Save className="h-4 w-4" />
          {createMutation.isLoading
            ? t('جارٍ الحفظ…', 'Saving…')
            : t('حفظ الوصفة', 'Save Prescription')}
        </Button>
      </div>

    </form>
  );
}
