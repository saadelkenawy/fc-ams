'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Banknote, RefreshCw, ReceiptText, ChevronDown, ChevronRight,
  Building2, Stethoscope, Share2, Loader2, FlaskConical, Check, X,
  Search, SlidersHorizontal, ChevronUp, ArrowUpDown,
  CheckCircle2, AlertTriangle, Lock, Plus, Trash2,
  Eye, EyeOff, RotateCcw, User,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useLang } from '@/contexts/LanguageContext';
import { formatCurrency } from '@/lib/utils';
import {
  useSettlements, useTransactions, useExtraServices, useReplaceExtraServices,
  useSettlementRecords, useReverseSettlement, useReconcileDoctor,
} from '@/hooks/useBilling';
import { useDoctors, useDoctorMap } from '@/hooks/useDoctors';
import { usePatientBatch } from '@/hooks/usePatients';
import { cn } from '@/lib/utils';
import type { DoctorSettlement, FinancialTransaction } from '@fadl/types';

type SortKey = 'name' | 'sessions' | 'sessionFees' | 'netPool' | 'doctor' | 'clinic';
type SortDir = 'asc' | 'desc';

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Cash / نقدي',
  bank: 'Bank Transfer / تحويل بنكي',
  cheque: 'Cheque / شيك',
  transfer: 'InstaPay / تحويل فوري',
};

export default function SettlementsPage() {
  const { lang, t } = useLang();
  const locale = lang === 'ar' ? 'ar-EG' : 'en-US';

  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const [from, setFrom] = useState(today);
  const [to, setTo]     = useState(today);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Filters
  const [showAdvanced, setShowAdvanced]     = useState(false);
  const [doctorSearch, setDoctorSearch]     = useState('');
  const [selectedDoctor, setSelectedDoctor] = useState('');
  const [minNetPool, setMinNetPool]         = useState('');
  const [maxNetPool, setMaxNetPool]         = useState('');
  const [sortKey, setSortKey]               = useState<SortKey>('name');
  const [sortDir, setSortDir]               = useState<SortDir>('asc');

  const hasActiveFilters = !!(selectedDoctor || minNetPool || maxNetPool);

  // Settle dialog
  const [settleTarget, setSettleTarget]         = useState<DoctorSettlement | null>(null);
  const [settleMethod, setSettleMethod]         = useState<'cash' | 'bank' | 'cheque' | 'transfer'>('cash');
  const [settleRef, setSettleRef]               = useState('');
  const [settleNotes, setSettleNotes]           = useState('');
  const [settlePassword, setSettlePassword]     = useState('');
  const [settlePasswordErr, setSettlePasswordErr] = useState('');
  const { mutateAsync: reconcile, isPending: settling, error: settleErr } = useReconcileDoctor();

  // Reverse dialog
  const [reverseTarget, setReverseTarget]           = useState<string | null>(null);
  const [reverseReason, setReverseReason]           = useState('');
  const [reversePassword, setReversePassword]       = useState('');
  const [reversePasswordErr, setReversePasswordErr] = useState('');
  const [reverseError, setReverseError]             = useState('');
  const { mutateAsync: reverseSettle, isPending: reversing } = useReverseSettlement();

  // Data
  const { data, isLoading, isError, refetch, isFetching } = useSettlements({ from, to, limit: 100, unsettledOnly: true });
  const { data: recordsData, refetch: refetchRecords } = useSettlementRecords({ from, to, limit: 100 });
  const doctorMap  = useDoctorMap();
  const { data: doctorsData } = useDoctors({ isActive: true, limit: 200 });
  const doctorList = doctorsData?.data ?? [];
  const rawSettlements = data?.data ?? [];
  const completedRecords = recordsData?.data ?? [];

  const fmt = useCallback((n: number) => formatCurrency(n, 'EGP', locale), [locale]);

  // Client-side filter + sort for pending settlements
  const settlements: DoctorSettlement[] = useMemo(() => {
    let list = rawSettlements.filter((s) => (s.netPayable ?? 0) > 0);
    if (selectedDoctor) {
      list = list.filter((s) => s.doctorId === selectedDoctor);
    } else if (doctorSearch.trim()) {
      const q = doctorSearch.toLowerCase();
      list = list.filter((s) => {
        const doc = doctorMap.get(s.doctorId);
        return (doc?.nameEn ?? '').toLowerCase().includes(q) || (doc?.nameAr ?? '').includes(q);
      });
    }
    if (minNetPool) list = list.filter((s) => s.grossRevenue >= Number(minNetPool));
    if (maxNetPool) list = list.filter((s) => s.grossRevenue <= Number(maxNetPool));

    list.sort((a, b) => {
      let va: number | string = 0, vb: number | string = 0;
      switch (sortKey) {
        case 'name':       va = doctorMap.get(a.doctorId)?.nameEn ?? ''; vb = doctorMap.get(b.doctorId)?.nameEn ?? ''; break;
        case 'sessions':   va = (a.totalConsultations ?? 0) + (a.totalProcedures ?? 0); vb = (b.totalConsultations ?? 0) + (b.totalProcedures ?? 0); break;
        case 'sessionFees':va = a.totalSessionFees ?? a.grossRevenue; vb = b.totalSessionFees ?? b.grossRevenue; break;
        case 'netPool':    va = a.grossRevenue; vb = b.grossRevenue; break;
        case 'doctor':     va = a.doctorShare;  vb = b.doctorShare;  break;
        case 'clinic':     va = a.clinicShare;  vb = b.clinicShare;  break;
      }
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
      return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
    return list;
  }, [rawSettlements, selectedDoctor, doctorSearch, doctorMap, minNetPool, maxNetPool, sortKey, sortDir]);

  const totalSessionFees   = settlements.reduce((s, r) => s + (r.totalSessionFees ?? r.grossRevenue + r.totalSourceFees), 0);
  const totalMediator      = settlements.reduce((s, r) => s + r.totalSourceFees, 0);
  const totalExtraServices = settlements.reduce((s, r) => s + (r.totalExtraServices ?? 0), 0);
  const totalDoctors       = settlements.reduce((s, r) => s + r.doctorShare, 0);
  const totalClinic        = settlements.reduce((s, r) => s + r.clinicShare, 0);
  const totalNetPool       = settlements.reduce((s, r) => s + r.grossRevenue, 0);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };
  const clearFilters = () => { setSelectedDoctor(''); setDoctorSearch(''); setMinNetPool(''); setMaxNetPool(''); };

  const SortIcon = ({ col }: { col: SortKey }) =>
    sortKey === col
      ? (sortDir === 'asc' ? <ChevronUp className="w-3 h-3 inline ms-0.5" /> : <ChevronDown className="w-3 h-3 inline ms-0.5" />)
      : <ArrowUpDown className="w-3 h-3 inline ms-0.5 opacity-30" />;

  const handleSettle = async () => {
    if (!settleTarget) return;
    if (!settlePassword) { setSettlePasswordErr(t('كلمة المرور مطلوبة', 'Password is required')); return; }
    setSettlePasswordErr('');
    await reconcile({
      doctorId: settleTarget.doctorId,
      from,
      to,
      paymentMethod: settleMethod,
      paymentReference: settleRef || undefined,
      notes: settleNotes || undefined,
      password: settlePassword,
    });
    void refetch();
    void refetchRecords();
    setSettleTarget(null);
    setSettleRef('');
    setSettleNotes('');
    setSettleMethod('cash');
    setSettlePassword('');
    setSettlePasswordErr('');
  };

  const handleReverse = async () => {
    if (!reverseTarget || reverseReason.trim().length < 10) {
      setReverseError(t('السبب يجب أن يكون 10 أحرف على الأقل', 'Reason must be at least 10 characters'));
      return;
    }
    if (!reversePassword) {
      setReversePasswordErr(t('كلمة المرور مطلوبة', 'Password is required'));
      return;
    }
    setReverseError('');
    setReversePasswordErr('');
    try {
      await reverseSettle({ id: reverseTarget, reason: reverseReason, password: reversePassword });
      setReverseTarget(null);
      setReverseReason('');
      setReversePassword('');
      void refetchRecords();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      setReverseError(msg || t('كلمة المرور غير صحيحة أو فشل العكس', 'Incorrect password or reversal failed'));
    }
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold font-display text-gray-900 dark:text-gray-100">
            {t('التسويات المالية', 'Financial Settlements')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {t('وسيط من رسم الجلسة فقط؛ الخدمات الإضافية بالكامل للصافي', 'Mediator cut on session fee only; extra services added in full to net pool')}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <label htmlFor="settle-from-date" className="text-xs text-gray-500">{t('من', 'From')}</label>
            <input id="settle-from-date" type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="text-sm border border-gray-200 dark:border-neutral-600 rounded-lg px-3 py-1.5 bg-white dark:bg-neutral-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-600" />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="settle-to-date" className="text-xs text-gray-500">{t('إلى', 'To')}</label>
            <input id="settle-to-date" type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="text-sm border border-gray-200 dark:border-neutral-600 rounded-lg px-3 py-1.5 bg-white dark:bg-neutral-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-600" />
          </div>
          <Button variant="outline" size="sm" onClick={() => { void refetch(); void refetchRecords(); }} disabled={isFetching}>
            <RefreshCw className={cn('w-3.5 h-3.5', isFetching && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-52">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input type="text" value={doctorSearch}
              onChange={(e) => { setDoctorSearch(e.target.value); setSelectedDoctor(''); }}
              placeholder={t('بحث باسم الطبيب...', 'Search doctor name...')}
              aria-label={t('بحث باسم الطبيب', 'Search by doctor name')}
              className="w-full ps-8 pe-3 py-1.5 text-sm border border-gray-200 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-800 text-gray-800 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600"
            />
          </div>
          <select value={selectedDoctor} onChange={(e) => { setSelectedDoctor(e.target.value); setDoctorSearch(''); }}
            className="text-sm border border-gray-200 dark:border-neutral-600 rounded-lg px-3 py-1.5 bg-white dark:bg-neutral-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-600">
            <option value="">{t('كل الأطباء', 'All doctors')}</option>
            {doctorList.map((d) => <option key={d.id} value={d.id}>{d.nameEn}</option>)}
          </select>
          <Button variant="outline" size="sm" onClick={() => setShowAdvanced((v) => !v)} className={cn(showAdvanced && 'ring-2 ring-primary-500')}>
            <SlidersHorizontal className="w-3.5 h-3.5 me-1.5" />
            {t('فلتر متقدم', 'Advanced')}
            {hasActiveFilters && <span className="ms-1.5 w-2 h-2 rounded-full bg-primary-500 inline-block" />}
          </Button>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5 me-1" />{t('مسح الفلاتر', 'Clear filters')}
            </Button>
          )}
        </div>

        {showAdvanced && (
          <div className="rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/60 px-4 py-3 flex flex-wrap gap-4 items-end">
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-500">{t('صافي المجمع: من', 'Net Pool: min')}</p>
              <input type="number" min="0" step="100" value={minNetPool} onChange={(e) => setMinNetPool(e.target.value)} placeholder="0"
                className="w-32 text-sm border border-gray-200 dark:border-neutral-600 rounded-lg px-3 py-1.5 bg-white dark:bg-neutral-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-600 [appearance:textfield]" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-500">{t('صافي المجمع: إلى', 'Net Pool: max')}</p>
              <input type="number" min="0" step="100" value={maxNetPool} onChange={(e) => setMaxNetPool(e.target.value)} placeholder="∞"
                className="w-32 text-sm border border-gray-200 dark:border-neutral-600 rounded-lg px-3 py-1.5 bg-white dark:bg-neutral-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-600 [appearance:textfield]" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-500">{t('ترتيب حسب', 'Sort by')}</p>
              <div className="flex gap-1">
                <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}
                  className="text-sm border border-gray-200 dark:border-neutral-600 rounded-lg px-3 py-1.5 bg-white dark:bg-neutral-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-600">
                  <option value="name">{t('الاسم', 'Name')}</option>
                  <option value="sessions">{t('الجلسات', 'Sessions')}</option>
                  <option value="sessionFees">{t('رسوم الجلسة', 'Session Fees')}</option>
                  <option value="netPool">{t('الصافي', 'Net Pool')}</option>
                  <option value="doctor">{t('حصة الطبيب', "Doctor's Share")}</option>
                  <option value="clinic">{t('حصة العيادة', "Clinic's Share")}</option>
                </select>
                <button onClick={() => setSortDir((d) => d === 'asc' ? 'desc' : 'asc')}
                  className="px-2 py-1.5 text-sm border border-gray-200 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50">
                  {sortDir === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-gray-400 hover:text-gray-600 self-end">
              <X className="w-3.5 h-3.5 me-1" />{t('مسح', 'Clear')}
            </Button>
          </div>
        )}
      </div>

      {/* Summary cards */}
      {!isLoading && settlements.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="rounded-xl border border-gray-100 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-3">
            <div className="flex items-center gap-1 mb-1"><Banknote className="w-3 h-3 text-gray-400" /><p className="text-xs text-gray-400">{t('رسوم الجلسات', 'Session Fees')}</p></div>
            <p className="text-base font-bold font-mono tabular-nums text-gray-900 dark:text-gray-100">{fmt(totalSessionFees)}</p>
          </div>
          <div className="rounded-xl border border-orange-100 dark:border-orange-900/30 bg-orange-50 dark:bg-orange-900/10 p-3">
            <div className="flex items-center gap-1 mb-1"><Share2 className="w-3 h-3 text-orange-500" /><p className="text-xs text-orange-600 dark:text-orange-400">{t('الوسيط', 'Mediator')}</p></div>
            <p className="text-base font-bold font-mono tabular-nums text-orange-700 dark:text-orange-300">{fmt(totalMediator)}</p>
            {totalSessionFees > 0 && <p className="text-xs text-orange-400 mt-0.5">{((totalMediator / totalSessionFees) * 100).toFixed(1)}%</p>}
          </div>
          <div className="rounded-xl border border-violet-100 dark:border-violet-900/30 bg-violet-50 dark:bg-violet-900/10 p-3">
            <div className="flex items-center gap-1 mb-1"><FlaskConical className="w-3 h-3 text-violet-500" /><p className="text-xs text-violet-600 dark:text-violet-400">{t('خدمات إضافية', 'Extra Services')}</p></div>
            <p className="text-base font-bold font-mono tabular-nums text-violet-700 dark:text-violet-300">{fmt(totalExtraServices)}</p>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-neutral-600 bg-gray-50 dark:bg-neutral-700/40 p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t('صافي المجمع', 'Net Pool')}</p>
            <p className="text-base font-bold font-mono tabular-nums text-gray-800 dark:text-gray-100">{fmt(totalNetPool)}</p>
          </div>
          <div className="rounded-xl border border-blue-100 dark:border-blue-900/30 bg-blue-50 dark:bg-blue-900/10 p-3">
            <div className="flex items-center gap-1 mb-1"><Stethoscope className="w-3 h-3 text-blue-500" /><p className="text-xs text-blue-600 dark:text-blue-400">{t("مستحق الأطباء", "Doctors'")}</p></div>
            <p className="text-base font-bold font-mono tabular-nums text-blue-700 dark:text-blue-300">{fmt(totalDoctors)}</p>
            {totalNetPool > 0 && <p className="text-xs text-blue-400 mt-0.5">{((totalDoctors / totalNetPool) * 100).toFixed(1)}%</p>}
          </div>
          <div className="rounded-xl border border-emerald-100 dark:border-emerald-900/30 bg-emerald-50 dark:bg-emerald-900/10 p-3">
            <div className="flex items-center gap-1 mb-1"><Building2 className="w-3 h-3 text-emerald-500" /><p className="text-xs text-emerald-600 dark:text-emerald-400">{t('صافي العيادة', 'Clinic Net')}</p></div>
            <p className="text-base font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-300">{fmt(totalClinic)}</p>
            {totalNetPool > 0 && <p className="text-xs text-emerald-400 mt-0.5">{((totalClinic / totalNetPool) * 100).toFixed(1)}%</p>}
          </div>
        </div>
      )}

      {/* ── PENDING SETTLEMENTS ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          {t('التسويات المعلقة', 'Pending Settlements')}
        </h3>
        {!isLoading && <span className="text-xs text-gray-400 bg-gray-100 dark:bg-neutral-700 rounded-full px-2 py-0.5">{settlements.length}</span>}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin me-2" />{t('جاري التحميل...', 'Loading...')}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <ReceiptText className="w-12 h-12 text-gray-300 dark:text-gray-600" />
          <p className="text-gray-500 font-medium">{t('تعذّر تحميل التسويات', 'Failed to load settlements')}</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} />{t('إعادة المحاولة', 'Retry')}
          </Button>
        </div>
      ) : settlements.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <CheckCircle2 className="w-10 h-10 text-emerald-400" />
          <p className="text-gray-500 font-medium">{t('لا توجد تسويات معلقة في هذه الفترة', 'No pending settlements in this period')}</p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-neutral-700 bg-gray-50/60 dark:bg-neutral-800/60">
                    <th className="w-8 px-3 py-3" />
                    <th className="text-start px-4 py-3 font-medium text-gray-500 text-xs whitespace-nowrap cursor-pointer hover:text-gray-700 select-none" onClick={() => toggleSort('name')}>
                      {t('الطبيب', 'Doctor')} <SortIcon col="name" />
                    </th>
                    <th className="text-end px-4 py-3 font-medium text-gray-500 text-xs whitespace-nowrap cursor-pointer hover:text-gray-700 select-none" onClick={() => toggleSort('sessions')}>
                      {t('حجوزات', 'Sessions')} <SortIcon col="sessions" />
                    </th>
                    <th className="text-end px-4 py-3 font-medium text-gray-500 text-xs whitespace-nowrap cursor-pointer hover:text-gray-700 select-none" onClick={() => toggleSort('sessionFees')}>
                      {t('رسوم الجلسة', 'Session Fees')} <SortIcon col="sessionFees" />
                    </th>
                    <th className="text-end px-4 py-3 text-xs whitespace-nowrap">
                      <span className="flex items-center justify-end gap-1 text-orange-500 font-medium"><Share2 className="w-3 h-3" />{t('الوسيط', 'Mediator')}</span>
                    </th>
                    <th className="text-end px-4 py-3 text-xs whitespace-nowrap">
                      <span className="flex items-center justify-end gap-1 text-violet-500 font-medium"><FlaskConical className="w-3 h-3" />{t('إضافية', 'Extra Svcs')}</span>
                    </th>
                    <th className="text-end px-4 py-3 font-medium text-gray-500 text-xs whitespace-nowrap cursor-pointer hover:text-gray-700 select-none" onClick={() => toggleSort('netPool')}>
                      {t('الصافي', 'Net Pool')} <SortIcon col="netPool" />
                    </th>
                    <th className="text-end px-4 py-3 text-xs whitespace-nowrap cursor-pointer hover:text-blue-600 select-none" onClick={() => toggleSort('doctor')}>
                      <span className="flex items-center justify-end gap-1 text-blue-500 font-medium"><Stethoscope className="w-3 h-3" />{t('الطبيب', 'Doctor')} <SortIcon col="doctor" /></span>
                    </th>
                    <th className="text-end px-4 py-3 text-xs whitespace-nowrap cursor-pointer hover:text-emerald-600 select-none" onClick={() => toggleSort('clinic')}>
                      <span className="flex items-center justify-end gap-1 text-emerald-500 font-medium"><Building2 className="w-3 h-3" />{t('العيادة', 'Clinic')} <SortIcon col="clinic" /></span>
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {settlements.map((s) => {
                    const sessionFees = s.totalSessionFees ?? (s.grossRevenue + s.totalSourceFees);
                    const extraSvcs   = s.totalExtraServices ?? 0;
                    const extraCount  = s.totalExtraServicesCount ?? 0;
                    const isOpen      = expanded === s.doctorId;
                    return (
                      <>
                        <tr key={s.doctorId} onClick={() => setExpanded(isOpen ? null : s.doctorId)}
                          className="border-b border-gray-50 dark:border-neutral-700/50 cursor-pointer transition-colors hover:bg-gray-50/60 dark:hover:bg-neutral-700/20">
                          <td className="px-3 py-3.5 text-gray-400">
                            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </td>
                          <td className="px-4 py-3.5 font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">
                            {doctorMap.get(s.doctorId)?.nameEn ?? s.doctorId.slice(0, 8)}
                          </td>
                          <td className="px-4 py-3.5 text-end font-mono text-gray-600 dark:text-gray-300">
                            {(s.totalConsultations ?? 0) + (s.totalProcedures ?? 0)}
                          </td>
                          <td className="px-4 py-3.5 text-end font-mono tabular-nums text-gray-700 dark:text-gray-200">{fmt(sessionFees)}</td>
                          <td className="px-4 py-3.5 text-end font-mono tabular-nums text-orange-600 dark:text-orange-400">{fmt(s.totalSourceFees)}</td>
                          <td className="px-4 py-3.5 text-end">
                            <span className="font-mono tabular-nums text-violet-600 dark:text-violet-400">{fmt(extraSvcs)}</span>
                            {extraCount > 0 && (
                              <span className="block text-[10px] text-gray-400 mt-0.5">({extraCount} {t('بنود', 'items')})</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-end font-mono tabular-nums text-gray-600 dark:text-gray-300">{fmt(s.grossRevenue)}</td>
                          <td className="px-4 py-3.5 text-end font-mono tabular-nums text-blue-700 dark:text-blue-400 font-semibold">{fmt(s.doctorShare)}</td>
                          <td className="px-4 py-3.5 text-end font-mono tabular-nums text-emerald-700 dark:text-emerald-400 font-semibold">{fmt(s.clinicShare)}</td>
                          <td className="px-4 py-3.5">
                            {(s.netPayable ?? 0) > 0 && (
                              <Button size="sm" className="h-7 px-3 text-xs whitespace-nowrap"
                                onClick={(e) => { e.stopPropagation(); setSettleTarget(s); }}>
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
                <tfoot>
                  <tr className="border-t-2 border-gray-200 dark:border-neutral-600 bg-gray-50 dark:bg-neutral-800/60 font-semibold text-sm">
                    <td className="px-3 py-3" />
                    <td className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wide">{t('الإجمالي', 'Total')}</td>
                    <td className="px-4 py-3 text-end font-mono text-gray-600">{settlements.reduce((s, r) => s + (r.totalConsultations ?? 0) + (r.totalProcedures ?? 0), 0)}</td>
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

      {/* ── COMPLETED SETTLEMENTS ──────────────────────────────────────────────── */}
      {completedRecords.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              {t('التسويات المكتملة', 'Completed Settlements')}
            </h3>
            <span className="text-xs text-gray-400 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-full px-2 py-0.5">{completedRecords.length}</span>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-gray-100 dark:divide-neutral-700/50">
                {completedRecords.map((rec) => (
                  <div key={rec.id} className={cn(
                    'flex items-center justify-between px-5 py-3.5 gap-4',
                    rec.reversedAt ? 'opacity-50' : 'bg-emerald-50/30 dark:bg-emerald-900/5',
                  )}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn('w-1 h-10 rounded-full flex-shrink-0', rec.reversedAt ? 'bg-gray-300' : 'bg-emerald-500')} />
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {doctorMap.get(rec.doctorId)?.nameEn ?? rec.doctorId.slice(0, 8)}
                          {rec.reversedAt && (
                            <span className="ms-2 text-xs font-normal text-gray-400 bg-gray-100 dark:bg-neutral-700 rounded px-1.5 py-0.5">
                              {t('مُعكوس', 'Reversed')}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {rec.periodFrom && rec.periodTo ? `${rec.periodFrom} → ${rec.periodTo}` : rec.settlementDate}
                          {' · '}{PAYMENT_METHOD_LABELS[rec.paymentMethod] ?? rec.paymentMethod}
                          {rec.paymentReference && ` · Ref: ${rec.paymentReference}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-end">
                        <p className="text-sm font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">{fmt(rec.amount)}</p>
                        <p className="text-xs text-gray-400">{new Date(rec.createdAt).toLocaleDateString()}</p>
                      </div>
                      {!rec.reversedAt && (
                        <Lock className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" aria-label={t('مُسوَّى', 'Settled')} />
                      )}
                      {!rec.reversedAt && (
                        <button
                          onClick={() => { setReverseTarget(rec.id); setReverseReason(''); setReversePassword(''); setReversePasswordErr(''); setReverseError(''); }}
                          className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors"
                          title={t('عكس التسوية', 'Reverse Settlement')}
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Settle confirmation dialog ──────────────────────────────────────────── */}
      {settleTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-md animate-slide-up p-6 space-y-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                <Banknote className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">{t('تأكيد التسوية', 'Confirm Settlement')}</h3>
                <p className="text-sm text-gray-500 mt-0.5">{doctorMap.get(settleTarget.doctorId)?.nameEn ?? '—'}</p>
              </div>
            </div>
            <div className="rounded-xl bg-gray-50 dark:bg-neutral-800 border border-gray-100 dark:border-neutral-700 p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">{t('الفترة', 'Period')}</span>
                <span className="font-mono text-gray-700 dark:text-gray-300">{from} → {to}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{t('عدد الجلسات', 'Sessions')}</span>
                <span className="font-mono text-gray-700 dark:text-gray-300">{(settleTarget.totalConsultations ?? 0) + (settleTarget.totalProcedures ?? 0)}</span>
              </div>
              <div className="flex justify-between border-t border-gray-200 dark:border-neutral-700 pt-2 mt-2">
                <span className="text-gray-500">{t('مستحق الطبيب', "Doctor's share")}</span>
                <span className="font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 text-base">{fmt(settleTarget.doctorShare)}</span>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">{t('طريقة الدفع', 'Payment Method')}</label>
                <select value={settleMethod} onChange={(e) => setSettleMethod(e.target.value as typeof settleMethod)}
                  className="w-full text-sm border border-gray-200 dark:border-neutral-600 rounded-lg px-3 py-2 bg-white dark:bg-neutral-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="cash">{t('نقدي', 'Cash')}</option>
                  <option value="bank">{t('تحويل بنكي', 'Bank Transfer')}</option>
                  <option value="cheque">{t('شيك', 'Cheque')}</option>
                  <option value="transfer">{t('InstaPay', 'InstaPay')}</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">{t('رقم المرجع (اختياري)', 'Reference No. (optional)')}</label>
                <input type="text" value={settleRef} onChange={(e) => setSettleRef(e.target.value)} placeholder="PAY-2026-0001"
                  className="w-full text-sm border border-gray-200 dark:border-neutral-600 rounded-lg px-3 py-2 bg-white dark:bg-neutral-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">{t('ملاحظات (اختياري)', 'Notes (optional)')}</label>
                <textarea rows={2} value={settleNotes} onChange={(e) => setSettleNotes(e.target.value)}
                  className="w-full text-sm border border-gray-200 dark:border-neutral-600 rounded-lg px-3 py-2 bg-white dark:bg-neutral-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">{t('كلمة مرورك للتأكيد', 'Your password to confirm')}</label>
                <input
                  type="password"
                  value={settlePassword}
                  onChange={(e) => { setSettlePassword(e.target.value); setSettlePasswordErr(''); }}
                  placeholder="••••••••"
                  className="w-full text-sm border border-gray-200 dark:border-neutral-600 rounded-lg px-3 py-2 bg-white dark:bg-neutral-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                {settlePasswordErr && <p className="text-xs text-red-500 mt-1">{settlePasswordErr}</p>}
              </div>
            </div>
            {settleErr != null && <p className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{settleErr instanceof Error ? settleErr.message : t('فشلت التسوية', 'Settlement failed')}</p>}
            <div className="flex gap-3 justify-end pt-1">
              <Button variant="outline" size="sm" onClick={() => { setSettleTarget(null); setSettlePassword(''); setSettlePasswordErr(''); }} disabled={settling}>{t('إلغاء', 'Cancel')}</Button>
              <Button size="sm" onClick={() => void handleSettle()} disabled={settling} className="min-w-28 bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500">
                {settling ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : <><Check className="w-3.5 h-3.5 me-1.5" />{t('تأكيد التسوية', 'Confirm & Settle')}</>}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reverse dialog ──────────────────────────────────────────────────────── */}
      {reverseTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-md animate-slide-up p-6 space-y-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">{t('عكس التسوية', 'Reverse Settlement')}</h3>
                <p className="text-sm text-gray-500 mt-0.5">{t('ستُعاد المعاملات إلى حالة "مدفوع"', 'Transactions will be restored to "paid" status')}</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">{t('سبب العكس (10 أحرف على الأقل)', 'Reversal reason (min 10 chars)')}</label>
                <textarea rows={3} value={reverseReason} onChange={(e) => { setReverseReason(e.target.value); setReverseError(''); }}
                  className="w-full text-sm border border-gray-200 dark:border-neutral-600 rounded-lg px-3 py-2 bg-white dark:bg-neutral-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none" />
                <p className={cn('text-xs', reverseReason.length >= 10 ? 'text-gray-400' : 'text-amber-500')}>
                  {reverseReason.length}/10 {t('حرف على الأقل', 'characters minimum')}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">{t('كلمة مرورك للتأكيد', 'Your password to confirm')}</label>
                <input
                  type="password"
                  value={reversePassword}
                  onChange={(e) => { setReversePassword(e.target.value); setReversePasswordErr(''); }}
                  placeholder="••••••••"
                  className="w-full text-sm border border-gray-200 dark:border-neutral-600 rounded-lg px-3 py-2 bg-white dark:bg-neutral-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                {reversePasswordErr && <p className="text-xs text-red-500 mt-1">{reversePasswordErr}</p>}
              </div>
            </div>
            {reverseError && <p className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{reverseError}</p>}
            <div className="flex gap-3 justify-end pt-1">
              <Button variant="outline" size="sm" onClick={() => { setReverseTarget(null); setReversePassword(''); setReversePasswordErr(''); setReverseError(''); }} disabled={reversing}>{t('إلغاء', 'Cancel')}</Button>
              <Button size="sm" className="min-w-28 bg-amber-600 hover:bg-amber-700 focus:ring-amber-500"
                onClick={() => void handleReverse()} disabled={reversing || reverseReason.trim().length < 10}>
                {reversing ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : <><RotateCcw className="w-3.5 h-3.5 me-1.5" />{t('عكس التسوية', 'Reverse')}</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Extra Services types ──────────────────────────────────────────────────────

interface EditableService {
  id: string;
  name: string;
  cost: string;
}

function makeItem(): EditableService {
  return { id: Math.random().toString(36).slice(2), name: '', cost: '' };
}

// ── Settlement Detail ─────────────────────────────────────────────────────────

function SettlementDetail({ doctorId, from, to, locale, t }: {
  doctorId: string; from: string; to: string; locale: string;
  t: (ar: string, en: string) => string;
}) {
  const { data: txData, isLoading } = useTransactions({ doctorId, dateFrom: from, dateTo: to, limit: 100 });
  const txs = (txData?.data ?? []).filter(
    (tx) => tx.paymentStatus === 'paid' || tx.paymentStatus === 'reconciled',
  );
  const fmt = (n: number) => formatCurrency(n, 'EGP', locale);

  // Collect all patient IDs and resolve names
  const patientIds = useMemo(() => txs.map((tx) => tx.patientId).filter(Boolean), [txs]);
  const patientMap = usePatientBatch(patientIds);

  if (isLoading) return (
    <div className="flex items-center gap-2 text-xs text-gray-400">
      <Loader2 className="w-3 h-3 animate-spin" />{t('جاري التحميل...', 'Loading...')}
    </div>
  );
  if (!txs.length) return <p className="text-xs text-gray-400">{t('لا توجد معاملات', 'No transactions')}</p>;

  return (
    <div className="rounded-lg border border-gray-200 dark:border-neutral-700 overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-100 dark:bg-neutral-700/50 border-b border-gray-200 dark:border-neutral-700">
            <th className="text-start px-3 py-2 font-medium text-gray-500">{t('التاريخ', 'Date')}</th>
            <th className="text-start px-3 py-2 font-medium text-blue-500">
              <span className="flex items-center gap-1"><User className="w-3 h-3" />{t('المريض', 'Patient')}</span>
            </th>
            <th className="text-start px-3 py-2 font-medium text-gray-500">{t('نوع الزيارة', 'Visit Type')}</th>
            <th className="text-start px-3 py-2 font-medium text-gray-500">{t('المصدر', 'Source')}</th>
            <th className="text-end   px-3 py-2 font-medium text-gray-500">{t('رسم الجلسة', 'Session Fee')}</th>
            <th className="text-end   px-3 py-2 font-medium text-orange-500">{t('وسيط %', 'Src %')}</th>
            <th className="text-end   px-3 py-2 font-medium text-orange-500">{t('الوسيط', 'Mediator')}</th>
            <th className="text-center px-3 py-2 font-medium text-violet-500">{t('الإضافية', 'Extra Svcs')}</th>
            <th className="text-end   px-3 py-2 font-medium text-gray-600 dark:text-gray-300">{t('الصافي', 'Net Pool')}</th>
            <th className="text-end   px-3 py-2 font-medium text-blue-500">{t('د %', 'Dr %')}</th>
            <th className="text-end   px-3 py-2 font-medium text-blue-500">{t('الطبيب', 'Doctor')}</th>
            <th className="text-end   px-3 py-2 font-medium text-emerald-500">{t('ع %', 'Cl %')}</th>
            <th className="text-end   px-3 py-2 font-medium text-emerald-500">{t('العيادة', 'Clinic')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-neutral-700/50">
          {txs.map((tx) => (
            <TransactionRow key={tx.id} tx={tx} fmt={fmt} t={t} patientMap={patientMap} />
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-gray-200 dark:border-neutral-600 bg-gray-50 dark:bg-neutral-700/30 font-semibold">
            <td colSpan={4} className="px-3 py-2 text-gray-500">{t('المجموع', 'Total')} ({txs.length})</td>
            <td className="px-3 py-2 text-end font-mono tabular-nums text-gray-800 dark:text-gray-200">
              {fmt(txs.reduce((s, tx) => s + tx.approvedCharge, 0))}
            </td>
            <td />
            <td className="px-3 py-2 text-end font-mono tabular-nums text-orange-600 dark:text-orange-400">
              {fmt(txs.reduce((s, tx) => s + tx.sourceFeeAmount, 0))}
            </td>
            <td className="px-3 py-2 text-center font-mono tabular-nums text-violet-600 dark:text-violet-400">
              {fmt(txs.reduce((s, tx) => s + (tx.procedureCost ?? 0), 0))}
            </td>
            <td className="px-3 py-2 text-end font-mono tabular-nums text-gray-700 dark:text-gray-300">
              {fmt(txs.reduce((s, tx) => s + (tx.approvedCharge - tx.sourceFeeAmount) + (tx.procedureCost ?? 0), 0))}
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

const VISIT_TYPE_LABELS: Record<string, { ar: string; en: string; color: string }> = {
  consultation: { ar: 'استشارة', en: 'Consult', color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' },
  operative:    { ar: 'عملية',   en: 'Operative', color: 'text-purple-600 bg-purple-50 dark:bg-purple-900/20' },
  online:       { ar: 'أونلاين', en: 'Online', color: 'text-teal-600 bg-teal-50 dark:bg-teal-900/20' },
};

// ── Transaction row ───────────────────────────────────────────────────────────

function TransactionRow({ tx, fmt, t, patientMap }: {
  tx: FinancialTransaction;
  fmt: (n: number) => string;
  t: (ar: string, en: string) => string;
  patientMap: Map<string, { patientId: string; nameEn: string; nameAr: string | null }>;
}) {
  const { data: serverItems = [] } = useExtraServices(tx.id);
  const [showExtras, setShowExtras] = useState(false);
  const [popupOpen, setPopupOpen]   = useState(false);
  const { mutateAsync: replaceServices } = useReplaceExtraServices();

  const cost      = serverItems.reduce((s, i) => s + i.cost, 0);
  const itemCount = serverItems.length;
  const netPool   = (tx.approvedCharge - tx.sourceFeeAmount) + cost;
  const drShare   = netPool * tx.splitDoctorPercentage / 100;
  const clShare   = netPool * tx.splitClinicPercentage / 100;

  const [lang] = useState(() => document.documentElement.lang ?? 'en');
  const patientInfo = patientMap.get(tx.patientId);
  const patientName = patientInfo
    ? (lang === 'ar' && patientInfo.nameAr ? patientInfo.nameAr : patientInfo.nameEn)
    : `…${tx.patientId.slice(0, 6)}`;

  const visitTypeInfo = tx.visitType ? VISIT_TYPE_LABELS[tx.visitType] : null;

  const editableInit = serverItems.map((i) => ({ id: i.id, name: i.serviceName, cost: String(i.cost) }));

  return (
    <>
      <tr className="hover:bg-white dark:hover:bg-neutral-700/20 transition-colors">
        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{tx.transactionDate?.slice(0, 10)}</td>
        {/* Patient name — Issue 3 */}
        <td className="px-3 py-2 max-w-[140px]">
          <span className="font-semibold text-gray-800 dark:text-gray-200 truncate block" title={patientName}>
            {patientName}
          </span>
        </td>
        {/* Visit type — Issue 6 */}
        <td className="px-3 py-2">
          {visitTypeInfo ? (
            <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', visitTypeInfo.color)}>
              {lang === 'ar' ? visitTypeInfo.ar : visitTypeInfo.en}
            </span>
          ) : <span className="text-gray-300">—</span>}
        </td>
        <td className="px-3 py-2">
          <span className="bg-gray-100 dark:bg-neutral-700 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-300">{tx.patientSource}</span>
        </td>
        <td className="px-3 py-2 text-end font-mono tabular-nums text-gray-700 dark:text-gray-300">{fmt(tx.approvedCharge)}</td>
        <td className="px-3 py-2 text-end font-mono text-orange-500">{tx.sourceFeePercentage}%</td>
        <td className="px-3 py-2 text-end font-mono tabular-nums text-orange-600 dark:text-orange-400">{fmt(tx.sourceFeeAmount)}</td>

        {/* Extra Services cell — Issue 4: shows count + expand toggle */}
        <td className="px-3 py-2 text-center">
          <div className="flex items-center justify-center gap-1">
            {itemCount > 0 ? (
              <button type="button" onClick={() => setShowExtras((v) => !v)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-mono tabular-nums bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300 hover:bg-violet-100 transition-colors">
                {fmt(cost)}
                <span className="text-[10px] text-violet-500">({itemCount})</span>
                {showExtras ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            ) : (
              <span className="text-xs text-gray-400 font-mono tabular-nums">{fmt(0)}</span>
            )}
            <button type="button" onClick={() => setPopupOpen(true)}
              className="p-1 rounded-lg text-gray-300 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
              title={t('إضافة/تعديل خدمة', 'Add/Edit service')}>
              <Plus className="w-3 h-3" />
            </button>
          </div>
        </td>

        <td className="px-3 py-2 text-end font-mono tabular-nums text-gray-600 dark:text-gray-300">{fmt(netPool)}</td>
        <td className="px-3 py-2 text-end font-mono text-blue-500">{tx.splitDoctorPercentage}%</td>
        <td className="px-3 py-2 text-end font-mono tabular-nums font-semibold text-blue-700 dark:text-blue-400">{fmt(drShare)}</td>
        <td className="px-3 py-2 text-end font-mono text-emerald-500">{tx.splitClinicPercentage}%</td>
        <td className="px-3 py-2 text-end font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">{fmt(clShare)}</td>
      </tr>

      {/* Issue 4: Inline extra services sub-rows */}
      {showExtras && itemCount > 0 && (
        <tr className="bg-violet-50/30 dark:bg-violet-900/5">
          <td colSpan={13} className="px-6 py-2">
            <div className="rounded-lg border border-violet-100 dark:border-violet-900/30 overflow-hidden">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-violet-50 dark:bg-violet-900/20">
                    <th className="text-start px-3 py-1.5 font-medium text-violet-600">{t('الخدمة', 'Service')}</th>
                    <th className="text-end px-3 py-1.5 font-medium text-violet-600">{t('التكلفة', 'Cost')}</th>
                    <th className="text-end px-3 py-1.5 font-medium text-blue-500">{t('الطبيب', 'Dr')}</th>
                    <th className="text-end px-3 py-1.5 font-medium text-emerald-500">{t('العيادة', 'Cl')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-violet-100 dark:divide-violet-900/20">
                  {serverItems.map((item) => {
                    const drSh = item.cost * tx.splitDoctorPercentage / 100;
                    const clSh = item.cost * tx.splitClinicPercentage / 100;
                    return (
                      <tr key={item.id} className="bg-white dark:bg-neutral-900/50">
                        <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300">{item.serviceName}</td>
                        <td className="px-3 py-1.5 text-end font-mono tabular-nums text-violet-700 dark:text-violet-400">{fmt(item.cost)}</td>
                        <td className="px-3 py-1.5 text-end font-mono tabular-nums text-blue-600 dark:text-blue-400">{fmt(drSh)}</td>
                        <td className="px-3 py-1.5 text-end font-mono tabular-nums text-emerald-600 dark:text-emerald-400">{fmt(clSh)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-violet-50 dark:bg-violet-900/10 font-semibold border-t border-violet-100 dark:border-violet-900/30">
                    <td className="px-3 py-1.5 text-violet-600">{t('الإجمالي', 'Total')} ({itemCount})</td>
                    <td className="px-3 py-1.5 text-end font-mono tabular-nums text-violet-700 dark:text-violet-400">{fmt(cost)}</td>
                    <td className="px-3 py-1.5 text-end font-mono tabular-nums text-blue-600">{fmt(cost * tx.splitDoctorPercentage / 100)}</td>
                    <td className="px-3 py-1.5 text-end font-mono tabular-nums text-emerald-600">{fmt(cost * tx.splitClinicPercentage / 100)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </td>
        </tr>
      )}

      {popupOpen && (
        <ExtraServicesPopup
          tx={tx}
          initItems={editableInit}
          t={t}
          fmt={fmt}
          replaceServices={replaceServices}
          onClose={() => setPopupOpen(false)}
        />
      )}
    </>
  );
}

// ── Extra Services Popup ──────────────────────────────────────────────────────

function ExtraServicesPopup({ tx, initItems, onClose, t, fmt, replaceServices }: {
  tx: FinancialTransaction;
  initItems: EditableService[];
  t: (ar: string, en: string) => string;
  fmt: (n: number) => string;
  replaceServices: (args: { transactionId: string; items: { serviceName: string; cost: number }[] }) => Promise<unknown>;
  onClose: () => void;
}) {
  const [items, setItems] = useState<EditableService[]>(initItems.length > 0 ? initItems : [makeItem()]);
  const [isPending, setIsPending] = useState(false);

  const totalExtra = items.reduce((s, i) => s + Math.max(0, Number(i.cost) || 0), 0);
  const mediator   = tx.sourceFeeAmount;
  const netPool    = (tx.approvedCharge - mediator) + totalExtra;
  const drProfit   = netPool * tx.splitDoctorPercentage / 100;
  const clProfit   = netPool * tx.splitClinicPercentage / 100;

  const update = (id: string, field: 'name' | 'cost', val: string) =>
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, [field]: val } : i));
  const remove = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

  const handleSave = async () => {
    setIsPending(true);
    const validItems = items
      .filter((i) => i.name.trim() || Number(i.cost) > 0)
      .map((i) => ({ serviceName: i.name.trim() || t('خدمة إضافية', 'Extra service'), cost: Math.max(0, Number(i.cost) || 0) }));
    await replaceServices({ transactionId: tx.id, items: validItems });
    setIsPending(false);
    onClose();
  };

  const fieldCls = 'h-8 rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500 transition-shadow';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-slide-up">
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-gray-100 dark:border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
              <FlaskConical className="w-4.5 h-4.5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">{t('الخدمات الإضافية', 'Extra Services')}</h3>
              <p className="text-xs text-gray-400 font-mono mt-0.5" dir="ltr">{tx.transactionDate?.slice(0, 10)} · {tx.patientSource}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          <div className="grid grid-cols-[1fr_100px_80px_80px_28px] gap-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide pb-1">
            <span>{t('الخدمة', 'Service')}</span>
            <span className="text-end">{t('التكلفة', 'Cost (EGP)')}</span>
            <span className="text-end text-blue-500">{t('الطبيب', 'Dr')}</span>
            <span className="text-end text-emerald-500">{t('العيادة', 'Cl')}</span>
            <span />
          </div>
          {items.map((item) => {
            const cost = Math.max(0, Number(item.cost) || 0);
            const drSh = cost * tx.splitDoctorPercentage / 100;
            const clSh = cost * tx.splitClinicPercentage / 100;
            return (
              <div key={item.id} className="grid grid-cols-[1fr_100px_80px_80px_28px] gap-2 items-center">
                <input className={cn(fieldCls, 'w-full')} placeholder={t('اسم الخدمة', 'Service name')} value={item.name} onChange={(e) => update(item.id, 'name', e.target.value)} />
                <input type="number" min="0" step="10" className={cn(fieldCls, 'w-full text-end font-mono')} value={item.cost} onChange={(e) => update(item.id, 'cost', e.target.value)} dir="ltr" />
                <span className="text-end font-mono text-xs tabular-nums text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg px-2 py-1.5">{fmt(drSh)}</span>
                <span className="text-end font-mono text-xs tabular-nums text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg px-2 py-1.5">{fmt(clSh)}</span>
                <button type="button" onClick={() => remove(item.id)} className="p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
          <button type="button" onClick={() => setItems((prev) => [...prev, makeItem()])}
            className="flex items-center gap-1.5 text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 font-medium mt-1 px-1 py-1 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors">
            <Plus className="w-3.5 h-3.5" />{t('إضافة خدمة', 'Add service')}
          </button>
        </div>
        <div className="mx-5 mb-4 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-100 dark:border-blue-900/40 px-4 py-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div><p className="text-gray-400 mb-0.5">{t('إجمالي الإضافية', 'Total extra')}</p><p className="font-bold font-mono text-violet-700 dark:text-violet-400">{fmt(totalExtra)}</p></div>
            <div><p className="text-orange-400 mb-0.5">{t('الوسيط', 'Mediator')}</p><p className="font-bold font-mono text-orange-600">−{fmt(mediator)}</p></div>
            <div><p className="text-gray-500 mb-0.5">{t('صافي المجمع', 'Net Pool')}</p><p className="font-bold font-mono text-gray-900 dark:text-gray-100">{fmt(netPool)}</p></div>
            <div className="space-y-0.5">
              <div className="flex justify-between"><span className="text-blue-500">{t('الطبيب', 'Doctor')}</span><span className="font-bold font-mono text-blue-700 dark:text-blue-400">{fmt(drProfit)}</span></div>
              <div className="flex justify-between"><span className="text-emerald-500">{t('العيادة', 'Clinic')}</span><span className="font-bold font-mono text-emerald-700 dark:text-emerald-400">{fmt(clProfit)}</span></div>
            </div>
          </div>
        </div>
        <div className="px-5 pb-5 flex justify-end gap-3 border-t border-gray-100 dark:border-neutral-800 pt-4">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isPending}>{t('إغلاق', 'Close')}</Button>
          <Button size="sm" onClick={() => void handleSave()} disabled={isPending} className="min-w-24 gap-1.5">
            {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {t('حفظ التغييرات', 'Save Changes')}
          </Button>
        </div>
      </div>
    </div>
  );
}
