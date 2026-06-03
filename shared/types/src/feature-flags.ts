export const MODULES = [
  'patients',
  'scheduling',
  'billing',
  'settlements',
  'ehr',
  'ai',
  'analytics',
  'telehealth',
  'procurement',
  'integrations',
] as const;

export type ModuleId = (typeof MODULES)[number];

export type SubscriptionTier = 'basic' | 'standard' | 'premium';

export const TIER_MODULES: Record<SubscriptionTier, ModuleId[]> = {
  basic: ['patients', 'scheduling'],
  standard: ['patients', 'scheduling', 'billing', 'settlements', 'ehr'],
  premium: [...MODULES],
};

export interface FeatureFlagsResponse {
  modules: Record<ModuleId, boolean>;
  tier: SubscriptionTier;
  unlockedBy: 'subscription' | 'developer-token' | 'merged';
}

export interface UnlockTokenPayload {
  iss: 'fadl-dev';
  modules: ModuleId[];
  exp: number;
  note?: string;
}
