import { useQuery } from '@tanstack/react-query';
import { ehrApi } from '@/lib/api';

export interface Encounter {
  id: string;
  patientId: string;
  appointmentId?: string;
  doctorId: string;
  encounterDate: string;
  encounterType: 'outpatient' | 'inpatient' | 'emergency' | 'telehealth' | 'follow_up';
  status: 'draft' | 'in_progress' | 'completed' | 'signed_off';
  chiefComplaint?: string;
  diagnosisPrimary?: string;
  clinicalNotes?: string;
  vitalSigns?: Record<string, unknown>;
  labOrders?: unknown[];
  followUpDate?: string;
  followUpNotes?: string;
  version: number;
  createdAt: string;
}

export function useEncounters(params: {
  patientId?: string;
  doctorId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
} = {}) {
  return useQuery({
    queryKey: ['encounters', params],
    queryFn: async () => {
      const { data } = await ehrApi.get<{
        success: boolean;
        data: Encounter[];
        total: number;
        page: number;
        limit: number;
      }>('/encounters', { params });
      return data;
    },
    staleTime: 30_000,
    keepPreviousData: true,
  });
}
