import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import type { AuthPrincipal, AuthService } from './auth.js';
import type { AppConfig } from './config.js';
import type { PlayerAccount } from './domain/playerAccounts.js';
import type { Logger } from './logger.js';

export interface AppDependencies {
  config: AppConfig;
  auth: AuthService | null;
  checkDatabase: () => Promise<void>;
  resolvePlayerAccount: (principal: AuthPrincipal) => Promise<PlayerAccount>;
  logger: Logger;
}

export function createApp({
  config,
  auth,
  checkDatabase,
  resolvePlayerAccount,
  logger,
}: AppDependencies): Hono {
  const app = new Hono();

  app.use('*', secureHeaders());
  app.use('*', cors({
    origin: origin => config.corsOrigins.has(origin) ? origin : undefined,
    allowHeaders: ['Content-Type', 'X-Request-Id'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['X-Request-Id'],
    credentials: true,
    maxAge: 600,
  }));
  app.use('*', async (context, next) => {
    const requestId = context.req.header('X-Request-Id') || randomUUID();
    const startedAt = performance.now();
    context.header('X-Request-Id', requestId);
    await next();
    logger.info('request.completed', {
      requestId,
      method: context.req.method,
      path: context.req.path,
      status: context.res.status,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    });
  });

  app.all('/api/auth/*', context => auth
    ? auth.handler(context.req.raw)
    : context.json({ error: 'auth_not_configured' }, 503));

  app.get('/', context => context.json({
    service: 'cislokraj-api',
    release: config.appRelease,
  }));

  app.get('/health', context => context.json({
    status: 'ok',
    release: config.appRelease,
  }));

  app.get('/ready', async context => {
    try {
      await checkDatabase();
      return context.json({ status: 'ready', release: config.appRelease });
    } catch (error) {
      logger.error('database.readiness_failed', {
        error: error instanceof Error ? error.message : 'Unknown database error',
      });
      return context.json({ status: 'unavailable', release: config.appRelease }, 503);
    }
  });

  app.get('/v1/version', context => context.json({ release: config.appRelease }));

  app.get('/v1/me', async context => {
    if (!auth) return context.json({ error: 'auth_not_configured' }, 503);
    const principal = await auth.getPrincipal(context.req.raw.headers);
    if (!principal) return context.json({ error: 'unauthorized' }, 401);

    const account = await resolvePlayerAccount(principal);
    return context.json({
      authenticated: true,
      accountId: account.id,
    });
  });

  app.notFound(context => context.json({ error: 'not_found' }, 404));
  app.onError((error, context) => {
    logger.error('request.failed', {
      method: context.req.method,
      path: context.req.path,
      error: error.message,
    });
    return context.json({ error: 'internal_error' }, 500);
  });

  return app;
}
