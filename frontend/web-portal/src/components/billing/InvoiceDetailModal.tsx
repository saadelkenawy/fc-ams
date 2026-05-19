'use client';

import { X, Printer, Download, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useLang } from '@/contexts/LanguageContext';
import { formatCurrency } from '@/lib/utils';
import type { FinancialTransaction } from '@fadl/types';

/* ── types ───────────────────────────────────────────────────────────── */

interface Props {
  open: boolean;
  transaction: FinancialTransaction | null;
  patientName?: string;
  doctorName?: string;
  onClose: () => void;
}

/* ── status config ───────────────────────────────────────────────────── */

type BadgeVariant = 'success' | 'warning' | 'danger' | 'purple' | 'info' | 'default';

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  paid:       'success',
  reconciled: 'success',
  pending:    'warning',
  verified:   'info',
  approved:   'info',
  refunded:   'purple',
};

const STATUS_LABEL: Record<string, { ar: string; en: string }> = {
  paid:       { ar: 'مدفوع',    en: 'Paid'       },
  reconciled: { ar: 'مسوَّى',  en: 'Reconciled' },
  pending:    { ar: 'معلق',     en: 'Pending'     },
  verified:   { ar: 'محقَّق',  en: 'Verified'    },
  approved:   { ar: 'معتمد',   en: 'Approved'    },
  refunded:   { ar: 'مسترد',   en: 'Refunded'    },
};

const VISIT_LABEL: Record<string, { ar: string; en: string }> = {
  consultation: { ar: 'كشف وفحص',      en: 'Consultation & Examination' },
  operative:    { ar: 'إجراء عملي',    en: 'Operative Procedure'        },
  online:       { ar: 'استشارة أونلاين', en: 'Online Teleconsult'       },
};

const PAYMENT_LABEL: Record<string, { ar: string; en: string }> = {
  cash:          { ar: 'نقدي',          en: 'Cash'          },
  instapay:      { ar: 'انستاباي',      en: 'InstaPay'      },
  bank_transfer: { ar: 'تحويل بنكي',    en: 'Bank Transfer' },
  vfc_wallet:    { ar: 'محفظة VFC',     en: 'VFC Wallet'    },
  mobile_wallet: { ar: 'محفظة موبايل',  en: 'Mobile Wallet' },
};

/* ── component ───────────────────────────────────────────────────────── */

export function InvoiceDetailModal({ open, transaction: tx, patientName, doctorName, onClose }: Props) {
  const { lang, t } = useLang();
  const locale = lang === 'ar' ? 'ar-EG' : 'en-US';

  if (!open || !tx) return null;

  function handlePrint() {
    document.body.classList.add('printing-invoice');
    window.print();
    document.body.classList.remove('printing-invoice');
  }

  /* line items derived from transaction fields */
  const visitKey  = tx.visitType ?? 'consultation';
  const visitDesc = lang === 'ar'
    ? (VISIT_LABEL[visitKey]?.ar ?? visitKey)
    : (VISIT_LABEL[visitKey]?.en ?? visitKey);

  const items: { desc: string; qty: number; unit: number; total: number }[] = [
    { desc: visitDesc,                                   qty: 1, unit: tx.approvedCharge, total: tx.approvedCharge },
  ];
  if (tx.sourceFeeAmount > 0) {
    items.push({
      desc: lang === 'ar' ? `رسوم مصدر (${tx.patientSource})` : `Source fee (${tx.patientSource})`,
      qty:  1, unit: tx.sourceFeeAmount, total: tx.sourceFeeAmount,
    });
  }

  const subtotal = tx.approvedCharge;
  const vatLabel = `${Math.round((tx.vatRate ?? 0.14) * 100)}%`;

  const shortId = `INV-${tx.id.slice(-8).toUpperCase()}`;
  const payMethod = tx.paymentMethod
    ? (lang === 'ar'
        ? (PAYMENT_LABEL[tx.paymentMethod]?.ar ?? tx.paymentMethod)
        : (PAYMENT_LABEL[tx.paymentMethod]?.en ?? tx.paymentMethod))
    : t('نقدي', 'Cash');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/55"
        style={{ backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />

      {/* panel */}
      <div className="relative bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden border border-gray-100 dark:border-neutral-700">

        {/* toolbar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-neutral-800 flex-shrink-0">
          <h3 className="font-display font-bold text-gray-900 dark:text-gray-100">
            {t('تفاصيل الفاتورة', 'Invoice Details')}
          </h3>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="w-4 h-4" />
              {t('طباعة', 'Print')}
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Download className="w-4 h-4" />
              PDF
            </Button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 p-1 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* scrollable body */}
        <div className="invoice-print-body flex-1 overflow-y-auto p-6">

          {/* clinic + invoice header */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="mb-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/logo-wordmark.png"
                  alt="Fadl Clinic"
                  className="h-9 object-contain"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('شارع التحرير، القاهرة', '12 El-Tahrir St., Cairo')}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-mono" dir="ltr">
                +20 2 2345 6789
              </p>
            </div>

            <div className="text-end">
              <Badge
                variant={STATUS_VARIANT[tx.paymentStatus] ?? 'default'}
                dot
                className="mb-2"
              >
                {lang === 'ar'
                  ? (STATUS_LABEL[tx.paymentStatus]?.ar ?? tx.paymentStatus)
                  : (STATUS_LABEL[tx.paymentStatus]?.en ?? tx.paymentStatus)}
              </Badge>
              <p className="font-mono font-bold text-primary-700 dark:text-primary-400 text-sm">{shortId}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5" dir="ltr">
                {new Date(tx.transactionDate).toLocaleDateString(locale, {
                  year: 'numeric', month: 'short', day: 'numeric',
                })}
              </p>
            </div>
          </div>

          {/* Billed to */}
          <div className="bg-gray-50 dark:bg-neutral-800/50 rounded-xl p-4 mb-5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">
              {t('فاتورة إلى', 'Billed To')}
            </p>
            <p className="font-semibold text-gray-900 dark:text-gray-100">
              {patientName ?? `#${tx.patientId.slice(-8).toUpperCase()}`}
            </p>
            {doctorName && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {t('مع', 'with')} {doctorName}
              </p>
            )}
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {t('مريض · فضل كلينك', 'Patient · Fadl Clinic')}
            </p>
          </div>

          {/* Line items */}
          <table className="w-full text-sm mb-5">
            <thead>
              <tr className="border-b border-gray-200 dark:border-neutral-700">
                <th className="text-start pb-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  {t('الخدمة', 'Service')}
                </th>
                <th className="text-center pb-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  {t('الكمية', 'Qty')}
                </th>
                <th className="text-end pb-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  {t('السعر', 'Price')}
                </th>
                <th className="text-end pb-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  {t('الإجمالي', 'Total')}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i} className="border-b border-gray-100 dark:border-neutral-800">
                  <td className="py-3 text-gray-800 dark:text-gray-200">{item.desc}</td>
                  <td className="py-3 text-center text-gray-500 dark:text-gray-400">{item.qty}</td>
                  <td className="py-3 text-end font-mono text-gray-700 dark:text-gray-300">
                    {formatCurrency(item.unit, 'EGP', locale)}
                  </td>
                  <td className="py-3 text-end font-mono font-medium text-gray-900 dark:text-gray-100">
                    {formatCurrency(item.total, 'EGP', locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="ms-auto max-w-[220px] space-y-2 text-sm mb-5">
            <div className="flex justify-between text-gray-500 dark:text-gray-400">
              <span>{t('المجموع الفرعي', 'Subtotal')}</span>
              <span className="font-mono">{formatCurrency(subtotal, 'EGP', locale)}</span>
            </div>
            <div className="flex justify-between text-gray-500 dark:text-gray-400">
              <span>{t(`ضريبة القيمة المضافة ${vatLabel}`, `VAT ${vatLabel}`)}</span>
              <span className="font-mono text-gray-400 dark:text-gray-500">
                {t('شاملة', 'included')}
              </span>
            </div>
            <div className="flex justify-between font-bold text-gray-900 dark:text-gray-100 text-base pt-2 border-t border-gray-200 dark:border-neutral-700">
              <span>{t('الإجمالي', 'Total')}</span>
              <span className="font-mono">{formatCurrency(subtotal, 'EGP', locale)}</span>
            </div>
          </div>

          {/* Payment method */}
          <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-neutral-800/50 rounded-xl">
            <CreditCard className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('طريقة الدفع', 'Payment method')}
              </p>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{payMethod}</p>
            </div>
          </div>

          {/* Refund note */}
          {tx.isRefund && tx.refundReason && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-950/20 rounded-xl border border-red-100 dark:border-red-900/30">
              <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-0.5">
                {t('مسترد', 'Refunded')}
              </p>
              <p className="text-xs text-red-500 dark:text-red-300">{tx.refundReason}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
