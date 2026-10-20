import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { devSavesPlugin } from './dev-saves.mjs';
import { DevSaveStore } from './dev-save-store.mjs';
import { createSaveRecoveryProxy } from './dev-save-recovery-proxy.mjs';

const root = path.resolve(import.meta.dirname, '..');
const temporary = await mkdtemp(path.join(tmpdir(), 'dev-save-browser-'));
const images = path.join(root, 'artifacts/dev-save-review');
await mkdir(images, { recursive: true });
const oldOrigin = 'http://192.168.254.198:8001';
const fixture = (id, name, level) => ({ player: { name, gameplayProfileId: id, level, hp: 15, maxHp: 15, attack: 7, defense: 2,
    storyProgress: { hasClaimedForestCrystal: true }, seenGuides: ['forge.merge.v1'] },
    mathStats: { totalAttempts: level * 100, correctAnswers: level * 90, recentResults: [true, false], problemStats: {} }, timestamp: 1791200000000 });
const ada = fixture('qa-profile-ada', 'QA Ada', 6), eli = fixture('qa-profile-eli', 'QA Eli', 8);
let forwardedCredentials = false;
const vite = await createServer({ configFile: false, root, logLevel: 'error', optimizeDeps: { entries: [], noDiscovery: true },
    plugins: [{ name: 'check-recovery-credentials', configureServer(server) { server.middlewares.use((request, _response, next) => {
        if (request.headers.host === new URL(oldOrigin).host && (request.headers.cookie || request.headers.authorization)) forwardedCredentials = true;
        next();
    }); } }, devSavesPlugin(temporary)],
    server: { host: '127.0.0.1', port: 0, hmr: false },
});
let browser, proxy;
try {
    await vite.listen();
    assert(vite.config.fsDenyGlob(path.join(root, '.local-saves/development/catalog.json')));
    const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
    proxy = createSaveRecoveryProxy({ hostname: '127.0.0.1', port: 0, oldOrigin, target: base });
    const addresses = await proxy.listen();
    const api = base + '/__dev-saves/api';
    assert.equal((await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
    assert.equal((await fetch(api, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
    assert.equal((await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://wrong.invalid' }, body: '{}' })).status, 403);
    assert.equal((await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: '{broken' })).status, 400);
    assert.equal((await fetch(base + '/__dev-saves/')).status, 200);
    const pac = await (await fetch(addresses.pacUrl)).text();
    assert(pac.includes(oldOrigin + '/')); assert(pac.includes('DIRECT'));
    const forbidden = await new Promise((resolve, reject) => {
        const request = http.get({ host: '127.0.0.1', port: proxy.server.address().port, path: 'http://not-the-game.invalid/' }, response => { response.resume(); resolve(response.statusCode); });
        request.on('error', reject);
    });
    assert.equal(forbidden, 403);

    browser = await chromium.launch({ headless: true });
    const tablet = await browser.newContext({ viewport: { width: 1024, height: 768 }, proxy: { server: `http://${addresses.proxy}` } });
    await tablet.addCookies([{ name: 'unrelated_session', value: 'qa-only', url: oldOrigin }]);
    await tablet.addInitScript(({ origin, ada, eli }) => {
        if (location.origin !== origin) return;
        if (!localStorage.getItem('littleMathAdventure_slot_1')) localStorage.setItem('littleMathAdventure_slot_1', JSON.stringify(ada));
        if (!localStorage.getItem('littleMathAdventure_slot_6')) localStorage.setItem('littleMathAdventure_slot_6', JSON.stringify(eli));
    }, { origin: oldOrigin, ada, eli });
    const rescue = await tablet.newPage();
    const errors = []; rescue.on('pageerror', error => errors.push(error.message));
    await rescue.goto(oldOrigin + '/__dev-saves/recover');
    await rescue.getByRole('button', { name: '💾 ZÁLOHOVAT' }).waitFor();
    assert.equal(await rescue.locator('article').count(), 2);
    await rescue.screenshot({ path: path.join(images, 'tablet-recovery-normal.png') });
    const capture = rescue.getByRole('button', { name: '💾 ZÁLOHOVAT' });
    await capture.hover(); await rescue.screenshot({ path: path.join(images, 'tablet-recovery-hover.png') });
    const hitArea = await capture.boundingBox();
    await rescue.mouse.down(); assert.deepEqual(await capture.boundingBox(), hitArea);
    await rescue.screenshot({ path: path.join(images, 'tablet-recovery-pressed.png') }); await rescue.mouse.up();
    await rescue.getByText('✓ ULOŽENO NA MACU', { exact: true }).waitFor();
    await rescue.screenshot({ path: path.join(images, 'tablet-recovery-complete.png') });
    const store = new DevSaveStore(path.join(temporary, '.local-saves/development'));
    const archived = await store.catalog(); assert.equal(archived.records.length, 2);
    assert.deepEqual(archived.records[0].save, ada); assert.deepEqual(archived.records[1].save, eli);
    assert.equal(forwardedCredentials, false);
    assert.deepEqual(await rescue.evaluate(() => JSON.parse(localStorage.getItem('littleMathAdventure_slot_1'))), ada);

    const newerTablet = await browser.newContext({ viewport: { width: 600, height: 800 } });
    const protectedPage = await newerTablet.newPage();
    const moreAdvanced = structuredClone(ada); moreAdvanced.player.level = 7;
    moreAdvanced.mathStats.totalAttempts += 50; moreAdvanced.timestamp += 86400000;
    await protectedPage.addInitScript(save => {
        localStorage.setItem('littleMathAdventure_slot_1', JSON.stringify(save));
    }, moreAdvanced);
    await protectedPage.goto(base + '/__dev-saves/');
    await protectedPage.getByText('⚠ STARŠÍ NA MACU', { exact: true }).waitFor();
    await protectedPage.getByRole('button', { name: '↩ OBNOVIT' }).click();
    await protectedPage.getByText('⚠ Starší uložená hra', { exact: true }).waitFor();
    assert.deepEqual(await protectedPage.evaluate(() => JSON.parse(localStorage.getItem('littleMathAdventure_slot_1'))), moreAdvanced);
    await protectedPage.screenshot({ path: path.join(images, 'tablet-older-restore-blocked.png') });
    await newerTablet.close();

    const home = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await home.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/__dev-saves/'); await page.locator('article').nth(1).waitFor();
    await page.screenshot({ path: path.join(images, 'desktop-manager-normal.png') });
    await page.setViewportSize({ width: 600, height: 800 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: path.join(images, 'tablet-manager-normal.png') });
    await page.locator('input').first().uncheck();
    await page.screenshot({ path: path.join(images, 'tablet-manager-selection.png') });
    await page.locator('input').first().check();
    const restore = page.getByRole('button', { name: '↩ OBNOVIT' });
    await restore.click(); await page.getByText('✓ HOTOVO', { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('littleMathAdventure_slot_1'))), ada);
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('littleMathAdventure_slot_6'))), eli);
    await page.screenshot({ path: path.join(images, 'tablet-manager-complete.png') });
    await page.evaluate(async () => { const { startDevSaveSync } = await import('/src/systems/DevSaveSync.ts'); window.stopDevSaveSync = await startDevSaveSync(); });
    await page.evaluate(async () => { const { SaveSystem } = await import('/src/systems/SaveSystem.ts'); const data = SaveSystem.load(1); data.player.level++; data.mathStats.totalAttempts++; SaveSystem.save(1, data.player, data.mathStats); });
    await page.waitForFunction(async () => (await (await fetch('/__dev-saves/api')).json()).records.find(record => record.profileId === 'qa-profile-ada').revision === 2);
    await page.evaluate(() => window.stopDevSaveSync());
    const newAddress = base.replace('127.0.0.1', 'localhost');
    const next = await home.newPage(); await next.goto(newAddress + '/__dev-saves/');
    await next.evaluate(async () => { const { DevSaveSync } = await import('/src/systems/DevSaveSync.ts'); await new DevSaveSync().initialize(); });
    assert.equal(await next.evaluate(() => JSON.parse(localStorage.getItem('littleMathAdventure_slot_1')).player.level), 7);
    assert.equal(await next.evaluate(() => Object.keys(localStorage).filter(key => /^littleMathAdventure_slot_\d$/.test(key)).length), 2);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ ok: true, recovery: 'old origin -> original browser data -> Mac -> home origin', automaticBackup: true,
        automaticRestoreAcrossOrigins: true, noCredentialForwarding: true, images }, null, 2));
} finally {
    await browser?.close();
    await new Promise(resolve => proxy ? proxy.server.close(resolve) : resolve());
    await vite.close(); await rm(temporary, { recursive: true, force: true });
}
