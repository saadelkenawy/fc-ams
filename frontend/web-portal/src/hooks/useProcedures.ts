import { useQuery } from '@tanstack/react-query';
import { procedureApi } from '@/lib/api';

export interface Procedure {
  id: string;
  code: string;
  nameEn: string;
  nameAr?: string;
  procedureType: 'consultation' | 'follow_up' | 'operative' | 'settling_fee' | 'lab_test' | 'imaging';
  specialtyId: number;
  basePrice: number;
  durationMinutes: number;
  requiresPreAuth: boolean;
  isActive: boolean;
  version: number;
}

export function useProcedures(params: {
  specialtyId?: number;
  procedureType?: string;
  isActive?: boolean;
  q?: string;
  page?: number;
  limit?: number;
} = {}) {
  return useQuery({
    queryKey: ['procedures', params],
    queryFn: async () => {
      const { data } = await procedureApi.get<{
        success: boolean;
        data: Procedure[];
        total: number;
        page: number;
        limit: number;
      }>('/procedures', { params });
      return data;
    },
    staleTime: 60_000,
    keepPreviousData: true,
  });
}
