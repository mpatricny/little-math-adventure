import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

// One isolated release smoke: new game -> comic -> crash site -> offline save.
// Server-side throttling covers worker fetches as well as page requests.
const root = path.resolve('dist/pilot');
const rate = 2 * 1024 * 1024;
const fault = '/assets/library/originals/1e500396-3794da21.webp';
const requests = [];
let nextChunk = 0, interrupted = false;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
    '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.txt': 'text/plain' };
const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    requests.push({ path: url.pathname, cache: req.headers['cache-control'] ?? '', at: Date.now() });
    if (/^\/(api|v1)\//.test(url.pathname)) {
        res.writeHead(req.method === 'GET' ? 401 : 503, { 'Content-Type': 'application/json' });
        res.end('{}'); return; // QA never writes to production or uses real saves.
    }
    if (url.pathname === '/index.html') { res.writeHead(307, { Location: '/' }); res.end(); return; }
    const resource = url.pathname === '/hra/' ? '/index.html' : url.pathname.replace(/^\/hra\/assets\//, '/assets/');
    const file = path.resolve(root, '.' + decodeURIComponent(resource));
    if (req.method !== 'GET' || !file.startsWith(root + path.sep) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
    const body = readFileSync(file);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'public,max-age=3600', 'Content-Length': body.length });
    if (resource === fault && !interrupted) {
        interrupted = true; res.write(body.subarray(0, 256)); setTimeout(() => res.destroy(), 100); return;
    }
    let offset = 0;
    const chunk = () => {
        if (res.destroyed) return;
        const end = Math.min(offset + 64 * 1024, body.length);
        const at = Math.max(Date.now(), nextChunk);
        nextChunk = at + (end - offset) / rate * 1000;
        setTimeout(() => {
            if (res.destroyed) return;
            res.write(body.subarray(offset, end)); offset = end;
            if (offset === body.length) res.end(); else chunk();
        }, Math.max(0, at - Date.now()));
    };
    setTimeout(chunk, 60);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const initialRenderer = process.env.INTRO_QA_RENDERER === 'webgl' ? 'webgl' : 'canvas';
const out = 'artifacts/intro-loading' + (initialRenderer === 'webgl' ? '/webgl' : ''); mkdirSync(out, { recursive: true });
let browser, page;
try {
    browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); console.error('page-error', error.stack); });
    page.on('console', message => { if (/Failed to process file|Texture key already in use/.test(message.text())) { errors.push(message.text()); console.error('asset-error', message.text()); } });
    await page.addInitScript(() => window.addEventListener('cislokraj-download-progress', event => { window.introQAStatus = event.detail; }));
    const scene = key => page.locator(`canvas[data-scene="${key}"]`).waitFor({ timeout: 60_000 });
    const tap = async (x, y) => {
        const bounds = await page.locator('canvas').boundingBox();
        await page.mouse.click(bounds.x + x * bounds.width / 1280, bounds.y + y * bounds.height / 720);
    };
    await page.goto(origin + '/hra/' + (initialRenderer === 'canvas' ? '?renderer=canvas' : ''), { waitUntil: 'domcontentloaded' });
    await scene('MenuScene');
    assert.equal(interrupted, false, 'crash-site media must not block the initial menu');
    await tap(640, 330); await scene('CharacterSelectNewScene');
    await page.locator('input').fill('Intro QA');
    await tap(640, 670); await scene('BandSelectScene');
    await tap(164, 343); await tap(640, 630); await scene('ComicScene');
    console.log(JSON.stringify({ stage: 'comic', initialRenderer, throttledBytesPerSecond: rate }));
    await scene('CrashSiteScene');
    const entered = Date.now();
    await page.waitForTimeout(700); // Finish the existing camera fade before visual review.
    await page.screenshot({ path: out + '/crash-desktop.png' });
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.screenshot({ path: out + '/crash-tablet.png' });
    assert.equal(interrupted, true);
    const retries = requests.filter(r => r.path === fault);
    assert.ok(retries.some(r => r.cache === 'no-cache'), 'interrupted body needs an uncached recovery');
    assert.ok(retries[0].at < entered, 'crash-site download must start before entering the scene');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ stage: 'crash-site', recovered: true, pageErrors: errors }));
    await page.waitForFunction(() => window.introQAStatus?.ready, null, { timeout: 90_000 });
    const save = await page.evaluate(() => localStorage.getItem('littleMathAdventure_slot_0'));
    assert.ok(save?.includes('Intro QA'));
    const before = requests.filter(r => /\/assets\//.test(r.path)).length;
    await context.setOffline(true); await page.reload({ waitUntil: 'domcontentloaded' });
    await scene('MenuScene');
    await tap(640, 280); await scene('MenuNewScene');
    await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Enter');
    await scene('TownScene'); // The current save-resume policy starts this new profile in Mathoria.
    await page.waitForTimeout(700);
    await page.screenshot({ path: out + '/save-offline-tablet.png' });
    assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(() => localStorage.getItem('littleMathAdventure_slot_0')), save);
    assert.equal(requests.filter(r => /\/assets\//.test(r.path)).length, before);
    console.log(JSON.stringify({ stage: 'offline-save-reload', savePreserved: true, networkAssetRequests: 0 }));
    // The same verified files must also render in production's default WebGL mode.
    await page.goto(origin + '/hra/', { waitUntil: 'domcontentloaded' });
    await scene('MenuScene'); await tap(640, 280); await scene('MenuNewScene');
    await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Enter');
    await scene('TownScene'); await page.waitForTimeout(700);
    await page.screenshot({ path: out + '/save-offline-webgl-tablet.png' });
    assert.deepEqual(errors, []);
    assert.equal(requests.filter(r => /\/assets\//.test(r.path)).length, before);
    console.log(JSON.stringify({ stage: 'offline-webgl-save-reload', networkAssetRequests: 0 }));
} catch (error) {
    if (page && !page.isClosed()) {
        console.error('failure-state', await page.evaluate(() => ({ scene: document.querySelector('canvas')?.dataset.scene,
            status: window.introQAStatus && { ready: window.introQAStatus.ready, cached: window.introQAStatus.cached.length,
                storageError: window.introQAStatus.storageError, revision: window.introQAStatus.revision } })));
        await page.screenshot({ path: out + '/failure.png' });
    }
    throw error;
} finally {
    await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
