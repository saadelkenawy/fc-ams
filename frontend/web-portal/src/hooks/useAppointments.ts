import { useQuery } from '@tanstack/react-query';
import { appointmentApi } from '@/lib/api';
import type { Appointment, AppointmentStatus, PaginatedResponse } from '@fadl/types';

export interface AppointmentListParams {
  date?: string;
  status?: AppointmentStatus;
  doctorId?: string;
  patientId?: string;
  page?: number;
  limit?: number;
}

export function useAppointments(params: AppointmentListParams = {}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['appointments', params],
    queryFn: async () => {
      const qs: Record<string, string | number> = { limit: params.limit ?? 100 };
      if (params.date)      qs.date      = params.date;
      if (params.status)    qs.status    = params.status;
      if (params.doctorId)  qs.doctorId  = params.doctorId;
      if (params.patientId) qs.patientId = params.patientId;
      if (params.page)      qs.page      = params.page;
      const res = await appointmentApi.get('/appointments', { params: qs });
      return res.data as PaginatedResponse<Appointment>;
    },
    enabled: options?.enabled !== false,
    staleTime: 15_000,
    keepPreviousData: true,
  });
}

export function useTodayAppointments() {
  const today = new Date().toISOString().split('T')[0];
  return useAppointments({ date: today, limit: 50 });
}

export function useDoctorsOnDate(date: string) {
  return useQuery({
    queryKey: ['appointments', 'doctors-on-date', date],
    queryFn: async () => {
      const res = await appointmentApi.get<{ success: boolean; data: { doctorId: string; appointmentCount: number }[] }>(
        '/appointments/doctors-on-date',
        { params: { date } },
      );
      return res.data.data ?? [];
    },
    staleTime: 15_000,
  });
}
