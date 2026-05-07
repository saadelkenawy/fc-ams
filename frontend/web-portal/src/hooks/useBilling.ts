import { useQuery } from '@tanstack/react-query';
import { billingApi } from '@/lib/api';
import type { FinancialTransaction, DoctorSettlement, PaginatedResponse, ApiResponse } from '@fadl/types';

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
      if (params.status)   qs.status   = params.status;
      if (params.dateFrom) qs.dateFrom = params.dateFrom;
      if (params.dateTo)   qs.dateTo   = params.dateTo;
      if (params.doctorId) qs.doctorId = params.doctorId;
      if (params.patientId) qs.patientId = params.patientId;
      if (params.page)     qs.page     = params.page;
      const res = await billingApi.get('/transactions', { params: qs });
      return res.data as PaginatedResponse<FinancialTransaction>;
    },
    staleTime: 20_000,
    keepPreviousData: true,
  });
}

export interface SettlementParams {
  from: string;
  to: string;
  page?: number;
  limit?: number;
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
  });
}
