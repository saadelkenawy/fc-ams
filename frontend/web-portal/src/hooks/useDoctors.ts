import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { doctorApi } from '@/lib/api';
import type { Doctor, DoctorSchedule, DoctorScheduleOverride, Specialty, PaginatedResponse, ApiResponse } from '@fadl/types';

export function useDoctors(params: { isActive?: boolean; limit?: number } = {}) {
  return useQuery({
    queryKey: ['doctors', params],
    queryFn: async () => {
      const qs: Record<string, string> = { limit: String(params.limit ?? 100) };
      if (params.isActive !== undefined) qs.isActive = String(params.isActive);
      const res = await doctorApi.get('/doctors', { params: qs });
      return res.data as PaginatedResponse<Doctor>;
    },
    staleTime: 60_000,
  });
}

export function useDoctorMap() {
  const { data } = useDoctors({ limit: 200 });
  return useMemo(() => {
    const map = new Map<string, Doctor>();
    data?.data.forEach((d) => map.set(d.id, d));
    return map;
  }, [data]);
}

export function useSpecialties() {
  return useQuery({
    queryKey: ['specialties'],
    queryFn: async () => {
      const { data } = await doctorApi.get<ApiResponse<Specialty[]>>('/specialties');
      return data.data ?? [];
    },
    staleTime: 5 * 60_000,
  });
}

export function useSpecialtyMap() {
  const { data } = useSpecialties();
  return useMemo(() => {
    const map = new Map<number, Specialty>();
    data?.forEach((s) => map.set(s.id, s));
    return map;
  }, [data]);
}

export function useDoctorSchedules(doctorId: string) {
  return useQuery({
    queryKey: ['doctor-schedules', doctorId],
    queryFn: async () => {
      const { data } = await doctorApi.get<ApiResponse<DoctorSchedule[]>>(`/doctors/${doctorId}/schedules`);
      return data.data ?? [];
    },
    enabled: !!doctorId,
    staleTime: 30_000,
  });
}

export function useDoctorScheduleOverrides(doctorId: string, from?: string) {
  return useQuery({
    queryKey: ['doctor-overrides', doctorId, from],
    queryFn: async () => {
      const params = from ? { from } : {};
      const { data } = await doctorApi.get<ApiResponse<DoctorScheduleOverride[]>>(
        `/doctors/${doctorId}/schedule-overrides`,
        { params },
      );
      return data.data ?? [];
    },
    enabled: !!doctorId,
    staleTime: 30_000,
  });
}

export function useUpsertSchedule(doctorId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      slotDurationMinutes: number;
      validFrom: string;
    }) => {
      const { data } = await doctorApi.put<ApiResponse<DoctorSchedule>>(
        `/doctors/${doctorId}/schedules`,
        body,
      );
      return data.data!;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['doctor-schedules', doctorId] });
    },
  });
}

export function useCreateOverride(doctorId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      overrideDate: string;
      overrideType: 'unavailable' | 'custom_hours' | 'holiday';
      customStartTime?: string;
      customEndTime?: string;
      reason?: string;
      notifyPatients: boolean;
    }) => {
      const { data } = await doctorApi.post<ApiResponse<DoctorScheduleOverride>>(
        `/doctors/${doctorId}/schedule-overrides`,
        body,
      );
      return data.data!;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['doctor-overrides', doctorId] });
    },
  });
}
