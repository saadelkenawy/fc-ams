import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { billingApi } from '@/lib/api';
import type { FinancialTransaction, DoctorSettlement, PaginatedResponse } from '@fadl/types';
import type { paths as BillingPaths } from '@/types/api/billing';

// ── §4.6 contract drift check ────────────────────────────────────────────────
// The generated contract (src/types/api/billing.ts, regenerated from the
// service's exported OpenAPI spec) must keep providing every field the shared
// FinancialTransaction type promises. OpenAPI expresses optionality as
// `| null`, TS as `?`/undefined — NoNulls bridges that; everything else
// (renamed/removed fields, changed primitives, widened enums) fails
// type-check right here.
type ContractTransaction =
  BillingPaths['/api/v1/transactions']['get']['responses'][200]['content']['application/json']['data'][number];
type NoNulls<T> = { [K in keyof T]: Exclude<T[K], null> };
type AssertAssignable<A extends B, B> = A;
type _TransactionContractCheck = AssertAssignable<NoNulls<ContractTransaction>, FinancialTransaction>;

export interface TransactionListParams {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  doctorId?: string;
  patientId?: string;
  page?: number;
  limit?: number;
}

export function useTransactions(params: TransactionListParams = {}) {
  return useQuery({
    queryKey: ['transactions', params],
    queryFn: async () => {
      const qs: Record<string, string | number> = { limit: params.limit ?? 50 };
      if (params.status)    qs.status    = params.status;
      if (params.dateFrom)  qs.dateFrom  = params.dateFrom;
      if (params.dateTo)    qs.dateTo    = params.dateTo;
      if (params.doctorId)  qs.doctorId  = params.doctorId;
      if (params.patientId) qs.patientId = params.patientId;
      if (params.page)      qs.page      = params.page;
      const res = await billingApi.get('/transactions', { params: qs });
      return res.data as PaginatedResponse<FinancialTransaction>;
    },
    staleTime: 15_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
  });
}

export function useUpdateTransactionStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { data } = await billingApi.patch<{ data: FinancialTransaction }>(`/transactions/${id}/status`, { status });
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
}

export interface SettlementParams {
  from: string;
  to: string;
  page?: number;
  limit?: number;
  unsettledOnly?: boolean;
}

export interface ExtraServiceItem {
  id: string;
  transactionId: string;
  serviceName: string;
  cost: number;
  createdAt: string;
  createdBy: string | null;
}

export function useExtraServices(transactionId: string | null) {
  return useQuery({
    queryKey: ['extra-services', transactionId],
    queryFn: async () => {
      const res = await billingApi.get(`/transactions/${transactionId}/extra-services`);
      return res.data.data as ExtraServiceItem[];
    },
    enabled: !!transactionId,
    staleTime: 30_000,
  });
}

export function useReplaceExtraServices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      transactionId,
      items,
    }: {
      transactionId: string;
      items: Array<{ serviceName: string; cost: number }>;
    }) => {
      const { data } = await billingApi.put<{ data: ExtraServiceItem[] }>(
        `/transactions/${transactionId}/extra-services`,
        { items },
      );
      return data.data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['extra-services', vars.transactionId] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['settlements'] });
    },
  });
}

export function useUpdateProcedureCost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, procedureCost }: { id: string; procedureCost: number | null }) => {
      const { data } = await billingApi.patch<{ data: FinancialTransaction }>(
        `/transactions/${id}/procedure-cost`,
        { procedureCost },
      );
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['settlements'] });
    },
  });
}

export interface ReconcileResult {
  reconciledCount: number;
  doctorShare: number;
  clinicShare: number;
  grossRevenue: number;
  transactionIds: string[];
  settlementRecordId: string;
}

export function useBulkDeleteTransactions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, reason, password }: { ids: string[]; reason: string; password: string }) => {
      const { data } = await billingApi.post<{ data: { deletedCount: number } }>('/transactions/bulk-delete', { ids, reason, password });
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
}

export function useBulkEditPaymentMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, paymentMethod, reason, password }: { ids: string[]; paymentMethod: string; reason: string; password: string }) => {
      const { data } = await billingApi.patch<{ data: { updatedCount: number } }>('/transactions/bulk/payment-method', { ids, paymentMethod, reason, password });
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
}

export function useSettlements(params: SettlementParams) {
  return useQuery({
    queryKey: ['settlements', params],
    queryFn: async () => {
      const res = await billingApi.get('/settlements', { params });
      return res.data as PaginatedResponse<DoctorSettlement>;
    },
    enabled: !!params.from && !!params.to,
    staleTime: 30_000,
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
    retry: 1,
  });
}

export interface SettlementRecordItem {
  id: string;
  doctorId: string;
  settlementDate: string;
  periodFrom: string | null;
  periodTo: string | null;
  amount: number;
  paymentMethod: string;
  paymentReference: string | null;
  voucherNo: string | null;
  notes: string | null;
  processedByUserId: string | null;
  relatedTransactionIds: string[];
  reversedAt: string | null;
  reversedBy: string | null;
  reversedReason: string | null;
  branchId: number;
  createdAt: string;
}

export function useSettlementRecords(params: { doctorId?: string; from?: string; to?: string; page?: number; limit?: number }) {
  return useQuery({
    queryKey: ['settlement-records', params],
    queryFn: async () => {
      const res = await billingApi.get('/settlements/records', { params });
      return res.data as PaginatedResponse<SettlementRecordItem>;
    },
    staleTime: 30_000,
    retry: 1,
  });
}

export function useReverseSettlement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason, password }: { id: string; reason: string; password: string }) => {
      const { data } = await billingApi.post<{ data: SettlementRecordItem }>(`/settlements/records/${id}/reverse`, { reason, password });
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settlement-records'] });
      qc.invalidateQueries({ queryKey: ['settlements'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
}

export function useReconcileDoctor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      doctorId: string;
      from: string;
      to: string;
      paymentMethod?: string;
      paymentReference?: string;
      voucherNo: string;
      notes: string;
      password: string;
    }) => {
      const { data } = await billingApi.post<{ data: ReconcileResult }>('/settlements/reconcile', payload);
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settlements'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['settlement-records'] });
    },
  });
}

export interface DoctorCompensationRule {
  id: string;
  doctorId: string;
  visitType: 'consultation' | 'operative' | 'online';
  doctorPercentage: number;
  clinicPercentage: number;
  effectiveFrom: string;
  effectiveUntil: string | null;
  branchId: number;
  createdAt: string;
}

export function useDoctorCompensation(doctorId: string | null) {
  return useQuery({
    queryKey: ['doctor-compensation', doctorId],
    queryFn: async () => {
      const { data } = await billingApi.get<{ data: DoctorCompensationRule[] }>(`/compensation/${doctorId}`);
      return data.data ?? [];
    },
    enabled: !!doctorId,
    staleTime: 60_000,
  });
}

export function useSetDoctorCompensation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      doctorId: string;
      visitType: string;
      doctorPercentage: number;
      clinicPercentage: number;
      effectiveFrom: string;
      applyToExisting?: boolean;
    }) => {
      const { data } = await billingApi.post<{ data: DoctorCompensationRule }>(
        `/compensation/${payload.doctorId}`,
        payload,
      );
      return data.data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['doctor-compensation', vars.doctorId] });
      qc.invalidateQueries({ queryKey: ['settlements'] });
    },
  });
}

export function useDeleteCompensationRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, doctorId }: { id: string; doctorId: string }) => {
      await billingApi.delete(`/compensation/rules/${id}`);
      return doctorId;
    },
    onSuccess: (doctorId) => {
      qc.invalidateQueries({ queryKey: ['doctor-compensation', doctorId] });
    },
  });
}
