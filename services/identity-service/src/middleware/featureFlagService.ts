import type { Redis } from 'ioredis';
import {
  MODULES,
  TIER_MODULES,
  type FeatureFlagsResponse,
  type ModuleId,
  type SubscriptionTier,
} from '@fadl/types';
import { config } from '../config';

const FLAG_TTL_SECONDS = 60;

function parseFlagConfig(): Record<SubscriptionTier, ModuleId[]> {
  if (config.FEATURE_FLAGS_JSON) {
    try {
      return JSON.parse(config.FEATURE_FLAGS_JSON) as Record<SubscriptionTier, ModuleId[]>;
    } catch {
      // fall through to default
    }
  }
  return TIER_MODULES;
}

function buildModuleMap(enabled: ModuleId[]): Record<ModuleId, boolean> {
  const enabledSet = new Set(enabled);
  return Object.fromEntries(MODULES.map((m) => [m, enabledSet.has(m)])) as Record<ModuleId, boolean>;
}

export async function resolveFlags(
  userId: string,
  branchId: number,
  tier: SubscriptionTier,
  sessionId: string,
  redisClient: Redis,
): Promise<FeatureFlagsResponse> {
  const cacheKey = `flags:${branchId}:${userId}`;
  const cached = await redisClient.get(cacheKey).catch(() => null);
  if (cached) {
    return JSON.parse(cached) as FeatureFlagsResponse;
  }

  const flagConfig = parseFlagConfig();
  const tierModules: ModuleId[] = flagConfig[tier] ?? flagConfig[config.DEFAULT_TIER] ?? [...MODULES];

  const unlockKey = `unlock:${sessionId}`;
  const unlockRaw = await redisClient.get(unlockKey).catch(() => null);
  const unlockModules: ModuleId[] = unlockRaw ? (JSON.parse(unlockRaw) as ModuleId[]) : [];

  const validUnlocked = unlockModules.filter((m): m is ModuleId =>
    (MODULES as readonly string[]).includes(m),
  );

  let unlockedBy: FeatureFlagsResponse['unlockedBy'] = 'subscription';
  let finalModules: ModuleId[];

  if (validUnlocked.length > 0) {
    const merged = new Set([...tierModules, ...validUnlocked]);
    finalModules = [...merged];
    unlockedBy = tierModules.length !== finalModules.length ? 'merged' : 'subscription';
  } else {
    finalModules = tierModules;
  }

  const result: FeatureFlagsResponse = {
    modules: buildModuleMap(finalModules),
    tier,
    unlockedBy,
  };

  await redisClient
    .setex(cacheKey, FLAG_TTL_SECONDS, JSON.stringify(result))
    .catch(() => {/* non-fatal */});

  return result;
}

export async function bustFlagCache(
  userId: string,
  branchId: number,
  redisClient: Redis,
): Promise<void> {
  await redisClient.del(`flags:${branchId}:${userId}`).catch(() => {/* non-fatal */});
}
