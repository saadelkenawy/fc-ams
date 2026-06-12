import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ehrApi } from '@/lib/api';
import type { paths as EhrPaths } from '@/types/api/ehr';

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

// ── §4.6 contract drift check ────────────────────────────────────────────────
// The generated contract (src/types/api/ehr.ts, regenerated from the service's
// exported OpenAPI spec) must keep providing every field the local Encounter
// type promises. OpenAPI expresses optionality as `| null`, TS as
// `?`/undefined — NoNulls bridges that; everything else fails type-check here.
type ContractEncounter =
  EhrPaths['/api/v1/encounters']['get']['responses'][200]['content']['application/json']['data'][number];
type NoNulls<T> = { [K in keyof T]: Exclude<T[K], null> };
type AssertAssignable<A extends B, B> = A;
type _EncounterContractCheck = AssertAssignable<NoNulls<ContractEncounter>, Encounter>;

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
    placeholderData: keepPreviousData,
  });
}
