import { test, expect, openSeededGame, waitForScene } from '../arena/helpers/arena-harness';
import { foxPanel, openModule, solve, tapNamed, waitForQuestion } from './helpers/observatory';
import speed from '../../src/data/fox-speed-levels.json';
import type { MathProblem } from '../../src/types';

test('eight of ten in E2 shows the earned attack on the fox, once, after returning to Silverpond', async ({ page }) => {
    await openSeededGame(page, false, {}, {}, { name: 'Kitten', catacombFoxBonus: 4, unlockedPets: ['catacomb_creature_A'],
        ownedPets: ['pet_catacomb_A'], activePet: 'pet_catacomb_A', catacombFoxJourney: { version: 1, awards: {}, lessons:
            Object.fromEntries(['shield','heal','strike'].map(id => [id, { evidenceId: id, earnedAt: 1, targetId: 'E1' }])) } });
    await page.evaluate(async () => {
        const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
        const { ProblemDatabase } = await import('/src/systems/ProblemDatabase.ts');
        const state = GameStateManager.getInstance();
        state.loadSlot(0);
        const data = state.getMasteryData()!, db = ProblemDatabase.getInstance();
        data.selectedStartBand = 'E'; data.bands.E.state = 'training';
        Object.assign(data.subAtoms.E2, { state: 'secure', successfulSolves: 60, examBestMedal: 'gold' });
        for (const form of ['result_unknown', 'missing_part'] as const) {
            const p = db.getProblemsForForm('E2', form)[0];
            data.problemRecords[p.key] = { problemKey: p.key, subAtomId: 'E2', form, attempts: Array.from({ length: 10 }, () => ({
                sequenceIndex: ++data.globalSolveSequence, timestamp: Date.now() + data.globalSolveSequence,
                correct: true, responseTimeMs: 2200, context: 'battle' as const,
            })) };
        }
        state.save();
        (window as any).__LITTLE_MATH_GAME__.scene.keys.MenuScene.scene.start('SilverpondGuildMockScene');
    });
    const guild = 'SilverpondGuildMockScene';
    await waitForScene(page, guild); await tapNamed(page, 'catacombDoorway');
    await tapNamed(page, 'catacombEnter'); await waitForScene(page, 'CatacombTrialScene');
    expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.args.subAtomId)).toBe('E2');
    for (let i = 0; i < 10; i++) await solve(page, i !== 0 && i !== 7);
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.resultShown);
    await tapNamed(page, 'catacombPrimary'); await waitForScene(page, guild);
    await expect.poll(() => foxPanel(page)).toMatchObject({ slot: 0, target: 'E2', choices: [], labels: { foxPreviousAttack: '10 →', foxAttackPower: '11' } });
    await page.screenshot({ path: 'artifacts/observatory-review/fox-earned-attack.png' });
    await tapNamed(page, 'catacombProgressClose'); await tapNamed(page, 'catacombDoorway'); await tapNamed(page, 'catacombJourney');
    expect((await foxPanel(page))?.labels.foxPreviousAttack).toBeUndefined();
    expect((await foxPanel(page))?.labels.foxAttackPower).toBe('11');
    await page.evaluate(() => sessionStorage.setItem('lma-e2e-preserve-saves', 'true'));
    await page.reload(); await waitForScene(page, 'MenuScene');
    const slot = await page.evaluate(() => JSON.parse(localStorage.getItem('littleMathAdventure_slot_0')!));
    expect(slot.player.catacombFoxBonus).toBe(5);
    expect(slot.mathStats.masteryData.subAtoms.E2.fluencyChallengeResult).toBe('pass');
});

for (const renderer of ['canvas', 'webgl']) test('planet, mirror, star gifts and first rescue in ' + renderer, async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await openModule(page, renderer);
    await page.evaluate(() => { (window as any).__LITTLE_MATH_GAME__.sound.mute = true; });
    await page.screenshot({ path: 'artifacts/observatory-review/' + renderer + '-tablet.png' });
    await tapNamed(page, 'observatoryPauseButton');
    const time = () => page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.round.batch.elapsedMs);
    const paused = await time();
    await page.waitForTimeout(230);
    expect(await time()).toBe(paused);
    await tapNamed(page, 'observatoryPauseButton');
    for (let i = 0; i < 10; i++) {
        await solve(page, i !== 1 && i !== 4);
        if (i === 2) {
            await waitForQuestion(page);
            await page.screenshot({ path: 'artifacts/observatory-review/' + renderer + '-progress.png' });
        }
    }
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.resultShown, undefined, { timeout: 30_000 });
    const state = await page.evaluate(() => {
        const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene;
        return { score: s.round.batch.correctCount, passed: s.round.batch.passed,
            saved: JSON.parse(localStorage.getItem('littleMathAdventure_slot_0')!).player };
    });
    expect(state).toMatchObject({ score: 8, passed: true, saved: { catacombFoxBonus: 0, unlockedPets: ['catacomb_creature_A'] } });
    const verdict = await page.evaluate(() => {
        const panel = (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.children.getByName('catacombTrialPanel');
        const banner = panel.getByName('observatoryOutcomeBanner');
        return [panel.getData('outcome'), banner.getByName('observatoryResultTitle').text, !!banner.getByName('observatoryWinSeal')];
    });
    expect(verdict).toEqual(['won', 'Výhra!', true]);
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.children
        .getByName('catacombTrialPanel').getByName('observatoryOutcomeBanner').alpha === 1);
    await page.screenshot({ path: 'artifacts/observatory-review/' + renderer + '-reward.png' });
    await tapNamed(page, 'catacombPrimary');
    await waitForScene(page, 'GuildScene');
    await expect.poll(() => foxPanel(page)).toMatchObject({ slot: 0, target: 'A1', labels: { foxAttackPower: '6', foxRescued: 'U Pythie' } });
    await tapNamed(page, 'catacombProgressClose');
    expect(await foxPanel(page)).toBeNull();
});

test('fluency allows two mistakes and stops on the third without marking the rest wrong', async ({ page }) => {
    await openModule(page, 'canvas', 'A1', 'fluency_challenge');
    await solve(page, false);
    await solve(page, false);
    await solve(page, true);
    await solve(page, false);
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.resultShown);
    const result = await page.evaluate(() => {
        const s = (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene;
        return {
            outcome: s.children.getByName('catacombTrialPanel').getData('outcome'),
            answers: s.round.batch.answers.map((a: {correct: boolean}) => a.correct),
            offered: s.round.board.getActiveProblemSnapshot(), expired: s.round.batch.expired,
            pets: JSON.parse(localStorage.getItem('littleMathAdventure_slot_0')!).player.unlockedPets,
        };
    });
    expect(result).toEqual({ outcome: 'lost', answers: [false, false, true, false], offered: null, expired: false, pets: [] });
    await tapNamed(page, 'catacombPrimary');
    await waitForQuestion(page);
    expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.round.batch.answers.length)).toBe(0);
    for (let i = 0; i < 3; i++) await solve(page, false);
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.resultShown);
    await tapNamed(page, 'catacombSecondary');
    await waitForScene(page, 'GuildScene');
    expect(await foxPanel(page)).toBeNull();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('littleMathAdventure_slot_0')!).player.unlockedPets)).toEqual([]);
});

test('an expired whole series can be retried without a reward', async ({ page }) => {
    await openModule(page);
    await solve(page);
    await waitForQuestion(page);
    await page.evaluate(() => {
        const batch = (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.round.batch;
        batch.now = () => performance.now() + batch.rules.budgetMs;
    });
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.resultShown, undefined, { timeout: 30_000 });
    const report = await page.evaluate(() => {
        const round = (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.round;
        return [round.batch.answers.length, round.batch.passed, JSON.parse(localStorage.getItem('littleMathAdventure_slot_0')!).player.unlockedPets];
    });
    expect(report).toEqual([1, false, []]);
    const verdict = await page.evaluate(() => {
        const panel = (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.children.getByName('catacombTrialPanel');
        const banner = panel.getByName('observatoryOutcomeBanner');
        return [panel.getData('outcome'), banner.getByName('observatoryResultTitle').text, !!banner.getByName('observatoryLossSeal')];
    });
    expect(verdict).toEqual(['lost', 'Nevyšlo to', true]);
    await page.waitForFunction(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.children
        .getByName('catacombTrialPanel').getByName('observatoryOutcomeBanner').alpha === 1);
    await page.screenshot({ path: 'artifacts/observatory-review/timeout-outcome.png' });
    await tapNamed(page, 'catacombPrimary');
    await waitForQuestion(page);
    expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.round.batch.answers.length)).toBe(0);
});

const timedTrials = [
    { target: 'A1', examType: 'fluency_challenge', forms: ['standard', 'missingPart'] },
    { target: 'E3', examType: 'fluency_challenge', forms: ['threeOperands', 'expressionVsNumber'] },
    { target: 'E1', examType: 'mastery_challenge', forms: ['standard', 'missingPart', 'expressionVsNumber', 'expressionVsExpression'] },
    { target: 'comparison_symbols', examType: 'fluency_challenge', forms: ['standard', 'expressionVsNumber'] },
] as const;

for (const { target, examType, forms } of timedTrials) test('the frozen planet budget follows the dealt forms in ' + target, async ({ page }, info) => {
    await openModule(page, 'webgl', target, examType);
    const entry = await page.evaluate(async ({ target, examType }) => {
        const { getThresholdsForSubAtom } = await import('/src/systems/MasteryThresholds.ts');
        const { formatMathProblem, getComparisonExpressions } = await import('/src/utils/formatMathProblem.ts');
        const round = (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.round;
        const thresholds = getThresholdsForSubAtom(target === 'comparison_symbols' ? 'A3' : target);
        const baseMs = examType === 'fluency_challenge' ? thresholds.fluentRT : thresholds.masteryRT;
        const questions = (round.questions as MathProblem[]).map(problem => {
            const sides = getComparisonExpressions(problem);
            const prompt = formatMathProblem(problem, 'question');
            // Inspect the operands the board presents, independently of the timer's form classifier.
            if (sides) {
                const expressions = [sides.left, sides.right].filter(side => /[+×−-]/.test(side)).length;
                const form = expressions === 2 ? 'expressionVsExpression' : expressions === 1 ? 'expressionVsNumber' : 'standard';
                return { prompt, form } as const;
            }
            const left = prompt.split(' = ')[0];
            const form = left.includes('?') ? 'missingPart' : left.split(' ').length === 5 ? 'threeOperands' : 'standard';
            return { prompt, form } as const;
        });
        return { rules: round.batch.rules, baseMs, questions };
    }, { target, examType });
    const { questions, baseMs } = entry;
    expect(new Set(questions.map(q => q.form))).toEqual(new Set(forms));
    const workload = questions.reduce((sum, { form }) => sum + speed.trial.timeWeights[form], 0);
    const expectedMs = Math.round(baseMs * workload * (questions.length + 1) / questions.length);
    expect(entry.rules.paceMs).toBe(baseMs);
    expect(entry.rules.total).toBe(questions.length);
    expect(entry.rules.budgetMs).toBe(expectedMs);
    await solve(page);
    await waitForQuestion(page);
    expect(await page.evaluate(() => (window as any).__LITTLE_MATH_GAME__.scene.keys.CatacombTrialScene.round.batch.rules.budgetMs)).toBe(expectedMs);
    await info.attach('dealt-forms-and-budget', { body: JSON.stringify({ target, ...entry }), contentType: 'application/json' });
    await tapNamed(page, 'observatoryPauseButton');
    await tapNamed(page, 'observatoryExitButton');
    await waitForScene(page, 'GuildScene');
});
