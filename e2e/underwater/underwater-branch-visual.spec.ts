import { test, expect, openSeededGame, waitForScene } from '../arena/helpers/arena-harness';
import { tap, solveOpenChest } from './hands-on-helpers';

for (const viewport of [{ width: 1280, height: 720 }, { width: 1024, height: 768 }, { width: 1280, height: 800 }]) {
    test(`branch tablet visuals, healing approach, physical drums and valves ${viewport.width}x${viewport.height}`, async ({ page }) => {
        test.setTimeout(100_000);
        await page.setViewportSize(viewport);
        await page.addInitScript(() => {
            const original = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function (kind: string, ...args: any[]) {
                if (['webgl', 'webgl2', 'experimental-webgl'].includes(kind)) return null;
                return (original as any).call(this, kind, ...args);
            } as typeof original;
        });
        await openSeededGame(page, false, {}, {}, {
            hp: 7, maxHp: 40, storyProgress: { hasCompletedIntro: true, hasUnlockedSilverpond: true, hasWaterBreathingScale: true },
            underwaterProgress: { schemaVersion: 1, active: true, introSeen: true, roomId: 'sp_bell_hub', entryId: 'shallows',
                visitedRooms: [], defeatedEncounters: [], openedChests: [], bellNotes: 3, puzzleAttempts: 3 },
        });
        const prefix = `artifacts/underwater/branches-canvas-${viewport.width}x${viewport.height}`;
        const audit = async () => expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.ui.auditLayout())).toEqual([]);
        const ready = async (room: string) => page.waitForFunction(room => {
            const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
            return s.scene.isActive() && s.roomId === room && s.party.length > 0 && !s.ui.modal;
        }, room);
        const startRoom = async (roomId: string) => {
            await page.evaluate(roomId => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.scene.restart({ roomId, entryId: 'bell' }), roomId);
            await ready(roomId); await page.waitForTimeout(650);
        };
        await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('UnderwaterRoomScene'));
        await ready('sp_bell_hub'); await page.waitForTimeout(650);
        await page.screenshot({ path: `${prefix}-hub-open.png` });
        await tap(page, 895, 474);
        expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.player().hp)).toBe(7);
        await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.player().hp === 40);
        expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.party[0].x)).toBeCloseTo(895);
        expect(await page.evaluate(() => Boolean((globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.children.getByName('underwaterHealing')))).toBe(true);
        await page.screenshot({ path: `${prefix}-healing.png` });
        await startRoom('sp_reed_garden'); await audit();
        await page.screenshot({ path: `${prefix}-garden-guards.png` });
        expect(await page.evaluate(() => {
            const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
            return s.party[0].depth > s.builder.get('mechanismHost').depth;
        })).toBe(true);
        await page.evaluate(() => {
            const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
            s.progress().defeatedEncounters.push('silverpond-garden-patrol', 'silverpond-canal-blockade');
        });
        await startRoom('sp_reed_garden'); await tap(page, 650, 478);
        await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.currentPuzzle);
        await audit(); await page.screenshot({ path: `${prefix}-currents-empty.png` });
        const b = (await page.locator('canvas').boundingBox())!;
        const point = (x: number, y: number) => ({ x: b.x + x / 1280 * b.width, y: b.y + y / 720 * b.height });
        const card = point(255, 527), slot = point(730, 252);
        await page.mouse.move(card.x, card.y); await page.mouse.down();
        await page.mouse.move(slot.x, slot.y, { steps: 12 }); await page.mouse.up();
        expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.currentPuzzle.selected)).toEqual([null, 0, null]);
        await page.screenshot({ path: `${prefix}-currents-dragged.png` });
        await tap(page, 730, 252);
        for (const x of [255, 375, 495]) await tap(page, x, 527);
        await tap(page, 1025, 527); await audit();
        await page.screenshot({ path: `${prefix}-currents-wrong.png` });
        await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.currentPuzzle.phase === 'building');
        await tap(page, 940, 165); await tap(page, 940, 165); await audit();
        await page.screenshot({ path: `${prefix}-currents-hint.png` });
        await tap(page, 1060, 165);
        await startRoom('sp_sunken_canal');
        await page.screenshot({ path: `${prefix}-canal.png` });
        await tap(page, 650, 362);
        await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.pumpPuzzle);
        await audit(); await page.screenshot({ path: `${prefix}-pump.png` });
        await tap(page, 400, 380);
        await tap(page, 1060, 165); // Cancel while the valve's 220 ms animation is still running.
        await page.waitForTimeout(500);
        expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.ui.modal)).toBeNull();
        await tap(page, 650, 362);
        await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.pumpPuzzle);
        await tap(page, 1060, 550); await audit();
        expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.progress().restoredMechanisms ?? [])).not.toContain('canal-pump');
        await page.screenshot({ path: `${prefix}-pump-wrong.png` });
        await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.pumpPuzzle.phase === 'building');
        const turns = await page.evaluate(() => {
            const p = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.pumpPuzzle;
            return p.selected.map((n: number, i: number) => (p.challenge.solution[i] - n + 4) % 4);
        });
        for (let i = 0; i < turns.length; i++) for (let n = 0; n < turns[i]; n++) { await tap(page, 400 + 250 * i, 380); await page.waitForTimeout(240); }
        await tap(page, 1060, 550); await audit(); await page.screenshot({ path: `${prefix}-pump-correct.png` });
        await ready('sp_sunken_canal');
        await tap(page, 445, 575);
        await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.wordChest);
        await audit(); await page.screenshot({ path: `${prefix}-physical-lock.png` });
        const geometry = await page.evaluate(() => {
            const p = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.wordChest;
            return p.letters[0];
        });
        const wheel = point(468, 428);
        await page.mouse.move(wheel.x, wheel.y); await page.mouse.down();
        await page.waitForTimeout(60); await page.screenshot({ path: `${prefix}-lock-rotating.png` });
        await page.mouse.up(); await page.waitForTimeout(180); await audit();
        expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.wordChest.letters[0])).not.toBe(geometry);
        await solveOpenChest(page); await ready('sp_sunken_canal');
        expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.party[0].x)).toBeCloseTo(365);
        const saved = await page.evaluate(() => localStorage.getItem('littleMathAdventure_slot_0'));
        await page.addInitScript(saved => localStorage.setItem('littleMathAdventure_slot_0', saved!), saved);
        await page.reload(); await waitForScene(page, 'MenuScene');
        await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('UnderwaterRoomScene'));
        await ready('sp_sunken_canal');
        expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.party[0].x)).toBeCloseTo(365);
        await page.screenshot({ path: `${prefix}-reload-at-chest.png` });
    });
}
