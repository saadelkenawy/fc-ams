import Redis from 'ioredis';
import { config } from './index';

export const redis = new Redis(config.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
});

// Dedicated subscriber connection — cannot be reused for commands after subscribe()
export const redisSub = new Redis(config.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: null,
});

redis.on('error', (err: Error) => {
  console.error('[redis] connection error', err.message);
});

redisSub.on('error', (err: Error) => {
  console.error('[redis-sub] connection error', err.message);
});
