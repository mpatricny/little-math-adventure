import { test, expect, openSeededGame, activateCoopSession, waitForScene } from '../arena/helpers/arena-harness';
import { tap, solveOpenChest } from './hands-on-helpers';
import rooms from '../../public/assets/data/underwater-rooms.json';

for (const mode of ['desktop', 'tablet', 'coop-tablet'] as const) test(`every underwater chest pays visible, persistent loot: ${mode}`, async ({ page }) => {
    test.setTimeout(150_000);
    const coop = mode === 'coop-tablet';
    await page.setViewportSize(mode === 'tablet' ? { width: 1024, height: 768 } : { width: 1280, height: coop ? 800 : 720 });
    if (mode !== 'desktop') await page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(kind: string, ...args: any[]) {
            return kind.includes('webgl') ? null : original.call(this, kind as any, ...args);
        } as typeof original;
    });
    const hero = { mana: 0, coins: { copper: 0, silver: 0, gold: 0, pouch: 0 },
        storyProgress: { hasCompletedIntro: true, hasUnlockedSilverpond: true, hasWaterBreathingScale: true },
        underwaterProgress: { schemaVersion: 1, active: true, introSeen: true, roomId: 'sp_shallows', entryId: 'surface',
            visitedRooms: [], defeatedEncounters: ['silverpond-wreck-watch'], openedChests: [], bellNotes: 3, puzzleAttempts: 3 } };
    await openSeededGame(page, coop, {}, {}, hero);
    const enter = async () => {
        if (coop) await activateCoopSession(page, 'UnderwaterRoomScene');
        else await page.evaluate(() => { (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('UnderwaterRoomScene'); });
        await waitForScene(page, 'UnderwaterRoomScene');
    };
    await enter();
    const saves = () => page.evaluate(() => [0, 1].map(i => JSON.parse(localStorage.getItem(`littleMathAdventure_slot_${i}`) ?? 'null')).filter(Boolean));
    const balance = (p: any) => p.coins.copper + 5 * p.coins.silver + 10 * p.coins.gold + 100 * (p.coins.pouch ?? 0);
    let expectedCoins = 0, expectedMana = 0;
    const chests = Object.entries(rooms.rooms).filter(([, room]) => 'chest' in room);
    for (const [roomId, room] of chests) {
        const chest = (room as any).chest;
        await page.evaluate(roomId => { (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.scene.restart({ roomId }); }, roomId);
        await page.waitForFunction(roomId => { const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
            return s.roomId === roomId && s.party.length && !s.revealing && !s.transitioning; }, roomId);
        const host = await page.evaluate(() => { const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
            const h = s.builder.get(s.room.chest.host); return { x: h.x, y: h.y }; });
        await tap(page, host.x, host.y);
        if (chest.lock !== 'none') await solveOpenChest(page);
        await page.waitForFunction(() => { const r = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.children.getByName('underwaterChestReward'); return r?.alpha >= .99; });
        const receipt = await page.evaluate(() => { const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
            const r = s.children.getByName('underwaterChestReward');
            const labels = r.list.filter((v: any) => v.type === 'Text');
            return { loot: r.getData('loot'), modal: Boolean(s.ui.modal), audit: s.ui.auditLayout(),
                counts: labels.map((v: any) => v.text), sourceResolution: labels.every((v: any) => v.frame.source.resolution === v.style.resolution) };
        });
        expect(receipt.loot).toMatchObject({ coins: chest.coins, mana: chest.mana });
        if (coop) expect(receipt.loot.players).toEqual(['A', 'B']);
        expect(receipt.modal).toBe(false); expect(receipt.audit).toEqual([]); expect(receipt.sourceResolution).toBe(true);
        expect(receipt.counts).toEqual(expect.arrayContaining([`+${chest.coins}`, `+${chest.mana}`]));
        await page.screenshot({ path: `artifacts/underwater/chest-loot-${mode}-${roomId}.png` });
        expectedCoins += chest.coins; expectedMana += chest.mana;
        for (const save of await saves()) {
            expect(balance(save.player)).toBe(expectedCoins); expect(save.player.mana).toBe(expectedMana);
            expect(save.player.underwaterProgress.openedChests).toContain(chest.id);
        }
        // Clicking the dimmed chest must not pay or announce a second reward.
        await tap(page, host.x, host.y); await page.waitForTimeout(150);
        for (const save of await saves()) { expect(balance(save.player)).toBe(expectedCoins); expect(save.player.mana).toBe(expectedMana); }
    }
    const snapshot = await saves();
    await page.addInitScript(saved => saved.forEach((s: any, i: number) => localStorage.setItem(`littleMathAdventure_slot_${i}`, JSON.stringify(s))), snapshot);
    await page.reload(); await waitForScene(page, 'MenuScene'); await enter();
    for (const save of await saves()) {
        expect(balance(save.player)).toBe(expectedCoins); expect(save.player.mana).toBe(expectedMana);
        expect(save.player.underwaterProgress.openedChests).toHaveLength(chests.length);
    }
    expect(await page.evaluate(() => Boolean((globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.children.getByName('underwaterChestReward')))).toBe(false);
});
