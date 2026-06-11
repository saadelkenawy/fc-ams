import { z } from 'zod';
import { pemFromBase64 } from '@fadl/service-kit';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(3011),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_MIN: z.coerce.number().default(2),
  DATABASE_POOL_MAX: z.coerce.number().default(10),
  JWT_PUBLIC_KEY_B64: z.string().min(64),
  SERVICE_JWT_SECRET: z.string().min(32),
  JWT_EXPIRY: z.string().default('15m'),
  BRANCH_ID: z.coerce.number().default(1),
  SERVICE_NAME: z.string().default('file-service'),
  MINIO_ENDPOINT:   z.string().default('minio'),
  MINIO_PORT:       z.coerce.number().default(9000),
  MINIO_ACCESS_KEY: z.string().default('fadl_minio'),
  MINIO_SECRET_KEY: z.string().default('fadl_minio_secret'),
  MINIO_BUCKET:     z.string().default('fadl-files'),
  MINIO_USE_SSL:    z.coerce.boolean().default(false),
  MINIO_PUBLIC_URL: z.string().optional(), // override host in presigned URLs for browser access
  PRESIGN_TTL_SECS: z.coerce.number().default(3600),
}).superRefine((env, ctx) => {
  if (env.NODE_ENV !== 'production') return;
  // Known dev defaults must never reach production
  if (env.MINIO_ACCESS_KEY === 'fadl_minio' || env.MINIO_SECRET_KEY === 'fadl_minio_secret' || env.MINIO_SECRET_KEY.length < 16) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['MINIO_SECRET_KEY'],
      message: 'MINIO_ACCESS_KEY/MINIO_SECRET_KEY must be set to non-default values (secret >=16 chars) in production',
    });
  }
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) { console.error('Invalid env:', parsed.error.flatten()); process.exit(1); }
export const config = {
  ...parsed.data,
  JWT_PUBLIC_KEY: pemFromBase64(parsed.data.JWT_PUBLIC_KEY_B64),
};
export type Config = typeof config;
