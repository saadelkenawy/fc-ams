import { z } from 'zod';
import { pemFromBase64 } from '@fadl/service-kit';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(3007),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_MIN: z.coerce.number().default(2),
  DATABASE_POOL_MAX: z.coerce.number().default(10),
  JWT_PUBLIC_KEY_B64: z.string().min(64),
  SERVICE_JWT_SECRET: z.string().min(32),
  JWT_EXPIRY: z.string().default('15m'),
  BRANCH_ID: z.coerce.number().default(1),
  SERVICE_NAME: z.string().default('notification-service'),
  // SMTP — optional; if not set, email delivery is skipped (logged only)
  SMTP_HOST:     z.string().optional(),
  SMTP_PORT:     z.coerce.number().default(587),
  SMTP_SECURE:   z.coerce.boolean().default(false),
  SMTP_USER:     z.string().optional(),
  SMTP_PASS:     z.string().optional(),
  SMTP_FROM:     z.string().default('Fadl Clinic <noreply@fadlclinic.com>'),
  // Twilio SMS — optional
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN:  z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten());
  process.exit(1);
}

export const config = {
  ...parsed.data,
  JWT_PUBLIC_KEY: pemFromBase64(parsed.data.JWT_PUBLIC_KEY_B64),
};
export type Config = typeof config;
