import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '@/lib/api';

export interface AnalyticsOverview {
  revenue:      { current: number; previous: number; growthPct: number };
  appointments: { current: number; previous: number; growthPct: number };
  patients:     { total: number };
  noShowRate:   { current: number };
}

export interface MonthlyRevenue {
  month: string;
  revenue: number;
  appointments: number;
  doctorShare: number;
  clinicShare: number;
}

export interface SourceStat {
  sourceCode:   string;
  sourceNameEn: string;
  sourceNameAr: string;
  count:        number;
  revenue:      number;
  pct:          number;
}

export function useAnalyticsOverview() {
  return useQuery({
    queryKey: ['analytics', 'overview'],
    queryFn: async () => {
      const { data } = await analyticsApi.get<{ success: boolean; data: AnalyticsOverview }>('/analytics/overview');
      return data.data;
    },
    staleTime: 60_000,
  });
}

export function useMonthlyRevenue(months = 7) {
  return useQuery({
    queryKey: ['analytics', 'revenue', months],
    queryFn: async () => {
      const { data } = await analyticsApi.get<{ success: boolean; data: MonthlyRevenue[] }>('/analytics/revenue', { params: { months } });
      return data.data;
    },
    staleTime: 60_000,
  });
}

export function useSourceBreakdown() {
  return useQuery({
    queryKey: ['analytics', 'sources'],
    queryFn: async () => {
      const { data } = await analyticsApi.get<{ success: boolean; data: SourceStat[] }>('/analytics/sources');
      return data.data;
    },
    staleTime: 60_000,
  });
}
