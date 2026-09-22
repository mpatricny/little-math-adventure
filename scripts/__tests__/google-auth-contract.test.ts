import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { Server } from 'node:http';
import { createRequire } from 'node:module';
import { after, before, describe, it } from 'node:test';
import { signOutGoogle } from '../../src/auth/googleAuth.js';
import { createApp } from '../../server/src/app.js';
import { createAuthService } from '../../server/src/auth.js';
import type { AppConfig } from '../../server/src/config.js';
import { createLogger } from '../../server/src/logger.js';

const requireServer = createRequire(new URL('../../server/package.json', import.meta.url));
const { serve } = requireServer('@hono/node-server');

describe('Browser sign-out against the production auth handler', () => {
  const origin = 'http://localhost:8002';
  const authConfig = {
    authBaseUrl: origin,
    authSecret: randomBytes(48).toString('base64url'),
    googleClientId: 'test-client.apps.googleusercontent.com',
    googleClientSecret: 'test-client-secret',
  };
  const config: AppConfig = {
    nodeEnv: 'test', port: 3000,
    // No session cookie is supplied: this HTTP contract check never needs a database.
    databaseUrl: 'postgres://unused:unused@127.0.0.1:1/unused',
    corsOrigins: new Set([origin]), auth: authConfig,
    appRelease: 'test', logLevel: 'error',
  };
  const auth = createAuthService(config, authConfig);
  const app = createApp({
    config, auth, logger: createLogger('error'),
    checkDatabase: async () => { throw new Error('Unexpected database access'); },
    resolvePlayerAccount: async () => { throw new Error('Unexpected account access'); },
  });
  let server: Server;
  let apiUrl: string;
  before(() => new Promise<void>((resolve, reject) => {
    // Use the same HTTP adapter as production: an empty POST arrives as a stream,
    // which a direct auth.handler(new Request(...)) check does not reproduce.
    server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 }, (info: { port: number }) => {
      apiUrl = `http://127.0.0.1:${info.port}`;
      resolve();
    });
    server.once('error', reject);
  }));
  after(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await auth.close();
  });

  it('accepts the real frontend request and expires authentication cookies', async () => {
    let response: Response | undefined;
    await signOutGoogle(undefined, async (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set('Origin', origin);
      response = await fetch(new URL(String(input), apiUrl), { ...init, headers });
      return response;
    });
    assert.ok(response);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
    assert.match(response.headers.get('set-cookie') ?? '', /Max-Age=0/i);
  });
});
