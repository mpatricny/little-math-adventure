import type { Page } from 'playwright/test';
import { test, expect, openSeededGame, waitForScene, activateCoopSession } from '../arena/helpers/arena-harness';
import items from '../../public/assets/data/items.json';

type Point = { x: number; y: number };
const KEY = '__LITTLE_MATH_GAME__';
const shops = ['ShopScene', 'SilverpondShopMockScene'];
const wallet = (coins: Record<string, number>) => coins.copper + coins.silver * 5 + coins.gold * 10 + coins.pouch * 100;
const frame = (page: Page) => page.evaluate(key => new Promise<void>(resolve => (window as any)[key].events.once('poststep', () => resolve())), KEY);
async function screenPoint(page: Page, p: Point) {
    const box = (await page.locator('#game-container canvas').boundingBox())!;
    return { x: box.x + p.x * box.width / 1280, y: box.y + p.y * box.height / 720 };
}
async function tap(page: Page, p: Point) {
    const at = await screenPoint(page, p);
    await page.mouse.move(at.x, at.y); await frame(page);
    await page.mouse.down(); await frame(page); await page.mouse.up(); await frame(page);
}
async function start(page: Page, sceneKey: string, data = {}) {
    await page.evaluate(({ key, sceneKey, data }) => (window as any)[key].scene.getScenes(true).at(-1).scene.start(sceneKey, data), { key: KEY, sceneKey, data });
    await waitForScene(page, sceneKey);
    if (shops.includes(sceneKey)) await page.waitForFunction(({ key, sceneKey }) => {
        const s = (window as any)[key].scene.keys[sceneKey]; return s.preparationOverlay && s.paymentArea && s.itemContainers.size > 0;
    }, { key: KEY, sceneKey });
}
async function state(page: Page, sceneKey: string) {
    return page.evaluate(({ key, sceneKey }) => {
        const s = (window as any)[key].scene.keys[sceneKey];
        return { player: structuredClone(s.gameState.getPlayer()), payment: s.getPaymentTotal(),
            enabled: { sword: s.prepButtons.sword.enabled, shield: s.prepButtons.shield.enabled }, selected: s.selectedItem?.id ?? null };
    }, { key: KEY, sceneKey });
}
async function buyButton(page: Page, sceneKey: string) {
    const p = await page.evaluate(({ key, sceneKey }) => {
        const s = (window as any)[key].scene.keys[sceneKey], h = s.sceneBuilder.get('buyButtonHost'); return { x: h.x, y: h.y };
    }, { key: KEY, sceneKey });
    await tap(page, p);
}
async function selectItem(page: Page, sceneKey: string, id: string) {
    const p = await page.evaluate(({ key, sceneKey, id }) => {
        const s = (window as any)[key].scene.keys[sceneKey], b = s.itemContainers.get(id).getBounds();
        return { x: b.centerX, y: b.centerY };
    }, { key: KEY, sceneKey, id });
    await tap(page, p); await expect.poll(async () => (await state(page, sceneKey)).selected).toBe(id);
}
async function pay(page: Page, sceneKey: string, amount: number) {
    let remaining = amount;
    while (remaining > 0) {
        const move = await page.evaluate(({ key, sceneKey, remaining }) => {
            const s = (window as any)[key].scene.keys[sceneKey];
            const coin = [...s.playerCoins].sort((a: any, b: any) => b.coinType.value - a.coinType.value).find((c: any) => c.coinType.value <= remaining);
            if (!coin) throw new Error('Fixture has no exact change');
            const b = s.paymentArea.getBounds();
            return { from: { x: coin.x, y: coin.y }, to: { x: b.centerX, y: b.centerY }, value: coin.coinType.value, before: s.getPaymentTotal() };
        }, { key: KEY, sceneKey, remaining });
        const from = await screenPoint(page, move.from), to = await screenPoint(page, move.to);
        await page.mouse.move(from.x, from.y); await frame(page); await page.mouse.down(); await frame(page);
        await page.mouse.move(to.x, to.y, { steps: 12 }); await frame(page); await page.mouse.up(); await frame(page);
        await expect.poll(async () => (await state(page, sceneKey)).payment).toBe(move.before + move.value);
        remaining -= move.value;
    }
}

test.beforeEach(async ({ page }, info) => {
    // Shop/arena regressions use only local saves and do not require an account server.
    await page.route('**/v1/me', route => route.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: false }),
    }));
    if (info.project.name.includes('canvas')) await page.addInitScript(() => {
        const get = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (kind: string, ...args: any[]) {
            return /webgl/.test(kind) ? null : (get as any).call(this, kind, ...args);
        } as typeof get;
    });
});

test('both shops open with no gear, sword only, shield only and both; voice follows real equipment', async ({ page }, info) => {
    // Eight scene transitions plus screenshots are slower with software WebGL.
    test.setTimeout(180_000);
    await openSeededGame(page); await tap(page, { x: 640, y: 700 });
    const combinations = [
        { equippedWeapon: null, equippedShield: null },
        { equippedWeapon: 'sword_wooden', equippedShield: null },
        { equippedWeapon: null, equippedShield: 'shield_wooden' },
        { equippedWeapon: 'sword_wooden', equippedShield: 'shield_wooden' },
    ];
    for (let i = 0; i < combinations.length; i++) {
        for (const sceneKey of shops) {
            const since = await page.evaluate(async equipment => {
                const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
                Object.assign(GameStateManager.getInstance().getPlayer(), equipment, { seenGuides: ['shop.intro.v1'] });
                return performance.now();
            }, combinations[i]);
            await start(page, sceneKey);
            const s = await state(page, sceneKey);
            expect(s.player).not.toHaveProperty('equipment');
            expect(s.enabled).toEqual({ sword: Boolean(combinations[i].equippedWeapon), shield: Boolean(combinations[i].equippedShield) });
            // Allow the scheduled greeting to execute, including in the empty-gear case.
            await page.evaluate(({ key, sceneKey }) => new Promise<void>(resolve => (window as any)[key].scene.keys[sceneKey].time.delayedCall(650, () => resolve())), { key: KEY, sceneKey });
            // Equipment guidance replaced the old generic vo.shop.prep greeting.
            // Compare fresh events so a previous shop cannot satisfy this assertion.
            const expectedKind = combinations[i].equippedWeapon ? 'sword' : combinations[i].equippedShield ? 'shield' : null;
            const guideVoices = () => page.evaluate(async since =>
                (await import('/src/audio/AudioDirector.ts')).gameAudio().snapshot().events
                    .filter(e => e.time >= since && e.type === 'voice' && /^vo\.guide\.shop\.(sword|shield)$/.test(e.id))
                    .map(e => e.id), since);
            if (!expectedKind) expect(await guideVoices()).toEqual([]);
            else {
                await expect.poll(guideVoices).toEqual([`vo.guide.shop.${expectedKind}`]);
                expect(await page.evaluate(({ key, sceneKey, expectedKind }) =>
                    (window as any)[key].scene.keys[sceneKey].children.list.some((child: any) =>
                        child.active && child.getData?.('guideId') === `shop.${expectedKind}.v1`),
                { key: KEY, sceneKey, expectedKind })).toBe(true);
            }
            if (i === 0 || i === 3) await page.screenshot({ path: `artifacts/shop/${info.project.name}-${sceneKey}-${i ? 'equipped' : 'empty'}.png` });
        }
    }
    await start(page, 'TownScene'); await start(page, 'ShopScene');
    expect((await state(page, 'ShopScene')).enabled).toEqual({ sword: true, shield: true });
});

for (const sceneKey of shops) test(`${sceneKey}: drag payment, wrong total, purchase, upgrade and saved return`, async ({ page }, info) => {
    await openSeededGame(page, false, {}, {}, { coins: { copper: 50, silver: 0, gold: 0, pouch: 0 }, attack: 1, seenGuides: completedGuides });
    await start(page, sceneKey);
    const initial = await state(page, sceneKey);
    await buyButton(page, sceneKey); // No selected item is a safe no-op.
    expect((await state(page, sceneKey)).player).toEqual(initial.player);
    const sword = items.find(i => i.id === 'sword_wooden')!, shield = items.find(i => i.id === 'shield_wooden')!, upgrade = items.find(i => i.id === 'sword_iron')!;
    await selectItem(page, sceneKey, sword.id); await pay(page, sceneKey, 1); await buyButton(page, sceneKey);
    await expect.poll(async () => (await state(page, sceneKey)).payment).toBe(0);
    expect((await state(page, sceneKey)).player).toEqual(initial.player);
    await page.waitForTimeout(500); // Coin return tween.
    await page.screenshot({ path: `artifacts/shop/${info.project.name}-${sceneKey}-wrong-payment.png` });
    for (const item of [sword, shield, upgrade]) {
        if ((await state(page, sceneKey)).selected !== item.id) await selectItem(page, sceneKey, item.id);
        const before = await state(page, sceneKey);
        await pay(page, sceneKey, item.price); await buyButton(page, sceneKey);
        await expect.poll(async () => (await state(page, sceneKey)).selected).toBe(null);
        const after = await state(page, sceneKey);
        expect(wallet(after.player.coins)).toBe(wallet(before.player.coins) - item.price);
        expect(after.player[item.type === 'weapon' ? 'equippedWeapon' : 'equippedShield']).toBe(item.id);
        expect(after.payment).toBe(0);
        await buyButton(page, sceneKey); expect((await state(page, sceneKey)).player).toEqual(after.player);
    }
    const final = await state(page, sceneKey);
    expect(final.player.attack).toBe(initial.player.attack);
    expect(final.enabled).toEqual({ sword: true, shield: true });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('littleMathAdventure_slot_0')!).player);
    expect(saved.equippedWeapon).toBe(upgrade.id); expect(saved.equippedShield).toBe(shield.id);
    expect(saved.coins).toEqual(final.player.coins);
    await start(page, 'MenuScene');
    await page.evaluate(async () => (await import('/src/systems/GameStateManager.ts')).GameStateManager.getInstance().loadSlot(0));
    await start(page, sceneKey);
    expect((await state(page, sceneKey)).player.coins).toEqual(final.player.coins);
    expect((await state(page, sceneKey)).enabled).toEqual({ sword: true, shield: true });
    await page.screenshot({ path: `artifacts/shop/${info.project.name}-${sceneKey}-purchased.png` });
});

test('co-op shop restart uses the active player equipment', async ({ page }) => {
    // This checks the switch itself; first-visit guide overlays are covered separately.
    await openSeededGame(page, true, {}, {},
        { equippedWeapon: 'sword_wooden', seenGuides: completedGuides },
        { equippedShield: 'shield_wooden', seenGuides: completedGuides });
    await activateCoopSession(page); await start(page, 'ShopScene');
    expect((await state(page, 'ShopScene')).enabled).toEqual({ sword: true, shield: false });
    await tap(page, { x: 380, y: 640 });
    await expect.poll(async () => (await state(page, 'ShopScene')).player.name).toBe('Borek');
    expect((await state(page, 'ShopScene')).enabled).toEqual({ sword: false, shield: true });
    await tap(page, { x: 380, y: 640 });
    await expect.poll(async () => (await state(page, 'ShopScene')).player.name).toBe('Ada');
    expect((await state(page, 'ShopScene')).enabled).toEqual({ sword: true, shield: false });
});

const swordIds = ['sword_wooden', 'sword_iron', 'sword_reinforced'];
const completedGuides = ['shop.intro.v1', 'shop.sword.v1', 'shop.shield.v1', 'arena.free.v1'];

async function setLevelTwoLearning(page: Page) {
    await page.evaluate(async () => {
        const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
        const { MasterySystem } = await import('/src/systems/MasterySystem.ts');
        const game = GameStateManager.getInstance();
        const data = game.getMasteryData();
        Object.assign(data.subAtoms.A1, { state: 'secure', examBestMedal: 'silver' });
        // Keep this regression on ordinary arithmetic, without first-visit demos.
        data.comparisonChapter!.status = 'locked';
        MasterySystem.getInstance().updatePlayerLevel();
        game.save();
    });
}

async function verifyBookAndArena(page: Page, bonus: number, screenshotPrefix: string) {
    await start(page, 'TownScene');
    await tap(page, { x: 245, y: 65 });
    await page.waitForFunction(key => (window as any)[key].scene.keys.TownScene.children.list.some((object: any) =>
        object.visible && object.alpha === 1 && object.list?.some((child: any) => child.texture?.key === 'character-book-frame')), KEY);
    await page.mouse.move(1270, 710);
    const texts = await page.evaluate(key => {
        const scene = (window as any)[key].scene.keys.TownScene;
        const book = scene.children.list.find((object: any) => object.visible && object.list?.some((child: any) => child.texture?.key === 'character-book-frame'));
        if (!book) throw new Error('Character book did not open');
        return book.list.filter((child: any) => child.visible && child.type === 'Text').map((child: any) => child.text);
    }, KEY);
    expect(texts).toContain('LEVEL 2');
    expect(texts).toContain(`⚔ +${bonus}`);
    expect(texts.filter((text: string) => /^\d+$/.test(text))).toEqual(['1', '1']);
    await page.screenshot({ path: `${screenshotPrefix}-book.png` });

    await start(page, 'BattleScene', { fromArena: true, arenaLevel: 1, wave: 0 });
    await page.waitForFunction(key => (window as any)[key].scene.keys.BattleScene.battleState.phase === 'player_turn', KEY);
    const attackPoint = await page.evaluate(key => {
        const root = (window as any)[key].scene.keys.BattleScene.battleActionDock.attackRoot;
        return { x: root.x, y: root.y };
    }, KEY);
    await tap(page, attackPoint);
    await page.waitForFunction(key => (window as any)[key].scene.keys.BattleScene.mathBoard.acceptingAnswer, KEY);
    const problems = await page.evaluate(key => (window as any)[key].scene.keys.BattleScene.battleState.currentProblems.map((p: any) => ({ source: p.source ?? 'player', power: p.damageMultiplier ?? 1 })), KEY);
    expect(problems).toEqual([
        { source: 'player', power: 1 }, { source: 'player', power: 1 }, { source: 'sword', power: bonus },
    ]);
    await page.screenshot({ path: `${screenshotPrefix}-arena.png` });
}

test('all three swords keep earned attacks through purchase, upgrade, book, arena and reload', async ({ page }, info) => {
    test.setTimeout(240_000);
    await openSeededGame(page, false, {}, {}, { attack: 2, hp: 11, maxHp: 11,
        coins: { copper: 70, silver: 0, gold: 0, pouch: 0 }, seenGuides: completedGuides });
    await setLevelTwoLearning(page);
    for (const id of swordIds) {
        await start(page, 'ShopScene');
        const item = items.find(item => item.id === id)!;
        const before = await state(page, 'ShopScene');
        await selectItem(page, 'ShopScene', id);
        await pay(page, 'ShopScene', item.price);
        await buyButton(page, 'ShopScene');
        const after = await state(page, 'ShopScene');
        expect(after.player).toMatchObject({ attack: 2, level: 2, hp: 11, maxHp: 11, equippedWeapon: id });
        expect(wallet(after.player.coins)).toBe(wallet(before.player.coins) - item.price);
        await verifyBookAndArena(page, item.damageMultiplier!, `artifacts/shop/${info.project.name}-${id}`);
    }
    await page.evaluate(async () => {
        const game = (await import('/src/systems/GameStateManager.ts')).GameStateManager.getInstance();
        game.save(); game.loadSlot(0);
    });
    await start(page, 'ShopScene');
    expect((await state(page, 'ShopScene')).player).toMatchObject({ attack: 2, level: 2, equippedWeapon: 'sword_reinforced', attackPowerVersion: 1 });
});

test('old saves with +1, +2 and +3 swords recover earned attacks once', async ({ page }, info) => {
    test.setTimeout(240_000);
    await openSeededGame(page, false, {}, {}, { attack: 2, hp: 11, maxHp: 11, seenGuides: completedGuides });
    await setLevelTwoLearning(page);
    for (const id of swordIds) {
        const item = items.find(item => item.id === id)!;
        await page.evaluate(async ({ id, bonus }) => {
            const game = (await import('/src/systems/GameStateManager.ts')).GameStateManager.getInstance();
            const saved = JSON.parse(localStorage.getItem('littleMathAdventure_slot_0')!);
            Object.assign(saved.player, { attack: 2 + bonus, equippedWeapon: id,
                equippedShield: 'shield_wooden', preparation: { kind: 'sword', charges: 3 } });
            delete saved.player.attackPowerVersion;
            localStorage.setItem('littleMathAdventure_slot_0', JSON.stringify(saved));
            game.loadSlot(0);
            game.save(); game.loadSlot(0);
        }, { id, bonus: item.attackBonus! });
        await verifyBookAndArena(page, item.damageMultiplier!, `artifacts/shop/${info.project.name}-${id}-migrated`);
        const player = await page.evaluate(key => (window as any)[key].scene.keys.BattleScene.gameState.getPlayer(), KEY);
        expect(player).toMatchObject({ attack: 2, level: 2, preparation: { kind: 'sword', charges: 3 }, attackPowerVersion: 1 });
    }
});
