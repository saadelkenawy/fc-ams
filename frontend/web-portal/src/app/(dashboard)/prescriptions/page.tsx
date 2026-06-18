'use client';
import { CTable, CTableHead, CTableBody, CTableRow, CTableHeaderCell, CTableDataCell } from '@coreui/react';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Plus, Pill, Search, FileText, Printer, CheckCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { PrescriptionForm } from '@/components/prescriptions/PrescriptionForm';
import { PrescriptionPrintTemplate } from '@/components/prescriptions/PrescriptionPrintTemplate';
import { usePatientMap } from '@/hooks/usePatients';
import { useDoctorMap } from '@/hooks/useDoctors';
import { useLang } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { ehrApi } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import type { Prescription, Patient, Doctor } from '@fadl/types';

/* ── types ───────────────────────────────────────────────────────────────── */

type StatusFilter = 'all' | 'active' | 'dispensed' | 'cancelled';
type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'outline';

/* ── label maps ──────────────────────────────────────────────────────────── */

const STATUS_BADGE: Record<string, BadgeVariant> = {
  active:    'success',
  dispensed: 'info',
  cancelled: 'outline',
};

const STATUS_LABELS: Record<string, { ar: string; en: string }> = {
  all:       { ar: 'الكل',    en: 'All' },
  active:    { ar: 'نشطة',   en: 'Active' },
  dispensed: { ar: 'صُرفت',  en: 'Dispensed' },
  cancelled: { ar: 'ملغاة',  en: 'Cancelled' },
};

const FORM_LABELS: Record<string, { ar: string; en: string }> = {
  cap: { ar: 'كبسولة', en: 'Cap' },
  tab: { ar: 'قرص',    en: 'Tab' },
  syr: { ar: 'شراب',   en: 'Syr' },
  inj: { ar: 'حقنة',   en: 'Inj' },
  gtt: { ar: 'نقطة',   en: 'Gtt' },
};

const FREQ_LABELS: Record<string, string> = {
  od: 'q.d.', bid: 'b.i.d', tid: 't.i.d', qid: 'q.i.d', q4h: 'q4h',
};

const STATUS_TABS: StatusFilter[] = ['all', 'active', 'dispensed', 'cancelled'];

function truncateUUID(id: string) {
  return id.length > 8 ? id.slice(0, 8) + '…' : id;
}

/* ── page ────────────────────────────────────────────────────────────────── */

export default function PrescriptionsPage() {
  const { lang, t } = useLang();
  const { user } = useAuth();
  const patientMap = usePatientMap();
  const doctorMap  = useDoctorMap();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState<Prescription | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['prescriptions', statusFilter, page, user?.doctorId],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit: 20 };
      if (statusFilter !== 'all') params.status = statusFilter;
      if (user?.role === 'doctor' && user.doctorId) params.doctorId = user.doctorId;
      const res = await ehrApi.get('/prescriptions', { params });
      return res.data as { data: Prescription[]; total: number; page: number; limit: number };
    },
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const rxList = (data?.data ?? []).filter((rx) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const patient = patientMap.get(rx.patientId);
    const doctor  = doctorMap.get(rx.doctorId);
    return (
      rx.diagnosis?.toLowerCase().includes(q) ||
      rx.items.some((it) => it.medicationName.toLowerCase().includes(q)) ||
      patient?.nameEn.toLowerCase().includes(q) ||
      patient?.nameAr?.toLowerCase().includes(q) ||
      doctor?.nameEn?.toLowerCase().includes(q) ||
      doctor?.nameAr?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col gap-6 p-6">

      {/* page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/30">
            <Pill className="h-5 w-5 text-primary-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {t('الوصفات الطبية', 'Prescriptions')}
            </h1>
            {data && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t(`${data.total} وصفة`, `${data.total} prescriptions`)}
              </p>
            )}
          </div>
        </div>

        <Button variant="primary" size="md" onClick={() => setShowNew(true)}>
          <Plus className="h-4 w-4" />
          {t('وصفة جديدة', 'New Prescription')}
        </Button>
      </div>

      {/* status tabs */}
      <div className="flex gap-2 flex-wrap">
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === s
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 dark:bg-neutral-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-neutral-600'
            }`}
          >
            {lang === 'ar' ? STATUS_LABELS[s].ar : STATUS_LABELS[s].en}
          </button>
        ))}
      </div>

      {/* search */}
      <div className="max-w-sm">
        <Input
          label="Search" labelAr="بحث"
          lang={lang}
          placeholder={t('بحث بالدواء أو التشخيص…', 'Search by drug or diagnosis…')}
          icon={<Search className="h-4 w-4" />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('قائمة الوصفات', 'Prescription List')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading && (
            <div className="py-16 text-center text-sm text-gray-400">
              {t('جارٍ التحميل…', 'Loading…')}
            </div>
          )}
          {isError && (
            <div className="py-16 text-center text-sm text-red-500">
              {t('حدث خطأ أثناء التحميل.', 'Failed to load prescriptions.')}
            </div>
          )}
          {!isLoading && rxList.length === 0 && (
            <div className="py-16 flex flex-col items-center gap-2 text-gray-400">
              <FileText className="h-10 w-10 opacity-40" />
              <p className="text-sm">{t('لا توجد وصفات.', 'No prescriptions found.')}</p>
            </div>
          )}
          {rxList.length > 0 && (
            <div className="overflow-x-auto">
              <CTable className="w-full text-sm">
                <CTableHead className="border-b border-gray-100 dark:border-neutral-700">
                  <CTableRow className="text-left rtl:text-right text-xs text-gray-500 dark:text-gray-400">
                    <CTableHeaderCell className="px-4 py-3 font-medium">{t('المريض', 'Patient')}</CTableHeaderCell>
                    <CTableHeaderCell className="px-4 py-3 font-medium">{t('الطبيب', 'Doctor')}</CTableHeaderCell>
                    <CTableHeaderCell className="px-4 py-3 font-medium">{t('التشخيص', 'Diagnosis')}</CTableHeaderCell>
                    <CTableHeaderCell className="px-4 py-3 font-medium">{t('الأدوية', 'Medications')}</CTableHeaderCell>
                    <CTableHeaderCell className="px-4 py-3 font-medium">{t('الحالة', 'Status')}</CTableHeaderCell>
                    <CTableHeaderCell className="px-4 py-3 font-medium">{t('التاريخ', 'Date')}</CTableHeaderCell>
                  </CTableRow>
                </CTableHead>
                <CTableBody className="divide-y divide-gray-50 dark:divide-neutral-800">
                  {rxList.map((rx) => {
                    const patient = patientMap.get(rx.patientId);
                    const doctor  = doctorMap.get(rx.doctorId);
                    return (
                      <CTableRow
                        key={rx.id}
                        onClick={() => setSelected(rx)}
                        className="cursor-pointer hover:bg-gray-50 dark:hover:bg-neutral-800/60 transition-colors"
                      >
                        <CTableDataCell className="px-4 py-3">
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {(lang === 'ar' ? patient?.nameAr : undefined) ?? patient?.nameEn ?? truncateUUID(rx.patientId)}
                          </span>
                        </CTableDataCell>
                        <CTableDataCell className="px-4 py-3 text-gray-600 dark:text-gray-400">
                          {(lang === 'ar' ? doctor?.nameAr : undefined) ?? doctor?.nameEn ?? truncateUUID(rx.doctorId)}
                        </CTableDataCell>
                        <CTableDataCell className="px-4 py-3 max-w-xs truncate text-gray-700 dark:text-gray-300">
                          {rx.diagnosis ?? '—'}
                        </CTableDataCell>
                        <CTableDataCell className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {rx.items.slice(0, 3).map((it) => (
                              <span
                                key={it.id}
                                className="rounded-full bg-gray-100 dark:bg-neutral-700 px-2 py-0.5 text-xs text-gray-700 dark:text-gray-300"
                              >
                                {it.medicationName}{' '}
                                <span className="text-gray-400">
                                  {lang === 'ar' ? FORM_LABELS[it.form].ar : FORM_LABELS[it.form].en}
                                </span>
                                {' · '}{FREQ_LABELS[it.frequency]}
                              </span>
                            ))}
                            {rx.items.length > 3 && (
                              <span className="text-xs text-gray-400">+{rx.items.length - 3}</span>
                            )}
                          </div>
                        </CTableDataCell>
                        <CTableDataCell className="px-4 py-3">
                          <Badge variant={STATUS_BADGE[rx.status] ?? 'outline'}>
                            {lang === 'ar' ? STATUS_LABELS[rx.status].ar : STATUS_LABELS[rx.status].en}
                          </Badge>
                        </CTableDataCell>
                        <CTableDataCell className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          {formatDate(rx.createdAt)}
                        </CTableDataCell>
                      </CTableRow>
                    );
                  })}
                </CTableBody>
              </CTable>
            </div>
          )}

          {/* pagination */}
          {(data?.total ?? 0) > 20 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-neutral-700">
              <Button
                variant="ghost" size="sm"
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {t('السابق', 'Previous')}
              </Button>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {t(`صفحة ${page}`, `Page ${page}`)}
              </span>
              <Button
                variant="ghost" size="sm"
                disabled={(data?.total ?? 0) <= page * 20}
                onClick={() => setPage((p) => p + 1)}
              >
                {t('التالي', 'Next')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* new prescription modal */}
      <Modal open={showNew} onClose={() => setShowNew(false)} title="">
        <PrescriptionForm
          patientId=""
          doctorId=""
          onSuccess={() => setShowNew(false)}
          onCancel={() => setShowNew(false)}
        />
      </Modal>

      {/* detail modal */}
      {selected && (
        <Modal open={!!selected} onClose={() => setSelected(null)} title={t('تفاصيل الوصفة', 'Prescription Details')}>
          <PrescriptionDetail
            rx={selected}
            patient={patientMap.get(selected.patientId)}
            doctor={doctorMap.get(selected.doctorId)}
            patientName={
              (lang === 'ar' ? patientMap.get(selected.patientId)?.nameAr : undefined)
              ?? patientMap.get(selected.patientId)?.nameEn
            }
            doctorName={
              (lang === 'ar' ? doctorMap.get(selected.doctorId)?.nameAr : undefined)
              ?? doctorMap.get(selected.doctorId)?.nameEn
            }
            lang={lang}
            t={t}
          />
        </Modal>
      )}
    </div>
  );
}

/* ── print CSS injected during window.print() ────────────────────────────── */

const PRINT_STYLE = `
  @media screen { #rx-print-root { display: none !important; } }
  @media print {
    body > *:not(#rx-print-root) { display: none !important; }
    #rx-print-root { display: block !important; }
    @page { size: A4; margin: 0; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  }
`;

/* ── inline detail view ──────────────────────────────────────────────────── */

function PrescriptionDetail({
  rx, patient, doctor, patientName, doctorName, lang, t,
}: {
  rx: Prescription;
  patient?: Patient;
  doctor?: Doctor;
  patientName?: string;
  doctorName?: string;
  lang: 'ar' | 'en';
  t: (ar: string, en: string) => string;
}) {
  const queryClient = useQueryClient();
  const [isPrinting,  setIsPrinting]  = useState(false);
  const [isDispensed, setIsDispensed] = useState(rx.status === 'dispensed');

  const dispenseMutation = useMutation({
    mutationFn: async () => {
      await ehrApi.patch(`/prescriptions/${rx.id}/status`, { status: 'dispensed', version: rx.version });
    },
    onSuccess: () => {
      setIsDispensed(true);
      queryClient.invalidateQueries({ queryKey: ['prescriptions'] });
    },
  });

  useEffect(() => {
    if (!isPrinting) return;
    const id = setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 150);
    return () => clearTimeout(id);
  }, [isPrinting]);

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('المريض', 'Patient')}</p>
          <p className="font-medium text-gray-900 dark:text-gray-100">{patientName ?? rx.patientId}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('الطبيب', 'Doctor')}</p>
          <p className="font-medium text-gray-900 dark:text-gray-100">{doctorName ?? rx.doctorId}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('التشخيص', 'Diagnosis')}</p>
          <p className="text-gray-800 dark:text-gray-200">{rx.diagnosis ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('الحالة', 'Status')}</p>
          <Badge variant={STATUS_BADGE[rx.status] ?? 'outline'}>
            {lang === 'ar' ? STATUS_LABELS[rx.status].ar : STATUS_LABELS[rx.status].en}
          </Badge>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
          {t('الأدوية', 'Medications')}
        </p>
        {rx.items.map((it) => (
          <div
            key={it.id}
            className="rounded-lg border border-gray-100 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/50 px-3 py-2 flex flex-col gap-0.5"
          >
            <p className="font-medium text-gray-900 dark:text-gray-100">
              {it.medicationName}
              {' '}
              <span className="text-xs text-gray-500">
                ({lang === 'ar' ? FORM_LABELS[it.form].ar : FORM_LABELS[it.form].en})
              </span>
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {it.dosageValue && `${it.dosageValue}${it.dosageUnit ?? ''} · `}
              {FREQ_LABELS[it.frequency]}
              {it.timing !== 'none' && ` · ${it.timing}`}
              {it.durationDays && ` · ${it.durationDays}${t('ي', 'd')}`}
            </p>
            {it.routeInstruction && (
              <p className="text-xs text-gray-500 dark:text-gray-400 italic">{it.routeInstruction}</p>
            )}
          </div>
        ))}
      </div>

      {rx.notes && (
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('ملاحظات', 'Notes')}</p>
          <p className="text-gray-800 dark:text-gray-200">{rx.notes}</p>
        </div>
      )}

      {/* action row */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-neutral-700 gap-2 flex-wrap">
        <div>
          {!isDispensed && (rx.status === 'active') && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => dispenseMutation.mutate()}
              disabled={dispenseMutation.isPending}
            >
              <CheckCheck className="h-4 w-4 text-emerald-600" />
              {dispenseMutation.isPending ? t('جارٍ…', 'Updating…') : t('تم الصرف', 'Mark Dispensed')}
            </Button>
          )}
          {isDispensed && (
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              <CheckCheck className="h-3.5 w-3.5" />
              {t('تم الصرف', 'Dispensed')}
            </span>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsPrinting(true)}
          disabled={isPrinting}
        >
          <Printer className="h-4 w-4" />
          {t('طباعة / PDF', 'Print / PDF')}
        </Button>
      </div>

      {/* print portal — hidden on screen, visible only during window.print() */}
      {isPrinting && typeof document !== 'undefined' && createPortal(
        <>
          <style dangerouslySetInnerHTML={{ __html: PRINT_STYLE }} />
          <div id="rx-print-root">
            <PrescriptionPrintTemplate
              rx={rx}
              patient={patient}
              doctor={doctor}
              patientName={patientName}
              doctorName={doctorName}
            />
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
