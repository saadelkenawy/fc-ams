import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(3009),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRY: z.string().default('15m'),
  BRANCH_ID: z.coerce.number().default(1),
  SERVICE_NAME: z.string().default('analytics-service'),
  BILLING_SERVICE_URL:     z.string().default('http://localhost:3004/api/v1'),
  APPOINTMENT_SERVICE_URL: z.string().default('http://localhost:3001/api/v1'),
  PATIENT_SERVICE_URL:     z.string().default('http://localhost:3002/api/v1'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten());
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
