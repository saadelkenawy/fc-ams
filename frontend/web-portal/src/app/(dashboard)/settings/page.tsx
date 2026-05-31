'use client';

import { useState, useEffect } from 'react';
import { useTranslateName } from '@/hooks/useTranslateName';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { identityApi } from '@/lib/api';
import {
  Building2, Users, Activity, Check, Loader2, Key, RefreshCw, X,
  UserPlus, Edit2, ShieldOff, ShieldCheck, RotateCcw, Search, Trash2,
  SlidersHorizontal, ChevronRight, Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { useLang } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import type { ThemeId } from '@/lib/theme.config';
import { doctorApi } from '@/lib/api';

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

interface PlatformUser {
  id:          string;
  email:       string;
  nameEn:      string;
  nameAr?:     string;
  role:        string;
  isActive:    boolean;
  lastLoginAt?: string | null;
  branchId:    number;
  doctorId?:   string;
}

interface DoctorOption {
  id:     string;
  nameEn: string;
  nameAr?: string;
}

const SECTIONS = [
  { key: 'clinic',       labelAr: 'معلومات العيادة', labelEn: 'Clinic Info',   icon: Building2 },
  { key: 'users',        labelAr: 'المستخدمون',       labelEn: 'Users',         icon: Users },
  { key: 'system',       labelAr: 'النظام',            labelEn: 'System',        icon: Activity },
  { key: 'appearance',   labelAr: 'المظهر',            labelEn: 'Appearance',    icon: SlidersHorizontal },
  { key: 'integrations', labelAr: 'التكاملات',         labelEn: 'Integrations',  icon: Zap },
] as const;

type SectionKey = typeof SECTIONS[number]['key'];

const ROLES = ['admin', 'finance', 'doctor', 'receptionist', 'procurement'] as const;
type Role = typeof ROLES[number];

const ROLE_META: Record<Role, { labelAr: string; labelEn: string; color: string }> = {
  admin:        { labelAr: 'مسؤول النظام',    labelEn: 'Admin',         color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  finance:      { labelAr: 'مالية',            labelEn: 'Finance',       color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  doctor:       { labelAr: 'طبيب',             labelEn: 'Doctor',        color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  receptionist: { labelAr: 'موظف استقبال',    labelEn: 'Receptionist',  color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  procurement:  { labelAr: 'مشتريات',          labelEn: 'Procurement',   color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
};

const PERMISSIONS: Array<{ labelAr: string; labelEn: string; admin: boolean; finance: boolean; doctor: boolean; receptionist: boolean; procurement: boolean }> = [
  { labelAr: 'لوحة التحكم',        labelEn: 'Dashboard',        admin: true,  finance: true,  doctor: false, receptionist: false, procurement: false },
  { labelAr: 'إدارة المرضى',       labelEn: 'Patients (all)',   admin: true,  finance: false, doctor: false, receptionist: true,  procurement: false },
  { labelAr: 'المواعيد',           labelEn: 'Appointments',     admin: true,  finance: false, doctor: true,  receptionist: true,  procurement: false },
  { labelAr: 'إدارة الأطباء',      labelEn: 'Doctors',          admin: true,  finance: false, doctor: false, receptionist: false, procurement: false },
  { labelAr: 'الفواتير والمدفوعات', labelEn: 'Billing',         admin: true,  finance: true,  doctor: false, receptionist: true,  procurement: false },
  { labelAr: 'التسويات',           labelEn: 'Settlements',      admin: true,  finance: true,  doctor: false, receptionist: false, procurement: false },
  { labelAr: 'التحليلات',          labelEn: 'Analytics',        admin: true,  finance: true,  doctor: false, receptionist: false, procurement: false },
  { labelAr: 'التقارير',           labelEn: 'Reports',          admin: true,  finance: true,  doctor: false, receptionist: false, procurement: false },
  { labelAr: 'الحالات السريرية',   labelEn: 'Encounters',       admin: true,  finance: false, doctor: true,  receptionist: false, procurement: false },
  { labelAr: 'الإجراءات',         labelEn: 'Procedures',       admin: true,  finance: false, doctor: false, receptionist: false, procurement: false },
  { labelAr: 'المساعد الذكي',      labelEn: 'AI Assistant',     admin: true,  finance: false, doctor: false, receptionist: true,  procurement: false },
  { labelAr: 'التكاملات الخارجية', labelEn: 'Integrations',     admin: true,  finance: false, doctor: false, receptionist: false, procurement: false },
  { labelAr: 'الإعدادات',         labelEn: 'Settings',         admin: true,  finance: false, doctor: false, receptionist: false, procurement: false },
  { labelAr: 'إدارة المستخدمين',  labelEn: 'User Management',  admin: true,  finance: false, doctor: false, receptionist: false, procurement: false },
  { labelAr: 'كتالوج المشتريات',  labelEn: 'Procurement',      admin: true,  finance: false, doctor: false, receptionist: false, procurement: true  },
  { labelAr: 'جدولتي الشخصية',    labelEn: 'Own Schedule',     admin: false, finance: false, doctor: true,  receptionist: false, procurement: false },
  { labelAr: 'مرضاي فقط',         labelEn: 'Own Patients',     admin: false, finance: false, doctor: true,  receptionist: false, procurement: false },
  { labelAr: 'أرباحي',            labelEn: 'Own Earnings',     admin: false, finance: false, doctor: true,  receptionist: false, procurement: false },
];

const INTEGRATIONS = [
  { key: 'vez',      nameEn: 'VEZ',              nameAr: 'فيز',          descEn: 'Egyptian health insurance portal',  descAr: 'بوابة التأمين الصحي المصرية',  connected: false, color: '#10B981', abbr: 'VZ' },
  { key: 'instapay', nameEn: 'InstaPay',          nameAr: 'إنستاباي',     descEn: 'Instant bank transfers',           descAr: 'تحويلات بنكية فورية',           connected: true,  color: '#7C3AED', abbr: 'IP' },
  { key: 'whatsapp', nameEn: 'WhatsApp Business', nameAr: 'واتساب بزنس',  descEn: 'Patient messaging & reminders',    descAr: 'مراسلة المرضى والتذكيرات',      connected: false, color: '#25D366', abbr: 'WA' },
  { key: 'gcal',     nameEn: 'Google Calendar',   nameAr: 'تقويم جوجل',   descEn: 'Sync appointments to Google',      descAr: 'مزامنة المواعيد مع جوجل',       connected: false, color: '#4285F4', abbr: 'GC' },
] as const;

/* ──────────────── Clinic Info Content ──────────────── */
function ClinicInfoContent({ t, lang }: { t: (ar: string, en: string) => string; lang: 'ar' | 'en' }) {
  const WORKING_HOURS = [
    { dayAr: 'السبت – الخميس', dayEn: 'Sat – Thu', hours: '08:00 – 20:00' },
    { dayAr: 'الجمعة',          dayEn: 'Friday',     hours: t('إجازة', 'Off') },
  ];
  return (
    <div className="space-y-6">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100 mb-4">
          <Building2 className="w-4 h-4 text-gray-400" />
          {t('بيانات العيادة الأساسية', 'Basic Clinic Data')}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Clinic Name (EN)" labelAr="اسم العيادة (إنجليزي)" defaultValue="Fadl Clinic" lang={lang} />
          <Input label="Clinic Name (AR)" labelAr="اسم العيادة (عربي)"    defaultValue="فضل كلينك"   lang={lang} />
          <Input label="Phone"            labelAr="الهاتف"                 defaultValue="+20 100 000 0000" lang={lang} />
          <Input label="Address"          labelAr="العنوان"                defaultValue="Cairo, Egypt" lang={lang} />
        </div>
        <div className="mt-5">
          <button className="fc-btn fc-btn-md fc-btn-secondary opacity-50 cursor-not-allowed" disabled>
            {t('حفظ التغييرات (قريباً)', 'Save Changes (Coming Soon)')}
          </button>
        </div>
      </div>

      <div className="border-t border-gray-100 dark:border-neutral-700 pt-6">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100 mb-4">
          <Activity className="w-4 h-4 text-gray-400" />
          {t('أوقات العمل', 'Working Hours')}
        </h3>
        <div className="fc-set-hours-list">
          {WORKING_HOURS.map((row) => (
            <div key={row.dayEn} className="fc-set-hours-row">
              <span className="fc-set-hours-day">{lang === 'ar' ? row.dayAr : row.dayEn}</span>
              <span className="fc-set-hours-val">{row.hours}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ──────────────── Modal helper ──────────────── */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md mx-4 bg-white dark:bg-neutral-800 rounded-2xl shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-neutral-700">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">{children}</div>
      </div>
    </div>
  );
}

/* ──────────────── Create User Modal ──────────────── */
function CreateUserModal({
  lang, t, onClose, onDone, occupiedDoctorIds,
}: {
  lang: 'ar' | 'en';
  t: (ar: string, en: string) => string;
  onClose: () => void;
  onDone: () => void;
  occupiedDoctorIds: Set<string>;
}) {
  const [form, setForm] = useState({ nameEn: '', nameAr: '', email: '', password: '', role: 'receptionist' as Role, doctorId: '' });
  const [err, setErr] = useState('');
  const [ok, setOk]   = useState(false);
  const { translate, translating } = useTranslateName();

  const { data: doctorsData, isLoading: doctorsLoading } = useQuery({
    queryKey: ['doctors-unlinked'],
    queryFn: async () => {
      const { data: res } = await doctorApi.get<{ success: boolean; data: DoctorOption[] }>(
        '/doctors?isActive=true&limit=500',
      );
      return res.data;
    },
    enabled: form.role === 'doctor',
    staleTime: 60_000,
  });

  const availableDoctors = (doctorsData ?? []).filter((d) => !occupiedDoctorIds.has(d.id));

  function handleRoleChange(role: Role) {
    setForm((f) => ({ ...f, role, doctorId: '' }));
  }

  function handleDoctorSelect(doctorId: string) {
    const doc = (doctorsData ?? []).find((d) => d.id === doctorId);
    if (!doc) { setForm((f) => ({ ...f, doctorId: '' })); return; }
    setForm((f) => ({
      ...f,
      doctorId: doc.id,
      nameEn:   doc.nameEn,
      nameAr:   doc.nameAr ?? f.nameAr,
    }));
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = { ...form };
      if (form.role !== 'doctor') delete payload.doctorId;
      await identityApi.post('/users', payload);
    },
    onSuccess: () => {
      setOk(true);
      setTimeout(() => { onDone(); onClose(); }, 1000);
    },
    onError: (e: unknown) => {
      setErr((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? t('فشل إنشاء المستخدم', 'Failed to create user'));
    },
  });

  function submit() {
    setErr('');
    if (!form.nameEn || !form.email || !form.password) { setErr(t('جميع الحقول مطلوبة', 'All fields required')); return; }
    if (form.password.length < 8) { setErr(t('كلمة المرور 8 أحرف على الأقل', 'Password must be at least 8 characters')); return; }
    if (form.role === 'doctor' && !form.doctorId) { setErr(t('يجب اختيار الطبيب من القائمة', 'Please select the doctor from the list')); return; }
    mutation.mutate();
  }

  return (
    <Modal title={t('إنشاء مستخدم جديد', 'New User')} onClose={onClose}>
      {ok ? (
        <p className="text-center text-emerald-600 py-4">{t('✅ تم إنشاء المستخدم', '✅ User created')}</p>
      ) : (
        <>
          {/* Role first so doctor picker can appear before name fields */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1.5">
              {lang === 'ar' ? 'الدور' : 'Role'}
            </label>
            <select
              value={form.role}
              onChange={(e) => handleRoleChange(e.target.value as Role)}
              className="w-full h-9 rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-gray-800 dark:text-gray-100 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{lang === 'ar' ? ROLE_META[r].labelAr : ROLE_META[r].labelEn}</option>
              ))}
            </select>
          </div>

          {/* Doctor picker — only shown when role is doctor */}
          {form.role === 'doctor' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1.5">
                {lang === 'ar' ? 'اختر الطبيب' : 'Select Doctor'}
                <span className="text-red-500 ms-0.5">*</span>
              </label>
              {doctorsLoading ? (
                <div className="flex items-center gap-2 h-9 px-3 rounded-lg border border-gray-200 dark:border-neutral-600 text-sm text-gray-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {t('جاري تحميل الأطباء...', 'Loading doctors...')}
                </div>
              ) : availableDoctors.length === 0 ? (
                <p className="text-xs text-amber-600 dark:text-amber-400 py-2">
                  {t('لا يوجد أطباء متاحون — جميع الأطباء مرتبطون بحسابات مستخدمين', 'No doctors available — all doctors are already linked to user accounts')}
                </p>
              ) : (
                <select
                  value={form.doctorId}
                  onChange={(e) => handleDoctorSelect(e.target.value)}
                  className="w-full h-9 rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-gray-800 dark:text-gray-100 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
                >
                  <option value="">{lang === 'ar' ? '— اختر طبيباً —' : '— Choose a doctor —'}</option>
                  {availableDoctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {lang === 'ar' ? (d.nameAr ?? d.nameEn) : d.nameEn}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="relative">
              <Input
                label="Name (EN)" labelAr="الاسم (إنجليزي)" lang={lang}
                value={form.nameEn}
                className={translating === 'en' ? 'pe-8' : ''}
                onChange={(e) => setForm((f) => ({ ...f, nameEn: e.target.value }))}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (lang === 'en' && v && !form.nameAr.trim()) {
                    void translate(v, 'en').then((r) => { if (r) setForm((f) => ({ ...f, nameAr: r })); });
                  }
                }}
              />
              {translating === 'en' && <Loader2 className="absolute bottom-3.5 end-2.5 w-4 h-4 text-primary-500 animate-spin pointer-events-none" />}
            </div>
            <div className="relative">
              <Input
                label="Name (AR)" labelAr="الاسم (عربي)" lang={lang}
                value={form.nameAr}
                className={translating === 'ar' ? 'pe-8' : ''}
                onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (lang === 'ar' && v && !form.nameEn.trim()) {
                    void translate(v, 'ar').then((r) => { if (r) setForm((f) => ({ ...f, nameEn: r })); });
                  }
                }}
              />
              {translating === 'ar' && <Loader2 className="absolute bottom-3.5 end-2.5 w-4 h-4 text-primary-500 animate-spin pointer-events-none" />}
            </div>
          </div>
          <Input label="Email" labelAr="البريد الإلكتروني" type="email" lang={lang} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          <Input label="Initial Password" labelAr="كلمة المرور الأولية" type="password" lang={lang} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2 pt-1">
            <Button className="flex-1" onClick={submit} disabled={mutation.isPending}>
              {mutation.isPending ? t('جاري الحفظ...', 'Creating...') : t('إنشاء', 'Create')}
            </Button>
            <Button variant="ghost" onClick={onClose}>{t('إلغاء', 'Cancel')}</Button>
          </div>
        </>
      )}
    </Modal>
  );
}

/* ──────────────── Edit Role Modal ──────────────── */
function EditRoleModal({
  user, lang, t, onClose, onDone, occupiedDoctorIds,
}: {
  user: PlatformUser;
  lang: 'ar' | 'en';
  t: (ar: string, en: string) => string;
  onClose: () => void;
  onDone: () => void;
  occupiedDoctorIds: Set<string>;
}) {
  const [role, setRole]       = useState<Role>(user.role as Role);
  const [doctorId, setDoctorId] = useState(user.doctorId ?? '');
  const [err, setErr]           = useState('');

  const { data: doctorsData, isLoading: doctorsLoading } = useQuery({
    queryKey: ['doctors-unlinked'],
    queryFn: async () => {
      const { data: res } = await doctorApi.get<{ success: boolean; data: DoctorOption[] }>(
        '/doctors?isActive=true&limit=500',
      );
      return res.data;
    },
    enabled: role === 'doctor',
    staleTime: 60_000,
  });

  // Exclude doctors already linked to OTHER users (keep current user's own doctor selectable)
  const availableDoctors = (doctorsData ?? []).filter(
    (d) => !occupiedDoctorIds.has(d.id) || d.id === user.doctorId,
  );

  function handleRoleChange(r: Role) {
    setRole(r);
    if (r !== 'doctor') setDoctorId('');
    else setDoctorId(user.doctorId ?? '');
  }

  const noChange = role === user.role && (role !== 'doctor' || doctorId === (user.doctorId ?? ''));

  const mutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { role };
      if (role === 'doctor') body.doctorId = doctorId;
      await identityApi.patch(`/users/${user.id}`, body);
    },
    onSuccess: () => { onDone(); onClose(); },
    onError: (e: unknown) => {
      setErr((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? t('فشل التحديث', 'Update failed'));
    },
  });

  function submit() {
    setErr('');
    if (role === 'doctor' && !doctorId) {
      setErr(t('يجب اختيار الطبيب من القائمة', 'Please select the doctor from the list'));
      return;
    }
    mutation.mutate();
  }

  return (
    <Modal title={t('تغيير دور المستخدم', 'Change User Role')} onClose={onClose}>
      <p className="text-sm text-gray-600 dark:text-gray-300">{user.nameEn} · <span className="font-mono text-xs">{user.email}</span></p>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1.5">{lang === 'ar' ? 'الدور الجديد' : 'New Role'}</label>
        <div className="space-y-2">
          {ROLES.map((r) => (
            <button
              key={r}
              onClick={() => handleRoleChange(r)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-sm font-medium ${
                role === r
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                  : 'border-gray-100 dark:border-neutral-700 text-gray-700 dark:text-gray-300 hover:border-gray-200'
              }`}
            >
              <span className={`px-2 py-0.5 rounded-full text-xs ${ROLE_META[r].color}`}>
                {lang === 'ar' ? ROLE_META[r].labelAr : ROLE_META[r].labelEn}
              </span>
              {role === r && <Check className="w-4 h-4 ms-auto" />}
            </button>
          ))}
        </div>
      </div>

      {/* Doctor picker — only shown when role is doctor */}
      {role === 'doctor' && (
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1.5">
            {lang === 'ar' ? 'اختر الطبيب' : 'Select Doctor'}
            <span className="text-red-500 ms-0.5">*</span>
          </label>
          {doctorsLoading ? (
            <div className="flex items-center gap-2 h-9 px-3 rounded-lg border border-gray-200 dark:border-neutral-600 text-sm text-gray-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {t('جاري تحميل الأطباء...', 'Loading doctors...')}
            </div>
          ) : availableDoctors.length === 0 ? (
            <p className="text-xs text-amber-600 dark:text-amber-400 py-2">
              {t('لا يوجد أطباء متاحون', 'No doctors available')}
            </p>
          ) : (
            <select
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              className="w-full h-9 rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-gray-800 dark:text-gray-100 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
            >
              <option value="">{lang === 'ar' ? '— اختر طبيباً —' : '— Choose a doctor —'}</option>
              {availableDoctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {lang === 'ar' ? (d.nameAr ?? d.nameEn) : d.nameEn}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {err && <p className="text-xs text-red-500">{err}</p>}
      <div className="flex gap-2">
        <Button className="flex-1" disabled={mutation.isPending || noChange} onClick={submit}>
          {mutation.isPending ? t('جاري الحفظ...', 'Saving...') : t('حفظ', 'Save')}
        </Button>
        <Button variant="ghost" onClick={onClose}>{t('إلغاء', 'Cancel')}</Button>
      </div>
    </Modal>
  );
}

/* ──────────────── Reset Password Modal ──────────────── */
function ResetPasswordModal({
  user, lang, t, onClose,
}: {
  user: PlatformUser;
  lang: 'ar' | 'en';
  t: (ar: string, en: string) => string;
  onClose: () => void;
}) {
  const [pw, setPw]   = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk]   = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      await identityApi.patch(`/users/${user.id}/reset-password`, { newPassword: pw });
    },
    onSuccess: () => {
      setOk(true);
      setTimeout(onClose, 1200);
    },
    onError: (e: unknown) => {
      setErr((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? t('فشل', 'Failed'));
    },
  });

  return (
    <Modal title={t('إعادة تعيين كلمة المرور', 'Reset Password')} onClose={onClose}>
      <p className="text-sm text-gray-600 dark:text-gray-300">{user.nameEn} · <span className="font-mono text-xs">{user.email}</span></p>
      {ok ? (
        <p className="text-center text-emerald-600 py-2">{t('✅ تم إعادة تعيين كلمة المرور', '✅ Password reset')}</p>
      ) : (
        <>
          <Input label="New Password" labelAr="كلمة المرور الجديدة" type="password" lang={lang} value={pw} onChange={(e) => setPw(e.target.value)} />
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2">
            <Button className="flex-1" disabled={pw.length < 8 || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? t('جاري...', 'Saving...') : t('تعيين', 'Reset')}
            </Button>
            <Button variant="ghost" onClick={onClose}>{t('إلغاء', 'Cancel')}</Button>
          </div>
        </>
      )}
    </Modal>
  );
}

/* ──────────────── Delete User Modal ──────────────── */
function DeleteUserModal({
  user, lang, t, onClose, onDone,
}: {
  user: PlatformUser;
  lang: 'ar' | 'en';
  t: (ar: string, en: string) => string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [err, setErr] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      await identityApi.delete(`/users/${user.id}`);
    },
    onSuccess: () => { onDone(); onClose(); },
    onError: (e: unknown) => {
      setErr((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? t('فشل الحذف', 'Delete failed'));
    },
  });

  return (
    <Modal title={t('حذف المستخدم', 'Delete User')} onClose={onClose}>
      <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
        {lang === 'ar'
          ? `هل أنت متأكد من حذف "${user.nameAr ?? user.nameEn}"؟ لا يمكن التراجع عن هذا الإجراء.`
          : `Are you sure you want to permanently delete "${user.nameEn}"? This cannot be undone.`}
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500 font-mono">{user.email}</p>
      {err && <p className="text-xs text-red-500">{err}</p>}
      <div className="flex gap-2 pt-1">
        <Button variant="ghost" className="flex-1" onClick={onClose}>{t('إلغاء', 'Cancel')}</Button>
        <Button
          className="flex-1 bg-red-600 hover:bg-red-700 focus-visible:ring-red-600 text-white"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? t('جاري الحذف...', 'Deleting...') : t('حذف نهائي', 'Delete permanently')}
        </Button>
      </div>
    </Modal>
  );
}

/* ──────────────── My Account card ──────────────── */
function MyAccountCard({ t, lang }: { t: (ar: string, en: string) => string; lang: 'ar' | 'en' }) {
  const { user } = useAuth();
  const [showPw, setShowPw] = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);

  const changePw = useMutation({
    mutationFn: async () => {
      await identityApi.patch('/auth/password', { currentPassword: pwForm.current, newPassword: pwForm.next });
    },
    onSuccess: () => {
      setPwSuccess(true);
      setTimeout(() => { setShowPw(false); setPwSuccess(false); setPwForm({ current: '', next: '', confirm: '' }); }, 1500);
    },
    onError: (e: unknown) => {
      setPwError((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? t('فشل', 'Failed'));
    },
  });

  function handleChangePw() {
    setPwError('');
    if (!pwForm.current || !pwForm.next) { setPwError(t('أدخل كلمة المرور الحالية والجديدة', 'Enter both passwords')); return; }
    if (pwForm.next.length < 8) { setPwError(t('8 أحرف على الأقل', 'At least 8 characters')); return; }
    if (pwForm.next !== pwForm.confirm) { setPwError(t('كلمتا المرور غير متطابقتين', 'Passwords do not match')); return; }
    changePw.mutate();
  }

  const displayName = lang === 'ar' ? (user?.nameAr ?? user?.nameEn) : user?.nameEn;
  const role = user?.role ?? '—';

  return (
    <>
      <div className="fc-set-profile">
        <div className="fc-set-profile-avatar">
          {(displayName ?? '?').charAt(0).toUpperCase()}
        </div>
        <div className="fc-set-profile-info">
          <div className="fc-set-profile-name">{displayName ?? '—'}</div>
          <div className="fc-set-profile-meta">{user?.email}</div>
        </div>
        <div className="fc-set-profile-actions">
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${ROLE_META[role as Role]?.color ?? 'bg-gray-100 text-gray-600'}`}>
            {lang === 'ar' ? ROLE_META[role as Role]?.labelAr : ROLE_META[role as Role]?.labelEn}
          </span>
          <button
            type="button"
            className="fc-btn fc-btn-sm fc-btn-outline gap-1.5"
            onClick={() => setShowPw(true)}
          >
            <Key className="w-3.5 h-3.5" />
            {t('تغيير', 'Change')}
          </button>
        </div>
      </div>

      {showPw && (
        <Modal title={t('تغيير كلمة المرور', 'Change Password')} onClose={() => { setShowPw(false); setPwError(''); setPwSuccess(false); setPwForm({ current: '', next: '', confirm: '' }); }}>
          {pwSuccess ? (
            <p className="text-center text-emerald-600 py-4">{t('✅ تم التغيير بنجاح', '✅ Changed successfully')}</p>
          ) : (
            <>
              <Input label="Current Password" labelAr="كلمة المرور الحالية" type="password" lang={lang} value={pwForm.current} onChange={(e) => setPwForm((f) => ({ ...f, current: e.target.value }))} />
              <Input label="New Password"     labelAr="كلمة المرور الجديدة" type="password" lang={lang} value={pwForm.next}    onChange={(e) => setPwForm((f) => ({ ...f, next: e.target.value }))} />
              <Input label="Confirm"          labelAr="تأكيد"               type="password" lang={lang} value={pwForm.confirm} onChange={(e) => setPwForm((f) => ({ ...f, confirm: e.target.value }))} />
              {pwError && <p className="text-xs text-red-500">{pwError}</p>}
              <div className="flex gap-2">
                <Button className="flex-1" onClick={handleChangePw} disabled={changePw.isPending}>
                  {changePw.isPending ? t('جاري...', 'Saving...') : t('حفظ', 'Save')}
                </Button>
                <Button variant="ghost" onClick={() => setShowPw(false)}>{t('إلغاء', 'Cancel')}</Button>
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  );
}

/* ──────────────── Users Content ──────────────── */
function UsersContent({ t, lang }: { t: (ar: string, en: string) => string; lang: 'ar' | 'en' }) {
  const qc = useQueryClient();
  const { user: currentUser } = useAuth();
  const [search, setSearch]               = useState('');
  const [showCreate, setShowCreate]           = useState(false);
  const [editRoleUser, setEditRoleUser]       = useState<PlatformUser | null>(null);
  const [resetPwUser, setResetPwUser]         = useState<PlatformUser | null>(null);
  const [deleteConfirmUser, setDeleteConfirm] = useState<PlatformUser | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['platform-users'],
    queryFn:  async () => {
      const { data: res } = await identityApi.get<{ success: boolean; data: PlatformUser[] }>('/users');
      return res.data;
    },
    staleTime: 30_000,
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await identityApi.patch(`/users/${id}`, { isActive });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['platform-users'] }),
  });

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ['platform-users'] });
    void qc.invalidateQueries({ queryKey: ['doctors-unlinked'] });
  }

  const occupiedDoctorIds = new Set(
    (data ?? []).filter((u) => u.role === 'doctor' && u.doctorId).map((u) => u.doctorId!),
  );

  const users = (data ?? []).filter((u) => {
    const q = search.toLowerCase();
    return !q || u.nameEn.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.nameAr ?? '').includes(q);
  });

  function relTime(iso?: string | null) {
    if (!iso) return '—';
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1)   return t('الآن', 'Just now');
    if (mins < 60)  return lang === 'ar' ? `${mins}د` : `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)   return lang === 'ar' ? `${hrs}س` : `${hrs}h ago`;
    return lang === 'ar' ? `${Math.floor(hrs / 24)}ي` : `${Math.floor(hrs / 24)}d ago`;
  }

  return (
    <div className="space-y-6">
      <MyAccountCard t={t} lang={lang} />

      <div className="border-t border-gray-100 dark:border-neutral-700 pt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
            <Users className="w-4 h-4 text-gray-400" />
            {t('مستخدمو المنصة', 'Platform Users')}
          </h3>
          <button type="button" className="fc-btn fc-btn-sm fc-btn-primary gap-1.5" onClick={() => setShowCreate(true)}>
            <UserPlus className="w-3.5 h-3.5" />
            {t('مستخدم جديد', 'New User')}
          </button>
        </div>

        <div className="relative mb-4">
          <Search className="absolute top-1/2 -translate-y-1/2 start-3 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder={t('بحث بالاسم أو البريد...', 'Search by name or email...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 ps-9 pe-4 text-sm bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600 text-gray-800 dark:text-gray-100 placeholder:text-gray-400"
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10 gap-2 text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">{t('جاري التحميل...', 'Loading...')}</span>
          </div>
        ) : (
          <div className="fc-table-wrap rounded-xl border border-gray-100 dark:border-neutral-700">
            <table className="fc-table">
              <thead>
                <tr>
                  {[t('المستخدم', 'User'), t('الدور', 'Role'), t('الحالة', 'Status'), t('آخر دخول', 'Last Login'), t('إجراءات', 'Actions')].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-gray-400 text-sm">
                      {t('لا توجد نتائج', 'No users found')}
                    </td>
                  </tr>
                )}
                {users.map((u) => {
                  const isSelf = u.id === currentUser?.id;
                  return (
                    <tr key={u.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-primary-700 dark:text-primary-400 text-sm font-bold flex-shrink-0">
                            {u.nameEn.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 dark:text-gray-100 truncate text-sm">
                              {lang === 'ar' ? (u.nameAr ?? u.nameEn) : u.nameEn}
                              {isSelf && <span className="ms-1.5 text-[10px] text-primary-500">{t('(أنا)', '(me)')}</span>}
                            </p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_META[u.role as Role]?.color ?? 'bg-gray-100 text-gray-600'}`}>
                          {lang === 'ar' ? ROLE_META[u.role as Role]?.labelAr : ROLE_META[u.role as Role]?.labelEn}
                        </span>
                      </td>
                      <td>
                        {u.isActive ? (
                          <Badge variant="success" className="gap-1 text-xs"><Check className="w-3 h-3" />{t('نشط', 'Active')}</Badge>
                        ) : (
                          <Badge variant="default" className="text-xs text-gray-500">{t('معطل', 'Inactive')}</Badge>
                        )}
                      </td>
                      <td className="text-xs text-gray-400 whitespace-nowrap">{relTime(u.lastLoginAt)}</td>
                      <td>
                        <div className="fc-row-actions">
                          <button
                            type="button"
                            onClick={() => setEditRoleUser(u)}
                            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-700 text-gray-400 hover:text-primary-600 transition-colors"
                            aria-label={t('تغيير الدور', 'Edit role')}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setResetPwUser(u)}
                            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-700 text-gray-400 hover:text-amber-600 transition-colors"
                            aria-label={t('إعادة تعيين كلمة المرور', 'Reset password')}
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                          {!isSelf && (
                            <button
                              type="button"
                              onClick={() => toggleActive.mutate({ id: u.id, isActive: !u.isActive })}
                              className={`p-1.5 rounded-lg transition-colors ${u.isActive
                                ? 'hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500'
                                : 'hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-gray-400 hover:text-emerald-600'
                              }`}
                              aria-label={u.isActive ? t('تعطيل', 'Deactivate') : t('تفعيل', 'Activate')}
                            >
                              {u.isActive ? <ShieldOff className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                            </button>
                          )}
                          {!isSelf && (
                            <button
                              type="button"
                              onClick={() => setDeleteConfirm(u)}
                              className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 transition-colors"
                              aria-label={t('حذف المستخدم', 'Delete user')}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="border-t border-gray-100 dark:border-neutral-700 pt-6">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-4">
          {t('مصفوفة الصلاحيات', 'Permissions Matrix')}
        </h3>
        <div className="fc-table-wrap">
          <table className="fc-table">
            <thead>
              <tr>
                <th className="min-w-[160px]">{t('الصلاحية', 'Permission')}</th>
                {ROLES.map((r) => (
                  <th key={r} className="is-center whitespace-nowrap">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${ROLE_META[r].color}`}>
                      {lang === 'ar' ? ROLE_META[r].labelAr : ROLE_META[r].labelEn}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((perm) => (
                <tr key={perm.labelEn}>
                  <td className="font-medium text-xs">{lang === 'ar' ? perm.labelAr : perm.labelEn}</td>
                  {ROLES.map((r) => (
                    <td key={r} className="is-center">
                      {perm[r] ? (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/30 mx-auto">
                          <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 dark:bg-neutral-700/50 mx-auto">
                          <X className="w-3 h-3 text-gray-300 dark:text-gray-600" />
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate        && <CreateUserModal    lang={lang} t={t} onClose={() => setShowCreate(false)}      onDone={invalidate} occupiedDoctorIds={occupiedDoctorIds} />}
      {editRoleUser      && <EditRoleModal      lang={lang} t={t} user={editRoleUser}      onClose={() => setEditRoleUser(null)}   onDone={invalidate} occupiedDoctorIds={occupiedDoctorIds} />}
      {resetPwUser       && <ResetPasswordModal lang={lang} t={t} user={resetPwUser}       onClose={() => setResetPwUser(null)} />}
      {deleteConfirmUser && <DeleteUserModal    lang={lang} t={t} user={deleteConfirmUser} onClose={() => setDeleteConfirm(null)}  onDone={invalidate} />}
    </div>
  );
}

/* ──────────────── System Content ──────────────── */
function SystemContent({ t, lang }: { t: (ar: string, en: string) => string; lang: 'ar' | 'en' }) {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['service-health'],
    queryFn:  async (): Promise<{ services: ServiceStatus[]; checkedAt: string }> => {
      const res = await fetch('/api/health');
      return res.json() as Promise<{ services: ServiceStatus[]; checkedAt: string }>;
    },
    staleTime: 30_000,
    retry: false,
  });

  const services  = data?.services ?? [];
  const checkedAt = data?.checkedAt;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
          <Activity className="w-4 h-4 text-gray-400" />
          {t('حالة الخدمات', 'Service Health')}
        </h3>
        <button type="button" className="fc-btn fc-btn-sm fc-btn-ghost gap-1.5" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          {t('تحديث', 'Refresh')}
        </button>
      </div>
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
        <div className="fc-set-health-list">
          {services.map((svc) => (
            <div key={svc.key} className="fc-set-health-row">
              <span className="fc-set-health-name">{lang === 'ar' ? svc.nameAr : svc.name}</span>
              <div className="fc-set-health-right">
                {svc.ms !== null && <span className="fc-set-health-ms">{svc.ms}ms</span>}
                <span className={`fc-set-health-badge ${svc.ok ? 'is-ok' : 'is-down'}`}>
                  <span className="fc-set-health-dot" />
                  {svc.ok ? t('متاح', 'Online') : t('غير متاح', 'Down')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ──────────────── Appearance Content ──────────────── */
const TEXT_SIZES = [
  { key: 'sm' as const, labelAr: 'صغير',      labelEn: 'Small' },
  { key: 'md' as const, labelAr: 'متوسط',     labelEn: 'Medium' },
  { key: 'lg' as const, labelAr: 'كبير',       labelEn: 'Large' },
  { key: 'xl' as const, labelAr: 'كبير جداً', labelEn: 'Extra Large' },
] as const;
type TextSizeKey = typeof TEXT_SIZES[number]['key'];

const THEMES: { id: ThemeId; labelAr: string; labelEn: string; bg: string; fg: string }[] = [
  { id: 'light',         labelAr: 'فاتح',      labelEn: 'Light',         bg: '#F8FAFC', fg: '#1E293B' },
  { id: 'dark',          labelAr: 'داكن',       labelEn: 'Dark',          bg: '#0F1623', fg: '#E2E8F0' },
  { id: 'teal',          labelAr: 'تيل طبي',    labelEn: 'Medical Teal',  bg: '#0D9488', fg: '#FFFFFF' },
  { id: 'high-contrast', labelAr: 'تباين عالٍ', labelEn: 'High Contrast', bg: '#111827', fg: '#FFFFFF' },
];

function AppearanceContent({ t, lang }: { t: (ar: string, en: string) => string; lang: string }) {
  const { theme, setTheme } = useTheme();
  const [textSize, setTextSizeState] = useState<TextSizeKey>('md');

  useEffect(() => {
    const stored = localStorage.getItem('fadl_text_size') as TextSizeKey | null;
    const valid: TextSizeKey = (['sm', 'md', 'lg', 'xl'] as TextSizeKey[]).includes(stored as TextSizeKey) ? (stored as TextSizeKey) : 'md';
    setTextSizeState(valid);
  }, []);

  function applyTextSize(size: TextSizeKey) {
    setTextSizeState(size);
    document.documentElement.dataset.textSize = size;
    localStorage.setItem('fadl_text_size', size);
  }

  return (
    <div className="space-y-8">
      {/* Text size */}
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">
          <SlidersHorizontal className="w-4 h-4 text-gray-400" />
          {t('حجم النص', 'Text Size')}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {t('اختر حجم النص المناسب لراحة القراءة', 'Choose a text size comfortable for reading')}
        </p>
        <div className="fc-set-size-row">
          {TEXT_SIZES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => applyTextSize(s.key)}
              className={`fc-set-size-btn${textSize === s.key ? ' is-active' : ''}`}
            >
              {lang === 'ar' ? s.labelAr : s.labelEn}
            </button>
          ))}
        </div>
        <div className="fc-set-preview">
          {t('معاينة: ', 'Preview: ')}
          <strong>{t('نص العينة — فضل كلينك لإدارة العيادات', 'Sample text — Fadl Clinic Management System')}</strong>
        </div>
      </div>

      {/* Theme */}
      <div className="border-t border-gray-100 dark:border-neutral-700 pt-6">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">
          {t('مظهر النظام', 'Theme')}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {t('وضع التباين العالي مناسب لذوي ضعف البصر والمسنين', 'High Contrast mode is recommended for users with visual impairment or elderly users')}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {THEMES.map((th) => (
            <button
              key={th.id}
              type="button"
              onClick={() => setTheme(th.id)}
              className={`rounded-xl border p-3 text-left transition-all ${
                theme === th.id
                  ? 'border-primary-600 ring-2 ring-primary-600/20'
                  : 'border-gray-200 dark:border-neutral-700 hover:border-gray-300 dark:hover:border-neutral-600'
              }`}
            >
              <div
                className="rounded-lg mb-2.5 h-14 flex items-center px-3 text-sm font-medium"
                style={{ background: th.bg, color: th.fg }}
              >
                Aa Bb 0123
              </div>
              <p className="text-xs font-medium text-gray-800 dark:text-gray-100">
                {lang === 'ar' ? th.labelAr : th.labelEn}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ──────────────── Integrations Content ──────────────── */
function IntegrationsContent({ t, lang }: { t: (ar: string, en: string) => string; lang: string }) {
  return (
    <div>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">
        <Zap className="w-4 h-4 text-gray-400" />
        {t('التكاملات الخارجية', 'External Integrations')}
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        {t('ربط العيادة بالخدمات والأنظمة الخارجية', 'Connect your clinic to external services and systems')}
      </p>
      <div className="divide-y divide-gray-100 dark:divide-neutral-700">
        {INTEGRATIONS.map((intg) => (
          <div key={intg.key} className="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
              style={{ background: intg.color }}
            >
              {intg.abbr}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {lang === 'ar' ? intg.nameAr : intg.nameEn}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {lang === 'ar' ? intg.descAr : intg.descEn}
              </p>
            </div>
            {intg.connected ? (
              <Badge variant="success" className="text-xs shrink-0">{t('متصل', 'Connected')}</Badge>
            ) : (
              <button
                type="button"
                className="fc-btn fc-btn-sm fc-btn-outline shrink-0 opacity-60 cursor-not-allowed"
                disabled
              >
                {t('ربط (قريباً)', 'Connect (Soon)')}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ──────────────── Main Page ──────────────── */
export default function SettingsPage() {
  const { lang, t } = useLang();
  const jwtUser = getUser();
  const [section, setSection] = useState<SectionKey>('clinic');

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
    <div className="fc-page">
      <div className="fc-page-head">
        <div>
          <h2 className="fc-page-title">{t('الإعدادات', 'Settings')}</h2>
          <p className="fc-page-sub">{t('إعدادات النظام والعيادة', 'System and clinic configuration')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar nav */}
        <div className="fc-card p-2 self-start">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const isActive = section === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setSection(s.key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-primary-50 text-primary-700 font-semibold dark:bg-primary-900/20 dark:text-primary-300'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-neutral-700/50'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1 text-start">{lang === 'ar' ? s.labelAr : s.labelEn}</span>
                {isActive && <ChevronRight className={`w-4 h-4 opacity-40 flex-shrink-0 ${lang === 'ar' ? 'rotate-180' : ''}`} />}
              </button>
            );
          })}
        </div>

        {/* Content card */}
        <div className="fc-card p-6 lg:col-span-3">
          {section === 'clinic'       && <ClinicInfoContent    t={t} lang={lang} />}
          {section === 'users'        && <UsersContent         t={t} lang={lang} />}
          {section === 'system'       && <SystemContent        t={t} lang={lang} />}
          {section === 'appearance'   && <AppearanceContent    t={t} lang={lang} />}
          {section === 'integrations' && <IntegrationsContent  t={t} lang={lang} />}
        </div>
      </div>
    </div>
  );
}
