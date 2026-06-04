'use client';

import { useSearchParams } from 'next/navigation';
import { ModuleUnavailablePage } from '@/components/shared/ModuleUnavailablePage';
import { MODULES } from '@fadl/types';
import type { ModuleId } from '@fadl/types';

const VALID_MODULES = new Set<string>(MODULES);

export default function ModuleUnavailableRoute() {
  const searchParams = useSearchParams();
  const module = searchParams.get('module') ?? '';
  const moduleId = VALID_MODULES.has(module) ? (module as ModuleId) : ('scheduling' as ModuleId);
  return <ModuleUnavailablePage moduleId={moduleId} />;
}
