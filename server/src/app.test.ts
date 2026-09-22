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
  auth: {
    authBaseUrl: 'https://cislokraj.cz',
    authSecret: '01234567890123456789012345678901',
    googleClientId: 'google-client-id',
    googleClientSecret: 'google-client-secret',
  },
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
  it('keeps health checks available without pretending that missing auth is a signed-out session', async () => {
    let accountLookups = 0;
    const app = createApp({
      ...appDependencies(),
      config: { ...config, auth: null },
      auth: null,
      resolvePlayerAccount: async () => { accountLookups += 1; throw new Error('must not query accounts'); },
    });
    assert.equal((await app.request('/health')).status, 200);
    assert.equal((await app.request('/ready')).status, 200);
    for (const [path, method] of [['/v1/me', 'GET'], ['/api/auth/get-session', 'GET'], ['/api/auth/sign-in/social', 'POST']] as const) {
      const response = await app.request(path, { method });
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: 'auth_not_configured' });
    }
    assert.equal(accountLookups, 0);
  });

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

describe('gameplay write authorization', () => {
  const accountId = '4f6e45c8-dd44-49c7-86f8-93a2bb79619c';
  const payload = { version: 1, accountId,
    profileId: 'dd55fd83-e8cf-4639-906e-d4e4c1050e3a',
    deviceId: '4c0997fc-bbfb-4b5a-9a94-8423c65c0e14',
    slotNumber: 1, revision: 1, savedAt: Date.now(), release: 'test',
    progress: { player: { name: 'Child profile' }, mathStats: {} }, attempts: [] };
  const headers = { Origin: 'https://cislokraj.cz', 'Content-Type': 'application/json', Authorization: `Bearer ${'a'.repeat(64)}` };
  it('accepts registered anonymous browsers but rejects unknown, cross-origin, malformed and cross-browser writes', async () => {
    let writes = 0;
    const dependencies = { ...appDependencies(fakeAuth(true)),
      resolvePlayerAccount: async () => ({ id: accountId }),
      collectGameplay: async () => { writes++; }, gameplaySummary: async () => [],
      resolveGameplayBrowser: async (token: string) => token === 'a'.repeat(64) ? { id: accountId } : null };
    const app = createApp(dependencies);
    const anonymous = createApp({ ...dependencies, auth: fakeAuth(false) });
    const post = (body: unknown, extraHeaders = headers) => ({ method: 'POST', headers: extraHeaders, body: JSON.stringify(body) });
    assert.equal((await anonymous.request('/v1/gameplay/batch', post(payload, { ...headers, Authorization: '' }))).status, 401);
    assert.equal((await app.request('/v1/gameplay/batch', post(payload, { ...headers, Origin: 'https://evil.invalid' }))).status, 403);
    assert.equal((await app.request('/v1/gameplay/batch', post({ ...payload, accountId: crypto.randomUUID() }))).status, 409);
    assert.equal((await app.request('/v1/gameplay/batch', post({ ...payload, slotNumber: 9 }))).status, 400);
    assert.equal((await app.request('/v1/gameplay/batch', { ...post(payload), body: '{' })).status, 400);
    assert.equal((await app.request('/v1/gameplay/batch', post({ ...payload, padding: 'x'.repeat(2 * 1024 * 1024) }))).status, 413);
    assert.equal(writes, 0);
    const response = await app.request('/v1/gameplay/batch', post(payload));
    assert.equal(response.status, 200); assert.equal(writes, 1);
    assert.deepEqual(await response.json(), { stored: true, profileId: payload.profileId, revision: 1, eventKeys: [] });
    assert.equal((await anonymous.request('/v1/gameplay/batch', post(payload))).status, 200);
    assert.equal(writes, 2);
    assert.equal((await anonymous.request('/v1/gameplay/summary')).status, 401);
  });
});
