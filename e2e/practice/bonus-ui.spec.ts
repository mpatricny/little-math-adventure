import { test, expect, openSeededGame, activateCoopSession, startDefaultArenaPreview, startBattleFromPreview, waitForScene } from '../arena/helpers/arena-harness';
import { tapPracticeControl as tap } from './controls';
import { mkdir } from 'node:fs/promises';

const review = 'artifacts/practice-victory-review';
for (const renderer of ['webgl', 'canvas']) test(`personal +1 and saved practice mana use the real board and victory flow — ${renderer}`, async ({ page }) => {
    page.on('pageerror',error=>console.log(error.stack));
    await mkdir(review, { recursive: true });
    await openSeededGame(page, true, {}, {}, { seenGuides: ['arena.free.v1'] });
    if (renderer === 'canvas') {
        await page.setViewportSize({ width: 1024, height: 768 });
        await page.goto('/?renderer=canvas'); await waitForScene(page, 'MenuScene');
    }
    expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.renderer.type),
        'Phaser must really use the requested renderer, not silently fall back').toBe(renderer === 'canvas' ? 1 : 2);
    // Fill only this context's fake profiles. Both players use the same form but
    // have different references, exercising the active-child callback at runtime.
    await page.evaluate(async () => {
        const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
        const { createInitialComparisonChapterState } = await import('/src/systems/ComparisonLearningSystem.ts');
        const game = GameStateManager.getInstance();
        for (const slot of [0, 1]) {
            game.loadSlot(slot);
            const data = game.getMasteryData(); data.comparisonChapter = createInitialComparisonChapterState('complete');
            data.subAtoms.A1.state = 'secure'; data.practice = { mode: 'practice', targetId: 'A1' };
            for (const form of ['result_unknown', 'missing_part', 'comparison']) {
                const key = `A1:2+2:${form}`;
                data.problemRecords[key] = { problemKey: key, subAtomId: 'A1', form, attempts: [] };
                for (let i = 0; i < 10; i++) data.problemRecords[key].attempts.push({
                    correct: true, responseTimeMs: slot ? 1000 : 6000, context: 'battle',
                    timestamp: Date.now() - 50000 + i, sequenceIndex: ++data.globalSolveSequence,
                });
            }
            game.save();
        }
        game.loadSlot(0);
    });
    await activateCoopSession(page); await startDefaultArenaPreview(page); await startBattleFromPreview(page);
    await page.evaluate(() => {
        const battle = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        battle.onAttackClicked();
        (window as any).__bonusBatches = [];
        battle.mathBoard.onComplete = (...args: any[]) => (window as any).__bonusBatches.push(args);
    });
    let expected = 0;
    for (let i = 0; i < 6; i++) {
        if (i === 3) {
            await page.waitForFunction(() => (window as any).__bonusBatches.length === 1);
            expected = 0;
            await page.evaluate(() => {
                const battle = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
                battle.showAttackProblems();
                battle.mathBoard.onComplete = (...args: any[]) => (window as any).__bonusBatches.push(args);
            });
        }
        await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.acceptingAnswer);
        const result = await page.evaluate(() => {
            const board = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard;
            const problem = board.problems[board.currentProblemIndex];
            board.activeTimeMs = 1800;
            const choice = problem.choices.indexOf(problem.answer);
            board.submitChoice(choice); board.submitChoice(choice); // Same answer cannot earn twice.
            return { base: problem.damageMultiplier || 1, count: board.results.length, damage: board.damageDealt,
                quick: board.sequential ? board.sequentialView.state.quick : 0 };
        });
        expected += result.base + 1;
        expect(result.count).toBe(i % 3 + 1); expect(result.damage).toBe(expected); expect(result.quick).toBe(1);
        if (!i) await page.locator('#game-container canvas').screenshot({ path: `${review}/bonus-${renderer}.png` });
        await advanceIllustratedBoard(page);
    }
    await page.waitForFunction(() => (window as any).__bonusBatches.length === 2);
    const b = await page.evaluate(async () => {
        const battle = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        const { CoopSessionManager } = await import('/src/systems/CoopSessionManager.ts');
        const coop = CoopSessionManager.getInstance(); coop.activatePlayerB();
        // Same board, same fight, slower than B's own history: no quick attack.
        const problem = { id: 'b', operand1: 2, operand2: 2, operator: '+', answer: 4, choices: [3, 4, 5],
            showVisualHint: false, hintType: 'none', masteryKey: 'A1:2+2:result_unknown', damageMultiplier: 4, source: 'pet' };
        battle.mathBoard.hide(); battle.mathBoard.showSingle(problem, (correct: boolean, ms: number, assisted: boolean, damage: number) => {
            (window as any).__petBonus = { correct, ms, assisted, damage };
        }, { presentation: 'sequential' });
        return { oldA: battle.speedChargeBar.getContainer().visible, oldB: battle.speedChargeBarB.getContainer().visible };
    });
    expect(b).toEqual({ oldA: false, oldB: false });
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.acceptingAnswer);
    await page.evaluate(() => {
        const board = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard;
        board.activeTimeMs = 1800; board.submitChoice(1);
    });
    await advanceIllustratedBoard(page);
    await page.waitForFunction(() => !!(window as any).__petBonus);
    expect(await page.evaluate(() => (window as any).__petBonus.damage)).toBe(4);
    await page.evaluate(() => {
        const battle = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
        battle.mathBoard.hide(); battle.onVictory(); battle.onVictory();
    });
    await waitForScene(page, 'VictoryScene');
    await page.waitForTimeout(350);
    const rewards = await page.evaluate(() => {
        const game = (window as any).__LITTLE_MATH_GAME__;
        const victory = game.scene.keys.VictoryScene;
        return { a: victory.victoryData.practiceRewardA, b: victory.victoryData.practiceRewardB,
            mana: (victory.children.getByName('practiceVictoryResult').getAll().find((group: any) =>
                group.getByName?.('victoryManaAValueHost'))?.getByName('victoryManaAValueHost'))?.text,
            violations: victory.auditLayout(),
            saved: [0, 1].map(slot => JSON.parse(localStorage.getItem(`littleMathAdventure_slot_${slot}`)!).player),
        };
    });
    expect(rewards.a.mana).toBe(1); expect(rewards.b.mana).toBe(0);
    expect(rewards.saved[0].lastPracticeManaBattleId).toBeTruthy(); expect(rewards.saved[1].lastPracticeManaBattleId).toBeUndefined();
    expect(rewards.saved[0].mana - rewards.saved[1].mana).toBe(1);
    expect(rewards.mana).toBe('+1');
    expect(rewards.violations).toEqual([]);
    await page.locator('#game-container canvas').screenshot({ path: `${review}/victory-${renderer}.png` });
    await tap(page, 'practiceVictoryOwner1');
    const ownerB = await page.evaluate(() => {
        const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.VictoryScene;
        const body = s.children.getByName('practiceVictoryResult');
        return { owner: body.getData('owner'), target: body.getData('targetId'),
            before: s.victoryData.practiceRewardB.journey.before.medianMs };
    });
    expect(ownerB).toEqual({ owner: 1, target: 'A1', before: 1000 });
    await tap(page, 'practiceVictoryJourney'); await waitForScene(page, 'CatacombOverviewScene');
    expect(await page.evaluate(() => {
        const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombOverviewScene;
        const detail = s.children.getByName('catacombProgress');
        return [detail.getData('slot'), detail.getData('target')];
    })).toEqual([1, 'A1']);
    await tap(page, 'catacombProgressClose'); await waitForScene(page, 'VictoryScene');
    // Visual fixtures also cover the right-side recipient and solo layout.
    for (const variant of ['b-only', 'solo']) {
        await page.evaluate(variant => {
            const victory = (window as any).__LITTLE_MATH_GAME__.scene.keys.VictoryScene;
            const data = { ...victory.victoryData };
            if (variant === 'b-only') { data.practiceRewardB = data.practiceRewardA; data.practiceRewardA = undefined; }
            else { data.coopMode = false; data.practiceReward = data.practiceRewardB; }
            victory.scene.restart(data);
        }, variant);
        await page.waitForTimeout(400);
        expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.VictoryScene.auditLayout())).toEqual([]);
        await page.locator('#game-container canvas').screenshot({ path: `${review}/victory-${variant}-${renderer}.png` });
    }
});

async function advanceIllustratedBoard(page:any):Promise<void>{
    await page.waitForFunction(()=> (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.sequentialView.state.pendingNext);
    const p=await page.evaluate(()=>{
        const r=(window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.sequentialView.next.root;
        return r.getWorldTransformMatrix().transformPoint(0,0);
    });
    const box=await page.locator('#game-container canvas').boundingBox();
    await page.mouse.click(box.x+p.x/1280*box.width,box.y+p.y/720*box.height);
}

test('complete generated arena comparison at tablet and desktop size', async ({ page }) => {
    await mkdir(review, { recursive: true });
    for (const width of [1280, 768]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto('/docs/design-drafts/arena-reference-v3/index.html');
        await page.locator('.concept').evaluate((img: HTMLImageElement) => img.decode());
        await page.locator('.screen').screenshot({ path: `${review}/arena-proposed-${width}.png` });
        await page.getByRole('button', { name: 'Bez slov' }).click();
        await page.locator('.screen').screenshot({ path: `${review}/arena-no-words-${width}.png` });
    }
});
