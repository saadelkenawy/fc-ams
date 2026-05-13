'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { Stethoscope, Phone, BadgeDollarSign, CreditCard, AlertCircle, TrendingUp } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useLang } from '@/contexts/LanguageContext';
import { useSpecialties, useUpdateDoctor } from '@/hooks/useDoctors';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import type { Doctor } from '@fadl/types';

const SPLIT_PRESETS = [
  { label: '50/50',        dr: 50,   cl: 50   },
  { label: '70/30',        dr: 70,   cl: 30   },
  { label: '37.5/62.5',   dr: 37.5, cl: 62.5 },
  { label: '80/20',        dr: 80,   cl: 20   },
  { label: '30/70',        dr: 30,   cl: 70   },
];

const PAYMENT_METHODS = [
  { value: 'instapay',      labelAr: 'انستاباي',     labelEn: 'InstaPay'       },
  { value: 'cash',          labelAr: 'كاش',           labelEn: 'Cash'           },
  { value: 'mobile_wallet', labelAr: 'محفظة موبايل', labelEn: 'Mobile Wallet'  },
  { value: 'bank_transfer', labelAr: 'تحويل بنكي',   labelEn: 'Bank Transfer'  },
  { value: 'vfc_wallet',    labelAr: 'محفظة VFC',    labelEn: 'VFC Wallet'     },
];

interface SplitValues { doctor: number; clinic: number; }

interface FormData {
  nameAr: string;
  nameEn: string;
  mobile: string;
  specialtyId: string;
  subSpecialty: string;
  isOnlineDoctor: boolean;
  consultationSplit: SplitValues;
  operativeSplit: SplitValues;
  onlineSplit: SplitValues;
  paymentMethod: string;
  allowOverbooking: boolean;
}

function SplitRow({ label, value, onChange, lang }: {
  label: string; value: SplitValues;
  onChange: (v: SplitValues) => void; lang: 'ar' | 'en';
}) {
  return (
    <div className="p-3 rounded-xl bg-gray-50 dark:bg-neutral-800/60 border border-gray-100 dark:border-neutral-700">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{label}</span>
        <div className="flex gap-1">
          {SPLIT_PRESETS.map((p) => (
            <button key={p.label} type="button" onClick={() => onChange({ doctor: p.dr, clinic: p.cl })}
              className={cn('px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all',
                value.doctor === p.dr
                  ? 'bg-primary-600 text-white'
                  : 'bg-white dark:bg-neutral-700 text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-neutral-600 border border-gray-200 dark:border-neutral-600'
              )}>{p.label}</button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="h-2 bg-gray-200 dark:bg-neutral-700 rounded-full overflow-hidden">
            <div className="h-full w-full bg-primary-600 origin-left transition-transform duration-300" style={{ transform: `scaleX(${value.doctor / 100})` }} />
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

interface EditDoctorModalProps {
  open: boolean;
  onClose: () => void;
  doctor: Doctor;
}

export function EditDoctorModal({ open, onClose, doctor }: EditDoctorModalProps) {
  const { lang, t } = useLang();
  const { toast } = useToast();
  const { data: specialties = [] } = useSpecialties();
  const mutation = useUpdateDoctor();

  const [form, setForm] = useState<FormData>(toFormData(doctor));
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});

  useEffect(() => {
    if (open) { setForm(toFormData(doctor)); setErrors({}); }
  }, [open, doctor]);

  function toFormData(d: Doctor): FormData {
    return {
      nameAr:   d.nameAr ?? '',
      nameEn:   d.nameEn ?? '',
      mobile:   d.mobile.replace(/^\+20/, '0'),
      specialtyId: String(d.specialtyId),
      subSpecialty: d.subSpecialty ?? '',
      isOnlineDoctor: d.isOnlineDoctor,
      consultationSplit: { doctor: d.revenueSplits.consultation.doctorPercentage, clinic: d.revenueSplits.consultation.clinicPercentage },
      operativeSplit:    { doctor: d.revenueSplits.operative.doctorPercentage,    clinic: d.revenueSplits.operative.clinicPercentage    },
      onlineSplit:       { doctor: d.revenueSplits.online.doctorPercentage,       clinic: d.revenueSplits.online.clinicPercentage       },
      paymentMethod: d.paymentMethod ?? '',
      allowOverbooking: d.allowOverbooking,
    };
  }

  function set<K extends keyof FormData>(key: K, val: FormData[K]) {
    setForm((p) => ({ ...p, [key]: val }));
    if (errors[key]) setErrors((p) => ({ ...p, [key]: undefined }));
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.nameAr.trim() && !form.nameEn.trim()) e.nameAr = t('الاسم مطلوب', 'Name required');
    if (!form.mobile.trim()) e.mobile = t('الموبايل مطلوب', 'Mobile required');
    else { const d = form.mobile.replace(/\D/g, ''); if (d.length < 10) e.mobile = t('رقم غير صحيح', 'Invalid number'); }
    if (!form.specialtyId) e.specialtyId = t('التخصص مطلوب', 'Specialty required');
    const splits = [form.consultationSplit, form.operativeSplit, form.onlineSplit];
    if (splits.some((s) => s.doctor + s.clinic !== 100)) e.splits = t('مجموع النسب يجب أن يساوي 100%', 'Split must sum to 100%');
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function mobileToE164(raw: string): string {
    const digits = raw.replace(/\D/g, '');
    if (digits.startsWith('20') && digits.length === 12) return `+${digits}`;
    if (digits.startsWith('0') && digits.length === 11) return `+20${digits.slice(1)}`;
    if (digits.length === 10 && digits.startsWith('1')) return `+20${digits}`;
    return `+${digits}`;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    mutation.mutate({
      id: doctor.id,
      version:      doctor.version,
      mobile:       mobileToE164(form.mobile),
      nameEn:       form.nameEn || form.nameAr,
      nameAr:       form.nameAr || undefined,
      specialtyId:  Number(form.specialtyId),
      subSpecialty: form.subSpecialty || undefined,
      isOnlineDoctor: form.isOnlineDoctor,
      revenueSplits: {
        consultation: { doctorPercentage: form.consultationSplit.doctor, clinicPercentage: form.consultationSplit.clinic },
        operative:    { doctorPercentage: form.operativeSplit.doctor,    clinicPercentage: form.operativeSplit.clinic    },
        online:       { doctorPercentage: form.onlineSplit.doctor,       clinicPercentage: form.onlineSplit.clinic       },
      },
      paymentMethod:   (form.paymentMethod || undefined) as Doctor['paymentMethod'],
      allowOverbooking: form.allowOverbooking,
    }, {
      onSuccess: () => {
        toast(t('تم حفظ بيانات الطبيب', 'Doctor profile saved.'), 'success');
        onClose();
      },
      onError: (err: unknown) => {
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
          ?? t('حدث خطأ', 'An error occurred');
        toast(msg, 'error');
      },
    });
  }

  const inputClass = 'w-full h-10 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent transition-shadow';

  const grouped = specialties.reduce<Record<string, typeof specialties>>((acc, s) => {
    const cat = s.category ?? 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(s);
    return acc;
  }, {});

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('تعديل بيانات الطبيب', 'Edit Doctor')}
      subtitle={lang === 'ar' ? (doctor.nameAr ?? doctor.nameEn) : doctor.nameEn}
      maxWidth="2xl"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={mutation.isPending}>
            {t('إلغاء', 'Cancel')}
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={mutation.isPending} className="gap-2 min-w-[130px]">
            <Stethoscope className="w-4 h-4" />
            {mutation.isPending ? t('جاري الحفظ...', 'Saving...') : t('حفظ التعديلات', 'Save Changes')}
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

        <p className="form-section-title">
          <Stethoscope className="w-3.5 h-3.5" />
          {t('بيانات الطبيب', 'Doctor Profile')}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">{t('الاسم بالعربي *', 'Name (Arabic) *')}</label>
            <input className={cn(inputClass, errors.nameAr && 'border-red-400')} placeholder="د. اسم الطبيب" value={form.nameAr} onChange={(e) => set('nameAr', e.target.value)} dir="rtl" />
            {errors.nameAr && <p className="text-xs text-red-500 mt-1">{errors.nameAr}</p>}
          </div>
          <div>
            <label className="field-label">{t('الاسم بالإنجليزي', 'Name (English)')}</label>
            <input className={inputClass} placeholder="Dr. Name" value={form.nameEn} onChange={(e) => set('nameEn', e.target.value)} dir="ltr" />
          </div>
        </div>

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
          <div>
            <label className="field-label">{t('التخصص *', 'Specialty *')}</label>
            <select
              className={cn(inputClass, 'cursor-pointer', errors.specialtyId && 'border-red-400')}
              value={form.specialtyId}
              onChange={(e) => set('specialtyId', e.target.value)}
            >
              <option value="">{t('اختر التخصص', 'Select a specialty')}</option>
              {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([cat, specs]) => (
                <optgroup key={cat} label={cat.charAt(0).toUpperCase() + cat.slice(1)}>
                  {specs.sort((a, b) => (a.nameEn > b.nameEn ? 1 : -1)).map((s) => (
                    <option key={s.id} value={s.id}>
                      {lang === 'ar' ? `${s.nameAr} (${s.code})` : `${s.nameEn} (${s.code})`}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {errors.specialtyId && <p className="text-xs text-red-500 mt-1">{errors.specialtyId}</p>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">{t('التخصص الفرعي', 'Sub-Specialty')}</label>
            <input className={inputClass} placeholder={t('اختياري', 'Optional')} value={form.subSpecialty} onChange={(e) => set('subSpecialty', e.target.value)} />
          </div>
          <div className="flex items-end gap-4 pb-1">
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

        <p className="form-section-title">
          <TrendingUp className="w-3.5 h-3.5" />
          {t('نسب الأرباح', 'Revenue Splits')}
        </p>
        {errors.splits && <p className="text-xs text-red-500 -mt-1 mb-2">{errors.splits}</p>}
        <div className="space-y-2">
          <SplitRow label={t('كشف (consultation)', 'Consultation')} value={form.consultationSplit} onChange={(v) => set('consultationSplit', v)} lang={lang} />
          <SplitRow label={t('إجراء عملي (operative)', 'Operative')} value={form.operativeSplit}    onChange={(v) => set('operativeSplit', v)}    lang={lang} />
          <SplitRow label={t('أونلاين (online)', 'Online')}         value={form.onlineSplit}        onChange={(v) => set('onlineSplit', v)}        lang={lang} />
        </div>

        <p className="form-section-title">
          <CreditCard className="w-3.5 h-3.5" />
          <BadgeDollarSign className="w-3.5 h-3.5" />
          {t('طريقة استلام الأتعاب', 'Settlement Method')}
        </p>
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
      </form>
    </Modal>
  );
}
