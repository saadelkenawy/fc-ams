import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { billingApi } from '@/lib/api';
import type { FinancialTransaction, DoctorSettlement, PaginatedResponse } from '@fadl/types';

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
    keepPreviousData: true,
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
      void qc.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
}

export interface SettlementParams {
  from: string;
  to: string;
  page?: number;
  limit?: number;
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
      void qc.invalidateQueries({ queryKey: ['extra-services', vars.transactionId] });
      void qc.invalidateQueries({ queryKey: ['transactions'] });
      void qc.invalidateQueries({ queryKey: ['settlements'] });
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
      void qc.invalidateQueries({ queryKey: ['transactions'] });
      void qc.invalidateQueries({ queryKey: ['settlements'] });
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

export function useReconcileDoctor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ doctorId, from, to }: { doctorId: string; from: string; to: string }) => {
      const { data } = await billingApi.post<{ data: ReconcileResult }>('/settlements/reconcile', { doctorId, from, to });
      return data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['settlements'] });
      void qc.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
}

export function useBulkDeleteTransactions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, reason, password }: { ids: string[]; reason: string; password: string }) => {
      const { data } = await billingApi.post<{ data: { deletedCount: number } }>('/transactions/bulk-delete', { ids, reason, password });
      return data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['transactions'] });
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
      void qc.invalidateQueries({ queryKey: ['transactions'] });
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
    retry: 1,
  });
}
