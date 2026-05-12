'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, FileHeart } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { useEncounters, type Encounter } from '@/hooks/useEncounters';
import { usePatientMap } from '@/hooks/usePatients';
import { useDoctorMap } from '@/hooks/useDoctors';
import { useLang } from '@/contexts/LanguageContext';
import { ehrApi } from '@/lib/api';
import { formatDate } from '@/lib/utils';

const STATUS_TABS = ['all', 'draft', 'in_progress', 'completed', 'signed_off'] as const;
type StatusFilter = typeof STATUS_TABS[number];

type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'outline';

const STATUS_BADGE: Record<string, BadgeVariant> = {
  draft:       'outline',
  in_progress: 'warning',
  completed:   'info',
  signed_off:  'success',
};

const STATUS_LABELS: Record<string, { ar: string; en: string }> = {
  all:         { ar: 'الكل',       en: 'All' },
  draft:       { ar: 'مسودة',      en: 'Draft' },
  in_progress: { ar: 'جارٍ',       en: 'In Progress' },
  completed:   { ar: 'مكتمل',      en: 'Completed' },
  signed_off:  { ar: 'موقَّع',     en: 'Signed Off' },
};

const TYPE_LABELS: Record<string, { ar: string; en: string }> = {
  outpatient: { ar: 'خارجي', en: 'Outpatient' },
  inpatient:  { ar: 'داخلي', en: 'Inpatient' },
  emergency:  { ar: 'طوارئ', en: 'Emergency' },
  telehealth: { ar: 'عن بعد', en: 'Telehealth' },
  follow_up:  { ar: 'متابعة', en: 'Follow-up' },
};

const ENCOUNTER_TYPES = ['outpatient', 'inpatient', 'emergency', 'telehealth', 'follow_up'] as const;

const PAGE_SIZE = 20;

interface NewEncounterForm {
  patientId: string;
  doctorId: string;
  encounterDate: string;
  encounterType: string;
  chiefComplaint: string;
}

function truncateUUID(id: string): string {
  return id.length > 8 ? id.slice(0, 8) + '…' : id;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function EncountersPage() {
  const { lang, t } = useLang();
  const locale = lang === 'ar' ? 'ar-EG' : 'en-US';
  const queryClient = useQueryClient();
  const patientMap = usePatientMap();
  const doctorMap  = useDoctorMap();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [showNewModal, setShowNewModal] = useState(false);

  const [form, setForm] = useState<NewEncounterForm>({
    patientId:      '',
    doctorId:       '',
    encounterDate:  todayISO(),
    encounterType:  'outpatient',
    chiefComplaint: '',
  });
  const [formError, setFormError] = useState('');

  const { data, isLoading } = useEncounters({
    status:   statusFilter === 'all' ? undefined : statusFilter,
    dateFrom: dateFrom || undefined,
    dateTo:   dateTo || undefined,
    page,
    limit:    PAGE_SIZE,
  });

  const encounters = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const createMutation = useMutation({
    mutationFn: async (payload: NewEncounterForm) => {
      const { data: res } = await ehrApi.post<{ success: boolean; data: Encounter }>('/encounters', payload);
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['encounters'] });
      setShowNewModal(false);
      setForm({ patientId: '', doctorId: '', encounterDate: todayISO(), encounterType: 'outpatient', chiefComplaint: '' });
      setFormError('');
    },
    onError: (err: { message?: string }) => {
      setFormError(err?.message ?? t('تعذّر الحفظ. حاول مرة أخرى.', "Couldn't save. Try again."));
    },
  });

  function handleStatusChange(s: StatusFilter) {
    setStatusFilter(s);
    setPage(1);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    createMutation.mutate(form);
  }

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold font-display text-gray-900 dark:text-gray-100">
            {t('الحالات السريرية', 'Encounters')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {t('سجلات المقابلات والحالات الطبية', 'Clinical encounter records')}
          </p>
        </div>
        <Button size="sm" onClick={() => setShowNewModal(true)}>
          <Plus className="w-4 h-4" />
          {t('حالة جديدة', 'New Encounter')}
        </Button>
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 bg-gray-100 dark:bg-neutral-800 rounded-lg p-1 flex-wrap">
          {STATUS_TABS.map((s) => (
            <button
              key={s}
              onClick={() => handleStatusChange(s)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                statusFilter === s
                  ? 'bg-white dark:bg-neutral-700 text-primary-700 dark:text-primary-300 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {t(STATUS_LABELS[s].ar, STATUS_LABELS[s].en)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Input
            type="date"
            className="w-36 text-xs"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            placeholder={t('من', 'From')}
          />
          <span className="text-gray-400 text-xs">—</span>
          <Input
            type="date"
            className="w-36 text-xs"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            placeholder={t('إلى', 'To')}
          />
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t('قائمة الحالات', 'Encounters List')}</CardTitle>
          {!isLoading && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {t(`${total} حالة`, `${total} encounters`)}
            </span>
          )}
        </CardHeader>
        <CardContent className="p-0 mt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-neutral-700 bg-gray-50/50 dark:bg-neutral-800/50">
                <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs">
                  {t('التاريخ', 'Date')}
                </th>
                <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs">
                  {t('المريض', 'Patient')}
                </th>
                <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs hidden md:table-cell">
                  {t('الطبيب', 'Doctor')}
                </th>
                <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs">
                  {t('النوع', 'Type')}
                </th>
                <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs hidden lg:table-cell">
                  {t('الشكوى الرئيسية', 'Chief Complaint')}
                </th>
                <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs">
                  {t('الحالة', 'Status')}
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-50 dark:border-neutral-700/50">
                      <td colSpan={6} className="px-5 py-3">
                        <div className="animate-pulse bg-gray-200 dark:bg-neutral-700 rounded h-5" />
                      </td>
                    </tr>
                  ))
                : encounters.length === 0
                ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center">
                        <div className="flex flex-col items-center gap-2 text-gray-400 dark:text-gray-500">
                          <FileHeart className="w-8 h-8" />
                          <span>{t('لا توجد حالات سريرية مسجلة بعد', 'No clinical encounters recorded yet.')}</span>
                        </div>
                      </td>
                    </tr>
                  )
                : encounters.map((enc: Encounter) => (
                    <tr key={enc.id} className="border-b border-gray-50 dark:border-neutral-700/50 hover:bg-gray-50/50 dark:hover:bg-neutral-700/30 transition-colors">
                      <td className="px-5 py-3.5 text-gray-700 dark:text-gray-300">
                        {formatDate(enc.encounterDate, locale)}
                      </td>
                      <td className="px-5 py-3.5 text-gray-700 dark:text-gray-200 text-sm">
                        {(() => { const p = patientMap.get(enc.patientId); return p ? (lang === 'ar' ? (p.nameAr ?? p.nameEn) : p.nameEn) : truncateUUID(enc.patientId); })()}
                      </td>
                      <td className="px-5 py-3.5 text-gray-700 dark:text-gray-200 text-sm hidden md:table-cell">
                        {(() => { const d = doctorMap.get(enc.doctorId); return d ? (lang === 'ar' ? (d.nameAr ?? d.nameEn) : d.nameEn) : truncateUUID(enc.doctorId); })()}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-xs text-gray-600 dark:text-gray-400">
                          {t(
                            TYPE_LABELS[enc.encounterType]?.ar ?? enc.encounterType,
                            TYPE_LABELS[enc.encounterType]?.en ?? enc.encounterType,
                          )}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-gray-600 dark:text-gray-400 hidden lg:table-cell max-w-xs truncate">
                        {enc.chiefComplaint ?? '—'}
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge variant={STATUS_BADGE[enc.status] ?? 'default'} dot>
                          {t(
                            STATUS_LABELS[enc.status]?.ar ?? enc.status,
                            STATUS_LABELS[enc.status]?.en ?? enc.status,
                          )}
                        </Badge>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>

          {/* Pagination */}
          {!isLoading && total > 0 && (
            <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100 dark:border-neutral-700">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                {t('السابق', 'Previous')}
              </Button>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {t(`صفحة ${page} من ${totalPages}`, `Page ${page} of ${totalPages}`)}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                {t('التالي', 'Next')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* New Encounter Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 font-display">
                {t('إضافة حالة سريرية', 'New Encounter')}
              </h3>
              <button
                onClick={() => { setShowNewModal(false); setFormError(''); }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('معرّف المريض (UUID)', 'Patient ID (UUID)')}
                </label>
                <Input
                  required
                  value={form.patientId}
                  onChange={(e) => setForm((f) => ({ ...f, patientId: e.target.value }))}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('معرّف الطبيب (UUID)', 'Doctor ID (UUID)')}
                </label>
                <Input
                  required
                  value={form.doctorId}
                  onChange={(e) => setForm((f) => ({ ...f, doctorId: e.target.value }))}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('تاريخ الحالة', 'Encounter Date')}
                </label>
                <Input
                  type="date"
                  required
                  value={form.encounterDate}
                  onChange={(e) => setForm((f) => ({ ...f, encounterDate: e.target.value }))}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('نوع الحالة', 'Encounter Type')}
                </label>
                <select
                  required
                  value={form.encounterType}
                  onChange={(e) => setForm((f) => ({ ...f, encounterType: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-gray-900 dark:text-gray-100 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {ENCOUNTER_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(TYPE_LABELS[type].ar, TYPE_LABELS[type].en)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('الشكوى الرئيسية', 'Chief Complaint')}
                </label>
                <Input
                  value={form.chiefComplaint}
                  onChange={(e) => setForm((f) => ({ ...f, chiefComplaint: e.target.value }))}
                  placeholder={t('وصف موجز للشكوى...', 'Brief description of complaint...')}
                />
              </div>

              {formError && (
                <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
                  {formError}
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => { setShowNewModal(false); setFormError(''); }}
                >
                  {t('إلغاء', 'Cancel')}
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending
                    ? t('جارٍ الحفظ...', 'Saving...')
                    : t('حفظ', 'Save')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
