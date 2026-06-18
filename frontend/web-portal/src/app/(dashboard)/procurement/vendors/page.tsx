'use client';
import { CTable, CTableHead, CTableBody, CTableRow, CTableHeaderCell, CTableDataCell } from '@coreui/react';

import { useState } from 'react';
import { Search, Plus, Pencil, Store, CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { useVendors, useCreateVendor, useUpdateVendor, type Vendor } from '@/hooks/useProcurement';
import { useDebounce } from '@/hooks/useDebounce';
import { useLang } from '@/contexts/LanguageContext';
import { useToast } from '@/components/ui/Toast';
import { Pagination } from '@/components/ui/Pagination';

const VENDOR_TYPES = [
  'Local Egyptian manufacturer',
  'Authorized international distributor',
  'Major medical importer / supply chain',
] as const;

const CATEGORIES = ['PPE', 'Injection & Phlebotomy', 'Sterilization & Hygiene', 'Diagnostic Devices', 'Specialty Instruments'] as const;

type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'outline';

const TYPE_BADGE: Record<string, BadgeVariant> = {
  'Local Egyptian manufacturer':            'success',
  'Authorized international distributor':   'info',
  'Major medical importer / supply chain':  'purple',
};

type VendorPayload = Omit<Vendor, 'id' | 'createdAt' | 'updatedAt'>;

const EMPTY: VendorPayload = {
  vendorName: '', vendorNameAr: '', vendorType: 'Local Egyptian manufacturer',
  brandsCovered: '', categoriesServed: [], contactName: '', contactPhone: '', contactEmail: '',
  notes: '', isApproved: true,
};

function VendorForm({ value, onChange, t }: { value: VendorPayload; onChange: (v: VendorPayload) => void; t: (ar: string, en: string) => string }) {
  function set<K extends keyof VendorPayload>(key: K, val: VendorPayload[K]) { onChange({ ...value, [key]: val }); }

  function toggleCategory(cat: string) {
    const next = value.categoriesServed.includes(cat)
      ? value.categoriesServed.filter((c) => c !== cat)
      : [...value.categoriesServed, cat];
    set('categoriesServed', next);
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="sm:col-span-2">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('اسم المورد (إنجليزي)', 'Vendor Name (English)')} *</label>
        <Input value={value.vendorName} onChange={(e) => set('vendorName', e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('اسم المورد (عربي)', 'Vendor Name (Arabic)')}</label>
        <Input value={value.vendorNameAr ?? ''} onChange={(e) => set('vendorNameAr', e.target.value)} dir="rtl" />
      </div>
      <div className="sm:col-span-2">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('نوع المورد', 'Vendor Type')} *</label>
        <select value={value.vendorType} onChange={(e) => set('vendorType', e.target.value as VendorPayload['vendorType'])}
          className="w-full rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-600">
          {VENDOR_TYPES.map((vt) => <option key={vt} value={vt}>{vt}</option>)}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('العلامات التجارية والمنتجات', 'Brands / Product Lines')}</label>
        <Input value={value.brandsCovered ?? ''} onChange={(e) => set('brandsCovered', e.target.value)} placeholder="e.g. B. Braun IV cannulas, infusion sets" />
      </div>
      <div className="sm:col-span-2">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('الفئات المخدومة', 'Categories Served')}</label>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button key={cat} type="button" onClick={() => toggleCategory(cat)}
              className={`px-3 py-1 text-xs rounded-full border transition-all ${
                value.categoriesServed.includes(cat)
                  ? 'bg-primary-600 border-primary-600 text-white'
                  : 'border-gray-300 dark:border-neutral-600 text-gray-600 dark:text-gray-400 hover:border-primary-400'
              }`}>{cat}</button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('جهة الاتصال', 'Contact Name')}</label>
        <Input value={value.contactName ?? ''} onChange={(e) => set('contactName', e.target.value)} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('رقم الهاتف', 'Phone')}</label>
        <Input value={value.contactPhone ?? ''} onChange={(e) => set('contactPhone', e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('البريد الإلكتروني', 'Email')}</label>
        <Input type="email" value={value.contactEmail ?? ''} onChange={(e) => set('contactEmail', e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('ملاحظات', 'Notes')}</label>
        <Input value={value.notes ?? ''} onChange={(e) => set('notes', e.target.value)} placeholder="e.g. Requires tender registration, MOH-approved" />
      </div>
      <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-700 dark:text-gray-300">
        <input type="checkbox" checked={value.isApproved} onChange={(e) => set('isApproved', e.target.checked)} className="w-4 h-4 rounded" />
        {t('مورد معتمد', 'Approved vendor')}
      </label>
    </div>
  );
}

export default function VendorsPage() {
  const { t } = useLang();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Vendor | null>(null);
  const [form, setForm] = useState<VendorPayload>(EMPTY);

  const { data, isLoading } = useVendors({ q: debouncedSearch || undefined, page, limit });
  const createVendor = useCreateVendor();
  const updateVendor = useUpdateVendor();
  const vendors = data?.data ?? [];
  const total = data?.total ?? 0;

  function openAdd() { setEditTarget(null); setForm(EMPTY); setModalOpen(true); }
  function openEdit(v: Vendor) {
    setEditTarget(v);
    setForm({ vendorName: v.vendorName, vendorNameAr: v.vendorNameAr, vendorType: v.vendorType as VendorPayload['vendorType'],
      brandsCovered: v.brandsCovered, categoriesServed: v.categoriesServed, contactName: v.contactName,
      contactPhone: v.contactPhone, contactEmail: v.contactEmail, notes: v.notes, isApproved: v.isApproved,
    });
    setModalOpen(true);
  }

  async function handleSubmit() {
    if (!form.vendorName.trim()) { toast(t('الاسم مطلوب', 'Vendor name is required'), 'error'); return; }
    try {
      if (editTarget) {
        await updateVendor.mutateAsync({ id: editTarget.id, ...form });
        toast(t('تم التحديث', 'Vendor updated'), 'success');
      } else {
        await createVendor.mutateAsync(form);
        toast(t('تمت الإضافة', 'Vendor added'), 'success');
      }
      setModalOpen(false);
    } catch { toast(t('حدث خطأ', 'Something went wrong'), 'error'); }
  }

  const isSaving = createVendor.isPending || updateVendor.isPending;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold font-display text-gray-900 dark:text-gray-100">{t('دليل الموردين', 'Vendor Directory')}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t('الموردون المصريون المعتمدون', 'Egyptian approved medical suppliers')}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-56">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input className="ps-9" placeholder={t('ابحث عن مورد...', 'Search vendors...')} value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <Button onClick={openAdd} size="sm" className="gap-1.5">
            <Plus className="w-4 h-4" />{t('مورد جديد', 'New Vendor')}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t('الموردون', 'Vendors')}</CardTitle>
          {!isLoading && <span className="text-xs text-gray-400">{total} {t('مورد', 'vendors')}</span>}
        </CardHeader>
        <CardContent className="p-0 mt-4">
          <div className="overflow-x-auto">
            <CTable className="w-full text-sm">
              <CTableHead>
                <CTableRow className="border-b border-gray-100 dark:border-neutral-700 bg-gray-50/50 dark:bg-neutral-800/50">
                  {[t('اسم المورد','Vendor'), t('النوع','Type'), t('الفئات','Categories'), t('جهة الاتصال','Contact'), t('الحالة','Status'), ''].map((h) => (
                    <CTableHeaderCell key={h} className="text-start px-4 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">{h}</CTableHeaderCell>
                  ))}
                </CTableRow>
              </CTableHead>
              <CTableBody>
                {isLoading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <CTableRow key={i} className="border-b border-gray-50 dark:border-neutral-700/50">
                        <CTableDataCell colSpan={6} className="px-4 py-3"><div className="animate-pulse bg-gray-200 dark:bg-neutral-700 rounded h-4" /></CTableDataCell>
                      </CTableRow>
                    ))
                  : vendors.length === 0
                  ? <CTableRow><CTableDataCell colSpan={6} className="px-4 py-12 text-center text-gray-400">{t('لا يوجد موردون', 'No vendors found')}</CTableDataCell></CTableRow>
                  : vendors.map((v) => (
                      <CTableRow key={v.id} className="border-b border-gray-50 dark:border-neutral-700/50 hover:bg-gray-50/50 dark:hover:bg-neutral-700/30 transition-colors">
                        <CTableDataCell className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Store className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <div>
                              <p className="font-medium text-gray-900 dark:text-gray-100">{v.vendorName}</p>
                              {v.brandsCovered && <p className="text-xs text-gray-500 max-w-xs truncate">{v.brandsCovered}</p>}
                            </div>
                          </div>
                        </CTableDataCell>
                        <CTableDataCell className="px-4 py-3">
                          <Badge variant={TYPE_BADGE[v.vendorType] ?? 'default'} className="whitespace-nowrap text-xs">
                            {v.vendorType === 'Local Egyptian manufacturer' ? t('مصنّع مصري','Local Mfg.') :
                             v.vendorType === 'Authorized international distributor' ? t('موزع دولي معتمد','Intl. Dist.') :
                             t('مستورد طبي','Med. Importer')}
                          </Badge>
                        </CTableDataCell>
                        <CTableDataCell className="px-4 py-3">
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {v.categoriesServed.slice(0, 2).map((cat) => (
                              <span key={cat} className="text-xs bg-gray-100 dark:bg-neutral-700 rounded px-1.5 py-0.5 text-gray-600 dark:text-gray-400">{cat.split(' ')[0]}</span>
                            ))}
                            {v.categoriesServed.length > 2 && <span className="text-xs text-gray-400">+{v.categoriesServed.length - 2}</span>}
                          </div>
                        </CTableDataCell>
                        <CTableDataCell className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">
                          {v.contactName && <p>{v.contactName}</p>}
                          {v.contactPhone && <p className="text-gray-400">{v.contactPhone}</p>}
                        </CTableDataCell>
                        <CTableDataCell className="px-4 py-3">
                          {v.isApproved
                            ? <span className="flex items-center gap-1 text-xs text-emerald-600"><CheckCircle className="w-3.5 h-3.5" />{t('معتمد','Approved')}</span>
                            : <span className="flex items-center gap-1 text-xs text-red-500"><XCircle className="w-3.5 h-3.5" />{t('غير معتمد','Unapproved')}</span>}
                        </CTableDataCell>
                        <CTableDataCell className="px-4 py-3">
                          <button onClick={() => openEdit(v)} className="p-1.5 rounded-md text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </CTableDataCell>
                      </CTableRow>
                    ))
                }
              </CTableBody>
            </CTable>
          </div>
          {!isLoading && total > limit && (
            <Pagination page={page} total={total} limit={limit} onPageChange={setPage} onLimitChange={() => {}} pageSizes={[50]} />
          )}
        </CardContent>
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)}
        title={editTarget ? t('تعديل المورد', 'Edit Vendor') : t('مورد جديد', 'New Vendor')}
        subtitle={editTarget?.vendorName ?? t('أضف موردًا جديدًا للدليل', 'Add a new vendor to the directory')}
        maxWidth="2xl"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setModalOpen(false)} disabled={isSaving}>{t('إلغاء','Cancel')}</Button>
            <Button size="sm" onClick={() => handleSubmit()} disabled={isSaving} className="min-w-[100px]">
              {isSaving ? t('جارٍ الحفظ...','Saving...') : editTarget ? t('حفظ','Save') : t('إضافة','Add')}
            </Button>
          </>
        }
      >
        <VendorForm value={form} onChange={setForm} t={t} />
      </Modal>
    </div>
  );
}
