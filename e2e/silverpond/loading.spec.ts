import { test, expect, type Page } from 'playwright/test';
import { openSeededGame, activateCoopSession } from '../arena/helpers/arena-harness';
import { townBuildings } from '../../src/loading/town-scenes';
import textures from '../../public/assets/data/textures.json';

// The background queue deliberately fetches the full game. Recording every
// response body would distort this test and produce hundreds of MB of traces.
test.use({ trace: 'off' });

const KEY = '__LITTLE_MATH_GAME__';
const TOWN = 'SilverpondTownMockScene';
const doors = ['shopDoorHost', 'workshopDoorHost', 'forgeDoorHost', 'guildDoorHost', 'arenaGateHost'];
const backgrounds = ['silverpond-shop-interior-mock-bg', 'silverpond-pythia-workshop-mock-bg',
    'silverpond-crystal-forge-mock-bg', 'silverpond-guild-interior-mock-bg', 'silverpond-water-arena-mock-bg'];
const story = { hasCompletedIntro: true, hasDefeatedVerdantGuardian: true, hasClaimedForestCrystal: true,
    hasInstalledForestCrystal: true, hasUnlockedSilverpond: true, hasSeenSilverpondQuest: true };
const profile = { storyProgress: story, level: 7, equippedWeapon: 'sword_silverpond_tide',
    equippedShield: 'shield_silverpond_tide', activePet: 'pet_silverpond_mill_turtle',
    ownedPets: ['pet_silverpond_mill_turtle'], unlockedPets: ['silverpond_mill_turtle'] };

test.beforeEach(async ({ page }, info) => {
    // File catalogs only; no database migrations or real saves are involved.
    await page.route(/^http:\/\/127\.0\.0\.1:\d+\/(?:api|v1)\//, route => route.fulfill({ status: 200,
        contentType: 'application/json', body: '{"authenticated":false}' }));
    await page.route('**/__dev-saves/api', route => route.fulfill({ status: 200,
        contentType: 'application/json', body: '{"version":1,"serverId":null,"records":[]}' }));
    if (info.project.name.includes('canvas')) await page.addInitScript(() => {
        const get = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (kind: string, ...args: any[]) {
            return /webgl/.test(kind) ? null : (get as any).call(this, kind, ...args);
        } as typeof get;
    });
});

async function ready(page: Page, scene: string) {
    await page.waitForFunction(({ key, scene }) => (window as any)[key]?.canvas.dataset.scene === scene,
        { key: KEY, scene }, { timeout: 60_000 });
}
async function start(page: Page, scene: string) {
    await page.evaluate(({ key, scene }) => (window as any)[key].scene.getScenes(true).at(-1).scene.start(scene), { key: KEY, scene });
    await ready(page, scene);
}
async function missing(page: Page, scene: string) {
    return page.evaluate(({ key, scene }) => {
        const game = (window as any)[key], active = game.scene.getScenes(true).at(-1);
        return [...active.sceneAssets.getSceneTextureKeys(scene)].filter((key: any) => !game.textures.exists(key));
    }, { key: KEY, scene });
}

test('every Silverpond door has its images before the first click, even without background bandwidth', async ({ page }, info) => {
    const errors: string[] = [];
    const doorRequests: string[] = [];
    let enteringDoor = false;
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', request => {
        if (enteringDoor && /\.(?:png|webp|jpe?g)(?:\?|$)/i.test(request.url())) doorRequests.push(request.url());
    });
    // Simulate a fallback queue with no bandwidth. Native first-town preload
    // must still prepare the whole local building set before exposing doors.
    await page.addInitScript(() => {
        const original = window.fetch;
        window.fetch = (input, init) => init?.priority === 'low' && init?.cache === 'force-cache'
            ? Promise.resolve(new Response('', { status: 503 })) : original(input, init);
    });
    await openSeededGame(page, true, { arenaLevel: 5, completedArenaLevels: [1, 2, 3, 4] }, undefined, profile,
        { ...profile, activePet: 'pet_catacomb_A', ownedPets: ['pet_catacomb_A'], equippedShield: 'shield_reinforced' });
    await activateCoopSession(page, TOWN); await ready(page, TOWN);
    for (const [index, building] of townBuildings[TOWN].entries()) {
        expect(await missing(page, building), building).toEqual([]);
        await page.waitForTimeout(500);
        const point = await page.evaluate(({ key, id }) => {
            const host = (window as any)[key].scene.keys.SilverpondTownMockScene.sceneBuilder.get(id);
            return { x: host.x, y: host.y };
        }, { key: KEY, id: doors[index] });
        const box = (await page.locator('#game-container canvas').boundingBox())!;
        enteringDoor = true;
        await page.mouse.click(box.x + point.x * box.width / 1280, box.y + point.y * box.height / 720);
        await ready(page, building);
        enteringDoor = false;
        expect(doorRequests.splice(0), `${building}: images requested at the door`).toEqual([]);
        expect(await missing(page, building)).toEqual([]);
        await page.waitForTimeout(350);
        await page.screenshot({ path: `artifacts/loading/${info.project.name}-door-${index}.png` });
        await start(page, TOWN);
    }
    expect(errors).toEqual([]);
});

test('Mathoria buildings are ready together with the town', async ({ page }) => {
    await openSeededGame(page);
    await start(page, 'TownScene');
    for (const building of townBuildings.TownScene) {
        expect(await missing(page, building), building).toEqual([]);
        await start(page, building);
        expect(await missing(page, building), building).toEqual([]);
        await start(page, 'TownScene');
    }
});

test('static pet cards use portraits while live companions retain their idle animation', async ({ page }, info) => {
    await openSeededGame(page, false, { arenaLevel: 5, completedArenaLevels: [1, 2, 3, 4] }, undefined,
        { ...profile, ownedPets: ['pet_catacomb_A', 'pet_silverpond_mill_turtle'] });
    await start(page, TOWN);
    await start(page, 'SilverpondPythiaWorkshopMockScene');
    const art = await page.evaluate(key => {
        const game = (window as any)[key], shop = game.scene.keys.SilverpondPythiaWorkshopMockScene;
        return {
            foxSheet: game.textures.exists('rune-fox-sheet'),
            foxPortrait: game.textures.exists('rune-fox-sheet-portrait'),
            turtleIdle: game.anims.exists('mill-turtle-idle'),
            cards: shop.petRows.filter((row: any) => row.pet)
                .map((row: any) => ({ id: row.pet.id, texture: row.container.getData('petSprite')?.texture.key })),
        };
    }, KEY);
    expect(await page.evaluate(key => Object.keys((window as any)[key].textures.list)
        .filter(texture => /silverpond-lake-fairy-.*-sheet/.test(texture)), KEY)).toEqual([]);
    expect(art.foxSheet).toBe(false);
    expect(art.foxPortrait).toBe(true);
    expect(art.turtleIdle).toBe(true);
    expect(art.cards.find((card: any) => card.id === 'pet_catacomb_A')?.texture).toBe('rune-fox-sheet-portrait');
    expect(art.cards.every((card: any) => card.texture?.endsWith('-portrait'))).toBe(true);
    await page.screenshot({ path: `artifacts/loading/${info.project.name}-pet-portraits.png` });
});

test('saved Silverpond game gradually prepares building images while still in the menu', async ({ page }, info) => {
    await page.addInitScript(() => {
        const original = window.fetch;
        (window as any).__backgroundDownloads = [];
        window.fetch = (input, init) => {
            if (init?.priority === 'low') (window as any).__backgroundDownloads.push(String(input));
            return original(input, init);
        };
    });
    await openSeededGame(page, false, { arenaLevel: 5, completedArenaLevels: [1, 2, 3, 4] }, undefined, profile);
    await expect.poll(() => page.evaluate(({ key, backgrounds }) => ({
        scene: (window as any)[key].canvas.dataset.scene,
        prepared: backgrounds.filter(key => (window as any).__LITTLE_MATH_GAME__.textures.exists(key)),
    }), { key: KEY, backgrounds }), { timeout: 40_000 }).toEqual({ scene: 'MenuScene', prepared: backgrounds });
    const urls = backgrounds.map(key => `/assets/${(textures.images as Record<string, string>)[key]}`);
    const requested: string[] = await page.evaluate(() => (window as any).__backgroundDownloads);
    expect(urls.every(url => requested.includes(url))).toBe(true);
    // Local buildings must start ahead of the much larger underwater chapter.
    const underwater = requested.findIndex(url => /underwater-shallows/.test(url));
    if (underwater >= 0) expect(Math.max(...urls.map(url => requested.indexOf(url)))).toBeLessThan(underwater);
    await page.screenshot({ path: `artifacts/loading/${info.project.name}-background-menu.png` });
    await start(page, TOWN);
    for (const building of townBuildings[TOWN]) expect(await missing(page, building), building).toEqual([]);
});

test('slow first-town loading stays visible through the last building image and then all doors are ready', async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
        const fetch = window.fetch;
        window.fetch = (input, init) => init?.priority === 'low'
            ? Promise.resolve(new Response('', { status: 503 })) : fetch(input, init);
    });
    await openSeededGame(page, false, { arenaLevel: 5 }, undefined, profile);
    const texture = backgrounds[0];
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    await page.route(`**/assets/${(textures.images as Record<string, string>)[texture]}`, async route => {
        await held; await route.continue();
    });
    await page.evaluate(({ key, town }) => {
        const game = (window as any)[key];
        if (game.textures.exists('silverpond-shop-interior-mock-bg')) game.textures.remove('silverpond-shop-interior-mock-bg');
        game.scene.keys.MenuScene.scene.start(town);
    }, { key: KEY, town: TOWN });
    const screen = page.locator(`.scene-loading[data-scene="${TOWN}"]`);
    await expect(screen).toBeVisible();
    await expect.poll(async () => Number(await screen.getByRole('progressbar').getAttribute('aria-valuenow'))).toBeGreaterThan(0);
    expect(Number(await screen.getByRole('progressbar').getAttribute('aria-valuenow'))).toBeLessThan(100);
    await page.screenshot({ path: `artifacts/loading/${info.project.name}-slow-town.png` });
    await screen.locator('.loading-motion').evaluate(element => { element.parentElement!.querySelectorAll<HTMLElement>('div')
        .forEach(item => { if (item.textContent === 'Načítání') item.style.color = 'transparent'; }); });
    await page.evaluate(() => { (window as any).__LITTLE_MATH_GAME__.sound.mute = true; });
    await page.screenshot({ path: `artifacts/loading/${info.project.name}-slow-no-words.png` });
    release();
    await ready(page, TOWN);
    await expect(screen).toHaveCount(0);
    for (const building of townBuildings[TOWN]) expect(await missing(page, building), building).toEqual([]);
    expect(errors).toEqual([]);
});

test('a failed shop image offers a retry without creating an incomplete shop or changing saves', async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
        const fetch = window.fetch;
        window.fetch = (input, init) => init?.priority === 'low'
            ? Promise.resolve(new Response('', { status: 503 })) : fetch(input, init);
    });
    await openSeededGame(page, false, { arenaLevel: 5 }, undefined, profile);
    await start(page, TOWN);
    // Initialize the shop's normal math pool before comparing persisted state.
    // The simulated cache loss/retry must not replace that pool or any progress.
    await start(page, 'SilverpondShopMockScene');
    await start(page, TOWN);
    const saves = () => page.evaluate(() => Object.fromEntries(Object.keys(localStorage)
        .filter(key => /^littleMathAdventure_slot_/.test(key)).map(key => [key, JSON.parse(localStorage.getItem(key)!)])));
    const before = await saves();
    const texture = backgrounds[0];
    let available = false;
    await page.route(`**/assets/${(textures.images as Record<string, string>)[texture]}`, route => !available
        ? route.fulfill({ status: 503, body: 'temporarily unavailable' }) : route.continue());
    await page.evaluate(({ key, texture }) => {
        const game = (window as any)[key];
        game.textures.remove(texture);
        game.scene.keys.SilverpondTownMockScene.scene.start('SilverpondShopMockScene');
    }, { key: KEY, texture });
    const screen = page.locator('.scene-loading[data-failed="true"]');
    await expect(screen).toBeVisible();
    await expect.poll(() => page.evaluate(key => (window as any)[key].scene.isPaused('SilverpondShopMockScene'), KEY)).toBe(true);
    expect(await saves()).toEqual(before);
    const retry = screen.getByRole('button', { name: 'Zkusit znovu' });
    const bounds = (await retry.boundingBox())!;
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: `artifacts/loading/${info.project.name}-retry.png` });
    await retry.hover();
    await page.screenshot({ path: `artifacts/loading/${info.project.name}-retry-hover.png` });
    await page.mouse.down();
    await page.screenshot({ path: `artifacts/loading/${info.project.name}-retry-pressed.png` });
    await page.mouse.move(0, 0); await page.mouse.up();
    await page.screenshot({ path: `artifacts/loading/${info.project.name}-retry-pointer-out.png` });
    available = true;
    if (info.project.name.includes('tablet')) await retry.tap(); else await retry.click();
    await ready(page, 'SilverpondShopMockScene');
    await expect(page.locator('.scene-loading')).toHaveCount(0);
    expect(await missing(page, 'SilverpondShopMockScene')).toEqual([]);
    // Ordinary shop initialization can save a newer timestamp. The complete
    // player and learning payload must remain the same after retry.
    const after = await saves();
    for (const key of Object.keys(before)) {
        expect({ ...after[key], timestamp: 0 }).toEqual({ ...before[key], timestamp: 0 });
    }
    expect(errors).toEqual([]);
    await page.screenshot({ path: `artifacts/loading/${info.project.name}-retried-shop.png` });
});
