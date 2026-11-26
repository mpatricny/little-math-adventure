import { test, expect } from '../arena/helpers/arena-harness';
import { openModule } from './helpers/observatory';

for (const renderer of ['canvas', 'webgl']) test('observatory dock geometry and touch states in ' + renderer, async ({ page }) => {
    await openModule(page, renderer);
    for (const width of [1280, 1024]) {
        await page.setViewportSize({ width, height: width === 1280 ? 720 : 768 });
        const layout = () => page.evaluate(() => {
            const r = (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.round;
            const view = r.board.sequentialView;
            return view.controls.map((b: any) => {
                const m = b.root.getWorldTransformMatrix();
                return { x: m.tx, y: m.ty, width: b.root.width, height: b.root.height,
                    surfaceY: b.surface.y, scaleX: b.root.scaleX, scaleY: b.root.scaleY };
            });
        });
        const initial = await layout();
        const rect = (await page.locator('canvas').first().boundingBox())!;
        expect(initial.every((b: any) => b.height * rect.height / 720 >= 44 && b.y - b.height / 2 > 565)).toBeTruthy();
        initial.forEach((b: any, i: number) => { if (i) expect(b.x - b.width / 2).toBeGreaterThan(initial[i-1].x + initial[i-1].width / 2); });
        await page.mouse.move(rect.x + initial[0].x / 1280 * rect.width, rect.y + initial[0].y / 720 * rect.height);
        await page.mouse.down();
        await page.mouse.move(rect.x + rect.width / 2, rect.y + 40);
        await page.mouse.up();
        expect((await layout()).map((b: any) => [b.x, b.y, b.scaleX, b.scaleY])).toEqual(initial.map((b: any) => [b.x,b.y,1,1]));
        expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.round.batch.answers.length)).toBe(0);
    }
});
