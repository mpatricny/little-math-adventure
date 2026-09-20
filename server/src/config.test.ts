import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadConfig } from './config.js';

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
    assert.equal(config.authBaseUrl, 'https://cislokraj.cz');
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
