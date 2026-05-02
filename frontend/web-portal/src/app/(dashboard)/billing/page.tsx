'use client';

import { useState } from 'react';
import { Download, Filter, Search, CheckCircle, Clock, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { KpiCard } from '@/components/ui/KpiCard';
import { useLang } from '@/contexts/LanguageContext';
import { formatCurrency, formatDate } from '@/lib/utils';

type PaymentStatus = 'pending' | 'verified' | 'approved' | 'paid' | 'reconciled' | 'refunded';

const STATUS_CONFIG: Record<PaymentStatus, { labelAr: string; labelEn: string; variant: 'warning' | 'info' | 'success' | 'default' | 'danger' | 'primary' }> = {
  pending:    { labelAr: 'معلق',   labelEn: 'Pending',    variant: 'warning' },
  verified:   { labelAr: 'مراجع', labelEn: 'Verified',   variant: 'info' },
  approved:   { labelAr: 'معتمد', labelEn: 'Approved',   variant: 'primary' },
  paid:       { labelAr: 'مدفوع', labelEn: 'Paid',       variant: 'success' },
  reconciled: { labelAr: 'مطابق', labelEn: 'Reconciled', variant: 'default' },
  refunded:   { labelAr: 'مسترد', labelEn: 'Refunded',   variant: 'danger' },
};

const MOCK_TRANSACTIONS = [
  { id: 't1', date: '2026-05-02', patientAr: 'سارة محمود', patientEn: 'Sara Mahmoud', doctorAr: 'د. هدى إبراهيم', doctorEn: 'Dr. Hoda Ibrahim', procedureAr: 'كشف نساء',  procedureEn: 'Gynecology Consult', source: "Cl.'s", approved: 350,  doctorShare: 175,  clinicShare: 175,  status: 'paid'     as PaymentStatus, payMethod: 'cash' },
  { id: 't2', date: '2026-05-02', patientAr: 'أحمد حسن',  patientEn: 'Ahmed Hassan', doctorAr: 'د. خالد رشاد',   doctorEn: 'Dr. Khaled Rashad', procedureAr: 'كشف أطفال', procedureEn: 'Pediatrics Consult', source: 'VEZ',    approved: 200,  doctorShare: 100,  clinicShare: 80,   status: 'pending'  as PaymentStatus, payMethod: 'instapay' },
  { id: 't3', date: '2026-05-02', patientAr: 'منى علي',   patientEn: 'Mona Ali',     doctorAr: 'د. هدى إبراهيم', doctorEn: 'Dr. Hoda Ibrahim', procedureAr: 'سونار',     procedureEn: 'Ultrasound',         source: "Dr.'s", approved: 500,  doctorShare: 400,  clinicShare: 100,  status: 'verified' as PaymentStatus, payMethod: 'instapay' },
  { id: 't4', date: '2026-05-01', patientAr: 'خالد عمر',  patientEn: 'Khaled Omar',  doctorAr: 'د. سامر نور',    doctorEn: 'Dr. Samer Nour',   procedureAr: 'قسطرة قلب', procedureEn: 'Cardiac Catheter',   source: "Cl.'s", approved: 3500, doctorShare: 2800, clinicShare: 700,  status: 'paid'     as PaymentStatus, payMethod: 'bank_transfer' },
  { id: 't5', date: '2026-05-01', patientAr: 'نادية سامي',patientEn: 'Nadia Sami',   doctorAr: 'د. رانيا سعيد',  doctorEn: 'Dr. Rania Said',   procedureAr: 'بوتكس',     procedureEn: 'Botox',              source: 'EKF',   approved: 800,  doctorShare: 560,  clinicShare: 160,  status: 'refunded' as PaymentStatus, payMethod: 'cash' },
];

const TABS = [
  { key: 'transactions', labelAr: 'المعاملات', labelEn: 'Transactions' },
  { key: 'settlements',  labelAr: 'التسويات',  labelEn: 'Settlements' },
];

export default function BillingPage() {
  const { lang, t } = useLang();
  const [activeTab, setActiveTab]     = useState('transactions');
  const [query, setQuery]             = useState('');
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | 'all'>('all');

  const filtered = MOCK_TRANSACTIONS.filter((tx) => {
    const matchesQuery  = (lang === 'ar' ? tx.patientAr : tx.patientEn).toLowerCase().includes(query.toLowerCase()) ||
                          (lang === 'ar' ? tx.doctorAr  : tx.doctorEn).toLowerCase().includes(query.toLowerCase());
    const matchesStatus = statusFilter === 'all' || tx.status === statusFilter;
    return matchesQuery && matchesStatus;
  });

  const totalRevenue     = MOCK_TRANSACTIONS.reduce((s, tx) => s + tx.approved, 0);
  const totalDoctorShare = MOCK_TRANSACTIONS.reduce((s, tx) => s + tx.doctorShare, 0);
  const totalClinicShare = MOCK_TRANSACTIONS.reduce((s, tx) => s + tx.clinicShare, 0);
  const pendingCount     = MOCK_TRANSACTIONS.filter((tx) => tx.status === 'pending').length;

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold font-display text-gray-900 dark:text-gray-100">{t('الفواتير والمالية', 'Billing & Finance')}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-300 mt-0.5">{t('السجل المحاسبي غير القابل للتعديل', 'Immutable financial ledger')}</p>
        </div>
        <Button variant="outline" size="sm">
          <Download className="w-4 h-4" />
          {t('تصدير', 'Export')}
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Total Revenue" titleAr="إجمالي الإيرادات"
          value={formatCurrency(totalRevenue, 'EGP', lang === 'ar' ? 'ar-EG' : 'en-US')}
          icon={<TrendingUp className="w-5 h-5" />} iconBg="bg-primary-50 dark:bg-primary-900/30" lang={lang} featured />
        <KpiCard title="Doctor Share" titleAr="حصة الأطباء"
          value={formatCurrency(totalDoctorShare, 'EGP', lang === 'ar' ? 'ar-EG' : 'en-US')}
          icon={<TrendingUp className="w-5 h-5" />} iconBg="bg-blue-50 dark:bg-blue-900/30" lang={lang} />
        <KpiCard title="Clinic Share" titleAr="حصة العيادة"
          value={formatCurrency(totalClinicShare, 'EGP', lang === 'ar' ? 'ar-EG' : 'en-US')}
          icon={<CheckCircle className="w-5 h-5" />} iconBg="bg-emerald-50 dark:bg-emerald-900/30" lang={lang} />
        <KpiCard title="Pending" titleAr="معلقة"
          value={pendingCount}
          icon={<Clock className="w-5 h-5" />} iconBg="bg-amber-50 dark:bg-amber-900/30" lang={lang} />
      </div>

      {/* Tabs */}
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
              placeholder={t('بحث بالمريض أو الطبيب...', 'Search by patient or doctor...')}
              icon={<Search className="w-4 h-4" />}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="max-w-sm"
              lang={lang}
            />
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="w-4 h-4 text-gray-400" />
              {(['all', 'pending', 'verified', 'paid', 'refunded'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`pill-tab text-xs py-1 ${statusFilter === s ? 'active' : ''}`}
                >
                  {s === 'all' ? t('الكل', 'All') : lang === 'ar' ? STATUS_CONFIG[s]?.labelAr : STATUS_CONFIG[s]?.labelEn}
                </button>
              ))}
            </div>
          </div>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-50 dark:border-neutral-700 bg-gray-50/50 dark:bg-neutral-900/40">
                    <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('التاريخ', 'Date')}</th>
                    <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('المريض', 'Patient')}</th>
                    <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('الطبيب', 'Doctor')}</th>
                    <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('الإجراء', 'Procedure')}</th>
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
                    const cfg = STATUS_CONFIG[tx.status];
                    return (
                      <tr key={tx.id} className="border-b border-gray-50 dark:border-neutral-700/50 hover:bg-gray-50/50 dark:hover:bg-neutral-700/30 transition-colors">
                        <td className="px-5 py-3.5 text-gray-500 dark:text-gray-300 text-xs">{formatDate(tx.date, lang === 'ar' ? 'ar-EG' : 'en-US')}</td>
                        <td className="px-5 py-3.5 font-medium text-gray-900 dark:text-gray-100">{lang === 'ar' ? tx.patientAr : tx.patientEn}</td>
                        <td className="px-5 py-3.5 text-gray-600 dark:text-gray-300">{lang === 'ar' ? tx.doctorAr : tx.doctorEn}</td>
                        <td className="px-5 py-3.5 text-gray-600 dark:text-gray-300">{lang === 'ar' ? tx.procedureAr : tx.procedureEn}</td>
                        <td className="px-5 py-3.5">
                          <Badge variant={['VEZ','EKF','DO'].includes(tx.source) ? 'info' : 'default'} className="text-xs">{tx.source}</Badge>
                        </td>
                        <td className="px-5 py-3.5 text-end font-mono tabular-nums font-medium text-gray-900 dark:text-gray-100">{tx.approved}</td>
                        <td className="px-5 py-3.5 text-end font-mono tabular-nums text-primary-700 dark:text-primary-400">{tx.doctorShare}</td>
                        <td className="px-5 py-3.5 text-end font-mono tabular-nums text-emerald-700 dark:text-emerald-400">{tx.clinicShare}</td>
                        <td className="px-5 py-3.5"><Badge variant={cfg.variant} dot>{lang === 'ar' ? cfg.labelAr : cfg.labelEn}</Badge></td>
                        <td className="px-5 py-3.5 text-gray-500 dark:text-gray-300 text-xs capitalize">{tx.payMethod.replace('_', ' ')}</td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr><td colSpan={10} className="px-5 py-12 text-center text-gray-400 dark:text-gray-300">{t('لا توجد نتائج', 'No results')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'settlements' && <SettlementsTab lang={lang} t={t} />}
    </div>
  );
}

function SettlementsTab({ lang, t }: { lang: 'ar' | 'en'; t: (ar: string, en: string) => string }) {
  const DOCTORS = [
    { id: 'd1', nameAr: 'د. هدى إبراهيم', nameEn: 'Dr. Hoda Ibrahim',  gross: 48_000, share: 24_000, pending: 8_400,  status: 'pending'  as PaymentStatus },
    { id: 'd2', nameAr: 'د. خالد رشاد',   nameEn: 'Dr. Khaled Rashad', gross: 32_000, share: 16_000, pending: 0,       status: 'paid'     as PaymentStatus },
    { id: 'd3', nameAr: 'د. سامر نور',    nameEn: 'Dr. Samer Nour',    gross: 55_000, share: 33_000, pending: 12_600,  status: 'approved' as PaymentStatus },
    { id: 'd4', nameAr: 'د. رانيا سعيد',  nameEn: 'Dr. Rania Said',    gross: 38_000, share: 19_000, pending: 5_700,   status: 'verified' as PaymentStatus },
  ];

  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-50 dark:border-neutral-700 bg-gray-50/50 dark:bg-neutral-900/40">
              <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('الطبيب', 'Doctor')}</th>
              <th className="text-end px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('إجمالي الشهر', 'Gross (Month)')}</th>
              <th className="text-end px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('حصته', 'Dr. Share')}</th>
              <th className="text-end px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('مستحق', 'Pending Payout')}</th>
              <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('الحالة', 'Status')}</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {DOCTORS.map((d) => {
              const cfg = STATUS_CONFIG[d.status];
              return (
                <tr key={d.id} className="border-b border-gray-50 dark:border-neutral-700/50 hover:bg-gray-50/50 dark:hover:bg-neutral-700/30 transition-colors">
                  <td className="px-5 py-3.5 font-medium text-gray-900 dark:text-gray-100">{lang === 'ar' ? d.nameAr : d.nameEn}</td>
                  <td className="px-5 py-3.5 text-end font-mono tabular-nums text-gray-700 dark:text-gray-200">{formatCurrency(d.gross, 'EGP', 'en-US')}</td>
                  <td className="px-5 py-3.5 text-end font-mono tabular-nums text-primary-700 dark:text-primary-400">{formatCurrency(d.share, 'EGP', 'en-US')}</td>
                  <td className="px-5 py-3.5 text-end font-mono tabular-nums font-semibold text-gray-900 dark:text-gray-100">
                    {d.pending > 0
                      ? formatCurrency(d.pending, 'EGP', 'en-US')
                      : <span className="text-emerald-600 dark:text-emerald-400 font-normal text-xs">{t('مسدد', 'Settled')}</span>}
                  </td>
                  <td className="px-5 py-3.5"><Badge variant={cfg.variant} dot>{lang === 'ar' ? cfg.labelAr : cfg.labelEn}</Badge></td>
                  <td className="px-5 py-3.5">
                    {d.pending > 0 && (
                      <Button size="sm" className="h-7 px-3 text-xs">{t('تسوية', 'Settle')}</Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
