import { useQuery } from '@tanstack/react-query';
import { identityApi } from '@/lib/api';
import type { FeatureFlagsResponse, ModuleId } from '@fadl/types';

async function fetchFeatureFlags(): Promise<FeatureFlagsResponse> {
  const { data } = await identityApi.get<{ success: true; data: FeatureFlagsResponse }>('/api/v1/feature-flags');
  return data.data;
}

export function useFeatureFlags() {
  return useQuery({
    queryKey: ['feature-flags'],
    queryFn: fetchFeatureFlags,
    staleTime: 60_000,
    retry: 1,
  });
}

export function useModuleEnabled(moduleId: ModuleId): boolean {
  const { data } = useFeatureFlags();
  // Default true while loading — avoids flash of disabled content
  return data?.modules[moduleId] ?? true;
}
