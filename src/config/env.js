import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_NAME: z.string().default('letsmeet-server'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  LIVEKIT_URL: z.string().optional(),
  LIVEKIT_API_HOST: z.string().optional(),
  LIVEKIT_API_KEY: z.string().optional(),
  LIVEKIT_API_SECRET: z.string().optional(),
  AZURE_STORAGE_ACCOUNT_NAME: z.string().optional(),
  AZURE_STORAGE_ACCOUNT_KEY: z.string().optional(),
  AZURE_STORAGE_CONTAINER: z.string().optional(),
  /** Optional custom blob endpoint (Azurite). Omit for real Azure. */
  AZURE_STORAGE_BLOB_ENDPOINT: z.string().optional(),
  RECORDING_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  RECORDING_DOWNLOAD_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${details}`);
}

const data = parsed.data;

if (
  data.NODE_ENV === 'production' &&
  !(data.LIVEKIT_URL && data.LIVEKIT_API_KEY && data.LIVEKIT_API_SECRET)
) {
  throw new Error(
    'LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET are required in production',
  );
}

export const env = {
  ...data,
  isProduction: data.NODE_ENV === 'production',
  isDevelopment: data.NODE_ENV === 'development',
  isTest: data.NODE_ENV === 'test',
  corsOrigins: data.CORS_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
};

export default env;
