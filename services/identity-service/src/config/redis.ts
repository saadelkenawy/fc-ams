import Redis from 'ioredis';
import { config } from './index';

/**
 * Shared Redis client used as the @fastify/rate-limit store so brute-force
 * counters are accurate across all identity-service instances (see app.ts).
 *
 * `null` when REDIS_URL is unset (dev/local) — the limiter then falls back to
 * its per-instance in-memory store. Tuned to fail FAST, not queue: if Redis is
 * briefly unreachable the rate-limit plugin's skipOnError default lets the
 * request through rather than hanging login. Account lockout (Postgres) remains
 * a second layer regardless.
 */
export const rateLimitRedis = config.REDIS_URL
  ? new Redis(config.REDIS_URL, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 2_000,
    })
  : null;

rateLimitRedis?.on('error', (err: Error) => {
  console.error('[redis:rate-limit] connection error', err.message);
});
