import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { appointmentApi } from '@/lib/api';
import type { RoomDetail, AssignRoomResult, ClinicRoom, RoomStats, ApiResponse } from '@fadl/types';

const TODAY = () => new Date().toISOString().split('T')[0];

export function useRooms(date?: string) {
  const d = date ?? TODAY();
  return useQuery({
    queryKey: ['rooms', d],
    queryFn: async () => {
      const { data } = await appointmentApi.get<ApiResponse<RoomDetail[]>>('/rooms', { params: { date: d } });
      return data.data ?? [];
    },
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
}

export function useRoomAvailability(date?: string) {
  const d = date ?? TODAY();
  return useQuery({
    queryKey: ['room-availability', d],
    queryFn: async () => {
      const { data } = await appointmentApi.get<ApiResponse<{ roomCode: string; status: string }[]>>('/rooms/availability', { params: { date: d } });
      return data.data ?? [];
    },
    refetchInterval: 30_000,
    staleTime: 5_000,
  });
}

export function useRoomStats() {
  return useQuery({
    queryKey: ['room-stats'],
    queryFn: async () => {
      const { data } = await appointmentApi.get<ApiResponse<RoomStats[]>>('/rooms/stats');
      return data.data ?? [];
    },
    staleTime: 60_000,
  });
}

// SSE hook — injects real-time room events directly into React Query cache
export function useRoomSSE(date?: string) {
  const qc = useQueryClient();
  const d = date ?? TODAY();
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const base = (process.env.NEXT_PUBLIC_APPOINTMENT_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const url = `${base}/api/v1/rooms/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`;

    const es = new EventSource(url);
    esRef.current = es;

    const invalidateRooms = () => {
      qc.invalidateQueries({ queryKey: ['rooms', d] });
      qc.invalidateQueries({ queryKey: ['room-availability', d] });
    };

    es.addEventListener('room_assigned', invalidateRooms);
    es.addEventListener('room_released', invalidateRooms);
    es.addEventListener('room_updated', invalidateRooms);
    es.addEventListener('room_status_changed', invalidateRooms);
    es.addEventListener('error', () => { es.close(); });

    return () => { es.close(); esRef.current = null; };
  }, [d, qc]);
}

// ── Mutations ────────────────────────────────────────────────────────────────

export function useAssignRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { roomCode: string; doctorId: string; date?: string; fromTime: string; untilTime: string }) => {
      const { roomCode, ...rest } = body;
      const { data } = await appointmentApi.post<ApiResponse<AssignRoomResult>>(`/rooms/${roomCode}/assign`, rest);
      return data.data!;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rooms'] });
      qc.invalidateQueries({ queryKey: ['room-availability'] });
    },
  });
}

export function useAutoAssignRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { doctorId: string; date?: string; fromTime?: string; untilTime?: string }) => {
      const payload = { fromTime: '08:00', untilTime: '18:00', ...body };
      const { data } = await appointmentApi.post<ApiResponse<AssignRoomResult>>('/rooms/auto-assign', payload);
      return data.data!;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rooms'] });
    },
  });
}

export function useReleaseRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { roomCode: string; date?: string }) => {
      const { roomCode, date } = body;
      const params = date ? { date } : {};
      const { data } = await appointmentApi.delete<ApiResponse<unknown>>(`/rooms/${roomCode}/assignment`, { params });
      return data;
    },
    onMutate: async ({ roomCode }) => {
      await qc.cancelQueries({ queryKey: ['rooms'] });
      const snapshots = qc.getQueriesData<RoomDetail[]>({ queryKey: ['rooms'] });
      qc.setQueriesData<RoomDetail[]>({ queryKey: ['rooms'] }, (old) =>
        old?.map((r) =>
          r.roomCode === roomCode
            ? { ...r, status: 'available' as const, assignedDoctor: null, assignmentId: null }
            : r,
        ),
      );
      return { snapshots };
    },
    onError: (_err, _vars, context) => {
      if (context?.snapshots) {
        for (const [key, data] of context.snapshots) {
          qc.setQueryData(key, data);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rooms'] });
    },
  });
}

export function useUpdateRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { roomCode: string; roomName?: string; floor?: number | null; description?: string | null; isActive?: boolean }) => {
      const { roomCode, ...rest } = body;
      const { data } = await appointmentApi.patch<ApiResponse<ClinicRoom>>(`/rooms/${roomCode}/settings`, rest);
      return data.data!;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rooms'] });
    },
  });
}

export interface NextPatientResult {
  completed: {
    appointmentId: string;
    patientId: string;
    doctorId: string;
    patientSource: string;
    approvedCharge: number;
    splitDoctorPercentage: number;
    splitClinicPercentage: number;
    specialtyId: number | null;
    durationMins: number;
    sessionStart: string | null;
  };
  next: {
    queueId: string;
    appointmentId: string;
    patientId: string;
    position: number;
  } | null;
}

export function useNextPatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { roomCode: string; appointmentId: string }) => {
      const { roomCode, appointmentId } = body;
      const { data } = await appointmentApi.post<ApiResponse<NextPatientResult>>(
        `/rooms/${roomCode}/next-patient`,
        { appointmentId },
      );
      return data.data!;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rooms'] });
      qc.invalidateQueries({ queryKey: ['appointments'] });
      qc.invalidateQueries({ queryKey: ['queue'] });
    },
  });
}
