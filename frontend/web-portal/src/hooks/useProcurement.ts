import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { procurementApi } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CatalogItem {
  id: string;
  itemName: string;
  itemNameAr?: string;
  category: string;
  clinicalUse?: string;
  clinicTypes: string[];
  budgetTier: 'Economy' | 'Mid-range' | 'Premium';
  edaStatus: string;
  edaClass?: 'I' | 'II' | 'III';
  localFirst: boolean;
  qtyUnit?: string;
  qtyPerMonth?: number;
  reorderThreshold: number;
  currentStock: number;
  unitCostEgp?: number;
  preferredVendorId?: string;
  isActive: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Vendor {
  id: string;
  vendorName: string;
  vendorNameAr?: string;
  vendorType: string;
  brandsCovered?: string;
  categoriesServed: string[];
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  notes?: string;
  isApproved: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReceiptItem {
  id: string;
  receiptId: string;
  itemId: string;
  batchLotNumber?: string;
  expiryDate?: string;
  quantityReceived: number;
  quantityOrdered?: number;
  unitPriceEgp: number;
  discrepancyFlagged: boolean;
  discrepancyPct?: number;
  createdAt: string;
}

export interface Receipt {
  id: string;
  receiptNumber: string;
  vendorId: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  invoiceTotalEgp?: number;
  currencySource: 'EGP' | 'converted';
  dateReceived: string;
  receivedByStaffId: string;
  status: 'pending' | 'approved' | 'discrepancy' | 'cancelled';
  notes?: string;
  items?: ReceiptItem[];
  createdAt: string;
  updatedAt: string;
}

export interface ProcurementAlert {
  id: string;
  alertType: 'EXPIRY_ALERT' | 'REORDER_ALERT' | 'DISCREPANCY_ALERT';
  itemId?: string;
  receiptId?: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  isRead: boolean;
  triggeredAt: string;
  resolvedAt?: string;
}

export interface OverviewStats {
  totalItems: number;
  totalVendors: number;
  totalReceipts: number;
  pendingReceipts: number;
  discrepancyReceipts: number;
  unreadAlerts: number;
  lowStockItems: number;
}

// ─── Overview ─────────────────────────────────────────────────────────────────

export function useProcurementOverview() {
  return useQuery({
    queryKey: ['procurement-overview'],
    queryFn: async () => {
      const { data } = await procurementApi.get<{ success: boolean; data: OverviewStats }>('/overview');
      return data.data;
    },
    staleTime: 30_000,
  });
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

export interface CatalogParams {
  q?: string;
  category?: string;
  clinicType?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export function useCatalog(params: CatalogParams = {}) {
  return useQuery({
    queryKey: ['procurement-catalog', params],
    queryFn: async () => {
      const { data } = await procurementApi.get<{ success: boolean; data: CatalogItem[]; total: number }>('/catalog', { params });
      return data;
    },
    staleTime: 60_000,
  });
}

export function useCreateCatalogItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<CatalogItem>) => procurementApi.post('/catalog', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['procurement-catalog'] }); },
  });
}

export function useUpdateCatalogItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<CatalogItem> & { id: string }) =>
      procurementApi.patch(`/catalog/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['procurement-catalog'] }); },
  });
}

// ─── Vendors ──────────────────────────────────────────────────────────────────

export interface VendorParams {
  q?: string;
  vendorType?: string;
  category?: string;
  isApproved?: boolean;
  page?: number;
  limit?: number;
}

export function useVendors(params: VendorParams = {}) {
  return useQuery({
    queryKey: ['procurement-vendors', params],
    queryFn: async () => {
      const { data } = await procurementApi.get<{ success: boolean; data: Vendor[]; total: number }>('/vendors', { params });
      return data;
    },
    staleTime: 60_000,
  });
}

export function useCreateVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Vendor>) => procurementApi.post('/vendors', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['procurement-vendors'] }); },
  });
}

export function useUpdateVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<Vendor> & { id: string }) =>
      procurementApi.patch(`/vendors/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['procurement-vendors'] }); },
  });
}

// ─── Receipts ─────────────────────────────────────────────────────────────────

export interface ReceiptParams {
  vendorId?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export function useReceipts(params: ReceiptParams = {}) {
  return useQuery({
    queryKey: ['procurement-receipts', params],
    queryFn: async () => {
      const { data } = await procurementApi.get<{ success: boolean; data: Receipt[]; total: number }>('/receipts', { params });
      return data;
    },
    staleTime: 30_000,
  });
}

export function useReceipt(id: string) {
  return useQuery({
    queryKey: ['procurement-receipt', id],
    queryFn: async () => {
      const { data } = await procurementApi.get<{ success: boolean; data: Receipt }>(`/receipts/${id}`);
      return data.data;
    },
    enabled: !!id,
  });
}

export function useCreateReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Receipt>) => procurementApi.post('/receipts', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['procurement-receipts'] });
      qc.invalidateQueries({ queryKey: ['procurement-overview'] });
    },
  });
}

export function useAddReceiptItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ receiptId, ...body }: Partial<ReceiptItem> & { receiptId: string }) =>
      procurementApi.post(`/receipts/${receiptId}/items`, body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['procurement-receipt', vars.receiptId] });
      qc.invalidateQueries({ queryKey: ['procurement-receipts'] });
      qc.invalidateQueries({ queryKey: ['procurement-catalog'] });
      qc.invalidateQueries({ queryKey: ['procurement-overview'] });
    },
  });
}

export function useUpdateReceiptStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: Receipt['status'] }) =>
      procurementApi.patch(`/receipts/${id}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['procurement-receipts'] });
      qc.invalidateQueries({ queryKey: ['procurement-overview'] });
    },
  });
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

export interface AlertParams {
  alertType?: string;
  isRead?: boolean;
  page?: number;
  limit?: number;
}

export function useAlerts(params: AlertParams = {}) {
  return useQuery({
    queryKey: ['procurement-alerts', params],
    queryFn: async () => {
      const { data } = await procurementApi.get<{ success: boolean; data: ProcurementAlert[]; total: number; unreadCount: number }>('/alerts', { params });
      return data;
    },
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}

export function useMarkAlertRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => procurementApi.patch(`/alerts/${id}/read`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['procurement-alerts'] }); },
  });
}

export function useMarkAllAlertsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => procurementApi.patch('/alerts/read-all', {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['procurement-alerts'] });
      qc.invalidateQueries({ queryKey: ['procurement-overview'] });
    },
  });
}
