import { z } from 'zod';

const databaseSchema = z.object({
  DATABASE_URL: z.string().min(1).refine(
    value => value.startsWith('postgres://') || value.startsWith('postgresql://'),
    'DATABASE_URL must use postgres:// or postgresql://',
  ),
});

const environmentSchema = databaseSchema.extend({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  CORS_ORIGINS: z.string().min(1),
  APP_RELEASE: z.string().min(1).optional(),
  RAILWAY_GIT_COMMIT_SHA: z.string().min(1).optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

const authSchema = z.object({
  BETTER_AUTH_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
});

export interface AuthConfig {
  authBaseUrl: string;
  authSecret: string;
  googleClientId: string;
  googleClientSecret: string;
}

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  corsOrigins: ReadonlySet<string>;
  auth: AuthConfig | null;
  appRelease: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

function parseOriginList(value: string): ReadonlySet<string> {
  const origins = value.split(',').map(origin => origin.trim()).filter(Boolean);
  if (origins.length === 0) throw new Error('CORS_ORIGINS must contain at least one origin');

  for (const origin of origins) {
    const parsed = new URL(origin);
    if (parsed.origin !== origin || !['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(`CORS_ORIGINS contains an invalid origin: ${origin}`);
    }
  }

  return new Set(origins);
}

export function loadDatabaseConfig(environment: NodeJS.ProcessEnv = process.env): { databaseUrl: string } {
  return { databaseUrl: databaseSchema.parse(environment).DATABASE_URL };
}

function loadAuthConfig(environment: NodeJS.ProcessEnv): AuthConfig | null {
  // The public base URL may already be provisioned before OAuth credentials.
  // Once any credential is supplied, require the complete valid set.
  const credentialKeys = ['BETTER_AUTH_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'];
  if (!credentialKeys.some(key => environment[key] !== undefined)) return null;

  const parsed = authSchema.parse(environment);
  const authBaseUrl = new URL(parsed.BETTER_AUTH_URL);
  if (authBaseUrl.origin !== parsed.BETTER_AUTH_URL) {
    throw new Error('BETTER_AUTH_URL must be an origin without a path');
  }

  return {
    authBaseUrl: authBaseUrl.origin,
    authSecret: parsed.BETTER_AUTH_SECRET,
    googleClientId: parsed.GOOGLE_CLIENT_ID,
    googleClientSecret: parsed.GOOGLE_CLIENT_SECRET,
  };
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = environmentSchema.parse(environment);
  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    databaseUrl: parsed.DATABASE_URL,
    corsOrigins: parseOriginList(parsed.CORS_ORIGINS),
    auth: loadAuthConfig(environment),
    appRelease: parsed.APP_RELEASE ?? parsed.RAILWAY_GIT_COMMIT_SHA ?? 'dev',
    logLevel: parsed.LOG_LEVEL,
  };
}
