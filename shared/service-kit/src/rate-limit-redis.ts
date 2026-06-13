import Redis from 'ioredis';

export interface RateLimitStoreOptions {
  redis?: Redis;
  nameSpace?: string;
}

/**
 * Build @fastify/rate-limit store options backed by shared Redis, so brute-force
 * / abuse counters hold across ALL instances of a service instead of each
 * replica keeping its own private (and thus N× weaker) in-memory counter.
 *
 * Returns `{}` when `redisUrl` is unset — the limiter then falls back to its
 * per-instance in-memory store (fine for dev/local).
 *
 * The client is tuned to fail FAST, not queue: if Redis is briefly unreachable
 * the rate-limit plugin's `skipOnError` default lets the request through rather
 * than hanging on the limiter. `nameSpace` keeps services from colliding when
 * they share one Redis instance.
 */
export function createRateLimitStore(serviceName: string, redisUrl?: string): RateLimitStoreOptions {
  if (!redisUrl) return {};
  const client = new Redis(redisUrl, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 2_000,
  });
  client.on('error', (err: Error) => {
    console.error(`[redis:rate-limit:${serviceName}] connection error`, err.message);
  });
  return { redis: client, nameSpace: `rl:${serviceName}:` };
}
