import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useMemo } from 'react';
import { patientApi } from '@/lib/api';
import type { Patient, PaginatedResponse, ApiResponse } from '@fadl/types';
import type { paths as PatientPaths } from '@/types/api/patient';

// ── §4.6 contract drift check ────────────────────────────────────────────────
// The generated contract (src/types/api/patient.ts, regenerated from the
// service's exported OpenAPI spec) must keep providing every field the shared
// Patient type promises. OpenAPI expresses optionality as `| null`, TS as
// `?`/undefined — NoNulls bridges that; everything else (renamed/removed
// fields, changed primitives) fails type-check right here.
type ContractPatient =
  PatientPaths['/api/v1/patients']['get']['responses'][200]['content']['application/json']['data'][number];
type NoNulls<T> = { [K in keyof T]: Exclude<T[K], null> };
type AssertAssignable<A extends B, B> = A;
type _PatientContractCheck = AssertAssignable<NoNulls<ContractPatient>, Patient>;

export interface PatientListParams {
  query?: string;
  page?: number;
  limit?: number;
  isFutureSource?: boolean;
  enabled?: boolean;
}

export function usePatients(params: PatientListParams = {}) {
  const { enabled = true, ...queryParams } = params;
  return useQuery({
    queryKey: ['patients', queryParams],
    queryFn: async () => {
      const res = await patientApi.get('/patients', { params: queryParams });
      return res.data as PaginatedResponse<Patient>;
    },
    enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function usePatient(id: string | null) {
  return useQuery({
    queryKey: ['patient', id],
    queryFn: async () => {
      const { data } = await patientApi.get<ApiResponse<Patient>>(`/patients/${id}`);
      return data.data!;
    },
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useUpdatePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: Partial<Patient> & { id: string }) => {
      const { data } = await patientApi.patch<ApiResponse<Patient>>(`/patients/${id}`, body);
      return data.data!;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patients'] });
    },
  });
}

export function usePatientMap() {
  const { data } = usePatients({ limit: 500 });
  return useMemo(() => {
    const map = new Map<string, Patient>();
    data?.data?.forEach((p) => map.set(p.patientId, p));
    return map;
  }, [data]);
}

export function useDeletePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await patientApi.delete(`/patients/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patients'] });
    },
  });
}

interface PatientNameRecord {
  patientId: string;
  nameEn: string;
  nameAr: string | null;
}

export function usePatientBatch(ids: string[]) {
  const key = [...new Set(ids)].sort().join(',');
  const uniqueIds = useMemo(() => (key ? key.split(',') : []), [key]);

  const { data = [] } = useQuery({
    queryKey: ['patients-batch', key],
    queryFn: async (): Promise<PatientNameRecord[]> => {
      if (!uniqueIds.length) return [];
      const res = await patientApi.get<{ data: PatientNameRecord[] }>('/patients/batch', {
        params: { ids: uniqueIds.join(',') },
      });
      return res.data.data ?? [];
    },
    enabled: uniqueIds.length > 0,
    staleTime: 5 * 60_000,
  });

  return useMemo(() => {
    const map = new Map<string, PatientNameRecord>();
    data.forEach((p) => map.set(p.patientId, p));
    return map;
  }, [data]);
}
