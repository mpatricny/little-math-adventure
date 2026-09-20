import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createApp } from './app.js';
import type { AuthService } from './auth.js';
import type { AppConfig } from './config.js';
import type { Logger } from './logger.js';

const config: AppConfig = {
  nodeEnv: 'test',
  port: 3000,
  databaseUrl: 'postgresql://example.invalid/test',
  corsOrigins: new Set(['https://cislokraj.cz']),
  authBaseUrl: 'https://cislokraj.cz',
  authSecret: '01234567890123456789012345678901',
  googleClientId: 'google-client-id',
  googleClientSecret: 'google-client-secret',
  appRelease: 'test-release',
  logLevel: 'error',
};

const logger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

function fakeAuth(authenticated = false): AuthService {
  return {
    handler: async () => new Response(JSON.stringify({ auth: true }), {
      headers: { 'Content-Type': 'application/json' },
    }),
    getPrincipal: async () => authenticated ? {
      provider: 'google',
      providerSubject: 'google-subject',
      email: 'player@example.com',
    } : null,
    close: async () => {},
  };
}

function appDependencies(auth = fakeAuth()) {
  return {
    config,
    logger,
    auth,
    checkDatabase: async () => {},
    resolvePlayerAccount: async () => ({ id: 'player-account-id' }),
  };
}

describe('Číslokraj API foundation', () => {
  it('reports liveness and the deployed release', async () => {
    const app = createApp(appDependencies());
    const response = await app.request('/health');

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok', release: 'test-release' });
    assert.ok(response.headers.get('x-request-id'));
  });

  it('reports readiness only when PostgreSQL responds', async () => {
    const ready = createApp(appDependencies());
    const unavailable = createApp({
      ...appDependencies(),
      checkDatabase: async () => { throw new Error('connection refused'); },
    });

    assert.equal((await ready.request('/ready')).status, 200);
    assert.equal((await unavailable.request('/ready')).status, 503);
  });

  it('allows only configured browser origins', async () => {
    const app = createApp(appDependencies());
    const allowed = await app.request('/health', {
      headers: { Origin: 'https://cislokraj.cz' },
    });
    const denied = await app.request('/health', {
      headers: { Origin: 'https://example.com' },
    });

    assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://cislokraj.cz');
    assert.equal(denied.headers.get('access-control-allow-origin'), null);
  });

  it('mounts the auth handler at the public callback path', async () => {
    const app = createApp(appDependencies());
    const response = await app.request('/api/auth/get-session');

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { auth: true });
  });

  it('returns the linked game account only for an authenticated Google session', async () => {
    const anonymous = createApp(appDependencies());
    const authenticated = createApp(appDependencies(fakeAuth(true)));

    assert.equal((await anonymous.request('/v1/me')).status, 401);
    const response = await authenticated.request('/v1/me');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      authenticated: true,
      accountId: 'player-account-id',
    });
  });
});
