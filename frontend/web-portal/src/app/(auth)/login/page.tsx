'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { HeartPulse, Eye, EyeOff, Globe, Mail, Lock, ShieldCheck, Zap, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import { useLang } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';
import { identityApi } from '@/lib/api';

const schema = z.object({
  email:    z.string().email(),
  password: z.string().min(6),
});
type FormValues = z.infer<typeof schema>;

const HERO_IMAGE = 'https://images.unsplash.com/photo-1631217868264-e5b90bb7e133?w=2560&q=100';

const FEATURE_PILLS = [
  { icon: ShieldCheck, labelAr: 'آمن ومشفر',     labelEn: 'Secure & Encrypted' },
  { icon: Zap,         labelAr: 'سريع وموثوق',    labelEn: 'Fast & Reliable' },
  { icon: BarChart3,   labelAr: 'تقارير متقدمة',  labelEn: 'Advanced Reports' },
];

export default function LoginPage() {
  const { login }                                = useAuth();
  const { lang, toggle, t }                      = useLang();
  const router                                   = useRouter();
  const [showPass, setShowPass]                  = useState(false);
  const [error, setError]                        = useState('');
  const [mounted, setMounted]                    = useState(false);

  // Entrance animation trigger
  useEffect(() => { setMounted(true); }, []);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: FormValues) {
    setError('');
    try {
      const res = await identityApi.post<{
        data: {
          accessToken:  string;
          refreshToken: string;
          user:         Parameters<typeof login>[1];
        };
      }>('/auth/login', data);
      localStorage.setItem('fadl_refresh_token', res.data.data.refreshToken);
      login(res.data.data.accessToken, res.data.data.user);
      router.replace('/');
    } catch {
      setError(t('البريد الإلكتروني أو كلمة المرور غير صحيحة', 'Invalid email or password'));
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col lg:flex-row"
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
    >
      {/* ── Left / Top: Hero image panel ─────────────────────────────────── */}
      <div className="relative hidden lg:flex lg:w-[60%] min-h-screen flex-col">
        {/* Background image */}
        <Image
          src={HERO_IMAGE}
          alt="Fadl Clinic"
          fill
          priority
          className="object-cover"
          sizes="60vw"
        />

        {/* Dark overlay */}
        <div className="absolute inset-0 bg-black/55" />

        {/* Content over image */}
        <div className="relative z-10 flex flex-col items-center justify-center flex-1 px-12 text-center">
          {/* Logo icon */}
          <div className="w-20 h-20 rounded-3xl bg-white/15 backdrop-blur-sm border border-white/25 flex items-center justify-center mb-6 shadow-2xl">
            <HeartPulse className="w-10 h-10 text-white" />
          </div>

          {/* Clinic name */}
          <h1 className="text-5xl font-black text-white font-display mb-3 tracking-tight drop-shadow-lg">
            {t('فضل كلينك', 'Fadl Clinic')}
          </h1>

          {/* Subtitle */}
          <p className="text-white/80 text-lg font-medium mb-10 drop-shadow">
            {t('نظام إدارة العيادة المتكامل', 'Integrated Clinic Management System')}
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap justify-center gap-3">
            {FEATURE_PILLS.map(({ icon: Icon, labelAr, labelEn }) => (
              <div
                key={labelEn}
                className="flex items-center gap-2 bg-white/15 backdrop-blur-sm border border-white/25 rounded-full px-4 py-2 text-white text-sm font-medium"
              >
                <Icon className="w-4 h-4 text-blue-300" />
                {t(labelAr, labelEn)}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom attribution */}
        <div className="relative z-10 pb-6 text-center">
          <p className="text-white/40 text-xs">
            {t('© ٢٠٢٦ فضل كلينك', '© 2026 Fadl Clinic')}
          </p>
        </div>
      </div>

      {/* ── Right / Bottom: Form panel ────────────────────────────────────── */}
      <div className={cn(
        'flex-1 lg:w-[40%] bg-white dark:bg-neutral-950 flex flex-col items-center justify-center px-8 py-12 min-h-screen',
        'transition-all duration-700 ease-out',
        mounted
          ? 'opacity-100 translate-x-0'
          : lang === 'ar' ? '-translate-x-8 opacity-0' : 'translate-x-8 opacity-0',
      )}>
        {/* Language toggle */}
        <button
          onClick={toggle}
          className="absolute top-5 end-5 flex items-center gap-1.5 text-sm text-gray-400 hover:text-blue-600 transition-colors"
        >
          <Globe className="w-4 h-4" />
          {t('English', 'عربي')}
        </button>

        <div className="w-full max-w-sm">
          {/* Mobile logo (visible only on small screens) */}
          <div className="flex justify-center mb-8 lg:mb-0 lg:hidden">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center shadow-lg">
              <HeartPulse className="w-7 h-7 text-white" />
            </div>
          </div>

          {/* Small logo for desktop */}
          <div className="hidden lg:flex justify-center mb-8">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center shadow-md">
              <HeartPulse className="w-6 h-6 text-white" />
            </div>
          </div>

          {/* Heading */}
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 font-display">
              {t('مرحباً بعودتك 👋', 'Welcome back 👋')}
            </h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1.5">
              {t('سجل دخولك للمتابعة', 'Sign in to your account to continue')}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-5" noValidate>
            {/* Email field */}
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('البريد الإلكتروني', 'Email address')}
              </label>
              <div className="relative">
                <Mail className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder={t('admin@fadlclinic.com', 'admin@fadlclinic.com')}
                  className={cn(
                    'w-full h-12 rounded-xl border bg-white dark:bg-neutral-900',
                    'ps-10 pe-4 text-sm text-gray-900 dark:text-gray-100',
                    'placeholder:text-gray-400',
                    'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
                    'transition-all duration-150',
                    errors.email
                      ? 'border-red-400 focus:ring-red-400'
                      : 'border-gray-200 dark:border-neutral-700',
                  )}
                  {...register('email')}
                />
              </div>
              {errors.email && (
                <p className="text-xs text-red-500">{errors.email.message}</p>
              )}
            </div>

            {/* Password field */}
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('كلمة المرور', 'Password')}
              </label>
              <div className="relative">
                <Lock className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  id="password"
                  type={showPass ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className={cn(
                    'w-full h-12 rounded-xl border bg-white dark:bg-neutral-900',
                    'ps-10 pe-11 text-sm text-gray-900 dark:text-gray-100',
                    'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
                    'transition-all duration-150',
                    errors.password
                      ? 'border-red-400 focus:ring-red-400'
                      : 'border-gray-200 dark:border-neutral-700',
                  )}
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((s) => !s)}
                  className="absolute inset-y-0 end-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-red-500">{errors.password.message}</p>
              )}
            </div>

            {/* Remember me + Forgot password */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                {t('تذكرني', 'Remember me')}
              </label>
              <button
                type="button"
                className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 font-medium transition-colors"
              >
                {t('نسيت كلمة المرور؟', 'Forgot password?')}
              </button>
            </div>

            {/* Error message */}
            {error && (
              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400">
                {error}
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className={cn(
                'w-full h-12 rounded-xl text-white font-semibold text-sm',
                'bg-gradient-to-r from-blue-600 to-blue-800',
                'hover:from-blue-700 hover:to-blue-900',
                'hover:scale-[1.02] active:scale-[0.98]',
                'transition-all duration-150 shadow-md hover:shadow-lg',
                'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
                'disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100',
                'flex items-center justify-center gap-2',
              )}
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

          {/* Dev credentials hint */}
          <div className="mt-6 pt-5 border-t border-gray-100 dark:border-neutral-800 text-center">
            <p className="text-xs text-gray-400 dark:text-gray-600">
              {t('حساب تجريبي:', 'Demo account:')}{' '}
              <span className="font-mono">admin@fadlclinic.com / Admin@123</span>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-auto pt-8 text-xs text-gray-300 dark:text-gray-700 text-center">
          {t('فضل كلينك © ٢٠٢٦ — جميع الحقوق محفوظة', '© 2026 Fadl Clinic — All rights reserved')}
          {' · '}
          <span className="font-mono">v1.0.0</span>
        </p>
      </div>
    </div>
  );
}
