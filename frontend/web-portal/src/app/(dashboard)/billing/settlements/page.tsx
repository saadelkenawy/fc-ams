'use client';

import { useState } from 'react';
import { Banknote, RefreshCw, ReceiptText, ChevronDown, ChevronRight, Building2, Stethoscope, Share2, Loader2, FlaskConical } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useLang } from '@/contexts/LanguageContext';
import { formatCurrency } from '@/lib/utils';
import { useSettlements, useTransactions } from '@/hooks/useBilling';
import { useDoctorMap } from '@/hooks/useDoctors';
import { useProcedureMap } from '@/hooks/useProcedures';
import { cn } from '@/lib/utils';
import type { DoctorSettlement, FinancialTransaction } from '@fadl/types';

export default function SettlementsPage() {
  const { lang, t } = useLang();
  const locale = lang === 'ar' ? 'ar-EG' : 'en-US';
  const now = new Date();
  const [from, setFrom] = useState(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]);
  const [to,   setTo]   = useState(now.toISOString().split('T')[0]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading, isError, refetch, isFetching } = useSettlements({ from, to, limit: 50 });
  const doctorMap    = useDoctorMap();
  const settlements  = data?.data ?? [];

  // Summary totals
  const totalSessionFees  = settlements.reduce((s, r) => s + (r.totalSessionFees ?? r.grossRevenue + r.totalSourceFees), 0);
  const totalMediator     = settlements.reduce((s, r) => s + r.totalSourceFees, 0);
  const totalExtraServices = settlements.reduce((s, r) => s + (r.totalExtraServices ?? 0), 0);
  const totalDoctors      = settlements.reduce((s, r) => s + r.doctorShare, 0);
  const totalClinic       = settlements.reduce((s, r) => s + r.clinicShare, 0);
  const totalNetPool      = settlements.reduce((s, r) => s + r.grossRevenue, 0);

  const fmt = (n: number) => formatCurrency(n, 'EGP', locale);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold font-display text-gray-900 dark:text-gray-100">
            {t('التسويات المالية', 'Financial Settlements')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {t('توزيع صافي الربح: الوسيط من رسم الجلسة فقط، والخدمات الإضافية تُضاف بالكامل للصافي', 'Mediator cut on session fee only; extra services added in full to net pool')}
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

      {/* Formula legend */}
      {!isLoading && settlements.length > 0 && (
        <div className="rounded-xl bg-gray-50 dark:bg-neutral-800/60 border border-gray-100 dark:border-neutral-700 px-4 py-3 text-xs text-gray-500 dark:text-gray-400 flex flex-wrap gap-x-4 gap-y-1">
          <span><span className="font-semibold text-orange-500">{t('حصة الوسيط', 'Mediator')}</span> = {t('رسم الجلسة', 'Session Fee')} × %</span>
          <span>+</span>
          <span><span className="font-semibold text-violet-500">{t('خدمات إضافية', 'Extra Services')}</span> = {t('التكلفة الكاملة', 'Full Cost')}</span>
          <span>=</span>
          <span><span className="font-semibold text-gray-700 dark:text-gray-300">{t('صافي المجمع', 'Net Pool')}</span></span>
          <span>→</span>
          <span><span className="font-semibold text-blue-500">{t('حصة الطبيب', 'Doctor')}</span> + <span className="font-semibold text-emerald-500">{t('العيادة', 'Clinic')}</span> = 100%</span>
        </div>
      )}

      {/* Summary cards — 6 cards */}
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
              <p className="text-xs text-orange-600 dark:text-orange-400">{t('حصة الوسيط', 'Mediator')}</p>
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
              <p className="text-xs text-blue-600 dark:text-blue-400">{t('مستحق الأطباء', "Doctors'")}</p>
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
          <p className="text-gray-500 font-medium">{t('لا توجد تسويات في هذه الفترة', 'No settlements in this period')}</p>
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
                    <th className="text-end px-4 py-3 text-xs whitespace-nowrap">
                      <span className="flex items-center justify-end gap-1 text-orange-500 font-medium">
                        <Share2 className="w-3 h-3" />{t('الوسيط', 'Mediator')}
                      </span>
                    </th>
                    <th className="text-end px-4 py-3 text-xs whitespace-nowrap">
                      <span className="flex items-center justify-end gap-1 text-violet-500 font-medium">
                        <FlaskConical className="w-3 h-3" />{t('خدمات إضافية', 'Extra Svcs')}
                      </span>
                    </th>
                    <th className="text-end px-4 py-3 font-medium text-gray-500 text-xs whitespace-nowrap">{t('الصافي', 'Net Pool')}</th>
                    <th className="text-end px-4 py-3 text-xs whitespace-nowrap">
                      <span className="flex items-center justify-end gap-1 text-blue-500 font-medium">
                        <Stethoscope className="w-3 h-3" />{t('الطبيب', 'Doctor')}
                      </span>
                    </th>
                    <th className="text-end px-4 py-3 text-xs whitespace-nowrap">
                      <span className="flex items-center justify-end gap-1 text-emerald-500 font-medium">
                        <Building2 className="w-3 h-3" />{t('العيادة', 'Clinic')}
                      </span>
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {settlements.map((s) => {
                    const sessionFees  = s.totalSessionFees  ?? (s.grossRevenue + s.totalSourceFees);
                    const extraSvcs    = s.totalExtraServices ?? 0;
                    const isOpen       = expanded === s.doctorId;
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
                    <td className="px-4 py-3 text-xs text-gray-500 uppercase tracking-wide">{t('الإجمالي', 'Total')}</td>
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
            const extraCost  = tx.procedureCost ?? 0;
            const procName   = tx.procedureId ? (procedureMap.get(tx.procedureId)?.nameEn ?? '—') : '—';
            // netPool = stored grossRevenue (= remaining session fee + extra services)
            const netPool    = tx.grossRevenue;
            const drShare    = tx.doctorShare;
            const clShare    = tx.clinicShare;
            return (
              <tr key={tx.id} className="hover:bg-white dark:hover:bg-neutral-700/20 transition-colors">
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{tx.transactionDate?.slice(0, 10)}</td>
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
                <td className="px-3 py-2 text-end font-mono tabular-nums text-gray-600 dark:text-gray-300">{fmt(netPool)}</td>
                <td className="px-3 py-2 text-end font-mono text-blue-500">{tx.splitDoctorPercentage}%</td>
                <td className="px-3 py-2 text-end font-mono tabular-nums text-blue-700 dark:text-blue-400 font-semibold">{fmt(drShare)}</td>
                <td className="px-3 py-2 text-end font-mono text-emerald-500">{tx.splitClinicPercentage}%</td>
                <td className="px-3 py-2 text-end font-mono tabular-nums text-emerald-700 dark:text-emerald-400 font-semibold">{fmt(clShare)}</td>
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
