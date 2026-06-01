'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Eye, EyeOff, Globe, Mail, Lock,
  ShieldCheck, LineChart, Globe2, Moon, Sun,
  UserRound, Stethoscope, Shield, Banknote, Info, HeartPulse, ArrowRight, ArrowLeft,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLang } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { identityApi } from '@/lib/api';

const schema = z.object({
  email:    z.string().email(),
  password: z.string().min(6),
  remember: z.boolean().optional(),
});
type FormValues = z.infer<typeof schema>;

type Role = 'receptionist' | 'doctor' | 'admin' | 'finance';

const ROLE_OPTIONS: { key: Role; labelAr: string; labelEn: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'receptionist', labelAr: 'الاستقبال', labelEn: 'Receptionist', icon: UserRound },
  { key: 'doctor',       labelAr: 'طبيب',      labelEn: 'Doctor',       icon: Stethoscope },
  { key: 'admin',        labelAr: 'إدارة',     labelEn: 'Admin',        icon: Shield },
  { key: 'finance',      labelAr: 'المالية',   labelEn: 'Finance',      icon: Banknote },
];

const FEATURE_CHIPS = [
  { icon: ShieldCheck, labelAr: 'أمان متوافق',   labelEn: 'HIPAA-ready security' },
  { icon: LineChart,   labelAr: 'تحليلات لحظية', labelEn: 'Real-time analytics'  },
  { icon: Globe2,      labelAr: 'دعم عربي كامل', labelEn: 'Full RTL Arabic'      },
];

export default function LoginPage() {
  const { login }           = useAuth();
  const { lang, toggle, t } = useLang();
  const { theme, setTheme } = useTheme();
  const router              = useRouter();

  const [showPass, setShowPass]           = useState(false);
  const [error, setError]                 = useState('');
  const [mounted, setMounted]             = useState(false);
  const [shakeKey, setShakeKey]           = useState(0);
  const [role, setRole]                   = useState<Role>('receptionist');
  const [forgotClicked, setForgotClicked] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: FormValues) {
    setError('');
    try {
      const res = await identityApi.post<{
        data: { accessToken: string; refreshToken: string; user: Parameters<typeof login>[1] };
      }>('/auth/login', { email: data.email, password: data.password });

      const returnedRole = res.data.data.user.role;
      if (returnedRole !== role) {
        setError(
          t(
            `هذا الحساب مسجّل كـ "${returnedRole}" وليس كـ "${role}". اختر الدور الصحيح.`,
            `This account is registered as "${returnedRole}", not "${role}". Please select the correct role.`,
          ),
        );
        setShakeKey((k) => k + 1);
        return;
      }

      localStorage.setItem('fadl_refresh_token', res.data.data.refreshToken);
      login(res.data.data.accessToken, res.data.data.user);
      router.replace('/');
    } catch {
      setError(t('البريد الإلكتروني أو كلمة المرور غير صحيحة', 'Invalid email or password'));
      setShakeKey((k) => k + 1);
    }
  }

  // Dark logo (white text) for dark/high-contrast themes; light logo otherwise
  const isDarkTheme = theme === 'dark' || theme === 'high-contrast';

  return (
    <div className="min-h-screen flex" dir={lang === 'ar' ? 'rtl' : 'ltr'}>

      {/* ── Left visual panel ─────────────────────────────────────────────── */}
      <div
        className="hidden lg:flex flex-col flex-1 relative overflow-hidden text-white p-12"
        style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1E1B2E 40%, #450A0A 100%)' }}
      >
        {/* Grid + radial glows */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              `radial-gradient(circle at 25% 15%, rgba(183,28,28,0.25), transparent 50%),
               radial-gradient(circle at 75% 90%, rgba(14,165,233,0.15), transparent 50%),
               linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
               linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)`,
            backgroundSize: 'auto, auto, 32px 32px, 32px 32px',
          }}
        />

        {/* Logo card */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="rounded-xl overflow-hidden shadow-lg">
            <img src="/images/fadiclinic_dark.png" alt="Fadl Clinic" className="h-10 w-auto object-contain block" />
          </div>
        </div>

        {/* Headline */}
        <div className="relative z-10 mt-12 max-w-md">
          <h1 className="text-[44px] leading-[1.05] font-display font-bold tracking-tight">
            {t('القلب الهادئ', 'The calm, capable heart')}
            <br />
            <span className="text-primary-400">{t('الذي تستحقه عيادتك.', 'of every clinic.')}</span>
          </h1>
          <p className="mt-5 text-slate-300 text-sm leading-relaxed">
            {t(
              'منصة واحدة للمرضى والمواعيد والزيارات والمالية — ثنائية اللغة عربي وإنجليزي، مبنية بالطريقة التي تعمل بها عيادات مصر فعلاً.',
              'One platform for patients, appointments, encounters & finance — bilingual Arabic & English, built for the way Egyptian clinics actually work.',
            )}
          </p>
        </div>

        {/* Hero image card with floating stat badges */}
        <div className="relative z-10 mt-10 mb-8 rounded-2xl overflow-hidden shadow-xl ring-1 ring-white/10">
          <Image
            src="/images/login-hero.jpg"
            alt="Fadl Clinic"
            width={800}
            height={360}
            className="block w-full object-cover"
            style={{ height: '360px', objectPosition: 'center' }}
          />

          {/* Top-end stat badge */}
          <div className="absolute top-4 end-4 flex items-center gap-2.5 bg-white/95 backdrop-blur-sm rounded-2xl px-3 py-2 shadow-lg">
            <div className="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center">
              <HeartPulse className="w-4 h-4 text-primary-600" />
            </div>
            <div>
              <p className="font-display font-bold text-gray-900 text-sm tabular-nums">1,548</p>
              <p className="text-[10px] text-gray-500 -mt-0.5">{t('مريض نعتني به', 'Patients cared for')}</p>
            </div>
          </div>

          {/* Bottom-start stat badge */}
          <div className="absolute bottom-16 start-4 flex items-center gap-2.5 bg-white/95 backdrop-blur-sm rounded-2xl px-3 py-2 shadow-lg">
            <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center">
              <Stethoscope className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <p className="font-display font-bold text-gray-900 text-sm tabular-nums">27</p>
              <p className="text-[10px] text-gray-500 -mt-0.5">{t('طبيب نشط', 'Active doctors')}</p>
            </div>
          </div>

          {/* Bottom caption */}
          <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/85 via-black/40 to-transparent pointer-events-none">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="font-display font-bold text-white text-lg">{t('تجربة المريض أولاً', 'A patient-first experience')}</p>
                <p className="text-white/70 text-xs mt-0.5">{t('ثنائية اللغة. سهلة الوصول. هادئة بحكم التصميم.', 'Bilingual, accessible, calm by design.')}</p>
              </div>
              <div className="flex items-center gap-1 mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
                <span className="w-4 h-1.5 rounded-full bg-white" />
                <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
              </div>
            </div>
          </div>
        </div>

        {/* Feature chips */}
        <div className="relative z-10 flex items-center gap-2 flex-wrap mt-auto">
          {FEATURE_CHIPS.map(({ icon: Icon, labelAr, labelEn }) => (
            <span
              key={labelEn}
              className="inline-flex items-center gap-2 px-3 h-9 rounded-full border border-white/10 text-xs text-white/90 backdrop-blur-sm"
              style={{ background: 'rgba(255,255,255,0.08)' }}
            >
              <span className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.10)' }}>
                <Icon className="w-3 h-3 text-primary-400" />
              </span>
              {t(labelAr, labelEn)}
            </span>
          ))}
        </div>

        {/* Footer */}
        <div className="relative z-10 mt-8 pt-5 border-t border-white/10 flex items-center justify-between text-[11px] text-white/40">
          <span>{t('© ٢٠٢٦ فضل كلينك. جميع الحقوق محفوظة.', '© 2026 Fadl Clinic. All rights reserved.')}</span>
          <span className="font-mono">v1.0.0</span>
        </div>
      </div>

      {/* ── Right form panel ──────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col bg-[var(--color-bg)]">
        <header className="flex items-center justify-end gap-2 p-6">
          {/* Mobile logo — swaps based on current theme */}
          <img
            src={isDarkTheme ? '/images/fadiclinic_transparent.png' : '/images/fadiclinic_light.jpeg'}
            alt="Fadl Clinic"
            className="h-7 w-auto object-contain me-auto lg:hidden"
            style={isDarkTheme ? undefined : { mixBlendMode: 'multiply' }}
          />

          {/* Language toggle */}
          <button
            onClick={toggle}
            className="h-10 px-3.5 rounded-full bg-[var(--color-bg-elevated)] border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card)] transition flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus:outline-none"
          >
            <Globe className="w-4 h-4" />
            {lang === 'ar' ? 'English' : 'عربي'}
          </button>

          {/* Theme toggle */}
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="h-10 w-10 rounded-full bg-[var(--color-bg-elevated)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card)] transition focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus:outline-none"
            aria-label={theme === 'dark' ? t('وضع النهار', 'Light mode') : t('وضع الليل', 'Dark mode')}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </button>
        </header>

        <main className="flex-1 flex items-center justify-center p-6">
          <div
            className={cn(
              'w-full max-w-md transition-all duration-700 ease-out',
              mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6',
            )}
          >
            <h1 className="text-3xl font-display font-bold mb-2 text-[var(--color-text-primary)]">
              {t('مرحباً بعودتك', 'Welcome back')}
            </h1>
            <p className="text-sm mb-8 text-[var(--color-text-secondary)]">
              {t('سجّل دخولك للوصول إلى حسابك.', 'Sign in to your account to continue.')}
            </p>

            <form
              key={shakeKey}
              onSubmit={(e) => void handleSubmit(onSubmit)(e)}
              className={cn('space-y-4', error && 'animate-shake')}
              noValidate
            >
              {/* Email */}
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm font-medium text-[var(--color-text-secondary)]">
                  {t('البريد الإلكتروني', 'Email address')}
                </label>
                <div className="relative">
                  <Mail className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)] pointer-events-none" />
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="admin@fadlclinic.com"
                    className={cn(
                      'w-full h-11 rounded-lg border ps-10 pe-4 text-sm bg-[var(--color-bg-input)] text-[var(--color-text-primary)]',
                      'focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent transition-all duration-200',
                      errors.email ? 'border-red-400' : 'border-[var(--color-border)]',
                    )}
                    {...register('email')}
                  />
                </div>
                {errors.email && (
                  <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                    <Info className="w-3 h-3" /> {errors.email.message}
                  </p>
                )}
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="text-sm font-medium text-[var(--color-text-secondary)]">
                    {t('كلمة المرور', 'Password')}
                  </label>
                  <button
                    type="button"
                    className="text-xs font-semibold text-primary-700 hover:text-primary-600 transition-colors"
                    onClick={() => setForgotClicked((v) => !v)}
                  >
                    {t('نسيتها؟', 'Forgot?')}
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)] pointer-events-none" />
                  <input
                    id="password"
                    type={showPass ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className={cn(
                      'w-full h-11 rounded-lg border ps-10 pe-11 text-sm bg-[var(--color-bg-input)] text-[var(--color-text-primary)]',
                      'focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent transition-all duration-200',
                      errors.password ? 'border-red-400' : 'border-[var(--color-border)]',
                    )}
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((s) => !s)}
                    className="absolute inset-y-0 end-3 flex items-center text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                    <Info className="w-3 h-3" /> {errors.password.message}
                  </p>
                )}
              </div>

              {/* Remember me */}
              <label className="flex items-center gap-2.5 text-sm text-[var(--color-text-secondary)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-[var(--color-border-strong)] text-primary-600 focus:ring-primary-600"
                  {...register('remember')}
                />
                {t('تذكّرني على هذا الجهاز', 'Remember me on this device')}
              </label>

              {/* Role chip selector */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)] mb-2">
                  {t('ادخل بدور', 'Sign in as')}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {ROLE_OPTIONS.map(({ key, labelAr, labelEn, icon: Icon }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setRole(key)}
                      className={cn(
                        'flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl border text-xs font-medium transition-all duration-150 focus-visible:ring-2 focus-visible:ring-primary-600 focus:outline-none',
                        role === key
                          ? 'border-primary-600 bg-primary-50 text-primary-700 shadow-glow-primary'
                          : 'border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)]',
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      {lang === 'ar' ? labelAr : labelEn}
                    </button>
                  ))}
                </div>
              </div>

              {/* Forgot password notice */}
              {forgotClicked && (
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 py-3 text-sm flex items-start gap-2.5 text-[var(--color-text-secondary)]">
                  <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-[var(--color-text-tertiary)]" />
                  <span>
                    {t(
                      'إعادة تعيين كلمة المرور تتم عبر مسؤول النظام فقط. تواصل مع مدير العيادة للمساعدة.',
                      'Password resets are managed by the system administrator only. Contact your clinic admin for assistance.',
                    )}
                  </span>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="rounded-xl px-4 py-3 text-sm border flex items-center gap-2 bg-red-50 border-red-200 text-red-700">
                  <Info className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={isSubmitting}
                className={cn(
                  'w-full h-12 rounded-xl text-white font-semibold text-sm',
                  'bg-primary-600 hover:bg-primary-700 active:bg-primary-800',
                  'transition-all duration-150 shadow-md hover:shadow-lg',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2',
                  'disabled:opacity-60 disabled:cursor-not-allowed',
                  'flex items-center justify-center gap-2',
                )}
              >
                {isSubmitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    {t('جارٍ الدخول...', 'Signing in...')}
                  </>
                ) : (
                  <>
                    {t('تسجيل الدخول', 'Sign in')}
                    {lang === 'ar' ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                  </>
                )}
              </button>

              {/* Divider */}
              <div className="relative my-1">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[var(--color-border)]" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-[var(--color-bg)] px-3 text-[10px] font-semibold tracking-widest uppercase text-[var(--color-text-tertiary)]">
                    {t('أو', 'OR')}
                  </span>
                </div>
              </div>

              {/* Demo account chip */}
              <div className="rounded-xl border border-primary-200 bg-primary-50/40 p-4">
                <p className="text-xs font-semibold text-primary-700 flex items-center gap-1.5 mb-2">
                  <Info className="w-3.5 h-3.5" />
                  {t('حساب تجريبي', 'Demo account')}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs px-2 py-1 rounded-md bg-[var(--color-bg-elevated)] border border-[var(--color-border)] text-[var(--color-text-primary)]" dir="ltr">
                    admin@fadlclinic.com
                  </span>
                  <span className="font-mono text-xs px-2 py-1 rounded-md bg-[var(--color-bg-elevated)] border border-[var(--color-border)] text-[var(--color-text-primary)]" dir="ltr">
                    Admin@123
                  </span>
                </div>
              </div>
            </form>
          </div>
        </main>

        <footer className="pb-6 text-center">
          <p className="text-xs text-[var(--color-text-tertiary)]">
            {t('فضل كلينك © ٢٠٢٦، جميع الحقوق محفوظة', '© 2026 Fadl Clinic. All rights reserved.')}
            {' · '}
            <span className="font-mono" dir="ltr">v1.0.0</span>
          </p>
        </footer>
      </div>
    </div>
  );
}
