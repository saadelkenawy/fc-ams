import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(3011),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_MIN: z.coerce.number().default(2),
  DATABASE_POOL_MAX: z.coerce.number().default(10),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRY: z.string().default('15m'),
  BRANCH_ID: z.coerce.number().default(1),
  SERVICE_NAME: z.string().default('file-service'),
  MINIO_ENDPOINT:   z.string().default('minio'),
  MINIO_PORT:       z.coerce.number().default(9000),
  MINIO_ACCESS_KEY: z.string().default('fadl_minio'),
  MINIO_SECRET_KEY: z.string().default('fadl_minio_secret'),
  MINIO_BUCKET:     z.string().default('fadl-files'),
  MINIO_USE_SSL:    z.coerce.boolean().default(false),
  PRESIGN_TTL_SECS: z.coerce.number().default(3600),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) { console.error('Invalid env:', parsed.error.flatten()); process.exit(1); }
export const config = parsed.data;
export type Config = typeof config;
