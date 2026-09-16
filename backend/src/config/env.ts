import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  CREDENTIAL_ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/),
  ACCESS_TOKEN_TTL: z.string().min(1).default('15m'),
  REFRESH_TOKEN_TTL: z.string().min(1).default('7d'),
  CORS_ORIGIN: z.string().min(1),
  APP_URL: z.string().url(),
  API_URL: z.string().url().default('http://localhost:5000'),
  JWT_ISSUER: z.string().min(1).default('ticketguard-api'),
  JWT_AUDIENCE: z.string().min(1).default('ticketguard-client'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info')
});

export const env = envSchema.parse(process.env);
