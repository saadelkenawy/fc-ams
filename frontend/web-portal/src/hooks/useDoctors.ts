import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { doctorApi } from '@/lib/api';
import type {
  Doctor, DoctorSchedule, DoctorScheduleOverride, Specialty,
  PaginatedResponse, ApiResponse,
  DoctorConsultationHours, DoctorStatus, DoctorStatusLog, DoctorDayOverride,
  DoctorAvailability,
} from '@fadl/types';
import type { paths as DoctorPaths } from '@/types/api/doctor';

// ── §4.6 contract drift check ────────────────────────────────────────────────
// The generated contract (src/types/api/doctor.ts, regenerated from the
// service's exported OpenAPI spec) must keep providing every field the shared
// Doctor/Specialty types promise. OpenAPI expresses optionality as `| null`,
// TS as `?`/undefined — NoNulls bridges that; everything else (renamed/removed
// fields, changed primitives, widened enums) fails type-check right here.
type ContractDoctor =
  DoctorPaths['/api/v1/doctors']['get']['responses'][200]['content']['application/json']['data'][number];
type ContractSpecialty =
  DoctorPaths['/api/v1/specialties']['get']['responses'][200]['content']['application/json']['data'][number];
type NoNulls<T> = { [K in keyof T]: Exclude<T[K], null> };
type AssertAssignable<A extends B, B> = A;
type _DoctorContractCheck = AssertAssignable<NoNulls<ContractDoctor>, Doctor>;
type _SpecialtyContractCheck = AssertAssignable<NoNulls<ContractSpecialty>, Specialty>;

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
      qc.invalidateQueries({ queryKey: ['doctor-schedules', doctorId] });
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
      qc.invalidateQueries({ queryKey: ['doctor-overrides', doctorId] });
    },
  });
}

export function useUpdateDoctor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: Partial<Doctor> & { id: string }) => {
      const { data } = await doctorApi.patch<ApiResponse<Doctor>>(`/doctors/${id}`, body);
      return data.data!;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['doctors'] });
    },
  });
}

export function useToggleDoctorActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { data } = await doctorApi.patch<ApiResponse<Doctor>>(`/doctors/${id}/active`, { isActive });
      return data.data!;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['doctors'] });
    },
  });
}

export function useDeleteDoctor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await doctorApi.delete(`/doctors/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['doctors'] });
    },
  });
}

// ── Consultation Hours ────────────────────────────────────────────────────────

export function useConsultHours(doctorId: string) {
  return useQuery({
    queryKey: ['consult-hours', doctorId],
    queryFn: async () => {
      const { data } = await doctorApi.get<ApiResponse<DoctorConsultationHours[]>>(`/doctors/${doctorId}/consultation-hours`);
      return data.data ?? [];
    },
    enabled: !!doctorId,
    staleTime: 30_000,
  });
}

export function useUpsertConsultHours(doctorId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (hours: Array<{ dayOfWeek: number; startTime: string; endTime: string; slotDurationMins: number; maxPatients: number }>) => {
      const { data } = await doctorApi.put<ApiResponse<DoctorConsultationHours[]>>(
        `/doctors/${doctorId}/consultation-hours/bulk`,
        { hours },
      );
      return data.data!;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['consult-hours', doctorId] }); },
  });
}

// ── Doctor Status ─────────────────────────────────────────────────────────────

export function useDoctorStatus(doctorId: string) {
  return useQuery({
    queryKey: ['doctor-status', doctorId],
    queryFn: async () => {
      const { data } = await doctorApi.get<ApiResponse<{ status: DoctorStatus; statusNote?: string; statusUpdatedAt: string }>>(`/doctors/${doctorId}/status`);
      return data.data!;
    },
    enabled: !!doctorId,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

export function useChangeDoctorStatus(doctorId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { status: DoctorStatus; note?: string }) => {
      const { data } = await doctorApi.patch<ApiResponse<DoctorStatusLog>>(`/doctors/${doctorId}/status`, body);
      return data.data!;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['doctor-status', doctorId] });
      qc.invalidateQueries({ queryKey: ['doctors'] });
    },
  });
}

// ── Availability ──────────────────────────────────────────────────────────────

export function useDoctorAvailability(doctorId: string, date: string) {
  return useQuery({
    queryKey: ['doctor-availability', doctorId, date],
    queryFn: async () => {
      const { data } = await doctorApi.get<ApiResponse<DoctorAvailability>>(`/doctors/${doctorId}/availability`, { params: { date } });
      return data.data!;
    },
    enabled: !!doctorId && !!date,
    staleTime: 60_000,
  });
}
