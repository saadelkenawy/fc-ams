'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Edit3,
  Save,
  X,
  Loader2,
  User,
  Phone,
  Calendar,
  Droplets,
  AlertCircle,
  ClipboardList,
  Paperclip,
  Upload,
  FileText,
  Download,
  Trash2,
  Pill,
  Printer,
  Plus,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { PrescriptionForm } from '@/components/prescriptions/PrescriptionForm';
import { PrescriptionPrintTemplate } from '@/components/prescriptions/PrescriptionPrintTemplate';
import { useLang } from '@/contexts/LanguageContext';
import { formatDate, cn } from '@/lib/utils';
import { usePatient } from '@/hooks/usePatients';
import { useAppointments } from '@/hooks/useAppointments';
import { useDoctorMap } from '@/hooks/useDoctors';
import { patientApi, ehrApi } from '@/lib/api';
import { useEntityFiles, useUploadFile, useDeleteFile } from '@/hooks/useFiles';
import type { Patient, UpdatePatientInput, Prescription } from '@fadl/types';

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = 'demographics' | 'visits' | 'files' | 'prescriptions';

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

const APPT_STATUS_LABEL: Record<string, { ar: string; en: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'outline' | 'purple' }> = {
  'TBC':   { ar: 'تأكيد مطلوب', en: 'Pending Confirm', variant: 'warning' },
  'Ok!':   { ar: 'مؤكد',        en: 'Confirmed',       variant: 'info'    },
  'Conf.': { ar: 'تم التأكيد',  en: 'Confirmed',       variant: 'success' },
  'Comp.': { ar: 'مكتمل',       en: 'Completed',       variant: 'default' },
  'Canc.': { ar: 'ملغى',        en: 'Cancelled',       variant: 'danger'  },
  'Resch.':{ ar: 'أُعيد جدولته', en: 'Rescheduled',   variant: 'purple'  },
  'Inf.':  { ar: 'مُبلَّغ',      en: 'Informed',        variant: 'outline' },
};

// ─── Edit form schema ─────────────────────────────────────────────────────────

const editSchema = z.object({
  nameEn:                 z.string().min(2),
  nameAr:                 z.string().optional(),
  nationalId:             z.string().optional(),
  dateOfBirth:            z.string().optional(),
  gender:                 z.enum(['M', 'F']).optional(),
  bloodType:              z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).optional(),
  address:                z.string().optional(),
  email:                  z.string().email().optional().or(z.literal('')),
  emergencyContactName:   z.string().optional(),
  emergencyContactMobile: z.string().optional(),
  preferredLanguage:      z.enum(['ar', 'en']),
});
type EditFormValues = z.infer<typeof editSchema>;

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PatientDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { lang, t } = useLang();
  const [tab, setTab] = useState<Tab>('demographics');
  const [editing, setEditing] = useState(false);

  const { data: patient, isLoading, isError } = usePatient(params.id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin me-2" />
        {t('جاري التحميل...', 'Loading...')}
      </div>
    );
  }

  if (isError || !patient) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertCircle className="w-8 h-8 text-red-400" />
        <p className="text-sm text-gray-500 dark:text-gray-300">
          {t('تعذّر تحميل بيانات المريض', 'Failed to load patient')}
        </p>
        <Button variant="outline" size="sm" onClick={() => router.back()}>
          {t('رجوع', 'Go back')}
        </Button>
      </div>
    );
  }

  const displayName = lang === 'ar' ? (patient.nameAr ?? patient.nameEn) : patient.nameEn;

  return (
    <div className="space-y-5 max-w-5xl mx-auto" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        >
          <ArrowLeft className={cn('w-5 h-5', lang === 'ar' && 'rotate-180')} />
        </button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold font-display text-gray-900 dark:text-gray-100">{displayName}</h2>
          <p className="text-xs text-gray-400 dark:text-gray-300 font-mono mt-0.5" dir="ltr">{patient.patientId}</p>
        </div>
        <Button
          variant={editing ? 'outline' : 'secondary'}
          size="sm"
          onClick={() => setEditing((e) => !e)}
        >
          {editing ? (
            <><X className="w-4 h-4" />{t('إلغاء', 'Cancel')}</>
          ) : (
            <><Edit3 className="w-4 h-4" />{t('تعديل', 'Edit')}</>
          )}
        </Button>
      </div>

      {/* Avatar + quick stats */}
      <div className="flex items-center gap-5 p-5 bg-white dark:bg-neutral-800 rounded-2xl border border-gray-100 dark:border-neutral-700 shadow-sm">
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-bold text-white flex-shrink-0"
          style={{ background: 'var(--gradient-sidebar)' }}
        >
          {displayName.charAt(0)}
        </div>
        <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <QuickStat
            icon={<Phone className="w-3.5 h-3.5" />}
            label={t('الموبايل', 'Mobile')}
            value={patient.mobile}
          />
          <QuickStat
            icon={<Calendar className="w-3.5 h-3.5" />}
            label={t('تاريخ الميلاد', 'Date of Birth')}
            value={patient.dateOfBirth ? formatDate(patient.dateOfBirth, lang === 'ar' ? 'ar-EG' : 'en-US') : '—'}
          />
          <QuickStat
            icon={<Droplets className="w-3.5 h-3.5" />}
            label={t('فصيلة الدم', 'Blood Type')}
            value={patient.bloodType ?? '—'}
          />
          <QuickStat
            icon={<User className="w-3.5 h-3.5" />}
            label={t('الجنس', 'Gender')}
            value={patient.gender === 'M' ? t('ذكر', 'Male') : patient.gender === 'F' ? t('أنثى', 'Female') : '—'}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-100 dark:border-neutral-700">
        {([
          { key: 'demographics',  ar: 'البيانات الأساسية', en: 'Demographics'   },
          { key: 'visits',        ar: 'سجل الزيارات',      en: 'Visit History'  },
          { key: 'prescriptions', ar: 'الوصفات الطبية',    en: 'Prescriptions'  },
          { key: 'files',         ar: 'الملفات والمستندات', en: 'Files'         },
        ] as const).map((tab_) => (
          <button
            key={tab_.key}
            onClick={() => setTab(tab_.key)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === tab_.key
                ? 'border-primary-600 text-primary-700 dark:text-primary-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
            )}
          >
            {t(tab_.ar, tab_.en)}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'demographics' ? (
        editing ? (
          <EditDemographicsForm patient={patient} lang={lang} t={t} onDone={() => setEditing(false)} />
        ) : (
          <DemographicsView patient={patient} lang={lang} t={t} />
        )
      ) : tab === 'visits' ? (
        <VisitHistoryTab patientId={patient.patientId} lang={lang} t={t} />
      ) : tab === 'prescriptions' ? (
        <PrescriptionsTab patient={patient} lang={lang} t={t} />
      ) : (
        <PatientFilesTab patientId={patient.patientId} lang={lang} t={t} />
      )}
    </div>
  );
}

// ─── Quick stat chip ──────────────────────────────────────────────────────────

function QuickStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-400 mb-0.5">
        {icon}
        {label}
      </div>
      <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{value}</p>
    </div>
  );
}

// ─── Demographics read view ───────────────────────────────────────────────────

function DemographicsView({
  patient,
  lang,
  t,
}: {
  patient: Patient;
  lang: 'ar' | 'en';
  t: (ar: string, en: string) => string;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <Card>
        <CardHeader><CardTitle><User className="w-4 h-4" />{t('البيانات الشخصية', 'Personal Info')}</CardTitle></CardHeader>
        <CardContent className="space-y-3 pt-1">
          <InfoRow label={t('الاسم بالإنجليزية', 'Name (EN)')} value={patient.nameEn} />
          <InfoRow label={t('الاسم بالعربية', 'Name (AR)')} value={patient.nameAr} />
          <InfoRow label={t('الرقم القومي', 'National ID')} value={patient.nationalId} mono />
          <InfoRow
            label={t('تاريخ الميلاد', 'Date of Birth')}
            value={patient.dateOfBirth ? formatDate(patient.dateOfBirth, lang === 'ar' ? 'ar-EG' : 'en-US') : undefined}
          />
          <InfoRow
            label={t('الجنس', 'Gender')}
            value={patient.gender === 'M' ? t('ذكر', 'Male') : patient.gender === 'F' ? t('أنثى', 'Female') : undefined}
          />
          <InfoRow label={t('فصيلة الدم', 'Blood Type')} value={patient.bloodType} />
          <InfoRow
            label={t('اللغة المفضلة', 'Preferred Language')}
            value={patient.preferredLanguage === 'ar' ? 'العربية' : 'English'}
          />
        </CardContent>
      </Card>

      <div className="space-y-5">
        <Card>
          <CardHeader><CardTitle><Phone className="w-4 h-4" />{t('بيانات التواصل', 'Contact')}</CardTitle></CardHeader>
          <CardContent className="space-y-3 pt-1">
            <InfoRow label={t('الموبايل', 'Mobile')} value={patient.mobile} mono />
            <InfoRow label={t('البريد الإلكتروني', 'Email')} value={patient.email} />
            <InfoRow label={t('العنوان', 'Address')} value={patient.address} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle><AlertCircle className="w-4 h-4" />{t('الإسعافات', 'Emergency Contact')}</CardTitle></CardHeader>
          <CardContent className="space-y-3 pt-1">
            <InfoRow label={t('الاسم', 'Name')} value={patient.emergencyContactName} />
            <InfoRow label={t('الموبايل', 'Mobile')} value={patient.emergencyContactMobile} mono />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle><ClipboardList className="w-4 h-4" />{t('بيانات إدارية', 'Administrative')}</CardTitle></CardHeader>
          <CardContent className="space-y-3 pt-1">
            <InfoRow label={t('مصدر أول زيارة', 'First Visit Source')} value={patient.sourceFirstVisit} />
            {patient.isFutureSource && (
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-gray-500 dark:text-gray-400 shrink-0">{t('مصدر مستقبلي', 'Future Source')}</span>
                <span
                  title={
                    patient.futureSourceSetAt
                      ? t(
                          `مسجل في ${formatDate(patient.futureSourceSetAt, 'ar-EG')}`,
                          `Registered as future Cl.'s referral source on ${formatDate(patient.futureSourceSetAt, 'en-US')}`,
                        )
                      : undefined
                  }
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-primary-400/50 text-primary-600 dark:text-primary-400 text-xs font-medium cursor-default"
                >
                  ◈ {t("مصدر Cl.'s المستقبلي", "Future Cl.'s Source")}
                </span>
              </div>
            )}
            <InfoRow
              label={t('تاريخ التسجيل', 'Registered')}
              value={formatDate(patient.createdAt, lang === 'ar' ? 'ar-EG' : 'en-US')}
            />
            <InfoRow label={t('الفرع', 'Branch')} value={String(patient.branchId)} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-gray-500 dark:text-gray-400 shrink-0">{label}</span>
      <span className={cn(
        'text-gray-900 dark:text-gray-100 text-end',
        mono && 'font-mono text-xs',
        !value && 'text-gray-300 dark:text-gray-600',
      )}>
        {value ?? '—'}
      </span>
    </div>
  );
}

// ─── Edit demographics form ───────────────────────────────────────────────────

function EditDemographicsForm({
  patient,
  lang,
  t,
  onDone,
}: {
  patient: Patient;
  lang: 'ar' | 'en';
  t: (ar: string, en: string) => string;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState('');

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      nameEn:                 patient.nameEn,
      nameAr:                 patient.nameAr ?? '',
      nationalId:             patient.nationalId ?? '',
      dateOfBirth:            patient.dateOfBirth ?? '',
      gender:                 patient.gender,
      bloodType:              patient.bloodType,
      address:                patient.address ?? '',
      email:                  patient.email ?? '',
      emergencyContactName:   patient.emergencyContactName ?? '',
      emergencyContactMobile: patient.emergencyContactMobile ?? '',
      preferredLanguage:      patient.preferredLanguage,
    },
  });

  async function onSubmit(values: EditFormValues) {
    setServerError('');
    const payload: UpdatePatientInput = {
      version: patient.version,
      nameEn:  values.nameEn,
      ...(values.nameAr                 && { nameAr:                 values.nameAr }),
      ...(values.nationalId             && { nationalId:             values.nationalId }),
      ...(values.dateOfBirth            && { dateOfBirth:            values.dateOfBirth }),
      ...(values.gender                 && { gender:                 values.gender }),
      ...(values.bloodType              && { bloodType:              values.bloodType }),
      ...(values.address                && { address:                values.address }),
      ...(values.email                  && { email:                  values.email }),
      ...(values.emergencyContactName   && { emergencyContactName:   values.emergencyContactName }),
      ...(values.emergencyContactMobile && { emergencyContactMobile: values.emergencyContactMobile }),
      preferredLanguage: values.preferredLanguage,
    };

    try {
      await patientApi.patch(`/patients/${patient.patientId}`, payload);
      await queryClient.invalidateQueries({ queryKey: ['patient', patient.patientId] });
      onDone();
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 409) {
        setServerError(t('تعارض في البيانات؛ أعد المحاولة', 'Conflict; please refresh and try again'));
      } else {
        setServerError(t('تعذّر الحفظ، حاول مرة أخرى', 'Failed to save, please try again'));
      }
    }
  }

  const field = (
    id: keyof EditFormValues,
    labelAr: string,
    labelEn: string,
    opts?: { type?: string; placeholder?: string },
  ) => (
    <Input
      id={id}
      label={labelEn}
      labelAr={labelAr}
      type={opts?.type ?? 'text'}
      placeholder={opts?.placeholder}
      lang={lang}
      error={errors[id]?.message}
      {...register(id)}
    />
  );

  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card>
          <CardHeader><CardTitle>{t('البيانات الشخصية', 'Personal Info')}</CardTitle></CardHeader>
          <CardContent className="space-y-4 pt-1">
            {field('nameEn',    'الاسم بالإنجليزية', 'Name (EN)')}
            {field('nameAr',    'الاسم بالعربية',    'Name (AR)')}
            {field('nationalId','الرقم القومي',      'National ID')}
            {field('dateOfBirth','تاريخ الميلاد',    'Date of Birth', { type: 'date' })}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('الجنس', 'Gender')}
                </label>
                <select
                  className="w-full h-11 rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-600"
                  {...register('gender')}
                >
                  <option value="">{t('غير محدد', 'Not specified')}</option>
                  <option value="M">{t('ذكر', 'Male')}</option>
                  <option value="F">{t('أنثى', 'Female')}</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('فصيلة الدم', 'Blood Type')}
                </label>
                <select
                  className="w-full h-11 rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-600"
                  {...register('bloodType')}
                >
                  <option value="">{t('غير محدد', 'Not specified')}</option>
                  {BLOOD_TYPES.map((bt) => <option key={bt} value={bt}>{bt}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('اللغة المفضلة', 'Preferred Language')}
              </label>
              <select
                className="w-full h-11 rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-600"
                {...register('preferredLanguage')}
              >
                <option value="ar">العربية</option>
                <option value="en">English</option>
              </select>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle>{t('بيانات التواصل', 'Contact')}</CardTitle></CardHeader>
            <CardContent className="space-y-4 pt-1">
              {field('email',   'البريد الإلكتروني', 'Email',   { type: 'email' })}
              {field('address', 'العنوان',            'Address')}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t('جهة الطوارئ', 'Emergency Contact')}</CardTitle></CardHeader>
            <CardContent className="space-y-4 pt-1">
              {field('emergencyContactName',   'الاسم',    'Name')}
              {field('emergencyContactMobile', 'الموبايل', 'Mobile')}
            </CardContent>
          </Card>
        </div>
      </div>

      {serverError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {serverError}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          {t('إلغاء', 'Cancel')}
        </Button>
        <Button type="submit" size="sm" loading={isSubmitting}>
          <Save className="w-4 h-4" />
          {t('حفظ التغييرات', 'Save Changes')}
        </Button>
      </div>
    </form>
  );
}

// ─── Visit history tab ────────────────────────────────────────────────────────

function VisitHistoryTab({
  patientId,
  lang,
  t,
}: {
  patientId: string;
  lang: 'ar' | 'en';
  t: (ar: string, en: string) => string;
}) {
  const { data, isLoading, isError } = useAppointments({ patientId, limit: 100 });
  const doctorMap = useDoctorMap();

  const appointments = data?.data ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin me-2" />
        {t('جاري التحميل...', 'Loading...')}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="py-12 text-center text-red-500 dark:text-red-400 text-sm">
        {t('تعذّر تحميل الزيارات', 'Failed to load visit history')}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t(`${appointments.length} زيارة`, `${appointments.length} visits`)}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 pt-0">
        {appointments.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-gray-400 dark:text-gray-300">
            {t('لا توجد زيارات مسجلة', 'No visits recorded')}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50 dark:border-neutral-700 bg-gray-50/50 dark:bg-neutral-900/40">
                  <th className="text-start px-5 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
                    {t('التاريخ', 'Date')}
                  </th>
                  <th className="text-start px-5 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
                    {t('الطبيب', 'Doctor')}
                  </th>
                  <th className="text-start px-5 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
                    {t('النوع', 'Type')}
                  </th>
                  <th className="text-start px-5 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
                    {t('الحالة', 'Status')}
                  </th>
                  <th className="text-start px-5 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
                    {t('الرسوم', 'Fee')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {appointments.map((a) => {
                  const doctor = doctorMap.get(a.doctorId);
                  const doctorName = doctor
                    ? (lang === 'ar' ? (doctor.nameAr ?? doctor.nameEn) : doctor.nameEn)
                    : a.doctorId.slice(-6).toUpperCase();
                  const statusInfo = APPT_STATUS_LABEL[a.status] ?? { ar: a.status, en: a.status, variant: 'default' as const };

                  return (
                    <tr key={a.id} className="border-b border-gray-50 dark:border-neutral-700/50 hover:bg-gray-50/50 dark:hover:bg-neutral-700/20 transition-colors">
                      <td className="px-5 py-3.5 text-gray-700 dark:text-gray-200">
                        {formatDate(a.appointmentDate, lang === 'ar' ? 'ar-EG' : 'en-US')}
                        <span className="ms-2 text-xs text-gray-400 dark:text-gray-400 font-mono">{a.startTime}</span>
                      </td>
                      <td className="px-5 py-3.5 text-gray-700 dark:text-gray-200">{doctorName}</td>
                      <td className="px-5 py-3.5">
                        <Badge variant="outline" className="text-[11px]">
                          {a.appointmentType}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge variant={statusInfo.variant}>
                          {lang === 'ar' ? statusInfo.ar : statusInfo.en}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 text-gray-700 dark:text-gray-200 font-mono text-xs">
                        {a.approvedCharge != null ? `${a.approvedCharge} EGP` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Patient files tab ────────────────────────────────────────────────────────

function PatientFilesTab({
  patientId,
  lang,
  t,
}: {
  patientId: string;
  lang: 'ar' | 'en';
  t: (ar: string, en: string) => string;
}) {
  const { data: files, isLoading } = useEntityFiles('patient', patientId);
  const upload = useUploadFile('patient', patientId);
  const remove = useDeleteFile('patient', patientId);
  const [dragOver, setDragOver] = useState(false);

  function handleFiles(fileList: FileList | null) {
    if (!fileList) return;
    Array.from(fileList).forEach((f) => upload.mutate(f));
  }

  function humanSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  const MIME_ICON: Record<string, React.ReactNode> = {
    'application/pdf': <FileText className="w-4 h-4 text-red-400" />,
    'image/jpeg': <FileText className="w-4 h-4 text-blue-400" />,
    'image/png':  <FileText className="w-4 h-4 text-blue-400" />,
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle><Paperclip className="w-4 h-4" />{t('الملفات والمستندات', 'Files & Documents')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Drop zone */}
        <label
          className={cn(
            'flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-6 cursor-pointer transition-colors',
            dragOver
              ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20'
              : 'border-gray-200 dark:border-neutral-600 hover:border-primary-300 dark:hover:border-primary-700',
          )}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        >
          <input
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.webp,.txt"
            className="sr-only"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <Upload className="w-6 h-6 text-gray-400" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('اسحب ملفات هنا أو اضغط للرفع', 'Drag files here or click to upload')}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {t('PDF، صور (بحد أقصى 50 ميجابايت)', 'PDF, images (max 50 MB)')}
          </p>
          {upload.isPending && (
            <div className="flex items-center gap-2 text-xs text-primary-600">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {t('جاري الرفع...', 'Uploading...')}
            </div>
          )}
          {upload.isError && (
            <p className="text-xs text-red-500">{t('فشل الرفع', 'Upload failed')}</p>
          )}
        </label>

        {/* File list */}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-12 rounded-xl bg-gray-100 dark:bg-neutral-700 animate-pulse" />
            ))}
          </div>
        ) : !files || files.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
            {t('لا توجد ملفات مرفوعة', 'No files uploaded yet')}
          </p>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-neutral-700">
            {files.map((file) => (
              <div key={file.id} className="flex items-center gap-3 py-3">
                <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-neutral-700 flex items-center justify-center flex-shrink-0">
                  {MIME_ICON[file.mimeType] ?? <FileText className="w-4 h-4 text-gray-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{file.originalName}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{humanSize(file.sizeBytes)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <a
                    href={`/api/proxy/files/files/${file.id}/download`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-700 text-gray-400 hover:text-primary-600 transition-colors"
                    title={t('تحميل', 'Download')}
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>
                  <button
                    onClick={() => remove.mutate(file.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors"
                    title={t('حذف', 'Delete')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Prescriptions tab ────────────────────────────────────────────────────────

const RX_PRINT_STYLE = `
  @media screen { #rx-print-root { display: none !important; } }
  @media print {
    body > *:not(#rx-print-root) { display: none !important; }
    #rx-print-root { display: block !important; }
    @page { size: A4; margin: 0; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  }
`;

const RX_STATUS_BADGE: Record<string, 'success' | 'info' | 'outline'> = {
  active:    'success',
  dispensed: 'info',
  cancelled: 'outline',
};

const RX_STATUS_LABEL: Record<string, { ar: string; en: string }> = {
  active:    { ar: 'نشطة',  en: 'Active'    },
  dispensed: { ar: 'صُرفت', en: 'Dispensed' },
  cancelled: { ar: 'ملغاة', en: 'Cancelled' },
};

function PrescriptionsTab({
  patient,
  lang,
  t,
}: {
  patient: Patient;
  lang: 'ar' | 'en';
  t: (ar: string, en: string) => string;
}) {
  const doctorMap            = useDoctorMap();
  const [showNew, setShowNew] = useState(false);
  const [printRx, setPrintRx] = useState<Prescription | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['prescriptions', { patientId: patient.patientId }],
    queryFn: async () => {
      const res = await ehrApi.get('/api/v1/prescriptions', {
        params: { patientId: patient.patientId, limit: 100 },
      });
      return (res.data as { data: Prescription[] }).data;
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!printRx) return;
    const id = setTimeout(() => {
      window.print();
      setPrintRx(null);
    }, 150);
    return () => clearTimeout(id);
  }, [printRx]);

  const rxList = data ?? [];

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>
            <Pill className="w-4 h-4" />
            {t(`${rxList.length} وصفة`, `${rxList.length} prescriptions`)}
          </CardTitle>
          <Button variant="primary" size="sm" onClick={() => setShowNew(true)}>
            <Plus className="w-4 h-4" />
            {t('وصفة جديدة', 'New Prescription')}
          </Button>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading && (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin me-2" />
              {t('جاري التحميل…', 'Loading…')}
            </div>
          )}

          {isError && (
            <p className="py-10 text-center text-sm text-red-500">
              {t('تعذّر تحميل الوصفات', 'Failed to load prescriptions')}
            </p>
          )}

          {!isLoading && rxList.length === 0 && (
            <div className="py-14 flex flex-col items-center gap-2 text-gray-400">
              <Pill className="w-8 h-8 opacity-30" />
              <p className="text-sm">{t('لا توجد وصفات طبية', 'No prescriptions yet')}</p>
            </div>
          )}

          {rxList.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-50 dark:border-neutral-700 bg-gray-50/50 dark:bg-neutral-900/40">
                    {[
                      t('التاريخ', 'Date'),
                      t('الطبيب', 'Doctor'),
                      t('الأدوية', 'Medications'),
                      t('الحالة', 'Status'),
                      '',
                    ].map((h, i) => (
                      <th
                        key={i}
                        className="text-start px-5 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rxList.map((rx) => {
                    const doctor = doctorMap.get(rx.doctorId);
                    const doctorName = doctor
                      ? (lang === 'ar' ? (doctor.nameAr ?? doctor.nameEn) : doctor.nameEn)
                      : rx.doctorId.slice(-6).toUpperCase();

                    return (
                      <tr
                        key={rx.id}
                        className="border-b border-gray-50 dark:border-neutral-700/50 hover:bg-gray-50/50 dark:hover:bg-neutral-700/20 transition-colors"
                      >
                        <td className="px-5 py-3.5 text-gray-700 dark:text-gray-200 whitespace-nowrap">
                          {formatDate(rx.createdAt, lang === 'ar' ? 'ar-EG' : 'en-US')}
                        </td>
                        <td className="px-5 py-3.5 text-gray-700 dark:text-gray-200">
                          {doctorName}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex flex-wrap gap-1">
                            {rx.items.slice(0, 2).map((it) => (
                              <span
                                key={it.id}
                                className="rounded-full bg-gray-100 dark:bg-neutral-700 px-2 py-0.5 text-xs text-gray-700 dark:text-gray-300"
                              >
                                {it.medicationName}
                              </span>
                            ))}
                            {rx.items.length > 2 && (
                              <span className="text-xs text-gray-400">+{rx.items.length - 2}</span>
                            )}
                          </div>
                          {rx.diagnosis && (
                            <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500 truncate max-w-xs">
                              {rx.diagnosis}
                            </p>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <Badge variant={RX_STATUS_BADGE[rx.status] ?? 'outline'}>
                            {lang === 'ar' ? RX_STATUS_LABEL[rx.status]?.ar : RX_STATUS_LABEL[rx.status]?.en}
                          </Badge>
                        </td>
                        <td className="px-5 py-3.5">
                          <button
                            onClick={() => setPrintRx(rx)}
                            title={t('طباعة', 'Print')}
                            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-700 text-gray-400 hover:text-primary-600 transition-colors"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* New prescription modal */}
      <Modal open={showNew} onClose={() => setShowNew(false)} title="">
        <PrescriptionForm
          patientId={patient.patientId}
          doctorId=""
          onSuccess={() => { setShowNew(false); void refetch(); }}
          onCancel={() => setShowNew(false)}
        />
      </Modal>

      {/* Print portal */}
      {printRx && typeof document !== 'undefined' && createPortal(
        <>
          <style dangerouslySetInnerHTML={{ __html: RX_PRINT_STYLE }} />
          <div id="rx-print-root">
            <PrescriptionPrintTemplate
              rx={printRx}
              patient={patient}
              doctorName={
                (() => {
                  const d = doctorMap.get(printRx.doctorId);
                  return d ? (lang === 'ar' ? (d.nameAr ?? d.nameEn) : d.nameEn) : undefined;
                })()
              }
            />
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
