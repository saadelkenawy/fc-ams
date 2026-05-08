import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { billingApi } from '@/lib/api';

export interface SourceFeeRule {
  id: number;
  sourceCode: string;
  sourceNameEn: string;
  sourceNameAr: string;
  feeType: 'percentage' | 'fixed';
  feeValue: number;
  deductFrom: 'clinic' | 'doctor' | 'both';
  isActive: boolean;
  validFrom: string;
  validUntil: string | null;
  specialtyId: number | null;
  lastModifiedAt: string;
}

export interface CreateSourceInput {
  sourceCode: string;
  sourceNameEn: string;
  sourceNameAr: string;
  feeType: 'percentage' | 'fixed';
  feeValue: number;
  deductFrom: 'clinic' | 'doctor' | 'both';
  isActive: boolean;
  validFrom: string;
  validUntil?: string;
}

export function useSources() {
  return useQuery({
    queryKey: ['sources'],
    queryFn: async () => {
      const { data } = await billingApi.get<{ success: boolean; data: SourceFeeRule[] }>('/sources');
      return data.data;
    },
    staleTime: 60_000,
  });
}

export function useCreateSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateSourceInput) => {
      const { data } = await billingApi.post<{ success: boolean; data: SourceFeeRule }>('/sources', input);
      return data.data;
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['sources'] }); },
  });
}

export function useUpdateSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ code, ...body }: Partial<CreateSourceInput> & { code: string }) => {
      const { data } = await billingApi.patch<{ success: boolean; data: SourceFeeRule }>(`/sources/${code}`, body);
      return data.data;
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['sources'] }); },
  });
}

export function useDeleteSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => {
      await billingApi.delete(`/sources/${code}`);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['sources'] }); },
  });
}
