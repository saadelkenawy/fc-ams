import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
      const res = await patientApi.get('/patients', { params });
      return res.data as PaginatedResponse<Patient>;
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

export function useUpdatePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: Partial<Patient> & { id: string }) => {
      const { data } = await patientApi.patch<ApiResponse<Patient>>(`/patients/${id}`, body);
      return data.data!;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['patients'] });
    },
  });
}

export function useDeletePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await patientApi.delete(`/patients/${id}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['patients'] });
    },
  });
}
