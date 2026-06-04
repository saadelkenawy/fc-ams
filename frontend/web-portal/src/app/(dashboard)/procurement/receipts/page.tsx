'use client';

import { useState } from 'react';
import { Plus, FileText, AlertTriangle, CheckCircle, Clock, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import {
  useReceipts, useVendors, useCatalog, useCreateReceipt, useAddReceiptItem, useUpdateReceiptStatus,
  type Receipt, type ReceiptItem,
} from '@/hooks/useProcurement';
import { useLang } from '@/contexts/LanguageContext';
import { useToast } from '@/components/ui/Toast';
import { Pagination } from '@/components/ui/Pagination';

type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'outline';

const STATUS_BADGE: Record<string, BadgeVariant> = {
  pending:     'warning',
  approved:    'success',
  discrepancy: 'danger',
  cancelled:   'outline',
};

const STATUS_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  pending:     Clock,
  approved:    CheckCircle,
  discrepancy: AlertTriangle,
  cancelled:   XCircle,
};

type ReceiptFormData = {
  vendorId: string;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceTotalEgp: string;
  dateReceived: string;
  notes: string;
};

type LineItemFormData = {
  itemId: string;
  batchLotNumber: string;
  expiryDate: string;
  quantityReceived: string;
  quantityOrdered: string;
  unitPriceEgp: string;
};

const EMPTY_RECEIPT: ReceiptFormData = {
  vendorId: '', invoiceNumber: '', invoiceDate: '', invoiceTotalEgp: '',
  dateReceived: new Date().toISOString().split('T')[0], notes: '',
};

const EMPTY_LINE: LineItemFormData = {
  itemId: '', batchLotNumber: '', expiryDate: '', quantityReceived: '', quantityOrdered: '', unitPriceEgp: '',
};

export default function ReceiptsPage() {
  const { lang, t } = useLang();
  const locale = lang === 'ar' ? 'ar-EG' : 'en-US';
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newReceiptOpen, setNewReceiptOpen] = useState(false);
  const [addLineOpen, setAddLineOpen] = useState<string | null>(null);
  const [receiptForm, setReceiptForm] = useState<ReceiptFormData>(EMPTY_RECEIPT);
  const [lineForm, setLineForm] = useState<LineItemFormData>(EMPTY_LINE);

  const { data, isLoading } = useReceipts({ status: statusFilter || undefined, page, limit: 20 });
  const { data: vendorsData } = useVendors({ limit: 100 });
  const { data: catalogData } = useCatalog({ isActive: true, limit: 100 });
  const vendors = vendorsData?.data ?? [];
  const catalogItems = catalogData?.data ?? [];

  const createReceipt = useCreateReceipt();
  const addLineItem = useAddReceiptItem();
  const updateStatus = useUpdateReceiptStatus();

  const receipts = data?.data ?? [];
  const total = data?.total ?? 0;

  async function handleCreateReceipt() {
    if (!receiptForm.vendorId) { toast(t('يرجى اختيار المورد', 'Please select a vendor'), 'error'); return; }
    try {
      await createReceipt.mutateAsync({
        vendorId:       receiptForm.vendorId,
        invoiceNumber:  receiptForm.invoiceNumber || undefined,
        invoiceDate:    receiptForm.invoiceDate || undefined,
        invoiceTotalEgp: receiptForm.invoiceTotalEgp ? Number(receiptForm.invoiceTotalEgp) : undefined,
        dateReceived:   receiptForm.dateReceived || undefined,
        notes:          receiptForm.notes || undefined,
      });
      toast(t('تم إنشاء الإيصال', 'Receipt created'), 'success');
      setNewReceiptOpen(false);
      setReceiptForm(EMPTY_RECEIPT);
    } catch { toast(t('حدث خطأ', 'Something went wrong'), 'error'); }
  }

  async function handleAddLine(receiptId: string) {
    if (!lineForm.itemId || !lineForm.quantityReceived || !lineForm.unitPriceEgp) {
      toast(t('يرجى ملء الحقول المطلوبة', 'Fill required fields'), 'error'); return;
    }
    try {
      await addLineItem.mutateAsync({
        receiptId,
        itemId:           lineForm.itemId,
        batchLotNumber:   lineForm.batchLotNumber || undefined,
        expiryDate:       lineForm.expiryDate || undefined,
        quantityReceived: Number(lineForm.quantityReceived),
        quantityOrdered:  lineForm.quantityOrdered ? Number(lineForm.quantityOrdered) : undefined,
        unitPriceEgp:     Number(lineForm.unitPriceEgp),
      });
      toast(t('تم إضافة البند', 'Line item added'), 'success');
      setAddLineOpen(null);
      setLineForm(EMPTY_LINE);
    } catch { toast(t('حدث خطأ', 'Something went wrong'), 'error'); }
  }

  function vendorName(id: string) {
    return vendors.find((v) => v.id === id)?.vendorName ?? id.slice(0, 8);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold font-display text-gray-900 dark:text-gray-100">{t('سجل الإيصالات', 'Receipt Log')}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t('تسجيل فواتير الاستلام والتحقق منها', 'Log and verify delivery invoices')}</p>
        </div>
        <Button onClick={() => setNewReceiptOpen(true)} size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" />{t('إيصال جديد', 'New Receipt')}
        </Button>
      </div>

      {/* Status filter */}
      <div className="flex gap-1 bg-gray-100 dark:bg-neutral-800 rounded-lg p-1">
        {(['', 'pending', 'approved', 'discrepancy', 'cancelled'] as const).map((s) => (
          <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
              statusFilter === s
                ? 'bg-white dark:bg-neutral-700 text-primary-700 dark:text-primary-300 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}>
            {s === '' ? t('الكل','All') : s === 'pending' ? t('معلق','Pending') : s === 'approved' ? t('معتمد','Approved') : s === 'discrepancy' ? t('تناقض','Discrepancy') : t('ملغى','Cancelled')}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t('الإيصالات', 'Receipts')}</CardTitle>
          {!isLoading && <span className="text-xs text-gray-400">{total} {t('إيصال','receipts')}</span>}
        </CardHeader>
        <CardContent className="p-0 mt-4">
          <div className="divide-y divide-gray-100 dark:divide-neutral-700/50">
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="px-5 py-4"><div className="animate-pulse bg-gray-200 dark:bg-neutral-700 rounded h-10" /></div>
                ))
              : receipts.length === 0
              ? <div className="px-5 py-12 text-center text-gray-400">{t('لا توجد إيصالات','No receipts found')}</div>
              : receipts.map((r) => {
                  const StatusIcon = STATUS_ICON[r.status] ?? FileText;
                  const isExpanded = expandedId === r.id;
                  return (
                    <div key={r.id}>
                      <div className="px-5 py-4 flex items-center gap-4 hover:bg-gray-50/50 dark:hover:bg-neutral-700/20 transition-colors">
                        <StatusIcon className={`w-5 h-5 flex-shrink-0 ${r.status === 'approved' ? 'text-emerald-500' : r.status === 'discrepancy' ? 'text-red-500' : r.status === 'pending' ? 'text-amber-500' : 'text-gray-400'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-sm font-semibold text-gray-900 dark:text-gray-100">{r.receiptNumber}</span>
                            <Badge variant={STATUS_BADGE[r.status] ?? 'default'}>{r.status}</Badge>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">{vendorName(r.vendorId)} · {r.dateReceived}</p>
                        </div>
                        {r.invoiceTotalEgp && (
                          <span className="tabular-nums text-sm font-medium text-gray-900 dark:text-gray-100 hidden sm:block">
                            {r.invoiceTotalEgp.toLocaleString(locale)} {t('ج.م.','EGP')}
                          </span>
                        )}
                        <div className="flex items-center gap-2">
                          {r.status === 'pending' && (
                            <Button size="sm" variant="ghost" className="text-xs h-7 px-2"
                              onClick={() => updateStatus.mutateAsync({ id: r.id, status: 'approved' })}>
                              {t('اعتماد','Approve')}
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="text-xs h-7 px-2 gap-1"
                            onClick={() => setAddLineOpen(isExpanded && addLineOpen === r.id ? null : r.id)}>
                            <Plus className="w-3 h-3" />{t('بند','Item')}
                          </Button>
                          <button onClick={() => setExpandedId(isExpanded ? null : r.id)}
                            className="p-1 text-gray-400 hover:text-gray-600">
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Add line form */}
                      {addLineOpen === r.id && (
                        <div className="px-5 py-4 bg-blue-50 dark:bg-blue-900/10 border-t border-blue-100 dark:border-blue-800/30">
                          <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-3">{t('إضافة بند جديد', 'Add Line Item')}</p>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">{t('المادة *','Item *')}</label>
                              <select value={lineForm.itemId} onChange={(e) => setLineForm((f) => ({ ...f, itemId: e.target.value }))}
                                className="w-full rounded border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-xs px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary-600">
                                <option value="">{t('اختر المادة', 'Select item')}</option>
                                {catalogItems.map((ci) => <option key={ci.id} value={ci.id}>{ci.itemName}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">{t('كمية مستلمة *','Qty Received *')}</label>
                              <Input className="text-xs h-7" type="number" min={1} value={lineForm.quantityReceived}
                                onChange={(e) => setLineForm((f) => ({ ...f, quantityReceived: e.target.value }))} />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">{t('كمية مطلوبة','Qty Ordered')}</label>
                              <Input className="text-xs h-7" type="number" min={1} value={lineForm.quantityOrdered}
                                onChange={(e) => setLineForm((f) => ({ ...f, quantityOrdered: e.target.value }))} />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">{t('سعر الوحدة (ج) *','Unit Price (EGP) *')}</label>
                              <Input className="text-xs h-7" type="number" min={0} value={lineForm.unitPriceEgp}
                                onChange={(e) => setLineForm((f) => ({ ...f, unitPriceEgp: e.target.value }))} />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">{t('رقم الدفعة','Batch/Lot#')}</label>
                              <Input className="text-xs h-7" value={lineForm.batchLotNumber}
                                onChange={(e) => setLineForm((f) => ({ ...f, batchLotNumber: e.target.value }))} />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">{t('تاريخ الانتهاء','Expiry Date')}</label>
                              <Input className="text-xs h-7" type="date" value={lineForm.expiryDate}
                                onChange={(e) => setLineForm((f) => ({ ...f, expiryDate: e.target.value }))} />
                            </div>
                          </div>
                          <div className="flex gap-2 mt-3">
                            <Button size="sm" className="h-7 text-xs" onClick={() => handleAddLine(r.id)} disabled={addLineItem.isLoading}>
                              {addLineItem.isLoading ? t('جارٍ الإضافة...','Adding...') : t('إضافة','Add')}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setAddLineOpen(null); setLineForm(EMPTY_LINE); }}>
                              {t('إلغاء','Cancel')}
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Expanded line items */}
                      {isExpanded && r.items && r.items.length > 0 && (
                        <div className="px-5 py-3 bg-gray-50/50 dark:bg-neutral-800/30">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-gray-400">
                                {[t('المادة','Item'), t('الكمية','Qty'), t('السعر/وحدة','Unit Price'), t('الدفعة','Lot'), t('الانتهاء','Expiry'), ''].map((h) => (
                                  <th key={h} className="text-start pb-2 font-medium pe-4">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {(r.items as ReceiptItem[]).map((li) => (
                                <tr key={li.id} className="border-t border-gray-100 dark:border-neutral-700/30">
                                  <td className="py-1.5 pe-4 text-gray-700 dark:text-gray-300 max-w-[200px] truncate">
                                    {catalogItems.find((ci) => ci.id === li.itemId)?.itemName ?? li.itemId.slice(0, 8)}
                                  </td>
                                  <td className="py-1.5 pe-4 tabular-nums">{li.quantityReceived}{li.quantityOrdered && ` / ${li.quantityOrdered}`}</td>
                                  <td className="py-1.5 pe-4 tabular-nums">{li.unitPriceEgp.toLocaleString(locale)} {t('ج','EGP')}</td>
                                  <td className="py-1.5 pe-4">{li.batchLotNumber ?? '—'}</td>
                                  <td className="py-1.5 pe-4">{li.expiryDate ?? '—'}</td>
                                  <td className="py-1.5">
                                    {li.discrepancyFlagged && (
                                      <Badge variant="danger" className="text-[10px]">
                                        {t('تناقض','Discrepancy')} {li.discrepancyPct?.toFixed(1)}%
                                      </Badge>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })
            }
          </div>
          {!isLoading && total > 20 && (
            <Pagination page={page} total={total} limit={20} onPageChange={setPage} onLimitChange={() => {}} pageSizes={[20]} />
          )}
        </CardContent>
      </Card>

      {/* New Receipt Modal */}
      <Modal open={newReceiptOpen} onClose={() => setNewReceiptOpen(false)}
        title={t('إيصال استلام جديد', 'New Delivery Receipt')}
        subtitle={t('سجّل فاتورة توريد جديدة', 'Log a new supplier delivery invoice')}
        maxWidth="lg"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setNewReceiptOpen(false)} disabled={createReceipt.isLoading}>{t('إلغاء','Cancel')}</Button>
            <Button size="sm" onClick={() => handleCreateReceipt()} disabled={createReceipt.isLoading} className="min-w-[100px]">
              {createReceipt.isLoading ? t('جارٍ الإنشاء...','Creating...') : t('إنشاء الإيصال','Create Receipt')}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('المورد *','Vendor *')}</label>
            <select value={receiptForm.vendorId} onChange={(e) => setReceiptForm((f) => ({ ...f, vendorId: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-600">
              <option value="">{t('اختر المورد', 'Select vendor')}</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.vendorName}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('رقم الفاتورة','Invoice Number')}</label>
            <Input value={receiptForm.invoiceNumber} onChange={(e) => setReceiptForm((f) => ({ ...f, invoiceNumber: e.target.value }))} placeholder="INV-2024-001" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('تاريخ الفاتورة','Invoice Date')}</label>
            <Input type="date" value={receiptForm.invoiceDate} onChange={(e) => setReceiptForm((f) => ({ ...f, invoiceDate: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('إجمالي الفاتورة (ج.م.)','Invoice Total (EGP)')}</label>
            <Input type="number" min={0} value={receiptForm.invoiceTotalEgp} onChange={(e) => setReceiptForm((f) => ({ ...f, invoiceTotalEgp: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('تاريخ الاستلام','Date Received')}</label>
            <Input type="date" value={receiptForm.dateReceived} onChange={(e) => setReceiptForm((f) => ({ ...f, dateReceived: e.target.value }))} />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('ملاحظات','Notes')}</label>
            <Input value={receiptForm.notes} onChange={(e) => setReceiptForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
