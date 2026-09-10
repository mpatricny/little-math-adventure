import { test, expect, openSeededGame, activateCoopSession, waitForScene } from '../arena/helpers/arena-harness';

for (const renderer of ['canvas', 'webgl']) {
    test(`guild typography and daily progress in ${renderer}`, async ({ page }) => {
        if (renderer === 'canvas') {
            await page.addInitScript(() => {
                const original = HTMLCanvasElement.prototype.getContext;
                HTMLCanvasElement.prototype.getContext = function (kind: string, ...args: any[]) {
                    if (['webgl', 'webgl2', 'experimental-webgl'].includes(kind)) return null;
                    return (original as any).call(this, kind, ...args);
                } as typeof original;
            });
        }
        await openSeededGame(page, true);
        expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.renderer.type)).toBe(renderer === 'canvas' ? 1 : 2);
        await page.evaluate(async () => {
            const statePath = '/src/systems/GameStateManager.ts';
            const masteryPath = '/src/systems/MasterySystem.ts';
            const databasePath = '/src/systems/ProblemDatabase.ts';
            const { GameStateManager } = await import(statePath);
            const { MasterySystem } = await import(masteryPath);
            const { ProblemDatabase } = await import(databasePath);
            const state = GameStateManager.getInstance();
            for (const slot of [0, 1]) {
                state.loadSlot(slot);
                await new Promise(resolve => setTimeout(resolve, 0));
                const mastery = MasterySystem.getInstance();
                const key = ProblemDatabase.getInstance().getProblemsForForm('A1', 'result_unknown')[0].key;
                for (let i = 0; i < 7; i++) mastery.recordSolve(key, true, 2500, 'battle');
                state.save();
            }
        });
        await activateCoopSession(page, 'TownScene');
        await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.TownScene.scene.start('GuildScene'));
        await waitForScene(page, 'GuildScene');
        for (const viewport of [{ width: 1280, height: 720 }, { width: 1024, height: 768 }]) {
            await page.setViewportSize(viewport);
            await page.waitForTimeout(400);
            const prefix = `artifacts/coop-guild/fixed-${renderer}-${viewport.width}`;
            const audit = async () => page.evaluate(() => {
                const scene = (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene;
                const walk = (items: any[]): any[] => items.flatMap(o => [o, ...walk(o.list ?? [])]);
                return walk(scene.children.list).filter(o => o.type === 'Text' && o.style.resolution === 2)
                    .filter(o => o.frame.source.resolution !== o.style.resolution)
                    .map(o => o.text);
            });
            expect(await audit()).toEqual([]);
            await page.screenshot({path: `${prefix}-normal.png`});
            const point = await page.evaluate(() => {
                const h = (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.sceneBuilder.get('dailyProgressButtonHost');
                return {x:h.x,y:h.y};
            });
            const box = (await page.locator('canvas').boundingBox())!;
            await page.mouse.move(box.x + point.x / 1280 * box.width, box.y + point.y / 720 * box.height);
            await page.waitForTimeout(250);
            await page.screenshot({path: `${prefix}-hover.png`});
            await page.mouse.down();
            await page.waitForTimeout(100);
            await page.screenshot({path: `${prefix}-pressed.png`});
            await page.mouse.move(5,5);
            await page.mouse.up();
            await page.waitForTimeout(250);
            await page.screenshot({path: `${prefix}-pointer-out.png`});
            await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.dailyProgressOverlay.show());
            await page.waitForTimeout(350);
            expect(await audit()).toEqual([]);
            await page.screenshot({path: `${prefix}-daily.png`});
            await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.GuildScene.dailyProgressOverlay.hide());
        }
    });
}
