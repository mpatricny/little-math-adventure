import { mkdir } from 'node:fs/promises';
import { tapPracticeControl as tap } from './controls';
import { test, expect, openSeededGame, startDefaultArenaPreview, waitForScene } from '../arena/helpers/arena-harness';

const review = 'artifacts/practice-victory-review';

test('a one-battle training choice shows the actual change, links its module and continues the arena once', async ({ page }) => {
    await mkdir(review, { recursive: true });
    await openSeededGame(page, false, {}, {}, { attack: 35, seenGuides: ['arena.free.v1'] });
    await page.evaluate(async () => {
        const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
        const { createInitialComparisonChapterState } = await import('/src/systems/ComparisonLearningSystem.ts');
        const game = GameStateManager.getInstance(); game.loadSlot(0);
        const data = game.getMasteryData();
        data.comparisonChapter = createInitialComparisonChapterState('complete');
        data.subAtoms.A1.state = 'training';
        data.practice = { mode: 'progress', defaultMode: 'progress', introductionSeen: true, pinnedTargetId: 'A1' };
        const key = 'A1:2+2:result_unknown';
        data.problemRecords[key] = { problemKey: key, subAtomId: 'A1', form: 'result_unknown', attempts: [{
            timestamp: Date.now() - 60000, sequenceIndex: ++data.globalSolveSequence,
            correct: true, responseTimeMs: 9200, context: 'battle',
        }] };
        game.save();
    });
    await startDefaultArenaPreview(page);
    await tap(page, 'startBattleButton');
    await waitForScene(page, 'BattleScene');
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.practiceChoice);
    await tap(page, 'practiceChoicePracticeSolo'); await tap(page, 'practiceChoiceConfirm');
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.battleState.phase === 'player_turn');
    await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.onAttackClicked());
    const count = await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.problems.length);
    for (let i = 0; i < count; i++) {
        await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.acceptingAnswer);
        await page.evaluate(() => {
            const board = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard;
            const problem = board.problems[board.currentProblemIndex];
            board.activeTimeMs = 6600;
            board.submitChoice(problem.choices.indexOf(problem.answer));
        });
        await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.mathBoard.sequentialView.state.pendingNext);
        await tap(page, 'nextProblem');
    }
    await waitForScene(page, 'VictoryScene');
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.VictoryScene.remoteContinueReady);
    const result = await page.evaluate(() => {
        const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.VictoryScene;
        const body = s.children.getByName('practiceVictoryResult');
        return { reward: s.victoryData.practiceReward, delta: body.getByName('practiceTimeChange').text,
            violations: s.auditLayout(), next: s.victoryData.returnData.wave,
            coins: s.gameState.getPlayer().coins, mana: s.gameState.getPlayer().mana };
    });
    expect(result.reward).toMatchObject({ mana: 0, targetId: 'A1', journey: {
        before: { medianMs: 9200 }, after: { medianMs: 6600, door: 'locked' },
    } });
    expect(result.delta).toBe('−2,6 s');
    expect(result.violations).toEqual([]);
    await page.locator('#game-container canvas').screenshot({ path: review + '/solo-finished-wave.png' });
    await tap(page, 'practiceVictoryJourney');
    await waitForScene(page, 'CatacombOverviewScene');
    expect(await page.evaluate(() => {
        const o = (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombOverviewScene.children.getByName('catacombProgress');
        return [o.getData('target'), o.getData('slot')];
    })).toEqual(['A1', 0]);
    await tap(page, 'catacombProgressClose'); await waitForScene(page, 'VictoryScene');
    await tap(page, 'victoryContinueHost'); await waitForScene(page, 'ArenaScene');
    const next = await page.evaluate(() => {
        const arena = (window as any).__LITTLE_MATH_GAME__.scene.keys.ArenaScene;
        return { wave: arena.sys.settings.data.wave, coins: arena.gameState.getPlayer().coins, mana: arena.gameState.getPlayer().mana };
    });
    expect(next).toEqual({ wave: result.next, coins: result.coins, mana: result.mana });
});

for (const mode of ['practice', 'progress'] as const) {
    test(`forest guardian in ${mode} mode preserves the story crystal and routes the training result`, async ({ page }) => {
        await openSeededGame(page);
        await page.evaluate(async () => {
            const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
            const { createInitialComparisonChapterState } = await import('/src/systems/ComparisonLearningSystem.ts');
            const { JourneySystem } = await import('/src/systems/JourneySystem.ts');
            const game = GameStateManager.getInstance();
            game.loadSlot(0);
            const data = game.getMasteryData();
            data.comparisonChapter = createInitialComparisonChapterState('complete');
            data.subAtoms.A1.state = 'training';
            data.practice = { mode: 'progress', defaultMode: 'progress', pinnedTargetId: 'A1', introductionSeen: true };
            game.save();
            const journey = JourneySystem.getInstance();
            journey.startRoomJourney('verdant_forest', 'guardian_lair', true);
            journey.setObjectState('guardian_lair', 'puzzle_offering', { interacted: true, completed: true });
            (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('GuardianLairScene');
        });
        await waitForScene(page, 'GuardianLairScene');
        await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.GuardianLairScene.startRealBattle());
        await waitForScene(page, 'BattleScene');
        await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.practiceChoice);
        if (mode === 'practice') await tap(page, 'practiceChoicePracticeSolo');
        await tap(page, 'practiceChoiceConfirm');
        await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene.battleState.phase === 'player_turn');
        await page.evaluate(() => {
            const battle = (window as any).__LITTLE_MATH_GAME__.scene.keys.BattleScene;
            battle.currentBossPhase = battle.bossPhases.length - 1;
            battle.battleState.enemies.forEach((enemy: { hp: number }) => { enemy.hp = 0; });
            battle.checkVictoryOrContinue();
        });
        if (mode === 'practice') {
            await waitForScene(page, 'VictoryScene');
            await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.VictoryScene.remoteContinueReady);
            const result = await page.evaluate(() => {
                const view = (window as any).__LITTLE_MATH_GAME__.scene.keys.VictoryScene;
                return { target: view.victoryData.practiceReward.journey.targetId,
                    before: view.victoryData.practiceReward.journey.before.medianMs, next: view.victoryData.returnScene };
            });
            expect(result).toEqual({ target: 'A1', before: null, next: 'ForestCrystalRewardScene' });
            await tap(page, 'victoryContinueHost');
        }
        await waitForScene(page, 'ForestCrystalRewardScene');
        const crystal = await page.evaluate(async () => {
            const { JourneySystem } = await import('/src/systems/JourneySystem.ts');
            const scene = (window as any).__LITTLE_MATH_GAME__.scene.keys.ForestCrystalRewardScene;
            return { completed: JourneySystem.getInstance().getJourneyState().completed, coins: scene.goldReward, preview: scene.testMode };
        });
        expect(crystal.completed).toBe(true);
        expect(crystal.coins).toBeGreaterThan(0);
        expect(crystal.preview).toBe(false);
    });
}
