'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  Banknote, RefreshCw, ReceiptText, ChevronDown, ChevronRight,
  Building2, Stethoscope, Share2, Loader2, FlaskConical, Check, X,
  Search, SlidersHorizontal, ChevronUp, ArrowUpDown,
  CheckCircle2, Unlock, Eye, EyeOff, AlertTriangle, Lock,
  Plus, Trash2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useLang } from '@/contexts/LanguageContext';
import { formatCurrency } from '@/lib/utils';
import { useSettlements, useTransactions, useExtraServices, useReplaceExtraServices } from '@/hooks/useBilling';
import { useDoctors, useDoctorMap } from '@/hooks/useDoctors';
import { notificationApi, identityApi } from '@/lib/api';
import { useProcedureMap } from '@/hooks/useProcedures';
import { cn } from '@/lib/utils';
import type { DoctorSettlement, FinancialTransaction } from '@fadl/types';

type SortKey = 'name' | 'sessions' | 'sessionFees' | 'netPool' | 'doctor' | 'clinic';
type SortDir = 'asc' | 'desc';

// ── Settled-row state (localStorage, period-scoped) ───────────────────────────
interface SettledRecord {
  settledAt: string;
  settledBy: string;
  amount: number;
}
function settledKey(doctorId: string, from: string, to: string) {
  return `fcms_settled_${doctorId}_${from}_${to}`;
}
function loadSettled(doctorId: string, from: string, to: string): SettledRecord | null {
  try {
    const raw = localStorage.getItem(settledKey(doctorId, from, to));
    return raw ? (JSON.parse(raw) as SettledRecord) : null;
  } catch { return null; }
}
function saveSettled(doctorId: string, from: string, to: string, rec: SettledRecord) {
  localStorage.setItem(settledKey(doctorId, from, to), JSON.stringify(rec));
}
function clearSettled(doctorId: string, from: string, to: string) {
  localStorage.removeItem(settledKey(doctorId, from, to));
}

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

  // ── Settle / rollback dialog state ───────────────────────────────────────────
  const [settledRows, setSettledRows]     = useState<Map<string, SettledRecord>>(new Map());
  const [settleTarget, setSettleTarget]   = useState<DoctorSettlement | null>(null);
  const [settling, setSettling]           = useState(false);
  const [settleError, setSettleError]     = useState('');
  const [rollbackTarget, setRollbackTarget] = useState<{ s: DoctorSettlement; rec: SettledRecord } | null>(null);
  const [rollbackPw, setRollbackPw]       = useState('');
  const [rollbackDesc, setRollbackDesc]   = useState('');
  const [rollbackError, setRollbackError] = useState('');
  const [rollbackLoading, setRollbackLoading] = useState(false);
  const [showPw, setShowPw]               = useState(false);

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

  // Hydrate settled state from localStorage whenever settlements or date range changes
  useEffect(() => {
    const m = new Map<string, SettledRecord>();
    for (const s of rawSettlements) {
      const rec = loadSettled(s.doctorId, from, to);
      if (rec) m.set(s.doctorId, rec);
    }
    setSettledRows(m);
  }, [rawSettlements, from, to]);

  const handleSettle = async () => {
    if (!settleTarget) return;
    setSettling(true);
    setSettleError('');
    const doctorName = doctorMap.get(settleTarget.doctorId)?.nameEn ?? settleTarget.doctorId;
    const amount = settleTarget.doctorShare;
    const body = lang === 'ar'
      ? `تم إتمام تسوية حسابك يا د. ${doctorName}. مستحقاتك للفترة ${from} – ${to}: ${fmt(amount)}.`
      : `Settlement complete, Dr. ${doctorName}. Your share for ${from} – ${to}: ${fmt(amount)}.`;
    try {
      await notificationApi.post('/notifications/send', {
        channel: 'whatsapp',
        recipientId: settleTarget.doctorId,
        recipientType: 'doctor',
        body,
      });
    } catch {
      // Notification failure is non-fatal — still lock the row
    }
    const storedUser = JSON.parse(localStorage.getItem('fadl_user') ?? '{}') as { nameEn?: string };
    const rec: SettledRecord = {
      settledAt: new Date().toISOString(),
      settledBy: storedUser.nameEn ?? 'Admin',
      amount,
    };
    saveSettled(settleTarget.doctorId, from, to, rec);
    setSettledRows((m) => new Map(m).set(settleTarget.doctorId, rec));
    setSettleTarget(null);
    setSettling(false);
  };

  const handleRollback = async () => {
    if (!rollbackTarget) return;
    if (rollbackDesc.trim().length < 10) {
      setRollbackError(lang === 'ar' ? 'يجب أن يكون السبب 10 أحرف على الأقل.' : 'Reason must be at least 10 characters.');
      return;
    }
    setRollbackLoading(true);
    setRollbackError('');
    try {
      const storedUser = JSON.parse(localStorage.getItem('fadl_user') ?? '{}') as { email?: string };
      await identityApi.post('/auth/login', { email: storedUser.email, password: rollbackPw });
      clearSettled(rollbackTarget.s.doctorId, from, to);
      setSettledRows((m) => { const n = new Map(m); n.delete(rollbackTarget.s.doctorId); return n; });
      setRollbackTarget(null);
      setRollbackPw('');
      setRollbackDesc('');
    } catch {
      setRollbackError(lang === 'ar' ? 'كلمة المرور غير صحيحة. تم رفض التراجع.' : 'Incorrect password. Rollback denied.');
    } finally {
      setRollbackLoading(false);
    }
  };

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
            <label htmlFor="settle-from-date" className="text-xs text-gray-500">{t('من', 'From')}</label>
            <input id="settle-from-date" type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="text-sm border border-gray-200 dark:border-neutral-600 rounded-lg px-3 py-1.5 bg-white dark:bg-neutral-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-600" />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="settle-to-date" className="text-xs text-gray-500">{t('إلى', 'To')}</label>
            <input id="settle-to-date" type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="text-sm border border-gray-200 dark:border-neutral-600 rounded-lg px-3 py-1.5 bg-white dark:bg-neutral-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-600" />
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
              aria-label={t('بحث باسم الطبيب', 'Search by doctor name')}
              className="w-full ps-8 pe-3 py-1.5 text-sm border border-gray-200 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-800 text-gray-800 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600"
            />
          </div>

          {/* Doctor dropdown */}
          <select
            value={selectedDoctor}
            onChange={(e) => { setSelectedDoctor(e.target.value); setDoctorSearch(''); }}
            className="text-sm border border-gray-200 dark:border-neutral-600 rounded-lg px-3 py-1.5 bg-white dark:bg-neutral-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-600"
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
              <p id="settle-minpool-label" className="text-xs font-medium text-gray-500">{t('صافي المجمع: من', 'Net Pool: min')}</p>
              <input
                type="number"
                min="0"
                step="100"
                value={minNetPool}
                onChange={(e) => setMinNetPool(e.target.value)}
                placeholder="0"
                aria-labelledby="settle-minpool-label"
                className="w-32 text-sm border border-gray-200 dark:border-neutral-600 rounded-lg px-3 py-1.5 bg-white dark:bg-neutral-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-600 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </div>
            <div className="space-y-1">
              <p id="settle-maxpool-label" className="text-xs font-medium text-gray-500">{t('صافي المجمع: إلى', 'Net Pool: max')}</p>
              <input
                type="number"
                min="0"
                step="100"
                value={maxNetPool}
                onChange={(e) => setMaxNetPool(e.target.value)}
                placeholder="∞"
                aria-labelledby="settle-maxpool-label"
                className="w-32 text-sm border border-gray-200 dark:border-neutral-600 rounded-lg px-3 py-1.5 bg-white dark:bg-neutral-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-600 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </div>

            {/* Sort */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-500">{t('ترتيب حسب', 'Sort by')}</p>
              <div className="flex gap-1">
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                  className="text-sm border border-gray-200 dark:border-neutral-600 rounded-lg px-3 py-1.5 bg-white dark:bg-neutral-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-600"
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
                    const settled     = settledRows.get(s.doctorId);
                    const isSettled   = !!settled;
                    return (
                      <>
                        <tr
                          key={s.doctorId}
                          onClick={() => setExpanded(isOpen ? null : s.doctorId)}
                          className={cn(
                            'border-b border-gray-50 dark:border-neutral-700/50 cursor-pointer transition-colors',
                            isSettled
                              ? 'bg-emerald-50/60 dark:bg-emerald-900/10 opacity-60 hover:opacity-80'
                              : 'hover:bg-gray-50/60 dark:hover:bg-neutral-700/20',
                          )}
                        >
                          <td className="px-3 py-3.5 text-gray-400">
                            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </td>
                          <td className="px-4 py-3.5 font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">
                            <span className="flex items-center gap-2">
                              {isSettled && <Lock className="w-3 h-3 text-emerald-500 flex-shrink-0" />}
                              {doctorMap.get(s.doctorId)?.nameEn ?? s.doctorId.slice(0, 8)}
                            </span>
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
                            {isSettled ? (
                              <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-full px-2 py-0.5 whitespace-nowrap">
                                  <CheckCircle2 className="w-3 h-3" />
                                  {t('مُسوَّى', 'Settled')}
                                </span>
                                <button
                                  title={t('تراجع عن التسوية', 'Rollback settlement')}
                                  onClick={() => { setRollbackTarget({ s, rec: settled }); setRollbackPw(''); setRollbackDesc(''); setRollbackError(''); }}
                                  className="p-1 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                                >
                                  <Unlock className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (s.netPayable ?? 0) > 0 ? (
                              <Button
                                size="sm"
                                className="h-7 px-3 text-xs whitespace-nowrap"
                                onClick={(e) => { e.stopPropagation(); setSettleTarget(s); setSettleError(''); }}
                              >
                                {t('تسوية', 'Settle')}
                              </Button>
                            ) : null}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr key={`${s.doctorId}-detail`} className="bg-gray-50/40 dark:bg-neutral-800/30">
                            <td colSpan={10} className="px-6 py-4">
                              <SettlementDetail doctorId={s.doctorId} from={from} to={to} locale={locale} t={t} locked={isSettled} />
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
      {/* ── Settle confirmation dialog ──────────────────────────────────────── */}
      {settleTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-md animate-slide-up p-6 space-y-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                <Stethoscope className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
                  {t('تأكيد التسوية', 'Confirm Settlement')}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  {t('سيتم إرسال إشعار للطبيب وتأمين الصف', 'A notification will be sent and the row will be locked')}
                </p>
              </div>
            </div>
            <div className="rounded-xl bg-gray-50 dark:bg-neutral-800 border border-gray-100 dark:border-neutral-700 p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">{t('الطبيب', 'Doctor')}</span>
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  {doctorMap.get(settleTarget.doctorId)?.nameEn ?? '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{t('الفترة', 'Period')}</span>
                <span className="font-mono text-gray-700 dark:text-gray-300">{from} → {to}</span>
              </div>
              <div className="flex justify-between border-t border-gray-200 dark:border-neutral-700 pt-2 mt-2">
                <span className="text-gray-500">{t('مستحق الطبيب', "Doctor's share")}</span>
                <span className="font-bold text-blue-700 dark:text-blue-400 text-base tabular-nums">{fmt(settleTarget.doctorShare)}</span>
              </div>
            </div>
            {settleError && (
              <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
                {settleError}
              </p>
            )}
            <div className="flex gap-3 justify-end pt-1">
              <Button variant="outline" size="sm" onClick={() => setSettleTarget(null)} disabled={settling}>
                {t('إلغاء', 'Cancel')}
              </Button>
              <Button size="sm" onClick={() => void handleSettle()} disabled={settling} className="min-w-24">
                {settling ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t('تأكيد التسوية', 'Confirm & Settle')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Rollback dialog ─────────────────────────────────────────────────── */}
      {rollbackTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-md animate-slide-up p-6 space-y-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
                  {t('التراجع عن التسوية', 'Rollback Settlement')}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  {t('يتطلب ذلك كلمة مرور المدير وسببًا مفصَّلًا', 'Requires admin password and a detailed reason')}
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-700 dark:text-amber-400 space-y-1">
              <p><span className="font-semibold">{t('الطبيب:', 'Doctor:')}</span> {doctorMap.get(rollbackTarget.s.doctorId)?.nameEn ?? '—'}</p>
              <p><span className="font-semibold">{t('مبلغ التسوية:', 'Settled amount:')}</span> {fmt(rollbackTarget.rec.amount)}</p>
              <p><span className="font-semibold">{t('بواسطة:', 'Settled by:')}</span> {rollbackTarget.rec.settledBy}, {new Date(rollbackTarget.rec.settledAt).toLocaleString()}</p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label htmlFor="settle-rollback-pw" className="field-label">{t('كلمة مرور المدير', 'Admin password')}</label>
                <div className="relative">
                  <input
                    id="settle-rollback-pw"
                    type={showPw ? 'text' : 'password'}
                    value={rollbackPw}
                    onChange={(e) => setRollbackPw(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="w-full pe-10 px-3 py-2 text-sm border border-gray-200 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute end-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <label className="field-label">
                  {t('سبب التراجع (10 أحرف على الأقل)', 'Rollback reason (min 10 chars)')}
                </label>
                <textarea
                  rows={3}
                  value={rollbackDesc}
                  onChange={(e) => setRollbackDesc(e.target.value)}
                  placeholder={t('اكتب سبب التراجع بالتفصيل...', 'Describe why this settlement is being rolled back...')}
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                />
                <p className={cn('text-xs', rollbackDesc.length >= 10 ? 'text-gray-400' : 'text-amber-500')}>
                  {rollbackDesc.length}/10 {t('حرف على الأقل', 'characters minimum')}
                </p>
              </div>
            </div>

            {rollbackError && (
              <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
                {rollbackError}
              </p>
            )}

            <div className="flex gap-3 justify-end pt-1">
              <Button variant="outline" size="sm" onClick={() => setRollbackTarget(null)} disabled={rollbackLoading}>
                {t('إلغاء', 'Cancel')}
              </Button>
              <Button
                size="sm"
                className="min-w-28 bg-amber-600 hover:bg-amber-700 focus:ring-amber-500"
                onClick={() => void handleRollback()}
                disabled={rollbackLoading || !rollbackPw || rollbackDesc.trim().length < 10}
              >
                {rollbackLoading
                  ? <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                  : <><Unlock className="w-3.5 h-3.5 me-1.5" />{t('تراجع عن التسوية', 'Rollback')}</>
                }
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Extra Services types & popup ─────────────────────────────────────────────
// EditableService is the local mutable form; ExtraServiceItem (from hook) is the server shape
interface EditableService {
  id: string;
  name: string;
  cost: string; // kept as string for <input> binding
}

function makeItem(): EditableService {
  return { id: Math.random().toString(36).slice(2), name: '', cost: '' };
}

function ExtraServicesPopup({ tx, initItems, onSave, onClose, locked, t, fmt }: {
  tx: FinancialTransaction;
  initItems: EditableService[];
  onSave: () => void;
  onClose: () => void;
  locked?: boolean;
  t: (ar: string, en: string) => string;
  fmt: (n: number) => string;
}) {
  const { mutateAsync: replaceServices, isPending } = useReplaceExtraServices();
  const [items, setItems] = useState<EditableService[]>(
    initItems.length > 0 ? initItems : [makeItem()],
  );

  const totalExtra  = items.reduce((s, i) => s + Math.max(0, Number(i.cost) || 0), 0);
  const mediator    = tx.sourceFeeAmount;
  const netPool     = (tx.approvedCharge - mediator) + totalExtra;
  const drProfit    = netPool * tx.splitDoctorPercentage / 100;
  const clProfit    = netPool * tx.splitClinicPercentage / 100;

  const update = (id: string, field: 'name' | 'cost', val: string) =>
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, [field]: val } : i));

  const remove = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

  const handleSave = async () => {
    const validItems = items
      .filter((i) => i.name.trim() || Number(i.cost) > 0)
      .map((i) => ({ serviceName: i.name.trim() || t('خدمة إضافية', 'Extra service'), cost: Math.max(0, Number(i.cost) || 0) }));
    await replaceServices({ transactionId: tx.id, items: validItems });
    onSave();
  };

  const fieldCls = 'h-8 rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500 transition-shadow';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-slide-up">

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-gray-100 dark:border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
              <FlaskConical className="w-4.5 h-4.5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                {t('الخدمات الإضافية', 'Extra Services')}
              </h3>
              <p className="text-xs text-gray-400 font-mono mt-0.5" dir="ltr">
                {tx.transactionDate?.slice(0, 10)} · {tx.patientSource}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Session info banner */}
        <div className="mx-5 mt-4 rounded-xl bg-gray-50 dark:bg-neutral-800/60 border border-gray-100 dark:border-neutral-700 px-4 py-2.5 flex flex-wrap gap-x-5 gap-y-1 text-xs">
          <span className="text-gray-500">{t('رسم الجلسة', 'Session fee')}:
            <span className="font-mono font-semibold text-gray-900 dark:text-gray-100 ms-1">{fmt(tx.approvedCharge)}</span>
          </span>
          <span className="text-orange-600 dark:text-orange-400">{t('وسيط', 'Mediator')} {tx.sourceFeePercentage}%:
            <span className="font-mono font-semibold ms-1">−{fmt(mediator)}</span>
          </span>
          <span className="text-blue-500">{t('د', 'Dr')} {tx.splitDoctorPercentage}% / {t('ع', 'Cl')} {tx.splitClinicPercentage}%</span>
        </div>

        {/* Items list */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          <div className="grid grid-cols-[1fr_100px_80px_80px_28px] gap-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide pb-1">
            <span>{t('الخدمة / الإجراء', 'Service / Procedure')}</span>
            <span className="text-end">{t('التكلفة (EGP)', 'Cost (EGP)')}</span>
            <span className="text-end text-blue-500">{t('الطبيب', 'Dr share')}</span>
            <span className="text-end text-emerald-500">{t('العيادة', 'Cl share')}</span>
            <span />
          </div>
          {items.map((item) => {
            const cost   = Math.max(0, Number(item.cost) || 0);
            const drSh   = cost * tx.splitDoctorPercentage / 100;
            const clSh   = cost * tx.splitClinicPercentage / 100;
            return (
              <div key={item.id} className="grid grid-cols-[1fr_100px_80px_80px_28px] gap-2 items-center">
                <input
                  disabled={locked}
                  className={cn(fieldCls, 'w-full')}
                  placeholder={t('اسم الخدمة', 'Service name')}
                  aria-label={t('اسم الخدمة', 'Service name')}
                  value={item.name}
                  onChange={(e) => update(item.id, 'name', e.target.value)}
                />
                <input
                  disabled={locked}
                  type="number"
                  min="0"
                  step="10"
                  className={cn(fieldCls, 'w-full text-end font-mono tabular-nums text-violet-700 dark:text-violet-300 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none')}
                  placeholder="0"
                  aria-label={t('تكلفة الخدمة', 'Service cost')}
                  value={item.cost}
                  onChange={(e) => update(item.id, 'cost', e.target.value)}
                  dir="ltr"
                />
                <span className="text-end font-mono text-xs tabular-nums text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg px-2 py-1.5">{fmt(drSh)}</span>
                <span className="text-end font-mono text-xs tabular-nums text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg px-2 py-1.5">{fmt(clSh)}</span>
                {!locked && (
                  <button
                    type="button"
                    onClick={() => remove(item.id)}
                    className="p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
          {!locked && (
            <button
              type="button"
              onClick={() => setItems((prev) => [...prev, makeItem()])}
              className="flex items-center gap-1.5 text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 font-medium mt-1 px-1 py-1 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('إضافة خدمة', 'Add service')}
            </button>
          )}
        </div>

        {/* Live summary */}
        <div className="mx-5 mb-4 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-100 dark:border-blue-900/40 px-4 py-3">
          <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-2">{t('الملخص الآني', 'Live Summary')}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <p className="text-gray-400 mb-0.5">{t('إجمالي الإضافية', 'Total extra')}</p>
              <p className="font-bold font-mono tabular-nums text-violet-700 dark:text-violet-400">{fmt(totalExtra)}</p>
            </div>
            <div>
              <p className="text-orange-400 mb-0.5">{t('الوسيط (رسم الجلسة)', 'Mediator (session only)')}</p>
              <p className="font-bold font-mono tabular-nums text-orange-600 dark:text-orange-400">−{fmt(mediator)}</p>
            </div>
            <div>
              <p className="text-gray-500 mb-0.5">{t('صافي المجمع', 'Net Pool')}</p>
              <p className="font-bold font-mono tabular-nums text-gray-900 dark:text-gray-100">{fmt(netPool)}</p>
            </div>
            <div className="space-y-0.5">
              <div className="flex justify-between">
                <span className="text-blue-500">{t('الطبيب', 'Doctor')}</span>
                <span className="font-bold font-mono tabular-nums text-blue-700 dark:text-blue-400">{fmt(drProfit)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-emerald-500">{t('العيادة', 'Clinic')}</span>
                <span className="font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">{fmt(clProfit)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex justify-end gap-3 border-t border-gray-100 dark:border-neutral-800 pt-4">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isPending}>
            {t('إغلاق', 'Close')}
          </Button>
          {!locked && (
            <Button size="sm" onClick={() => void handleSave()} disabled={isPending} className="min-w-24 gap-1.5">
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {t('حفظ التغييرات', 'Save Changes')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Settlement detail row ─────────────────────────────────────────────────────
function SettlementDetail({ doctorId, from, to, locale, t, locked }: {
  doctorId: string; from: string; to: string; locale: string; locked?: boolean;
  t: (ar: string, en: string) => string;
}) {
  const { data: txData, isLoading } = useTransactions({ doctorId, dateFrom: from, dateTo: to, limit: 100 });
  const procedureMap = useProcedureMap();
  const txs = txData?.data ?? [];
  const fmt = (n: number) => formatCurrency(n, 'EGP', locale);

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
            <TransactionRow
              key={tx.id}
              tx={tx}
              procedureMap={procedureMap}
              locked={locked}
              fmt={fmt}
              t={t}
            />
          ))}
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

// Each transaction row fetches its own extra services from the API
function TransactionRow({ tx, procedureMap, locked, fmt, t }: {
  tx: FinancialTransaction;
  procedureMap: Map<string, { nameEn: string; nameAr?: string }>;
  locked?: boolean;
  fmt: (n: number) => string;
  t: (ar: string, en: string) => string;
}) {
  const { data: serverItems = [] } = useExtraServices(tx.id);
  const [popupOpen, setPopupOpen] = useState(false);

  const cost      = serverItems.reduce((s, i) => s + i.cost, 0);
  const itemCount = serverItems.length;
  const firstName = serverItems.length > 0
    ? serverItems[0].serviceName
    : (procedureMap.get(tx.procedureId ?? '')?.nameEn ?? '');

  const netPool = (tx.approvedCharge - tx.sourceFeeAmount) + cost;
  const drShare = netPool * tx.splitDoctorPercentage / 100;
  const clShare = netPool * tx.splitClinicPercentage  / 100;

  // Convert server items → editable form for popup
  const editableInit: EditableService[] = serverItems.map((i) => ({
    id: i.id,
    name: i.serviceName,
    cost: String(i.cost),
  }));

  return (
    <>
      <tr className="hover:bg-white dark:hover:bg-neutral-700/20 transition-colors">
        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{tx.transactionDate?.slice(0, 10)}</td>
        <td className="px-3 py-2">
          <span className="bg-gray-100 dark:bg-neutral-700 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-300">{tx.patientSource}</span>
        </td>
        <td className="px-3 py-2 text-end font-mono tabular-nums text-gray-700 dark:text-gray-300">{fmt(tx.approvedCharge)}</td>
        <td className="px-3 py-2 text-end font-mono text-orange-500">{tx.sourceFeePercentage}%</td>
        <td className="px-3 py-2 text-end font-mono tabular-nums text-orange-600 dark:text-orange-400">{fmt(tx.sourceFeeAmount)}</td>

        {/* Extra Services cell — badge or + button */}
        <td className="px-3 py-2 text-center">
          {itemCount > 0 ? (
            <button
              type="button"
              onClick={() => setPopupOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-100 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-300 font-semibold text-[11px] hover:bg-orange-200 dark:hover:bg-orange-800/40 transition-colors"
              title={t('تعديل الخدمات الإضافية', 'Edit extra services')}
            >
              <FlaskConical className="w-3 h-3" />
              {itemCount}
              {firstName && <span className="max-w-[60px] truncate hidden sm:inline">{firstName}</span>}
              <span className="font-mono text-[10px] opacity-70">{fmt(cost)}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setPopupOpen(true)}
              disabled={locked}
              className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-dashed border-gray-300 dark:border-neutral-600 text-gray-400 hover:border-violet-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title={t('إضافة خدمة إضافية', 'Add extra service')}
            >
              <Plus className="w-3 h-3" />
            </button>
          )}
        </td>

        <td className="px-3 py-2 text-end font-mono tabular-nums text-gray-600 dark:text-gray-300">{fmt(netPool)}</td>
        <td className="px-3 py-2 text-end font-mono text-blue-500">{tx.splitDoctorPercentage}%</td>
        <td className="px-3 py-2 text-end font-mono tabular-nums font-semibold text-blue-700 dark:text-blue-400">{fmt(drShare)}</td>
        <td className="px-3 py-2 text-end font-mono text-emerald-500">{tx.splitClinicPercentage}%</td>
        <td className="px-3 py-2 text-end font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">{fmt(clShare)}</td>
      </tr>

      {popupOpen && (
        <ExtraServicesPopup
          tx={tx}
          initItems={editableInit}
          locked={locked}
          t={t}
          fmt={fmt}
          onClose={() => setPopupOpen(false)}
          onSave={() => setPopupOpen(false)}
        />
      )}
    </>
  );
}
