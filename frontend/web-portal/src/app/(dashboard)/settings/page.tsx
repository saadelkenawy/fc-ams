'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { identityApi } from '@/lib/api';
import {
  Building2, Users, Activity, Check, Loader2, Key, RefreshCw, X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { useLang } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';

function getUser() {
  if (typeof window === 'undefined') return {} as Record<string, string>;
  try {
    return JSON.parse(localStorage.getItem('fadl_user') ?? '{}') as Record<string, string>;
  } catch {
    return {} as Record<string, string>;
  }
}

interface ServiceStatus {
  key: string;
  name: string;
  nameAr: string;
  ok: boolean;
  ms: number | null;
}

const TABS = [
  { key: 'clinic',  labelAr: 'معلومات العيادة', labelEn: 'Clinic Info',  icon: Building2 },
  { key: 'users',   labelAr: 'المستخدمون',       labelEn: 'Users',         icon: Users },
  { key: 'system',  labelAr: 'النظام',            labelEn: 'System',        icon: Activity },
] as const;

type TabKey = typeof TABS[number]['key'];

/* ──────────────── Clinic Info Tab ──────────────── */
function ClinicInfoTab({ t, lang }: { t: (ar: string, en: string) => string; lang: 'ar' | 'en' }) {
  const WORKING_HOURS = [
    { dayAr: 'السبت – الخميس', dayEn: 'Sat – Thu', hours: '08:00 – 20:00' },
    { dayAr: 'الجمعة',          dayEn: 'Friday',     hours: t('إجازة', 'Off') },
  ];
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('بيانات العيادة الأساسية', 'Basic Clinic Data')}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
          <Input
            label="Clinic Name (EN)"
            labelAr="اسم العيادة (إنجليزي)"
            defaultValue="Fadl Clinic"
            lang={lang}
          />
          <Input
            label="Clinic Name (AR)"
            labelAr="اسم العيادة (عربي)"
            defaultValue="فضل كلينك"
            lang={lang}
          />
          <Input
            label="Phone"
            labelAr="الهاتف"
            defaultValue="+20 100 000 0000"
            lang={lang}
          />
          <Input
            label="Address"
            labelAr="العنوان"
            defaultValue="Cairo, Egypt"
            lang={lang}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('أوقات العمل', 'Working Hours')}</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <ul className="space-y-2">
            {WORKING_HOURS.map((row) => (
              <li key={row.dayEn} className="flex items-center justify-between py-2 border-b border-gray-50 dark:border-neutral-700/50 last:border-0">
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {lang === 'ar' ? row.dayAr : row.dayEn}
                </span>
                <span className="text-sm font-mono text-gray-500 dark:text-gray-400">{row.hours}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Button disabled className="opacity-60 cursor-not-allowed" title={t('قريباً', 'Coming soon')}>
        {t('حفظ التغييرات — قريباً', 'Save Changes — Coming Soon')}
      </Button>
    </div>
  );
}

/* ──────────────── Users Tab ──────────────── */
function UsersTab({
  t,
  lang,
}: {
  t: (ar: string, en: string) => string;
  lang: 'ar' | 'en';
}) {
  const { user } = useAuth();
  const jwtUser = getUser();
  const [showModal, setShowModal] = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);

  const changePw = useMutation({
    mutationFn: async () => {
      await identityApi.patch('/auth/password', {
        currentPassword: pwForm.current,
        newPassword:     pwForm.next,
      });
    },
    onSuccess: () => {
      setPwSuccess(true);
      setPwError('');
      setTimeout(() => { setShowModal(false); setPwSuccess(false); setPwForm({ current: '', next: '', confirm: '' }); }, 1500);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Failed to change password';
      setPwError(msg);
    },
  });

  function handleChangePw() {
    setPwError('');
    if (!pwForm.current || !pwForm.next) { setPwError(t('أدخل كلمة المرور الحالية والجديدة', 'Enter current and new passwords')); return; }
    if (pwForm.next.length < 8) { setPwError(t('كلمة المرور الجديدة 8 أحرف على الأقل', 'New password must be at least 8 characters')); return; }
    if (pwForm.next !== pwForm.confirm) { setPwError(t('كلمتا المرور غير متطابقتين', 'Passwords do not match')); return; }
    changePw.mutate();
  }

  const roleLabel: Record<string, { ar: string; en: string }> = {
    admin:        { ar: 'مسؤول',     en: 'Admin' },
    doctor:       { ar: 'طبيب',      en: 'Doctor' },
    receptionist: { ar: 'موظف استقبال', en: 'Receptionist' },
    finance:      { ar: 'مالية',     en: 'Finance' },
  };

  const displayName = lang === 'ar' ? (user?.nameAr ?? user?.nameEn) : user?.nameEn;
  const role = jwtUser.role ?? user?.role ?? '—';
  const sub = jwtUser.sub ?? '—';

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('المستخدم الحالي', 'Current User')}</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-primary-700 dark:text-primary-400 text-lg font-bold select-none flex-shrink-0">
              {(displayName ?? '?').charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 dark:text-gray-100">{displayName ?? '—'}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-mono mt-0.5">{sub}</p>
            </div>
            <Badge variant="primary">
              {lang === 'ar'
                ? (roleLabel[role]?.ar ?? role)
                : (roleLabel[role]?.en ?? role)}
            </Badge>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-neutral-700 flex items-center justify-between">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('تغيير كلمة المرور', 'Change Password')}
            </p>
            <Button variant="outline" size="sm" onClick={() => setShowModal(true)}>
              <Key className="w-4 h-4" />
              {t('تغيير', 'Change')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <Card className="w-full max-w-sm mx-4">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{t('تغيير كلمة المرور', 'Change Password')}</CardTitle>
                <button onClick={() => { setShowModal(false); setPwError(''); setPwSuccess(false); setPwForm({ current: '', next: '', confirm: '' }); }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-2">
              {pwSuccess ? (
                <p className="text-sm text-emerald-600 font-medium text-center py-4">
                  {t('✅ تم تغيير كلمة المرور بنجاح', '✅ Password changed successfully')}
                </p>
              ) : (
                <>
                  <Input label="Current Password" labelAr="كلمة المرور الحالية" type="password" lang={lang}
                    value={pwForm.current} onChange={(e) => setPwForm((f) => ({ ...f, current: e.target.value }))} />
                  <Input label="New Password" labelAr="كلمة المرور الجديدة" type="password" lang={lang}
                    value={pwForm.next} onChange={(e) => setPwForm((f) => ({ ...f, next: e.target.value }))} />
                  <Input label="Confirm Password" labelAr="تأكيد كلمة المرور" type="password" lang={lang}
                    value={pwForm.confirm} onChange={(e) => setPwForm((f) => ({ ...f, confirm: e.target.value }))} />
                  {pwError && <p className="text-xs text-red-500">{pwError}</p>}
                  <div className="flex gap-2 pt-2">
                    <Button className="flex-1" onClick={handleChangePw} disabled={changePw.isPending}>
                      {changePw.isPending ? t('جاري الحفظ...', 'Saving...') : t('حفظ', 'Save')}
                    </Button>
                    <Button variant="ghost" onClick={() => { setShowModal(false); setPwError(''); setPwForm({ current: '', next: '', confirm: '' }); }}>
                      {t('إلغاء', 'Cancel')}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

/* ──────────────── System Tab ──────────────── */
function SystemTab({ t, lang }: { t: (ar: string, en: string) => string; lang: 'ar' | 'en' }) {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['service-health'],
    queryFn: async (): Promise<{ services: ServiceStatus[]; checkedAt: string }> => {
      const res = await fetch('/api/health');
      return res.json() as Promise<{ services: ServiceStatus[]; checkedAt: string }>;
    },
    staleTime: 30_000,
    retry: false,
  });

  const services = data?.services ?? [];
  const checkedAt = data?.checkedAt;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t('حالة الخدمات', 'Service Health')}</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => void refetch()} disabled={isFetching} className="gap-1.5">
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
              {t('تحديث', 'Refresh')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          {checkedAt && (
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-4 font-mono">
              {t('آخر فحص:', 'Last checked:')} {new Date(checkedAt).toLocaleTimeString()}
            </p>
          )}
          {isLoading ? (
            <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">{t('جاري الفحص...', 'Checking services...')}</span>
            </div>
          ) : (
            services.map((svc) => (
              <div key={svc.key} className="flex items-center justify-between py-3 border-b border-gray-50 dark:border-neutral-700/50 last:border-0">
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {lang === 'ar' ? svc.nameAr : svc.name}
                </span>
                <div className="flex items-center gap-2">
                  {svc.ms !== null && (
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">{svc.ms}ms</span>
                  )}
                  {svc.ok ? (
                    <Badge variant="success" className="gap-1">
                      <Check className="w-3 h-3" />
                      {t('متاح', 'Online')}
                    </Badge>
                  ) : (
                    <Badge variant="default" className="gap-1 text-gray-500 dark:text-gray-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                      {t('غير متاح', 'Down')}
                    </Badge>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ──────────────── Main Page ──────────────── */
export default function SettingsPage() {
  const { lang, t } = useLang();
  const jwtUser = getUser();
  const [activeTab, setActiveTab] = useState<TabKey>('clinic');

  const isAdmin = jwtUser.role === 'admin';

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-neutral-700 flex items-center justify-center">
          <Building2 className="w-8 h-8 text-gray-400 dark:text-gray-500" />
        </div>
        <p className="text-gray-500 dark:text-gray-400 text-sm text-center max-w-xs">
          {t('هذه الصفحة متاحة للمسؤولين فقط', 'This page is accessible to admins only')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold font-display text-gray-900 dark:text-gray-100">
          {t('الإعدادات', 'Settings')}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          {t('إعدادات النظام والعيادة', 'System and clinic configuration')}
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 dark:bg-neutral-800 rounded-xl p-1 w-fit">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={[
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                activeTab === tab.key
                  ? 'bg-white dark:bg-neutral-700 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300',
              ].join(' ')}
            >
              <Icon className="w-4 h-4" />
              {lang === 'ar' ? tab.labelAr : tab.labelEn}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'clinic'  && <ClinicInfoTab t={t} lang={lang} />}
      {activeTab === 'users'   && <UsersTab t={t} lang={lang} />}
      {activeTab === 'system'  && <SystemTab t={t} lang={lang} />}
    </div>
  );
}
