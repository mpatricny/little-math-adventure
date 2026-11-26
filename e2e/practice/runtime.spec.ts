import { test, expect } from 'playwright/test';

test('real battle generators respect the selected child and preserve power, chapter introductions and progression', async ({ page }) => {
    // A fresh browser context and an empty harness never load or sync family profiles.
    await page.route('**/__practice_test__', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Practice runtime test</title>' }));
    await page.route('**/__dev-saves/**', route => route.abort());
    await page.route('**/api/**', route => route.abort());
    await page.goto('/__practice_test__');
    const result = await page.evaluate(async () => {
        const { GameStateManager } = await import('/src/systems/GameStateManager.ts');
        const { MasterySystem } = await import('/src/systems/MasterySystem.ts');
        const { MathEngine } = await import('/src/systems/MathEngine.ts');
        const { PracticeSystem } = await import('/src/systems/PracticeSystem.ts');
        const { BattleScene } = await import('/src/scenes/BattleScene.ts');
        const { createInitialComparisonChapterState } = await import('/src/systems/ComparisonLearningSystem.ts');
        const { CoopSessionManager } = await import('/src/systems/CoopSessionManager.ts');
        const game = GameStateManager.getInstance();
        const setup = (slot: number) => {
            game.reset('girl_knight', `Isolated practice ${slot}`, slot);
            const data = game.getMasteryData();
            data.comparisonChapter = createInitialComparisonChapterState('complete');
            data.subAtoms.A1.state = 'secure'; data.subAtoms.A2.state = 'secure';
            data.bands.B.state = 'training'; data.subAtoms.B1.state = 'training';
            game.getPlayer().attack = 8; game.getPlayer().equippedWeapon = 'practice-test-sword'; game.save();
        };
        setup(0); setup(1);
        const coop = CoopSessionManager.getInstance(); coop.startSession(0, 1);
        PracticeSystem.setMode('practice', 'A2', 'A'); PracticeSystem.setMode('progress', undefined, 'B');
        const sword = { id: 'practice-test-sword', type: 'weapon', mathProblemType: 'addition', damageMultiplier: 2 };
        const pet = { damageMultiplier: 3 };
        const mastery = MasterySystem.getInstance();
        const math = new MathEngine({ get: () => undefined, set: () => undefined });
        const shown: Array<{ problems: any[]; intro?: string }> = [];
        const scene = Object.create(BattleScene.prototype);
        Object.assign(scene, { gameState: game, mathEngine: math, mockMode: false, isCoopMode: true,
            coopSession: coop, isBoss: false, battleState: {},
            cache: { json: { get: () => [sword] } },
            mathBoard: { show: (problems: any[], options?: any) => shown.push({ problems, intro: options?.introduction }) },
            getCoopSafeMasterySystem: () => {
                mastery.setActiveData(coop.getActivePlayer() === 'A' ? coop.getPlayerAMasteryData() : coop.getPlayerBMasteryData());
                math.reloadStats(); return mastery;
            },
        });
        const batch = () => {
            scene.showAttackProblems();
            return { attack: shown.at(-1)!, sword: scene.generateSwordProblem(sword),
                shield: scene.generateBlockProblemsFromPool(1), pet: scene.generatePetProblemFromPool(pet) };
        };
        coop.activatePlayerA(); const a = batch();
        const simpleSubtraction = Array.from({length: 12}, batch).every(round =>
            [...round.attack.problems, round.sword, ...round.shield, round.pet].every(p =>
                p.masteryKey.startsWith('A2:') && p.operator === '-' && p.operand3 === undefined
                && !p.problemType?.includes('comparison') && p.choices.every((value: number) => value >= 0 && value <= 5)));
        // Boss presentation cannot silently cancel an explicit practice choice.
        scene.isBoss = true; scene.currentBossPhase = 0; scene.bossPhases = [{ mathType: 'addition', mathDifficulty: 10 }];
        scene.showAttackProblems(); const bossKeys = shown.at(-1)!.problems.map(p => p.masteryKey);
        scene.isBoss = false;
        coop.activatePlayerB(); const b = batch();
        coop.activatePlayerA(); PracticeSystem.setMode('practice', 'comparison_symbols', 'A');
        const completedComparison = batch();
        coop.getPlayerAMasteryData()!.comparisonChapter = createInitialComparisonChapterState('training');
        const introduction = batch();
        PracticeSystem.setMode('practice', 'A2', 'A'); const arithmeticDuringChapter = batch();
        const summarize = (set: ReturnType<typeof batch>) => ({
            keys: [...set.attack.problems, set.sword, ...set.shield, set.pet].map(p => p.masteryKey),
            sources: [set.sword.source, set.pet.source], power: [set.sword.damageMultiplier, set.pet.damageMultiplier],
            attackCount: set.attack.problems.length, shieldCount: set.shield.length, intro: set.attack.intro,
            comparisons: [...set.attack.problems, set.sword, ...set.shield, set.pet].map(p => p.comparisonMeta?.representation),
        });
        return { a: summarize(a), b: summarize(b), bossKeys, simpleSubtraction, completedComparison: summarize(completedComparison),
            introduction: summarize(introduction), arithmeticDuringChapter: summarize(arithmeticDuringChapter),
            readyFlags: PracticeSystem.getOverview('A')?.recommendations.map(t => ({ ready: t.readiness.ready, percentage: t.readiness.percentage })) };
    });
    expect(result.a.keys.every(key => key?.startsWith('A2:'))).toBe(true);
    expect(result.simpleSubtraction).toBe(true);
    expect(result.b.keys.every(key => key?.startsWith('B1:'))).toBe(true);
    expect(result.bossKeys.every(key => key?.startsWith('A2:'))).toBe(true);
    expect(result.a.sources).toEqual(['sword', 'pet']); expect(result.a.power).toEqual([2, 3]);
    expect(result.a.attackCount).toBe(result.b.attackCount); expect(result.a.shieldCount).toBe(1);
    expect(result.completedComparison.comparisons.every(Boolean)).toBe(true);
    expect(result.completedComparison.intro).toBeUndefined();
    expect(result.introduction.intro).toBe('size_crocodile');
    expect(result.introduction.comparisons.every(value => value === 'size')).toBe(true);
    expect(result.arithmeticDuringChapter.keys.every(key => key?.startsWith('A2:'))).toBe(true);
    expect(result.arithmeticDuringChapter.intro).toBeUndefined();
});
