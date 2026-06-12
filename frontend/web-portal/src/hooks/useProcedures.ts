import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { procedureApi } from '@/lib/api';
import type { paths as ProcedurePaths } from '@/types/api/procedure';

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

export interface ProcedurePayload {
  code: string;
  nameEn: string;
  nameAr?: string;
  procedureType: Procedure['procedureType'];
  specialtyId: number;
  basePrice: number;
  durationMinutes: number;
  requiresPreAuth: boolean;
  isActive: boolean;
}

// ── §4.6 contract drift check ────────────────────────────────────────────────
// The generated contract (src/types/api/procedure.ts, regenerated from the
// service's exported OpenAPI spec) must keep providing every field the local
// Procedure type promises. OpenAPI expresses optionality as `| null`, TS as
// `?`/undefined — NoNulls bridges that; everything else fails type-check here.
type ContractProcedure =
  ProcedurePaths['/api/v1/procedures']['get']['responses'][200]['content']['application/json']['data'][number];
type NoNulls<T> = { [K in keyof T]: Exclude<T[K], null> };
type AssertAssignable<A extends B, B> = A;
type _ProcedureContractCheck = AssertAssignable<NoNulls<ContractProcedure>, Procedure>;

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
    placeholderData: keepPreviousData,
  });
}

export function useCreateProcedure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ProcedurePayload) => {
      const { data } = await procedureApi.post<{ success: boolean; data: Procedure }>('/procedures', payload);
      return data.data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['procedures'] }); },
  });
}

export function useUpdateProcedure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: Partial<ProcedurePayload> & { id: string }) => {
      const { data } = await procedureApi.patch<{ success: boolean; data: Procedure }>(`/procedures/${id}`, payload);
      return data.data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['procedures'] }); },
  });
}

/** Returns a Map<id, Procedure> for fast lookup by UUID — fetches all active procedures. */
export function useProcedureMap(): Map<string, Procedure> {
  const { data } = useProcedures({ isActive: true, limit: 200 });
  const procedures = data?.data ?? [];
  return new Map(procedures.map((p) => [p.id, p]));
}

export function useDeleteProcedure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await procedureApi.delete(`/procedures/${id}`);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['procedures'] }); },
  });
}
