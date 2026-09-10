import type { Page } from 'playwright/test';
import { test, expect, openSeededGame } from '../arena/helpers/arena-harness';
import { tap, answerPearl } from './hands-on-helpers';

async function checkLayout(page: Page): Promise<void> {
    expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.ui.auditLayout())).toEqual([]);
}

for (const viewport of [{ width: 1280, height: 720 }, { width: 1024, height: 768 }, { width: 1280, height: 800 }]) {
    test(`hands-on visual layout and touch states ${viewport.width}x${viewport.height}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.addInitScript(() => {
            const original = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function (kind: string, ...args: any[]) {
                if (kind === 'webgl' || kind === 'webgl2' || kind === 'experimental-webgl') return null;
                return (original as any).call(this, kind, ...args);
            } as typeof original;
        });
        await openSeededGame(page);
        expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.renderer.type)).toBe(1);
        await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('UnderwaterRoomScene', { preview: true, fromSurface: true }));
        await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.ui?.buttons.some((b: any) => b.root.name === 'iconDiveHost'));
        const prefix = `artifacts/underwater/learning-${viewport.width}x${viewport.height}`;
        await checkLayout(page);
        await page.screenshot({ path: `${prefix}-intro.png` });
        const box = (await page.locator('canvas').boundingBox())!;
        const point = (x: number, y: number) => ({ x: box.x + x / 1280 * box.width, y: box.y + y / 720 * box.height });
        const geometry = () => page.evaluate(() => {
            const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
            const b = s.ui.buttons.find((b: any) => b.root.name === 'iconDiveHost');
            return [b.root.width, b.root.height, b.root.scaleX, b.root.scaleY, b.label.scaleX];
        });
        const normal = await geometry(), dive = point(960, 510);
        await page.mouse.move(dive.x, dive.y); await checkLayout(page);
        expect(await geometry()).toEqual(normal);
        await page.screenshot({ path: `${prefix}-hover.png` });
        await page.mouse.down(); await checkLayout(page);
        expect(await geometry()).toEqual(normal);
        await page.screenshot({ path: `${prefix}-pressed.png` });
        await page.mouse.move(5, 5); await page.mouse.up();
        expect(await geometry()).toEqual(normal);
        await tap(page, 960, 510);
        await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.party.length > 0);
        await page.waitForTimeout(3200);
        await checkLayout(page);
        expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.ui.roomControls.length)).toBe(0);
        await page.screenshot({ path: `${prefix}-shallows.png` });
        await tap(page, 480, 555);
        await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.wordChest);
        await checkLayout(page);
        await page.screenshot({ path: `${prefix}-word-chest.png` });
        await tap(page, 640, 550);
        expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.progress().openedChests)).toEqual([]);
        const lockBeforeHint = await page.evaluate(() => [...(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.wordChest.letters]);
        await tap(page, 1060, 250);
        expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.wordChest.letters)).toEqual(lockBeforeHint);
        expect(await page.evaluate(() => {
            const modal = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.ui.modal;
            return modal.list.filter((o: any) => /^cipherClue/.test(o.name))
                .flatMap((o: any) => o.list).filter((o: any) => /^cipherResult/.test(o.name) && o.text).length;
        })).toBe(1);
        await checkLayout(page);
        await page.screenshot({ path: `${prefix}-word-hint.png` });
        await tap(page, 1060, 165);
        await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.scene.restart({ roomId: 'sp_bell_hub', entryId: 'shallows' }));
        await page.waitForFunction(() => { const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene; return s.party.length > 0 && s.roomId === 'sp_bell_hub'; });
        await page.waitForTimeout(800);
        await checkLayout(page);
        await page.screenshot({ path: `${prefix}-hub.png` });
        const doorway = point(209, 406);
        await page.mouse.move(doorway.x, doorway.y); await page.waitForTimeout(250);
        await page.screenshot({ path: `${prefix}-entrance-hover.png` });
        await tap(page, 658, 316);
        await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.bellPuzzle?.phase === 'building');
        await checkLayout(page);
        await page.screenshot({ path: `${prefix}-bell.png` });
        const selected = () => page.evaluate(() => [...(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.bellPuzzle.selected]);
        await tap(page, 280, 522); expect(await selected()).toEqual([0, null]);
        await tap(page, 490, 335); expect(await selected()).toEqual([null, null]);
        const supply = point(280, 522), socket = point(690, 335);
        await page.mouse.move(supply.x, supply.y); await page.mouse.down();
        await page.mouse.move(socket.x, socket.y, { steps: 12 }); await page.mouse.up();
        expect(await selected()).toEqual([null, 0]);
        await tap(page, 424, 522); expect(await selected()).toEqual([1, 0]);
        await checkLayout(page);
        await page.screenshot({ path: `${prefix}-selected.png` });
        // A pearl cannot occupy both sockets; drag moves it, never copies it.
        const first = point(490, 335);
        await page.mouse.move(supply.x, supply.y); await page.mouse.down();
        await page.mouse.move(first.x, first.y, { steps: 12 }); await page.mouse.up();
        expect(await selected()).toEqual([0, null]);
        await tap(page, 490, 335);
        // Incomplete submission is not a wrong arithmetic attempt.
        await tap(page, 940, 335);
        expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.progress().puzzleAttempts)).toBe(0);
        for (const correct of [false, true]) {
            await answerPearl(page, correct, false);
            await checkLayout(page);
            await page.screenshot({ path: `${prefix}-${correct ? 'correct' : 'wrong'}.png` });
            const attempts = await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.progress().puzzleAttempts);
            await tap(page, 940, 335);
            expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.progress().puzzleAttempts)).toBe(attempts);
            await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.bellPuzzle?.phase === 'building');
        }
        // Closing cancels feedback timers; no modal may reopen unexpectedly.
        await answerPearl(page, false, false);
        await tap(page, 1060, 165);
        await page.waitForTimeout(2500);
        expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.ui.modal)).toBeNull();
        await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.openPuzzle());
        await tap(page, 940, 165);
        await tap(page, 940, 165);
        await checkLayout(page);
        await page.screenshot({ path: `${prefix}-hint.png` });
        expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene.bellPuzzle.hintLevel)).toBe(2);
        // Deliberately break all three previous regression classes to validate the guard itself.
        expect(await page.evaluate(() => {
            const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.UnderwaterRoomScene;
            s.ui.modal.list.find((o: any) => o.name === 'waterModalFrame').scaleY *= 1.2;
            const text = s.ui.modal.list.find((o: any) => o.name === 'bellTargetHost');
            text.y = 5; text.frame.source.resolution = 1;
            return s.ui.auditLayout();
        })).toEqual(expect.arrayContaining([expect.stringContaining('distorted artwork'), expect.stringContaining('text moved outside'), expect.stringContaining('text texture resolution')]));
    });
}
