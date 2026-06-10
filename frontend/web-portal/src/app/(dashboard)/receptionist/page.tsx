'use client';

import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Plus, CheckCircle, Clock, UserCheck, AlertTriangle, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { AppointmentStatusBadge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { useLang } from '@/contexts/LanguageContext';
import { formatTime } from '@/lib/utils';
import { usePatients, usePatientBatch } from '@/hooks/usePatients';
import { useDebounce } from '@/hooks/useDebounce';
import { useTodayAppointments } from '@/hooks/useAppointments';
import { useDoctors } from '@/hooks/useDoctors';
import { appointmentApi, patientApi } from '@/lib/api';
import type { Appointment, AppointmentType, Patient, PatientSource } from '@fadl/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NewAppointmentForm {
  patientId: string;
  doctorId: string;
  date: string;
  startTime: string;
  endTime: string;
  appointmentType: AppointmentType;
  patientSource: PatientSource;
}

interface RegisterPatientForm {
  nameEn: string;
  mobile: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + mins;
  const hh = String(Math.floor(total / 60) % 24).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function makeIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ---------------------------------------------------------------------------
// Sub-component: Patient lookup
// ---------------------------------------------------------------------------

interface PatientLookupProps {
  lang: 'ar' | 'en';
  t: (ar: string, en: string) => string;
  selectedPatient: Patient | null;
  onSelect: (p: Patient) => void;
  onRegisterClick: () => void;
}

function PatientLookup({ lang, t, selectedPatient, onSelect, onRegisterClick }: PatientLookupProps) {
  const [searchVal, setSearchVal] = useState('');
  const debouncedSearch = useDebounce(searchVal, 300);
  const enabled = debouncedSearch.length >= 2;
  const { data, isFetching } = usePatients(
    enabled ? { query: debouncedSearch, limit: 10 } : {},
  );
  const results: Patient[] = enabled ? (data?.data ?? []) : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('بحث عن مريض', 'Patient Lookup')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {selectedPatient && (
          <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-lg px-3 py-2 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                {lang === 'ar' ? (selectedPatient.nameAr ?? selectedPatient.nameEn) : selectedPatient.nameEn}
              </p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400">{selectedPatient.mobile}</p>
            </div>
            <button
              type="button"
              onClick={() => onSelect(null as unknown as Patient)}
              className="text-emerald-500 hover:text-emerald-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <Input
          placeholder={t('موبايل أو اسم...', 'Mobile or name...')}
          icon={<Search className="w-4 h-4" />}
          value={searchVal}
          onChange={(e) => setSearchVal(e.target.value)}
          lang={lang}
        />

        {isFetching && enabled && (
          <p className="text-xs text-gray-400 text-center py-2">{t('جاري البحث...', 'Searching...')}</p>
        )}

        {!isFetching && enabled && results.length === 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-300 text-center py-4">
            {t('لا يوجد مريض بهذا الاسم أو الرقم', 'No patient matches that name or number.')}
          </p>
        )}

        {results.length > 0 && (
          <ul className="divide-y divide-gray-100 dark:divide-neutral-700 rounded-lg border border-gray-100 dark:border-neutral-700 overflow-hidden">
            {results.map((p) => (
              <li key={p.patientId}>
                <button
                  type="button"
                  onClick={() => { onSelect(p); setSearchVal(''); }}
                  className="w-full text-start px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-neutral-700/50 transition-colors"
                >
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {lang === 'ar' ? (p.nameAr ?? p.nameEn) : p.nameEn}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-300">{p.mobile}</p>
                </button>
              </li>
            ))}
          </ul>
        )}

        {!enabled && (
          <p className="text-xs text-gray-400 dark:text-gray-300 text-center py-4">
            {t('أدخل الموبايل أو الاسم للبحث', 'Enter mobile or name to search')}
          </p>
        )}

        <Button variant="secondary" className="w-full" size="sm" onClick={onRegisterClick}>
          <Plus className="w-4 h-4" />
          {t('تسجيل مريض جديد', 'Register New Patient')}
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: Register Patient Modal
// ---------------------------------------------------------------------------

interface RegisterPatientModalProps {
  lang: 'ar' | 'en';
  t: (ar: string, en: string) => string;
  onClose: () => void;
  onCreated: (p: Patient) => void;
}

function RegisterPatientModal({ lang, t, onClose, onCreated }: RegisterPatientModalProps) {
  const [form, setForm] = useState<RegisterPatientForm>({ nameEn: '', mobile: '' });
  const [error, setError] = useState('');

  const { mutate, isPending } = useMutation({
    mutationFn: async (input: RegisterPatientForm) => {
      const { data } = await patientApi.post<{ data: Patient }>('/patients', {
        nameEn: input.nameEn,
        mobile: input.mobile,
      });
      return data.data;
    },
    onSuccess: (patient) => {
      onCreated(patient);
      onClose();
    },
    onError: () => setError(t('تعذّر التسجيل. تحقق من البيانات وأعد المحاولة.', "Couldn't register patient. Check the details and try again.")),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
            {t('تسجيل مريض جديد', 'Register New Patient')}
          </h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="w-4 h-4" />
          </button>
        </div>
        <Input
          label="Full Name (EN)"
          placeholder="Sara Mahmoud"
          value={form.nameEn}
          onChange={(e) => setForm((f) => ({ ...f, nameEn: e.target.value }))}
          lang={lang}
        />
        <Input
          label={t('الموبايل', 'Mobile')}
          placeholder="+201XXXXXXXXX"
          value={form.mobile}
          onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value }))}
          lang={lang}
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex gap-2 pt-1">
          <Button
            className="flex-1"
            loading={isPending}
            onClick={() => mutate(form)}
            disabled={!form.nameEn || !form.mobile}
          >
            {t('حفظ', 'Save')}
          </Button>
          <Button variant="outline" onClick={onClose}>{t('إلغاء', 'Cancel')}</Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: New Appointment Form
// ---------------------------------------------------------------------------

interface NewAppointmentFormPanelProps {
  lang: 'ar' | 'en';
  t: (ar: string, en: string) => string;
  initialPatient: Patient | null;
  onClose: () => void;
  onSuccess: () => void;
}

const PATIENT_SOURCES: PatientSource[] = ["Cl.'s", "Dr.'s", 'VEZ', 'EKF', 'DO', 'SHL'];

function NewAppointmentFormPanel({ lang, t, initialPatient, onClose, onSuccess }: NewAppointmentFormPanelProps) {
  const queryClient = useQueryClient();
  const { data: doctorsData } = useDoctors({ isActive: true, limit: 100 });
  const doctors = doctorsData?.data ?? [];

  const defaultStart = '09:00';
  const [form, setForm] = useState<NewAppointmentForm>({
    patientId: initialPatient?.patientId ?? '',
    doctorId: '',
    date: todayIso(),
    startTime: defaultStart,
    endTime: addMinutes(defaultStart, 30),
    appointmentType: 'in_person',
    patientSource: "Cl.'s",
  });
  const [patientSearch, setPatientSearch] = useState(
    initialPatient
      ? (lang === 'ar' ? (initialPatient.nameAr ?? initialPatient.nameEn) : initialPatient.nameEn)
      : '',
  );
  const debouncedPatientSearch = useDebounce(patientSearch, 300);
  const patientSearchEnabled = !form.patientId && debouncedPatientSearch.length >= 2;
  const { data: patientResults } = usePatients(
    patientSearchEnabled ? { query: debouncedPatientSearch, limit: 5 } : {},
  );
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const { mutate, isPending } = useMutation({
    mutationFn: async (payload: NewAppointmentForm) => {
      const { data } = await appointmentApi.post<{ data: Appointment }>('/appointments', {
        patientId: payload.patientId,
        doctorId: payload.doctorId,
        appointmentDate: payload.date,
        startTime: payload.startTime,
        endTime: payload.endTime,
        appointmentType: payload.appointmentType,
        patientSource: payload.patientSource,
        idempotencyKey: makeIdempotencyKey(),
        specialtyId: doctors.find((d) => d.id === payload.doctorId)?.specialtyId ?? 0,
      });
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      setSuccess(true);
      setTimeout(onSuccess, 800);
    },
    onError: (err: { response?: { data?: { error?: { code?: string } } } }) => {
      if (err.response?.data?.error?.code === 'DOUBLE_BOOKING') {
        setError(t('هذا الوقت محجوز بالفعل، اختر وقتاً مختلفاً.', 'This slot is already taken. Please choose a different time.'));
      } else {
        setError(t('لم يُحفظ الموعد. حاول مرة أخرى.', 'Appointment not saved. Refresh and try again.'));
      }
    },
  });

  function handleStartTimeChange(val: string) {
    setForm((f) => ({ ...f, startTime: val, endTime: addMinutes(val, 30) }));
  }

  function selectPatient(p: Patient) {
    setForm((f) => ({ ...f, patientId: p.patientId }));
    setPatientSearch(lang === 'ar' ? (p.nameAr ?? p.nameEn) : p.nameEn);
  }

  const canSubmit = !!form.patientId && !!form.doctorId && !!form.date && !!form.startTime && !!form.endTime;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-xl w-full max-w-lg mx-4 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
            {t('موعد جديد', 'New Appointment')}
          </h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        {success && (
          <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-lg px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            {t('تم حفظ الموعد بنجاح', 'Appointment saved successfully')}
          </div>
        )}

        {/* Patient field */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('المريض', 'Patient')}
          </label>
          {form.patientId ? (
            <div className="flex items-center justify-between bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-lg px-3 py-2">
              <span className="text-sm text-emerald-800 dark:text-emerald-300">{patientSearch}</span>
              <button
                type="button"
                onClick={() => { setForm((f) => ({ ...f, patientId: '' })); setPatientSearch(''); }}
                className="text-emerald-500 hover:text-emerald-700"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Input
                placeholder={t('ابحث عن مريض...', 'Search patient...')}
                icon={<Search className="w-4 h-4" />}
                value={patientSearch}
                onChange={(e) => setPatientSearch(e.target.value)}
                lang={lang}
              />
              {patientSearchEnabled && (patientResults?.data ?? []).length > 0 && (
                <ul className="absolute z-10 w-full mt-1 bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-600 rounded-lg shadow-lg overflow-hidden">
                  {(patientResults?.data ?? []).map((p) => (
                    <li key={p.patientId}>
                      <button
                        type="button"
                        onClick={() => selectPatient(p)}
                        className="w-full text-start px-3 py-2 hover:bg-gray-50 dark:hover:bg-neutral-700/50 text-sm"
                      >
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {lang === 'ar' ? (p.nameAr ?? p.nameEn) : p.nameEn}
                        </span>
                        <span className="text-gray-400 text-xs mx-2">{p.mobile}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Doctor */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('الطبيب', 'Doctor')}
          </label>
          <select
            value={form.doctorId}
            onChange={(e) => setForm((f) => ({ ...f, doctorId: e.target.value }))}
            className="w-full h-11 rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-4 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-600"
          >
            <option value="">{t('اختر طبيباً', 'Select doctor')}</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {lang === 'ar' ? (d.nameAr ?? d.nameEn) : d.nameEn}
              </option>
            ))}
          </select>
        </div>

        {/* Date */}
        <Input
          label={t('التاريخ', 'Date')}
          type="date"
          value={form.date}
          onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
          lang={lang}
        />

        {/* Start / End time */}
        <div className="grid grid-cols-2 gap-3">
          <Input
            label={t('وقت البداية', 'Start time')}
            type="time"
            value={form.startTime}
            onChange={(e) => handleStartTimeChange(e.target.value)}
            lang={lang}
          />
          <Input
            label={t('وقت النهاية', 'End time')}
            type="time"
            value={form.endTime}
            onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
            lang={lang}
          />
        </div>

        {/* Appointment type */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('نوع الموعد', 'Appointment type')}
          </label>
          <select
            value={form.appointmentType}
            onChange={(e) => setForm((f) => ({ ...f, appointmentType: e.target.value as AppointmentType }))}
            className="w-full h-11 rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-4 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-600"
          >
            <option value="in_person">{t('حضوري', 'In-person')}</option>
            <option value="online">{t('أونلاين', 'Online')}</option>
          </select>
        </div>

        {/* Patient source */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('مصدر المريض', 'Patient source')}
          </label>
          <select
            value={form.patientSource}
            onChange={(e) => setForm((f) => ({ ...f, patientSource: e.target.value as PatientSource }))}
            className="w-full h-11 rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-4 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-600"
          >
            {PATIENT_SOURCES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex gap-2 pt-1">
          <Button className="flex-1" loading={isPending} disabled={!canSubmit} onClick={() => mutate(form)}>
            {t('حفظ الموعد', 'Save Appointment')}
          </Button>
          <Button variant="outline" onClick={onClose}>{t('إلغاء', 'Cancel')}</Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: Queue skeleton
// ---------------------------------------------------------------------------

function QueueSkeleton() {
  return (
    <>
      {[1, 2, 3].map((n) => (
        <tr key={n} className="border-b border-gray-50 dark:border-neutral-700/50">
          {[1, 2, 3, 4, 5, 6].map((c) => (
            <td key={c} className="px-4 py-3">
              <div className="h-4 bg-gray-100 dark:bg-neutral-700 rounded animate-pulse" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ReceptionistPage() {
  const { lang, t } = useLang();
  const queryClient = useQueryClient();

  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const [showNewAppt, setShowNewAppt] = useState(false);

  const { data: apptData, isFetching: apptFetching } = useTodayAppointments();
  const appointments: Appointment[] = apptData?.data ?? [];
  const tbcAlerts = appointments.filter((a) => a.status === 'TBC');

  const patientIds = appointments.map((a) => a.patientId);
  const patientMap = usePatientBatch(patientIds);

  const { mutate: checkIn } = useMutation({
    mutationFn: (id: string) => appointmentApi.post(`/appointments/${id}/checkin`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['appointments'] }),
  });

  const { mutate: confirmTbc } = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      appointmentApi.patch(`/appointments/${id}/status`, { status: 'Ok!', version }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['appointments'] }),
  });

  const { mutate: cancelAppt } = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      appointmentApi.patch(`/appointments/${id}/status`, { status: 'Canc.', version }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['appointments'] }),
  });

  const { mutate: delayAppt } = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      appointmentApi.patch(`/appointments/${id}/status`, { status: 'Resch.', version }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['appointments'] }),
  });

  const handleSelectPatient = useCallback((p: Patient | null) => setSelectedPatient(p), []);

  const handlePatientCreated = useCallback((p: Patient) => {
    setSelectedPatient(p);
    setShowRegister(false);
  }, []);

  return (
    <div className="space-y-5" data-density="compact">
      {/* Modals */}
      {showRegister && (
        <RegisterPatientModal
          lang={lang}
          t={t}
          onClose={() => setShowRegister(false)}
          onCreated={handlePatientCreated}
        />
      )}
      {showNewAppt && (
        <NewAppointmentFormPanel
          lang={lang}
          t={t}
          initialPatient={selectedPatient}
          onClose={() => setShowNewAppt(false)}
          onSuccess={() => setShowNewAppt(false)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-bold font-display text-gray-900 dark:text-gray-100">
          {t('الإدخال السريع', 'Quick Entry')}
        </h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowRegister(true)}>
            <UserCheck className="w-4 h-4" />
            {t('تسجيل مريض', 'Register Patient')}
          </Button>
          <Button size="sm" onClick={() => setShowNewAppt(true)}>
            <Plus className="w-4 h-4" />
            {t('موعد جديد', 'New Appointment')}
          </Button>
        </div>
      </div>

      {/* TBC two-hour alerts */}
      {tbcAlerts.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              {t('تنبيهات قاعدة الساعتين', 'Two-Hour Rule Alerts')}
            </span>
          </div>
          <div className="space-y-2">
            {tbcAlerts.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between bg-white dark:bg-neutral-800 rounded-lg px-4 py-2.5 border border-amber-100 dark:border-amber-800/30"
              >
                <div>
                  <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                    {(() => {
                      const p = patientMap.get(a.patientId);
                      const name = p ? (lang === 'ar' ? (p.nameAr ?? p.nameEn) : p.nameEn) : `#${a.patientId.slice(0, 8)}`;
                      return name;
                    })()}
                  </span>
                  <span className="text-gray-400 text-xs mx-2">·</span>
                  <span className="text-amber-600 dark:text-amber-400 text-xs">
                    {formatTime(a.startTime)}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="success"
                    onClick={() => confirmTbc({ id: a.id, version: a.version })}
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    {t('تأكيد', 'Confirm')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => cancelAppt({ id: a.id, version: a.version })}
                  >
                    {t('إلغاء', 'Cancel')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Patient lookup */}
        <div className="lg:col-span-1">
          <PatientLookup
            lang={lang}
            t={t}
            selectedPatient={selectedPatient}
            onSelect={handleSelectPatient}
            onRegisterClick={() => setShowRegister(true)}
          />
        </div>

        {/* Live queue */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t('قائمة الانتظار المباشرة', 'Live Queue Board')}</CardTitle>
              <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                <span className="status-dot bg-emerald-500 w-1.5 h-1.5" />
                {t('مباشر', 'Live')}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-50 dark:border-neutral-700 bg-gray-50/50 dark:bg-neutral-900/40">
                    <th className="text-start px-4 py-2.5 font-medium text-gray-500 dark:text-gray-300 text-xs w-10">#</th>
                    <th className="text-start px-4 py-2.5 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('المريض', 'Patient')}</th>
                    <th className="text-start px-4 py-2.5 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('النوع', 'Type')}</th>
                    <th className="text-start px-4 py-2.5 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('الحالة', 'Status')}</th>
                    <th className="text-start px-4 py-2.5 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('الانتظار', 'Wait')}</th>
                    <th className="px-4 py-2.5 text-xs" />
                  </tr>
                </thead>
                <tbody>
                  {apptFetching && appointments.length === 0 ? (
                    <QueueSkeleton />
                  ) : appointments.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-300">
                        {t('لا توجد مواعيد مجدولة اليوم', 'No appointments scheduled for today.')}
                      </td>
                    </tr>
                  ) : (
                    appointments.map((a) => (
                      <tr
                        key={a.id}
                        className="border-b border-gray-50 dark:border-neutral-700/50 hover:bg-gray-50/50 dark:hover:bg-neutral-700/30 transition-colors"
                      >
                        <td className="px-4 py-3 font-bold text-gray-400 dark:text-gray-300 font-mono tabular-nums">
                          {a.queueNumber ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-gray-900 dark:text-gray-100">
                              {(() => {
                                const p = patientMap.get(a.patientId);
                                return p ? (lang === 'ar' ? (p.nameAr ?? p.nameEn) : p.nameEn) : `#${a.patientId.slice(0, 8)}`;
                              })()}
                            </p>
                            <p className="text-xs text-gray-400 dark:text-gray-300">
                              {formatTime(a.startTime)}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            a.appointmentType === 'walk_in'
                              ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300'
                              : a.appointmentType === 'online'
                              ? 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300'
                              : 'bg-gray-100 dark:bg-neutral-700 text-gray-600 dark:text-gray-300'
                          }`}>
                            {a.appointmentType === 'walk_in'
                              ? t('حضور مباشر', 'Walk-in')
                              : a.appointmentType === 'online'
                              ? t('أونلاين', 'Online')
                              : t('موعد', 'Scheduled')}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <AppointmentStatusBadge status={a.status} lang={lang} />
                        </td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-300 text-xs">
                          {(a.waitingTimeMinutes ?? 0) > 0 ? (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {a.waitingTimeMinutes}{t('د', 'm')}
                            </span>
                          ) : (
                            <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" />{t('الآن', 'Now')}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1.5 justify-end">
                            <Button
                              size="sm"
                              variant="success"
                              className="h-7 px-2 text-xs"
                              onClick={() => checkIn(a.id)}
                            >
                              {t('دخول', 'Check In')}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              onClick={() => delayAppt({ id: a.id, version: a.version })}
                            >
                              {t('تأجيل', 'Delay')}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
