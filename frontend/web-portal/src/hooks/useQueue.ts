import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { appointmentApi } from '@/lib/api';
import type { PatientQueueEntry, QueueStats, ApiResponse } from '@fadl/types';

const TODAY = () => new Date().toISOString().split('T')[0];

export function useQueue(doctorId: string, date?: string) {
  const d = date ?? TODAY();
  return useQuery({
    queryKey: ['queue', doctorId, d],
    queryFn: async () => {
      const { data } = await appointmentApi.get<ApiResponse<PatientQueueEntry[]>>('/queue', { params: { doctorId, date: d } });
      return data.data ?? [];
    },
    enabled: !!doctorId,
    refetchInterval: 15_000,
    staleTime: 5_000,
  });
}

export function useQueueStats(doctorId: string, date?: string) {
  const d = date ?? TODAY();
  return useQuery({
    queryKey: ['queue-stats', doctorId, d],
    queryFn: async () => {
      const { data } = await appointmentApi.get<ApiResponse<QueueStats>>('/queue/stats', { params: { doctorId, date: d } });
      return data.data!;
    },
    enabled: !!doctorId,
    refetchInterval: 15_000,
    staleTime: 5_000,
  });
}

export function useQueuePosition(queueId: string) {
  return useQuery({
    queryKey: ['queue-entry', queueId],
    queryFn: async () => {
      const { data } = await appointmentApi.get<ApiResponse<PatientQueueEntry>>(`/queue/${queueId}`);
      return data.data!;
    },
    enabled: !!queueId,
    refetchInterval: 10_000,
  });
}

function useQueueMutation(queueId: string, action: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await appointmentApi.post<ApiResponse<PatientQueueEntry>>(`/queue/${queueId}/${action}`);
      return data.data!;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['queue'] });
      void qc.invalidateQueries({ queryKey: ['queue-stats'] });
      void qc.invalidateQueries({ queryKey: ['queue-entry', queueId] });
    },
  });
}

export function useCallPatient(queueId: string) { return useQueueMutation(queueId, 'call'); }
export function useStartSession(queueId: string) { return useQueueMutation(queueId, 'start-session'); }
export function useCompleteSession(queueId: string) { return useQueueMutation(queueId, 'complete'); }
export function useMarkNoShow(queueId: string) { return useQueueMutation(queueId, 'no-show'); }
export function useRejoinQueue(queueId: string) { return useQueueMutation(queueId, 'rejoin'); }

export function useCancelFromQueue(queueId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await appointmentApi.delete<ApiResponse<PatientQueueEntry>>(`/queue/${queueId}`);
      return data.data!;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['queue'] });
      void qc.invalidateQueries({ queryKey: ['queue-stats'] });
    },
  });
}

export function useCheckIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { appointmentId: string; doctorId: string; patientId: string; queueDate: string }) => {
      const { data } = await appointmentApi.post<ApiResponse<PatientQueueEntry>>('/queue/check-in', body);
      return data.data!;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['queue'] });
      void qc.invalidateQueries({ queryKey: ['queue-stats'] });
    },
  });
}
