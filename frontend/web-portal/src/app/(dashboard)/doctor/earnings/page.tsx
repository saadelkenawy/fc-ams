'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, TrendingUp, Wallet, Banknote, ReceiptText, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatCard } from '@/components/ui/StatCard';
import { Badge } from '@/components/ui/Badge';
import { useLang } from '@/contexts/LanguageContext';
import { formatCurrency, formatDate } from '@/lib/utils';
import { billingApi } from '@/lib/api';
import type { DoctorSettlement } from '@fadl/types';

function getUser() {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem('fadl_user') ?? '{}');
  } catch {
    return {};
  }
}

function getMonthBounds(year: number, month: number) {
  const from = new Date(year, month, 1).toISOString().split('T')[0];
  const to = new Date(year, month + 1, 0).toISOString().split('T')[0]; // last day of month
  return { from, to };
}

const SOURCE_VARIANT_MAP: Record<string, 'info' | 'default' | 'primary'> = {
  VEZ: 'info',
  EKF: 'info',
  DO: 'info',
};

export default function DoctorEarningsPage() {
  const { lang, t } = useLang();
  const locale = lang === 'ar' ? 'ar-EG' : 'en-US';

  const user = getUser();
  const doctorId = user.doctorId as string | undefined;

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed

  const { from, to } = useMemo(() => getMonthBounds(year, month), [year, month]);

  const { data: settlementData, isLoading, isError } = useQuery({
    queryKey: ['doctor-settlement', doctorId, from, to],
    queryFn: async () => {
      const { data } = await billingApi.get<{ data: DoctorSettlement }>('/settlements/doctor', {
        params: { dateFrom: from, dateTo: to },
      });
      return data.data;
    },
    enabled: !!doctorId,
    staleTime: 30_000,
  });

  const settlement = settlementData;
  const transactions = settlement?.transactions ?? [];

  function shiftMonth(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }

  const monthLabel = new Date(year, month, 1).toLocaleString(locale, { month: 'long', year: 'numeric' });

  if (!doctorId) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          {t('هذه الصفحة متاحة للأطباء فقط', 'This page is available for doctors only')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold font-display text-gray-900 dark:text-gray-100">
            {t('أرباحي', 'My Earnings')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {t('ملخص الإيرادات والتسويات', 'Revenue summary and settlements')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Month picker */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => shiftMonth(-1)}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-700 text-gray-500 dark:text-gray-300 transition-colors text-sm"
            >
              {lang === 'ar' ? '›' : '‹'}
            </button>
            <div className="flex items-center gap-2 border border-gray-200 dark:border-neutral-600 rounded-lg px-3 py-1.5">
              <input
                type="month"
                value={`${year}-${String(month + 1).padStart(2, '0')}`}
                onChange={(e) => {
                  const [y, m] = e.target.value.split('-').map(Number);
                  setYear(y);
                  setMonth(m - 1);
                }}
                className="bg-transparent text-sm text-gray-900 dark:text-gray-100 focus:outline-none"
              />
            </div>
            <button
              onClick={() => shiftMonth(1)}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-700 text-gray-500 dark:text-gray-300 transition-colors text-sm"
            >
              {lang === 'ar' ? '‹' : '›'}
            </button>
          </div>

          <Button variant="outline" size="sm">
            <Download className="w-4 h-4" />
            {t('تصدير', 'Export')}
          </Button>
        </div>
      </div>

      {/* Month label */}
      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
        {monthLabel}
        {' '}
        <span className="text-gray-400 dark:text-gray-500 font-normal">
          ({from} — {to})
        </span>
      </p>

      {/* KPI Cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin me-2" />
          {t('جاري التحميل...', 'Loading...')}
        </div>
      ) : isError ? (
        <div className="py-10 text-center text-red-500 dark:text-red-400 text-sm">
          {t('تعذّر تحميل بيانات الأرباح', 'Failed to load earnings data')}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title={t('إجمالي الإيرادات', 'Gross Revenue')}
              value={formatCurrency(settlement?.grossRevenue ?? 0, 'EGP', locale)}
              icon={<TrendingUp className="w-5 h-5" />}
              color="blue"
            />
            <StatCard
              title={t('حصتي', 'Doctor Share')}
              value={formatCurrency(settlement?.doctorShare ?? 0, 'EGP', locale)}
              icon={<Wallet className="w-5 h-5" />}
              color="green"
            />
            <StatCard
              title={t('رسوم المصادر', 'Source Fees')}
              value={formatCurrency(settlement?.totalSourceFees ?? 0, 'EGP', locale)}
              icon={<ReceiptText className="w-5 h-5" />}
              color="amber"
            />
            <StatCard
              title={t('الصافي المستحق', 'Net Payable')}
              value={formatCurrency(settlement?.netPayable ?? 0, 'EGP', locale)}
              icon={<Banknote className="w-5 h-5" />}
              color="violet"
            />
          </div>

          {/* Consultations / Procedures counts */}
          <div className="grid grid-cols-2 gap-4 max-w-sm">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold font-mono text-gray-900 dark:text-gray-100">
                  {settlement?.totalConsultations ?? 0}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t('استشارات', 'Consultations')}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold font-mono text-gray-900 dark:text-gray-100">
                  {settlement?.totalProcedures ?? 0}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t('إجراءات', 'Procedures')}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Transactions Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>{t('تفاصيل المعاملات', 'Transaction Details')}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {transactions.length === 0 ? (
                <div className="py-12 text-center">
                  <ReceiptText className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-400 dark:text-gray-500 text-sm">
                    {t('لا توجد معاملات في هذه الفترة', 'No transactions in this period')}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-50 dark:border-neutral-700 bg-gray-50/50 dark:bg-neutral-900/40">
                        <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('التاريخ', 'Date')}</th>
                        <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('المريض', 'Patient')}</th>
                        <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('المصدر', 'Source')}</th>
                        <th className="text-end px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('الرسوم', 'Charge')}</th>
                        <th className="text-end px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('حصتي', 'My Share')}</th>
                        <th className="text-end px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('رسوم المصدر', 'Source Fee')}</th>
                        <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('الحالة', 'Status')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((tx) => (
                        <tr
                          key={tx.id}
                          className="border-b border-gray-50 dark:border-neutral-700/50 hover:bg-gray-50/50 dark:hover:bg-neutral-700/30 transition-colors"
                        >
                          <td className="px-5 py-3.5 text-gray-500 dark:text-gray-400 text-xs">
                            {formatDate(tx.transactionDate, locale)}
                          </td>
                          <td className="px-5 py-3.5 font-mono text-xs text-gray-600 dark:text-gray-300">
                            #{tx.patientId.slice(-8).toUpperCase()}
                          </td>
                          <td className="px-5 py-3.5">
                            <Badge
                              variant={SOURCE_VARIANT_MAP[tx.patientSource] ?? 'default'}
                              className="text-[10px]"
                            >
                              {tx.patientSource}
                            </Badge>
                          </td>
                          <td className="px-5 py-3.5 text-end font-mono tabular-nums text-gray-900 dark:text-gray-100 font-medium">
                            {formatCurrency(tx.approvedCharge, 'EGP', locale)}
                          </td>
                          <td className="px-5 py-3.5 text-end font-mono tabular-nums text-primary-700 dark:text-primary-400 font-semibold">
                            {formatCurrency(tx.doctorShare, 'EGP', locale)}
                          </td>
                          <td className="px-5 py-3.5 text-end font-mono tabular-nums text-amber-600 dark:text-amber-400">
                            {formatCurrency(tx.sourceFeeAmount, 'EGP', locale)}
                          </td>
                          <td className="px-5 py-3.5">
                            <Badge
                              variant={
                                tx.paymentStatus === 'paid' || tx.paymentStatus === 'reconciled'
                                  ? 'success'
                                  : tx.paymentStatus === 'pending'
                                    ? 'warning'
                                    : 'default'
                              }
                              dot
                            >
                              {tx.paymentStatus}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
