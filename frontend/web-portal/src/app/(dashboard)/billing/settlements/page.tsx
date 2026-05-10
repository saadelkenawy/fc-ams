'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  Banknote, RefreshCw, ReceiptText, ChevronDown, ChevronRight,
  Building2, Stethoscope, Share2, Loader2, FlaskConical, Check, X,
  Search, SlidersHorizontal, ChevronUp, ArrowUpDown,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useLang } from '@/contexts/LanguageContext';
import { formatCurrency } from '@/lib/utils';
import { useSettlements, useTransactions, useUpdateProcedureCost } from '@/hooks/useBilling';
import { useDoctors, useDoctorMap } from '@/hooks/useDoctors';
import { useProcedureMap } from '@/hooks/useProcedures';
import { cn } from '@/lib/utils';
import type { DoctorSettlement } from '@fadl/types';

type SortKey = 'name' | 'sessions' | 'sessionFees' | 'netPool' | 'doctor' | 'clinic';
type SortDir = 'asc' | 'desc';

export default function SettlementsPage() {
  const { lang, t } = useLang();
  const locale = lang === 'ar' ? 'ar-EG' : 'en-US';

  const now = new Date();
  const [from, setFrom]         = useState(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]);
  const [to,   setTo]           = useState(now.toISOString().split('T')[0]);
  const [expanded, setExpanded] = useState<string | null>(null);

  // ── Filters ─────────────────────────────────────────────────────────────────
  const [showAdvanced, setShowAdvanced]   = useState(false);
  const [doctorSearch, setDoctorSearch]   = useState('');
  const [selectedDoctor, setSelectedDoctor] = useState('');
  const [sourceFilter, setSourceFilter]   = useState('');
  const [minNetPool,   setMinNetPool]     = useState('');
  const [maxNetPool,   setMaxNetPool]     = useState('');
  const [sortKey, setSortKey]             = useState<SortKey>('name');
  const [sortDir, setSortDir]             = useState<SortDir>('asc');

  const hasActiveFilters = selectedDoctor || sourceFilter || minNetPool || maxNetPool;

  // ── Data ─────────────────────────────────────────────────────────────────────
  const { data, isLoading, isError, refetch, isFetching } = useSettlements({ from, to, limit: 100 });
  const doctorMap  = useDoctorMap();
  const { data: doctorsData } = useDoctors({ isActive: true, limit: 200 });
  const doctorList = doctorsData?.data ?? [];
  const rawSettlements = data?.data ?? [];

  const fmt = (n: number) => formatCurrency(n, 'EGP', locale);

  // ── Unique sources found in settlements (via transactions data isn't available
  //    here, so we derive unique sources from loaded doctor list as a placeholder;
  //    settlement rows don't carry source info at this level — source filter is
  //    applied at the transaction level inside SettlementDetail)
  // We keep this for future use — for now source filter is shown grayed out with
  // a note that it applies inside the expanded detail rows.

  // ── Client-side filter + sort ────────────────────────────────────────────────
  const settlements: DoctorSettlement[] = useMemo(() => {
    let list = [...rawSettlements];

    // Doctor filter
    if (selectedDoctor) {
      list = list.filter((s) => s.doctorId === selectedDoctor);
    } else if (doctorSearch.trim()) {
      const q = doctorSearch.toLowerCase();
      list = list.filter((s) => {
        const doc = doctorMap.get(s.doctorId);
        return (doc?.nameEn ?? '').toLowerCase().includes(q)
            || (doc?.nameAr ?? '').includes(q);
      });
    }

    // Amount filter (net pool)
    if (minNetPool) list = list.filter((s) => s.grossRevenue >= Number(minNetPool));
    if (maxNetPool) list = list.filter((s) => s.grossRevenue <= Number(maxNetPool));

    // Sort
    list.sort((a, b) => {
      let va: number | string = 0, vb: number | string = 0;
      switch (sortKey) {
        case 'name':
          va = doctorMap.get(a.doctorId)?.nameEn ?? '';
          vb = doctorMap.get(b.doctorId)?.nameEn ?? '';
          break;
        case 'sessions':
          va = (a.totalConsultations ?? 0) + (a.totalProcedures ?? 0);
          vb = (b.totalConsultations ?? 0) + (b.totalProcedures ?? 0);
          break;
        case 'sessionFees':
          va = a.totalSessionFees ?? (a.grossRevenue + a.totalSourceFees);
          vb = b.totalSessionFees ?? (b.grossRevenue + b.totalSourceFees);
          break;
        case 'netPool': va = a.grossRevenue;  vb = b.grossRevenue;  break;
        case 'doctor':  va = a.doctorShare;   vb = b.doctorShare;   break;
        case 'clinic':  va = a.clinicShare;   vb = b.clinicShare;   break;
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

  const clearFilters = () => {
    setSelectedDoctor('');
    setDoctorSearch('');
    setSourceFilter('');
    setMinNetPool('');
    setMaxNetPool('');
  };

  const SortIcon = ({ col }: { col: SortKey }) =>
    sortKey === col
      ? (sortDir === 'asc' ? <ChevronUp className="w-3 h-3 inline ms-0.5" /> : <ChevronDown className="w-3 h-3 inline ms-0.5" />)
      : <ArrowUpDown className="w-3 h-3 inline ms-0.5 opacity-30" />;

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold font-display text-gray-900 dark:text-gray-100">
            {t('التسويات المالية', 'Financial Settlements')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {t('وسيط من رسم الجلسة فقط؛ الخدمات الإضافية بالكامل للصافي', 'Mediator cut on session fee only; extra services added in full to net pool')}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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
      </div>

      {/* ── Search & Filter bar ────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Doctor quick search */}
          <div className="relative flex-1 min-w-52">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={doctorSearch}
              onChange={(e) => { setDoctorSearch(e.target.value); setSelectedDoctor(''); }}
              placeholder={t('بحث باسم الطبيب...', 'Search doctor name...')}
              className="w-full ps-8 pe-3 py-1.5 text-sm border border-gray-200 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-800 text-gray-800 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Doctor dropdown */}
          <select
            value={selectedDoctor}
            onChange={(e) => { setSelectedDoctor(e.target.value); setDoctorSearch(''); }}
            className="text-sm border border-gray-200 dark:border-neutral-600 rounded-lg px-3 py-1.5 bg-white dark:bg-neutral-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">{t('كل الأطباء', 'All doctors')}</option>
            {doctorList.map((d) => (
              <option key={d.id} value={d.id}>{d.nameEn}</option>
            ))}
          </select>

          {/* Advanced toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAdvanced((v) => !v)}
            className={cn(showAdvanced && 'ring-2 ring-primary-500')}
          >
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

        {/* Advanced panel */}
        {showAdvanced && (
          <div className="rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/60 px-4 py-3 flex flex-wrap gap-4 items-end">
            {/* Net pool range */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-500">{t('صافي المجمع — من', 'Net Pool — min')}</p>
              <input
                type="number"
                min="0"
                step="100"
                value={minNetPool}
                onChange={(e) => setMinNetPool(e.target.value)}
                placeholder="0"
                className="w-32 text-sm border border-gray-200 dark:border-neutral-600 rounded-lg px-3 py-1.5 bg-white dark:bg-neutral-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-500">{t('صافي المجمع — إلى', 'Net Pool — max')}</p>
              <input
                type="number"
                min="0"
                step="100"
                value={maxNetPool}
                onChange={(e) => setMaxNetPool(e.target.value)}
                placeholder="∞"
                className="w-32 text-sm border border-gray-200 dark:border-neutral-600 rounded-lg px-3 py-1.5 bg-white dark:bg-neutral-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </div>

            {/* Sort */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-500">{t('ترتيب حسب', 'Sort by')}</p>
              <div className="flex gap-1">
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                  className="text-sm border border-gray-200 dark:border-neutral-600 rounded-lg px-3 py-1.5 bg-white dark:bg-neutral-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="name">{t('الاسم', 'Name')}</option>
                  <option value="sessions">{t('الجلسات', 'Sessions')}</option>
                  <option value="sessionFees">{t('رسوم الجلسة', 'Session Fees')}</option>
                  <option value="netPool">{t('الصافي', 'Net Pool')}</option>
                  <option value="doctor">{t('حصة الطبيب', "Doctor's Share")}</option>
                  <option value="clinic">{t('حصة العيادة', "Clinic's Share")}</option>
                </select>
                <button
                  onClick={() => setSortDir((d) => d === 'asc' ? 'desc' : 'asc')}
                  className="px-2 py-1.5 text-sm border border-gray-200 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50"
                  title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
                >
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

      {/* Active filter chips */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-1.5">
          {selectedDoctor && (
            <span className="inline-flex items-center gap-1 text-xs bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-800 rounded-full px-2.5 py-0.5">
              <Stethoscope className="w-3 h-3" />
              {doctorMap.get(selectedDoctor)?.nameEn ?? selectedDoctor.slice(0, 8)}
              <button onClick={() => setSelectedDoctor('')}><X className="w-2.5 h-2.5" /></button>
            </span>
          )}
          {minNetPool && (
            <span className="inline-flex items-center gap-1 text-xs bg-gray-100 dark:bg-neutral-700 text-gray-600 dark:text-gray-300 rounded-full px-2.5 py-0.5">
              Net ≥ {minNetPool}
              <button onClick={() => setMinNetPool('')}><X className="w-2.5 h-2.5" /></button>
            </span>
          )}
          {maxNetPool && (
            <span className="inline-flex items-center gap-1 text-xs bg-gray-100 dark:bg-neutral-700 text-gray-600 dark:text-gray-300 rounded-full px-2.5 py-0.5">
              Net ≤ {maxNetPool}
              <button onClick={() => setMaxNetPool('')}><X className="w-2.5 h-2.5" /></button>
            </span>
          )}
          <span className="text-xs text-gray-400 self-center">
            {settlements.length} / {rawSettlements.length} {t('طبيب', 'doctors')}
          </span>
        </div>
      )}

      {/* Formula legend */}
      {!isLoading && settlements.length > 0 && (
        <div className="rounded-xl bg-gray-50 dark:bg-neutral-800/60 border border-gray-100 dark:border-neutral-700 px-4 py-3 text-xs text-gray-500 dark:text-gray-400 flex flex-wrap gap-x-4 gap-y-1">
          <span><span className="font-semibold text-orange-500">{t('الوسيط', 'Mediator')}</span> = {t('رسم الجلسة', 'Session Fee')} × %</span>
          <span>+</span>
          <span><span className="font-semibold text-violet-500">{t('إضافية', 'Extra Svcs')}</span> = {t('التكلفة الكاملة', 'Full Cost')}</span>
          <span>=</span>
          <span><span className="font-semibold text-gray-700 dark:text-gray-300">{t('الصافي', 'Net Pool')}</span></span>
          <span>→</span>
          <span><span className="font-semibold text-blue-500">{t('الطبيب', 'Doctor')}</span> + <span className="font-semibold text-emerald-500">{t('العيادة', 'Clinic')}</span> = 100%</span>
        </div>
      )}

      {/* Summary cards */}
      {!isLoading && settlements.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="rounded-xl border border-gray-100 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-3">
            <div className="flex items-center gap-1 mb-1">
              <Banknote className="w-3 h-3 text-gray-400" />
              <p className="text-xs text-gray-400">{t('رسوم الجلسات', 'Session Fees')}</p>
            </div>
            <p className="text-base font-bold tabular-nums text-gray-900 dark:text-gray-100">{fmt(totalSessionFees)}</p>
          </div>
          <div className="rounded-xl border border-orange-100 dark:border-orange-900/30 bg-orange-50 dark:bg-orange-900/10 p-3">
            <div className="flex items-center gap-1 mb-1">
              <Share2 className="w-3 h-3 text-orange-500" />
              <p className="text-xs text-orange-600 dark:text-orange-400">{t('الوسيط', 'Mediator')}</p>
            </div>
            <p className="text-base font-bold tabular-nums text-orange-700 dark:text-orange-300">{fmt(totalMediator)}</p>
            {totalSessionFees > 0 && <p className="text-xs text-orange-400 mt-0.5">{((totalMediator / totalSessionFees) * 100).toFixed(1)}%</p>}
          </div>
          <div className="rounded-xl border border-violet-100 dark:border-violet-900/30 bg-violet-50 dark:bg-violet-900/10 p-3">
            <div className="flex items-center gap-1 mb-1">
              <FlaskConical className="w-3 h-3 text-violet-500" />
              <p className="text-xs text-violet-600 dark:text-violet-400">{t('خدمات إضافية', 'Extra Services')}</p>
            </div>
            <p className="text-base font-bold tabular-nums text-violet-700 dark:text-violet-300">{fmt(totalExtraServices)}</p>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-neutral-600 bg-gray-50 dark:bg-neutral-700/40 p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t('صافي المجمع', 'Net Pool')}</p>
            <p className="text-base font-bold tabular-nums text-gray-800 dark:text-gray-100">{fmt(totalNetPool)}</p>
          </div>
          <div className="rounded-xl border border-blue-100 dark:border-blue-900/30 bg-blue-50 dark:bg-blue-900/10 p-3">
            <div className="flex items-center gap-1 mb-1">
              <Stethoscope className="w-3 h-3 text-blue-500" />
              <p className="text-xs text-blue-600 dark:text-blue-400">{t("مستحق الأطباء", "Doctors'")}</p>
            </div>
            <p className="text-base font-bold tabular-nums text-blue-700 dark:text-blue-300">{fmt(totalDoctors)}</p>
            {totalNetPool > 0 && <p className="text-xs text-blue-400 mt-0.5">{((totalDoctors / totalNetPool) * 100).toFixed(1)}%</p>}
          </div>
          <div className="rounded-xl border border-emerald-100 dark:border-emerald-900/30 bg-emerald-50 dark:bg-emerald-900/10 p-3">
            <div className="flex items-center gap-1 mb-1">
              <Building2 className="w-3 h-3 text-emerald-500" />
              <p className="text-xs text-emerald-600 dark:text-emerald-400">{t('صافي العيادة', 'Clinic Net')}</p>
            </div>
            <p className="text-base font-bold tabular-nums text-emerald-700 dark:text-emerald-300">{fmt(totalClinic)}</p>
            {totalNetPool > 0 && <p className="text-xs text-emerald-400 mt-0.5">{((totalClinic / totalNetPool) * 100).toFixed(1)}%</p>}
          </div>
        </div>
      )}

      {/* Main table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin me-2" />{t('جاري التحميل...', 'Loading...')}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <ReceiptText className="w-12 h-12 text-gray-300 dark:text-gray-600" />
          <p className="text-gray-500 font-medium">{t('تعذّر تحميل التسويات', 'Failed to load settlements')}</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} />
            {t('إعادة المحاولة', 'Retry')}
          </Button>
        </div>
      ) : settlements.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <ReceiptText className="w-12 h-12 text-gray-300 dark:text-gray-600" />
          <p className="text-gray-500 font-medium">
            {hasActiveFilters
              ? t('لا توجد نتائج تطابق الفلتر', 'No results match the filter')
              : t('لا توجد تسويات في هذه الفترة', 'No settlements in this period')}
          </p>
          {hasActiveFilters && (
            <Button variant="outline" size="sm" onClick={clearFilters}>
              {t('مسح الفلاتر', 'Clear filters')}
            </Button>
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-neutral-700 bg-gray-50/60 dark:bg-neutral-800/60">
                    <th className="w-8 px-3 py-3" />
                    <th
                      className="text-start px-4 py-3 font-medium text-gray-500 text-xs whitespace-nowrap cursor-pointer hover:text-gray-700 select-none"
                      onClick={() => toggleSort('name')}
                    >
                      {t('الطبيب', 'Doctor')} <SortIcon col="name" />
                    </th>
                    <th
                      className="text-end px-4 py-3 font-medium text-gray-500 text-xs whitespace-nowrap cursor-pointer hover:text-gray-700 select-none"
                      onClick={() => toggleSort('sessions')}
                    >
                      {t('حجوزات', 'Sessions')} <SortIcon col="sessions" />
                    </th>
                    <th
                      className="text-end px-4 py-3 font-medium text-gray-500 text-xs whitespace-nowrap cursor-pointer hover:text-gray-700 select-none"
                      onClick={() => toggleSort('sessionFees')}
                    >
                      {t('رسوم الجلسة', 'Session Fees')} <SortIcon col="sessionFees" />
                    </th>
                    <th className="text-end px-4 py-3 text-xs whitespace-nowrap">
                      <span className="flex items-center justify-end gap-1 text-orange-500 font-medium">
                        <Share2 className="w-3 h-3" />{t('الوسيط', 'Mediator')}
                      </span>
                    </th>
                    <th className="text-end px-4 py-3 text-xs whitespace-nowrap">
                      <span className="flex items-center justify-end gap-1 text-violet-500 font-medium">
                        <FlaskConical className="w-3 h-3" />{t('إضافية', 'Extra Svcs')}
                      </span>
                    </th>
                    <th
                      className="text-end px-4 py-3 font-medium text-gray-500 text-xs whitespace-nowrap cursor-pointer hover:text-gray-700 select-none"
                      onClick={() => toggleSort('netPool')}
                    >
                      {t('الصافي', 'Net Pool')} <SortIcon col="netPool" />
                    </th>
                    <th
                      className="text-end px-4 py-3 text-xs whitespace-nowrap cursor-pointer hover:text-blue-600 select-none"
                      onClick={() => toggleSort('doctor')}
                    >
                      <span className="flex items-center justify-end gap-1 text-blue-500 font-medium">
                        <Stethoscope className="w-3 h-3" />{t('الطبيب', 'Doctor')} <SortIcon col="doctor" />
                      </span>
                    </th>
                    <th
                      className="text-end px-4 py-3 text-xs whitespace-nowrap cursor-pointer hover:text-emerald-600 select-none"
                      onClick={() => toggleSort('clinic')}
                    >
                      <span className="flex items-center justify-end gap-1 text-emerald-500 font-medium">
                        <Building2 className="w-3 h-3" />{t('العيادة', 'Clinic')} <SortIcon col="clinic" />
                      </span>
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
                          <td className="px-4 py-3.5 text-end font-mono tabular-nums text-violet-600 dark:text-violet-400">{fmt(extraSvcs)}</td>
                          <td className="px-4 py-3.5 text-end font-mono tabular-nums text-gray-600 dark:text-gray-300">{fmt(s.grossRevenue)}</td>
                          <td className="px-4 py-3.5 text-end font-mono tabular-nums text-blue-700 dark:text-blue-400 font-semibold">{fmt(s.doctorShare)}</td>
                          <td className="px-4 py-3.5 text-end font-mono tabular-nums text-emerald-700 dark:text-emerald-400 font-semibold">{fmt(s.clinicShare)}</td>
                          <td className="px-4 py-3.5">
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
                <tfoot>
                  <tr className="border-t-2 border-gray-200 dark:border-neutral-600 bg-gray-50 dark:bg-neutral-800/60 font-semibold text-sm">
                    <td className="px-3 py-3" />
                    <td className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wide">
                      {t('الإجمالي', 'Total')}
                      {hasActiveFilters && <span className="ms-1 font-normal text-gray-400">({settlements.length})</span>}
                    </td>
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
  const { data: txData, isLoading } = useTransactions({ doctorId, dateFrom: from, dateTo: to, limit: 100 });
  const procedureMap  = useProcedureMap();
  const { mutateAsync: saveCost, isPending: isSaving } = useUpdateProcedureCost();
  const [overrides, setOverrides] = useState<Map<string, string>>(new Map());

  const txs = txData?.data ?? [];
  const fmt = (n: number) => formatCurrency(n, 'EGP', locale);

  const handleCostChange = useCallback((txId: string, value: string) => {
    setOverrides((prev) => new Map(prev).set(txId, value));
  }, []);

  const handleSave = useCallback(async (txId: string) => {
    const raw = overrides.get(txId);
    if (raw === undefined) return;
    const parsed = raw === '' ? null : Number(raw);
    if (parsed !== null && isNaN(parsed)) return;
    await saveCost({ id: txId, procedureCost: parsed });
    setOverrides((prev) => { const m = new Map(prev); m.delete(txId); return m; });
  }, [overrides, saveCost]);

  const handleReset = useCallback((txId: string) => {
    setOverrides((prev) => { const m = new Map(prev); m.delete(txId); return m; });
  }, []);

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
            <th className="text-start px-3 py-2 font-medium text-gray-500">{t('المصدر', 'Source')}</th>
            <th className="text-end   px-3 py-2 font-medium text-gray-500">{t('رسم الجلسة', 'Session Fee')}</th>
            <th className="text-end   px-3 py-2 font-medium text-orange-500">{t('وسيط %', 'Src %')}</th>
            <th className="text-end   px-3 py-2 font-medium text-orange-500">{t('الوسيط', 'Mediator')}</th>
            <th className="text-start px-3 py-2 font-medium text-violet-500">{t('خدمة إضافية', 'Extra Service')}</th>
            <th className="text-end   px-3 py-2 font-medium text-violet-500">{t('التكلفة ✎', 'Cost ✎')}</th>
            <th className="text-end   px-3 py-2 font-medium text-gray-600 dark:text-gray-300">{t('الصافي', 'Net Pool')}</th>
            <th className="text-end   px-3 py-2 font-medium text-blue-500">{t('د %', 'Dr %')}</th>
            <th className="text-end   px-3 py-2 font-medium text-blue-500">{t('الطبيب', 'Doctor')}</th>
            <th className="text-end   px-3 py-2 font-medium text-emerald-500">{t('ع %', 'Cl %')}</th>
            <th className="text-end   px-3 py-2 font-medium text-emerald-500">{t('العيادة', 'Clinic')}</th>
            <th className="w-14 px-2 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-neutral-700/50">
          {txs.map((tx) => {
            const hasOverride  = overrides.has(tx.id);
            const rawOverride  = overrides.get(tx.id) ?? '';
            const overrideCost = hasOverride
              ? (rawOverride === '' ? 0 : Math.max(0, Number(rawOverride) || 0))
              : (tx.procedureCost ?? 0);
            const isDirty      = hasOverride && overrideCost !== (tx.procedureCost ?? 0);
            const netPool      = (tx.approvedCharge - tx.sourceFeeAmount) + overrideCost;
            const drShare      = netPool * tx.splitDoctorPercentage / 100;
            const clShare      = netPool * tx.splitClinicPercentage  / 100;
            const procName     = tx.procedureId ? (procedureMap.get(tx.procedureId)?.nameEn ?? '—') : '—';

            return (
              <tr key={tx.id} className={cn(
                'transition-colors',
                isDirty ? 'bg-amber-50/60 dark:bg-amber-900/10' : 'hover:bg-white dark:hover:bg-neutral-700/20',
              )}>
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{tx.transactionDate?.slice(0, 10)}</td>
                <td className="px-3 py-2">
                  <span className="bg-gray-100 dark:bg-neutral-700 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-300">{tx.patientSource}</span>
                </td>
                <td className="px-3 py-2 text-end font-mono tabular-nums text-gray-700 dark:text-gray-300">{fmt(tx.approvedCharge)}</td>
                <td className="px-3 py-2 text-end font-mono text-orange-500">{tx.sourceFeePercentage}%</td>
                <td className="px-3 py-2 text-end font-mono tabular-nums text-orange-600 dark:text-orange-400">{fmt(tx.sourceFeeAmount)}</td>
                <td className="px-3 py-2 text-violet-600 dark:text-violet-400 whitespace-nowrap">
                  {overrideCost > 0 ? procName : <span className="text-gray-300 dark:text-gray-600">—</span>}
                </td>
                <td className="px-2 py-1.5 text-end">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={hasOverride ? rawOverride : (tx.procedureCost ?? '')}
                    placeholder="0"
                    onChange={(e) => handleCostChange(tx.id, e.target.value)}
                    className={cn(
                      'w-24 text-end font-mono tabular-nums text-xs rounded border px-2 py-1 focus:outline-none focus:ring-2 transition-colors [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
                      isDirty
                        ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 focus:ring-amber-400'
                        : 'border-violet-200 dark:border-violet-800 bg-white dark:bg-neutral-800 text-violet-700 dark:text-violet-300 focus:ring-violet-400',
                    )}
                  />
                </td>
                <td className={cn('px-3 py-2 text-end font-mono tabular-nums', isDirty ? 'text-amber-700 dark:text-amber-300 font-semibold' : 'text-gray-600 dark:text-gray-300')}>
                  {fmt(netPool)}
                </td>
                <td className="px-3 py-2 text-end font-mono text-blue-500">{tx.splitDoctorPercentage}%</td>
                <td className={cn('px-3 py-2 text-end font-mono tabular-nums font-semibold', isDirty ? 'text-amber-700 dark:text-amber-300' : 'text-blue-700 dark:text-blue-400')}>
                  {fmt(drShare)}
                </td>
                <td className="px-3 py-2 text-end font-mono text-emerald-500">{tx.splitClinicPercentage}%</td>
                <td className={cn('px-3 py-2 text-end font-mono tabular-nums font-semibold', isDirty ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-400')}>
                  {fmt(clShare)}
                </td>
                <td className="px-2 py-1.5">
                  {isDirty && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => void handleSave(tx.id)} disabled={isSaving} title={t('حفظ', 'Save')}
                        className="p-1 rounded text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors">
                        {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      </button>
                      <button onClick={() => handleReset(tx.id)} title={t('إلغاء', 'Cancel')}
                        className="p-1 rounded text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-700 transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-gray-200 dark:border-neutral-600 bg-gray-50 dark:bg-neutral-700/30 font-semibold">
            <td colSpan={2} className="px-3 py-2 text-gray-500">{t('المجموع', 'Total')} ({txs.length})</td>
            <td className="px-3 py-2 text-end font-mono tabular-nums text-gray-800 dark:text-gray-200">
              {fmt(txs.reduce((s, tx) => s + tx.approvedCharge, 0))}
            </td>
            <td />
            <td className="px-3 py-2 text-end font-mono tabular-nums text-orange-600 dark:text-orange-400">
              {fmt(txs.reduce((s, tx) => s + tx.sourceFeeAmount, 0))}
            </td>
            <td />
            <td className="px-3 py-2 text-end font-mono tabular-nums text-violet-600 dark:text-violet-400">
              {fmt(txs.reduce((s, tx) => {
                const ov = overrides.get(tx.id);
                return s + (ov !== undefined ? Math.max(0, Number(ov) || 0) : (tx.procedureCost ?? 0));
              }, 0))}
            </td>
            <td className="px-3 py-2 text-end font-mono tabular-nums text-gray-700 dark:text-gray-300">
              {fmt(txs.reduce((s, tx) => {
                const ov = overrides.get(tx.id);
                const ec = ov !== undefined ? Math.max(0, Number(ov) || 0) : (tx.procedureCost ?? 0);
                return s + (tx.approvedCharge - tx.sourceFeeAmount) + ec;
              }, 0))}
            </td>
            <td />
            <td className="px-3 py-2 text-end font-mono tabular-nums text-blue-700 dark:text-blue-300">
              {fmt(txs.reduce((s, tx) => {
                const ov = overrides.get(tx.id);
                const ec = ov !== undefined ? Math.max(0, Number(ov) || 0) : (tx.procedureCost ?? 0);
                return s + ((tx.approvedCharge - tx.sourceFeeAmount) + ec) * tx.splitDoctorPercentage / 100;
              }, 0))}
            </td>
            <td />
            <td className="px-3 py-2 text-end font-mono tabular-nums text-emerald-700 dark:text-emerald-300">
              {fmt(txs.reduce((s, tx) => {
                const ov = overrides.get(tx.id);
                const ec = ov !== undefined ? Math.max(0, Number(ov) || 0) : (tx.procedureCost ?? 0);
                return s + ((tx.approvedCharge - tx.sourceFeeAmount) + ec) * tx.splitClinicPercentage / 100;
              }, 0))}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
