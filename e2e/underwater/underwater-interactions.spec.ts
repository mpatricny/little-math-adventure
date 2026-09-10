import { test, expect, openSeededGame, waitForScene, activateCoopSession } from '../arena/helpers/arena-harness';
import { tap } from './hands-on-helpers';

const progress = { schemaVersion: 1, active: true, introSeen: true, roomId: 'sp_bell_hub', entryId: 'shallows',
    visitedRooms: ['sp_bell_hub'], defeatedEncounters: ['silverpond-depth-watch', 'silverpond-grotto-keeper'], openedChests: [],
    bellNotes: 3, puzzleAttempts: 3, restoredMechanisms: ['shrine-memory', 'chamber-routes'],
    revealedPassages: ['sp_bell_hub:garden', 'sp_bell_hub:canal', 'sp_depth_gate:heart'] };
const hero = { hp: 20, maxHp: 20, coins: { copper: 5, silver: 0, gold: 0, pouch: 0 },
    storyProgress: { hasCompletedIntro: true, hasUnlockedSilverpond: true, hasWaterBreathingScale: true } };

for (const canvas of [false, true]) test(`seal arrival and gate dissolve, Canvas=${canvas}`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize(canvas ? { width: 1024, height: 768 } : { width: 1280, height: 720 });
    if (canvas) await page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(kind: string, ...args: any[]) {
            if (kind.includes('webgl')) return null;
            return original.call(this, kind as any, ...args);
        } as typeof original;
    });
    await openSeededGame(page, false, {}, {}, { ...hero, underwaterProgress: { ...progress, restoredMechanisms: ['shrine-memory'] } });
    await page.evaluate(() => { (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('UnderwaterRoomScene'); });
    await waitForScene(page, 'UnderwaterRoomScene');
    await page.waitForFunction(() => !!(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.children.getByName('sealReveal'));
    await page.waitForFunction(() => {
        const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
        const seal = s.children.getByName('sealReveal');
        if (seal?.alpha > 0.8 && seal.x === 640) { s.tweens.pauseAll(); s.time.paused = true; return true; }
        return false;
    });
    await page.screenshot({ path: `artifacts/underwater/interaction-seal-${canvas}.png` });
    expect(await page.evaluate(() => { const shade = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.children.getByName('sealRevealShade');
        return shade.fillAlpha * shade.alpha; })).toBeGreaterThan(0.5);
    await page.evaluate(() => { const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
        s.tweens.resumeAll(); s.time.paused = false; });
    await page.waitForFunction(() => !(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.revealing);
    expect(await page.evaluate(() => { const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
        return { lit: s.progress().litHubSeals, blocked: s.exits.find((e: any) => e.id === 'depths').blocker.visible }; }))
        .toEqual({ lit: ['shell'], blocked: true });
    await page.evaluate(() => { const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
        s.progress().restoredMechanisms.push('chamber-routes'); s.scene.restart(); });
    await page.waitForFunction(() => !!(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.children.getByName('sealReveal'));
    await page.waitForTimeout(3700); await page.screenshot({ path: `artifacts/underwater/interaction-kelp-${canvas}.png` });
    await page.waitForFunction(() => !(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.revealing);
    await page.screenshot({ path: `artifacts/underwater/interaction-open-${canvas}.png` });
    expect(await page.evaluate(() => { const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
        return { lit: s.progress().litHubSeals, blocked: s.exits.find((e: any) => e.id === 'depths').blocker.visible }; }))
        .toEqual({ lit: ['shell', 'current'], blocked: false });
    await page.evaluate(() => { (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.scene.restart(); });
    await page.waitForTimeout(1000);
    expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.revealing)).toBe(false);
});

test('hint delayed, paid once, preserves mirror choice and cannot charge while disabled', async ({ page }) => {
    test.setTimeout(90_000);
    await openSeededGame(page, false, {}, {}, { ...hero, underwaterProgress: { ...progress, roomId: 'sp_glow_grotto', entryId: 'canal' } });
    await page.evaluate(() => { (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('UnderwaterRoomScene'); });
    await waitForScene(page, 'UnderwaterRoomScene'); await page.waitForTimeout(700); await tap(page, 605, 450);
    await page.waitForFunction(() => !!(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.lightPuzzle);
    await tap(page, 980, 525);
    expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.player().coins.copper)).toBe(5);
    await page.screenshot({ path: 'artifacts/underwater/interaction-hint-locked.png' });
    await page.waitForFunction(() => { const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
        return s.ui.modal.list.find((o: any) => o.name === 'lightHintHost')?.getData('waterState') === 'normal'; }, null, { timeout: 35_000 });
    const before = await page.evaluate(() => [...(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.lightPuzzle.turns]);
    await tap(page, 980, 525); await page.waitForTimeout(220);
    const result = await page.evaluate(() => { const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
        return { coins: s.player().coins.copper, turns: s.lightPuzzle.turns, audit: s.ui.auditLayout() }; });
    expect(result.coins).toBe(4); expect(result.turns).toEqual(before); expect(result.audit).toEqual([]);
    await page.screenshot({ path: 'artifacts/underwater/interaction-hint-used.png' });
});

test('descent keyboard, touch, collision HP persistence and calm mode in co-op', async ({ page }) => {
    test.setTimeout(80_000);
    await openSeededGame(page, true, {}, {}, { ...hero, underwaterProgress: { ...progress, roomId: 'sp_depth_gate', entryId: 'bell' } },
        { ...hero, underwaterProgress: { ...progress, roomId: 'sp_depth_gate', entryId: 'bell' } });
    await activateCoopSession(page, 'UnderwaterRoomScene');
    await waitForScene(page, 'UnderwaterRoomScene'); await page.waitForTimeout(800);
    await tap(page, 1052, 364); await waitForScene(page, 'UnderwaterDescentScene');
    await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(500); await page.keyboard.up('ArrowLeft');
    expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterDescentScene.actors[0].x)).toBeLessThan(540);
    await tap(page, 950, 350); await page.waitForTimeout(1800);
    expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterDescentScene.actors[0].x)).toBeGreaterThan(850);
    await page.waitForTimeout(1000);
    // Place a real hazard on the swimmer to test collision and the save contract deterministically.
    await page.evaluate(() => { const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterDescentScene;
        const h = s.hazards[0]; s.tweens.killTweensOf(h.sprite); h.sprite.setPosition(s.actors[0].x, s.actors[0].y); });
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterDescentScene.hp[0])).toBe(19);
    await page.screenshot({ path: 'artifacts/underwater/interaction-descent-hit.png' });
    await tap(page, 1030, 660);
    await waitForScene(page, 'UnderwaterRoomScene');
    expect(await page.evaluate(() => { const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
        return { id: s.roomId, hp: s.player().hp, won: s.progress().defeatedEncounters.includes('silverpond-depth-guardian') }; }))
        .toEqual({ id: 'sp_lake_heart', hp: 19, won: false });
});

test('co-op hint charges the displayed solver B, never player A', async ({ page }) => {
    test.setTimeout(75_000);
    const underwaterProgress = { ...progress, bellNotes: 1, restoredMechanisms: [] };
    await openSeededGame(page, true, {}, {}, { ...hero, underwaterProgress }, { ...hero, underwaterProgress });
    await activateCoopSession(page, 'UnderwaterRoomScene');
    await waitForScene(page, 'UnderwaterRoomScene');
    await page.waitForFunction(() => !(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.revealing);
    const bell = await page.evaluate(() => { const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
        const h = s.builder.get('bellHost'); return { x: h.x, y: h.y }; });
    await tap(page, bell.x, bell.y);
    await page.waitForFunction(() => !!(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.bellPuzzle);
    expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.ui.modal.list
        .find((o: any) => o.name === 'activePuzzleSolver')?.getData('solverId'))).toBe('B');
    await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.ui.modal.list
        .find((o: any) => o.name === 'iconFlowHintHost')?.getData('waterState') === 'normal', null, { timeout: 35_000 });
    await tap(page, 840, 169);
    expect(await page.evaluate(() => [0, 1].map(i => JSON.parse(localStorage.getItem(`littleMathAdventure_slot_${i}`)!).player.coins.copper)))
        .toEqual([5, 4]);
    expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.ui.auditLayout())).toEqual([]);
    await page.screenshot({ path: 'artifacts/underwater/interaction-coop-hint.png' });
});

test('pump hint frame, price and stable pointer states on Canvas tablet', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(kind: string, ...args: any[]) {
            if (kind.includes('webgl')) return null;
            return original.call(this, kind as any, ...args);
        } as typeof original;
    });
    await openSeededGame(page, false, {}, {}, { ...hero, underwaterProgress: { ...progress,
        roomId: 'sp_sunken_canal', entryId: 'bell', restoredMechanisms: [], defeatedEncounters: ['silverpond-canal-blockade'] } });
    await page.evaluate(() => { (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('UnderwaterRoomScene'); });
    await waitForScene(page, 'UnderwaterRoomScene');
    await page.waitForFunction(() => !(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.revealing);
    const mechanism = await page.evaluate(() => { const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
        const h = s.builder.get('mechanismHost'); return { x: h.x, y: h.y }; });
    await tap(page, mechanism.x, mechanism.y);
    await page.waitForFunction(() => !!(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.pumpPuzzle);
    const review = async (state: string) => {
        expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.ui.auditLayout())).toEqual([]);
        await page.screenshot({ path: `artifacts/underwater/interaction-pump-${state}.png` });
    };
    await review('disabled');
    // The preceding tests exercise the real 30-second delay. Advance only this visual fixture's update clock.
    await page.evaluate(() => { (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.events.emit('update', 0, 30000); });
    await review('normal');
    const box = (await page.locator('canvas').boundingBox())!;
    await page.mouse.move(box.x + 930 / 1280 * box.width, box.y + 169 / 720 * box.height);
    await page.waitForTimeout(180); await review('hover');
    await page.mouse.down(); await page.waitForTimeout(180); await review('pressed');
    await page.mouse.move(box.x + 200 / 1280 * box.width, box.y + 300 / 720 * box.height);
    await page.mouse.up(); await page.waitForTimeout(180); await review('out');
    await tap(page, 930, 169); await page.waitForTimeout(250); await review('used');
});
