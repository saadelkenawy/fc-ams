import { z } from 'zod';
import { pemFromBase64 } from '@fadl/service-kit';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(3012),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_MIN: z.coerce.number().default(2),
  DATABASE_POOL_MAX: z.coerce.number().default(10),
  JWT_PUBLIC_KEY_B64: z.string().min(64),
  SERVICE_JWT_SECRET: z.string().min(32),
  JWT_EXPIRY: z.string().default('15m'),
  BRANCH_ID: z.coerce.number().default(1),
  SERVICE_NAME: z.string().default('integration-service'),

  APPOINTMENT_SERVICE_URL: z.string().default('http://localhost:3001/api/v1'),
  BILLING_SERVICE_URL:     z.string().default('http://localhost:3004/api/v1'),
  PATIENT_SERVICE_URL:     z.string().default('http://localhost:3002/api/v1'),

  // Per-platform webhook secrets (empty = accept all in dev; REQUIRED in production)
  VIZITA_WEBHOOK_SECRET:  z.string().default(''),
  EKSHF_WEBHOOK_SECRET:   z.string().default(''),
  CLINIDO_WEBHOOK_SECRET: z.string().default(''),
  INSTAPAY_WEBHOOK_SECRET: z.string().default(''),

  // Platform source codes (must match billing SOURCE_FEES keys)
  VIZITA_SOURCE_CODE:  z.string().default('VEZ'),
  EKSHF_SOURCE_CODE:   z.string().default('EKF'),
  CLINIDO_SOURCE_CODE: z.string().default('DO'),
}).superRefine((env, ctx) => {
  if (env.NODE_ENV !== 'production') return;
  const secrets = ['VIZITA_WEBHOOK_SECRET', 'EKSHF_WEBHOOK_SECRET', 'CLINIDO_WEBHOOK_SECRET', 'INSTAPAY_WEBHOOK_SECRET'] as const;
  for (const key of secrets) {
    if (env[key].length < 16) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: 'must be set (min 16 chars) in production — empty secrets disable webhook authentication' });
    }
  }
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) { console.error('Invalid env:', parsed.error.flatten()); process.exit(1); }
export const config = {
  ...parsed.data,
  JWT_PUBLIC_KEY: pemFromBase64(parsed.data.JWT_PUBLIC_KEY_B64),
};
export type Config = typeof config;
