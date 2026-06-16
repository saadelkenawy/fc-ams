'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stethoscope, Phone, BadgeDollarSign, CreditCard, AlertCircle, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useLang } from '@/contexts/LanguageContext';
import { useSpecialties } from '@/hooks/useDoctors';
import { doctorApi } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { useTranslateName } from '@/hooks/useTranslateName';
import {
  type IdentityForm, type SpecialtyEntry, type ConsultHourRow,
  emptyIdentity, newEntry, DEFAULT_CONSULT_HOURS, PAYMENT_METHODS, inputClass,
  buildDoctorBody, validateDoctor, consultRowsError, scheduleBlockBody,
  SpecialtiesSection, ConsultationHoursEditor,
} from './doctorForm';

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

  const [form, setForm] = useState<IdentityForm>(emptyIdentity);
  const [entries, setEntries] = useState<SpecialtyEntry[]>([newEntry()]);
  const [consultHours, setConsultHours] = useState<ConsultHourRow[]>(DEFAULT_CONSULT_HOURS);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  function resetAll() {
    setForm(emptyIdentity());
    setEntries([newEntry()]);
    setConsultHours(DEFAULT_CONSULT_HOURS);
    setErrors({});
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const body = buildDoctorBody(form, entries, 10);
      const { data } = await doctorApi.post<{ data: { id: string } }>('/doctors', body);
      const created = data.data;

      // Seed the canonical weekly schedule so the new doctor shows hours in
      // Schedule Management immediately (one block per enabled day).
      for (let day = 0; day < consultHours.length; day++) {
        const row = consultHours[day];
        if (row.enabled) await doctorApi.post(`/doctors/${created.id}/schedules`, scheduleBlockBody(row, day));
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

  function set<K extends keyof IdentityForm>(key: K, val: IdentityForm[K]) {
    setForm((p) => ({ ...p, [key]: val }));
    if (errors[key]) setErrors((p) => ({ ...p, [key]: undefined }));
  }

  function updateEntry(i: number, e: SpecialtyEntry) {
    setEntries((prev) => prev.map((x, idx) => (idx === i ? e : x)));
    setErrors((p) => ({ ...p, [`spec_${i}`]: undefined, specialties: undefined }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const errs = validateDoctor(form, entries, t);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    const hoursErr = consultRowsError(consultHours, t);
    if (hoursErr) { toast(hoursErr, 'error'); return; }
    mutation.mutate();
  }

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
        <SpecialtiesSection
          entries={entries}
          specialties={specialties}
          lang={lang}
          t={t}
          errors={errors}
          onChangeEntry={updateEntry}
          onAdd={() => setEntries((prev) => [...prev, newEntry()])}
          onRemove={(i) => setEntries((prev) => prev.filter((_, idx) => idx !== i))}
        />

        {/* ── Consultation Hours ── */}
        <ConsultationHoursEditor rows={consultHours} lang={lang} t={t} onChange={setConsultHours} />

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
