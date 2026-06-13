import { z } from 'zod';
import { pemFromBase64 } from '@fadl/service-kit';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(3008),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_MIN: z.coerce.number().default(2),
  DATABASE_POOL_MAX: z.coerce.number().default(10),
  JWT_PUBLIC_KEY_B64: z.string().min(64),
  SERVICE_JWT_SECRET: z.string().min(32),
  JWT_EXPIRY: z.string().default('15m'),
  BRANCH_ID: z.coerce.number().default(1),
  SERVICE_NAME: z.string().default('ai-chatbot-service'),
  REDIS_URL: z.string().optional(),  ANTHROPIC_API_KEY: z.string().optional().default(''),
  ANTHROPIC_MODEL: z.string().default('claude-haiku-4-5-20251001'),
  OPENROUTER_API_KEY: z.string().optional().default(''),
  OPENROUTER_MODEL: z.string().default('deepseek/deepseek-v4-flash:free'),
  MAX_HISTORY_TURNS: z.coerce.number().default(10),
  PATIENT_SERVICE_URL: z.string().default('http://localhost:3002/api/v1'),
  DOCTOR_SERVICE_URL: z.string().default('http://localhost:3003/api/v1'),
  APPOINTMENT_SERVICE_URL: z.string().default('http://localhost:3001/api/v1'),
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
