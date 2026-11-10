import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { createRequire } from 'node:module';
import { chromium, type Page, type BrowserContext } from 'playwright';
import { analyticsTestDatabase } from '../server/src/domain/analytics/testDatabase.js';
import { createApp } from '../server/src/app.js';
import { createAnalyticsService } from '../server/src/admin/routes.js';
import { collectGameplay, gameplaySummary, resolveGameplayBrowser } from '../server/src/domain/gameplay.js';
import { recordCapabilities } from '../server/src/domain/analytics/ingest.js';
import { createLogger } from '../server/src/logger.js';
import type { AppConfig } from '../server/src/config.js';
import { handleRequest } from '../infra/cloudflare/worker.mjs';

// The build is unmodified. No dev server, API response stubs, public admin bypass,
// synthetic analytics rows, or real children's saves are used by this runner.
const build = resolve('dist/pilot');
const document = await readFile(resolve(build, 'index.html'), 'utf8');
const entry = document.match(/type="module"[^>]+src="([^"]+)"/)?.[1];
assert.ok(entry, 'Build once with npm run build:pilot before browser acceptance.');
assert.match(await readFile(resolve(build,'.'+entry),'utf8'),/serviceWorker\.register/,
    'The acceptance build must include the production offline client; do not inherit NODE_ENV=test into Vite.');
const manifest = JSON.parse(await readFile(resolve(build, 'offline-manifest.json'), 'utf8'));
const analyticsEntry=manifest.shell.find((url:string)=>url.includes('/AnalyticsClient-'));
assert.ok(!JSON.stringify(manifest).includes('admin.html'));
const output = resolve('artifacts/analytics');
await mkdir(output, { recursive: true });
const db = await analyticsTestDatabase(); // Must print migration preflight before starting a browser.
const parent = randomUUID(), adminSubject = 'browser-admin-' + randomUUID();
const ownerIds = new Set<string>(), profileIds = [randomUUID(), randomUUID()];
await db`INSERT INTO player_accounts(id) VALUES(${parent})`;
await recordCapabilities(db, true);
const origins = new Set<string>();
const config: AppConfig = {
    nodeEnv: 'test', port: 0, databaseUrl: process.env.ANALYTICS_TEST_DATABASE_URL!,
    corsOrigins: origins, appRelease: 'analytics-browser', logLevel: 'error',
    auth: { authBaseUrl: 'http://localhost', authSecret: 'analytics-browser-secret-at-least-32-characters',
        googleClientId: 'local-test', googleClientSecret: 'local-test' },
    analytics: { adminEnabled: true, collectionEnabled: true, adminSubjects: new Set([adminSubject]), bootstrapEmail: null },
};
const service = createAnalyticsService(db, config);
const app = createApp({ config, logger: createLogger('error'), checkDatabase: async () => {}, analytics: service,
    auth: { close: async () => {}, getPrincipal: async headers => {
        const cookie = headers.get('cookie') ?? '';
        if (!cookie.includes('analytics-smoke-role=')) return null;
        const isAdmin = cookie.includes('analytics-smoke-role=admin');
        return { provider: 'google', providerSubject: isAdmin ? adminSubject : 'other-parent', email: 'test@example.invalid',
            emailVerified: true, sessionId: isAdmin ? 'local-admin-session' : 'local-parent-session' };
    }, handler: async request => request.url.endsWith('/sign-out')
        ? Response.json({ success: true }, { headers: { 'Set-Cookie': 'analytics-smoke-role=; Path=/; Max-Age=0' } })
        : Response.json({ error: 'not_found' }, { status: 404 }) },
    resolvePlayerAccount: async () => ({ id: parent }),
    collectGameplay: (account, batch, linkedParent) => collectGameplay(db, account, batch, linkedParent),
    gameplaySummary: (account, parentView) => gameplaySummary(db, account, parentView),
    resolveGameplayBrowser: async (token, device) => {
        const owner = await resolveGameplayBrowser(db, token, device); if (owner) ownerIds.add(owner.id); return owner;
    },
});
const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };
let loseAck = false, lostAck = false;
const apiErrors: string[] = [], browserErrors: string[] = [];
let checkingInvalidRecords = false;
const schemaRejections = new Set<string>();
const assets = { fetch: async (request: Request) => {
    const pathname = decodeURIComponent(new URL(request.url).pathname), file = resolve(build, '.' + pathname);
    if (!file.startsWith(build + '/')) return new Response('', { status: 404 });
    try {
        const data = await readFile(file);
        return new Response(request.method === 'HEAD' ? null : data, {
            headers: { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
                'Service-Worker-Allowed': '/', 'Cache-Control': pathname.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' },
        });
    } catch { return new Response('', { status: 404 }); }
} };
const { serve } = createRequire(new URL('../server/package.json', import.meta.url))('@hono/node-server');
let server: any;
const base = await new Promise<string>(ready => {
    server = serve({ hostname: '127.0.0.1', port: 0, fetch: async (request: Request) => {
        const response = await handleRequest(request, { ASSETS: assets, APP_RELEASE: config.appRelease, API_ORIGIN: 'http://local-api.invalid' }, async (apiRequest: Request) => {
            const response = await app.fetch(apiRequest), path = new URL(apiRequest.url).pathname;
            const expectedSchemaError = checkingInvalidRecords && response.status === 400 &&
                (path === '/v1/gameplay/batch' || path === '/v1/analytics/batch') &&
                (await response.clone().json()).error === (path === '/v1/gameplay/batch' ? 'invalid_gameplay_batch' : 'invalid_analytics_batch');
            if (expectedSchemaError) schemaRejections.add(path);
            if (response.status >= 400 && !['/v1/me', '/v1/admin/bootstrap'].includes(path) &&
                !expectedSchemaError && !(path.startsWith('/v1/admin/') && [401,403].includes(response.status))) apiErrors.push(`${path}: ${response.status} ${await response.clone().text()}`);
            if (loseAck && path === '/v1/gameplay/batch' && response.ok) {
                loseAck = false; lostAck = true; return Response.json({ error: 'lost_receipt_fixture' }, { status: 503 });
            }
            return response;
        });
        if (response.headers.get('Content-Type')?.includes('text/html')) {
            // Match the important production gate: no unsafe-eval, including after a save is loaded.
            response.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob:; connect-src 'self'; worker-src 'self' blob:");
        }
        return response;
    } }, (info: { port: number }) => ready(`http://127.0.0.1:${info.port}`));
});
origins.add(base);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
function monitor(page: Page) {
    page.on('pageerror', error => browserErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && /Content Security Policy|EvalError/.test(message.text())) browserErrors.push(message.text()); });
    page.on('requestfailed', request => { if (/\.js(?:\?|$)/.test(request.url()) && !request.failure()?.errorText.includes('ERR_ABORTED')) browserErrors.push(`script: ${request.url()} ${request.failure()?.errorText}`); });
}
function save(name: string, id: string, characterType: string) {
    return { timestamp: Date.now(), player: { name, gameplayProfileId: id, characterType, level: 1, hp: 20, maxHp: 20,
        coins: { copper: 0, silver: 0, gold: 0, pouch: 0 }, diamonds: { common: 0, red: 0, green: 0 }, status: 'healthy',
        attack: 1, attackPowerVersion: 1, defense: 0, equippedWeapon: null, equippedArmor: null, equippedShield: null, equippedHelmet: null,
        potions: 0, hasPotionSubscription: false, pet: null, unlockedPets: [], perfectDefeats: [], ownedPets: [], activePet: null,
        arena: { isActive: false, arenaLevel: 1, currentBattle: 0, playerHpAtStart: 20, completedArenaLevels: [], waveResults: [] },
        crystals: { crystals: [], maxCapacity: 60 }, mana: 0, groundCrystals: [], defeatedBosses: [],
        townProgress: { unlockedBuildings: ['arena-building'], revealedBuildings: ['arena-building'], visitedBuildings: ['arena-building'], totalWavesCompleted: 0, wavesAfterForgeUnlock: 0 },
        storyProgress: { hasCompletedIntro: true, hasSeenArenaExplanation: true } },
        mathStats: { totalAttempts: 0, correctAnswers: 0, recentResults: [], currentDifficulty: 1, highestDifficulty: 1,
            problemStats: {}, currentPool: [], poolCycle: 0, dailyAttempts: 0, lastAttemptDate: '' } };
}
const name = 'Ada dlouhé jméno <img src=x onerror=alert(1)>';
await context.addInitScript(({ slots }) => {
    if (localStorage.getItem('analytics-smoke-seeded')) return;
    slots.forEach((value, index) => localStorage.setItem(`littleMathAdventure_slot_${index}`, JSON.stringify(value)));
    localStorage.setItem('littleMathAdventure_activeSlot', '0'); localStorage.setItem('analytics-smoke-seeded', 'true');
}, { slots: [save(name, profileIds[0]!, 'girl_knight'), save('Borek', profileIds[1]!, 'boy_knight')] });
const page = await context.newPage(); monitor(page);
async function poll(check: () => Promise<boolean>, label: string, timeout = 30_000) {
    const deadline = Date.now() + timeout;
    do { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 150)); } while (Date.now() < deadline);
    throw new Error(`Timeout: ${label}; API: ${apiErrors.join('; ')}; browser: ${browserErrors.join('; ')}`);
}
async function inspectGame(page: Page) {
    await page.evaluate(async entry => {
        const module = await import(entry!);
        (window as any).__analyticsSmokePhaser = Object.values(module).find((value: any) => value?.Game && value?.AUTO !== undefined);
    }, entry);
    const cdp = await page.context().newCDPSession(page);
    const proto = await cdp.send('Runtime.evaluate', { expression: 'window.__analyticsSmokePhaser.Game.prototype' });
    const objects = await cdp.send('Runtime.queryObjects', { prototypeObjectId: proto.result.objectId! });
    await cdp.send('Runtime.callFunctionOn', { objectId: objects.objects.objectId!,
        functionDeclaration: 'function(){window.__analyticsSmokeGame=this.find(game=>game.canvas && game.scene);return this.length;}', returnByValue: true });
    await cdp.detach();
    await page.evaluate(async url=>{const module=await import(url);for(const candidate of Object.values(module))if(typeof candidate==='function'&&candidate.length===0&&candidate.constructor.name!=='AsyncFunction'){
        try{const c=(candidate as any)();if(c?.clock&&c?.flush)(window as any).__analyticsSmokeClient=c;}catch{}}
    },analyticsEntry);
}
async function scene(key: string) { await page.waitForFunction(key => (window as any).__analyticsSmokeGame?.scene.isActive(key), key, { timeout: 30_000 }); }
async function startScene(key: string, data: unknown = {}) {
    await page.evaluate(({ key, data }) => { const game = (window as any).__analyticsSmokeGame; game.scene.getScenes(true).at(-1).scene.start(key, data); }, { key, data });
    await scene(key);
}
async function loadSolo() {
    await startScene('MenuNewScene');
    await page.evaluate(() => { const menu = (window as any).__analyticsSmokeGame.scene.keys.MenuNewScene; menu.currentSlotIndex = 0; menu.onLoadClicked(); });
    await scene('TownScene');
}
async function attack(role = 'A') {
    await page.waitForFunction(() => ['player_turn','player_b_turn'].includes((window as any).__analyticsSmokeGame.scene.keys.BattleScene.battleState.phase));
    await page.evaluate(role => { const battle = (window as any).__analyticsSmokeGame.scene.keys.BattleScene; battle.setPhase(role === 'A' ? 'player_turn' : 'player_b_turn'); battle.onAttackClicked(); }, role);
}
async function answer(correct: boolean) {
    await page.waitForFunction(() => { const b = (window as any).__analyticsSmokeGame.scene.keys.BattleScene?.mathBoard; return b?.acceptingAnswer && b.container.visible; }, null, { timeout: 30_000 });
    const choice = await page.evaluate(correct => {
        const b = (window as any).__analyticsSmokeGame.scene.keys.BattleScene.mathBoard, p = b.problems[b.currentProblemIndex];
        const index = p.choices.findIndex((c: unknown) => correct ? c === p.answer : c !== p.answer);
        const bounds = (b.sequential ? b.sequentialView.buttons[index] : b.problemRows[b.currentProblemIndex].buttons[index]).getBounds();
        return { x: bounds.centerX, y: bounds.centerY, selected: p.choices[index], problem: p.question, presentation: b.observation?.trace?.presentationId };
    }, correct);
    const canvas = (await page.locator('canvas').boundingBox())!;
    await page.mouse.click(canvas.x + choice.x * canvas.width / 1280, canvas.y + choice.y * canvas.height / 720);
    return choice;
}
const answers = () => db`SELECT * FROM analytics_attempts_v1 WHERE profile_id IN ${db(profileIds)} ORDER BY occurred_at`;
async function report(context: BrowserContext, resource: string) {
    const response = await context.request.get(base + '/v1/admin/' + resource + '?data=all&learningActor=all&preset=today');
    assert.equal(response.status(), 200); assert.match(response.headers()['cache-control']!, /no-store/); return response.json();
}
try {
    console.log('1/4: built landing → real answer controls → PostgreSQL → private admin');
    await page.goto(base + '/');
    // Declined by default: the game profiles are not uploaded merely by browsing the web.
    assert.equal((await db`SELECT count(*)::int AS n FROM gameplay_profiles WHERE profile_id IN ${db(profileIds)}`)[0]!.n, 0);
    await page.locator('[data-measurement-allow]').click();
    await poll(async () => (await db`SELECT 1 FROM analytics_events WHERE kind='page_view' AND received_at>now()-interval '20 seconds'`).length > 0, 'landing measurement enabled');
    await page.locator('a[href="/hra/"]').first().click(); await page.locator('canvas').waitFor();
    await inspectGame(page); await scene('MenuScene'); await loadSolo();
    await startScene('BattleScene', { fromArena: true, arenaLevel: 1, wave: 0, encounterId: 'arena-1-wave-1', returnScene: 'ArenaScene' });
    await attack(); const first = await answer(true); await attack(); const second = await answer(false);
    await poll(async () => (await answers()).length === 2, 'two first answers');
    await page.evaluate(async()=>{const client=(window as any).__analyticsSmokeClient;client.flushWindows();await client.flush();});
    const stored = await answers(); assert.equal(stored.filter(a => a.correct).length, 1);
    assert.equal(stored[0]!.details.observation.selected, first.selected); assert.equal(stored[1]!.details.observation.selected, second.selected);
    const owner = stored[0]!.account_id;
    await poll(async () => (await db`SELECT 1 FROM analytics_events WHERE browser_account_id=${owner} AND kind='play_clicked'`).length === 1, 'durable CTA');
    await poll(async () => (await db`SELECT 1 FROM analytics_events WHERE browser_account_id=${owner} AND kind='activity_window' AND payload->>'state'='game-active'`).length>0,'actual measured game interval');
    await context.addCookies([{ name: 'analytics-smoke-role', value: 'admin', url: base }]);
    const admin = await context.newPage(); monitor(admin); await admin.goto(base + '/admin/');
    await admin.getByRole('heading', { name: 'Přehled', exact: true }).waitFor();
    const overview = await report(context, 'overview'); assert.equal(overview.data.cards.attempts.value, 2);
    assert.equal(overview.data.cards.sessions.value, 1); assert.equal(overview.data.funnel.at(-1).value, 1);
    assert.ok(overview.data.cards.gameTime.value>0,'Actual game ticks must reach the measured play-time card.');
    await admin.screenshot({ path: output + '/overview-desktop.png', fullPage: true });
    await admin.setViewportSize({ width: 1024, height: 768 }); await admin.screenshot({ path: output + '/overview-tablet.png', fullPage: true });
    await admin.getByRole('button',{name:'Menu',exact:true}).click();
    assert.equal(await admin.getByRole('navigation',{name:'Administrace'}).isVisible(),false);
    await admin.screenshot({path:output+'/overview-tablet-menu-closed.png',fullPage:true});
    await admin.getByRole('button',{name:'Menu',exact:true}).click();
    const [canonical] = await db`SELECT canonical_profile_id AS id FROM analytics_profile_links WHERE account_id=${owner} AND profile_id=${profileIds[0]!}`;
    await admin.goto(base + '/admin/players/' + canonical!.id + '?data=all&learningActor=all&tab=answers');
    await admin.getByRole('heading', { name, exact: true }).waitFor(); await admin.getByRole('heading', { name: 'Odpovědi hráče' }).waitFor();
    assert.equal(await admin.locator('img[src="x"]').count(), 0);
    await admin.reload(); await admin.getByRole('heading', { name: 'Odpovědi hráče' }).waitFor();
    await admin.screenshot({ path: output + '/player-tablet.png', fullPage: true });
    await admin.setViewportSize({ width: 390, height: 844 });
    assert.ok((await admin.locator('.timestamp').first().boundingBox())!.width>=118,'Mobile timestamps remain readable, rather than breaking into single digits.');
    await admin.screenshot({ path: output + '/player-mobile.png', fullPage: true });
    await admin.setViewportSize({ width: 1024, height: 768 });
    for (const screen of ['traffic', 'players', 'sessions', 'accounts', 'data-quality']) {
        await admin.goto(base + '/admin/' + screen + '?data=all&learningActor=all');
        await admin.getByRole('heading', { name: ({ traffic:'Návštěvnost', players:'Hráči', sessions:'Hraní', accounts:'Účty', 'data-quality':'Stav dat' } as const)[screen]!, exact:true }).waitFor();
        if(screen==='players')assert.equal(await admin.getByText('Nejistý čas',{exact:true}).count(),0,'Observed last-answer dates must be valid timestamps.');
        await admin.screenshot({ path: output + '/' + screen + '-tablet.png', fullPage:true });
    }
    await admin.goto(base + '/admin/players/' + canonical!.id + '?data=all&learningActor=all&tab=learning');
    await admin.getByRole('heading', { name:'Početní výkon', exact:true }).waitFor();
    await admin.screenshot({ path:output + '/learning-tablet.png', fullPage:true });
    await admin.goto(base + '/admin/sessions/' + encodeURIComponent(owner+':'+stored[0]!.play_session_id) + '?data=all&learningActor=all&tab=timeline');
    await admin.getByRole('heading', { name:'Časová osa', exact:true }).waitFor();
    const timelineTimes=await admin.locator('.timeline li').evaluateAll(items=>items.map(item=>Date.parse((item as HTMLElement).dataset.occurredAt!)));
    assert.ok(timelineTimes.length>0);assert.deepEqual(timelineTimes,[...timelineTimes].sort((a,b)=>a-b),'Default timeline is chronological, independent of which scene event comes first.');
    await admin.screenshot({ path:output + '/session-tablet.png', fullPage:true });
    await admin.goto(base + '/admin/players/' + canonical!.id + '?data=all&learningActor=all&tab=answers');
    await admin.getByRole('button',{name:'Označit test / dospělý'}).click();
    await admin.getByRole('dialog').getByRole('textbox',{name:'Důvod'}).fill('Ukázka vratného označení');
    await admin.screenshot({path:output+'/annotation-dialog-tablet.png',fullPage:true});
    await admin.getByRole('dialog').getByRole('button',{name:'Zrušit'}).click();

    console.log('2/4: role guard, annotation + revoke, logout/back, consent withdrawal');
    const stranger = await browser.newContext(), strangerPage = await stranger.newPage(); monitor(strangerPage);
    assert.equal((await stranger.request.get(base + '/v1/admin/overview')).status(), 401);
    await strangerPage.goto(base + '/admin/players/' + canonical!.id);
    await strangerPage.getByRole('button', { name: 'Přihlásit přes Google' }).waitFor();
    await stranger.addCookies([{ name: 'analytics-smoke-role', value: 'parent', url: base }]);
    assert.equal((await stranger.request.get(base + '/v1/admin/overview')).status(), 403);
    await strangerPage.reload(); await strangerPage.getByRole('button', { name: 'Odhlásit a změnit účet' }).waitFor();
    const bootstrap = await (await context.request.get(base + '/v1/admin/bootstrap')).json();
    const annotation = await context.request.post(base + '/v1/admin/annotations', { headers: { Origin: base, 'X-CSRF-Token': bootstrap.csrfToken },
        data: { mutationId: randomUUID(), targetType: 'profile', targetId: canonical!.id, label: 'test', reason: 'Browser smoke fixture' } });
    assert.equal(annotation.status(), 200); const marked = await annotation.json();
    const normal = await context.request.get(base + '/v1/admin/attempts?preset=today&data=normal&learningActor=all');
    assert.equal((await normal.json()).data.total, 0);
    assert.equal((await context.request.post(base + '/v1/admin/annotations/' + marked.id + '/revoke', { headers: { Origin: base, 'X-CSRF-Token': bootstrap.csrfToken },
        data: { mutationId: randomUUID(), reason: 'Browser smoke revoke' } })).status(), 200);
    assert.equal((await report(context, 'attempts')).data.total, 2);
    await admin.getByRole('button', { name: 'Odhlásit', exact: true }).click();
    await admin.getByRole('button', { name: 'Přihlásit přes Google' }).waitFor();
    await admin.goBack(); await admin.getByRole('button', { name: 'Přihlásit přes Google' }).waitFor();
    await stranger.close();

    console.log('3/4: actual co-op A/B answers, one session, guardian → crystal');
    await startScene('CoopSetupScene');
    await page.evaluate(() => { const setup = (window as any).__analyticsSmokeGame.scene.keys.CoopSetupScene; setup.player1Slot = 0; setup.player2Slot = 1; setup.onStartClicked(); });
    await scene('TownScene');
    await startScene('BattleScene', { fromArena: true, arenaLevel: 1, wave: 0, encounterId: 'arena-1-wave-1', returnScene: 'ArenaScene' });
    await attack(); await answer(true);
    await attack('B');
    await answer(false);
    await poll(async () => (await answers()).length === 4, 'both co-op answers');
    const coopAnswers = (await answers()).slice(2);
    assert.equal(coopAnswers[0]!.profile_id, profileIds[0]); assert.equal(coopAnswers[1]!.profile_id, profileIds[1]);
    assert.equal(coopAnswers[0]!.play_session_id, coopAnswers[1]!.play_session_id);
    await poll(async () => (await db`SELECT 1 FROM analytics_events WHERE browser_account_id=${owner} AND kind='play_started' AND play_session_id=${coopAnswers[0]!.play_session_id}`).length === 1, 'one shared co-op session');
    // End-of-encounter fixture, through the real production catalog and victory logic.
    await startScene('GuardianLairScene', { roomId: 'guardian_lair', fromDirection: 'left' });
    await page.evaluate(() => (window as any).__analyticsSmokeGame.scene.keys.GuardianLairScene.startRealBattle());
    await scene('BattleScene'); await page.waitForFunction(() => (window as any).__analyticsSmokeGame.scene.keys.BattleScene.battleState.phase === 'player_turn');
    await page.evaluate(() => { const b = (window as any).__analyticsSmokeGame.scene.keys.BattleScene;
        b.currentBossPhase = b.bossPhases.length - 1; b.battleState.enemies.forEach((e: any) => e.hp = 0); b.checkVictoryOrContinue(); });
    await scene('ForestCrystalRewardScene');
    await poll(async()=>{const rows=await db`SELECT 1 FROM analytics_events WHERE browser_account_id=${owner} AND kind='scene_entered' AND payload->>'scene'='GuardianLairScene' AND payload->>'region'='forest'`;return rows.length>0;},'guardian lair belongs to the forest filter');
    await poll(async()=>{const rows=await db`SELECT 1 FROM analytics_events WHERE browser_account_id=${owner} AND kind='milestone_reached' AND payload->>'milestone'='hasDefeatedVerdantGuardian'`;return rows.length===1;},'one shared guardian milestone');
    await page.screenshot({ path: output + '/coop-victory.png' });

    console.log('4/4: offline answer + reload, original identity/time, lost ACK retry');
    await page.bringToFront();
    await startScene('BattleScene', { fromArena: true, arenaLevel: 1, wave: 0, encounterId: 'arena-1-wave-1', returnScene: 'ArenaScene' });
    await attack();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30_000 });
    // Read real cache readiness rather than sleeping for an arbitrary download duration.
    await poll(async () => page.evaluate(async () => { const keys = await caches.keys();
        const urls = (await Promise.all(keys.map(async key => (await (await caches.open(key)).keys()).map(r => new URL(r.url).pathname)))).flat();
        return urls.includes('/index.html') && urls.some(u => u.includes('/assets/pilotScenes-')); }), 'offline game shell');
    await context.setOffline(true); const offline = await answer(true);
    await poll(async()=>page.evaluate(async id=>{const request=indexedDB.open('cislokraj-gameplay-v1',1),db=await new Promise<IDBDatabase>(resolve=>request.onsuccess=()=>resolve(request.result));
        const read=db.transaction('events').objectStore('events').getAll(),events=await new Promise<any[]>(resolve=>read.onsuccess=()=>resolve(read.result));db.close();return events.some(e=>!e.sent&&e.eventKey===`attempt:${id}`);},offline.presentation),'offline answer committed locally');
    await page.reload(); await inspectGame(page); await scene('MenuScene');
    await startScene('CoopSetupScene');
    await page.evaluate(() => { const setup = (window as any).__analyticsSmokeGame.scene.keys.CoopSetupScene; setup.player1Slot = 0; setup.player2Slot = 1; setup.onStartClicked(); });
    await page.waitForFunction(() => ['TownScene','ForestCrystalRewardScene'].some(key=>(window as any).__analyticsSmokeGame.scene.isActive(key)));
    await startScene('BattleScene', { fromArena: true, arenaLevel: 1, wave: 0, encounterId: 'arena-1-wave-1', returnScene: 'ArenaScene' });
    await attack(); await answer(false);
    loseAck = true; await context.setOffline(false);
    await poll(async () => (await answers()).length === 6, 'offline answers persisted + uploaded', 45_000);
    await poll(async () => lostAck && await page.evaluate(async () => {
        const request=indexedDB.open('cislokraj-gameplay-v1',1),db=await new Promise<IDBDatabase>((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
        const get=db.transaction('events').objectStore('events').getAll(),events=await new Promise<any[]>(resolve=>get.onsuccess=()=>resolve(get.result));db.close();return events.every(e=>e.sent===1);
    }), 'receipt retry drains the same durable IDs',45_000);
    const final = await answers(); assert.equal(final[4]!.details.observation.selected, offline.selected);
    assert.ok(final[4]!.occurred_at.getTime() < final[4]!.received_at.getTime());
    assert.equal(new Set(final.map(a => a.logical_key)).size, 6);
    const landing = await context.newPage(); monitor(landing); await landing.goto(base + '/');
    await landing.locator('[data-measurement-decline]').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('cislokraj-analytics-permission-v1')!).allowed === false);
    const before = (await answers()).length;
    await page.bringToFront();
    await startScene('BattleScene', { fromArena: true, arenaLevel: 1, wave: 0, encounterId: 'arena-1-wave-1', returnScene: 'ArenaScene' });
    await attack(); await answer(true);
    await page.evaluate(async () => { await new Promise(resolve => setTimeout(resolve, 100)); });
    assert.equal((await answers()).length, before);
    assert.ok(await page.evaluate(() => !!localStorage.getItem('littleMathAdventure_slot_0')));
    await landing.locator('[data-measurement-allow]').click();
    await poll(async()=>page.evaluate(()=>(window as any).__analyticsSmokeClient.isEnabled()),'consent re-granted');
    await page.bringToFront();
    await startScene('BattleScene', { fromArena:true, arenaLevel:1, wave:0, encounterId:'arena-1-wave-1', returnScene:'ArenaScene' });
    await attack(); await answer(true);
    await poll(async()=>(await answers()).length===before+1,'only a new post-consent answer, not historical saves');
    // One permanently invalid local record must not poison unrelated valid uploads.
    checkingInvalidRecords=true;
    const quarantineFixture=await page.evaluate(async()=>{
        const client=(window as any).__analyticsSmokeClient;
        // Inline IDB helpers: named nested functions acquire an esbuild __name helper
        // that is not present when Playwright serializes this callback into the page.
        const gameplayRequest=indexedDB.open('cislokraj-gameplay-v1',1);
        const gameplay=await new Promise<IDBDatabase>((resolve,reject)=>{gameplayRequest.onsuccess=()=>resolve(gameplayRequest.result);gameplayRequest.onerror=()=>reject(gameplayRequest.error);});
        const tx=gameplay.transaction('events','readwrite'),events=tx.objectStore('events');
        const completed=new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(tx.error);});
        const all=events.getAll(),original=(await new Promise<any[]>(resolve=>all.onsuccess=()=>resolve(all.result))).find((e:any)=>e.details.observation);
        const bad=structuredClone(original),presentation=crypto.randomUUID();
        bad.eventKey='attempt:'+presentation;bad.id=bad.profileId+'|'+bad.eventKey;bad.sent=0;
        bad.details.observation.presentationId=presentation;bad.details.observation.unsupportedFixtureField=true;events.put(bad);await completed;gameplay.close();
        const analyticsRequest=indexedDB.open('cislokraj-analytics-v1',1);
        const analytics=await new Promise<IDBDatabase>((resolve,reject)=>{analyticsRequest.onsuccess=()=>resolve(analyticsRequest.result);analyticsRequest.onerror=()=>reject(analyticsRequest.error);});
        const et=analytics.transaction(['events','meta'],'readwrite'),meta=et.objectStore('meta'),id=crypto.randomUUID();
        const ec=new Promise<void>((resolve,reject)=>{et.oncomplete=()=>resolve();et.onabort=et.onerror=()=>reject(et.error);});
        const invalid={schemaVersion:1,id,kind:'unsupported_fixture',visitorId:client.visitorId,visitId:client.visitId,runId:client.runId,seq:999999,
            occurredAt:Date.now(),monotonicMs:performance.now(),sourceRelease:'test',payload:{}};
        const byteRequest=meta.get('queuedBytes'),bytes=Number(await new Promise<any>(resolve=>byteRequest.onsuccess=()=>resolve(byteRequest.result))??0)+new TextEncoder().encode(JSON.stringify(invalid)).length;
        et.objectStore('events').put(invalid);meta.put(bytes,'queuedBytes');await ec;analytics.close();
        client.emit('visibility_changed',{hidden:false});await client.flush();return {genericId:id,answerId:bad.id};
    });
    await poll(async()=>page.evaluate(async fixture=>{
        const client=(window as any).__analyticsSmokeClient;await client.flush();
        const gameplayRequest=indexedDB.open('cislokraj-gameplay-v1',1);
        const gameplay=await new Promise<IDBDatabase>(resolve=>gameplayRequest.onsuccess=()=>resolve(gameplayRequest.result));
        const badRequest=gameplay.transaction('events').objectStore('events').get(fixture.answerId);
        const bad=await new Promise<any>(resolve=>badRequest.onsuccess=()=>resolve(badRequest.result));gameplay.close();
        const analyticsRequest=indexedDB.open('cislokraj-analytics-v1',1);
        const analytics=await new Promise<IDBDatabase>(resolve=>analyticsRequest.onsuccess=()=>resolve(analyticsRequest.result));
        const historyRequest=analytics.transaction('meta').objectStore('meta').get('quarantine');
        const history=await new Promise<any>(resolve=>historyRequest.onsuccess=()=>resolve(historyRequest.result));analytics.close();
        return bad?.sent===2&&history?.some((entry:any)=>entry.event.id===fixture.genericId);
    },quarantineFixture),'durable local quarantine; neither invalid record is called acknowledged',45_000);
    await poll(async()=>{await page.evaluate(()=>(window as any).__analyticsSmokeClient.flush());
        return (await db`SELECT 1 FROM analytics_events WHERE browser_account_id=${owner} AND kind='coverage_gap' AND payload->>'reason' IN ('invalid_event','invalid_observation')`).length===2;
    },'unrelated valid events continue after a permanent schema failure',45_000);
    assert.deepEqual([...schemaRejections].sort(), ['/v1/analytics/batch', '/v1/gameplay/batch']);
    assert.equal((await answers()).length,before+1);assert.equal((await db`SELECT 1 FROM analytics_events WHERE browser_account_id=${owner} AND event_id=${quarantineFixture.genericId}`).length,0);
    const privateCache = await page.evaluate(async () => { const keys = await caches.keys(); return (await Promise.all(keys.map(async key =>
        (await (await caches.open(key)).keys()).filter(r => /^\/(?:admin(?:\/|$)|v1\/|api\/)/.test(new URL(r.url).pathname)).map(r => r.url)))).flat(); });
    assert.deepEqual(privateCache, []); assert.deepEqual(browserErrors, []); assert.deepEqual(apiErrors, []);
    console.log('PASS: four built-browser journeys; actual DOM/MathBoard → Worker → Hono → PostgreSQL. Screenshots: ' + output);
} catch (error) {
    await page.screenshot({ path: output + '/failure.png' }).catch(() => {});
    for(const [i,p] of context.pages().entries())if(p!==page){console.error('Other page',p.url(),await p.locator('body').innerText().catch(()=>''));await p.screenshot({path:output+`/failure-other-${i}.png`,fullPage:true}).catch(()=>{});}
    console.error('API errors',apiErrors,'Browser errors',browserErrors);
    console.error('Offline state',await page.evaluate(async()=>({secure:window.isSecureContext,scripts:Array.from(document.scripts).map(s=>s.src),
        registrations:(await navigator.serviceWorker.getRegistrations()).map(r=>({scope:r.scope,active:r.active?.state,waiting:r.waiting?.state,installing:r.installing?.state})),caches:await caches.keys(),
        preparation:(()=>{const g=(window as any).__analyticsSmokeGame,e=g?.events?._events?.destroy;const c=(Array.isArray(e)?e:[e]).map(x=>x?.context).find(c=>c?.offline&&c?.downloads);
            return c?{started:c.started,currentKey:c.currentKey,scene:c.scene?.sys.settings.key,active:c.scene?.sys.isActive(),revision:c.offline.revision,registration:!!c.offline.registration}:null;})(),
        manifest:await fetch('/offline-manifest.json').then(r=>r.json()).then(m=>({entry:m.entry,revision:m.revision})).catch(()=>null)})).catch(()=>null));
    console.error('Client',await page.evaluate(()=>{const c=(window as any).__analyticsSmokeClient;return c?{enabled:c.enabled,flushing:c.flushing,retryAt:c.retryAt,now:Date.now(),failures:c.failures,pending:c.pendingTasks?.size,hidden:document.hidden}:null;}));
    console.error('Stored answers',(await answers()).map(a=>({profile:a.profile_id,id:a.logical_key,time:a.occurred_at})));
    console.error('Pending',await page.evaluate(async()=>{const request=indexedDB.open('cislokraj-gameplay-v1',1),db=await new Promise<IDBDatabase>(resolve=>request.onsuccess=()=>resolve(request.result));
        const read=db.transaction('events').objectStore('events').getAll(),events=await new Promise<any[]>(resolve=>read.onsuccess=()=>resolve(read.result));db.close();return events.filter(e=>!e.sent);}).catch(()=>[]));
    console.error('Browser state', await page.evaluate(() => (window as any).__analyticsSmokeGame?.scene.getScenes(true).map((s: any) => ({ key: s.scene.key, phase: s.battleState?.phase }))).catch(() => []));
    throw error;
} finally {
    await browser.close(); await new Promise<void>(resolve => server.close(() => resolve()));
    await db`DELETE FROM analytics_annotations WHERE actor_subject=${adminSubject}`;
    await db`DELETE FROM analytics_issues WHERE scope_id IN ${db([...ownerIds])} OR profile_id IN ${db(profileIds)}`;
    for (const id of ownerIds) await db`DELETE FROM player_accounts WHERE id=${id}`;
    await db`DELETE FROM player_accounts WHERE id=${parent}`; await db.end();
}
