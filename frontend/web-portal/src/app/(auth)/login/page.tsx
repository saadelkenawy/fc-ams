'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { HeartPulse, Eye, EyeOff, Globe } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/contexts/AuthContext';
import { useLang } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});
type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const { login } = useAuth();
  const { lang, toggle, t } = useLang();
  const router = useRouter();
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: FormValues) {
    setError('');
    try {
      // Wire to identity-service when ready
      const res = await api.post<{ data: { token: string; user: object } }>('/auth/login', data);
      login(res.data.data.token, res.data.data.user as Parameters<typeof login>[1]);
      router.replace('/');
    } catch {
      // Dev shortcut: allow demo login until identity-service is live
      if (data.email === 'admin@fadlclinic.com' && data.password === 'Admin@123') {
        login('demo-token', {
          id: 'demo-001',
          nameEn: 'Admin User',
          nameAr: 'مدير النظام',
          role: 'admin',
          branchId: 1,
          email: data.email,
        });
        router.replace('/');
        return;
      }
      setError(t('البريد الإلكتروني أو كلمة المرور غير صحيحة', 'Invalid email or password'));
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-atmospheric px-4" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {/* Language toggle */}
      <button
        onClick={toggle}
        className="fixed top-4 end-4 flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary-600 transition-colors"
      >
        <Globe className="w-4 h-4" />
        {t('English', 'عربي')}
      </button>

      <div className="w-full max-w-md">
        {/* Logo card */}
        <div className="text-center mb-8">
          <div className="inline-flex w-16 h-16 rounded-2xl items-center justify-center shadow-5 mb-4" style={{ background: 'var(--gradient-logo)' }}>
            <HeartPulse className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-2xl font-bold font-display text-gray-900">{t('فضل كلينك', 'Fadl Clinic')}</h1>
          <p className="text-gray-500 text-sm mt-1">{t('نظام إدارة العيادة', 'Clinic Management System')}</p>
        </div>

        {/* Login form */}
        <div className="bg-white rounded-2xl shadow-5 p-8 border border-gray-100">
          <h2 className="text-xl font-semibold font-display text-gray-900 mb-6">
            {t('تسجيل الدخول', 'Sign in to your account')}
          </h2>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <Input
              id="email"
              type="email"
              label="Email"
              labelAr="البريد الإلكتروني"
              placeholder={t('admin@fadlclinic.com', 'admin@fadlclinic.com')}
              autoComplete="email"
              error={errors.email?.message}
              lang={lang}
              {...register('email')}
            />

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium text-gray-700">
                {t('كلمة المرور', 'Password')}
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPass ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className={cn(
                    'w-full h-11 rounded-lg border border-gray-200 bg-white px-4 pe-10 text-sm text-gray-900',
                    'focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent',
                    'transition-shadow duration-150',
                    errors.password && 'border-red-400',
                  )}
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((s) => !s)}
                  className="absolute inset-y-0 end-3 flex items-center text-gray-400 hover:text-gray-600"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" loading={isSubmitting} size="lg">
              {t('دخول', 'Sign in')}
            </Button>
          </form>

          <p className="mt-6 text-xs text-center text-gray-400">
            {t('تجربة:', 'Demo:')} admin@fadlclinic.com / Admin@123
          </p>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          {t('فضل كلينك © ٢٠٢٦ — جميع الحقوق محفوظة', '© 2026 Fadl Clinic — All rights reserved')}
        </p>
      </div>
    </div>
  );
}
