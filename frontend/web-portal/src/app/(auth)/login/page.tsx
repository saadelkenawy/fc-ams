'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  HeartPulse, Eye, EyeOff, Globe, Mail, Lock,
  ShieldCheck, Zap, BarChart3, Sun, Moon, Waves, Contrast,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLang } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { THEMES, THEME_ORDER } from '@/lib/theme.config';
import { cn } from '@/lib/utils';
import { identityApi } from '@/lib/api';

const schema = z.object({
  email:    z.string().email(),
  password: z.string().min(6),
  remember: z.boolean().optional(),
});
type FormValues = z.infer<typeof schema>;

const HERO_IMAGES = [
  '/images/medical-clinic.jpg',
  '/images/medical-team.jpg',
  '/images/medical-abstract.jpg',
  '/images/login-bg.jpg',
];

const FEATURE_PILLS = [
  { icon: ShieldCheck, labelAr: 'آمن ومشفر',    labelEn: 'Secure & Encrypted' },
  { icon: Zap,         labelAr: 'سريع وموثوق',   labelEn: 'Fast & Reliable' },
  { icon: BarChart3,   labelAr: 'تقارير متقدمة', labelEn: 'Advanced Reports' },
];

const THEME_ICONS = {
  light:          Sun,
  dark:           Moon,
  teal:           Waves,
  'high-contrast': Contrast,
};

export default function LoginPage() {
  const { login }                   = useAuth();
  const { lang, toggle, t }         = useLang();
  const { theme, setTheme }         = useTheme();
  const router                      = useRouter();
  const [showPass, setShowPass]     = useState(false);
  const [error, setError]           = useState('');
  const [mounted, setMounted]       = useState(false);
  const [heroIdx, setHeroIdx]       = useState(0);
  const [shakeKey, setShakeKey]     = useState(0);
  const [themePanelOpen, setThemePanelOpen] = useState(false);
  const themePanelRef               = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  // Cycle hero image every 12 s
  useEffect(() => {
    const id = setInterval(() => setHeroIdx((i) => (i + 1) % HERO_IMAGES.length), 12_000);
    return () => clearInterval(id);
  }, []);

  // Close theme panel on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (themePanelRef.current && !themePanelRef.current.contains(e.target as Node)) {
        setThemePanelOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: FormValues) {
    setError('');
    try {
      const res = await identityApi.post<{
        data: { accessToken: string; refreshToken: string; user: Parameters<typeof login>[1] };
      }>('/auth/login', { email: data.email, password: data.password });
      localStorage.setItem('fadl_refresh_token', res.data.data.refreshToken);
      login(res.data.data.accessToken, res.data.data.user);
      router.replace('/');
    } catch {
      setError(t('البريد الإلكتروني أو كلمة المرور غير صحيحة', 'Invalid email or password'));
      setShakeKey((k) => k + 1);
    }
  }

  const ThemeIcon = THEME_ICONS[theme];

  return (
    <div className="min-h-screen flex flex-col lg:flex-row" dir={lang === 'ar' ? 'rtl' : 'ltr'}>

      {/* ── Hero panel ─────────────────────────────────────────────────────── */}
      <div className="relative hidden lg:flex lg:w-[58%] min-h-screen flex-col overflow-hidden bg-blue-950">

        {/* Ken Burns image — crossfade via opacity on index change */}
        {HERO_IMAGES.map((src, i) => (
          <div
            key={src}
            className="absolute inset-0 transition-opacity duration-[2000ms] ease-in-out"
            style={{ opacity: i === heroIdx ? 1 : 0 }}
          >
            <Image
              src={src}
              alt=""
              fill
              priority={i === 0}
              className="object-cover animate-ken-burns"
              sizes="58vw"
            />
          </div>
        ))}

        {/* Gradient overlay — mesh animation */}
        <div
          className="absolute inset-0 animate-mesh"
          style={{
            background: 'linear-gradient(135deg,rgba(15,23,42,0.82) 0%,rgba(37,99,235,0.45) 40%,rgba(15,23,42,0.75) 100%)',
          }}
        />

        {/* Soft particle glow spots */}
        <div className="absolute top-1/4 start-1/4 w-72 h-72 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/3 end-1/4 w-56 h-56 rounded-full bg-cyan-400/10 blur-3xl pointer-events-none" />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center justify-center flex-1 px-14 text-center">
          {/* Logo */}
          <div className="w-20 h-20 rounded-3xl bg-white/10 backdrop-blur border border-white/20 flex items-center justify-center mb-6 shadow-2xl animate-float">
            <HeartPulse className="w-10 h-10 text-white drop-shadow" />
          </div>

          <h1 className="text-5xl font-black text-white font-display mb-3 tracking-tight drop-shadow-lg leading-tight">
            {t('فضل كلينك', 'Fadl Clinic')}
          </h1>

          <p className="text-white/75 text-xl font-medium mb-3 drop-shadow">
            {t('نظام إدارة العيادة المتكامل', 'Integrated Clinic Management System')}
          </p>
          <p className="text-white/50 text-sm mb-10 max-w-xs leading-relaxed">
            {t(
              'منصة سحابية متكاملة لإدارة المرضى، المواعيد، والتسويات المالية بكفاءة عالية',
              'A unified cloud platform for patients, appointments, and financial settlements.',
            )}
          </p>

          {/* Trust badges */}
          <div className="flex flex-wrap justify-center gap-3">
            {FEATURE_PILLS.map(({ icon: Icon, labelAr, labelEn }) => (
              <div
                key={labelEn}
                className="flex items-center gap-2 bg-white/10 backdrop-blur border border-white/20 rounded-full px-4 py-2 text-white text-sm font-medium hover:bg-white/15 transition-colors"
              >
                <Icon className="w-4 h-4 text-blue-300 flex-shrink-0" />
                {t(labelAr, labelEn)}
              </div>
            ))}
          </div>

          {/* Image dot indicator */}
          <div className="flex gap-2 mt-10">
            {HERO_IMAGES.map((_, i) => (
              <button
                key={i}
                onClick={() => setHeroIdx(i)}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-500',
                  i === heroIdx ? 'w-6 bg-white' : 'w-1.5 bg-white/30 hover:bg-white/50',
                )}
              />
            ))}
          </div>
        </div>

        <div className="relative z-10 pb-6 text-center">
          <p className="text-white/30 text-xs">{t('© ٢٠٢٦ فضل كلينك', '© 2026 Fadl Clinic')}</p>
        </div>
      </div>

      {/* ── Form panel ─────────────────────────────────────────────────────── */}
      <div
        className={cn(
          'flex-1 lg:w-[42%] flex flex-col items-center justify-center px-8 py-12 min-h-screen relative',
          'transition-all duration-700 ease-out',
          mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6',
        )}
        style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text-primary)' }}
      >

        {/* Top-right controls: lang + theme */}
        <div className="absolute top-5 end-5 flex items-center gap-2">
          {/* Language toggle */}
          <button
            onClick={toggle}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-all hover:scale-105"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }}
          >
            <Globe className="w-3.5 h-3.5" />
            {t('English', 'عربي')}
          </button>

          {/* Theme picker */}
          <div className="relative" ref={themePanelRef}>
            <button
              onClick={() => setThemePanelOpen((o) => !o)}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-all hover:scale-105"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }}
              title={t('تغيير المظهر', 'Change theme')}
            >
              <ThemeIcon className="w-3.5 h-3.5" />
            </button>
            {themePanelOpen && (
              <div
                className="absolute end-0 top-10 z-50 rounded-xl border shadow-xl p-2 w-44 animate-slide-down"
                style={{ backgroundColor: 'var(--color-bg-card)', borderColor: 'var(--color-border)' }}
              >
                {THEME_ORDER.map((tid) => {
                  const TIcon = THEME_ICONS[tid];
                  const tk = THEMES[tid];
                  return (
                    <button
                      key={tid}
                      onClick={() => { setTheme(tid); setThemePanelOpen(false); }}
                      className={cn(
                        'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all',
                        tid === theme
                          ? 'font-semibold'
                          : 'hover:opacity-80',
                      )}
                      style={{
                        backgroundColor: tid === theme ? 'var(--color-bg-elevated)' : 'transparent',
                        color: 'var(--color-text-primary)',
                      }}
                    >
                      <TIcon className="w-4 h-4 flex-shrink-0" />
                      {lang === 'ar' ? tk.labelAr : tk.labelEn}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex justify-center mb-8 lg:hidden">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg"
              style={{ background: `linear-gradient(135deg, var(--theme-primary-from, #2563EB), var(--theme-primary-to, #1D4ED8))` }}>
              <HeartPulse className="w-7 h-7 text-white" />
            </div>
          </div>

          {/* Desktop small logo */}
          <div className="hidden lg:flex justify-center mb-8">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center shadow-md"
              style={{ background: `linear-gradient(135deg, var(--theme-primary-from, #2563EB), var(--theme-primary-to, #1D4ED8))` }}
            >
              <HeartPulse className="w-6 h-6 text-white" />
            </div>
          </div>

          {/* Heading */}
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold font-display" style={{ color: 'var(--color-text-primary)' }}>
              {t('مرحباً بعودتك 👋', 'Welcome back 👋')}
            </h2>
            <p className="text-sm mt-1.5" style={{ color: 'var(--color-text-tertiary)' }}>
              {t('سجل دخولك للمتابعة', 'Sign in to your account to continue')}
            </p>
          </div>

          {/* Form */}
          <form
            key={shakeKey}
            onSubmit={(e) => void handleSubmit(onSubmit)(e)}
            className={cn('space-y-5', error && 'animate-shake')}
            noValidate
          >
            {/* Email */}
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                {t('البريد الإلكتروني', 'Email address')}
              </label>
              <div className="relative">
                <Mail className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--color-text-disabled)' }} />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="admin@fadlclinic.com"
                  className={cn(
                    'w-full h-12 rounded-xl border ps-10 pe-4 text-sm',
                    'focus:outline-none focus:ring-2 focus:border-transparent transition-all duration-200',
                    errors.email ? 'border-red-400 focus:ring-red-400' : 'focus:ring-[var(--theme-primary-from)]',
                  )}
                  style={{
                    backgroundColor: 'var(--color-bg-input)',
                    borderColor: errors.email ? undefined : 'var(--color-border)',
                    color: 'var(--color-text-primary)',
                  }}
                  {...register('email')}
                />
              </div>
              {errors.email && (
                <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                  <span>⚠</span> {errors.email.message}
                </p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                {t('كلمة المرور', 'Password')}
              </label>
              <div className="relative">
                <Lock className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--color-text-disabled)' }} />
                <input
                  id="password"
                  type={showPass ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className={cn(
                    'w-full h-12 rounded-xl border ps-10 pe-11 text-sm',
                    'focus:outline-none focus:ring-2 focus:border-transparent transition-all duration-200',
                    errors.password ? 'border-red-400 focus:ring-red-400' : 'focus:ring-[var(--theme-primary-from)]',
                  )}
                  style={{
                    backgroundColor: 'var(--color-bg-input)',
                    borderColor: errors.password ? undefined : 'var(--color-border)',
                    color: 'var(--color-text-primary)',
                  }}
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((s) => !s)}
                  className="absolute inset-y-0 end-3 flex items-center transition-colors hover:opacity-70"
                  style={{ color: 'var(--color-text-disabled)' }}
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                  <span>⚠</span> {errors.password.message}
                </p>
              )}
            </div>

            {/* Remember + Forgot */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none" style={{ color: 'var(--color-text-tertiary)' }}>
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded"
                  {...register('remember')}
                />
                {t('تذكرني', 'Remember me')}
              </label>
              <button
                type="button"
                className="text-sm font-medium transition-colors hover:underline"
                style={{ color: 'var(--theme-primary-from, #2563EB)' }}
              >
                {t('نسيت كلمة المرور؟', 'Forgot password?')}
              </button>
            </div>

            {/* Inline error */}
            {error && (
              <div className="rounded-xl px-4 py-3 text-sm border flex items-center gap-2 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400">
                <span className="text-base">⚠️</span>
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className={cn(
                'w-full h-12 rounded-xl text-white font-semibold text-sm',
                'hover:scale-[1.02] active:scale-[0.98]',
                'transition-all duration-150 shadow-md hover:shadow-lg',
                'focus:outline-none focus:ring-2 focus:ring-offset-2',
                'disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100',
                'flex items-center justify-center gap-2',
              )}
              style={{
                background: `linear-gradient(135deg, var(--theme-primary-from, #2563EB), var(--theme-primary-to, #1D4ED8))`,
              }}
            >
              {isSubmitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  {t('جاري الدخول...', 'Signing in...')}
                </>
              ) : (
                t('تسجيل الدخول', 'Sign in')
              )}
            </button>
          </form>

          {/* Demo credentials — styled chip */}
          <div
            className="mt-6 pt-5 border-t text-center"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <p className="text-xs mb-2" style={{ color: 'var(--color-text-disabled)' }}>
              {t('حساب تجريبي', 'Demo account')}
            </p>
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono"
              style={{
                backgroundColor: 'var(--color-bg-elevated)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-tertiary)',
              }}
            >
              <span dir="ltr">admin@fadlclinic.com</span>
              <span style={{ color: 'var(--color-border-strong)' }}>·</span>
              <span dir="ltr">Admin@123</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-auto pt-8 text-xs text-center" style={{ color: 'var(--color-text-disabled)' }}>
          {t('فضل كلينك © ٢٠٢٦ — جميع الحقوق محفوظة', '© 2026 Fadl Clinic — All rights reserved')}
          {' · '}
          <span className="font-mono" dir="ltr">v1.0.0</span>
        </p>
      </div>
    </div>
  );
}
