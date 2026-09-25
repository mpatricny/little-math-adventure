import type { Page } from 'playwright/test';
import { test, expect, openSeededGame, waitForScene } from '../arena/helpers/arena-harness';

async function point(page: Page, name: string) {
    const p = await page.evaluate(name => {
        const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.SpinLockPuzzleScene;
        const bounds = s.children.getByName(name).getBounds();
        return { x: bounds.centerX, y: bounds.centerY, width: bounds.width, height: bounds.height };
    }, name);
    const canvas = (await page.locator('canvas').boundingBox())!;
    return { x: canvas.x + p.x * canvas.width / 1280, y: canvas.y + p.y * canvas.height / 720,
        width: p.width * canvas.width / 1280, height: p.height * canvas.height / 720 };
}

for (const renderer of ['webgl', 'canvas']) {
    test(`forest chest enlarged by 50 percent — ${renderer}`, async ({ page }) => {
        await page.route(url => /^\/(?:api|v1)(?:\/|$)/.test(url.pathname), route => route.fulfill({
            status: 200, contentType: 'application/json', body: '{"authenticated":false}',
        }));
        await page.setViewportSize(renderer === 'canvas' ? { width: 1024, height: 768 } : { width: 1280, height: 720 });
        await openSeededGame(page);
        if (renderer === 'canvas') {
            await page.goto('/?renderer=canvas');
            await waitForScene(page, 'MenuScene');
        }
        await page.evaluate(async () => {
            const { JourneySystem } = await import('/src/systems/JourneySystem.ts');
            const { acquirePuzzle } = await import('/src/systems/puzzles/PuzzleService.ts');
            const { wordPools } = await import('/src/systems/puzzles/WordPuzzles.ts');
            const journey = JourneySystem.getInstance();
            journey.startRoomJourney('verdant_forest', 'deep_forest', true);
            acquirePuzzle(journey.getPuzzleStore(), 'deep_forest:chest_locked:word', 'word_riddle', () =>
                wordPools.riddles.reduce((longest, row) => row.riddle.length > longest.riddle.length ? row : longest));
            (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('ForestRoomScene', { roomId: 'deep_forest' });
        });
        await waitForScene(page, 'ForestRoomScene');
        await page.evaluate(() => {
            const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.ForestRoomScene;
            s.sound.mute = true;
            s.openLetterLockChest(s.currentRoom.objects.find((o: any) => o.id === 'chest_locked'));
        });
        await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.SpinLockPuzzleScene?.wheelTexts.length === 4);
        const prefix = `artifacts/chest-size/${renderer === 'canvas' ? 'tablet-canvas' : 'desktop-webgl'}`;
        const audit = await page.evaluate(async () => {
            const { wordPools } = await import('/src/systems/puzzles/WordPuzzles.ts');
            const game = (window as any).__LITTLE_MATH_GAME__, s = game.scene.keys.SpinLockPuzzleScene;
            const frame = s.sceneBuilder.get('Spin frame'), texts = frame.getData('textObjects');
            const riddle = texts.get('1770852558035-agtscuz25').text;
            const title = texts.get('1770852383215-0rdg3l638').text;
            const button = texts.get('1770852293801-rg3dlveug').text;
            const safe = s.sceneBuilder.getElementDef('spinSafeContentHost');
            const wheelTop = s.sceneBuilder.get('spin-4').getBounds().top;
            const failures: string[] = [];
            for (const row of wordPools.riddles) {
                riddle.setText(row.riddle);
                const b = riddle.getBounds();
                if (b.top <= title.getBounds().bottom || b.bottom >= wheelTop
                    || b.left < safe.x - safe.width / 2 || b.right > safe.x + safe.width / 2) failures.push(row.id);
            }
            riddle.setText(s.riddle);
            const size = (t: any) => Number.parseFloat(t.style.fontSize) * t.getWorldTransformMatrix().scaleX;
            return { renderer: game.renderer.type, frame: frame.getBounds(), scale: frame.scaleX,
                riddleSize: size(riddle), titleSize: size(title), buttonSize: size(button),
                letterSizes: s.wheelTexts.map(size), failures,
                resolutions: [riddle, title, button, ...s.wheelTexts].map((t: any) => [t.style.resolution, t.frame.source.resolution]) };
        });
        expect(audit.renderer).toBe(renderer === 'canvas' ? 1 : 2);
        expect(audit.frame.width).toBe(750); expect(audit.frame.height).toBe(562.5);
        expect(audit.frame.x).toBeGreaterThan(0); expect(audit.frame.y).toBeGreaterThan(0);
        expect(audit.scale).toBe(1.5);
        expect(audit.riddleSize).toBe(22.5); expect(audit.titleSize).toBe(27); expect(audit.buttonSize).toBe(30);
        expect(audit.letterSizes).toEqual([48, 48, 48, 48]);
        expect(audit.failures).toEqual([]);
        expect(audit.resolutions.every((r: number[]) => r[0] === 2 && r[1] === 2)).toBe(true);
        const submit = await point(page, 'spinSubmitZone');
        const close = await point(page, 'spinCloseZone');
        const wheels = await Promise.all([0, 1, 2, 3].map(i => point(page, `spinWheel${i}Zone`)));
        for (const target of [submit, close, ...wheels]) {
            expect(target.width).toBeGreaterThanOrEqual(44);
            expect(target.height).toBeGreaterThanOrEqual(44);
        }
        await page.screenshot({ path: `${prefix}-normal.png` });
        await page.mouse.move(submit.x, submit.y);
        await page.screenshot({ path: `${prefix}-hover.png` });
        await page.mouse.move(10, 10);
        await page.screenshot({ path: `${prefix}-pointer-out.png` });
        const startsCorrect = await page.evaluate(() => {
            const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.SpinLockPuzzleScene;
            return s.currentLetters.join('') === s.answer;
        });
        if (startsCorrect) {
            await page.mouse.click(wheels[0].x, wheels[0].y);
            await page.waitForFunction(() => !(window as any).__LITTLE_MATH_GAME__.scene.keys.SpinLockPuzzleScene.isAnimating[0]);
        }
        await page.mouse.move(submit.x, submit.y); await page.mouse.down();
        await page.screenshot({ path: `${prefix}-pressed-wrong.png` });
        await page.mouse.up();
        expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.SpinLockPuzzleScene.puzzleInstance.firstCorrect)).toBe(false);
        await page.waitForTimeout(500); // Let the existing error shake finish.
        for (let i = 0; i < 4; i++) {
            const steps = await page.evaluate(i => {
                const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.SpinLockPuzzleScene;
                const options = s.wheelOptions[i];
                return (options.indexOf(s.answer[i]) - s.currentIndices[i] + options.length) % options.length;
            }, i);
            for (let n = 0; n < steps; n++) {
                await page.mouse.click(wheels[i].x, wheels[i].y);
                await page.waitForFunction(i => !(window as any).__LITTLE_MATH_GAME__.scene.keys.SpinLockPuzzleScene.isAnimating[i], i);
            }
        }
        const selected = await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.SpinLockPuzzleScene.currentLetters.join(''));
        await page.screenshot({ path: `${prefix}-selected.png` });
        await page.mouse.click(close.x, close.y);
        await page.waitForFunction(() => !(window as any).__LITTLE_MATH_GAME__.scene.keys.SpinLockPuzzleScene.scene.isActive());
        await page.evaluate(() => {
            const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.ForestRoomScene;
            s.openLetterLockChest(s.currentRoom.objects.find((o: any) => o.id === 'chest_locked'));
        });
        await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.SpinLockPuzzleScene?.wheelTexts.length === 4
            && (window as any).__LITTLE_MATH_GAME__.scene.keys.SpinLockPuzzleScene.scene.isActive());
        expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.SpinLockPuzzleScene.currentLetters.join(''))).toBe(selected);
        await page.mouse.click(submit.x, submit.y);
        await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.SpinLockPuzzleScene.isSolved);
        await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.SpinLockPuzzleScene.children.getByName('spinRewardText'));
        const rewardBounds = await page.evaluate(() => {
            const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.SpinLockPuzzleScene;
            const reward = s.children.getByName('spinRewardText').getBounds();
            const submit = s.children.getByName('spinSubmitZone').getBounds();
            return { rewardTop: reward.top, rewardBottom: reward.bottom, submitTop: submit.top };
        });
        expect(rewardBounds.rewardBottom).toBeLessThan(rewardBounds.submitTop);
        // Decorative wheel layers include transparent padding; the text must
        // clear the visible aperture, not the full padded bitmap rectangle.
        expect(rewardBounds.rewardTop).toBeGreaterThan(442.5 + 84 / 2);
        await page.screenshot({ path: `${prefix}-success.png` });
        expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.SpinLockPuzzleScene.puzzleInstance.completed)).toBe(true);
    });
}
