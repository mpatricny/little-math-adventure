import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { createApp } from '../server/src/app.js';
import { createDatabase } from '../server/src/db/database.js';
import { applyMigrations, discoverMigrations } from '../server/src/db/migrations.js';
import { collectGameplay, gameplaySummary, resolveGameplayBrowser } from '../server/src/domain/gameplay.js';
import { createLogger } from '../server/src/logger.js';

// Use only a disposable local database. This script deliberately uses fake local identities.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !['localhost', '127.0.0.1'].includes(new URL(databaseUrl).hostname)) {
  throw new Error('A disposable localhost DATABASE_URL is required');
}
const base = process.argv[2] ?? 'http://127.0.0.1:8027';
const db = createDatabase(databaseUrl);
await applyMigrations(db, await discoverMigrations(new URL('../server/migrations/', import.meta.url).pathname));
const parentA = randomUUID(); const parentB = randomUUID();
await db`INSERT INTO player_accounts (id) VALUES (${parentA}), (${parentB})`;
const { serve } = createRequire(new URL('../server/package.json', import.meta.url))('@hono/node-server');
const app = createApp({
  config: { nodeEnv: 'test', port: 0, databaseUrl, corsOrigins: new Set([base]), auth: null,
    appRelease: 'gameplay-browser-test', logLevel: 'error' },
  logger: createLogger('error'), checkDatabase: async () => {},
  auth: { handler: async () => new Response('', { status: 404 }), close: async () => {},
    getPrincipal: async headers => {
      const cookie = headers.get('cookie') ?? '';
      const account = cookie.includes('sync-test-parent=B') ? parentB : cookie.includes('sync-test-parent=A') ? parentA : null;
      if (!account) return null;
      return { provider: 'google', providerSubject: account, email: 'browser-test@example.invalid' };
    } },
  resolvePlayerAccount: async principal => ({ id: principal.providerSubject }),
  collectGameplay: (account, batch, parent) => collectGameplay(db, account, batch, parent),
  gameplaySummary: (account, parentView) => gameplaySummary(db, account, parentView),
  resolveGameplayBrowser: (token, device) => resolveGameplayBrowser(db, token, device),
});
let server: any;
const api = await new Promise<string>(resolve => {
  server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 }, (info: { port: number }) => resolve(`http://127.0.0.1:${info.port}`));
});
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
let loseReceipt = false; let dropped = false;
const errors: string[] = [];
let browserOwner: string | undefined;
const browserOwners = new Set<string>();
const forwardApi = async (route: import('playwright').Route) => {
  const request = route.request();
  const response = await route.fetch({ url: api + new URL(request.url()).pathname,
    headers: { ...request.headers(), Origin: base } });
  if (!response.ok() && new URL(request.url()).pathname !== '/v1/me') {
    console.error('Test API response', new URL(request.url()).pathname, response.status(), await response.text());
  }
  if (new URL(request.url()).pathname === '/v1/gameplay/session' && response.ok()) {
    const identity = await response.json(); browserOwner ??= identity.accountId; browserOwners.add(identity.accountId);
  }
  if (loseReceipt && new URL(request.url()).pathname === '/v1/gameplay/batch') {
    loseReceipt = false; dropped = true; await route.abort('failed'); return;
  }
  await route.fulfill({ response });
};
await context.route('**/v1/**', forwardApi);
let page = await context.newPage();
page.on('pageerror', e => errors.push(e.message));
page.on('console', message => { if (message.text().includes('[GameplaySync]')) console.error(message.text()); });
async function waitForCount(account: string | undefined, count: number) {
  await assert.doesNotReject(async () => {
    for (let i = 0; i < 80; i++) {
      const rows = await db`SELECT count(*)::int AS n FROM gameplay_attempts WHERE account_id=${account ?? browserOwner ?? parentA}`;
      if (rows[0]!.n === count) return;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    const state = await page.evaluate(async () => {
      const { openGameplayStore } = await import('/src/telemetry/GameplayStore.ts');
      const store = await openGameplayStore();
      const profiles = await store.profiles();
      const result = await Promise.all(profiles.map(async p => ({ id: p.id, revision: p.revision,
        acknowledged: p.acknowledgedRevision, pending: (await store.pending(p.id)).length })));
      store.close(); return result;
    });
    console.error('Queued test profiles', state, 'Page errors', errors);
    throw new Error(`Expected ${count} database answers`);
  });
}
async function answer(key: string, correct = true) {
  await page.evaluate(async ({ key, correct }) => {
    const { MasterySystem } = await import('/src/systems/MasterySystem.ts');
    MasterySystem.getInstance().recordSolve(key, correct, 1500, 'battle');
  }, { key, correct });
}
async function newProfile(slot: number, name: string) {
  await page.evaluate(async ({ slot, name }) => {
    const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
    const { PlacementInitializer } = await import('/src/systems/PlacementInitializer.ts');
    const game = GameStateManager.getInstance(); game.reset('boy_knight', name, slot);
    PlacementInitializer.applyBandSelection('D', game);
  }, { slot, name });
}
try {
  await page.goto(base);
  await page.locator('.game-account[data-auth-state="anonymous"]').waitFor();
  await newProfile(0, 'Sync A');
  for (const key of ['D1:10+1:result_unknown', 'D1:10+2:result_unknown', 'D1:10+3:result_unknown']) await answer(key);
  await waitForCount(browserOwner, 3);
  const [first] = await gameplaySummary(db, browserOwner!);
  assert.equal(first!.correct, 3); // The 240 placement successes must not be included.
  assert.equal((await gameplaySummary(db, parentA, true)).length, 0);
  await context.addCookies([{ name: 'sync-test-parent', value: 'A', url: base }]);
  await page.reload(); await page.locator('.game-account[data-auth-state="authenticated"]').waitFor();
  loseReceipt = true;
  await answer('D1:10+4:result_unknown', false);
  await waitForCount(browserOwner, 4);
  assert.equal(dropped, true);
  // Closing and reopening the page preserves the pending upload and its stable event identities.
  await page.close(); page = await context.newPage(); await page.goto(base);
  await page.locator('.game-account[data-auth-state="authenticated"]').waitFor();
  await answer('D1:10+5:result_unknown'); await waitForCount(browserOwner, 5);

  await newProfile(1, 'Sync B'); await answer('D1:10+6:result_unknown');
  await waitForCount(browserOwner, 6);
  assert.equal((await gameplaySummary(db, parentA, true)).length, 2);

  await context.setOffline(true);
  await answer('D1:10+7:result_unknown');
  await page.evaluate(async () => {
    const { openGameplayStore } = await import('/src/telemetry/GameplayStore.ts');
    const store = await openGameplayStore(); await store.profiles(); store.close();
  });
  await context.addCookies([{ name: 'sync-test-parent', value: 'B', url: base }]);
  await context.setOffline(false);
  await page.reload(); await page.locator('.game-account[data-auth-state="authenticated"]').waitFor();
  await newProfile(2, 'Other parent'); await answer('D1:10+8:result_unknown');
  await waitForCount(browserOwner, 8);
  const own = await gameplaySummary(db, parentB, true);
  assert.equal(own.length, 1); assert.equal(own[0]!.name, 'Other parent');
  await context.addCookies([{ name: 'sync-test-parent', value: 'A', url: base }]);
  await page.reload(); await waitForCount(browserOwner, 8);
  const summary = await gameplaySummary(db, parentA, true);
  assert.equal(summary.reduce((n, p) => n + Number(p.correct), 0), 6);
  const secondBrowser = await browser.newContext(); await secondBrowser.route('**/v1/**', forwardApi);
  page = await secondBrowser.newPage(); await page.goto(base);
  await page.locator('.game-account[data-auth-state="anonymous"]').waitFor();
  await newProfile(0, 'Separate browser'); await answer('D1:10+9:result_unknown');
  for (let i = 0; browserOwners.size < 2 && i < 60; i++) await new Promise(r => setTimeout(r, 250));
  assert.equal(browserOwners.size, 2);
  const otherOwner = [...browserOwners].find(id => id !== browserOwner)!;
  await waitForCount(otherOwner, 1);
  assert.equal((await gameplaySummary(db, otherOwner))[0]!.attempts, 1);
  assert.deepEqual(errors, []);
  console.log('PASS: actual browser → persistent IndexedDB → HTTP API → PostgreSQL; retry after lost receipt, reload, offline recovery, anonymous collection, later Google association, separate profiles/parents and browser identities.');
} finally {
  await browser.close();
  await new Promise<void>(resolve => server.close(() => resolve()));
  for (const owner of browserOwners) await db`DELETE FROM player_accounts WHERE id=${owner}`;
  await db`DELETE FROM player_accounts WHERE id IN (${parentA}, ${parentB})`;
  await db.end();
}
