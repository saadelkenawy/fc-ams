import { useQuery } from '@tanstack/react-query';
import { patientApi } from '@/lib/api';
import type { Patient, PaginatedResponse, ApiResponse } from '@fadl/types';

export interface PatientListParams {
  q?: string;
  page?: number;
  limit?: number;
}

export function usePatients(params: PatientListParams = {}) {
  return useQuery({
    queryKey: ['patients', params],
    queryFn: async () => {
      const { data } = await patientApi.get<ApiResponse<PaginatedResponse<Patient>>>('/patients', { params });
      return data.data!;
    },
    staleTime: 30_000,
    keepPreviousData: true,
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
