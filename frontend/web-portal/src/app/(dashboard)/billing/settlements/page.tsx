'use client';
import { CTable, CTableHead, CTableBody, CTableRow, CTableHeaderCell, CTableDataCell, CTableFoot } from '@coreui/react';

import { useState, useMemo, useCallback } from 'react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import {
  Banknote, RefreshCw, ReceiptText, ChevronDown, ChevronRight,
  Building2, Stethoscope, Share2, Loader2, FlaskConical, Check, X,
  Search, SlidersHorizontal, ChevronUp, ArrowUpDown,
  CheckCircle2, AlertTriangle, Lock, Plus, Trash2,
  RotateCcw, User,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useLang } from '@/contexts/LanguageContext';
import { formatCurrency, localDateISO } from '@/lib/utils';
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

// ── Tiny letter avatar ──────────────────────────────────────────────────────

const AVATAR_HUES = [
  '#DC2626','#3B82F6','#10B981','#8B5CF6','#F59E0B','#06B6D4','#EF4444','#6366F1',
];
function LetterAvatar({ name, size = 28 }: { name: string; size?: number }) {
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const hash = name.split('').reduce((h, c) => h + c.charCodeAt(0), 0);
  const bg = AVATAR_HUES[hash % AVATAR_HUES.length];
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', background: bg,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      color: 'white', fontWeight: 700, fontSize: size * 0.38, flexShrink: 0,
      fontFamily: 'var(--font-display)',
    }}>
      {initials}
    </span>
  );
}

export default function SettlementsPage() {
  const { lang, t } = useLang();
  const locale = lang === 'ar' ? 'ar-EG' : 'en-US';

  const now = new Date();
  const today = localDateISO(now);
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
  const [settleTarget, setSettleTarget]           = useState<DoctorSettlement | null>(null);
  const [settleMethod, setSettleMethod]           = useState<'cash' | 'bank' | 'cheque' | 'transfer'>('cash');
  const [settleRef, setSettleRef]                 = useState('');
  const [settleVoucher, setSettleVoucher]         = useState('');
  const [settleVoucherErr, setSettleVoucherErr]   = useState('');
  const [settleNotes, setSettleNotes]             = useState('');
  const [settleNotesErr, setSettleNotesErr]       = useState('');
  const [settlePassword, setSettlePassword]       = useState('');
  const [settlePasswordErr, setSettlePasswordErr] = useState('');
  const { mutateAsync: reconcile, isPending: settling, error: settleErr } = useReconcileDoctor();
  const [settlementsBodyRef] = useAutoAnimate();

  // Reverse dialog
  const [reverseTarget, setReverseTarget]             = useState<string | null>(null);
  const [reverseReason, setReverseReason]             = useState('');
  const [reversePassword, setReversePassword]         = useState('');
  const [reversePasswordErr, setReversePasswordErr]   = useState('');
  const [reverseError, setReverseError]               = useState('');
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

  // Client-side filter + sort
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
  const totalSessions      = settlements.reduce((s, r) => s + (r.totalConsultations ?? 0) + (r.totalProcedures ?? 0), 0);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };
  const clearFilters = () => { setSelectedDoctor(''); setDoctorSearch(''); setMinNetPool(''); setMaxNetPool(''); };

  const SortIcon = ({ col }: { col: SortKey }) =>
    sortKey === col
      ? (sortDir === 'asc' ? <ChevronUp className="w-3 h-3 inline ms-0.5" /> : <ChevronDown className="w-3 h-3 inline ms-0.5" />)
      : <ArrowUpDown className="w-3 h-3 inline ms-0.5 opacity-30" />;

  const resetSettleDialog = () => {
    setSettleTarget(null);
    setSettleRef('');
    setSettleVoucher('');
    setSettleVoucherErr('');
    setSettleNotes('');
    setSettleNotesErr('');
    setSettleMethod('cash');
    setSettlePassword('');
    setSettlePasswordErr('');
  };

  const handleSettle = async () => {
    if (!settleTarget) return;
    let invalid = false;
    if (!/^\d{1,12}$/.test(settleVoucher.trim())) {
      setSettleVoucherErr(t('رقم السند مطلوب (أرقام فقط، 12 رقم كحد أقصى)', 'Voucher number is required (digits only, max 12)'));
      invalid = true;
    } else setSettleVoucherErr('');
    if (!settleNotes.trim()) {
      setSettleNotesErr(t('الملاحظات مطلوبة', 'Notes are required'));
      invalid = true;
    } else setSettleNotesErr('');
    if (!settlePassword) { setSettlePasswordErr(t('كلمة المرور مطلوبة', 'Password is required')); invalid = true; }
    else setSettlePasswordErr('');
    if (invalid) return;
    await reconcile({
      doctorId: settleTarget.doctorId,
      from, to,
      paymentMethod: settleMethod,
      paymentReference: settleRef || undefined,
      voucherNo: settleVoucher.trim(),
      notes: settleNotes.trim(),
      password: settlePassword,
    });
    refetch();
    refetchRecords();
    resetSettleDialog();
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
      refetchRecords();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      setReverseError(msg || t('كلمة المرور غير صحيحة أو فشل العكس', 'Incorrect password or reversal failed'));
    }
  };

  // KPI donut arcs (doctor vs clinic share of net pool)
  const C = 301.59;
  const drArc = totalNetPool > 0 ? C * (totalDoctors / totalNetPool) : 0;
  const clArc = totalNetPool > 0 ? C * (totalClinic  / totalNetPool) : 0;

  // Hero bar chart — top 20 doctors by doctorShare
  const barData = useMemo(() =>
    [...settlements].sort((a, b) => b.doctorShare - a.doctorShare).slice(0, 20),
    [settlements],
  );
  const maxBar = barData.reduce((m, s) => Math.max(m, s.doctorShare), 1);

  // Doctor % of net pool (for legend)
  const drPct = totalNetPool > 0 ? ((totalDoctors / totalNetPool) * 100).toFixed(0) : '—';
  const clPct = totalNetPool > 0 ? ((totalClinic  / totalNetPool) * 100).toFixed(0) : '—';

  const inputCls = 'text-sm border border-gray-200 dark:border-neutral-600 rounded-lg px-3 py-1.5 bg-white dark:bg-neutral-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-600';

  return (
    <div className="fc-page">

      {/* ── Page header ───────────────────────────────────────────────────────── */}
      <div className="fc-page-head">
        <div>
          <h2 className="fc-page-title">{t('التسويات المالية', 'Financial Settlements')}</h2>
          <p className="fc-page-sub">
            {t('وسيط من رسم الجلسة فقط؛ الخدمات الإضافية بالكامل للصافي',
               'Mediator cut on session fee only; extra services go in full to net pool')}
          </p>
        </div>
        <div className="fc-page-actions flex-wrap">
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500">{t('من', 'From')}</label>
            <input id="settle-from-date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500">{t('إلى', 'To')}</label>
            <input id="settle-to-date" type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
          </div>
          <button
            className="fc-btn fc-btn-outline fc-btn-sm"
            onClick={() => { refetch(); refetchRecords(); }}
            disabled={isFetching}
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isFetching && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* ── KPI row ───────────────────────────────────────────────────────────── */}
      {!isLoading && settlements.length > 0 && (
        <div className="fc-bill-kpi-row">

          {/* Hero tile — total doctor payable */}
          <div className="fc-bill-revenue">
            <div className="fc-bill-revenue-eyebrow">
              <Stethoscope size={14} /> {t('مستحق الأطباء', 'Doctor Payable')}
            </div>
            <div className="fc-bill-revenue-val">{fmt(totalDoctors)}</div>
            <div className="fc-bill-revenue-trend">
              <span className="fc-kpi-delta is-up">
                {settlements.length} {t('طبيب', 'doctors')}
              </span>
              <span className="fc-bill-revenue-vs">
                {totalSessions} {t('جلسة معلقة', 'sessions pending')}
              </span>
            </div>
            <svg viewBox="0 0 320 56" width="100%" height="56" className="fc-bill-revenue-chart">
              {barData.map((s, i) => {
                const h = Math.max(4, (s.doctorShare / maxBar) * 48);
                return (
                  <rect
                    key={s.doctorId}
                    x={i * 16.1}
                    y={56 - h}
                    width="12"
                    height={h}
                    rx="2"
                    fill={i === 0 ? 'white' : 'rgba(255,255,255,0.28)'}
                  />
                );
              })}
            </svg>
          </div>

          {/* Split tile — doctor vs clinic */}
          <div className="fc-bill-split">
            <div className="fc-bill-split-head">
              <Building2 size={14} />
              <span>{t('توزيع الحصص', 'Share Breakdown')}</span>
              <span className="fc-bill-split-total">{fmt(totalNetPool)}</span>
            </div>
            <div className="fc-bill-split-body">
              <svg viewBox="0 0 120 120" width="110" height="110">
                <g transform="translate(60,60)">
                  <circle r="48" fill="none" stroke="#F3F4F6" strokeWidth="16" />
                  {totalNetPool > 0 ? (
                    <>
                      <circle r="48" fill="none" stroke="#3B82F6" strokeWidth="16"
                        strokeDasharray={`${drArc} ${C}`} transform="rotate(-90)" />
                      <circle r="48" fill="none" stroke="#10B981" strokeWidth="16"
                        strokeDasharray={`${clArc} ${C}`} strokeDashoffset={-drArc} transform="rotate(-90)" />
                    </>
                  ) : (
                    <circle r="48" fill="none" stroke="#E5E7EB" strokeWidth="16" />
                  )}
                  <text textAnchor="middle" dy="4" fontFamily="Outfit" fontWeight="700" fontSize="15" fill="#0F172A">
                    {totalNetPool > 0 ? `${drPct}%` : '—'}
                  </text>
                  <text textAnchor="middle" dy="16" fontFamily="Manrope" fontWeight="500" fontSize="8" fill="#94A3B8">
                    DR
                  </text>
                </g>
              </svg>
              <div className="fc-bill-split-legend">
                <div className="fc-bill-leg-row">
                  <span className="fc-bill-leg-dot" style={{ background: '#3B82F6' }} />
                  {t('الأطباء', 'Doctors')}
                  <span className="fc-bill-leg-val">{drPct}%</span>
                </div>
                <div className="fc-bill-leg-row">
                  <span className="fc-bill-leg-dot" style={{ background: '#10B981' }} />
                  {t('العيادة', 'Clinic')}
                  <span className="fc-bill-leg-val">{clPct}%</span>
                </div>
                {totalMediator > 0 && (
                  <div className="fc-bill-leg-row">
                    <span className="fc-bill-leg-dot" style={{ background: '#F59E0B' }} />
                    {t('الوسيط', 'Mediator')}
                    <span className="fc-bill-leg-val">{fmt(totalMediator)}</span>
                  </div>
                )}
                {totalExtraServices > 0 && (
                  <div className="fc-bill-leg-row">
                    <span className="fc-bill-leg-dot" style={{ background: '#8B5CF6' }} />
                    {t('إضافية', 'Extra Svcs')}
                    <span className="fc-bill-leg-val">{fmt(totalExtraServices)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Outstanding tile — net pool summary */}
          <div className="fc-bill-outstanding">
            <div className="fc-bill-out-head">
              <ReceiptText size={14} /> {t('رسوم الجلسات', 'Session Fees')}
            </div>
            <div className="fc-bill-out-val">{fmt(totalSessionFees)}</div>
            <div className="fc-bill-out-sub">
              {totalSessions} {t('جلسة', 'sessions')} &nbsp;·&nbsp; {settlements.length} {t('طبيب', 'doctors')}
            </div>
            <button className="fc-bill-out-cta" onClick={() => setShowAdvanced((v) => !v)}>
              {t('تصفية الأطباء', 'Filter doctors')} <ChevronRight size={12} strokeWidth={2.4} />
            </button>
          </div>
        </div>
      )}

      {/* ── Toolbar ───────────────────────────────────────────────────────────── */}
      <div className="fc-apt-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: 1 }}>
          <div className="fc-dr-search" style={{ maxWidth: 300 }}>
            <Search className="fc-dr-search-icon" size={14} />
            <input
              type="text"
              value={doctorSearch}
              onChange={(e) => { setDoctorSearch(e.target.value); setSelectedDoctor(''); }}
              placeholder={t('بحث باسم الطبيب...', 'Search doctor name...')}
              aria-label={t('بحث باسم الطبيب', 'Search by doctor name')}
            />
            {doctorSearch && (
              <button className="fc-dr-search-clear" onClick={() => setDoctorSearch('')}>
                <X size={12} />
              </button>
            )}
          </div>
          <select
            value={selectedDoctor}
            onChange={(e) => { setSelectedDoctor(e.target.value); setDoctorSearch(''); }}
            className={inputCls}
          >
            <option value="">{t('كل الأطباء', 'All doctors')}</option>
            {doctorList.map((d) => <option key={d.id} value={d.id}>{d.nameEn}</option>)}
          </select>
          <button
            className={cn('fc-btn fc-btn-outline fc-btn-sm', showAdvanced && 'ring-2 ring-primary-500')}
            onClick={() => setShowAdvanced((v) => !v)}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 me-1.5" />
            {t('فلتر متقدم', 'Advanced')}
            {hasActiveFilters && <span className="ms-1.5 w-2 h-2 rounded-full bg-primary-500 inline-block" />}
          </button>
          {hasActiveFilters && (
            <button className="fc-btn fc-btn-outline fc-btn-sm text-gray-400" onClick={clearFilters}>
              <X className="w-3.5 h-3.5 me-1" />{t('مسح الفلاتر', 'Clear filters')}
            </button>
          )}
        </div>
      </div>

      {/* Advanced filter panel */}
      {showAdvanced && (
        <div className="rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/60 px-4 py-3 flex flex-wrap gap-4 items-end">
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-500">{t('صافي المجمع: من', 'Net Pool: min')}</p>
            <input type="number" min="0" step="100" value={minNetPool} onChange={(e) => setMinNetPool(e.target.value)} placeholder="0"
              className={cn(inputCls, 'w-32 [appearance:textfield]')} />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-500">{t('صافي المجمع: إلى', 'Net Pool: max')}</p>
            <input type="number" min="0" step="100" value={maxNetPool} onChange={(e) => setMaxNetPool(e.target.value)} placeholder="∞"
              className={cn(inputCls, 'w-32 [appearance:textfield]')} />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-500">{t('ترتيب حسب', 'Sort by')}</p>
            <div className="flex gap-1">
              <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className={inputCls}>
                <option value="name">{t('الاسم', 'Name')}</option>
                <option value="sessions">{t('الجلسات', 'Sessions')}</option>
                <option value="sessionFees">{t('رسوم الجلسة', 'Session Fees')}</option>
                <option value="netPool">{t('الصافي', 'Net Pool')}</option>
                <option value="doctor">{t('حصة الطبيب', "Doctor's Share")}</option>
                <option value="clinic">{t('حصة العيادة', "Clinic's Share")}</option>
              </select>
              <button onClick={() => setSortDir((d) => d === 'asc' ? 'desc' : 'asc')}
                className={cn(inputCls, 'px-2')}>
                {sortDir === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <button className="fc-btn fc-btn-outline fc-btn-sm text-gray-400 self-end" onClick={clearFilters}>
            <X className="w-3.5 h-3.5 me-1" />{t('مسح', 'Clear')}
          </button>
        </div>
      )}

      {/* ── Pending settlements ────────────────────────────────────────────────── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {t('التسويات المعلقة', 'Pending Settlements')}
          </h3>
          {!isLoading && <span className="fc-pill-count">{settlements.length}</span>}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin me-2" />{t('جاري التحميل...', 'Loading...')}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <ReceiptText className="w-12 h-12 text-gray-300 dark:text-gray-600" />
            <p className="text-gray-500 font-medium">{t('تعذّر تحميل التسويات', 'Failed to load settlements')}</p>
            <button className="fc-btn fc-btn-outline fc-btn-sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn('w-4 h-4 me-1.5', isFetching && 'animate-spin')} />{t('إعادة المحاولة', 'Retry')}
            </button>
          </div>
        ) : settlements.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <CheckCircle2 className="w-10 h-10 text-emerald-400" />
            <p className="text-gray-500 font-medium">{t('لا توجد تسويات معلقة في هذه الفترة', 'No pending settlements in this period')}</p>
          </div>
        ) : (
          <div className="fc-card">
            <div className="fc-table-wrap">
              <CTable className="fc-table">
                <CTableHead>
                  <CTableRow>
                    <CTableHeaderCell className="w-8" />
                    <CTableHeaderCell className="cursor-pointer hover:text-gray-700 select-none" onClick={() => toggleSort('name')}>
                      {t('الطبيب', 'Doctor')} <SortIcon col="name" />
                    </CTableHeaderCell>
                    <CTableHeaderCell className="text-end cursor-pointer hover:text-gray-700 select-none" onClick={() => toggleSort('sessions')}>
                      {t('جلسات', 'Sessions')} <SortIcon col="sessions" />
                    </CTableHeaderCell>
                    <CTableHeaderCell className="text-end cursor-pointer hover:text-gray-700 select-none" onClick={() => toggleSort('sessionFees')}>
                      {t('رسوم الجلسة', 'Session Fees')} <SortIcon col="sessionFees" />
                    </CTableHeaderCell>
                    <CTableHeaderCell className="text-end" style={{ color: '#D97706' }}>
                      <span className="inline-flex items-center gap-1"><Share2 className="w-3 h-3" />{t('الوسيط', 'Mediator')}</span>
                    </CTableHeaderCell>
                    <CTableHeaderCell className="text-end" style={{ color: '#7C3AED' }}>
                      <span className="inline-flex items-center gap-1"><FlaskConical className="w-3 h-3" />{t('إضافية', 'Extra Svcs')}</span>
                    </CTableHeaderCell>
                    <CTableHeaderCell className="text-end cursor-pointer hover:text-gray-700 select-none" onClick={() => toggleSort('netPool')}>
                      {t('الصافي', 'Net Pool')} <SortIcon col="netPool" />
                    </CTableHeaderCell>
                    <CTableHeaderCell className="text-end cursor-pointer select-none" style={{ color: '#2563EB' }} onClick={() => toggleSort('doctor')}>
                      <span className="inline-flex items-center gap-1"><Stethoscope className="w-3 h-3" />{t('الطبيب', 'Doctor')} <SortIcon col="doctor" /></span>
                    </CTableHeaderCell>
                    <CTableHeaderCell className="text-end cursor-pointer select-none" style={{ color: '#059669' }} onClick={() => toggleSort('clinic')}>
                      <span className="inline-flex items-center gap-1"><Building2 className="w-3 h-3" />{t('العيادة', 'Clinic')} <SortIcon col="clinic" /></span>
                    </CTableHeaderCell>
                    <CTableHeaderCell />
                  </CTableRow>
                </CTableHead>
                <CTableBody ref={settlementsBodyRef}>
                  {settlements.map((s) => {
                    const sessionFees = s.totalSessionFees ?? (s.grossRevenue + s.totalSourceFees);
                    const extraSvcs   = s.totalExtraServices ?? 0;
                    const extraCount  = s.totalExtraServicesCount ?? 0;
                    const isOpen      = expanded === s.doctorId;
                    const docName     = doctorMap.get(s.doctorId)?.nameEn ?? s.doctorId.slice(0, 8);
                    return (
                      <>
                        <CTableRow
                          key={s.doctorId}
                          onClick={() => setExpanded(isOpen ? null : s.doctorId)}
                          className="cursor-pointer"
                        >
                          <CTableDataCell className="text-gray-400">
                            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </CTableDataCell>
                          <CTableDataCell>
                            <div className="fc-pat">
                              <LetterAvatar name={docName} size={28} />
                              <span className="fc-pat-name">{docName}</span>
                            </div>
                          </CTableDataCell>
                          <CTableDataCell className="text-end fc-mono text-gray-600 dark:text-gray-300">
                            {(s.totalConsultations ?? 0) + (s.totalProcedures ?? 0)}
                          </CTableDataCell>
                          <CTableDataCell className="text-end fc-mono text-gray-700 dark:text-gray-200">{fmt(sessionFees)}</CTableDataCell>
                          <CTableDataCell className="text-end fc-mono" style={{ color: '#D97706' }}>{fmt(s.totalSourceFees)}</CTableDataCell>
                          <CTableDataCell className="text-end">
                            <span className="fc-mono" style={{ color: '#7C3AED' }}>{fmt(extraSvcs)}</span>
                            {extraCount > 0 && (
                              <span className="block text-[10px] text-gray-400 mt-0.5">({extraCount} {t('بنود', 'items')})</span>
                            )}
                          </CTableDataCell>
                          <CTableDataCell className="text-end fc-mono text-gray-600 dark:text-gray-300">{fmt(s.grossRevenue)}</CTableDataCell>
                          <CTableDataCell className="text-end fc-mono font-semibold" style={{ color: '#1D4ED8' }}>{fmt(s.doctorShare)}</CTableDataCell>
                          <CTableDataCell className="text-end fc-mono font-semibold" style={{ color: '#047857' }}>{fmt(s.clinicShare)}</CTableDataCell>
                          <CTableDataCell>
                            {(s.netPayable ?? 0) > 0 && (
                              <div className="fc-row-actions" style={{ opacity: 1 }}>
                                <button
                                  className="fc-act fc-act-settle"
                                  onClick={(e) => { e.stopPropagation(); setSettleTarget(s); }}
                                >
                                  {t('تسوية', 'Settle')}
                                </button>
                              </div>
                            )}
                          </CTableDataCell>
                        </CTableRow>
                        {isOpen && (
                          <CTableRow key={`${s.doctorId}-detail`}>
                            <CTableDataCell colSpan={10} className="bg-gray-50/40 dark:bg-neutral-800/30 px-6 py-4">
                              <SettlementDetail doctorId={s.doctorId} from={from} to={to} locale={locale} t={t} />
                            </CTableDataCell>
                          </CTableRow>
                        )}
                      </>
                    );
                  })}
                </CTableBody>
                <CTableFoot>
                  <CTableRow style={{ borderTop: '2px solid #E5E7EB' }} className="bg-gray-50 dark:bg-neutral-800/60 font-semibold text-sm">
                    <CTableDataCell className="px-4 py-3" />
                    <CTableDataCell className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wide">{t('الإجمالي', 'Total')}</CTableDataCell>
                    <CTableDataCell className="px-4 py-3 text-end fc-mono text-gray-600">{totalSessions}</CTableDataCell>
                    <CTableDataCell className="px-4 py-3 text-end fc-mono text-gray-900 dark:text-gray-100">{fmt(totalSessionFees)}</CTableDataCell>
                    <CTableDataCell className="px-4 py-3 text-end fc-mono" style={{ color: '#D97706' }}>{fmt(totalMediator)}</CTableDataCell>
                    <CTableDataCell className="px-4 py-3 text-end fc-mono" style={{ color: '#7C3AED' }}>{fmt(totalExtraServices)}</CTableDataCell>
                    <CTableDataCell className="px-4 py-3 text-end fc-mono text-gray-700 dark:text-gray-300">{fmt(totalNetPool)}</CTableDataCell>
                    <CTableDataCell className="px-4 py-3 text-end fc-mono" style={{ color: '#1D4ED8' }}>{fmt(totalDoctors)}</CTableDataCell>
                    <CTableDataCell className="px-4 py-3 text-end fc-mono" style={{ color: '#047857' }}>{fmt(totalClinic)}</CTableDataCell>
                    <CTableDataCell className="px-4 py-3" />
                  </CTableRow>
                </CTableFoot>
              </CTable>
            </div>
          </div>
        )}
      </div>

      {/* ── Completed settlements ──────────────────────────────────────────────── */}
      {completedRecords.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              {t('التسويات المكتملة', 'Completed Settlements')}
            </h3>
            <span className="fc-pill-count" style={{ background: '#D1FAE5', color: '#047857' }}>
              {completedRecords.length}
            </span>
          </div>
          <div className="fc-card">
            <div className="fc-stl-hist-list">
              {completedRecords.map((rec) => {
                const docName = doctorMap.get(rec.doctorId)?.nameEn ?? rec.doctorId.slice(0, 8);
                const period = rec.periodFrom && rec.periodTo
                  ? `${rec.periodFrom} → ${rec.periodTo}`
                  : rec.settlementDate;
                const method = PAYMENT_METHOD_LABELS[rec.paymentMethod] ?? rec.paymentMethod;
                const ref = rec.paymentReference ? ` · Ref: ${rec.paymentReference}` : '';
                const voucher = rec.voucherNo ? ` · ${t('سند', 'Voucher')}: ${rec.voucherNo}` : '';
                return (
                  <div
                    key={rec.id}
                    className={cn('fc-stl-hist-item', rec.reversedAt && 'is-reversed')}
                  >
                    <div
                      className="fc-stl-hist-bar"
                      style={{ background: rec.reversedAt ? '#CBD5E1' : '#10B981' }}
                    />
                    <div className="fc-stl-hist-body">
                      <div className="fc-stl-hist-text">
                        <div className="fc-stl-hist-name">
                          {docName}
                          {rec.reversedAt && (
                            <span
                              className="fc-statuspill ms-2"
                              style={{ background: '#F1F5F9', color: '#64748B', fontSize: 10 }}
                            >
                              {t('مُعكوس', 'Reversed')}
                            </span>
                          )}
                        </div>
                        <div className="fc-stl-hist-meta">{period} · {method}{ref}{voucher}</div>
                      </div>
                    </div>
                    <div className="fc-stl-hist-amount">
                      <div className="fc-stl-hist-amount-val">{fmt(rec.amount)}</div>
                      <div className="fc-stl-hist-amount-date">
                        {new Date(rec.createdAt).toLocaleDateString(locale)}
                      </div>
                    </div>
                    <div className="fc-stl-hist-actions">
                      {!rec.reversedAt && <Lock className="w-3.5 h-3.5 text-emerald-500" aria-label={t('مُسوَّى', 'Settled')} />}
                      {!rec.reversedAt && (
                        <button
                          className="fc-act fc-act-reverse"
                          onClick={() => {
                            setReverseTarget(rec.id);
                            setReverseReason('');
                            setReversePassword('');
                            setReversePasswordErr('');
                            setReverseError('');
                          }}
                          title={t('عكس التسوية', 'Reverse Settlement')}
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Settle confirmation dialog ────────────────────────────────────────── */}
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
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">
                  {t('رقم السند', 'Voucher No.')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  value={settleVoucher}
                  onChange={(e) => { setSettleVoucher(e.target.value.replace(/\D/g, '').slice(0, 12)); setSettleVoucherErr(''); }}
                  placeholder="123456789012"
                  maxLength={12}
                  className={cn(
                    'w-full text-sm border rounded-lg px-3 py-2 bg-white dark:bg-neutral-800 text-gray-800 dark:text-gray-200 font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500',
                    settleVoucherErr ? 'border-red-400' : 'border-gray-200 dark:border-neutral-600',
                  )}
                />
                {settleVoucherErr && <p className="text-xs text-red-500 mt-1">{settleVoucherErr}</p>}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">
                  {t('ملاحظات', 'Notes')} <span className="text-red-500">*</span>
                </label>
                <textarea rows={2} value={settleNotes} onChange={(e) => { setSettleNotes(e.target.value); setSettleNotesErr(''); }}
                  className={cn(
                    'w-full text-sm border rounded-lg px-3 py-2 bg-white dark:bg-neutral-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none',
                    settleNotesErr ? 'border-red-400' : 'border-gray-200 dark:border-neutral-600',
                  )} />
                {settleNotesErr && <p className="text-xs text-red-500 mt-1">{settleNotesErr}</p>}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">{t('كلمة مرورك للتأكيد', 'Your password to confirm')}</label>
                <input type="password" value={settlePassword}
                  onChange={(e) => { setSettlePassword(e.target.value); setSettlePasswordErr(''); }}
                  placeholder="••••••••"
                  className="w-full text-sm border border-gray-200 dark:border-neutral-600 rounded-lg px-3 py-2 bg-white dark:bg-neutral-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                {settlePasswordErr && <p className="text-xs text-red-500 mt-1">{settlePasswordErr}</p>}
              </div>
            </div>
            {settleErr != null && (
              <p className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
                {settleErr instanceof Error ? settleErr.message : t('فشلت التسوية', 'Settlement failed')}
              </p>
            )}
            <div className="flex gap-3 justify-end pt-1">
              <button className="fc-btn fc-btn-outline fc-btn-sm" onClick={resetSettleDialog} disabled={settling}>
                {t('إلغاء', 'Cancel')}
              </button>
              <button className="fc-btn fc-btn-sm" style={{ minWidth: 120, background: '#059669', color: 'white', border: 'none' }}
                onClick={() => handleSettle()} disabled={settling}>
                {settling ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : <><Check className="w-3.5 h-3.5 me-1.5" />{t('تأكيد التسوية', 'Confirm & Settle')}</>}
              </button>
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
                <input type="password" value={reversePassword}
                  onChange={(e) => { setReversePassword(e.target.value); setReversePasswordErr(''); }}
                  placeholder="••••••••"
                  className="w-full text-sm border border-gray-200 dark:border-neutral-600 rounded-lg px-3 py-2 bg-white dark:bg-neutral-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-400" />
                {reversePasswordErr && <p className="text-xs text-red-500 mt-1">{reversePasswordErr}</p>}
              </div>
            </div>
            {reverseError && <p className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{reverseError}</p>}
            <div className="flex gap-3 justify-end pt-1">
              <button className="fc-btn fc-btn-outline fc-btn-sm"
                onClick={() => { setReverseTarget(null); setReversePassword(''); setReversePasswordErr(''); setReverseError(''); }}
                disabled={reversing}>
                {t('إلغاء', 'Cancel')}
              </button>
              <button className="fc-btn fc-btn-sm" style={{ minWidth: 120, background: '#D97706', color: 'white', border: 'none' }}
                onClick={() => handleReverse()} disabled={reversing || reverseReason.trim().length < 10}>
                {reversing ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : <><RotateCcw className="w-3.5 h-3.5 me-1.5" />{t('عكس التسوية', 'Reverse')}</>}
              </button>
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
      <CTable className="w-full text-xs">
        <CTableHead>
          <CTableRow className="bg-gray-100 dark:bg-neutral-700/50 border-b border-gray-200 dark:border-neutral-700">
            <CTableHeaderCell className="text-start px-3 py-2 font-medium text-gray-500">{t('التاريخ', 'Date')}</CTableHeaderCell>
            <CTableHeaderCell className="text-start px-3 py-2 font-medium text-blue-500">
              <span className="flex items-center gap-1"><User className="w-3 h-3" />{t('المريض', 'Patient')}</span>
            </CTableHeaderCell>
            <CTableHeaderCell className="text-start px-3 py-2 font-medium text-gray-500">{t('نوع الزيارة', 'Visit Type')}</CTableHeaderCell>
            <CTableHeaderCell className="text-start px-3 py-2 font-medium text-gray-500">{t('المصدر', 'Source')}</CTableHeaderCell>
            <CTableHeaderCell className="text-end   px-3 py-2 font-medium text-gray-500">{t('رسم الجلسة', 'Session Fee')}</CTableHeaderCell>
            <CTableHeaderCell className="text-end   px-3 py-2 font-medium text-orange-500">{t('وسيط %', 'Src %')}</CTableHeaderCell>
            <CTableHeaderCell className="text-end   px-3 py-2 font-medium text-orange-500">{t('الوسيط', 'Mediator')}</CTableHeaderCell>
            <CTableHeaderCell className="text-center px-3 py-2 font-medium text-violet-500">{t('الإضافية', 'Extra Svcs')}</CTableHeaderCell>
            <CTableHeaderCell className="text-end   px-3 py-2 font-medium text-gray-600 dark:text-gray-300">{t('الصافي', 'Net Pool')}</CTableHeaderCell>
            <CTableHeaderCell className="text-end   px-3 py-2 font-medium text-blue-500">{t('د %', 'Dr %')}</CTableHeaderCell>
            <CTableHeaderCell className="text-end   px-3 py-2 font-medium text-blue-500">{t('الطبيب', 'Doctor')}</CTableHeaderCell>
            <CTableHeaderCell className="text-end   px-3 py-2 font-medium text-emerald-500">{t('ع %', 'Cl %')}</CTableHeaderCell>
            <CTableHeaderCell className="text-end   px-3 py-2 font-medium text-emerald-500">{t('العيادة', 'Clinic')}</CTableHeaderCell>
          </CTableRow>
        </CTableHead>
        <CTableBody className="divide-y divide-gray-100 dark:divide-neutral-700/50">
          {txs.map((tx) => (
            <TransactionRow key={tx.id} tx={tx} fmt={fmt} t={t} patientMap={patientMap} />
          ))}
        </CTableBody>
        <CTableFoot>
          <CTableRow className="border-t border-gray-200 dark:border-neutral-600 bg-gray-50 dark:bg-neutral-700/30 font-semibold">
            <CTableDataCell colSpan={4} className="px-3 py-2 text-gray-500">{t('المجموع', 'Total')} ({txs.length})</CTableDataCell>
            <CTableDataCell className="px-3 py-2 text-end font-mono tabular-nums text-gray-800 dark:text-gray-200">
              {fmt(txs.reduce((s, tx) => s + tx.approvedCharge, 0))}
            </CTableDataCell>
            <CTableDataCell />
            <CTableDataCell className="px-3 py-2 text-end font-mono tabular-nums text-orange-600 dark:text-orange-400">
              {fmt(txs.reduce((s, tx) => s + tx.sourceFeeAmount, 0))}
            </CTableDataCell>
            <CTableDataCell className="px-3 py-2 text-center font-mono tabular-nums text-violet-600 dark:text-violet-400">
              {fmt(txs.reduce((s, tx) => s + (tx.procedureCost ?? 0), 0))}
            </CTableDataCell>
            <CTableDataCell className="px-3 py-2 text-end font-mono tabular-nums text-gray-700 dark:text-gray-300">
              {fmt(txs.reduce((s, tx) => s + (tx.approvedCharge - tx.sourceFeeAmount) + (tx.procedureCost ?? 0), 0))}
            </CTableDataCell>
            <CTableDataCell />
            <CTableDataCell className="px-3 py-2 text-end font-mono tabular-nums text-blue-700 dark:text-blue-300">
              {fmt(txs.reduce((s, tx) => s + tx.doctorShare, 0))}
            </CTableDataCell>
            <CTableDataCell />
            <CTableDataCell className="px-3 py-2 text-end font-mono tabular-nums text-emerald-700 dark:text-emerald-300">
              {fmt(txs.reduce((s, tx) => s + tx.clinicShare, 0))}
            </CTableDataCell>
          </CTableRow>
        </CTableFoot>
      </CTable>
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
      <CTableRow className="hover:bg-white dark:hover:bg-neutral-700/20 transition-colors">
        <CTableDataCell className="px-3 py-2 text-gray-500 whitespace-nowrap">{tx.transactionDate?.slice(0, 10)}</CTableDataCell>
        <CTableDataCell className="px-3 py-2 max-w-[140px]">
          <span className="font-semibold text-gray-800 dark:text-gray-200 truncate block" title={patientName}>
            {patientName}
          </span>
        </CTableDataCell>
        <CTableDataCell className="px-3 py-2">
          {visitTypeInfo ? (
            <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', visitTypeInfo.color)}>
              {lang === 'ar' ? visitTypeInfo.ar : visitTypeInfo.en}
            </span>
          ) : <span className="text-gray-300">—</span>}
        </CTableDataCell>
        <CTableDataCell className="px-3 py-2">
          <span className="bg-gray-100 dark:bg-neutral-700 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-300">{tx.patientSource}</span>
        </CTableDataCell>
        <CTableDataCell className="px-3 py-2 text-end font-mono tabular-nums text-gray-700 dark:text-gray-300">{fmt(tx.approvedCharge)}</CTableDataCell>
        <CTableDataCell className="px-3 py-2 text-end font-mono text-orange-500">{tx.sourceFeePercentage}%</CTableDataCell>
        <CTableDataCell className="px-3 py-2 text-end font-mono tabular-nums text-orange-600 dark:text-orange-400">{fmt(tx.sourceFeeAmount)}</CTableDataCell>

        <CTableDataCell className="px-3 py-2 text-center">
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
        </CTableDataCell>

        <CTableDataCell className="px-3 py-2 text-end font-mono tabular-nums text-gray-600 dark:text-gray-300">{fmt(netPool)}</CTableDataCell>
        <CTableDataCell className="px-3 py-2 text-end font-mono text-blue-500">{tx.splitDoctorPercentage}%</CTableDataCell>
        <CTableDataCell className="px-3 py-2 text-end font-mono tabular-nums font-semibold text-blue-700 dark:text-blue-400">{fmt(drShare)}</CTableDataCell>
        <CTableDataCell className="px-3 py-2 text-end font-mono text-emerald-500">{tx.splitClinicPercentage}%</CTableDataCell>
        <CTableDataCell className="px-3 py-2 text-end font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">{fmt(clShare)}</CTableDataCell>
      </CTableRow>

      {showExtras && itemCount > 0 && (
        <CTableRow className="bg-violet-50/30 dark:bg-violet-900/5">
          <CTableDataCell colSpan={13} className="px-6 py-2">
            <div className="rounded-lg border border-violet-100 dark:border-violet-900/30 overflow-hidden">
              <CTable className="w-full text-[11px]">
                <CTableHead>
                  <CTableRow className="bg-violet-50 dark:bg-violet-900/20">
                    <CTableHeaderCell className="text-start px-3 py-1.5 font-medium text-violet-600">{t('الخدمة', 'Service')}</CTableHeaderCell>
                    <CTableHeaderCell className="text-end px-3 py-1.5 font-medium text-violet-600">{t('التكلفة', 'Cost')}</CTableHeaderCell>
                    <CTableHeaderCell className="text-end px-3 py-1.5 font-medium text-blue-500">{t('الطبيب', 'Dr')}</CTableHeaderCell>
                    <CTableHeaderCell className="text-end px-3 py-1.5 font-medium text-emerald-500">{t('العيادة', 'Cl')}</CTableHeaderCell>
                  </CTableRow>
                </CTableHead>
                <CTableBody className="divide-y divide-violet-100 dark:divide-violet-900/20">
                  {serverItems.map((item) => {
                    const drSh = item.cost * tx.splitDoctorPercentage / 100;
                    const clSh = item.cost * tx.splitClinicPercentage / 100;
                    return (
                      <CTableRow key={item.id} className="bg-white dark:bg-neutral-900/50">
                        <CTableDataCell className="px-3 py-1.5 text-gray-700 dark:text-gray-300">{item.serviceName}</CTableDataCell>
                        <CTableDataCell className="px-3 py-1.5 text-end font-mono tabular-nums text-violet-700 dark:text-violet-400">{fmt(item.cost)}</CTableDataCell>
                        <CTableDataCell className="px-3 py-1.5 text-end font-mono tabular-nums text-blue-600 dark:text-blue-400">{fmt(drSh)}</CTableDataCell>
                        <CTableDataCell className="px-3 py-1.5 text-end font-mono tabular-nums text-emerald-600 dark:text-emerald-400">{fmt(clSh)}</CTableDataCell>
                      </CTableRow>
                    );
                  })}
                </CTableBody>
                <CTableFoot>
                  <CTableRow className="bg-violet-50 dark:bg-violet-900/10 font-semibold border-t border-violet-100 dark:border-violet-900/30">
                    <CTableDataCell className="px-3 py-1.5 text-violet-600">{t('الإجمالي', 'Total')} ({itemCount})</CTableDataCell>
                    <CTableDataCell className="px-3 py-1.5 text-end font-mono tabular-nums text-violet-700 dark:text-violet-400">{fmt(cost)}</CTableDataCell>
                    <CTableDataCell className="px-3 py-1.5 text-end font-mono tabular-nums text-blue-600">{fmt(cost * tx.splitDoctorPercentage / 100)}</CTableDataCell>
                    <CTableDataCell className="px-3 py-1.5 text-end font-mono tabular-nums text-emerald-600">{fmt(cost * tx.splitClinicPercentage / 100)}</CTableDataCell>
                  </CTableRow>
                </CTableFoot>
              </CTable>
            </div>
          </CTableDataCell>
        </CTableRow>
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
          <button className="fc-btn fc-btn-outline fc-btn-sm" onClick={onClose} disabled={isPending}>{t('إغلاق', 'Close')}</button>
          <button className="fc-btn fc-btn-sm" style={{ minWidth: 96, background: 'var(--color-primary-600)', color: 'white', border: 'none' }}
            onClick={() => handleSave()} disabled={isPending}>
            {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3.5 h-3.5 me-1.5" />{t('حفظ التغييرات', 'Save Changes')}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
