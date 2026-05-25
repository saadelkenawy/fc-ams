'use client';

import { useState, useEffect } from 'react';
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

// ── Zod schema ────────────────────────────────────────────────────────────────
const schema = z.object({
  nameEn:   z.string().min(2,  'Name must be at least 2 characters'),
  nameAr:   z.string().optional(),
  email:    z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirm:  z.string(),
  role:     z.enum(['admin', 'finance', 'doctor', 'receptionist', 'procurement']),
}).refine((d) => d.password === d.confirm, {
  message: 'Passwords do not match',
  path: ['confirm'],
});

type FormValues = z.infer<typeof schema>;

type Role = 'admin' | 'finance' | 'doctor' | 'receptionist' | 'procurement';

const ROLE_OPTIONS: {
  key: Role;
  labelAr: string;
  labelEn: string;
  icon: React.ComponentType<{ className?: string }>;
  descAr: string;
  descEn: string;
}[] = [
  {
    key: 'receptionist',
    labelAr: 'موظف استقبال',
    labelEn: 'Receptionist',
    icon: UserRound,
    descAr: 'إدارة المواعيد والمرضى',
    descEn: 'Manage appointments & patients',
  },
  {
    key: 'doctor',
    labelAr: 'طبيب',
    labelEn: 'Doctor',
    icon: Stethoscope,
    descAr: 'الوصول للحالات السريرية والجداول',
    descEn: 'Access encounters & schedules',
  },
  {
    key: 'admin',
    labelAr: 'مسؤول النظام',
    labelEn: 'Admin',
    icon: Shield,
    descAr: 'صلاحيات كاملة على النظام',
    descEn: 'Full system access',
  },
  {
    key: 'finance',
    labelAr: 'مالية',
    labelEn: 'Finance',
    icon: Banknote,
    descAr: 'الفواتير والتسويات والتقارير',
    descEn: 'Billing, settlements & reports',
  },
  {
    key: 'procurement',
    labelAr: 'مشتريات',
    labelEn: 'Procurement',
    icon: Package,
    descAr: 'كتالوج المشتريات والموردون',
    descEn: 'Procurement catalog & vendors',
  },
];

// ── Password strength meter ───────────────────────────────────────────────────
function passwordStrength(pw: string): { score: number; labelAr: string; labelEn: string; color: string } {
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  if (score <= 1) return { score, labelAr: 'ضعيفة جداً', labelEn: 'Very weak',  color: 'bg-red-500' };
  if (score === 2) return { score, labelAr: 'ضعيفة',      labelEn: 'Weak',       color: 'bg-orange-500' };
  if (score === 3) return { score, labelAr: 'متوسطة',     labelEn: 'Fair',       color: 'bg-yellow-500' };
  if (score === 4) return { score, labelAr: 'جيدة',       labelEn: 'Good',       color: 'bg-emerald-400' };
  return                  { score, labelAr: 'قوية جداً',  labelEn: 'Very strong', color: 'bg-emerald-600' };
}

// ── Field wrapper ─────────────────────────────────────────────────────────────
function Field({ label, labelAr, lang, error, children }: {
  label: string;
  labelAr: string;
  lang: 'ar' | 'en';
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        {lang === 'ar' ? labelAr : label}
      </label>
      {children}
      {error && (
        <p className="text-xs text-red-500 flex items-center gap-1">
          <Info className="w-3 h-3 flex-shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

// ── Text input ────────────────────────────────────────────────────────────────
function TextInput({
  icon: Icon,
  invalid,
  type = 'text',
  placeholder,
  suffix,
  ...rest
}: {
  icon?: React.ComponentType<{ className?: string }>;
  invalid?: boolean;
  type?: string;
  placeholder?: string;
  suffix?: React.ReactNode;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      {Icon && (
        <Icon className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
      )}
      <input
        type={type}
        placeholder={placeholder}
        className={cn(
          'w-full h-11 rounded-lg border text-sm bg-white dark:bg-neutral-800 text-gray-900 dark:text-gray-100',
          'focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent transition-all duration-200',
          Icon ? 'ps-10' : 'ps-4',
          suffix ? 'pe-11' : 'pe-4',
          invalid
            ? 'border-red-400 dark:border-red-500'
            : 'border-gray-200 dark:border-neutral-600',
        )}
        {...rest}
      />
      {suffix && (
        <div className="absolute inset-y-0 end-0 flex items-center pe-3">
          {suffix}
        </div>
      )}
    </div>
  );
}

// ── Success state ─────────────────────────────────────────────────────────────
function SuccessCard({
  nameEn, email, role, t, lang, onAnother, onGoToSettings,
}: {
  nameEn: string;
  email: string;
  role: string;
  t: (ar: string, en: string) => string;
  lang: 'ar' | 'en';
  onAnother: () => void;
  onGoToSettings: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-6 py-8 text-center">
      <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
        <Check className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
      </div>
      <div>
        <h3 className="text-xl font-display font-bold text-gray-900 dark:text-gray-100 mb-1">
          {t('تم إنشاء الحساب بنجاح', 'Account created successfully')}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t(`تم إضافة ${nameEn} (${email}) بدور "${role}"`, `${nameEn} (${email}) has been added as ${role}.`)}
        </p>
      </div>
      <div className="flex gap-3 w-full max-w-xs">
        <Button className="flex-1" onClick={onGoToSettings}>
          {t('إدارة المستخدمين', 'Manage Users')}
        </Button>
        <Button variant="outline" className="flex-1" onClick={onAnother}>
          {t('إضافة آخر', 'Add Another')}
        </Button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function RegisterPage() {
  const { lang, t } = useLang();
  const { user }    = useAuth();
  const router      = useRouter();
  const { translate, translating } = useTranslateName();

  const [showPass, setShowPass]       = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [nameAr, setNameAr]           = useState('');
  const [role, setRole]               = useState<Role>('receptionist');
  const [submitted, setSubmitted]     = useState<{ nameEn: string; email: string; role: string } | null>(null);

  // Admin guard
  useEffect(() => {
    if (user && user.role !== 'admin') router.replace('/');
  }, [user, router]);

  const {
    register,
    handleSubmit,
    watch,
    getValues,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { role: 'receptionist' },
  });

  // Keep role in sync with chip state
  useEffect(() => {
    setValue('role', role);
  }, [role, setValue]);

  const passwordValue = watch('password', '');
  const strength      = passwordValue ? passwordStrength(passwordValue) : null;

  const mutation = useMutation({
    mutationFn: async (data: FormValues) => {
      await identityApi.post('/users', {
        email:    data.email,
        password: data.password,
        nameEn:   data.nameEn,
        nameAr:   nameAr || undefined,
        role:     data.role,
        branchId: 1,
      });
      return { nameEn: data.nameEn, email: data.email, role: data.role };
    },
    onSuccess: (result) => {
      setSubmitted(result);
    },
  });

  function onAnother() {
    setSubmitted(null);
    setNameAr('');
    setRole('receptionist');
    reset();
  }

  async function onSubmit(data: FormValues) {
    await mutation.mutateAsync(data);
  }

  if (user?.role !== 'admin') return null;

  return (
    <div className="fc-page">
      {/* Page header */}
      <div className="fc-page-head">
        <div>
          <h2 className="fc-page-title">{t('تسجيل موظف جديد', 'Register New Staff')}</h2>
          <p className="fc-page-sub">
            {t('إنشاء حساب نظام لموظف جديد في العيادة', 'Create a system account for a new clinic staff member')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push('/settings?section=users')}
          className="fc-btn fc-btn-sm fc-btn-outline gap-1.5"
        >
          {lang === 'ar' ? <ArrowRight className="w-3.5 h-3.5" /> : <ArrowLeft className="w-3.5 h-3.5" />}
          {t('المستخدمون', 'Users')}
        </button>
      </div>

      <div className="max-w-2xl">
        <div className="fc-card p-6">
          {submitted ? (
            <SuccessCard
              {...submitted}
              t={t}
              lang={lang}
              onAnother={onAnother}
              onGoToSettings={() => router.push('/settings?section=users')}
            />
          ) : (
            <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate className="space-y-5">

              {/* Name row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Name EN */}
                <Field label="Full Name (EN)" labelAr="الاسم الكامل (إنجليزي)" lang={lang} error={errors.nameEn?.message}>
                  <TextInput
                    icon={UserPlus}
                    placeholder="e.g. Ahmed Hassan"
                    invalid={!!errors.nameEn}
                    {...register('nameEn', {
                      onBlur: async (e: React.FocusEvent<HTMLInputElement>) => {
                        const v = e.target.value.trim();
                        if (lang === 'en' && v && !nameAr.trim()) {
                          const res = await translate(v, 'en');
                          if (res) setNameAr(res);
                        }
                      },
                    })}
                    suffix={translating === 'ar' ? <Loader2 className="w-4 h-4 text-primary-500 animate-spin" /> : undefined}
                  />
                </Field>

                {/* Name AR */}
                <Field label="Full Name (AR)" labelAr="الاسم الكامل (عربي)" lang={lang}>
                  <TextInput
                    placeholder="مثال: أحمد حسن"
                    value={nameAr}
                    onChange={(e) => setNameAr(e.target.value)}
                    onBlur={async (e) => {
                      const v = e.target.value.trim();
                      const en = getValues('nameEn').trim();
                      if (lang === 'ar' && v && !en) {
                        const res = await translate(v, 'ar');
                        if (res) setValue('nameEn', res);
                      }
                    }}
                    suffix={translating === 'en' ? <Loader2 className="w-4 h-4 text-primary-500 animate-spin" /> : undefined}
                  />
                </Field>
              </div>

              {/* Email */}
              <Field label="Email Address" labelAr="البريد الإلكتروني" lang={lang} error={errors.email?.message}>
                <TextInput
                  icon={Mail}
                  type="email"
                  placeholder="staff@fadlclinic.com"
                  autoComplete="off"
                  invalid={!!errors.email}
                  {...register('email')}
                />
              </Field>

              {/* Password */}
              <Field label="Initial Password" labelAr="كلمة المرور الأولية" lang={lang} error={errors.password?.message}>
                <TextInput
                  icon={Lock}
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  invalid={!!errors.password}
                  suffix={
                    <button
                      type="button"
                      onClick={() => setShowPass((s) => !s)}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    >
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  }
                  {...register('password')}
                />
                {/* Strength bar */}
                {strength && (
                  <div className="mt-2 space-y-1">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div
                          key={i}
                          className={cn(
                            'h-1 flex-1 rounded-full transition-all duration-300',
                            i <= strength.score ? strength.color : 'bg-gray-200 dark:bg-neutral-700',
                          )}
                        />
                      ))}
                    </div>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500">
                      {lang === 'ar' ? strength.labelAr : strength.labelEn}
                    </p>
                  </div>
                )}
              </Field>

              {/* Confirm password */}
              <Field label="Confirm Password" labelAr="تأكيد كلمة المرور" lang={lang} error={errors.confirm?.message}>
                <TextInput
                  icon={Lock}
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  invalid={!!errors.confirm}
                  suffix={
                    <button
                      type="button"
                      onClick={() => setShowConfirm((s) => !s)}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    >
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  }
                  {...register('confirm')}
                />
              </Field>

              {/* Role selector */}
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  {t('الدور الوظيفي', 'Role')}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {ROLE_OPTIONS.map(({ key, labelAr: rAr, labelEn: rEn, icon: Icon, descAr, descEn }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setRole(key)}
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
                          role === key
                            ? 'text-primary-700 dark:text-primary-300'
                            : 'text-gray-800 dark:text-gray-200',
                        )}>
                          {lang === 'ar' ? rAr : rEn}
                        </span>
                        <span className="block text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">
                          {lang === 'ar' ? descAr : descEn}
                        </span>
                      </span>
                      {role === key && (
                        <Check className="w-4 h-4 text-primary-600 dark:text-primary-400 flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* API error */}
              {mutation.isError && (
                <div className="rounded-xl px-4 py-3 text-sm border flex items-center gap-2 bg-red-50 border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-800 dark:text-red-400">
                  <Info className="w-4 h-4 flex-shrink-0" />
                  {(mutation.error as { response?: { data?: { message?: string } } })?.response?.data?.message
                    ?? t('فشل إنشاء الحساب. تأكد من البيانات وحاول مجدداً.', 'Failed to create account. Check the details and try again.')}
                </div>
              )}

              {/* Submit */}
              <div className="pt-2 flex gap-3">
                <button
                  type="submit"
                  disabled={isSubmitting || mutation.isPending}
                  className={cn(
                    'flex-1 h-12 rounded-xl text-white font-semibold text-sm',
                    'bg-primary-600 hover:bg-primary-700 active:bg-primary-800',
                    'transition-all duration-150 shadow-md hover:shadow-lg',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2',
                    'disabled:opacity-60 disabled:cursor-not-allowed',
                    'flex items-center justify-center gap-2',
                  )}
                >
                  {(isSubmitting || mutation.isPending) ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t('جاري الإنشاء...', 'Creating account...')}
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      {t('إنشاء الحساب', 'Create Account')}
                    </>
                  )}
                </button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push('/settings')}
                  className="px-5"
                >
                  {t('إلغاء', 'Cancel')}
                </Button>
              </div>

              {/* Info note */}
              <p className="text-xs text-gray-400 dark:text-gray-500 flex items-start gap-1.5 pt-1">
                <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                {t(
                  'ستُرسل بيانات الدخول للموظف عبر البريد الإلكتروني. يجب أن يغيّر كلمة المرور عند أول دخول.',
                  'Login credentials will be shared with the staff member. They should change their password on first login.',
                )}
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
