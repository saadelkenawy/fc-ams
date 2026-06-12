import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { billingApi } from '@/lib/api';
import type { paths as BillingPaths } from '@/types/api/billing';

export interface SpecialtyRate {
  specialtyId: number;
  feeValue: number;
}

export interface SourceFeeRule {
  id: number;
  sourceCode: string;
  sourceNameEn: string;
  sourceNameAr: string;
  feeType: 'percentage' | 'fixed';
  feeValue: number;
  deductFrom: 'clinic' | 'doctor' | 'both';
  isGeneral: boolean;
  isActive: boolean;
  validFrom: string;
  validUntil: string | null;
  specialtyRates: SpecialtyRate[];
  lastModifiedAt: string;
}

export interface CreateSourceInput {
  sourceCode: string;
  sourceNameEn: string;
  sourceNameAr: string;
  feeType: 'percentage' | 'fixed';
  feeValue: number;
  deductFrom: 'clinic' | 'doctor' | 'both';
  isGeneral: boolean;
  isActive: boolean;
  validFrom: string;
  validUntil?: string;
  specialtyRates?: SpecialtyRate[];
}

// ── §4.6 contract drift check ────────────────────────────────────────────────
// The generated contract (src/types/api/billing.ts, regenerated from the
// service's exported OpenAPI spec) must keep providing every field the local
// SourceFeeRule type promises. OpenAPI expresses optionality as `| null`, TS
// as `?`/undefined — NoNulls bridges that; everything else fails type-check
// right here.
type ContractSource =
  BillingPaths['/api/v1/sources']['get']['responses'][200]['content']['application/json']['data'][number];
type NoNulls<T> = { [K in keyof T]: Exclude<T[K], null> };
type AssertAssignable<A extends B, B> = A;
type _SourceContractCheck = AssertAssignable<NoNulls<ContractSource>, SourceFeeRule>;

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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sources'] }); },
  });
}

export function useUpdateSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ code, ...body }: Partial<CreateSourceInput> & { code: string }) => {
      const { data } = await billingApi.patch<{ success: boolean; data: SourceFeeRule }>(`/sources/${code}`, body);
      return data.data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sources'] }); },
  });
}

export function useDeleteSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => {
      await billingApi.delete(`/sources/${code}`);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sources'] }); },
  });
}
