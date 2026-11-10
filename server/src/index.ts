import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { createAuthService } from './auth.js';
import { loadConfig } from './config.js';
import { checkDatabase, createDatabase } from './db/database.js';
import { ensurePlayerAccount } from './domain/playerAccounts.js';
import { createLogger } from './logger.js';
import { collectGameplay, gameplaySummary, resolveGameplayBrowser } from './domain/gameplay.js';
import { createAnalyticsService } from './admin/routes.js';
import { recordGoogleLogin } from './domain/analytics/ingest.js';
import { recordCapabilities } from './domain/analytics/ingest.js';
import { requireAppliedMigrations } from './db/preflight.js';

const config = loadConfig();
const logger = createLogger(config.logLevel);
const database = createDatabase(config.databaseUrl);
await requireAppliedMigrations(database,new URL('../migrations/',import.meta.url).pathname);
await recordCapabilities(database,config.analytics?.collectionEnabled??false);
const analytics = createAnalyticsService(database, config);
const auth = config.auth ? createAuthService(config, config.auth, data =>
  recordGoogleLogin(database, data, analytics.readAuthContext(data.headers))) : null;
if (!auth) logger.info('auth.not_configured');
const app = createApp({
  config,
  auth,
  checkDatabase: () => checkDatabase(database),
  resolvePlayerAccount: principal => ensurePlayerAccount(database, principal),
  logger,
  collectGameplay: (accountId, batch, parent) => collectGameplay(database, accountId, batch, parent),
  gameplaySummary: (accountId, parentView) => gameplaySummary(database, accountId, parentView),
  resolveGameplayBrowser: (token, device) => resolveGameplayBrowser(database, token, device),
  analytics,
});

const server = serve({
  fetch: app.fetch,
  hostname: '0.0.0.0',
  port: config.port,
}, info => {
  logger.info('server.started', {
    port: info.port,
    environment: config.nodeEnv,
    release: config.appRelease,
  });
});

server.on('error', error => {
  logger.error('server.listen_failed', { error: error.message });
  void Promise.all([
    database.end({ timeout: 5 }),
    auth?.close(),
  ]).finally(() => process.exit(1));
});

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('server.stopping', { signal });

  const forceExit = setTimeout(() => {
    logger.error('server.shutdown_timeout');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close(error => {
    void Promise.all([
      database.end({ timeout: 5 }),
      auth?.close(),
    ]).then(() => {
      clearTimeout(forceExit);
      if (error) {
        logger.error('server.stop_failed', { error: error.message });
        process.exit(1);
      }
      logger.info('server.stopped');
      process.exit(0);
    });
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
