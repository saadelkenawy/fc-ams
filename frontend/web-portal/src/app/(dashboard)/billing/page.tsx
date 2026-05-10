'use client';

import { useState, useRef, useEffect } from 'react';
import { Download, FileDown, Filter, Search, CheckCircle, Clock, TrendingUp, Loader2, RefreshCw, ReceiptText, ChevronDown, ChevronRight, Building2, Stethoscope, Share2, FlaskConical } from 'lucide-react';
import { analyticsApi } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { StatCard } from '@/components/ui/StatCard';
import { Pagination } from '@/components/ui/Pagination';
import { useLang } from '@/contexts/LanguageContext';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useTransactions, useSettlements, useUpdateTransactionStatus } from '@/hooks/useBilling';
import { useDoctorMap } from '@/hooks/useDoctors';
import { usePatientMap } from '@/hooks/usePatients';
import { useProcedureMap } from '@/hooks/useProcedures';
import { cn } from '@/lib/utils';
import type { PaymentStatus } from '@fadl/types';

const STATUS_CONFIG: Record<PaymentStatus, { labelAr: string; labelEn: string; variant: 'warning' | 'info' | 'success' | 'default' | 'danger' | 'primary' }> = {
  pending:    { labelAr: 'معلق',   labelEn: 'Pending',    variant: 'warning' },
  verified:   { labelAr: 'مراجع', labelEn: 'Verified',   variant: 'info' },
  approved:   { labelAr: 'معتمد', labelEn: 'Approved',   variant: 'primary' },
  paid:       { labelAr: 'مدفوع', labelEn: 'Paid',       variant: 'success' },
  reconciled: { labelAr: 'مطابق', labelEn: 'Reconciled', variant: 'default' },
  refunded:   { labelAr: 'مسترد', labelEn: 'Refunded',   variant: 'danger' },
};

const ALL_STATUSES = Object.keys(STATUS_CONFIG) as PaymentStatus[];

const TABS = [
  { key: 'transactions', labelAr: 'المعاملات', labelEn: 'Transactions' },
  { key: 'settlements',  labelAr: 'التسويات',  labelEn: 'Settlements' },
];

const PAGE_SIZES = [10, 25, 50];

function StatusDropdown({
  txId, current, lang, onClose,
}: { txId: string; current: PaymentStatus; lang: 'ar' | 'en'; onClose: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const { mutateAsync, isLoading: isPending } = useUpdateTransactionStatus();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  async function pick(status: PaymentStatus) {
    if (status === current) { onClose(); return; }
    try {
      await mutateAsync({ id: txId, status });
      toast(t('تم تحديث الحالة', 'Status updated'), 'success');
    } catch {
      toast(t('فشل تحديث الحالة', 'Failed to update status'), 'error');
    }
    onClose();
  }

  return (
    <div
      ref={ref}
      className="absolute z-50 start-0 top-full mt-1 bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-600 rounded-xl shadow-xl overflow-hidden min-w-[140px]"
    >
      {isPending && (
        <div className="flex items-center justify-center py-3">
          <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
        </div>
      )}
      {!isPending && ALL_STATUSES.map((s) => {
        const cfg = STATUS_CONFIG[s];
        return (
          <button
            key={s}
            onClick={() => void pick(s)}
            className={cn(
              'w-full text-start px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-neutral-700 transition-colors flex items-center gap-2',
              s === current && 'bg-gray-50 dark:bg-neutral-700 font-semibold',
            )}
          >
            <span className={cn(
              'w-2 h-2 rounded-full flex-shrink-0',
              cfg.variant === 'success' ? 'bg-emerald-500' :
              cfg.variant === 'warning' ? 'bg-amber-500' :
              cfg.variant === 'info'    ? 'bg-blue-500' :
              cfg.variant === 'danger'  ? 'bg-red-500' :
              cfg.variant === 'primary' ? 'bg-primary-500' : 'bg-gray-400',
            )} />
            {lang === 'ar' ? cfg.labelAr : cfg.labelEn}
          </button>
        );
      })}
    </div>
  );
}

export default function BillingPage() {
  const { lang, t } = useLang();
  const locale = lang === 'ar' ? 'ar-EG' : 'en-US';
  const [activeTab, setActiveTab]       = useState('transactions');
  const [query, setQuery]               = useState('');
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | 'all'>('all');
  const [page, setPage]                 = useState(1);
  const [limit, setLimit]               = useState(10);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const { data, isLoading, isError } = useTransactions({
    status: statusFilter === 'all' ? undefined : statusFilter,
    page,
    limit,
  });
  const transactions = data?.data ?? [];
  const total        = data?.total ?? 0;
  const doctorMap    = useDoctorMap();
  const patientMap   = usePatientMap();

  const filtered = transactions.filter((tx) => {
    if (!query) return true;
    const q = query.toLowerCase();
    const doc = tx.doctorId ? doctorMap.get(tx.doctorId) : null;
    const pat = patientMap.get(tx.patientId);
    const docName = doc ? (lang === 'ar' ? (doc.nameAr ?? doc.nameEn) : doc.nameEn).toLowerCase() : '';
    const patName = pat ? ((pat.nameAr ?? pat.nameEn ?? '')).toLowerCase() : '';
    return docName.includes(q) || patName.includes(q) || tx.patientId.toLowerCase().includes(q);
  });

  const totalRevenue     = transactions.reduce((s, tx) => s + tx.approvedCharge, 0);
  const totalDoctorShare = transactions.reduce((s, tx) => s + tx.doctorShare, 0);
  const totalClinicShare = transactions.reduce((s, tx) => s + tx.clinicShare, 0);
  const pendingCount     = transactions.filter((tx) => tx.paymentStatus === 'pending').length;

  async function downloadPdf(endpoint: string, filename: string) {
    const res = await analyticsApi.get(endpoint, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function handlePageChange(p: number) { setPage(p); }
  function handleLimitChange(l: number) { setLimit(l); setPage(1); }
  function handleStatusFilter(s: PaymentStatus | 'all') { setStatusFilter(s); setPage(1); }
  function handleSearch(q: string) { setQuery(q); setPage(1); }

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold font-display text-gray-900 dark:text-gray-100">{t('الفواتير والمالية', 'Billing & Finance')}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-300 mt-0.5">{t('السجل المحاسبي غير القابل للتعديل', 'Immutable financial ledger')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void downloadPdf('/reports/settlement', 'settlement-report.pdf')}>
            <FileDown className="w-4 h-4" />
            {t('تقرير التسويات', 'Settlement PDF')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void downloadPdf('/reports/financial-summary', 'financial-summary.pdf')}>
            <Download className="w-4 h-4" />
            {t('ملخص مالي', 'Financial Summary')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title={t('إجمالي الإيرادات', 'Total Revenue')}  value={formatCurrency(totalRevenue, 'EGP', locale)}     icon={<TrendingUp className="w-5 h-5" />}  color="blue" />
        <StatCard title={t('حصة الأطباء', 'Doctor Share')}         value={formatCurrency(totalDoctorShare, 'EGP', locale)} icon={<TrendingUp className="w-5 h-5" />}  color="violet" />
        <StatCard title={t('حصة العيادة', 'Clinic Share')}          value={formatCurrency(totalClinicShare, 'EGP', locale)} icon={<CheckCircle className="w-5 h-5" />} color="green" />
        <StatCard title={t('معلقة', 'Pending')}                     value={pendingCount}                                   icon={<Clock className="w-5 h-5" />}        color="amber" />
      </div>

      <div className="pill-tab-bar w-fit">
        {TABS.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`pill-tab ${activeTab === tab.key ? 'active' : ''}`}>
            {lang === 'ar' ? tab.labelAr : tab.labelEn}
          </button>
        ))}
      </div>

      {activeTab === 'transactions' && (
        <Card>
          <div className="p-5 border-b border-gray-50 dark:border-neutral-700 flex flex-col sm:flex-row gap-3">
            <Input
              placeholder={t('بحث بالطبيب أو المريض...', 'Search by doctor or patient...')}
              icon={<Search className="w-4 h-4" />}
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              className="max-w-sm"
              lang={lang}
            />
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="w-4 h-4 text-gray-400" />
              {(['all', ...ALL_STATUSES] as const).map((s) => (
                <button key={s} onClick={() => handleStatusFilter(s)}
                  className={`pill-tab text-xs py-1 ${statusFilter === s ? 'active' : ''}`}>
                  {s === 'all' ? t('الكل', 'All') : lang === 'ar' ? STATUS_CONFIG[s]?.labelAr : STATUS_CONFIG[s]?.labelEn}
                </button>
              ))}
            </div>
          </div>
          <CardContent className="p-0">
            {isLoading && (
              <div className="flex items-center justify-center py-16 text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin me-2" />{t('جاري التحميل...', 'Loading...')}
              </div>
            )}
            {isError && (
              <div className="py-12 text-center text-red-500 dark:text-red-400 text-sm">
                {t('تعذّر تحميل البيانات', 'Failed to load transactions')}
              </div>
            )}
            {!isLoading && !isError && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-50 dark:border-neutral-700 bg-gray-50/50 dark:bg-neutral-900/40">
                      <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('التاريخ', 'Date')}</th>
                      <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('المريض', 'Patient')}</th>
                      <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('الطبيب', 'Doctor')}</th>
                      <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('المصدر', 'Source')}</th>
                      <th className="text-end px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('الرسوم', 'Charge')}</th>
                      <th className="text-end px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('حصة الطبيب', 'Dr. Share')}</th>
                      <th className="text-end px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('حصة العيادة', 'Clinic')}</th>
                      <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('الحالة', 'Status')}</th>
                      <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('الدفع', 'Payment')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((tx) => {
                      const cfg = STATUS_CONFIG[tx.paymentStatus];
                      const doc = tx.doctorId ? doctorMap.get(tx.doctorId) : null;
                      const pat = patientMap.get(tx.patientId);
                      const patName = pat ? (lang === 'ar' ? (pat.nameAr ?? pat.nameEn) : pat.nameEn) : `…${tx.patientId.slice(-8).toUpperCase()}`;
                      const docName = doc ? (lang === 'ar' ? (doc.nameAr ?? doc.nameEn) : doc.nameEn) : (tx.doctorId ? `…${tx.doctorId.slice(-8).toUpperCase()}` : '—');
                      return (
                        <tr key={tx.id} className="border-b border-gray-50 dark:border-neutral-700/50 hover:bg-gray-50/50 dark:hover:bg-neutral-700/30 transition-colors">
                          <td className="px-5 py-3.5 text-gray-500 dark:text-gray-300 text-xs">{formatDate(tx.transactionDate, locale)}</td>
                          <td className="px-5 py-3.5 text-gray-800 dark:text-gray-200 text-xs" title={patName}>{patName}</td>
                          <td className="px-5 py-3.5 text-gray-600 dark:text-gray-300 text-xs" title={docName}>{docName}</td>
                          <td className="px-5 py-3.5">
                            <Badge variant={['VEZ', 'EKF', 'DO'].includes(tx.patientSource) ? 'info' : 'default'} className="text-xs">
                              {tx.patientSource}
                            </Badge>
                          </td>
                          <td className="px-5 py-3.5 text-end font-mono tabular-nums font-medium text-gray-900 dark:text-gray-100">{formatCurrency(tx.approvedCharge, 'EGP', locale)}</td>
                          <td className="px-5 py-3.5 text-end font-mono tabular-nums text-primary-700 dark:text-primary-400">{formatCurrency(tx.doctorShare, 'EGP', locale)}</td>
                          <td className="px-5 py-3.5 text-end font-mono tabular-nums text-emerald-700 dark:text-emerald-400">{formatCurrency(tx.clinicShare, 'EGP', locale)}</td>
                          <td className="px-5 py-3.5">
                            <div className="relative inline-block">
                              <button
                                onClick={() => setOpenDropdown(openDropdown === tx.id ? null : tx.id)}
                                className="cursor-pointer hover:opacity-80 transition-opacity"
                                title={t('انقر لتغيير الحالة', 'Click to change status')}
                              >
                                {cfg ? <Badge variant={cfg.variant} dot>{lang === 'ar' ? cfg.labelAr : cfg.labelEn}</Badge> : tx.paymentStatus}
                              </button>
                              {openDropdown === tx.id && (
                                <StatusDropdown
                                  txId={tx.id}
                                  current={tx.paymentStatus}
                                  lang={lang}
                                  onClose={() => setOpenDropdown(null)}
                                />
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-gray-500 dark:text-gray-300 text-xs capitalize">
                            {tx.paymentMethod?.replace('_', ' ') ?? '—'}
                          </td>
                        </tr>
                      );
                    })}
                    {filtered.length === 0 && (
                      <tr><td colSpan={9} className="px-5 py-12 text-center text-gray-400 dark:text-gray-300">{t('لا توجد نتائج', 'No results')}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination
              page={page}
              total={total}
              limit={limit}
              onPageChange={handlePageChange}
              onLimitChange={handleLimitChange}
              pageSizes={PAGE_SIZES}
            />
          </CardContent>
        </Card>
      )}

      {activeTab === 'settlements' && <SettlementsTab lang={lang} t={t} />}
    </div>
  );
}

function SettlementsTab({ lang, t }: { lang: 'ar' | 'en'; t: (ar: string, en: string) => string }) {
  const now  = new Date();
  const [from, setFrom] = useState(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]);
  const [to,   setTo]   = useState(now.toISOString().split('T')[0]);
  const locale = lang === 'ar' ? 'ar-EG' : 'en-US';
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading, isError, refetch, isFetching } = useSettlements({ from, to, limit: 50 });
  const doctorMap = useDoctorMap();
  const settlements = data?.data ?? [];

  // Totals across all doctors
  const totalSessionFees   = settlements.reduce((s, r) => s + (r.totalSessionFees ?? (r.grossRevenue + r.totalSourceFees)), 0);
  const totalMediator      = settlements.reduce((s, r) => s + r.totalSourceFees,    0);
  const totalExtraServices = settlements.reduce((s, r) => s + (r.totalExtraServices ?? 0), 0);
  const totalNetPool       = settlements.reduce((s, r) => s + r.grossRevenue,        0);
  const totalDoctors       = settlements.reduce((s, r) => s + r.doctorShare,         0);
  const totalClinic        = settlements.reduce((s, r) => s + r.clinicShare,         0);

  const fmt = (n: number) => formatCurrency(n, 'EGP', locale);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin me-2" />{t('جاري التحميل...', 'Loading...')}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <ReceiptText className="w-12 h-12 text-gray-300 dark:text-gray-600" />
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-300 font-medium">{t('تعذّر تحميل التسويات', 'Failed to load settlements')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} />
          {t('إعادة المحاولة', 'Try Again')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Date range filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">{t('من', 'From')}</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="text-sm border border-gray-200 dark:border-neutral-600 rounded-lg px-3 py-1.5 bg-white dark:bg-neutral-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">{t('إلى', 'To')}</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="text-sm border border-gray-200 dark:border-neutral-600 rounded-lg px-3 py-1.5 bg-white dark:bg-neutral-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={cn('w-3.5 h-3.5', isFetching && 'animate-spin')} />
        </Button>
      </div>

      {/* Net profit summary cards */}
      {settlements.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="rounded-xl border border-gray-100 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-3">
            <p className="text-xs text-gray-400 mb-1">{t('رسوم الجلسات', 'Session Fees')}</p>
            <p className="text-base font-bold tabular-nums text-gray-900 dark:text-gray-100">{fmt(totalSessionFees)}</p>
          </div>
          <div className="rounded-xl border border-orange-100 dark:border-orange-900/30 bg-orange-50 dark:bg-orange-900/10 p-3">
            <div className="flex items-center gap-1 mb-1">
              <Share2 className="w-3 h-3 text-orange-500" />
              <p className="text-xs text-orange-600 dark:text-orange-400">{t('الوسيط', 'Mediator')}</p>
            </div>
            <p className="text-base font-bold tabular-nums text-orange-700 dark:text-orange-300">{fmt(totalMediator)}</p>
            {totalSessionFees > 0 && <p className="text-xs text-orange-500 mt-0.5">{((totalMediator / totalSessionFees) * 100).toFixed(1)}%</p>}
          </div>
          <div className="rounded-xl border border-violet-100 dark:border-violet-900/30 bg-violet-50 dark:bg-violet-900/10 p-3">
            <div className="flex items-center gap-1 mb-1">
              <FlaskConical className="w-3 h-3 text-violet-500" />
              <p className="text-xs text-violet-600 dark:text-violet-400">{t('خدمات إضافية', 'Extra Services')}</p>
            </div>
            <p className="text-base font-bold tabular-nums text-violet-700 dark:text-violet-300">{fmt(totalExtraServices)}</p>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-neutral-600 bg-gray-50 dark:bg-neutral-700/40 p-3">
            <p className="text-xs text-gray-500 mb-1">{t('صافي المجمع', 'Net Pool')}</p>
            <p className="text-base font-bold tabular-nums text-gray-800 dark:text-gray-100">{fmt(totalNetPool)}</p>
          </div>
          <div className="rounded-xl border border-blue-100 dark:border-blue-900/30 bg-blue-50 dark:bg-blue-900/10 p-3">
            <div className="flex items-center gap-1 mb-1">
              <Stethoscope className="w-3 h-3 text-blue-500" />
              <p className="text-xs text-blue-600 dark:text-blue-400">{t('مستحق الأطباء', "Doctors'")}</p>
            </div>
            <p className="text-base font-bold tabular-nums text-blue-700 dark:text-blue-300">{fmt(totalDoctors)}</p>
            {totalNetPool > 0 && <p className="text-xs text-blue-500 mt-0.5">{((totalDoctors / totalNetPool) * 100).toFixed(1)}%</p>}
          </div>
          <div className="rounded-xl border border-emerald-100 dark:border-emerald-900/30 bg-emerald-50 dark:bg-emerald-900/10 p-3">
            <div className="flex items-center gap-1 mb-1">
              <Building2 className="w-3 h-3 text-emerald-500" />
              <p className="text-xs text-emerald-600 dark:text-emerald-400">{t('صافي العيادة', 'Clinic Net')}</p>
            </div>
            <p className="text-base font-bold tabular-nums text-emerald-700 dark:text-emerald-300">{fmt(totalClinic)}</p>
            {totalNetPool > 0 && <p className="text-xs text-emerald-500 mt-0.5">{((totalClinic / totalNetPool) * 100).toFixed(1)}%</p>}
          </div>
        </div>
      )}

      {/* Per-doctor table */}
      {settlements.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <ReceiptText className="w-12 h-12 text-gray-300 dark:text-gray-600" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">{t('لا توجد تسويات في هذه الفترة', 'No settlements in this period')}</p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-neutral-700 bg-gray-50/60 dark:bg-neutral-800/60">
                    <th className="w-8 px-3 py-3" />
                    <th className="text-start px-4 py-3 font-medium text-gray-500 text-xs whitespace-nowrap">{t('الطبيب', 'Doctor')}</th>
                    <th className="text-end px-4 py-3 font-medium text-gray-500 text-xs whitespace-nowrap">{t('حجوزات', 'Sessions')}</th>
                    <th className="text-end px-4 py-3 font-medium text-gray-500 text-xs whitespace-nowrap">{t('رسوم الجلسة', 'Session Fees')}</th>
                    <th className="text-end px-4 py-3 font-medium text-orange-500 text-xs whitespace-nowrap">
                      <span className="flex items-center justify-end gap-1"><Share2 className="w-3 h-3" />{t('الوسيط', 'Mediator')}</span>
                    </th>
                    <th className="text-end px-4 py-3 font-medium text-violet-500 text-xs whitespace-nowrap">
                      <span className="flex items-center justify-end gap-1"><FlaskConical className="w-3 h-3" />{t('إضافية', 'Extra')}</span>
                    </th>
                    <th className="text-end px-4 py-3 font-medium text-gray-500 text-xs whitespace-nowrap">{t('الصافي', 'Net Pool')}</th>
                    <th className="text-end px-4 py-3 font-medium text-blue-500 text-xs whitespace-nowrap">
                      <span className="flex items-center justify-end gap-1"><Stethoscope className="w-3 h-3" />{t('الطبيب', 'Doctor')}</span>
                    </th>
                    <th className="text-end px-4 py-3 font-medium text-emerald-500 text-xs whitespace-nowrap">
                      <span className="flex items-center justify-end gap-1"><Building2 className="w-3 h-3" />{t('العيادة', 'Clinic')}</span>
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {settlements.map((s) => {
                    const sessionFees = s.totalSessionFees ?? (s.grossRevenue + s.totalSourceFees);
                    const extraSvcs   = s.totalExtraServices ?? 0;
                    const isOpen      = expanded === s.doctorId;
                    return (
                      <>
                        <tr
                          key={s.doctorId}
                          onClick={() => setExpanded(isOpen ? null : s.doctorId)}
                          className="border-b border-gray-50 dark:border-neutral-700/50 hover:bg-gray-50/60 dark:hover:bg-neutral-700/20 cursor-pointer transition-colors"
                        >
                          <td className="px-3 py-3 text-gray-400">
                            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </td>
                          <td className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">{doctorMap.get(s.doctorId)?.nameEn ?? s.doctorId.slice(0, 8)}</td>
                          <td className="px-4 py-3 text-end font-mono text-gray-600 dark:text-gray-300">{(s.totalConsultations ?? 0) + (s.totalProcedures ?? 0)}</td>
                          <td className="px-4 py-3 text-end font-mono tabular-nums text-gray-700 dark:text-gray-200">{fmt(sessionFees)}</td>
                          <td className="px-4 py-3 text-end font-mono tabular-nums text-orange-600 dark:text-orange-400">{fmt(s.totalSourceFees)}</td>
                          <td className="px-4 py-3 text-end font-mono tabular-nums text-violet-600 dark:text-violet-400">{fmt(extraSvcs)}</td>
                          <td className="px-4 py-3 text-end font-mono tabular-nums text-gray-700 dark:text-gray-300">{fmt(s.grossRevenue)}</td>
                          <td className="px-4 py-3 text-end font-mono tabular-nums text-blue-700 dark:text-blue-400 font-semibold">{fmt(s.doctorShare)}</td>
                          <td className="px-4 py-3 text-end font-mono tabular-nums text-emerald-700 dark:text-emerald-400 font-semibold">{fmt(s.clinicShare)}</td>
                          <td className="px-4 py-3">
                            {(s.netPayable ?? 0) > 0 && (
                              <Button size="sm" className="h-7 px-3 text-xs whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                {t('تسوية', 'Settle')}
                              </Button>
                            )}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr key={`${s.doctorId}-detail`} className="bg-gray-50/40 dark:bg-neutral-800/30">
                            <td colSpan={10} className="px-6 py-4">
                              <SettlementDetail doctorId={s.doctorId} from={from} to={to} locale={locale} t={t} />
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
                {/* Totals footer */}
                <tfoot>
                  <tr className="border-t-2 border-gray-200 dark:border-neutral-600 bg-gray-50 dark:bg-neutral-800/60 font-semibold">
                    <td className="px-3 py-3" />
                    <td className="px-4 py-3 text-xs text-gray-500">{t('الإجمالي', 'Total')}</td>
                    <td className="px-4 py-3 text-end font-mono text-gray-600">
                      {settlements.reduce((s, r) => s + (r.totalConsultations ?? 0) + (r.totalProcedures ?? 0), 0)}
                    </td>
                    <td className="px-4 py-3 text-end font-mono tabular-nums text-gray-900 dark:text-gray-100">{fmt(totalSessionFees)}</td>
                    <td className="px-4 py-3 text-end font-mono tabular-nums text-orange-700 dark:text-orange-300">{fmt(totalMediator)}</td>
                    <td className="px-4 py-3 text-end font-mono tabular-nums text-violet-700 dark:text-violet-300">{fmt(totalExtraServices)}</td>
                    <td className="px-4 py-3 text-end font-mono tabular-nums text-gray-700 dark:text-gray-300">{fmt(totalNetPool)}</td>
                    <td className="px-4 py-3 text-end font-mono tabular-nums text-blue-700 dark:text-blue-300">{fmt(totalDoctors)}</td>
                    <td className="px-4 py-3 text-end font-mono tabular-nums text-emerald-700 dark:text-emerald-300">{fmt(totalClinic)}</td>
                    <td className="px-4 py-3" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SettlementDetail({ doctorId, from, to, locale, t }: {
  doctorId: string; from: string; to: string; locale: string;
  t: (ar: string, en: string) => string;
}) {
  const { data: txData, isLoading: txLoading } = useTransactions({ doctorId, dateFrom: from, dateTo: to, limit: 100 });
  const procedureMap = useProcedureMap();
  const txs = txData?.data ?? [];
  const fmt = (n: number) => formatCurrency(n, 'EGP', locale);

  if (txLoading) return <div className="flex items-center gap-2 text-xs text-gray-400"><Loader2 className="w-3 h-3 animate-spin" />{t('جاري التحميل...', 'Loading...')}</div>;
  if (!txs.length) return <p className="text-xs text-gray-400">{t('لا توجد معاملات', 'No transactions')}</p>;

  return (
    <div className="rounded-lg border border-gray-200 dark:border-neutral-700 overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-100 dark:bg-neutral-700/50 border-b border-gray-200 dark:border-neutral-700">
            <th className="text-start px-3 py-2 font-medium text-gray-500">{t('التاريخ', 'Date')}</th>
            <th className="text-start px-3 py-2 font-medium text-gray-500">{t('المصدر', 'Source')}</th>
            <th className="text-end   px-3 py-2 font-medium text-gray-500">{t('رسم الجلسة', 'Session Fee')}</th>
            <th className="text-end   px-3 py-2 font-medium text-orange-500">{t('وسيط %', 'Src %')}</th>
            <th className="text-end   px-3 py-2 font-medium text-orange-500">{t('حصة الوسيط', 'Mediator Cut')}</th>
            <th className="text-start px-3 py-2 font-medium text-violet-500">{t('خدمة إضافية', 'Extra Service')}</th>
            <th className="text-end   px-3 py-2 font-medium text-violet-500">{t('تكلفة', 'Cost')}</th>
            <th className="text-end   px-3 py-2 font-medium text-gray-500">{t('الصافي', 'Net Pool')}</th>
            <th className="text-end   px-3 py-2 font-medium text-blue-500">{t('د %', 'Dr %')}</th>
            <th className="text-end   px-3 py-2 font-medium text-blue-500">{t('حصة الطبيب', 'Doctor')}</th>
            <th className="text-end   px-3 py-2 font-medium text-emerald-500">{t('ع %', 'Cl %')}</th>
            <th className="text-end   px-3 py-2 font-medium text-emerald-500">{t('العيادة', 'Clinic')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-neutral-700/50">
          {txs.map((tx) => {
            const extraCost = tx.procedureCost ?? 0;
            const procName  = tx.procedureId ? (procedureMap.get(tx.procedureId)?.nameEn ?? '—') : '—';
            return (
              <tr key={tx.id} className="hover:bg-white dark:hover:bg-neutral-700/20 transition-colors">
                <td className="px-3 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">{tx.transactionDate?.slice(0, 10)}</td>
                <td className="px-3 py-2">
                  <span className="bg-gray-100 dark:bg-neutral-700 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-300">{tx.patientSource}</span>
                </td>
                <td className="px-3 py-2 text-end font-mono tabular-nums text-gray-700 dark:text-gray-300">{fmt(tx.approvedCharge)}</td>
                <td className="px-3 py-2 text-end font-mono text-orange-500">{tx.sourceFeePercentage}%</td>
                <td className="px-3 py-2 text-end font-mono tabular-nums text-orange-600 dark:text-orange-400">{fmt(tx.sourceFeeAmount)}</td>
                <td className="px-3 py-2 text-violet-600 dark:text-violet-400 whitespace-nowrap">
                  {extraCost > 0 ? procName : <span className="text-gray-300 dark:text-gray-600">—</span>}
                </td>
                <td className="px-3 py-2 text-end font-mono tabular-nums text-violet-600 dark:text-violet-400">
                  {extraCost > 0 ? fmt(extraCost) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                </td>
                <td className="px-3 py-2 text-end font-mono tabular-nums text-gray-700 dark:text-gray-300">{fmt(tx.grossRevenue)}</td>
                <td className="px-3 py-2 text-end font-mono text-blue-500">{tx.splitDoctorPercentage}%</td>
                <td className="px-3 py-2 text-end font-mono tabular-nums text-blue-700 dark:text-blue-400 font-semibold">{fmt(tx.doctorShare)}</td>
                <td className="px-3 py-2 text-end font-mono text-emerald-500">{tx.splitClinicPercentage}%</td>
                <td className="px-3 py-2 text-end font-mono tabular-nums text-emerald-700 dark:text-emerald-400 font-semibold">{fmt(tx.clinicShare)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-gray-200 dark:border-neutral-600 bg-gray-50 dark:bg-neutral-700/30 font-semibold">
            <td colSpan={2} className="px-3 py-2 text-gray-500 text-xs">{t('المجموع', 'Total')} ({txs.length})</td>
            <td className="px-3 py-2 text-end font-mono tabular-nums text-gray-800 dark:text-gray-200">
              {fmt(txs.reduce((s, tx) => s + tx.approvedCharge, 0))}
            </td>
            <td />
            <td className="px-3 py-2 text-end font-mono tabular-nums text-orange-600 dark:text-orange-400">
              {fmt(txs.reduce((s, tx) => s + tx.sourceFeeAmount, 0))}
            </td>
            <td />
            <td className="px-3 py-2 text-end font-mono tabular-nums text-violet-600 dark:text-violet-400">
              {fmt(txs.reduce((s, tx) => s + (tx.procedureCost ?? 0), 0))}
            </td>
            <td className="px-3 py-2 text-end font-mono tabular-nums text-gray-700 dark:text-gray-300">
              {fmt(txs.reduce((s, tx) => s + tx.grossRevenue, 0))}
            </td>
            <td />
            <td className="px-3 py-2 text-end font-mono tabular-nums text-blue-700 dark:text-blue-300">
              {fmt(txs.reduce((s, tx) => s + tx.doctorShare, 0))}
            </td>
            <td />
            <td className="px-3 py-2 text-end font-mono tabular-nums text-emerald-700 dark:text-emerald-300">
              {fmt(txs.reduce((s, tx) => s + tx.clinicShare, 0))}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
