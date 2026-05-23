'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Download, Filter, Search, Clock, TrendingUp, Loader2, Check, X, Trash2, ShieldAlert, RotateCcw, FileSpreadsheet, FileText, FileDown, Square, CheckSquare, Minus, BarChart3, ChevronRight } from 'lucide-react';
import * as XLSX from 'xlsx';
import { analyticsApi, appointmentApi, billingApi } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Pagination } from '@/components/ui/Pagination';
import { useLang } from '@/contexts/LanguageContext';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useTransactions, useUpdateTransactionStatus, useBulkDeleteTransactions, useBulkEditPaymentMethod, useSettlements, useReconcileDoctor } from '@/hooks/useBilling';
import { useDoctorMap } from '@/hooks/useDoctors';
import { usePatientMap } from '@/hooks/usePatients';
import { cn } from '@/lib/utils';
import { InvoiceDetailModal } from '@/components/billing/InvoiceDetailModal';
import type { PaymentStatus, FinancialTransaction } from '@fadl/types';

// Simplified status set per spec — verified/approved removed from UI options
const ACTIVE_STATUSES: PaymentStatus[] = ['pending', 'paid', 'refunded', 'reconciled'];
// Statuses that can be manually set from billing page; paid/reconciled are set programmatically only
const SELECTABLE_STATUSES: PaymentStatus[] = ['pending', 'refunded'];

const STATUS_CONFIG: Record<PaymentStatus, { labelAr: string; labelEn: string; variant: 'warning' | 'info' | 'success' | 'default' | 'danger' }> = {
  pending:    { labelAr: 'معلق',   labelEn: 'Pending',    variant: 'warning' },
  verified:   { labelAr: 'مراجع', labelEn: 'Verified',   variant: 'info' },
  approved:   { labelAr: 'معتمد', labelEn: 'Approved',   variant: 'success' },
  paid:       { labelAr: 'مدفوع', labelEn: 'Paid',       variant: 'success' },
  reconciled: { labelAr: 'مطابق', labelEn: 'Reconciled', variant: 'default' },
  refunded:   { labelAr: 'مسترد', labelEn: 'Refunded',   variant: 'danger' },
};

const PAYMENT_METHODS = ['cash', 'visa', 'instapay'];

const PAGE_SIZES = [10, 25, 50];

function StatusDropdown({
  txId, current, lang, onClose,
}: { txId: string; current: PaymentStatus; lang: 'ar' | 'en'; onClose: () => void; }) {
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
      toast(t('تم حفظ حالة الدفع', 'Payment status saved.'), 'success');
    } catch {
      toast(t('لم يُحفظ التغيير. حاول مرة أخرى.', 'Status not saved. Try again.'), 'error');
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
      {!isPending && SELECTABLE_STATUSES.map((s) => {
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
              cfg.variant === 'danger'  ? 'bg-red-500' : 'bg-gray-400',
            )} />
            {lang === 'ar' ? cfg.labelAr : cfg.labelEn}
          </button>
        );
      })}
    </div>
  );
}

// ── Secure Delete Modal (Feature 5) ──────────────────────────────────────

interface SecureDeleteModalProps {
  appointmentId: string;
  onClose: () => void;
  onDeleted: () => void;
}

function SecureDeleteModal({ appointmentId, onClose, onDeleted }: SecureDeleteModalProps) {
  const { lang, t } = useLang();
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [reason,   setReason]   = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleConfirm() {
    setError('');
    if (!password) { setError(t('كلمة المرور مطلوبة', 'Password is required')); return; }
    if (reason.trim().length < 10) { setError(t('السبب يجب أن يكون 10 أحرف على الأقل', 'Reason must be at least 10 characters')); return; }
    setLoading(true);
    try {
      await appointmentApi.delete(`/appointments/${appointmentId}`, { data: { password, reason } });
      toast(t('تم حذف الموعد والفاتورة المرتبطة به', 'Appointment and linked billing record deleted'), 'success');
      onDeleted();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg ?? t('فشل الحذف. تحقق من كلمة المرور.', 'Delete failed. Check your password.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md mx-4 bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
            <ShieldAlert className="w-6 h-6 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t('حذف آمن للموعد', 'Secure Appointment Deletion')}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('هذا الإجراء لا يمكن التراجع عنه', 'This action cannot be undone')}</p>
          </div>
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          {t(
            'سيتم حذف الموعد وسجل الفاتورة المرتبط به نهائياً. يُسجَّل هذا الحذف في سجل المراجعة.',
            'The appointment and its linked billing record will be permanently deleted. This deletion is logged in the audit trail.',
          )}
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
              {t('كلمة مرورك', 'Your password')}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-10 rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="••••••••"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
              {t('سبب الحذف (10 أحرف على الأقل)', 'Reason for deletion (min 10 characters)')}
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
              placeholder={t('أدخل سبباً واضحاً للحذف...', 'Enter a clear reason for deletion...')}
            />
            <p className={cn('text-xs mt-1', reason.trim().length >= 10 ? 'text-gray-400' : 'text-red-400')}>
              {reason.trim().length} / 10 {t('حرف', 'chars')}
            </p>
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-500 mt-3 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>
        )}

        <div className="flex gap-2 mt-5">
          <Button
            className="flex-1 bg-red-600 hover:bg-red-700 text-white border-0"
            disabled={loading}
            onClick={() => void handleConfirm()}
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin me-2 inline" />{t('جاري الحذف...', 'Deleting...')}</>
            ) : (
              <><Trash2 className="w-4 h-4 me-2 inline" />{t('تأكيد الحذف', 'Confirm Delete')}</>
            )}
          </Button>
          <Button variant="ghost" onClick={onClose}>{t('إلغاء', 'Cancel')}</Button>
        </div>
      </div>
    </div>
  );
}

// ── Bulk Delete Modal ─────────────────────────────────────────────────────────

interface BulkDeleteModalProps {
  selected: FinancialTransaction[];
  onClose: () => void;
  onDeleted: () => void;
  lang: 'ar' | 'en';
  t: (ar: string, en: string) => string;
  locale: string;
}

function BulkDeleteModal({ selected, onClose, onDeleted, lang, t, locale }: BulkDeleteModalProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<'confirm' | 'password'>('confirm');
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const bulkDelete = useBulkDeleteTransactions();

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const canProceedConfirm = reason.trim().length >= 20 && typed === 'DELETE';

  async function handlePasswordSubmit() {
    if (!password) { setError(t('كلمة المرور مطلوبة', 'Password is required')); return; }
    if (cooldown > 0) return;
    setError('');
    try {
      await bulkDelete.mutateAsync({ ids: selected.map((tx) => tx.id), reason, password });
      toast(t(`تم حذف ${selected.length} معاملة`, `${selected.length} transactions deleted`), 'success');
      onDeleted();
    } catch (e: unknown) {
      const code = (e as { response?: { data?: { error?: { code?: string; message?: string } } } })?.response?.data?.error?.code;
      const msg  = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      if (code === 'INVALID_CREDENTIALS' || code === 'WRONG_PASSWORD') {
        const attempts = failedAttempts + 1;
        setFailedAttempts(attempts);
        if (attempts >= 3) { setCooldown(60); setError(t('تم قفل الإجراء لمدة 60 ثانية', 'Action locked for 60 seconds')); }
        else { setError(t('كلمة المرور غير صحيحة. حاول مرة أخرى.', 'Incorrect password. Please try again.')); }
      } else {
        setError(msg ?? t('فشل الحذف', 'Delete failed'));
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-neutral-700 bg-red-50 dark:bg-red-900/20">
          <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center flex-shrink-0">
            <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
              {t(`حذف ${selected.length} معاملة`, `Delete ${selected.length} transaction${selected.length !== 1 ? 's' : ''}`)}
            </h3>
            <p className="text-xs text-red-600 dark:text-red-400">{t('هذا الإجراء لا يمكن التراجع عنه', 'This action cannot be undone')}</p>
          </div>
        </div>

        {step === 'confirm' && (
          <div className="px-6 py-5 space-y-4">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {t(
                `أنت على وشك حذف ${selected.length} معاملة نهائياً من السجل المحاسبي.`,
                `You are about to permanently delete ${selected.length} transaction${selected.length !== 1 ? 's' : ''} from the financial ledger.`,
              )}
            </p>

            <div className="max-h-48 overflow-y-auto rounded-xl border border-gray-100 dark:border-neutral-700 text-xs">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-neutral-900/50 sticky top-0">
                  <tr>
                    <th className="text-start px-3 py-2 font-medium text-gray-500">{t('التاريخ', 'Date')}</th>
                    <th className="text-start px-3 py-2 font-medium text-gray-500">{t('الحالة', 'Status')}</th>
                    <th className="text-end px-3 py-2 font-medium text-gray-500">{t('الرسوم', 'Charge')}</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.map((tx) => (
                    <tr key={tx.id} className="border-t border-gray-50 dark:border-neutral-700">
                      <td className="px-3 py-1.5 text-gray-600 dark:text-gray-300">{tx.transactionDate?.slice(0, 10)}</td>
                      <td className="px-3 py-1.5 text-gray-600 dark:text-gray-300">{tx.paymentStatus}</td>
                      <td className="px-3 py-1.5 text-end font-mono text-gray-900 dark:text-gray-100">{formatCurrency(tx.approvedCharge, 'EGP', locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                {t('سبب الحذف (20 حرف على الأقل)', 'Reason for deletion (min 20 characters)')}
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
                placeholder={t('أدخل سبباً واضحاً للحذف...', 'Enter a clear reason for deletion...')}
              />
              <p className={cn('text-xs mt-1', reason.trim().length >= 20 ? 'text-gray-400' : 'text-red-400')}>
                {reason.trim().length} / 20
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                {t('اكتب DELETE للتأكيد', 'Type DELETE to confirm')}
              </label>
              <input
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                className="w-full h-10 rounded-lg border border-red-300 dark:border-red-700 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100 px-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                placeholder="DELETE"
              />
            </div>

            <div className="flex gap-2">
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700 text-white border-0"
                disabled={!canProceedConfirm}
                onClick={() => setStep('password')}
              >
                {t('متابعة', 'Proceed')}
              </Button>
              <Button variant="ghost" onClick={onClose}>{t('إلغاء', 'Cancel')}</Button>
            </div>
          </div>
        )}

        {step === 'password' && (
          <div className="px-6 py-5 space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {t('أدخل كلمة مرور المسؤول للمتابعة', 'Enter admin password to proceed')}
            </p>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                {t('كلمة المرور', 'Password')}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={cooldown > 0}
                className="w-full h-10 rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="••••••••"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') void handlePasswordSubmit(); }}
              />
            </div>
            {error && (
              <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
                {error}{cooldown > 0 && ` (${cooldown}s)`}
              </p>
            )}
            <div className="flex gap-2">
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700 text-white border-0"
                disabled={!password || bulkDelete.isLoading || cooldown > 0}
                onClick={() => void handlePasswordSubmit()}
              >
                {bulkDelete.isLoading
                  ? <><Loader2 className="w-4 h-4 animate-spin me-2 inline" />{t('جاري الحذف...', 'Deleting...')}</>
                  : <><Trash2 className="w-4 h-4 me-2 inline" />{t('تأكيد الحذف', 'Confirm Delete')}</>}
              </Button>
              <Button variant="ghost" onClick={() => setStep('confirm')}>{t('رجوع', 'Back')}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Bulk Edit Modal ───────────────────────────────────────────────────────────

interface BulkEditModalProps {
  selected: FinancialTransaction[];
  onClose: () => void;
  onEdited: () => void;
  lang: 'ar' | 'en';
  t: (ar: string, en: string) => string;
}

function BulkEditModal({ selected, onClose, onEdited, lang, t }: BulkEditModalProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<'edit' | 'password'>('edit');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const bulkEdit = useBulkEditPaymentMethod();

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const canProceed = paymentMethod !== '' && reason.trim().length >= 10;

  async function handlePasswordSubmit() {
    if (!password) { setError(t('كلمة المرور مطلوبة', 'Password is required')); return; }
    if (cooldown > 0) return;
    setError('');
    try {
      await bulkEdit.mutateAsync({ ids: selected.map((tx) => tx.id), paymentMethod, reason, password });
      toast(t(`تم تحديث ${selected.length} معاملة`, `${selected.length} transactions updated`), 'success');
      onEdited();
    } catch (e: unknown) {
      const code = (e as { response?: { data?: { error?: { code?: string; message?: string } } } })?.response?.data?.error?.code;
      const msg  = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      if (code === 'INVALID_CREDENTIALS' || code === 'WRONG_PASSWORD') {
        const attempts = failedAttempts + 1;
        setFailedAttempts(attempts);
        if (attempts >= 3) { setCooldown(60); setError(t('تم قفل الإجراء لمدة 60 ثانية', 'Action locked for 60 seconds')); }
        else { setError(t('كلمة المرور غير صحيحة. حاول مرة أخرى.', 'Incorrect password. Please try again.')); }
      } else {
        setError(msg ?? t('فشل التحديث', 'Update failed'));
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-neutral-700">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
            {t(`تعديل ${selected.length} معاملة`, `Edit ${selected.length} transaction${selected.length !== 1 ? 's' : ''}`)}
          </h3>
        </div>

        {step === 'edit' && (
          <div className="px-6 py-5 space-y-4">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('ستُطبَّق التغييرات على جميع المعاملات المحددة.', `Changes will apply to all ${selected.length} selected transactions.`)}
            </p>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                {t('طريقة الدفع', 'Payment Method')}
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full h-10 rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">{t('اختر طريقة الدفع', 'Select payment method')}</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                {t('سبب التعديل (10 أحرف على الأقل)', 'Reason for edit (min 10 characters)')}
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                placeholder={t('أدخل سببًا واضحًا للتعديل...', 'Enter a clear reason for the edit...')}
              />
              <p className={cn('text-xs mt-1', reason.trim().length >= 10 ? 'text-gray-400' : 'text-red-400')}>
                {reason.trim().length} / 10
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                className="flex-1"
                disabled={!canProceed}
                onClick={() => setStep('password')}
              >
                {t('متابعة', 'Proceed')}
              </Button>
              <Button variant="ghost" onClick={onClose}>{t('إلغاء', 'Cancel')}</Button>
            </div>
          </div>
        )}

        {step === 'password' && (
          <div className="px-6 py-5 space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {t('أدخل كلمة مرور المسؤول للمتابعة', 'Enter admin password to proceed')}
            </p>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                {t('كلمة المرور', 'Password')}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={cooldown > 0}
                className="w-full h-10 rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="••••••••"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') void handlePasswordSubmit(); }}
              />
            </div>
            {error && (
              <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
                {error}{cooldown > 0 && ` (${cooldown}s)`}
              </p>
            )}
            <div className="flex gap-2">
              <Button
                className="flex-1"
                disabled={!password || bulkEdit.isLoading || cooldown > 0}
                onClick={() => void handlePasswordSubmit()}
              >
                {bulkEdit.isLoading
                  ? <><Loader2 className="w-4 h-4 animate-spin me-2 inline" />{t('جاري التحديث...', 'Updating...')}</>
                  : <><Check className="w-4 h-4 me-2 inline" />{t('تأكيد التعديل', 'Confirm Edit')}</>}
              </Button>
              <Button variant="ghost" onClick={() => setStep('edit')}>{t('رجوع', 'Back')}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Reconcile Modal ────────────────────────────────────────────────────────

interface ReconcileModalProps {
  doctorId: string;
  doctorName: string;
  from: string;
  to: string;
  totalConsultations: number;
  netPayable: number;
  onClose: () => void;
  onDone: () => void;
}

function ReconcileModal({ doctorId, doctorName, from, to, totalConsultations, netPayable, onClose, onDone }: ReconcileModalProps) {
  const { lang, t } = useLang();
  const { toast } = useToast();
  const { mutateAsync, isLoading } = useReconcileDoctor();
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [notes, setNotes] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function handleConfirm() {
    setError('');
    if (!password) { setError(t('كلمة المرور مطلوبة', 'Password is required')); return; }
    try {
      await mutateAsync({ doctorId, from, to, paymentMethod, paymentReference: paymentReference || undefined, notes: notes || undefined, password });
      toast(t('تمت التسوية بنجاح', 'Settlement completed successfully'), 'success');
      onDone();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg ?? t('فشلت التسوية. تحقق من كلمة المرور.', 'Settlement failed. Check your password.'));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md mx-4 bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
            <Check className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t('تسوية الطبيب', 'Settle Doctor')}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{doctorName}</p>
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-neutral-700/50 rounded-xl p-4 mb-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">{t('الفترة', 'Period')}</p>
            <p className="font-medium text-gray-800 dark:text-gray-200">{from} → {to}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">{t('الاستشارات', 'Consultations')}</p>
            <p className="font-medium text-gray-800 dark:text-gray-200">{totalConsultations}</p>
          </div>
          <div className="col-span-2">
            <p className="text-xs text-gray-400 mb-0.5">{t('المستحق للطبيب', 'Net Payable')}</p>
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(netPayable)}</p>
          </div>
        </div>

        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{t('طريقة الدفع', 'Payment Method')}</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full h-10 rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="cash">{t('نقداً', 'Cash')}</option>
              <option value="bank">{t('تحويل بنكي', 'Bank Transfer')}</option>
              <option value="cheque">{t('شيك', 'Cheque')}</option>
              <option value="transfer">InstaPay / {t('تحويل', 'Transfer')}</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{t('رقم المرجع (اختياري)', 'Reference # (optional)')}</label>
            <input
              type="text"
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
              className="w-full h-10 rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder={t('رقم الشيك / رقم التحويل', 'Cheque # / transfer ref')}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{t('ملاحظات (اختياري)', 'Notes (optional)')}</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full h-10 rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{t('كلمة مرورك', 'Your password')}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-10 rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="••••••••"
              autoFocus
            />
          </div>
        </div>

        {error && <p className="text-red-500 text-xs mb-3">{error}</p>}

        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>{t('إلغاء', 'Cancel')}</Button>
          <Button
            variant="primary"
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => void handleConfirm()}
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : t('تأكيد التسوية', 'Confirm Settlement')}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const { lang, t } = useLang();
  const router = useRouter();
  const searchParams = useSearchParams();
  const deleteApptId    = searchParams.get('deleteApptId');
  const highlightApptId = searchParams.get('highlightApptId');
  const locale = lang === 'ar' ? 'ar-EG' : 'en-US';
  const { toast } = useToast();

  const [query, setQuery]                   = useState('');
  const [statusFilter, setStatusFilter]     = useState<PaymentStatus | 'all'>('all');
  const [methodFilter, setMethodFilter]     = useState<string>('');
  const [dateFrom, setDateFrom]             = useState('');
  const [dateTo, setDateTo]                 = useState('');
  const [dateError, setDateError]           = useState('');
  const [page, setPage]                     = useState(1);
  const [limit, setLimit]                   = useState(10);
  const [openDropdown, setOpenDropdown]     = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [exportLoading, setExportLoading]   = useState(false);
  const [selectedIds, setSelectedIds]       = useState<Set<string>>(new Set());
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [showBulkEdit, setShowBulkEdit]     = useState(false);
  const [detailTx, setDetailTx]             = useState<FinancialTransaction | null>(null);

  // Doctor Settlements section state
  const today = new Date().toISOString().split('T')[0];
  const [settlFrom, setSettlFrom] = useState(today);
  const [settlTo, setSettlTo]     = useState(today);
  const [reconcileTarget, setReconcileTarget] = useState<{ doctorId: string; doctorName: string; totalConsultations: number; netPayable: number } | null>(null);

  // Auto-open secure delete modal and scroll to highlighted row
  useEffect(() => {
    if (deleteApptId) {
      setShowDeleteModal(true);
      setTimeout(() => {
        document.getElementById('delete-target-row')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 400);
    }
  }, [deleteApptId]);

  // Scroll to and blink the charge-updated row
  useEffect(() => {
    if (!highlightApptId) return;
    setTimeout(() => {
      const el = document.getElementById('charge-highlight-row');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('billing-charge-blink');
        setTimeout(() => el.classList.remove('billing-charge-blink'), 3000);
      }
    }, 400);
  }, [highlightApptId]);

  // Clear selection when filters change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [statusFilter, methodFilter, dateFrom, dateTo, query, page]);

  const validDates = !dateFrom || !dateTo || dateFrom <= dateTo;

  const { data, isLoading, isError } = useTransactions({
    status:   statusFilter === 'all' ? undefined : statusFilter,
    dateFrom: (validDates && dateFrom) ? dateFrom : undefined,
    dateTo:   (validDates && dateTo)   ? dateTo   : undefined,
    page,
    limit,
  });
  const transactions = data?.data ?? [];
  const total        = data?.total ?? 0;
  const doctorMap    = useDoctorMap();
  const patientMap   = usePatientMap();

  const { data: settlData, isLoading: settlLoading, refetch: refetchSettlements } = useSettlements({
    from: settlFrom, to: settlTo, unsettledOnly: true,
  });

  const filtered = useMemo(() => transactions.filter((tx) => {
    if (methodFilter && tx.paymentMethod !== methodFilter) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    const doc = tx.doctorId ? doctorMap.get(tx.doctorId) : null;
    const pat = patientMap.get(tx.patientId);
    const docName = doc ? (lang === 'ar' ? (doc.nameAr ?? doc.nameEn) : doc.nameEn).toLowerCase() : '';
    const patName = pat ? ((pat.nameAr ?? pat.nameEn ?? '')).toLowerCase() : '';
    return docName.includes(q) || patName.includes(q);
  }), [transactions, query, methodFilter, doctorMap, patientMap, lang]);

  // KPIs computed from filtered view
  const kpiRevenue   = useMemo(() => filtered.filter((tx) => tx.paymentStatus === 'paid').reduce((s, tx) => s + tx.approvedCharge, 0), [filtered]);
  const kpiTotal     = filtered.length;
  const kpiPending   = useMemo(() => filtered.filter((tx) => tx.paymentStatus === 'pending').reduce((s, tx) => s + tx.approvedCharge, 0), [filtered]);
  const kpiRefunded  = useMemo(() => filtered.filter((tx) => tx.paymentStatus === 'refunded').reduce((s, tx) => s + tx.approvedCharge, 0), [filtered]);

  const CIRC = 301.59;
  const methodTotals = useMemo(() => {
    const totals = { cash: 0, visa: 0, instapay: 0 };
    let total = 0;
    filtered.forEach((tx) => {
      const m = tx.paymentMethod ?? '';
      if (m === 'cash') totals.cash += tx.approvedCharge;
      else if (m === 'visa') totals.visa += tx.approvedCharge;
      else if (m === 'instapay') totals.instapay += tx.approvedCharge;
      total += tx.approvedCharge;
    });
    return { totals, total };
  }, [filtered]);
  const visaPct     = methodTotals.total > 0 ? methodTotals.totals.visa / methodTotals.total : 0;
  const cashPct     = methodTotals.total > 0 ? methodTotals.totals.cash / methodTotals.total : 0;
  const instapayPct = methodTotals.total > 0 ? methodTotals.totals.instapay / methodTotals.total : 0;

  const hasActiveFilters = statusFilter !== 'all' || methodFilter || dateFrom || dateTo || query;

  // Selection helpers
  const selectableIds = filtered.map((tx) => tx.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));
  const someSelected = selectableIds.some((id) => selectedIds.has(id));
  const selectedTxs = filtered.filter((tx) => selectedIds.has(tx.id));
  const hasNonPending = selectedTxs.some((tx) => tx.paymentStatus !== 'pending');

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableIds));
    }
  }

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearFilters() {
    setStatusFilter('all');
    setMethodFilter('');
    setDateFrom('');
    setDateTo('');
    setDateError('');
    setQuery('');
    setPage(1);
  }

  function handleDateFrom(v: string) {
    setDateFrom(v);
    setDateError('');
    if (v && dateTo && v > dateTo) setDateError(t('تاريخ البداية يجب أن يكون قبل تاريخ النهاية', '"From" date must be before "To" date'));
    setPage(1);
  }
  function handleDateTo(v: string) {
    setDateTo(v);
    setDateError('');
    if (dateFrom && v && dateFrom > v) setDateError(t('تاريخ البداية يجب أن يكون قبل تاريخ النهاية', '"From" date must be before "To" date'));
    setPage(1);
  }

  async function downloadPdf(endpoint: string, filename: string) {
    setExportLoading(true);
    try {
      const res = await analyticsApi.get(endpoint, { responseType: 'blob', timeout: 30_000 });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast(t('فشل تحميل ملف PDF. تحقق من خدمة التقارير.', 'PDF download failed. Check the reports service.'), 'error');
    } finally {
      setExportLoading(false);
    }
  }

  async function downloadRowPdf(txId: string, shortId: string) {
    try {
      const res = await analyticsApi.get(`/reports/invoice/${txId}`, { responseType: 'blob', timeout: 30_000 });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url; a.download = `invoice-${shortId}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast(t('فشل تحميل الفاتورة', 'Invoice download failed'), 'error');
    }
  }

  async function exportAllXlsx() {
    setExportLoading(true);
    try {
      const res = await billingApi.get('/transactions', { params: { limit: 9999 }, timeout: 30_000 });
      const allTxns: FinancialTransaction[] = (res.data as { data?: FinancialTransaction[] }).data ?? [];
      if (!allTxns.length) { toast(t('لا توجد بيانات للتصدير', 'No data to export'), 'error'); return; }
      const rows = allTxns.map((tx) => {
        const doc = tx.doctorId ? doctorMap.get(tx.doctorId) : null;
        const pat = patientMap.get(tx.patientId);
        return {
          Date:           tx.transactionDate?.slice(0, 10) ?? '',
          Patient:        pat ? (pat.nameEn ?? pat.nameAr ?? '') : tx.patientId.slice(0, 8),
          Doctor:         doc ? (doc.nameEn ?? doc.nameAr ?? '') : (tx.doctorId?.slice(0, 8) ?? ''),
          Source:         tx.patientSource,
          Charge:         tx.approvedCharge,
          'Dr. Share':    tx.doctorShare,
          'Clinic Share': tx.clinicShare,
          Status:         tx.paymentStatus,
          Payment:        tx.paymentMethod ?? '',
        };
      });
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'All Transactions');
      const today = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `billing_all_${today}.xlsx`);
    } catch {
      toast(t('فشل التصدير', 'Export failed'), 'error');
    } finally {
      setExportLoading(false);
    }
  }

  function exportXlsx() {
    if (!filtered.length) { toast(t('لا توجد بيانات للتصدير', 'No data to export'), 'error'); return; }
    setExportLoading(true);
    try {
      const rows = filtered.map((tx) => {
        const doc = tx.doctorId ? doctorMap.get(tx.doctorId) : null;
        const pat = patientMap.get(tx.patientId);
        return {
          Date:          tx.transactionDate?.slice(0, 10) ?? '',
          Patient:       pat ? (pat.nameEn ?? pat.nameAr ?? '') : tx.patientId.slice(0, 8),
          Doctor:        doc ? (doc.nameEn ?? doc.nameAr ?? '') : (tx.doctorId?.slice(0, 8) ?? ''),
          Source:        tx.patientSource,
          Charge:        tx.approvedCharge,
          'Dr. Share':   tx.doctorShare,
          'Clinic Share':tx.clinicShare,
          Status:        tx.paymentStatus,
          Payment:       tx.paymentMethod ?? '',
        };
      });
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
      const today = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `billing_export_${today}.xlsx`);
    } finally {
      setExportLoading(false);
    }
  }

  function handlePageChange(p: number) { setPage(p); }
  function handleLimitChange(l: number) { setLimit(l); setPage(1); }
  function handleStatusFilter(s: PaymentStatus | 'all') { setStatusFilter(s); setPage(1); }
  function handleSearch(q: string) { setQuery(q); setPage(1); }

  return (
    <div className="fc-page">
      <div className="fc-page-head">
        <div>
          <h2 className="fc-page-title">{t('الفواتير والمالية', 'Billing & Finance')}</h2>
          <p className="fc-page-sub">{t('السجل المحاسبي غير القابل للتعديل', 'Immutable financial ledger')}</p>
        </div>
        <div className="fc-page-actions">
          <Button
            variant="outline" size="sm"
            disabled={exportLoading || !filtered.length}
            onClick={() => exportXlsx()}
            title={t('تصدير العرض الحالي إلى Excel', 'Export current view to Excel')}
          >
            {exportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
            {t('Excel', 'Excel')}
          </Button>
          <Button
            variant="outline" size="sm"
            disabled={exportLoading}
            onClick={() => void exportAllXlsx()}
            title={t('تصدير كل المعاملات إلى Excel', 'Export all transactions to Excel')}
          >
            {exportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
            {t('Excel الكل', 'All Excel')}
          </Button>
          <Button variant="outline" size="sm" disabled={exportLoading} onClick={() => void downloadPdf('/reports/settlement', 'settlement-report.pdf')}>
            {exportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            {t('تقرير PDF', 'Settlement PDF')}
          </Button>
          <Button variant="outline" size="sm" disabled={exportLoading} onClick={() => void downloadPdf('/reports/financial-summary', `billing_all_${new Date().toISOString().split('T')[0]}.pdf`)}>
            {exportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {t('ملخص PDF', 'Summary PDF')}
          </Button>
        </div>
      </div>

      {/* KPI row — DS fc-bill-* */}
      <div className="fc-bill-kpi-row">
        {/* Revenue hero tile */}
        <div className="fc-bill-revenue">
          <div className="fc-bill-revenue-eyebrow">
            <TrendingUp className="w-3.5 h-3.5" /> {t('إجمالي الإيرادات المدفوعة', 'Total Revenue (Paid)')}
          </div>
          <div className="fc-bill-revenue-val">
            EGP {Math.floor(kpiRevenue).toLocaleString()}<span>.00</span>
          </div>
          <div className="fc-bill-revenue-trend">
            <span className="fc-kpi-delta is-up">
              <TrendingUp className="w-3 h-3" strokeWidth={2.4} /> {kpiTotal}
            </span>
            <span className="fc-bill-revenue-vs">
              {t('فاتورة', 'invoices')} · {t('معلق', 'pending')} {formatCurrency(kpiPending, 'EGP', locale)}
            </span>
          </div>
          <svg viewBox="0 0 320 60" width="100%" height="60" className="fc-bill-revenue-chart">
            {[4,5,6,4,7,5,8,6,5,7,6,8,9,7,6,8,5,9,7,6,8,7,9,6,8,9,7,5,8,10].map((v, i) => (
              <rect key={i} x={i * 10.6} y={60 - v * 5.5} width="8" height={v * 5.5} rx="2"
                fill={i === 29 ? 'white' : 'rgba(255,255,255,0.30)'} />
            ))}
          </svg>
        </div>

        {/* Payment split tile */}
        <div className="fc-bill-split">
          <div className="fc-bill-split-head">
            <BarChart3 className="w-3.5 h-3.5" />
            <span>{t('طرق الدفع', 'Payment methods')}</span>
            <span className="fc-bill-split-total">{formatCurrency(kpiRevenue, 'EGP', locale)}</span>
          </div>
          <div className="fc-bill-split-body">
            <svg viewBox="0 0 120 120" width="120" height="120">
              <g transform="translate(60,60)">
                <circle r="48" fill="none" stroke="#F3F4F6" strokeWidth="16" />
                <circle r="48" fill="none" stroke="#3B82F6" strokeWidth="16"
                  strokeDasharray={`${visaPct * CIRC} ${CIRC}`}
                  transform="rotate(-90)" />
                <circle r="48" fill="none" stroke="#10B981" strokeWidth="16"
                  strokeDasharray={`${cashPct * CIRC} ${CIRC}`}
                  strokeDashoffset={`${-(visaPct * CIRC)}`}
                  transform="rotate(-90)" />
                <circle r="48" fill="none" stroke="#8B5CF6" strokeWidth="16"
                  strokeDasharray={`${instapayPct * CIRC} ${CIRC}`}
                  strokeDashoffset={`${-((visaPct + cashPct) * CIRC)}`}
                  transform="rotate(-90)" />
                <text textAnchor="middle" dy="3" fontFamily="Outfit" fontWeight="700" fontSize="20" fill="currentColor">{kpiTotal}</text>
                <text textAnchor="middle" dy="18" fontFamily="Manrope" fontWeight="500" fontSize="9" fill="#94A3B8">
                  {lang === 'ar' ? 'فاتورة' : 'INVOICES'}
                </text>
              </g>
            </svg>
            <div className="fc-bill-split-legend">
              <div className="fc-bill-leg-row">
                <span className="fc-bill-leg-dot" style={{ background: '#3B82F6' }} />
                {t('كارت', 'Card')}
                <span className="fc-bill-leg-val">{Math.round(visaPct * 100)}%</span>
              </div>
              <div className="fc-bill-leg-row">
                <span className="fc-bill-leg-dot" style={{ background: '#10B981' }} />
                {t('كاش', 'Cash')}
                <span className="fc-bill-leg-val">{Math.round(cashPct * 100)}%</span>
              </div>
              <div className="fc-bill-leg-row">
                <span className="fc-bill-leg-dot" style={{ background: '#8B5CF6' }} />
                Instapay
                <span className="fc-bill-leg-val">{Math.round(instapayPct * 100)}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Outstanding tile */}
        <div className="fc-bill-outstanding">
          <div className="fc-bill-out-head">
            <Clock className="w-3.5 h-3.5" /> {t('المبالغ المعلقة', 'Outstanding')}
          </div>
          <div className="fc-bill-out-val">{formatCurrency(kpiPending, 'EGP', locale)}</div>
          <div className="fc-bill-out-sub">
            {filtered.filter((tx) => tx.paymentStatus === 'pending').length} {t('فاتورة غير مدفوعة', 'unpaid invoices')}
            {kpiRefunded > 0 && <> · {formatCurrency(kpiRefunded, 'EGP', locale)} {t('مسترد', 'refunded')}</>}
          </div>
          <button className="fc-bill-out-cta" onClick={() => handleStatusFilter('pending')}>
            {t('عرض المعلق', 'View pending')} <ChevronRight className="w-3 h-3" strokeWidth={2.4} />
          </button>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-100 dark:bg-neutral-700 border border-gray-200 dark:border-neutral-600 flex-wrap">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200 flex-1 min-w-max">
            {selectedIds.size} {t('معاملة محددة', 'transaction' + (selectedIds.size !== 1 ? 's' : '') + ' selected')}
          </span>
          {hasNonPending && (
            <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1 rounded-lg">
              {t('يمكن حذف المعاملات المعلقة فقط. أزل غير المعلقة للمتابعة.', 'Only pending transactions can be deleted. Deselect non-pending ones to proceed.')}
            </span>
          )}
          <Button size="sm" variant="outline" onClick={() => setShowBulkEdit(true)}>
            {t('تعديل', 'Edit')}
          </Button>
          <Button
            size="sm"
            className="bg-red-600 hover:bg-red-700 text-white border-0 disabled:opacity-50"
            disabled={hasNonPending}
            onClick={() => !hasNonPending && setShowBulkDelete(true)}
            title={hasNonPending ? t('يمكن حذف المعاملات المعلقة فقط', 'Only pending transactions can be deleted') : undefined}
          >
            <Trash2 className="w-3.5 h-3.5 me-1.5 inline" />
            {t('حذف', 'Delete')}
          </Button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <Card>
          {/* Search + filters */}
          <div className="p-5 border-b border-gray-50 dark:border-neutral-700 space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                placeholder={t('بحث بالطبيب أو المريض...', 'Search by doctor or patient...')}
                icon={<Search className="w-4 h-4" />}
                value={query}
                onChange={(e) => handleSearch(e.target.value)}
                className="max-w-sm"
                lang={lang}
              />
              {hasActiveFilters && (
                <button onClick={clearFilters} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-500 transition-colors">
                  <RotateCcw className="w-3.5 h-3.5" />
                  {t('مسح الفلاتر', 'Clear filters')}
                </button>
              )}
            </div>

            {/* Date range + method */}
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">{t('من', 'From')}</label>
                <input type="date" value={dateFrom} onChange={(e) => handleDateFrom(e.target.value)}
                  className="text-sm border border-gray-200 dark:border-neutral-600 rounded-lg px-3 py-1.5 bg-white dark:bg-neutral-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-600" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">{t('إلى', 'To')}</label>
                <input type="date" value={dateTo} onChange={(e) => handleDateTo(e.target.value)}
                  className="text-sm border border-gray-200 dark:border-neutral-600 rounded-lg px-3 py-1.5 bg-white dark:bg-neutral-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-600" />
              </div>
              <select
                value={methodFilter}
                onChange={(e) => { setMethodFilter(e.target.value); setPage(1); }}
                className="text-sm border border-gray-200 dark:border-neutral-600 rounded-lg px-3 py-1.5 bg-white dark:bg-neutral-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-600"
              >
                <option value="">{t('كل طرق الدفع', 'All payment methods')}</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>
                ))}
              </select>
            </div>
            {dateError && <p className="text-xs text-red-500">{dateError}</p>}

            {/* Active filter chips */}
            {hasActiveFilters && (
              <div className="flex flex-wrap gap-1.5">
                {statusFilter !== 'all' && (
                  <span className="inline-flex items-center gap-1 text-xs bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 px-2.5 py-0.5 rounded-full">
                    {lang === 'ar' ? STATUS_CONFIG[statusFilter]?.labelAr : STATUS_CONFIG[statusFilter]?.labelEn}
                    <button onClick={() => { setStatusFilter('all'); setPage(1); }}><X className="w-3 h-3" /></button>
                  </span>
                )}
                {methodFilter && (
                  <span className="inline-flex items-center gap-1 text-xs bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 px-2.5 py-0.5 rounded-full">
                    {methodFilter}
                    <button onClick={() => { setMethodFilter(''); setPage(1); }}><X className="w-3 h-3" /></button>
                  </span>
                )}
                {dateFrom && (
                  <span className="inline-flex items-center gap-1 text-xs bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 px-2.5 py-0.5 rounded-full">
                    {t('من', 'From')} {dateFrom}
                    <button onClick={() => { setDateFrom(''); setDateError(''); setPage(1); }}><X className="w-3 h-3" /></button>
                  </span>
                )}
                {dateTo && (
                  <span className="inline-flex items-center gap-1 text-xs bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 px-2.5 py-0.5 rounded-full">
                    {t('إلى', 'To')} {dateTo}
                    <button onClick={() => { setDateTo(''); setDateError(''); setPage(1); }}><X className="w-3 h-3" /></button>
                  </span>
                )}
              </div>
            )}

            {/* Status filter pills */}
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="w-4 h-4 text-gray-400" />
              {(['all', ...ACTIVE_STATUSES] as const).map((s) => (
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
                      <th className="w-10 px-3 py-3">
                        <button
                          onClick={toggleAll}
                          className="flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                          title={allSelected ? t('إلغاء تحديد الكل', 'Deselect all') : t('تحديد الكل', 'Select all')}
                        >
                          {allSelected ? (
                            <CheckSquare className="w-4 h-4 text-primary-600" />
                          ) : someSelected ? (
                            <Minus className="w-4 h-4 text-primary-600" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </th>
                      <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('التاريخ', 'Date')}</th>
                      <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('المريض', 'Patient')}</th>
                      <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('الطبيب', 'Doctor')}</th>
                      <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('المصدر', 'Source')}</th>
                      <th className="text-end px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('الرسوم', 'Charge')}</th>
                      <th className="text-end px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('حصة الطبيب', 'Dr. Share')}</th>
                      <th className="text-end px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('حصة العيادة', 'Clinic')}</th>
                      <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('الحالة', 'Status')}</th>
                      <th className="text-start px-5 py-3 font-medium text-gray-500 dark:text-gray-300 text-xs">{t('الدفع', 'Payment')}</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((tx) => {
                      const cfg = STATUS_CONFIG[tx.paymentStatus];
                      const doc = tx.doctorId ? doctorMap.get(tx.doctorId) : null;
                      const pat = patientMap.get(tx.patientId);
                      const patName = pat ? (lang === 'ar' ? (pat.nameAr ?? pat.nameEn) : pat.nameEn) : `…${tx.patientId.slice(-8).toUpperCase()}`;
                      const docName = doc ? (lang === 'ar' ? (doc.nameAr ?? doc.nameEn) : doc.nameEn) : (tx.doctorId ? `…${tx.doctorId.slice(-8).toUpperCase()}` : '—');
                      const isDeleteTarget    = deleteApptId    && tx.appointmentId === deleteApptId;
                      const isChargeHighlight = highlightApptId && tx.appointmentId === highlightApptId;
                      const isSelected = selectedIds.has(tx.id);
                      return (
                        <tr
                          key={tx.id}
                          id={isDeleteTarget ? 'delete-target-row' : isChargeHighlight ? 'charge-highlight-row' : undefined}
                          className={cn(
                            'border-b transition-colors',
                            isDeleteTarget
                              ? 'border-2 border-red-400 dark:border-red-500 bg-red-50 dark:bg-red-900/15'
                              : isChargeHighlight
                                ? 'border-2 border-amber-400 dark:border-amber-500 bg-amber-50 dark:bg-amber-900/15'
                                : isSelected
                                  ? 'border-primary-100 dark:border-primary-800/40 bg-primary-50/60 dark:bg-primary-900/15'
                                  : 'border-gray-50 dark:border-neutral-700/50 hover:bg-gray-50/50 dark:hover:bg-neutral-700/30',
                          )}
                        >
                          <td className="w-10 px-3 py-3.5">
                            <button
                              onClick={() => toggleRow(tx.id)}
                              className="flex items-center justify-center text-gray-300 hover:text-gray-500 dark:hover:text-gray-200 transition-colors"
                            >
                              {isSelected
                                ? <CheckSquare className="w-4 h-4 text-primary-600" />
                                : <Square className="w-4 h-4" />}
                            </button>
                          </td>
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
                              {tx.paymentStatus === 'reconciled' || tx.paymentStatus === 'refunded' ? (
                                <Badge variant={cfg?.variant ?? 'default'} dot>
                                  {lang === 'ar' ? cfg?.labelAr : cfg?.labelEn}
                                </Badge>
                              ) : (
                                <button
                                  onClick={() => setOpenDropdown(openDropdown === tx.id ? null : tx.id)}
                                  className="cursor-pointer hover:opacity-80 transition-opacity"
                                  title={t('انقر لتغيير الحالة', 'Click to change status')}
                                >
                                  {cfg ? <Badge variant={cfg.variant} dot>{lang === 'ar' ? cfg.labelAr : cfg.labelEn}</Badge> : tx.paymentStatus}
                                </button>
                              )}
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
                          <td className="px-3 py-3.5">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setDetailTx(tx)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
                                title={t('عرض الفاتورة', 'View invoice')}
                              >
                                <FileText className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => void downloadRowPdf(tx.id, tx.id.slice(-8).toUpperCase())}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                                title={t('تحميل PDF', 'Download PDF')}
                              >
                                <FileDown className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filtered.length === 0 && (
                      <tr><td colSpan={10} className="px-5 py-12 text-center text-gray-400 dark:text-gray-300">{t('لا توجد سجلات تطابق الفلتر', 'No billing records match the filter.')}</td></tr>
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

        {/* Doctor Settlements */}
        <Card className="mt-6">
          <CardContent className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{t('تسوية الأطباء', 'Doctor Settlements')}</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('الاستشارات غير المسوّاة فقط', 'Unsettled consultations only')}</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={settlFrom}
                  onChange={(e) => setSettlFrom(e.target.value)}
                  className="h-9 rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <span className="text-gray-400 text-sm">→</span>
                <input
                  type="date"
                  value={settlTo}
                  onChange={(e) => setSettlTo(e.target.value)}
                  className="h-9 rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            {settlLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : !settlData?.data?.length ? (
              <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
                {t('لا توجد استشارات غير مسوّاة في هذه الفترة', 'No unsettled consultations in this period.')}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-neutral-700">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-neutral-800 border-b border-gray-100 dark:border-neutral-700">
                      <th className="px-4 py-3 text-start text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('الطبيب', 'Doctor')}</th>
                      <th className="px-4 py-3 text-start text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('الاستشارات', 'Consultations')}</th>
                      <th className="px-4 py-3 text-start text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('إجمالي الرسوم', 'Total Charge')}</th>
                      <th className="px-4 py-3 text-start text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('نصيب الطبيب', 'Dr. Share')}</th>
                      <th className="px-4 py-3 text-start text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('المستحق', 'Net Payable')}</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-neutral-700/50">
                    {settlData.data.map((s) => {
                      const doc = doctorMap.get(s.doctorId);
                      const name = doc ? (lang === 'ar' ? (doc.nameAr ?? doc.nameEn) : doc.nameEn) : s.doctorId.slice(-8);
                      return (
                        <tr key={s.doctorId} className="hover:bg-gray-50/50 dark:hover:bg-neutral-800/30 transition-colors">
                          <td className="px-4 py-3.5 font-medium text-gray-900 dark:text-gray-100">{name}</td>
                          <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">{s.totalConsultations}</td>
                          <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">{formatCurrency(s.totalSessionFees ?? 0)}</td>
                          <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">{formatCurrency(s.doctorShare)}</td>
                          <td className="px-4 py-3.5 font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(s.netPayable)}</td>
                          <td className="px-4 py-3.5 text-end">
                            <button
                              onClick={() => setReconcileTarget({ doctorId: s.doctorId, doctorName: name, totalConsultations: s.totalConsultations, netPayable: s.netPayable })}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-xs font-medium hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
                            >
                              <Check className="w-3.5 h-3.5" />
                              {t('تسوية', 'Settle')}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {reconcileTarget && (
          <ReconcileModal
            doctorId={reconcileTarget.doctorId}
            doctorName={reconcileTarget.doctorName}
            from={settlFrom}
            to={settlTo}
            totalConsultations={reconcileTarget.totalConsultations}
            netPayable={reconcileTarget.netPayable}
            onClose={() => setReconcileTarget(null)}
            onDone={() => { setReconcileTarget(null); void refetchSettlements(); }}
          />
        )}

      {showDeleteModal && deleteApptId && (
        <SecureDeleteModal
          appointmentId={deleteApptId}
          onClose={() => {
            setShowDeleteModal(false);
            router.replace('/billing');
          }}
          onDeleted={() => {
            setShowDeleteModal(false);
            router.replace('/appointments');
          }}
        />
      )}

      {showBulkDelete && selectedTxs.length > 0 && (
        <BulkDeleteModal
          selected={selectedTxs}
          lang={lang}
          t={t}
          locale={locale}
          onClose={() => setShowBulkDelete(false)}
          onDeleted={() => {
            setShowBulkDelete(false);
            setSelectedIds(new Set());
          }}
        />
      )}

      {showBulkEdit && selectedTxs.length > 0 && (
        <BulkEditModal
          selected={selectedTxs}
          lang={lang}
          t={t}
          onClose={() => setShowBulkEdit(false)}
          onEdited={() => {
            setShowBulkEdit(false);
            setSelectedIds(new Set());
          }}
        />
      )}

      {/* Invoice detail modal */}
      <InvoiceDetailModal
        open={!!detailTx}
        transaction={detailTx}
        patientName={detailTx ? (() => { const p = patientMap.get(detailTx.patientId); return p ? (lang === 'ar' ? (p.nameAr ?? p.nameEn) : p.nameEn) : undefined; })() : undefined}
        doctorName={detailTx?.doctorId ? (() => { const d = doctorMap.get(detailTx.doctorId!); return d ? (lang === 'ar' ? (d.nameAr ?? d.nameEn) : d.nameEn) : undefined; })() : undefined}
        onClose={() => setDetailTx(null)}
      />
    </div>
  );
}
