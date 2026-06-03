'use client';

import { useSearchParams } from 'next/navigation';
import { ModuleUnavailablePage } from '@/components/shared/ModuleUnavailablePage';
import type { ModuleId } from '@fadl/types';

const VALID_MODULES = new Set<string>([
  'patients', 'scheduling', 'billing', 'settlements',
  'ehr', 'ai', 'analytics', 'telehealth', 'procurement', 'integrations',
]);

export default function ModuleUnavailableRoute() {
  const searchParams = useSearchParams();
  const module = searchParams.get('module') ?? '';
  const moduleId = VALID_MODULES.has(module) ? (module as ModuleId) : ('scheduling' as ModuleId);
  return <ModuleUnavailablePage moduleId={moduleId} />;
}
