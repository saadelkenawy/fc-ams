'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Phone, CreditCard, Calendar, Heart, MapPin, Users, Globe2, AlertCircle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useLang } from '@/contexts/LanguageContext';
import { patientApi } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';

// All patient sources from data.md §3.3
const PATIENT_SOURCES = [
  { code: "Cl.'s",      labelAr: 'مريض العيادة',         labelEn: "Clinic Direct" },
  { code: "Dr.'s",      labelAr: 'إحالة طبيب',            labelEn: "Doctor Referral" },
  { code: 'VEZ',        labelAr: 'فيزيتا',                labelEn: 'Vizita' },
  { code: 'Ex-VEZ',     labelAr: 'فيزيتا (سابق)',         labelEn: 'Ex-Vizita' },
  { code: 'VEZ-Direct', labelAr: 'فيزيتا مباشر',          labelEn: 'Vizita Direct' },
  { code: 'EKF',        labelAr: 'اكشف',                  labelEn: 'Ekshf' },
  { code: 'Ex-EKF',     labelAr: 'اكشف (سابق)',           labelEn: 'Ex-Ekshf' },
  { code: 'EKF-Direct', labelAr: 'اكشف مباشر',            labelEn: 'Ekshf Direct' },
  { code: 'DO',         labelAr: 'كلينيدو',               labelEn: 'CliniDo' },
  { code: 'Ex-DO',      labelAr: 'كلينيدو (سابق)',        labelEn: 'Ex-CliniDo' },
  { code: 'DO-Direct',  labelAr: 'كلينيدو مباشر',         labelEn: 'CliniDo Direct' },
  { code: 'SHL',        labelAr: 'شامل',                  labelEn: 'Shamel' },
  { code: 'SHL-Clinic', labelAr: 'شامل عبر العيادة',      labelEn: 'Shamel Clinic' },
];

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const CLS_SOURCE = "Cl.'s";

interface FormData {
  nameAr: string;
  nameEn: string;
  mobile: string;
  nationalId: string;
  dateOfBirth: string;
  gender: 'M' | 'F' | '';
  bloodType: string;
  address: string;
  email: string;
  emergencyContactName: string;
  emergencyContactMobile: string;
  sourceFirstVisit: string;
  preferredLanguage: 'ar' | 'en';
  isFutureSource: boolean;
}

function mobileToE164(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('20') && digits.length === 12) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 11) return `+20${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith('1')) return `+20${digits}`;
  return `+${digits}`;
}

interface AddPatientModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (id: string) => void;
}

export function AddPatientModal({ open, onClose, onCreated }: AddPatientModalProps) {
  const { lang, t } = useLang();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [form, setForm] = useState<FormData>({
    nameAr: '', nameEn: '', mobile: '', nationalId: '', dateOfBirth: '',
    gender: '', bloodType: '', address: '', email: '',
    emergencyContactName: '', emergencyContactMobile: '',
    sourceFirstVisit: CLS_SOURCE, preferredLanguage: 'ar',
    isFutureSource: false,
  });

  const showFutureSource = form.sourceFirstVisit !== CLS_SOURCE;
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  const mutation = useMutation({
    mutationFn: async (payload: FormData) => {
      const body: Record<string, unknown> = {
        mobile:           mobileToE164(payload.mobile),
        nameEn:           payload.nameEn || payload.nameAr,
        preferredLanguage: payload.preferredLanguage,
        sourceFirstVisit: payload.sourceFirstVisit,
      };
      if (payload.nameAr)                body.nameAr = payload.nameAr;
      if (payload.nationalId)            body.nationalId = payload.nationalId;
      if (payload.dateOfBirth)           body.dateOfBirth = payload.dateOfBirth;
      if (payload.gender)                body.gender = payload.gender;
      if (payload.bloodType)             body.bloodType = payload.bloodType;
      if (payload.address)               body.address = payload.address;
      if (payload.email)                 body.email = payload.email;
      if (payload.emergencyContactName)  body.emergencyContactName = payload.emergencyContactName;
      if (payload.emergencyContactMobile) body.emergencyContactMobile = mobileToE164(payload.emergencyContactMobile);
      body.isFutureSource = payload.isFutureSource === true && payload.sourceFirstVisit !== CLS_SOURCE;
      const { data } = await patientApi.post<{ data: { patientId: string } }>('/patients', body);
      return data.data;
    },
    onSuccess: (created) => {
      void qc.invalidateQueries({ queryKey: ['patients'] });
      toast(t('تم إضافة المريض بنجاح', 'Patient added successfully'), 'success');
      onCreated?.(created.patientId);
      onClose();
      setForm({ nameAr: '', nameEn: '', mobile: '', nationalId: '', dateOfBirth: '', gender: '', bloodType: '', address: '', email: '', emergencyContactName: '', emergencyContactMobile: '', sourceFirstVisit: CLS_SOURCE, preferredLanguage: 'ar', isFutureSource: false });
      setErrors({});
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string; error?: string } } })?.response?.data?.message
        ?? (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? t('حدث خطأ. يرجى المحاولة مرة أخرى.', 'An error occurred. Please try again.');
      toast(msg, 'error');
    },
  });

  function set<K extends keyof FormData>(key: K, val: FormData[K]) {
    setForm((p) => {
      const next = { ...p, [key]: val };
      if (key === 'sourceFirstVisit' && val === CLS_SOURCE) next.isFutureSource = false;
      return next;
    });
    if (errors[key]) setErrors((p) => ({ ...p, [key]: undefined }));
  }

  function validate(): boolean {
    const e: Partial<Record<keyof FormData, string>> = {};
    const name = form.nameAr || form.nameEn;
    if (!name.trim()) e.nameAr = t('الاسم مطلوب', 'Name is required');
    if (!form.mobile.trim()) e.mobile = t('رقم الموبايل مطلوب', 'Mobile is required');
    else {
      const digits = form.mobile.replace(/\D/g, '');
      if (digits.length < 10 || digits.length > 13) e.mobile = t('رقم غير صحيح', 'Invalid mobile number');
    }
    if (form.nationalId && form.nationalId.replace(/\D/g, '').length !== 14)
      e.nationalId = t('الرقم القومي 14 رقم', 'National ID must be 14 digits');
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    mutation.mutate(form);
  }

  const inputClass = 'w-full h-10 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent transition-shadow';
  const selectClass = cn(inputClass, 'cursor-pointer');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('إضافة مريض جديد', 'Add New Patient')}
      subtitle={t('أدخل بيانات المريض الأساسية', 'Enter patient information')}
      maxWidth="2xl"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={mutation.isPending}>
            {t('إلغاء', 'Cancel')}
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={mutation.isPending} className="gap-2 min-w-[120px]">
            <UserPlus className="w-4 h-4" />
            {mutation.isPending ? t('جاري الحفظ...', 'Saving...') : t('حفظ المريض', 'Save Patient')}
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
          <UserPlus className="w-3.5 h-3.5" />
          {t('الهوية', 'Identity')}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">{t('الاسم بالعربي', 'Name (Arabic)')}</label>
            <input className={cn(inputClass, errors.nameAr && 'border-red-400 focus:ring-red-500')} placeholder="مثال: أحمد محمد علي" value={form.nameAr} onChange={(e) => set('nameAr', e.target.value)} dir="rtl" />
            {errors.nameAr && <p className="text-xs text-red-500 mt-1">{errors.nameAr}</p>}
          </div>
          <div>
            <label className="field-label">{t('الاسم بالإنجليزي', 'Name (English)')}</label>
            <input className={inputClass} placeholder="e.g. Ahmed Mohamed Ali" value={form.nameEn} onChange={(e) => set('nameEn', e.target.value)} dir="ltr" />
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
                className={cn(inputClass, 'ps-10', errors.mobile && 'border-red-400 focus:ring-red-500')}
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
            <label className="field-label">{t('البريد الإلكتروني', 'Email')}</label>
            <div className="relative">
              <Globe2 className="absolute inset-y-0 start-3 my-auto w-4 h-4 text-gray-400 pointer-events-none" />
              <input className={cn(inputClass, 'ps-9')} placeholder="example@email.com" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} dir="ltr" />
            </div>
          </div>
        </div>

        {/* ── Demographics ── */}
        <p className="form-section-title">
          <CreditCard className="w-3.5 h-3.5" />
          {t('البيانات الشخصية', 'Demographics')}
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="field-label">{t('الرقم القومي', 'National ID')}</label>
            <input
              className={cn(inputClass, errors.nationalId && 'border-red-400')}
              placeholder="29XXXXXXXXXXXX"
              value={form.nationalId}
              onChange={(e) => set('nationalId', e.target.value.replace(/\D/g, '').slice(0, 14))}
              inputMode="numeric"
              maxLength={14}
              dir="ltr"
            />
            {errors.nationalId && <p className="text-xs text-red-500 mt-1">{errors.nationalId}</p>}
          </div>
          <div>
            <label className="field-label">{t('تاريخ الميلاد', 'Date of Birth')}</label>
            <div className="relative">
              <Calendar className="absolute inset-y-0 start-3 my-auto w-4 h-4 text-gray-400 pointer-events-none" />
              <input className={cn(inputClass, 'ps-9')} type="date" value={form.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="field-label">{t('الجنس', 'Gender')}</label>
            <select className={selectClass} value={form.gender} onChange={(e) => set('gender', e.target.value as 'M' | 'F' | '')}>
              <option value="">{t('-- اختر --', '-- Select --')}</option>
              <option value="M">{t('ذكر', 'Male')}</option>
              <option value="F">{t('أنثى', 'Female')}</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">{t('فصيلة الدم', 'Blood Type')}</label>
            <div className="relative">
              <Heart className="absolute inset-y-0 start-3 my-auto w-4 h-4 text-gray-400 pointer-events-none" />
              <select className={cn(selectClass, 'ps-9')} value={form.bloodType} onChange={(e) => set('bloodType', e.target.value)}>
                <option value="">{t('غير محدد', 'Unknown')}</option>
                {BLOOD_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="field-label">{t('مصدر أول زيارة', 'Source')}</label>
            <select className={selectClass} value={form.sourceFirstVisit} onChange={(e) => set('sourceFirstVisit', e.target.value)}>
              {PATIENT_SOURCES.map((s) => (
                <option key={s.code} value={s.code}>
                  {lang === 'ar' ? `${s.labelAr} (${s.code})` : `${s.labelEn} (${s.code})`}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Future Source (conditional — hidden when Cl.'s is selected) ── */}
        {showFutureSource && (
          <div className="mb-4 animate-slide-down">
            <p className="form-section-title">
              <span className="text-primary-500 text-sm leading-none">◈</span>
              {t('مصدر مستقبلي', 'Future Source')}
            </p>
            <label className={cn(
              'flex items-start gap-2.5 w-full px-3 py-2.5 rounded-lg border cursor-pointer transition-colors',
              'bg-white/[0.03] dark:bg-white/[0.03]',
              form.isFutureSource
                ? 'border-primary-500/50 dark:border-primary-500/40 bg-primary-50/50 dark:bg-primary-900/20'
                : 'border-white/10 dark:border-neutral-700 hover:border-primary-400/30 dark:hover:border-primary-600/40',
            )}>
              <input
                type="checkbox"
                className="mt-0.5 w-4 h-4 flex-shrink-0 rounded border-gray-300 dark:border-neutral-600 text-primary-600 focus:ring-primary-500 cursor-pointer"
                checked={form.isFutureSource}
                onChange={(e) => set('isFutureSource', e.target.checked)}
              />
              <span className="text-[13px] leading-snug text-gray-700 dark:text-slate-200 flex-1">
                {t("تسجيل هذا المريض كمصدر إحالة مستقبلي للعيادة (Cl.'s)", "Register this patient as a future Cl.'s referral source")}
              </span>
            </label>
          </div>
        )}

        {/* ── Address ── */}
        <div>
          <label className="field-label"><MapPin className="w-3 h-3 inline me-1" />{t('العنوان', 'Address')}</label>
          <input className={inputClass} placeholder={t('الحي، المدينة', 'District, City')} value={form.address} onChange={(e) => set('address', e.target.value)} />
        </div>

        {/* ── Emergency contact ── */}
        <p className="form-section-title">
          <Users className="w-3.5 h-3.5" />
          {t('جهة الاتصال في حالات الطوارئ', 'Emergency Contact')}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">{t('الاسم', 'Name')}</label>
            <input className={inputClass} placeholder={t('اسم ولي الأمر أو قريب', 'Guardian or relative name')} value={form.emergencyContactName} onChange={(e) => set('emergencyContactName', e.target.value)} />
          </div>
          <div>
            <label className="field-label">{t('الموبايل', 'Mobile')}</label>
            <input className={inputClass} placeholder="01XXXXXXXXX" value={form.emergencyContactMobile} onChange={(e) => set('emergencyContactMobile', e.target.value)} inputMode="tel" dir="ltr" />
          </div>
        </div>

        {/* ── Preference ── */}
        <div className="pt-1">
          <label className="field-label">{t('اللغة المفضلة', 'Preferred Language')}</label>
          <div className="flex gap-3 mt-1">
            {(['ar', 'en'] as const).map((l) => (
              <label key={l} className={cn('flex items-center gap-2 px-4 py-2.5 rounded-lg border cursor-pointer transition-all', form.preferredLanguage === l ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' : 'border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-gray-300 hover:border-gray-300')}>
                <input type="radio" className="sr-only" checked={form.preferredLanguage === l} onChange={() => set('preferredLanguage', l)} />
                <span className="text-sm font-medium">{l === 'ar' ? 'العربية' : 'English'}</span>
              </label>
            ))}
          </div>
        </div>
      </form>
    </Modal>
  );
}
