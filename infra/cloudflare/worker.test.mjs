import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import worker, { handleRequest } from './worker.mjs';

function fakeAssets() {
  const paths = [];
  return {
    paths,
    fetch: async request => {
      const pathname = new URL(request.url).pathname;
      paths.push(pathname);
      if (pathname === '/index.html') {
        return new Response('<!doctype html>', {
          headers: { 'Content-Type': 'text/html', 'Cache-Control': 'public, max-age=3600' },
        });
      }
      if (pathname === '/landing.html') {
        return new Response('<!doctype html><title>Číslokraj</title>', {
          headers: { 'Content-Type': 'text/html', 'Cache-Control': 'public, max-age=3600' },
        });
      }
      if (pathname === '/assets/game.js') return new Response('game');
      return new Response('missing', { status: 404 });
    },
  };
}

describe('Cloudflare pilot routing', () => {
  it('accepts the production execution context when forwarding an API request', async context => {
    const requests = [];
    context.mock.method(globalThis, 'fetch', async request => {
      requests.push(request.url);
      return new Response(JSON.stringify({ release: 'pilot-0.1.0' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const response = await worker.fetch(new Request('https://cislokraj.cz/v1/version'), {
      ASSETS: fakeAssets(), APP_RELEASE: 'pilot-0.1.2', API_ORIGIN: 'https://api.cislokraj.cz',
    }, { waitUntil() {}, passThroughOnException() {} });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { release: 'pilot-0.1.0' });
    assert.deepEqual(requests, ['https://api.cislokraj.cz/v1/version']);
  });

  it('keeps OAuth cookies on one canonical hostname', async () => {
    const response = await handleRequest(new Request('https://www.cislokraj.cz/hra/?from=www'), {
      ASSETS: fakeAssets(),
      APP_RELEASE: 'pilot-0.1.0',
      API_ORIGIN: 'https://api.cislokraj.cz',
    });

    assert.equal(response.status, 308);
    assert.equal(response.headers.get('location'), 'https://cislokraj.cz/hra/?from=www');
  });

  it('serves the lightweight landing document at the root', async () => {
    const assets = fakeAssets();
    const response = await handleRequest(new Request('https://cislokraj.cz/'), {
      ASSETS: assets,
      APP_RELEASE: 'pilot-0.1.0',
    });
    assert.equal(response.status, 200);
    assert.deepEqual(assets.paths, ['/landing.html']);
    assert.equal(response.headers.get('cache-control'), 'no-cache');
    assert.equal(response.headers.get('x-cislokraj-release'), 'pilot-0.1.0');
  });

  it('serves the pilot document at /hra/ without long browser caching', async () => {
    const assets = fakeAssets();
    const response = await handleRequest(new Request('https://cislokraj.cz/hra/'), {
      ASSETS: assets,
      APP_RELEASE: 'pilot-0.1.0',
    });
    assert.equal(response.status, 200);
    assert.deepEqual(assets.paths, ['/index.html']);
    assert.equal(response.headers.get('cache-control'), 'no-cache');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-cislokraj-release'), 'pilot-0.1.0');
  });

  it('maps nested game assets and falls back to the game document', async () => {
    const assets = fakeAssets();
    assert.equal((await handleRequest(
      new Request('https://cislokraj.cz/hra/assets/game.js'),
      { ASSETS: assets, APP_RELEASE: 'pilot-0.1.0' },
    )).status, 200);
    assert.equal((await handleRequest(
      new Request('https://cislokraj.cz/hra/save-slots'),
      { ASSETS: assets, APP_RELEASE: 'pilot-0.1.0' },
    )).status, 200);
    assert.deepEqual(assets.paths, ['/assets/game.js', '/save-slots', '/index.html']);
  });

  it('proxies auth and versioned API requests without caching them', async () => {
    const assets = fakeAssets();
    const upstreamRequests = [];
    const fetcher = async request => {
      upstreamRequests.push(request);
      return new Response(JSON.stringify({ authenticated: false }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': 'better-auth.session_token=test; HttpOnly; Secure',
        },
      });
    };
    const env = {
      ASSETS: assets,
      APP_RELEASE: 'pilot-0.1.0',
      API_ORIGIN: 'https://api.cislokraj.cz',
    };

    const response = await handleRequest(
      new Request('https://cislokraj.cz/v1/me?source=landing'),
      env,
      fetcher,
    );

    assert.equal(response.status, 401);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(response.headers.get('set-cookie'), /better-auth\.session_token/);
    assert.equal(upstreamRequests.length, 1);
    assert.equal(upstreamRequests[0].url, 'https://api.cislokraj.cz/v1/me?source=landing');
    assert.equal(upstreamRequests[0].headers.get('x-forwarded-host'), 'cislokraj.cz');
    assert.deepEqual(assets.paths, []);
  });
});
