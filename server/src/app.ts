import { randomUUID, createHash } from 'node:crypto';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { bodyLimit } from 'hono/body-limit';
import { gameplayBatchSchema, type GameplayBatch } from './domain/gameplay.js';
import { z } from 'zod';
import type { AuthPrincipal, AuthService } from './auth.js';
import type { AppConfig } from './config.js';
import type { PlayerAccount } from './domain/playerAccounts.js';
import type { Logger } from './logger.js';
import { analyticsRoutes, type AnalyticsService } from './admin/routes.js';

export interface AppDependencies {
  config: AppConfig;
  auth: AuthService | null;
  checkDatabase: () => Promise<void>;
  resolvePlayerAccount: (principal: AuthPrincipal) => Promise<PlayerAccount>;
  logger: Logger;
  collectGameplay?: (accountId: string, batch: GameplayBatch, parentAccountId: string | null) => Promise<void | {observationLinks:Array<{presentationId:string;legacyEventKey:string}>}>;
  gameplaySummary?: (accountId: string, parentView: boolean) => Promise<unknown>;
  resolveGameplayBrowser?: (token: string, deviceId?: string) => Promise<{ id: string } | null>;
  analytics?: AnalyticsService;
}

export function createApp({
  config,
  auth,
  checkDatabase,
  resolvePlayerAccount,
  logger,
  collectGameplay,
  gameplaySummary,
  resolveGameplayBrowser,
  analytics,
}: AppDependencies): Hono {
  const app = new Hono();

  app.use('*', secureHeaders());
  app.use('*', cors({
    origin: origin => config.corsOrigins.has(origin) ? origin : undefined,
    allowHeaders: ['Content-Type', 'X-Request-Id', 'Authorization', 'X-CSRF-Token'],
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
    context.header('Cache-Control', 'private, no-store');
    if (!auth) return context.json({ error: 'auth_not_configured' }, 503);
    const principal = await auth.getPrincipal(context.req.raw.headers);
    if (!principal) return context.json({ error: 'unauthorized' }, 401);

    const account = await resolvePlayerAccount(principal);
    return context.json({
      authenticated: true,
      accountId: account.id,
      ...(analytics ? { capabilities: { analyticsAdmin: await analytics.isAdmin(principal) } } : {}),
    });
  });

  if (analytics && resolveGameplayBrowser) app.route('/', analyticsRoutes({ config, auth, service: analytics, resolveBrowser: resolveGameplayBrowser }));

  app.use('/v1/gameplay/*', bodyLimit({ maxSize: 2 * 1024 * 1024,
    onError: context => context.json({ error: 'payload_too_large' }, 413) }));

  const browserToken = (authorization: string | undefined) => /^Bearer [a-f0-9]{64}$/.test(authorization ?? '')
    ? authorization!.slice(7) : null;
  const credentialLimits=new Map<string,{at:number;count:number}>();
  app.post('/v1/gameplay/session', async context => {
    if(config.analytics&&!config.analytics.collectionEnabled)return context.json({error:'collection_disabled'},503);
    if (!resolveGameplayBrowser) return context.json({ error: 'unavailable' }, 503);
    if (!config.corsOrigins.has(context.req.header('Origin') ?? '')) return context.json({ error: 'forbidden_origin' }, 403);
    const token = browserToken(context.req.header('Authorization'));
    if (!token) return context.json({ error: 'browser_identity_required' }, 401);
    const now=Date.now(),rateKey=createHash('sha256').update(context.req.header('CF-Connecting-IP')??context.req.header('Origin')??'local').digest('hex'),limit=credentialLimits.get(rateKey);
    if(limit&&now-limit.at<60_000&&limit.count>=240){context.header('Retry-After','60');return context.json({error:'rate_limited'},429);}
    credentialLimits.set(rateKey,{at:limit&&now-limit.at<60_000?limit.at:now,count:limit&&now-limit.at<60_000?limit.count+1:1});
    if(credentialLimits.size>10_000)for(const [key,value]of credentialLimits)if(now-value.at>60_000)credentialLimits.delete(key);
    const input = z.object({ deviceId: z.uuid() }).strict().safeParse(await context.req.json().catch(() => null));
    if (!input.success) return context.json({ error: 'invalid_browser_identity' }, 400);
    const browser = await resolveGameplayBrowser(token, input.data.deviceId);
    context.header('Cache-Control', 'no-store');
    return context.json({ accountId: browser!.id });
  });

  app.post('/v1/gameplay/batch', async context => {
    if(config.analytics&&!config.analytics.collectionEnabled)return context.json({error:'collection_disabled'},503);
    if (!resolveGameplayBrowser || !collectGameplay) return context.json({ error: 'unavailable' }, 503);
    // CORS alone does not reject requests. Require an allowed origin on writes.
    const origin = context.req.header('Origin');
    if (!origin || !config.corsOrigins.has(origin)) return context.json({ error: 'forbidden_origin' }, 403);
    if (!context.req.header('Content-Type')?.toLowerCase().startsWith('application/json')) {
      return context.json({ error: 'json_required' }, 415);
    }
    const token = browserToken(context.req.header('Authorization'));
    const browser = token ? await resolveGameplayBrowser(token) : null;
    if (!browser) return context.json({ error: 'browser_identity_required' }, 401);
    const parsed = gameplayBatchSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json({ error: 'invalid_gameplay_batch' }, 400);
    if (parsed.data.accountId !== browser.id) return context.json({ error: 'account_changed' }, 409);
    const principal = await auth?.getPrincipal(context.req.raw.headers);
    const parent = principal ? await resolvePlayerAccount(principal) : null;
    const receipt=await collectGameplay(browser.id, parsed.data, parent?.id ?? null);
    return context.json({ stored: true, profileId: parsed.data.profileId,
      revision: parsed.data.revision, eventKeys: parsed.data.attempts.map(attempt => attempt.eventKey),
      ...(parsed.data.version===2?{observationLinks:receipt?.observationLinks??[]}:{}), });
  });

  app.get('/v1/gameplay/summary', async context => {
    if (!gameplaySummary) return context.json({ error: 'unavailable' }, 503);
    const principal = await auth?.getPrincipal(context.req.raw.headers);
    const token = browserToken(context.req.header('Authorization'));
    const browser = token && resolveGameplayBrowser ? await resolveGameplayBrowser(token) : null;
    const account = principal ? await resolvePlayerAccount(principal) : browser;
    if (!account) return context.json({ error: 'unauthorized' }, 401);
    context.header('Cache-Control', 'no-store');
    return context.json({ profiles: await gameplaySummary(account.id, !!principal) });
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
