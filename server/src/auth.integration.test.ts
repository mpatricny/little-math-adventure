import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import { createAuthService, type AuthService } from './auth.js';
import type { AppConfig } from './config.js';
import { createDatabase, type Database } from './db/database.js';
import { applyMigrations, discoverMigrations } from './db/migrations.js';

const databaseUrl = process.env.DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = path.resolve(currentDirectory, '../migrations');

integration('Google authentication integration', () => {
  let database: Database;
  let auth: AuthService;

  before(async () => {
    database = createDatabase(databaseUrl!);
    await applyMigrations(database, await discoverMigrations(migrationsDirectory));
    const config: AppConfig = {
      nodeEnv: 'test',
      port: 3000,
      databaseUrl: databaseUrl!,
      corsOrigins: new Set(['http://localhost:8002']),
      auth: {
        authBaseUrl: 'http://localhost:8002',
        authSecret: '01234567890123456789012345678901',
        googleClientId: 'test-client.apps.googleusercontent.com',
        googleClientSecret: 'test-client-secret',
      },
      appRelease: 'test',
      logLevel: 'error',
    };
    auth = createAuthService(config, config.auth!);
  });

  after(async () => {
    await Promise.all([
      auth.close(),
      database.end({ timeout: 5 }),
    ]);
  });

  it('starts Google OAuth with the configured callback and protected state', async () => {
    const response = await auth.handler(new Request(
      'http://localhost:8002/api/auth/sign-in/social',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Origin: 'http://localhost:8002',
        },
        body: JSON.stringify({
          provider: 'google',
          callbackURL: '/',
          errorCallbackURL: '/?auth_error=google',
        }),
      },
    ));
    const payload = await response.json() as { redirect?: boolean; url?: string };

    assert.equal(response.status, 200);
    assert.equal(payload.redirect, true);
    assert.ok(payload.url);
    const authorizationUrl = new URL(payload.url);
    assert.equal(authorizationUrl.origin, 'https://accounts.google.com');
    assert.equal(
      authorizationUrl.searchParams.get('redirect_uri'),
      'http://localhost:8002/api/auth/callback/google',
    );
    assert.ok(authorizationUrl.searchParams.get('state'));
  });
});
