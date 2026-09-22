import { test, expect, openSeededGame, waitForScene } from '../arena/helpers/arena-harness';
import type { Page } from 'playwright/test';

async function clickHost(page: Page, id: string) {
    const p = await page.evaluate(id => {
        const h = (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.sceneBuilder.get(id);
        return { x: h.x, y: h.y };
    }, id);
    const box = (await page.locator('canvas').boundingBox())!;
    await page.mouse.click(box.x + p.x * box.width / 1280, box.y + p.y * box.height / 720);
}

for (const characterType of ['girl_knight', 'boy_knight']) {
    for (const lethal of [false, true]) test(`${characterType}: ${lethal ? 'death' : 'hurt'} starts at impact, before return`, async ({ page }) => {
        await openSeededGame(page, false, {}, {}, { characterType });
        await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('CatacombTrialScene', { examType: 'fluency_challenge', subAtomId: 'A1' }));
        await waitForScene(page, 'CatacombTrialScene');
        await clickHost(page, 'catacombPrimary');
        await page.evaluate(lethal => {
            const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene;
            if (lethal) {
                s.creatureHp = 1;
                s.correctCount = s.creatureMaxHp - 1;
            }
            // Phaser timers use smoothed delta, while Clock.now is wall time.
            // Measure game time so software WebGL stalls don't look like a delay.
            const clock = s.time.addEvent({ delay: 60_000 });
            const trace = (window as any).__impactTrace = { initialHp: s.creatureHp, originX: s.heroContainer.x, start: null, reaction: null, hpChange: null, reactionDone: null, next: null };
            const originalHp = s.updateHpBar.bind(s);
            s.updateHpBar = () => { trace.hpChange = { time: s.time.now, hp: s.creatureHp }; originalHp(); };
            const originalNext = s.presentNextProblem.bind(s);
            s.presentNextProblem = () => { trace.next = { time: s.time.now, heroX: s.heroContainer.x }; originalNext(); };
            s.heroSprite.on('animationstart', (a: any) => {
                if (a.key === s.playerSpriteConfig.attackAnim) trace.start = { time: s.time.now, gameTime: clock.getElapsed(), hp: s.creatureHp, travel: s.animationDefs[a.key].movement.duration };
            });
            s.creatureSprite.on('animationstart', (a: any) => {
                if (a.key === `rune-fox-${lethal ? 'death' : 'hurt'}`) trace.reaction = { time: s.time.now, gameTime: clock.getElapsed(), hp: s.creatureHp, heroX: s.heroContainer.x, targetX: s.creatureContainer.x - 50 };
            });
            s.creatureSprite.on('animationcomplete', (a: any) => {
                if (a.key === 'rune-fox-hurt') trace.reactionDone = s.time.now;
            });
        }, lethal);
        const answer = await page.evaluate(() => {
            const p = (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.currentProblem;
            return p.choices.indexOf(p.answer) + 1;
        });
        await clickHost(page, `catacombAnswer${answer}`);
        await page.waitForFunction(() => (window as any).__impactTrace.reaction);
        await page.screenshot({ path: `artifacts/catacomb-timing/${characterType}-${lethal ? 'death' : 'hurt'}.png` });
        const trace = await page.evaluate(() => (window as any).__impactTrace);
        console.log('IMPACT_OBSERVED', JSON.stringify({ characterType, lethal, ...trace }));
        expect(trace.start.hp).toBe(trace.initialHp);
        expect(trace.reaction.hp).toBe(trace.initialHp - 1);
        expect(trace.hpChange.time).toBe(trace.reaction.time);
        expect(trace.reaction.gameTime - trace.start.gameTime).toBeGreaterThanOrEqual(trace.start.travel - 40);
        expect(trace.reaction.gameTime - trace.start.gameTime).toBeLessThan(trace.start.travel + 120);
        // The target reacts while the attacker is at the target, not back home.
        expect(Math.abs(trace.reaction.heroX - trace.reaction.targetX)).toBeLessThan(45);
        expect(Math.abs(trace.reaction.heroX - trace.originX)).toBeGreaterThan(200);
        if (lethal) {
            await expect.poll(() => page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.phase)).toBe('victory');
        } else {
            await page.waitForFunction(() => (window as any).__impactTrace.next);
            const finished = await page.evaluate(() => (window as any).__impactTrace);
            expect(finished.next.time).toBeGreaterThan(finished.reactionDone);
            expect(finished.next.heroX).toBeCloseTo(finished.originX, 0);
            expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.creatureHp)).toBe(trace.initialHp - 1);
        }
        console.log('IMPACT_TIMING', JSON.stringify({ characterType, lethal, ...trace }));
    });
}
