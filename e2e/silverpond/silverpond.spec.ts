import { test as base, expect, type Page } from 'playwright/test';
import { openSeededGame, activateCoopSession } from '../arena/helpers/arena-harness';
import items from '../../public/assets/data/items.json';
import pets from '../../public/assets/data/pets.json';
import enemies from '../../public/assets/data/enemies.json';
import { FORGE_GUIDES } from '../../src/data/forgeGuides';
import textures from '../../public/assets/data/textures.json';
import { collectSceneAssets } from '../../scripts/scene-assets.mjs';

const KEY = '__LITTLE_MATH_GAME__';
const TOWN = 'SilverpondTownMockScene', SHOP = 'SilverpondShopMockScene';
const townTextures = collectSceneAssets(process.cwd())[TOWN];
const WORKSHOP = 'SilverpondPythiaWorkshopMockScene', FORGE = 'SilverpondCrystalForgeMockScene';
const localPets = pets.filter(pet => pet.id.startsWith('pet_silverpond_'));
const localItems = items.filter(item => 'shopCity' in item && item.shopCity === 'silverpond');
const guides = ['shop.intro.v1', 'shop.sword.v1', 'shop.shield.v1', 'arena.free.v1',
    'pythia.intro.v1', ...Object.values(FORGE_GUIDES).map(guide => guide.id)];
const story = { hasCompletedIntro: true, hasDefeatedVerdantGuardian: true,
    hasCollectedForestCrystal: true, hasInstalledForestCrystal: true,
    hasUnlockedSilverpond: true, hasSeenSilverpondQuest: true };
const test = base.extend<{ runtimeErrors: string[] }>({
    runtimeErrors: [async ({ page }, use) => {
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') errors.push(`${message.text()} (${message.location().url})`); });
        await use(errors);
        expect(errors, errors.join('\n')).toEqual([]);
    }, { auto: true }],
});

test.beforeEach(async ({ page }, info) => {
    // Isolated local saves and mocked account/telemetry API: no database migration is needed.
    await page.route(/^http:\/\/127\.0\.0\.1:\d+\/(?:api|v1)\//, route => route.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: false }),
    }));
    await page.route('**/__dev-saves/api', route => route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ version: 1, serverId: null, records: [] }) }));
    await page.addInitScript(() => {
        // Keep scene textures cold and skip byte-only background prefetch during this regression.
        // The Phaser image loader and actual scene transitions remain unchanged.
        const fetch = window.fetch;
        window.fetch = (input, init) => init?.priority === 'low' && init?.cache === 'force-cache'
            ? Promise.resolve(new Response('', { status: 503 })) : fetch(input, init);
    });
    if (info.project.name.includes('canvas')) await page.addInitScript(() => {
        const get = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (kind: string, ...args: any[]) {
            return /webgl/.test(kind) ? null : (get as any).call(this, kind, ...args);
        } as typeof get;
    });
});

async function ready(page: Page, scene: string) {
    try {
        await page.waitForFunction(({ key, scene }) => (window as any)[key]?.canvas.dataset.scene === scene, { key: KEY, scene });
    } catch (error) {
        console.log(await page.evaluate(key => {
            const game = (window as any)[key];
            return { ready: game.canvas.dataset.scene, scenes: game.scene.getScenes(true).map((s: any) => ({ key: s.sys.settings.key, status: s.sys.settings.status, loading: s.load.isLoading(), queued: s.load.totalToLoad, done: s.load.totalComplete, failed: s.load.totalFailed })) };
        }, KEY));
        throw error;
    }
    console.log(`Ready: ${scene}`);
}
async function start(page: Page, scene: string, data = {}) {
    await page.evaluate(({ key, scene, data }) => (window as any)[key].scene.getScenes(true).at(-1).scene.start(scene, data), { key: KEY, scene, data });
    await ready(page, scene);
}
async function frame(page: Page) {
    await page.evaluate(key => new Promise<void>(resolve => (window as any)[key].events.once('poststep', resolve)), KEY);
}
async function point(page: Page, p: { x: number; y: number }) {
    const box = (await page.locator('#game-container canvas').boundingBox())!;
    return { x: box.x + p.x * box.width / 1280, y: box.y + p.y * box.height / 720 };
}
async function tap(page: Page, p: { x: number; y: number }) {
    const at = await point(page, p);
    await page.mouse.move(at.x, at.y); await frame(page);
    await page.mouse.down(); await frame(page); await page.mouse.up(); await frame(page);
}
async function hostTap(page: Page, scene: string, id: string) {
    await tap(page, await page.evaluate(({ key, scene, id }) => {
        const s = (window as any)[key].scene.keys[scene];
        const h = s.sceneBuilder.get(id) ?? s.walkingHud?.sceneBuilder.get(id);
        return { x: h.x, y: h.y };
    }, { key: KEY, scene, id }));
}
async function player(page: Page) {
    return page.evaluate(async () => structuredClone((await import('/src/systems/GameStateManager.ts')).GameStateManager.getInstance().getPlayer()));
}
async function shot(page: Page, prefix: string, name: string) {
    await page.mouse.move(1275, 715); await frame(page);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `artifacts/silverpond/${prefix}-${name}.png` });
}
async function withoutWords(page: Page, prefix: string, name: string) {
    await page.evaluate(key => {
        const game = (window as any)[key]; game.sound.mute = true;
        const texts: any[] = [];
        const visit = (object: any) => {
            if (object.type === 'Text') { texts.push([object, object.text]); object.setText(object.text.replace(/[\p{L}\p{M}]+/gu, '')); }
            object.list?.forEach(visit);
        };
        game.scene.getScenes(true).forEach((s: any) => s.children.list.forEach(visit));
        (window as any).__silverpondReviewTexts = texts;
    }, KEY);
    await shot(page, prefix, `${name}-no-words`);
    await page.evaluate(() => {
        (window as any).__silverpondReviewTexts.forEach(([object, text]: any) => { if (object.scene) object.setText(text); });
        delete (window as any).__silverpondReviewTexts;
    });
}
async function selectItem(page: Page, id: string) {
    await tap(page, await page.evaluate(({ key, scene, id }) => {
        const b = (window as any)[key].scene.keys[scene].itemContainers.get(id).getBounds();
        return { x: b.centerX, y: b.centerY };
    }, { key: KEY, scene: SHOP, id }));
    await page.waitForFunction(({ key, id }) => (window as any)[key].scene.keys.SilverpondShopMockScene.selectedItem?.id === id, { key: KEY, id });
}
async function visibleGuides(page: Page, scene: string) {
    return page.evaluate(({ key, scene }) => (window as any)[key].scene.keys[scene].children.list
        .filter((object: any) => object.visible && object.name.startsWith('guide:'))
        .map((object: any) => object.getData('guideId')), { key: KEY, scene });
}
async function waitGuideDelay(page: Page, scene: string) {
    await page.evaluate(({ key, scene }) => new Promise<void>(resolve =>
        (window as any)[key].scene.keys[scene].time.delayedCall(650, resolve)), { key: KEY, scene });
}
async function pay(page: Page, amount: number) {
    let remaining = amount;
    while (remaining > 0) {
        const move = await page.evaluate(({ key, remaining }) => {
            const s = (window as any)[key].scene.keys.SilverpondShopMockScene;
            const coin = [...s.playerCoins].sort((a: any, b: any) => b.coinType.value - a.coinType.value).find((c: any) => c.coinType.value <= remaining);
            if (!coin) throw new Error('Fixture has no exact change');
            const b = s.paymentArea.getBounds();
            return { from: { x: coin.x, y: coin.y }, to: { x: b.centerX, y: b.centerY }, value: coin.coinType.value, before: s.getPaymentTotal() };
        }, { key: KEY, remaining });
        const from = await point(page, move.from), to = await point(page, move.to);
        await page.mouse.move(from.x, from.y); await frame(page); await page.mouse.down(); await frame(page);
        await page.mouse.move(to.x, to.y, { steps: 12 }); await frame(page); await page.mouse.up(); await frame(page);
        await page.waitForFunction(({ key, total }) => (window as any)[key].scene.keys.SilverpondShopMockScene.getPaymentTotal() === total, { key: KEY, total: move.before + move.value });
        remaining -= move.value;
    }
}

test('cold crystal reward → machine → Silverpond loads town textures in native preload before the exit appears', async ({ page }, info) => {
    await openSeededGame(page, false, {}, {}, {
        storyProgress: { hasCompletedIntro: true, hasDefeatedVerdantGuardian: true },
        defeatedBosses: ['verdant_guardian'], seenGuides: guides,
    });
    await ready(page, 'MenuScene'); await tap(page, { x: 640, y: 100 });
    await page.evaluate(key => (window as any)[key].sound.mute = true, KEY);
    await start(page, 'ForestCrystalRewardScene');
    await shot(page, info.project.name, 'forest-reward');
    await hostTap(page, 'ForestCrystalRewardScene', 'claimCrystalButtonHost');
    await page.waitForFunction(key => {
        const s = (window as any)[key].scene.keys.ForestCrystalRewardScene, h = s.sceneBuilder.get('rocketExitHost');
        return s.children.list.some((c: any) => c.x === h.x && c.y === h.y && c.input?.enabled && c.alpha === 1);
    }, KEY);
    await hostTap(page, 'ForestCrystalRewardScene', 'rocketExitHost');
    await ready(page, 'ZyxRocketInterludeScene');
    await page.waitForFunction(key => (window as any)[key].scene.keys.ZyxRocketInterludeScene.actionButton?.root.alpha === 1, KEY);
    await shot(page, info.project.name, 'zyx-dialogue');
    for (let i = 0; i < 3; i++) {
        await page.waitForFunction(key => (window as any)[key].scene.keys.ZyxRocketInterludeScene.actionButton.enabled, KEY);
        await hostTap(page, 'ZyxRocketInterludeScene', 'zyxDialogueButtonHost');
    }
    await ready(page, 'ZyxCrystalMachineScene');
    const solution = await page.evaluate(key => {
        const p = (window as any)[key].scene.keys.ZyxCrystalMachineScene.puzzleInstance.payload;
        for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) for (let c = b + 1; c < 6; c++)
            if (p.values[a] + p.values[b] + p.values[c] === p.target) return [a, b, c];
        throw new Error('No machine solution');
    }, KEY);
    for (const i of solution) await hostTap(page, 'ZyxCrystalMachineScene', `machineNumber${i + 1}Host`);
    await page.waitForFunction(key => (window as any)[key].scene.keys.ZyxCrystalMachineScene.phase === 'calibrated', KEY);
    await hostTap(page, 'ZyxCrystalMachineScene', 'machineCrystalHost');
    await hostTap(page, 'ZyxCrystalMachineScene', 'machineQuestSlotHost');
    await page.waitForFunction(key => (window as any)[key].scene.keys.ZyxCrystalMachineScene.actionEnabled, KEY);
    // A delayed image must finish in ordinary preload before Rocket.create().
    let release!: () => void;
    const held = new Promise<void>(resolve => release = resolve);
    let requested = false;
    // The concrete path is derived from the production catalog, not a duplicated filename.
    const destinationPath = textures.images['town-hud-a-player-panel'].replace(/^library:/, 'library/');
    expect(destinationPath).toBeTruthy();
    await page.route(`**/${destinationPath}`, async route => { requested = true; await held; await route.continue(); });
    await page.evaluate(({ key, townTextures }) => {
        const game = (window as any)[key], s = game.scene.keys.ZyxRocketInterludeScene;
        let starts = 0;
        const onStart = () => starts++;
        s.load.on('start', onStart);
        s.events.once('create', () => {
            s.load.off('start', onStart);
            game.registry.set('silverpondPreloadSnapshot', {
                starts, missing: townTextures.filter((texture: string) => !s.textures.exists(texture)),
                loading: s.load.isLoading(),
            });
        });
    }, { key: KEY, townTextures });
    try {
        await hostTap(page, 'ZyxCrystalMachineScene', 'machineActionHost');
        await page.waitForFunction(key => { const s = (window as any)[key].scene.keys.ZyxCrystalMachineScene; return s.phase === 'activated' && s.actionEnabled; }, KEY);
        await hostTap(page, 'ZyxCrystalMachineScene', 'machineActionHost');
        await expect.poll(() => requested).toBe(true);
        expect(await page.evaluate(key => {
            const game = (window as any)[key], s = game.scene.keys.ZyxRocketInterludeScene;
            return { loading: s.load.isLoading(), created: !!game.registry.get('silverpondPreloadSnapshot') };
        }, KEY)).toEqual({ loading: true, created: false });
    } finally { release(); }
    await ready(page, 'ZyxRocketInterludeScene');
    expect(await page.evaluate(key => (window as any)[key].registry.get('silverpondPreloadSnapshot'), KEY))
        .toEqual({ starts: 1, missing: [], loading: false });
    await page.waitForTimeout(800);
    await shot(page, info.project.name, 'rocket-exit');
    await hostTap(page, 'ZyxRocketInterludeScene', 'rocketSilverpondExitHost');
    await ready(page, TOWN); await page.waitForTimeout(500);
    expect((await player(page)).storyProgress.hasUnlockedSilverpond).toBe(true);
    await shot(page, info.project.name, 'story-town');
});

test('all six local offers retain their art through payment, purchase, book and reload', async ({ page }, info) => {
    test.setTimeout(240_000); // Real coin drags at the new prices also run in software WebGL.
    await openSeededGame(page, false, {}, {}, { storyProgress: story, seenGuides: [],
        coins: { copper: 20, silver: 10, gold: 25, pouch: 5 } });
    await start(page, SHOP);
    const offers = await page.evaluate(key => {
        const s = (window as any)[key].scene.keys.SilverpondShopMockScene;
        return [...s.itemIcons].map(([id, icon]: [string, any]) => ({ id, texture: icon.texture.key, uniform: icon.scaleX === icon.scaleY }));
    }, KEY);
    expect(offers).toHaveLength(6);
    for (const item of localItems) expect(offers).toContainEqual({ id: item.id, texture: item.spriteKey, uniform: true });
    await shot(page, info.project.name, 'shop');
    expect(await visibleGuides(page, SHOP)).toEqual([]);
    await withoutWords(page, info.project.name, 'shop');
    await selectItem(page, 'sword_silverpond_tide');
    await pay(page, 1);
    const buy = await point(page, await page.evaluate(key => {
        const root = (window as any)[key].scene.keys.SilverpondShopMockScene.children.getByName('medievalBuyButton');
        return { x: root.x, y: root.y };
    }, KEY));
    await page.mouse.move(buy.x, buy.y); await frame(page);
    await page.waitForFunction(key => (window as any)[key].scene.keys.SilverpondShopMockScene.children.getByName('medievalBuyButton').list[1].y < -1.9, KEY);
    await page.screenshot({ path: `artifacts/silverpond/${info.project.name}-buy-hover.png` });
    await page.mouse.down(); await frame(page);
    await page.waitForFunction(key => Math.abs((window as any)[key].scene.keys.SilverpondShopMockScene.children.getByName('medievalBuyButton').list[1].y + .68) < .05, KEY);
    await page.screenshot({ path: `artifacts/silverpond/${info.project.name}-buy-pressed.png` });
    await page.mouse.up(); await frame(page);
    await page.waitForFunction(key => (window as any)[key].scene.keys.SilverpondShopMockScene.getPaymentTotal() === 0, KEY);
    expect((await player(page)).equippedWeapon).toBeNull();
    await page.waitForTimeout(500); await shot(page, info.project.name, 'wrong-payment');
    for (const id of ['sword_silverpond_tide', 'shield_silverpond_tide', 'sword_silverpond_pearl']) {
        const item = localItems.find(item => item.id === id)!;
        await selectItem(page, id); await pay(page, item.price);
        await shot(page, info.project.name, `selected-${id}`);
        await hostTap(page, SHOP, 'buyButtonHost');
        await expect.poll(async () => (await player(page))[item.type === 'weapon' ? 'equippedWeapon' : 'equippedShield']).toBe(id);
    }
    await start(page, TOWN); await page.waitForTimeout(400);
    await tap(page, { x: 245, y: 65 });
    await page.waitForFunction(key => (window as any)[key].scene.keys.SilverpondTownMockScene.children.list.some((root: any) => root.visible && root.list?.some((c: any) => c.texture?.key === 'character-book-frame')), KEY);
    const bookIcons = await page.evaluate(key => {
        const s = (window as any)[key].scene.keys.SilverpondTownMockScene;
        const root = s.children.list.find((r: any) => r.visible && r.list?.some((c: any) => c.texture?.key === 'character-book-frame'));
        return root.list.filter((c: any) => /^silverpond-(sword|shield)-/.test(c.texture?.key ?? '')).map((c: any) => ({ key: c.texture.key, uniform: c.scaleX === c.scaleY }));
    }, KEY);
    expect(bookIcons).toEqual([{ key: 'silverpond-sword-pearl', uniform: true }, { key: 'silverpond-shield-tide', uniform: true }]);
    await shot(page, info.project.name, 'equipment-book');
    await withoutWords(page, info.project.name, 'equipment-book');
    await page.evaluate(() => sessionStorage.setItem('lma-e2e-preserve-saves', 'true'));
    await page.reload(); await ready(page, 'MenuScene'); await start(page, SHOP);
    expect((await player(page)).equippedWeapon).toBe('sword_silverpond_pearl');
    expect((await player(page)).equippedShield).toBe('shield_silverpond_tide');
    await shot(page, info.project.name, 'purchased-shop');
    expect(await visibleGuides(page, SHOP)).toEqual([]);
    expect((await player(page)).seenGuides).toEqual([]);
});

test('Silverpond skips familiar explanations with an empty guide history and retains only the prism demonstration', async ({ page }, info) => {
    const crab = localPets.find(pet => pet.unlockedByEnemy === 'silverpond_bubble_crab')!;
    await openSeededGame(page, false, {}, {}, {
        storyProgress: story, seenGuides: [], unlockedPets: [crab.unlockedByEnemy],
        equippedWeapon: 'sword_silverpond_tide', equippedShield: 'shield_silverpond_tide',
        coins: { copper: 20, silver: 10, gold: 25, pouch: 0 }, mana: 20,
    });
    await page.evaluate(key => (window as any)[key].sound.mute = true, KEY);
    await start(page, SHOP); await waitGuideDelay(page, SHOP);
    expect(await visibleGuides(page, SHOP)).toEqual([]);
    await selectItem(page, 'sword_silverpond_depth');
    expect(await page.evaluate(key => {
        const s = (window as any)[key].scene.keys.SilverpondShopMockScene;
        return { price: s.selectedItem.price, hint: s.paymentHintRect !== null,
            legend: s.children.list.some((object: any) => object.type === 'Text' && object.text === '= 100') };
    }, KEY)).toEqual({ price: 357, hint: false, legend: false });
    await shot(page, info.project.name, 'shop-price-357-no-guides');
    await withoutWords(page, info.project.name, 'shop-price-357-no-guides');

    await start(page, WORKSHOP); await waitGuideDelay(page, WORKSHOP);
    expect(await visibleGuides(page, WORKSHOP)).toEqual([]);
    await tap(page, await page.evaluate(({ key, id }) => {
        const s = (window as any)[key].scene.keys.SilverpondPythiaWorkshopMockScene;
        const bounds = s.petRows.find((row: any) => row.pet?.id === id).container.getBounds();
        return { x: bounds.centerX, y: bounds.centerY };
    }, { key: KEY, id: crab.id }));
    await waitGuideDelay(page, WORKSHOP);
    expect(await visibleGuides(page, WORKSHOP)).toEqual([]);
    expect(await page.evaluate(key => (window as any)[key].scene.keys.SilverpondPythiaWorkshopMockScene.selectedPet?.id, KEY)).toBe(crab.id);
    await shot(page, info.project.name, 'pet-missing-crystal-no-guides');

    for (const scene of ['SilverpondArenaMockScene', 'SilverpondGuildMockScene']) {
        await start(page, scene); await waitGuideDelay(page, scene);
        expect(await visibleGuides(page, scene)).toEqual([]);
    }
    expect(await page.evaluate(key => {
        const s = (window as any)[key].scene.keys.SilverpondGuildMockScene;
        return s.trialOverlay.list.some((object: any) => object.type === 'Text' && object.text === 'Každá odpověď platí');
    }, KEY)).toBe(false);
    // Offer one known exam so the real board can be reviewed after removing its reminder.
    await page.evaluate(async key => {
        const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
        GameStateManager.getInstance().getMasteryData().subAtoms.A2.state = 'training';
        const s = (window as any)[key].scene.keys.SilverpondGuildMockScene;
        s.currentMasteryExamType = 'sub_atom'; s.currentMasteryExamTarget = 'A2';
        s.showTrialOverview();
    }, KEY);
    await hostTap(page, 'SilverpondGuildMockScene', 'trialOverviewActionHost');
    await page.waitForFunction(key => (window as any)[key].scene.keys.SilverpondGuildMockScene.trialState.phase === 'problem', KEY);
    await shot(page, info.project.name, 'guild-exam-no-guides');
    await withoutWords(page, info.project.name, 'guild-exam-no-guides');
    expect((await player(page)).seenGuides).toEqual([]);

    await start(page, FORGE); await waitGuideDelay(page, FORGE);
    expect(await visibleGuides(page, FORGE)).toEqual([FORGE_GUIDES.createPrism.id]);
    expect(await page.evaluate(key => (window as any)[key].scene.keys.SilverpondCrystalForgeMockScene.currentOperation, KEY)).toBe('createPrism');
    await page.waitForFunction(key => (window as any)[key].scene.keys.SilverpondCrystalForgeMockScene
        .children.getByName('guide:forge.createPrism.v1').getData('ready') === true, KEY);
    await shot(page, info.project.name, 'prism-only-guide');
    await withoutWords(page, info.project.name, 'prism-only-guide');
    await hostTap(page, FORGE, 'guideCloseHost');
    expect((await player(page)).seenGuides).toEqual([FORGE_GUIDES.createPrism.id]);
    await start(page, FORGE); await waitGuideDelay(page, FORGE);
    expect(await visibleGuides(page, FORGE)).toEqual([]);
    await start(page, 'CrystalForgeScene'); await waitGuideDelay(page, 'CrystalForgeScene');
    expect(await visibleGuides(page, 'CrystalForgeScene')).toEqual([FORGE_GUIDES.merge.id]);
});

test('historical defeats offer six companions; tier 3 forging and tier 2/3 binding use exact crystals', async ({ page }, info) => {
    const crystals = [{ id: 'forge-shard', tier: 'shard', value: 14, locked: false },
        { id: 'forge-fragment', tier: 'fragment', value: 18, locked: false },
        { id: 'wrong-shard', tier: 'shard', value: 9, locked: false },
        ...localPets.map(pet => ({ id: `amulet-${pet.id}`, ...pet.requiredAmulet, locked: false }))];
    await openSeededGame(page, false, {}, {}, { storyProgress: story, seenGuides: guides,
        unlockedPets: enemies.filter(e => e.id.startsWith('silverpond_')).map(e => e.id),
        crystals: { crystals, maxCapacity: 60 }, mana: 50, coins: { copper: 50, silver: 0, gold: 0, pouch: 0 } });
    await start(page, FORGE);
    expect(await page.evaluate(key => [...(window as any)[key].scene.keys.SilverpondCrystalForgeMockScene.operationPanelButtons].every(([, item]: any) => !item.locked), KEY)).toBe(true);
    await tap(page, await page.evaluate(key => { const r = (window as any)[key].scene.keys.SilverpondCrystalForgeMockScene.children.getByName('forge-operation-createPrism'); return { x: r.x, y: r.y }; }, KEY));
    for (const id of ['forge-shard', 'forge-fragment']) await tap(page, await page.evaluate(({ key, id }) => {
        const s = (window as any)[key].scene.keys.SilverpondCrystalForgeMockScene;
        const b = s.crystalHolders.find((h: any) => h.crystal?.id === id).container.getBounds();
        return { x: b.centerX, y: b.centerY };
    }, { key: KEY, id }));
    await tap(page, await page.evaluate(key => { const b = (window as any)[key].scene.keys.SilverpondCrystalForgeMockScene.operationButton.getBounds(); return { x: b.centerX, y: b.centerY }; }, KEY));
    await page.waitForFunction(key => (window as any)[key].scene.keys.SilverpondCrystalForgeMockScene.equationVisible, KEY);
    await shot(page, info.project.name, 'prism-forge');
    await tap(page, await page.evaluate(key => { const s = (window as any)[key].scene.keys.SilverpondCrystalForgeMockScene; const b = s.answerButtons.find((b: any) => b.getData('correct')).getBounds(); return { x: b.centerX, y: b.centerY }; }, KEY));
    await expect.poll(async () => (await player(page)).crystals.crystals.some((c: any) => c.tier === 'prism' && c.value === 12 && !c.id.startsWith('amulet'))).toBe(true);
    await shot(page, info.project.name, 'prism-success');
    await start(page, WORKSHOP);
    const available = await page.evaluate(key => { const s = (window as any)[key].scene.keys.SilverpondPythiaWorkshopMockScene; return s.getSortedUnlockedPets(s.cache.json.get('pets'), s.gameState.getPlayer()).map((p: any) => p.id); }, KEY);
    expect(available.sort()).toEqual(localPets.map(pet => pet.id).sort());
    await shot(page, info.project.name, 'pets');
    await withoutWords(page, info.project.name, 'pets');
    // Strongest prism pet is visible first; the fragment pet becomes visible after scrolling.
    for (const id of ['pet_silverpond_depth_guardian', 'pet_silverpond_bubble_crab']) {
        const pet = localPets.find(pet => pet.id === id)!;
        if (id.endsWith('bubble_crab')) {
            await tap(page, await page.evaluate(key => {
                const arrow = (window as any)[key].scene.keys.SilverpondPythiaWorkshopMockScene.sceneBuilder.get('NewArrow_3');
                const b = arrow.getBounds(); return { x: b.centerX, y: b.centerY };
            }, KEY));
            await page.waitForFunction(key => (window as any)[key].scene.keys.SilverpondPythiaWorkshopMockScene.petScrollOffset === 1, KEY);
            await page.waitForFunction(key => {
                const s = (window as any)[key].scene.keys.SilverpondPythiaWorkshopMockScene;
                return s.petRows.some((r: any) => r.pet?.id === 'pet_silverpond_bubble_crab') && s.petRows.every((r: any) => r.container.alpha === 1);
            }, KEY);
        }
        await tap(page, await page.evaluate(({ key, id }) => {
            const s = (window as any)[key].scene.keys.SilverpondPythiaWorkshopMockScene;
            const b = s.petRows.find((r: any) => r.pet?.id === id).container.getBounds();
            return { x: b.centerX, y: b.centerY };
        }, { key: KEY, id }));
        if (id.endsWith('depth_guardian')) {
            await tap(page, await page.evaluate(key => {
                const s = (window as any)[key].scene.keys.SilverpondPythiaWorkshopMockScene;
                const b = s.crystalRows.flatMap((r: any) => r.holders).find((h: any) => h.crystal?.id === 'wrong-shard').container.getBounds();
                return { x: b.centerX, y: b.centerY };
            }, KEY));
            expect(await page.evaluate(key => (window as any)[key].scene.keys.SilverpondPythiaWorkshopMockScene.canPerformBinding(), KEY)).toBe(false);
            await hostTap(page, WORKSHOP, 'Green_button_1');
            expect((await player(page)).ownedPets).toEqual([]);
            await shot(page, info.project.name, 'wrong-crystal');
        }
        const crystalId = `amulet-${id}`;
        await tap(page, await page.evaluate(({ key, crystalId }) => {
            const s = (window as any)[key].scene.keys.SilverpondPythiaWorkshopMockScene;
            const b = s.crystalRows.flatMap((r: any) => r.holders).find((h: any) => h.crystal?.id === crystalId).container.getBounds();
            return { x: b.centerX, y: b.centerY };
        }, { key: KEY, crystalId }));
        await shot(page, info.project.name, `binding-${pet.requiredAmulet.tier}`);
        await hostTap(page, WORKSHOP, 'Green_button_1');
        await expect.poll(async () => (await player(page)).ownedPets.includes(id)).toBe(true);
        expect((await player(page)).crystals.crystals.some((c: any) => c.id === crystalId)).toBe(false);
        await page.waitForFunction(key => {
            const s = (window as any)[key].scene.keys.SilverpondPythiaWorkshopMockScene;
            return s.selectedPet === null && !s.load.isLoading() && s.petRows.length === 5;
        }, KEY);
        await ready(page, WORKSHOP);
    }
    await start(page, TOWN); await page.waitForTimeout(450);
    expect((await player(page)).activePet).toBe('pet_silverpond_depth_guardian');
    await shot(page, info.project.name, 'walking-pet');
});

test('water arena renders the actual roster, records victory and opens companion offers', async ({ page }, info) => {
    await openSeededGame(page, false, { completedArenaLevels: [1, 2, 3] }, {}, { storyProgress: story, seenGuides: guides });
    await start(page, 'SilverpondArenaMockScene');
    await shot(page, info.project.name, 'arena');
    const snapshot = await page.evaluate(key => {
        const game = (window as any)[key], s = game.scene.keys.SilverpondArenaMockScene;
        return { level: s.arenaLevel, enemies: s.enemyDefs.map((enemy: any) => ({ id: enemy.id, key: enemy.spriteKey, loaded: game.textures.exists(enemy.spriteKey), frames: game.textures.get(enemy.spriteKey).frameTotal })),
            missing: s.children.list.filter((c: any) => c.text?.includes('MISSING')).length };
    }, KEY);
    expect(snapshot.level).toBe(4); expect(snapshot.missing).toBe(0);
    expect(snapshot.enemies.length).toBeGreaterThan(0);
    for (const e of snapshot.enemies) { expect(e.loaded, e.key).toBe(true); expect(e.frames).toBeGreaterThan(1); }
    await tap(page, await page.evaluate(key => {
        const b = (window as any)[key].scene.keys.SilverpondArenaMockScene.startBattleButton.getBounds();
        return { x: b.centerX, y: b.centerY };
    }, KEY));
    await ready(page, 'BattleScene');
    await page.waitForFunction(key => (window as any)[key].scene.keys.BattleScene.battleState.phase === 'player_turn', KEY);
    await shot(page, info.project.name, 'arena-battle');
    // Finish through production victory rewards to verify stable enemy defeat markers.
    // Arithmetic/combat damage is covered by its existing unit and arena suites.
    const defeated = await page.evaluate(key => { const s = (window as any)[key].scene.keys.BattleScene; const ids = s.enemyDefs.map((e: any) => e.id); s.onVictory(); return ids; }, KEY);
    await ready(page, 'VictoryScene');
    for (const id of defeated) expect((await player(page)).unlockedPets).toContain(id);
    await shot(page, info.project.name, 'pet-unlocked');
    await start(page, WORKSHOP);
    const offers = await page.evaluate(key => { const s = (window as any)[key].scene.keys.SilverpondPythiaWorkshopMockScene; return s.petRows.filter((r: any) => r.pet).map((r: any) => r.pet.unlockedByEnemy); }, KEY);
    for (const id of defeated) expect(offers).toContain(id);
    await shot(page, info.project.name, 'new-pet-offers');
});

test('co-op book loads new equipment and a new pet for both saved profiles', async ({ page }, info) => {
    await openSeededGame(page, true, {}, {}, { storyProgress: story, seenGuides: guides,
        equippedWeapon: 'sword_silverpond_tide', equippedShield: 'shield_silverpond_tide' },
    { storyProgress: story, seenGuides: guides, equippedWeapon: 'sword_silverpond_depth', equippedShield: 'shield_silverpond_depth',
        ownedPets: ['pet_silverpond_bubble_crab'], activePet: 'pet_silverpond_bubble_crab' });
    await activateCoopSession(page, TOWN); await ready(page, TOWN); await page.waitForTimeout(500);
    for (const texture of ['silverpond-sword-tide', 'silverpond-shield-tide', 'silverpond-sword-depth', 'silverpond-shield-depth', 'silverpond-bubble-crab-idle-sheet'])
        expect(await page.evaluate(({ key, texture }) => (window as any)[key].textures.exists(texture), { key: KEY, texture }), texture).toBe(true);
    await tap(page, { x: 245, y: 65 });
    await shot(page, info.project.name, 'coop-book-a');
    await hostTap(page, TOWN, 'characterBookTabBHost');
    await page.waitForFunction(key => (window as any)[key].scene.keys.SilverpondTownMockScene.walkingHud.characterBook.activePlayer === 1, KEY);
    await shot(page, info.project.name, 'coop-book-b');
});
