import { test, expect, openSeededGame, waitForScene } from '../arena/helpers/arena-harness';
import { mkdir } from 'node:fs/promises';

for (const renderer of ['webgl', 'canvas']) {
    test(`MathBoard pause and checkpoint preserve accepted answers — ${renderer}`, async ({ page }) => {
        await openSeededGame(page, false, {}, {}, { seenGuides: ['shop.intro.v1'] });
        if (renderer === 'canvas') { await page.goto('/?renderer=canvas'); await waitForScene(page, 'MenuScene'); }
        await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('BattleScene', { fromArena: true, arenaLevel: 1, wave: 0 }));
        await waitForScene(page, 'BattleScene');
        await page.evaluate(() => {
            const scene = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
            const board = scene.mathBoard;
            board.setCheckpointChangedCallback(() => undefined); // Isolated board contract, not the in-progress scene adapter.
            (window as any).__board = board;
            (window as any).__answerCount = 0; (window as any).__bonusCount = 0; (window as any).__completions = [];
            board.setFirstAnswerCallback(() => { (window as any).__answerCount++; });
            board.setPersonalBonusCallback(() => { (window as any).__bonusCount++; return { damage: 1, quick: true, baselineMs: 3000 }; });
            const problems = [0, 1].map(i => ({ id: `restore-${i}`, operand1: i + 2, operand2: 2, operator: '+', answer: i + 4,
                choices: [i + 3, i + 4, i + 5], source: 'player', damageMultiplier: 4, showVisualHint: false, hintType: 'none' }));
            board.show(problems);
            board.onComplete = (...args: any[]) => (window as any).__completions.push(args);
        });
        await page.waitForFunction(() => (window as any).__board.acceptingAnswer);
        const frozen = await page.evaluate(() => {
            const b = (window as any).__board;
            b.activeTimeMs = 1300;
            b.suspend('fox'); b.suspend('pause');
            b.submitChoice(1);
            return b.exportCheckpoint();
        });
        await page.waitForTimeout(250);
        expect(await page.evaluate(() => (window as any).__board.exportCheckpoint().activeTimeMs)).toBe(frozen.activeTimeMs);
        expect(await page.evaluate(() => (window as any).__answerCount)).toBe(0);
        await page.evaluate(() => (window as any).__board.resume('fox'));
        expect(await page.evaluate(() => (window as any).__board.getActiveProblemSnapshot())).toBeNull();
        await page.evaluate(() => { const b = (window as any).__board; b.resume('pause'); b.submitChoice(1); });
        await page.waitForFunction(() => (window as any).__board.sequentialView.state.pendingNext);
        const answered = await page.evaluate(() => {
            const b = (window as any).__board;
            const saved = JSON.parse(JSON.stringify(b.exportCheckpoint()));
            (window as any).__answeredCheckpoint = saved;
            if (!b.restoreCheckpoint(saved)) throw new Error('restore rejected');
            b.submitChoice(1); // The restored feedback must not accept another answer.
            return { saved, state: b.sequentialView.state, questionAlpha: b.sequentialView.question.alpha,
                answers: (window as any).__answerCount, bonus: (window as any).__bonusCount };
        });
        expect(answered.saved.damage).toBe(5);
        expect(answered.saved.results).toEqual([true]);
        expect(answered.answers).toBe(1); expect(answered.bonus).toBe(1);
        expect(answered.state.displayedTotal).toBe(5); expect(answered.state.pendingNext).toBe(true);
        expect(answered.questionAlpha).toBe(1);
        await mkdir('artifacts/fox-checkpoint/review', { recursive: true });
        await page.locator('#game-container canvas').screenshot({ path: `artifacts/fox-checkpoint/review/${renderer}-restored-feedback.png` });
        await page.evaluate(() => (window as any).__board.sequentialView.advance());
        await page.waitForFunction(() => (window as any).__board.acceptingAnswer && (window as any).__board.currentProblemIndex === 1);
        const question = await page.evaluate(() => {
            const b = (window as any).__board;
            b.activeTimeMs = 1700;
            const checkpoint = JSON.parse(JSON.stringify(b.exportCheckpoint()));
            b.hide();
            b.restoreCheckpoint(checkpoint);
            b.onComplete = (...args: any[]) => (window as any).__completions.push(args);
            b.suspend('inspection');
            return b.exportCheckpoint();
        });
        expect(question.index).toBe(1); expect(question.activeTimeMs).toBe(1700);
        expect(question.results).toEqual([true]); expect(question.damage).toBe(5);
        expect(await page.evaluate(() => (window as any).__board.sequentialView.question.alpha)).toBe(1);
        await page.locator('#game-container canvas').screenshot({ path: `artifacts/fox-checkpoint/review/${renderer}-restored-question.png` });
        await page.evaluate(() => { const b = (window as any).__board; b.resume('inspection'); b.submitChoice(0); });
        await page.waitForFunction(() => (window as any).__board.sequentialView.state.pendingNext);
        await page.evaluate(() => (window as any).__board.sequentialView.advance());
        await page.waitForFunction(() => (window as any).__completions.length === 1);
        const final = await page.evaluate(() => {
            const b = (window as any).__board;
            const completed = JSON.parse(JSON.stringify(b.exportCheckpoint()));
            b.restoreCheckpoint(completed);
            return { completed, answers: (window as any).__answerCount, bonus: (window as any).__bonusCount,
                completions: (window as any).__completions };
        });
        expect(final.completed.completionDelivered).toBe(true);
        expect(final.completions[0][1]).toEqual([true, false]);
        expect(final.completions[0][0]).toBe(5);
        expect(final.answers).toBe(2); expect(final.bonus).toBe(2);
        await page.waitForTimeout(350);
        expect(await page.evaluate(() => (window as any).__completions.length)).toBe(1);

        // A failed comparison block must restore its explanation, never become a fresh attempt.
        await page.evaluate(() => {
            const b = (window as any).__board;
            b.show([{ id: 'restore-comparison', operand1: 5, operand2: 4, operator: '+', operand3: 7,
                answer: 2, choices: [0, 1, 2], problemType: 'comparison', source: 'shield',
                showVisualHint: false, hintType: 'none' }], { defense: { power: 2, incomingDamage: 4 } });
            b.onComplete = (...args: any[]) => (window as any).__completions.push(args);
        });
        await page.waitForFunction(() => (window as any).__board.acceptingAnswer);
        await page.evaluate(() => (window as any).__board.submitChoice(0));
        await page.waitForFunction(() => (window as any).__board.sequentialView.state.pendingNext);
        const restoredBlock = await page.evaluate(() => {
            const b = (window as any).__board;
            b.suspend('inspection');
            const saved = JSON.parse(JSON.stringify(b.exportCheckpoint()));
            if (!b.restoreCheckpoint(saved)) throw new Error('comparison restore rejected');
            b.submitChoice(2);
            return { saved, answers: (window as any).__answerCount, alpha: b.sequentialView.question.alpha };
        });
        expect(restoredBlock.saved.results).toEqual([false]);
        expect(restoredBlock.saved.damage).toBe(0); expect(restoredBlock.saved.feedback[0].blocked).toBe(0);
        expect(restoredBlock.answers).toBe(3); expect(restoredBlock.alpha).toBe(1);
        await page.locator('#game-container canvas').screenshot({ path: `artifacts/fox-checkpoint/review/${renderer}-restored-comparison-block.png` });
        await page.evaluate(() => { const b = (window as any).__board; b.resume('inspection'); b.sequentialView.advance(); });
        await page.waitForFunction(() => (window as any).__completions.length === 2);
        expect(await page.evaluate(() => (window as any).__answerCount)).toBe(3);
    });
}
