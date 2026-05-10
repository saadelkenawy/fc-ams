import Redis from 'ioredis';
import { config } from './index';

export const redis = new Redis(config.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
});

redis.on('error', (err: Error) => {
  console.error('[redis] connection error', err.message);
});
