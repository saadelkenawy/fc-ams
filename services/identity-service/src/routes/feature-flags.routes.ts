import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { jwtVerify } from 'jose';
import { MODULES, type ModuleId, type SubscriptionTier } from '@fadl/types';
import { requireAuth } from '../middleware/auth';
import { resolveFlags, bustFlagCache } from '../middleware/featureFlagService';
import { redis } from '../config/redis';
import { config } from '../config';

const featureFlagsResponseSchema = z.object({
  modules: z.record(z.boolean()),
  tier: z.enum(['basic', 'standard', 'premium']),
  unlockedBy: z.enum(['subscription', 'developer-token', 'merged']),
});

const unlockRequestSchema = z.object({
  unlockToken: z.string().min(1),
});

const unlockTokenPayloadSchema = z.object({
  iss: z.literal('fadl-dev'),
  modules: z.array(z.string()),
  exp: z.number(),
  note: z.string().optional(),
});

export async function featureFlagsRoutes(app: FastifyInstance): Promise<void> {

  // GET /feature-flags
  app.get('/feature-flags', {
    preHandler: [requireAuth],
    schema: { tags: ['feature-flags'] },
  }, async (request, reply) => {
    const user = request.user;
    const tier: SubscriptionTier = (user as { subscriptionTier?: SubscriptionTier }).subscriptionTier
      ?? config.DEFAULT_TIER;

    // Use JWT sub as sessionId for unlock lookup
    const sessionId = user.sub;

    const result = await resolveFlags(user.sub, user.branchId, tier, sessionId, redis);

    // Validate before sending (constitution III)
    featureFlagsResponseSchema.parse(result);

    void reply.send({ success: true, data: result });
  });

  // POST /feature-flags/unlock
  app.post('/feature-flags/unlock', {
    preHandler: [requireAuth],
    schema: { tags: ['feature-flags'] },
  }, async (request, reply) => {
    if (!config.DEVELOPER_UNLOCK_SECRET) {
      return reply.status(400).send({
        success: false,
        error: { code: 'UNLOCK_DISABLED', message: 'Developer unlock is not configured on this instance' },
      });
    }

    const body = unlockRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_BODY', message: 'unlockToken is required' },
      });
    }

    let rawPayload: unknown;
    try {
      const secret = new TextEncoder().encode(config.DEVELOPER_UNLOCK_SECRET);
      const { payload } = await jwtVerify(body.data.unlockToken, secret);
      rawPayload = payload;
    } catch {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_UNLOCK_TOKEN', message: 'Invalid or expired unlock token' },
      });
    }

    const parsed = unlockTokenPayloadSchema.safeParse(rawPayload);
    if (!parsed.success || parsed.data.iss !== 'fadl-dev') {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_UNLOCK_TOKEN', message: 'Invalid or expired unlock token' },
      });
    }

    // Filter to known ModuleIds only — unknown IDs dropped silently
    const validModules = parsed.data.modules.filter((m): m is ModuleId =>
      (MODULES as readonly string[]).includes(m),
    );

    const sessionId = request.user.sub;
    const ttl = parsed.data.exp - Math.floor(Date.now() / 1000);

    if (ttl > 0) {
      await redis.setex(`unlock:${sessionId}`, ttl, JSON.stringify(validModules));
      await bustFlagCache(request.user.sub, request.user.branchId, redis);
    }

    void reply.send({
      success: true,
      data: {
        unlocked: validModules,
        expiresAt: new Date(parsed.data.exp * 1000).toISOString(),
      },
    });
  });
}
