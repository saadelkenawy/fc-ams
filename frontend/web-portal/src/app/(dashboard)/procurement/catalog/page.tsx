'use client';

import { useState } from 'react';
import { Search, Plus, Pencil, Package } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { useCatalog, useCreateCatalogItem, useUpdateCatalogItem, type CatalogItem } from '@/hooks/useProcurement';
import { useDebounce } from '@/hooks/useDebounce';
import { useLang } from '@/contexts/LanguageContext';
import { useToast } from '@/components/ui/Toast';
import { Pagination } from '@/components/ui/Pagination';

const CATEGORIES = ['PPE', 'Injection & Phlebotomy', 'Sterilization & Hygiene', 'Diagnostic Devices', 'Specialty Instruments'] as const;
const CLINIC_TYPES = ['Internal Medicine', 'Pediatrics', 'General Surgery', 'Dermatology'] as const;
const BUDGET_TIERS = ['Economy', 'Mid-range', 'Premium'] as const;
const EDA_STATUSES = ['Registered', 'Permit required', 'Controlled', 'Not regulated'] as const;

type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'outline';

const TIER_BADGE: Record<string, BadgeVariant> = {
  Economy:   'success',
  'Mid-range': 'info',
  Premium:   'purple',
};

const EDA_BADGE: Record<string, BadgeVariant> = {
  Registered:       'success',
  'Permit required': 'warning',
  Controlled:       'danger',
  'Not regulated':  'outline',
};

const PAGE_SIZE = 20;

type ItemPayload = Omit<CatalogItem, 'id' | 'createdAt' | 'updatedAt'>;

const EMPTY: ItemPayload = {
  itemName: '', itemNameAr: '', category: 'PPE', clinicalUse: '',
  clinicTypes: [], budgetTier: 'Economy', edaStatus: 'Registered', edaClass: undefined,
  localFirst: false, qtyUnit: '', qtyPerMonth: undefined, reorderThreshold: 0,
  currentStock: 0, unitCostEgp: undefined, preferredVendorId: undefined, isActive: true, notes: '',
};

function ItemForm({ value, onChange, t }: { value: ItemPayload; onChange: (v: ItemPayload) => void; t: (ar: string, en: string) => string }) {
  function set<K extends keyof ItemPayload>(key: K, val: ItemPayload[K]) { onChange({ ...value, [key]: val }); }

  function toggleClinicType(ct: string) {
    const next = value.clinicTypes.includes(ct)
      ? value.clinicTypes.filter((c) => c !== ct)
      : [...value.clinicTypes, ct];
    set('clinicTypes', next);
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="sm:col-span-2">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('اسم العنصر (إنجليزي)', 'Item Name (English)')} *</label>
        <Input value={value.itemName} onChange={(e) => set('itemName', e.target.value)} placeholder="e.g. Nitrile examination gloves" />
      </div>
      <div className="sm:col-span-2">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('اسم العنصر (عربي)', 'Item Name (Arabic)')}</label>
        <Input value={value.itemNameAr ?? ''} onChange={(e) => set('itemNameAr', e.target.value)} dir="rtl" placeholder="اسم المادة بالعربي" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('الفئة', 'Category')} *</label>
        <select value={value.category} onChange={(e) => set('category', e.target.value as CatalogItem['category'])}
          className="w-full rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-600">
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('الشريحة السعرية', 'Budget Tier')} *</label>
        <select value={value.budgetTier} onChange={(e) => set('budgetTier', e.target.value as CatalogItem['budgetTier'])}
          className="w-full rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-600">
          {BUDGET_TIERS.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('حالة التسجيل EDA', 'EDA Status')} *</label>
        <select value={value.edaStatus} onChange={(e) => set('edaStatus', e.target.value as CatalogItem['edaStatus'])}
          className="w-full rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-600">
          {EDA_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('تصنيف EDA', 'EDA Class')}</label>
        <select value={value.edaClass ?? ''} onChange={(e) => set('edaClass', (e.target.value || undefined) as CatalogItem['edaClass'])}
          className="w-full rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-600">
          <option value="">{t('غير محدد', 'None')}</option>
          <option value="I">Class I</option>
          <option value="II">Class II</option>
          <option value="III">Class III</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('وحدة القياس', 'Unit')}</label>
        <Input value={value.qtyUnit ?? ''} onChange={(e) => set('qtyUnit', e.target.value)} placeholder="e.g. box (100)" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('التكلفة (جنيه)', 'Unit Cost (EGP)')}</label>
        <Input type="number" min={0} value={value.unitCostEgp ?? ''} onChange={(e) => set('unitCostEgp', e.target.value ? Number(e.target.value) : undefined)} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('المخزون الحالي', 'Current Stock')}</label>
        <Input type="number" min={0} value={value.currentStock} onChange={(e) => set('currentStock', Number(e.target.value))} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('حد إعادة الطلب', 'Reorder Threshold')}</label>
        <Input type="number" min={0} value={value.reorderThreshold} onChange={(e) => set('reorderThreshold', Number(e.target.value))} />
      </div>
      <div className="sm:col-span-2">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('أنواع العيادات', 'Clinic Types')}</label>
        <div className="flex flex-wrap gap-2">
          {CLINIC_TYPES.map((ct) => (
            <button key={ct} type="button" onClick={() => toggleClinicType(ct)}
              className={`px-3 py-1 text-xs rounded-full border transition-all ${
                value.clinicTypes.includes(ct)
                  ? 'bg-primary-600 border-primary-600 text-white'
                  : 'border-gray-300 dark:border-neutral-600 text-gray-600 dark:text-gray-400 hover:border-primary-400'
              }`}>{ct}</button>
          ))}
        </div>
      </div>
      <div className="sm:col-span-2">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('الاستخدام السريري', 'Clinical Use')}</label>
        <Input value={value.clinicalUse ?? ''} onChange={(e) => set('clinicalUse', e.target.value)} placeholder="One sentence description..." />
      </div>
      <div className="flex gap-4">
        <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-700 dark:text-gray-300">
          <input type="checkbox" checked={value.localFirst} onChange={(e) => set('localFirst', e.target.checked)} className="w-4 h-4 rounded" />
          {t('تفضيل محلي', 'Local-first')}
        </label>
        <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-700 dark:text-gray-300">
          <input type="checkbox" checked={value.isActive} onChange={(e) => set('isActive', e.target.checked)} className="w-4 h-4 rounded" />
          {t('نشط', 'Active')}
        </label>
      </div>
    </div>
  );
}

export default function CatalogPage() {
  const { t } = useLang();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(PAGE_SIZE);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CatalogItem | null>(null);
  const [form, setForm] = useState<ItemPayload>(EMPTY);

  const { data, isLoading } = useCatalog({
    q: debouncedSearch || undefined,
    category: categoryFilter || undefined,
    isActive: true,
    page,
    limit,
  });

  const createItem = useCreateCatalogItem();
  const updateItem = useUpdateCatalogItem();
  const items = data?.data ?? [];
  const total = data?.total ?? 0;

  function openAdd() { setEditTarget(null); setForm(EMPTY); setModalOpen(true); }
  function openEdit(item: CatalogItem) {
    setEditTarget(item);
    setForm({ itemName: item.itemName, itemNameAr: item.itemNameAr, category: item.category as CatalogItem['category'],
      clinicalUse: item.clinicalUse, clinicTypes: item.clinicTypes, budgetTier: item.budgetTier as CatalogItem['budgetTier'],
      edaStatus: item.edaStatus as CatalogItem['edaStatus'], edaClass: item.edaClass, localFirst: item.localFirst,
      qtyUnit: item.qtyUnit, qtyPerMonth: item.qtyPerMonth, reorderThreshold: item.reorderThreshold,
      currentStock: item.currentStock, unitCostEgp: item.unitCostEgp, preferredVendorId: item.preferredVendorId,
      isActive: item.isActive, notes: item.notes,
    });
    setModalOpen(true);
  }

  async function handleSubmit() {
    if (!form.itemName.trim()) { toast(t('الاسم مطلوب', 'Item name is required'), 'error'); return; }
    try {
      if (editTarget) {
        await updateItem.mutateAsync({ id: editTarget.id, ...form });
        toast(t('تم التحديث', 'Item updated'), 'success');
      } else {
        await createItem.mutateAsync(form);
        toast(t('تم الإضافة', 'Item added'), 'success');
      }
      setModalOpen(false);
    } catch { toast(t('حدث خطأ', 'Something went wrong'), 'error'); }
  }

  const isSaving = createItem.isLoading || updateItem.isLoading;

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold font-display text-gray-900 dark:text-gray-100">{t('كتالوج المواد الطبية', 'Medical Item Catalog')}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t('جميع المواد والمستلزمات الطبية', 'All medical supplies and equipment')}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-56">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input className="ps-9" placeholder={t('ابحث...', 'Search...')} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <Button onClick={openAdd} size="sm" className="gap-1.5">
            <Plus className="w-4 h-4" />{t('عنصر جديد', 'New Item')}
          </Button>
        </div>
      </div>

      {/* Category filter tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-neutral-800 rounded-lg p-1 flex-wrap">
        {(['', ...CATEGORIES] as string[]).map((cat) => (
          <button key={cat} onClick={() => { setCategoryFilter(cat); setPage(1); }}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
              categoryFilter === cat
                ? 'bg-white dark:bg-neutral-700 text-primary-700 dark:text-primary-300 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}>
            {cat || t('الكل', 'All')}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t('قائمة المواد', 'Items List')}</CardTitle>
          {!isLoading && <span className="text-xs text-gray-400">{total} {t('عنصر', 'items')}</span>}
        </CardHeader>
        <CardContent className="p-0 mt-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-neutral-700 bg-gray-50/50 dark:bg-neutral-800/50">
                  {[t('اسم المادة','Item Name'), t('الفئة','Category'), t('الشريحة','Tier'), t('حالة EDA','EDA'), t('المخزون','Stock'), t('التكلفة (ج)','Cost (EGP)'), t('إجراءات','')].map((h) => (
                    <th key={h} className="text-start px-4 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b border-gray-50 dark:border-neutral-700/50">
                        <td colSpan={7} className="px-4 py-3"><div className="animate-pulse bg-gray-200 dark:bg-neutral-700 rounded h-4" /></td>
                      </tr>
                    ))
                  : items.length === 0
                  ? <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">{t('لا توجد عناصر', 'No items found')}</td></tr>
                  : items.map((item) => (
                      <tr key={item.id} className="border-b border-gray-50 dark:border-neutral-700/50 hover:bg-gray-50/50 dark:hover:bg-neutral-700/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900 dark:text-gray-100 max-w-xs truncate">{item.itemName}</div>
                          {item.localFirst && <span className="text-xs text-emerald-600 dark:text-emerald-400">{t('محلي أولاً','Local-first')}</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                          <div className="flex items-center gap-1.5"><Package className="w-3 h-3" />{item.category}</div>
                        </td>
                        <td className="px-4 py-3"><Badge variant={TIER_BADGE[item.budgetTier] ?? 'default'}>{item.budgetTier}</Badge></td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <Badge variant={EDA_BADGE[item.edaStatus] ?? 'default'}>{item.edaStatus}</Badge>
                            {item.edaClass && <span className="text-xs text-gray-400">Class {item.edaClass}</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          <span className={item.currentStock <= item.reorderThreshold && item.reorderThreshold > 0 ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-700 dark:text-gray-300'}>
                            {item.currentStock}
                          </span>
                          {item.qtyUnit && <span className="text-xs text-gray-400 ms-1">{item.qtyUnit}</span>}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-gray-700 dark:text-gray-300">
                          {item.unitCostEgp != null ? `${item.unitCostEgp.toLocaleString('ar-EG')} ج` : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => openEdit(item)} className="p-1.5 rounded-md text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                }
              </tbody>
            </table>
          </div>
          {!isLoading && total > limit && (
            <Pagination page={page} total={total} limit={limit} onPageChange={setPage} onLimitChange={() => {}} pageSizes={[20]} />
          )}
        </CardContent>
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)}
        title={editTarget ? t('تعديل العنصر', 'Edit Item') : t('عنصر جديد', 'New Item')}
        subtitle={editTarget?.itemName ?? t('أضف مادة طبية جديدة للكتالوج', 'Add a new medical supply to the catalog')}
        maxWidth="2xl"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setModalOpen(false)} disabled={isSaving}>{t('إلغاء','Cancel')}</Button>
            <Button size="sm" onClick={() => void handleSubmit()} disabled={isSaving} className="min-w-[100px]">
              {isSaving ? t('جارٍ الحفظ...','Saving...') : editTarget ? t('حفظ','Save') : t('إضافة','Add')}
            </Button>
          </>
        }
      >
        <ItemForm value={form} onChange={setForm} t={t} />
      </Modal>
    </div>
  );
}
