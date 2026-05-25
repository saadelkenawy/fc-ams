'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import {
  UserPlus, Mail, Lock, Eye, EyeOff, Info, Check,
  ArrowLeft, ArrowRight, Loader2,
  UserRound, Stethoscope, Shield, Banknote, Package,
} from 'lucide-react';
import { identityApi } from '@/lib/api';
import { useLang } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslateName } from '@/hooks/useTranslateName';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

// ── Schema ────────────────────────────────────────────────────────────────────
const schema = z.object({
  firstNameEn: z.string().min(1, 'First name is required'),
  lastNameEn:  z.string().min(1, 'Last name is required'),
  firstNameAr: z.string().optional(),
  lastNameAr:  z.string().optional(),
  email:       z.string().email('Enter a valid email address'),
  password:    z.string().min(8, 'Password must be at least 8 characters'),
  confirm:     z.string(),
  role:        z.enum(['admin', 'finance', 'doctor', 'receptionist', 'procurement']),
}).refine((d) => d.password === d.confirm, {
  message: 'Passwords do not match',
  path: ['confirm'],
});

type FormValues = z.infer<typeof schema>;
type Role = 'admin' | 'finance' | 'doctor' | 'receptionist' | 'procurement';

// ── Role options ──────────────────────────────────────────────────────────────
const ROLE_OPTIONS: {
  key: Role;
  labelAr: string; labelEn: string;
  icon: React.ComponentType<{ className?: string }>;
  descAr: string; descEn: string;
}[] = [
  { key: 'receptionist', labelAr: 'موظف استقبال', labelEn: 'Receptionist', icon: UserRound,   descAr: 'إدارة المواعيد والمرضى',       descEn: 'Appointments & patients' },
  { key: 'doctor',       labelAr: 'طبيب',          labelEn: 'Doctor',       icon: Stethoscope, descAr: 'الحالات السريرية والجداول',    descEn: 'Encounters & schedules'  },
  { key: 'finance',      labelAr: 'مالية',          labelEn: 'Finance',      icon: Banknote,    descAr: 'الفواتير والتسويات والتقارير', descEn: 'Billing & reports'       },
  { key: 'admin',        labelAr: 'مسؤول النظام',   labelEn: 'Admin',        icon: Shield,      descAr: 'صلاحيات كاملة على النظام',     descEn: 'Full system access'      },
  { key: 'procurement',  labelAr: 'مشتريات',        labelEn: 'Procurement',  icon: Package,     descAr: 'كتالوج المشتريات والموردون',   descEn: 'Catalog & vendors'       },
];

// ── Password strength ─────────────────────────────────────────────────────────
function pwStrength(pw: string) {
  let s = 0;
  if (pw.length >= 8)           s++;
  if (pw.length >= 12)          s++;
  if (/[A-Z]/.test(pw))         s++;
  if (/[0-9]/.test(pw))         s++;
  if (/[^A-Za-z0-9]/.test(pw))  s++;
  const levels = [
    { labelAr: 'ضعيفة جداً', labelEn: 'Very weak',   color: 'bg-red-500'     },
    { labelAr: 'ضعيفة',      labelEn: 'Weak',         color: 'bg-orange-500'  },
    { labelAr: 'متوسطة',     labelEn: 'Fair',         color: 'bg-yellow-500'  },
    { labelAr: 'جيدة',       labelEn: 'Good',         color: 'bg-emerald-400' },
    { labelAr: 'قوية جداً',  labelEn: 'Very strong',  color: 'bg-emerald-600' },
  ];
  return { score: s, ...levels[Math.min(s, 4)] };
}

// ── Shared input ──────────────────────────────────────────────────────────────
function NameInput({
  placeholder, invalid, spinning, inputRef, ...rest
}: {
  placeholder?: string;
  invalid?: boolean;
  spinning?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <input
        ref={inputRef}
        placeholder={placeholder}
        className={cn(
          'w-full h-10 rounded-lg border px-3 pe-8 text-sm bg-white dark:bg-neutral-800 text-gray-900 dark:text-gray-100',
          'focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent transition-all',
          invalid
            ? 'border-red-400 dark:border-red-500'
            : 'border-gray-200 dark:border-neutral-600',
        )}
        {...rest}
      />
      {spinning && (
        <Loader2 className="absolute end-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-primary-500 animate-spin pointer-events-none" />
      )}
    </div>
  );
}

// ── Success ───────────────────────────────────────────────────────────────────
function SuccessCard({ nameEn, email, role, t, onAnother, onGoSettings }: {
  nameEn: string; email: string; role: string;
  t: (ar: string, en: string) => string;
  onAnother: () => void; onGoSettings: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-6 py-6 text-center">
      <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
        <Check className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
      </div>
      <div>
        <h3 className="text-lg font-display font-bold text-gray-900 dark:text-gray-100 mb-1">
          {t('تم إنشاء الحساب', 'Account created')}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs mx-auto">
          {t(`أُضيف ${nameEn} (${email}) بدور "${role}" بنجاح.`, `${nameEn} (${email}) was added as ${role}.`)}
        </p>
      </div>
      <div className="flex gap-3 w-full">
        <Button className="flex-1" onClick={onGoSettings}>{t('إدارة المستخدمين', 'Manage Users')}</Button>
        <Button variant="outline" className="flex-1" onClick={onAnother}>{t('إضافة آخر', 'Add Another')}</Button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function RegisterPage() {
  const { lang, t } = useLang();
  const { user }    = useAuth();
  const router      = useRouter();
  const { translate } = useTranslateName();

  // Track which specific field is being auto-translated (to show the right spinner)
  const [spinning, setSpinning] = useState<string | null>(null);

  const [showPass, setShowPass]       = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [role, setRole]               = useState<Role>('receptionist');
  const [done, setDone]               = useState<{ nameEn: string; email: string; role: string } | null>(null);

  // Refs so auto-translate callbacks always read the latest lang value
  const langRef = useRef(lang);
  useEffect(() => { langRef.current = lang; }, [lang]);

  useEffect(() => {
    if (user && user.role !== 'admin') router.replace('/');
  }, [user, router]);

  const {
    register, handleSubmit, watch, getValues, setValue, reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { role: 'receptionist' },
  });

  useEffect(() => { setValue('role', role); }, [role, setValue]);

  const pw       = watch('password', '');
  const strength = pw ? pwStrength(pw) : null;

  // ── Auto-translate helper ────────────────────────────────────────────────────
  // sourceField: RHF field name we read from
  // targetField: RHF field name we write to
  // from: source language
  async function autoTranslate(
    sourceField: keyof FormValues,
    targetField: keyof FormValues,
    from: 'en' | 'ar',
  ) {
    const value  = getValues(sourceField) as string;
    const target = getValues(targetField) as string | undefined;
    if (!value?.trim() || target?.trim()) return; // skip if source empty or target already filled

    setSpinning(targetField);
    try {
      const result = await translate(value.trim(), from);
      if (result) setValue(targetField, result, { shouldValidate: false });
    } finally {
      setSpinning(null);
    }
  }

  // ── Build onBlur for a name field ────────────────────────────────────────────
  // Translates EN→AR when page is English, AR→EN when page is Arabic.
  function nameBlur(
    enField: 'firstNameEn' | 'lastNameEn',
    arField: 'firstNameAr' | 'lastNameAr',
  ) {
    return () => {
      if (langRef.current === 'en') {
        void autoTranslate(enField, arField, 'en');
      } else {
        void autoTranslate(arField, enField, 'ar');
      }
    };
  }

  // ── Submission ───────────────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: async (data: FormValues) => {
      const nameEn = `${data.firstNameEn} ${data.lastNameEn}`.trim();
      const arParts = [data.firstNameAr, data.lastNameAr].filter(Boolean);
      const nameAr  = arParts.length ? arParts.join(' ') : undefined;

      await identityApi.post('/users', {
        email: data.email, password: data.password,
        nameEn, nameAr, role: data.role, branchId: 1,
      });
      return { nameEn, email: data.email, role: data.role };
    },
    onSuccess: (res) => setDone(res),
  });

  function resetForm() {
    setDone(null);
    setRole('receptionist');
    mutation.reset();
    reset();
  }

  if (user?.role !== 'admin') return null;

  const isAr = lang === 'ar';

  return (
    <div className="min-h-full flex items-center justify-center p-4" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="w-full max-w-xl">
        <div className="fc-card p-8">

          {/* Card header */}
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                <UserPlus className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              </div>
              <div>
                <h2 className="text-lg font-display font-bold text-gray-900 dark:text-gray-100 leading-tight">
                  {t('تسجيل موظف جديد', 'Register New Staff')}
                </h2>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {t('إنشاء حساب دخول للنظام', 'Create a system login account')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => router.push('/settings')}
              className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            >
              {isAr ? <ArrowRight className="w-3.5 h-3.5" /> : <ArrowLeft className="w-3.5 h-3.5" />}
              {t('رجوع', 'Back')}
            </button>
          </div>

          <div className="border-t border-gray-100 dark:border-neutral-700 mb-6" />

          {done ? (
            <SuccessCard
              {...done} t={t}
              onAnother={resetForm}
              onGoSettings={() => router.push('/settings')}
            />
          ) : (
            <form onSubmit={(e) => void handleSubmit((d) => mutation.mutateAsync(d))(e)} noValidate className="space-y-5">

              {/* ── Name section ─────────────────────────────────────── */}
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  {t('الاسم', 'Name')}
                  <span className="ms-1.5 text-[11px] font-normal text-gray-400">
                    {isAr
                      ? '— اكتب بالعربي، يُترجَم تلقائياً للإنجليزي'
                      : '— type in English, Arabic auto-fills'}
                  </span>
                </p>

                {/* Column headers */}
                <div className="grid grid-cols-2 gap-3 mb-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 ps-1">
                    English
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 ps-1">
                    عربي
                  </span>
                </div>

                {/* First name row */}
                <div className="grid grid-cols-2 gap-3 mb-2">
                  <div>
                    <NameInput
                      placeholder={isAr ? 'First name' : 'First name'}
                      invalid={!!errors.firstNameEn}
                      spinning={spinning === 'firstNameEn'}
                      {...register('firstNameEn')}
                      onBlur={nameBlur('firstNameEn', 'firstNameAr')}
                    />
                    {errors.firstNameEn && (
                      <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1">
                        <Info className="w-3 h-3 flex-shrink-0" />{errors.firstNameEn.message}
                      </p>
                    )}
                  </div>
                  <div>
                    <NameInput
                      placeholder="الاسم الأول"
                      spinning={spinning === 'firstNameAr'}
                      {...register('firstNameAr')}
                      onBlur={nameBlur('firstNameEn', 'firstNameAr')}
                    />
                  </div>
                </div>

                {/* Last name row */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <NameInput
                      placeholder="Last name"
                      invalid={!!errors.lastNameEn}
                      spinning={spinning === 'lastNameEn'}
                      {...register('lastNameEn')}
                      onBlur={nameBlur('lastNameEn', 'lastNameAr')}
                    />
                    {errors.lastNameEn && (
                      <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1">
                        <Info className="w-3 h-3 flex-shrink-0" />{errors.lastNameEn.message}
                      </p>
                    )}
                  </div>
                  <div>
                    <NameInput
                      placeholder="اسم العائلة"
                      spinning={spinning === 'lastNameAr'}
                      {...register('lastNameAr')}
                      onBlur={nameBlur('lastNameEn', 'lastNameAr')}
                    />
                  </div>
                </div>
              </div>

              {/* ── Email ────────────────────────────────────────────── */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('البريد الإلكتروني', 'Email Address')}
                </label>
                <div className="relative">
                  <Mail className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type="email" autoComplete="off"
                    placeholder="staff@fadlclinic.com"
                    className={cn(
                      'w-full h-11 rounded-lg border ps-10 pe-4 text-sm bg-white dark:bg-neutral-800 text-gray-900 dark:text-gray-100',
                      'focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent transition-all',
                      errors.email ? 'border-red-400 dark:border-red-500' : 'border-gray-200 dark:border-neutral-600',
                    )}
                    {...register('email')}
                  />
                </div>
                {errors.email && (
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <Info className="w-3 h-3 flex-shrink-0" />{errors.email.message}
                  </p>
                )}
              </div>

              {/* ── Passwords ────────────────────────────────────────── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                {/* Password */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('كلمة المرور', 'Password')}
                  </label>
                  <div className="relative">
                    <Lock className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input
                      type={showPass ? 'text' : 'password'}
                      placeholder="••••••••" autoComplete="new-password"
                      className={cn(
                        'w-full h-11 rounded-lg border ps-10 pe-11 text-sm bg-white dark:bg-neutral-800 text-gray-900 dark:text-gray-100',
                        'focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent transition-all',
                        errors.password ? 'border-red-400 dark:border-red-500' : 'border-gray-200 dark:border-neutral-600',
                      )}
                      {...register('password')}
                    />
                    <button type="button" onClick={() => setShowPass((s) => !s)}
                      className="absolute inset-y-0 end-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {strength && (
                    <div className="space-y-1">
                      <div className="flex gap-1">
                        {[1,2,3,4,5].map((i) => (
                          <div key={i} className={cn('h-1 flex-1 rounded-full transition-all', i <= strength.score ? strength.color : 'bg-gray-200 dark:bg-neutral-700')} />
                        ))}
                      </div>
                      <p className="text-[11px] text-gray-400">{isAr ? strength.labelAr : strength.labelEn}</p>
                    </div>
                  )}
                  {errors.password && (
                    <p className="text-xs text-red-500 flex items-center gap-1">
                      <Info className="w-3 h-3 flex-shrink-0" />{errors.password.message}
                    </p>
                  )}
                </div>

                {/* Confirm */}
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('تأكيد كلمة المرور', 'Confirm Password')}
                  </label>
                  <div className="relative">
                    <Lock className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input
                      type={showConfirm ? 'text' : 'password'}
                      placeholder="••••••••" autoComplete="new-password"
                      className={cn(
                        'w-full h-11 rounded-lg border ps-10 pe-11 text-sm bg-white dark:bg-neutral-800 text-gray-900 dark:text-gray-100',
                        'focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent transition-all',
                        errors.confirm ? 'border-red-400 dark:border-red-500' : 'border-gray-200 dark:border-neutral-600',
                      )}
                      {...register('confirm')}
                    />
                    <button type="button" onClick={() => setShowConfirm((s) => !s)}
                      className="absolute inset-y-0 end-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {errors.confirm && (
                    <p className="text-xs text-red-500 flex items-center gap-1">
                      <Info className="w-3 h-3 flex-shrink-0" />{errors.confirm.message}
                    </p>
                  )}
                </div>
              </div>

              {/* ── Role ─────────────────────────────────────────────── */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('الدور الوظيفي', 'Role')}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {ROLE_OPTIONS.map(({ key, labelAr: rAr, labelEn: rEn, icon: Icon, descAr, descEn }) => (
                    <button
                      key={key} type="button" onClick={() => setRole(key)}
                      className={cn(
                        'flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-start transition-all duration-150',
                        'focus-visible:ring-2 focus-visible:ring-primary-600 focus:outline-none',
                        role === key
                          ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                          : 'border-gray-200 dark:border-neutral-700 hover:border-gray-300 dark:hover:border-neutral-600',
                      )}
                    >
                      <span className={cn(
                        'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors',
                        role === key
                          ? 'bg-primary-100 dark:bg-primary-800/40 text-primary-700 dark:text-primary-300'
                          : 'bg-gray-100 dark:bg-neutral-700 text-gray-500 dark:text-gray-400',
                      )}>
                        <Icon className="w-4 h-4" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className={cn(
                          'block text-sm font-medium',
                          role === key ? 'text-primary-700 dark:text-primary-300' : 'text-gray-800 dark:text-gray-200',
                        )}>
                          {isAr ? rAr : rEn}
                        </span>
                        <span className="block text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">
                          {isAr ? descAr : descEn}
                        </span>
                      </span>
                      {role === key && <Check className="w-4 h-4 text-primary-600 dark:text-primary-400 flex-shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── API error ─────────────────────────────────────────── */}
              {mutation.isError && (
                <div className="rounded-xl px-4 py-3 text-sm border flex items-center gap-2 bg-red-50 border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-800 dark:text-red-400">
                  <Info className="w-4 h-4 flex-shrink-0" />
                  {(mutation.error as { response?: { data?: { message?: string } } })?.response?.data?.message
                    ?? t('فشل إنشاء الحساب. تحقق من البيانات وحاول مجدداً.', 'Failed to create account. Check the details and try again.')}
                </div>
              )}

              {/* ── Actions ───────────────────────────────────────────── */}
              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  disabled={isSubmitting || mutation.isPending}
                  className={cn(
                    'flex-1 h-12 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2',
                    'bg-primary-600 hover:bg-primary-700 active:bg-primary-800 transition-all duration-150 shadow-md',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2',
                    'disabled:opacity-60 disabled:cursor-not-allowed',
                  )}
                >
                  {(isSubmitting || mutation.isPending)
                    ? <><Loader2 className="w-4 h-4 animate-spin" />{t('جارٍ الإنشاء...', 'Creating...')}</>
                    : <><UserPlus className="w-4 h-4" />{t('إنشاء الحساب', 'Create Account')}</>
                  }
                </button>
                <Button type="button" variant="outline" onClick={() => router.push('/settings')} className="px-6">
                  {t('إلغاء', 'Cancel')}
                </Button>
              </div>

              <p className="text-xs text-gray-400 dark:text-gray-500 flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                {t('يجب على الموظف تغيير كلمة المرور عند أول دخول.', 'Staff should change their password on first login.')}
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
