import { useQuery, keepPreviousData } from '@tanstack/react-query';
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
  sourceCode:     string;
  sourceNameEn:   string;
  sourceNameAr:   string;
  count:          number;
  revenue:        number;
  pct:            number;
  sourceFees:     number;
  uniquePatients: number;
  patientPct:     number;
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

export function useSourceBreakdown(dateFrom?: string, dateTo?: string) {
  return useQuery({
    queryKey: ['analytics', 'sources', dateFrom, dateTo],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo)   params.dateTo   = dateTo;
      const { data } = await analyticsApi.get<{ success: boolean; data: SourceStat[] }>(
        '/analytics/sources',
        { params },
      );
      return data.data;
    },
    staleTime: 60_000,
  });
}

export interface DoctorStat {
  doctorId:    string;
  nameEn:      string;
  nameAr:      string;
  specialtyId: number | null;
  revenue:     number;
  appointments: number;
  share:       number;
}

export interface SpecialtyStat {
  specialtyId:  number;
  specialtyEn:  string;
  specialtyAr:  string;
  revenue:      number;
  appointments: number;
  noShowRate:   number;
  sharePct:     number;
}

export interface NoShowDay {
  dayOfWeek:  number;
  dayEn:      string;
  dayAr:      string;
  total:      number;
  cancelled:  number;
  noShowRate: number;
}

export function useTopDoctors(limit = 5) {
  return useQuery({
    queryKey: ['analytics', 'doctors', 'top', limit],
    queryFn: async () => {
      const { data } = await analyticsApi.get<{ success: boolean; data: DoctorStat[] }>('/analytics/doctors/top', { params: { limit } });
      return data.data;
    },
    staleTime: 60_000,
  });
}

export function useSpecialtyBreakdown() {
  return useQuery({
    queryKey: ['analytics', 'specialties'],
    queryFn: async () => {
      const { data } = await analyticsApi.get<{ success: boolean; data: SpecialtyStat[] }>('/analytics/specialties');
      return data.data;
    },
    staleTime: 60_000,
  });
}

export function useNoShowByDay() {
  return useQuery({
    queryKey: ['analytics', 'noshow-by-day'],
    queryFn: async () => {
      const { data } = await analyticsApi.get<{ success: boolean; data: NoShowDay[] }>('/analytics/noshow-by-day');
      return data.data;
    },
    staleTime: 60_000,
  });
}

export interface FinancialSummaryKpis {
  totalRevenue:     number;
  outstanding:      number;
  totalExpenses:    number;
  netProfit:        number;
  profitMargin:     number;
  totalDoctorShare: number;
  transactionCount: number;
}

export interface DailyBreakdownItem {
  date:         string;
  revenue:      number;
  transactions: number;
}

export interface FinancialSummaryDoctor {
  doctorId:     string;
  nameEn:       string;
  nameAr:       string;
  specialtyId:  number | null;
  revenue:      number;
  transactions: number;
  doctorShare:  number;
}

export interface RecentTransaction {
  id:              string;
  transactionDate: string;
  approvedCharge:  number;
  doctorShare:     number;
  clinicShare:     number;
  paymentMethod:   string;
  visitType:       string;
  patientSource:   string;
}

export interface FinancialSummaryData {
  period:             { month: string; dateFrom: string; dateTo: string };
  kpis:               FinancialSummaryKpis;
  dailyBreakdown:     DailyBreakdownItem[];
  byPaymentMethod:    Record<string, number>;
  byVisitType:        Record<string, number>;
  topDoctors:         FinancialSummaryDoctor[];
  recentTransactions: RecentTransaction[];
}

export interface AppointmentActivitySummary {
  total:       number;
  closed:      number;
  cancelled:   number;
  rescheduled: number;
  referred:    number;
  scheduled:   number;
  paid:        number;
  pending:     number;
  refunded:    number;
}

export function useAppointmentActivitySummary(dateFrom: string, dateTo: string) {
  return useQuery({
    queryKey: ['analytics', 'appointment-activity', dateFrom, dateTo],
    queryFn: async () => {
      const { data } = await analyticsApi.get<{ success: boolean; data: AppointmentActivitySummary }>(
        '/analytics/appointment-activity',
        { params: { dateFrom, dateTo } },
      );
      return data.data;
    },
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function useFinancialSummary(month: string) {
  return useQuery({
    queryKey: ['analytics', 'financial-summary', month],
    queryFn: async () => {
      const { data } = await analyticsApi.get<{ success: boolean; data: FinancialSummaryData }>(
        '/analytics/financial-summary',
        { params: { month } },
      );
      return data.data;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });
}
