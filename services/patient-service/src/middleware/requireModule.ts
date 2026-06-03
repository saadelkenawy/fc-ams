import { FastifyRequest, FastifyReply } from 'fastify';
import { TIER_MODULES, MODULES, type ModuleId, type SubscriptionTier } from '@fadl/types';

export const MODULE_ID: ModuleId = 'patients';

function getEnabledModules(tier: SubscriptionTier): ModuleId[] {
  const envJson = process.env.FEATURE_FLAGS_JSON;
  if (envJson) {
    try {
      const map = JSON.parse(envJson) as Partial<Record<SubscriptionTier, ModuleId[]>>;
      if (map[tier]) return map[tier]!;
    } catch { /* fall through */ }
  }
  return TIER_MODULES[tier] ?? [...MODULES];
}

export async function requireModule(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const tier = (request.user as { subscriptionTier?: SubscriptionTier }).subscriptionTier ?? 'premium';
  if (!getEnabledModules(tier).includes(MODULE_ID)) {
    return reply.status(403).send({
      success: false,
      error: { code: 'MODULE_DISABLED', message: `Module '${MODULE_ID}' is not available on your plan` },
    });
  }
}
