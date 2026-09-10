import { expect, type Page } from 'playwright/test';

export async function fillBridgeGap(page: Page, slot: number, value?: number): Promise<void> {
    const move = await page.evaluate(({ slot, value }) => {
        const s = (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.ForestRiddleScene;
        const stone = s.steppingStones[slot];
        const rock = s.floatingRocks.find((r: any) => r.value === (value ?? stone.expectedValue) && r.placedInSlot === null);
        if (!rock) throw new Error(`No unused rock for gap ${slot}`);
        return { from: { x: rock.container.x, y: rock.container.y }, to: { x: stone.x, y: stone.y } };
    }, { slot, value });
    const box = (await page.locator('canvas').boundingBox())!;
    const xy = (p: { x: number; y: number }) => ({ x: box.x + p.x / 1280 * box.width, y: box.y + p.y / 720 * box.height });
    const from = xy(move.from), to = xy(move.to);
    await page.mouse.move(from.x, from.y); await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 20 }); await page.mouse.up();
    await page.waitForTimeout(250);
}

export async function solveBridge(page: Page): Promise<void> {
    expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.ForestRiddleScene.steppingStones.length)).toBe(2);
    await fillBridgeGap(page, 0);
    expect(await page.evaluate(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.ForestRiddleScene.puzzleSolved)).toBe(false);
    await fillBridgeGap(page, 1);
    await page.waitForFunction(() => (globalThis as any).__LITTLE_MATH_GAME__.scene.keys.ForestRiddleScene.puzzleSolved);
    await page.waitForFunction(() => !(globalThis as any).__LITTLE_MATH_GAME__.scene.keys.ForestRiddleScene.cameras.main.flashEffect.isRunning);
}
