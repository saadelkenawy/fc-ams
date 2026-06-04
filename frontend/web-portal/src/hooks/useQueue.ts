import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { appointmentApi } from '@/lib/api';
import type { PatientQueueEntry, QueueStats, QueueCancelPreview, ApiResponse } from '@fadl/types';

const TODAY = () => new Date().toISOString().split('T')[0];

// ── Standard queries ──────────────────────────────────────────────────────────

export function useQueue(doctorId: string, date?: string, enabled = true) {
  const d = date ?? TODAY();
  return useQuery({
    queryKey: ['queue', doctorId, d],
    queryFn: async () => {
      const { data } = await appointmentApi.get<ApiResponse<PatientQueueEntry[]>>('/queue', { params: { doctorId, date: d } });
      return data.data ?? [];
    },
    enabled: enabled && !!doctorId,
    refetchInterval: 20_000,
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
    refetchInterval: 20_000,
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

export function useCancelPreview(queueId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['queue-cancel-preview', queueId],
    queryFn: async () => {
      const { data } = await appointmentApi.get<ApiResponse<QueueCancelPreview>>(`/queue/${queueId}/cancel-preview`);
      return data.data!;
    },
    enabled: enabled && !!queueId,
    staleTime: 0,
  });
}

// ── SSE real-time subscription ────────────────────────────────────────────────

export function useQueueSSE(doctorId: string, date?: string) {
  const qc = useQueryClient();
  const d = date ?? TODAY();
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!doctorId) return;

    const base = (process.env.NEXT_PUBLIC_APPOINTMENT_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const url = `${base}/queue/stream?doctorId=${doctorId}&date=${d}${token ? `&token=${encodeURIComponent(token)}` : ''}`;

    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener('queue_update', (e: MessageEvent) => {
      const payload = JSON.parse(e.data as string) as { queue: PatientQueueEntry[]; stats: QueueStats; doctorId: string; date: string };
      qc.setQueryData(['queue', payload.doctorId, payload.date], payload.queue);
      qc.setQueryData(['queue-stats', payload.doctorId, payload.date], payload.stats);
    });

    es.addEventListener('error', () => { es.close(); });

    return () => { es.close(); esRef.current = null; };
  }, [doctorId, d, qc]);
}

// ── Mutations ─────────────────────────────────────────────────────────────────

function useQueueMutation(queueId: string, action: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await appointmentApi.post<ApiResponse<PatientQueueEntry>>(`/queue/${queueId}/${action}`);
      return data.data!;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['queue'] });
      qc.invalidateQueries({ queryKey: ['queue-stats'] });
      qc.invalidateQueries({ queryKey: ['queue-entry', queueId] });
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
    mutationFn: async (reason?: string) => {
      const { data } = await appointmentApi.delete<ApiResponse<{
        entry: PatientQueueEntry;
        cancelledPosition: number;
        newPosition: number;
        patientsShifted: Array<{ patientId: string; oldPosition: number; newPosition: number }>;
      }>>(`/queue/${queueId}`, reason ? { data: { reason } } : undefined);
      return data.data!;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['queue'] });
      qc.invalidateQueries({ queryKey: ['queue-stats'] });
      qc.invalidateQueries({ queryKey: ['queue-cancel-preview', queueId] });
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
      qc.invalidateQueries({ queryKey: ['queue'] });
      qc.invalidateQueries({ queryKey: ['queue-stats'] });
    },
  });
}
