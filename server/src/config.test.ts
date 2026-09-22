import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadConfig, loadDatabaseConfig } from './config.js';

describe('API configuration', () => {
  it('parses explicit environment configuration', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      PORT: '8080',
      DATABASE_URL: 'postgresql://db.example/cislokraj',
      CORS_ORIGINS: 'https://cislokraj.cz, https://www.cislokraj.cz',
      BETTER_AUTH_URL: 'https://cislokraj.cz',
      BETTER_AUTH_SECRET: '01234567890123456789012345678901',
      GOOGLE_CLIENT_ID: 'google-client-id',
      GOOGLE_CLIENT_SECRET: 'google-client-secret',
      APP_RELEASE: 'v1.0.0',
      LOG_LEVEL: 'warn',
    });

    assert.equal(config.port, 8080);
    assert.deepEqual([...config.corsOrigins], [
      'https://cislokraj.cz',
      'https://www.cislokraj.cz',
    ]);
    assert.equal(config.appRelease, 'v1.0.0');
    assert.equal(config.auth?.authBaseUrl, 'https://cislokraj.cz');
  });

  it('starts the API before OAuth credentials have been provisioned', () => {
    const base = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://localhost/cislokraj',
      CORS_ORIGINS: 'https://cislokraj.cz',
    };
    assert.equal(loadConfig(base).auth, null);
    assert.equal(loadConfig({ ...base, BETTER_AUTH_URL: 'https://cislokraj.cz' }).auth, null);
  });

  it('rejects incomplete or empty credentials instead of silently disabling configured auth', () => {
    const base = {
      DATABASE_URL: 'postgresql://localhost/cislokraj',
      CORS_ORIGINS: 'https://cislokraj.cz',
      BETTER_AUTH_URL: 'https://cislokraj.cz',
    };
    for (const key of ['BETTER_AUTH_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']) {
      assert.throws(() => loadConfig({ ...base, [key]: 'partially-provisioned' }));
      assert.throws(() => loadConfig({ ...base, [key]: '' }));
    }
  });

  it('loads migration configuration independently of HTTP and OAuth setup', () => {
    assert.deepEqual(loadDatabaseConfig({
      DATABASE_URL: 'postgresql://localhost/cislokraj',
      BETTER_AUTH_SECRET: 'incomplete-auth-is-irrelevant-to-migrations',
    }), { databaseUrl: 'postgresql://localhost/cislokraj' });
    assert.throws(() => loadDatabaseConfig({ DATABASE_URL: 'https://example.com' }), /postgres/);
    assert.throws(() => loadDatabaseConfig({}));
  });

  it('rejects origins containing paths', () => {
    assert.throws(() => loadConfig({
      DATABASE_URL: 'postgresql://localhost/cislokraj',
      CORS_ORIGINS: 'https://cislokraj.cz/hra',
      BETTER_AUTH_URL: 'https://cislokraj.cz',
      BETTER_AUTH_SECRET: '01234567890123456789012345678901',
      GOOGLE_CLIENT_ID: 'google-client-id',
      GOOGLE_CLIENT_SECRET: 'google-client-secret',
    }), /invalid origin/);
  });

  it('rejects an auth URL containing a path', () => {
    assert.throws(() => loadConfig({
      DATABASE_URL: 'postgresql://localhost/cislokraj',
      CORS_ORIGINS: 'https://cislokraj.cz',
      BETTER_AUTH_URL: 'https://cislokraj.cz/hra',
      BETTER_AUTH_SECRET: '01234567890123456789012345678901',
      GOOGLE_CLIENT_ID: 'google-client-id',
      GOOGLE_CLIENT_SECRET: 'google-client-secret',
    }), /must be an origin/);
  });
});
