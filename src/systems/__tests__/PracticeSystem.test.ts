import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MasteryData } from '../../types';
import { createInitialComparisonChapterState } from '../ComparisonLearningSystem';
import { getCatacombReadiness } from '../PracticeProgress';
import { awardFoxRune } from '../FoxAbilitySystem';

vi.mock('phaser', () => ({ default: {
    Math: { Between: (min: number) => min }, Utils: { String: { UUID: () => crypto.randomUUID() } },
} }));

let GameStateManager: typeof import('../GameStateManager').GameStateManager;
let CoopSessionManager: typeof import('../CoopSessionManager').CoopSessionManager;
let MasterySystem: typeof import('../MasterySystem').MasterySystem;
let PracticeSystem: typeof import('../PracticeSystem').PracticeSystem;
let MathEngine: typeof import('../MathEngine').MathEngine;
let SaveSystem: typeof import('../SaveSystem').SaveSystem;

beforeEach(async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
        getItem: (k: string) => storage.get(k) ?? null,
        setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k),
        clear: () => storage.clear(), key: (i: number) => [...storage.keys()][i] ?? null,
        get length() { return storage.size; },
    });
    vi.stubGlobal('navigator', { userAgent: 'vitest', maxTouchPoints: 0 });
    vi.stubGlobal('window', globalThis); vi.stubGlobal('document', { documentElement: {} });
    ({ GameStateManager } = await import('../GameStateManager'));
    ({ CoopSessionManager } = await import('../CoopSessionManager'));
    ({ MasterySystem } = await import('../MasterySystem'));
    ({ PracticeSystem } = await import('../PracticeSystem'));
    ({ MathEngine } = await import('../MathEngine'));
    ({ SaveSystem } = await import('../SaveSystem'));
    MasterySystem.destroyInstance(); (GameStateManager as unknown as { instance: unknown }).instance = undefined;
});
afterEach(() => {
    MasterySystem.getInstance().setActiveData(null); CoopSessionManager.destroyInstance(); MasterySystem.destroyInstance();
    (GameStateManager as unknown as { instance: unknown }).instance = undefined;
    vi.unstubAllGlobals();
});

function prepare(slot = 0): MasteryData {
    const game = GameStateManager.getInstance(); game.reset('girl_knight', `Practice ${slot}`, slot);
    const data = game.getMasteryData();
    data.comparisonChapter = createInitialComparisonChapterState('complete');
    data.subAtoms.A1.state = 'secure'; data.subAtoms.A2.state = 'secure';
    data.bands.B.state = 'training'; data.subAtoms.B1.state = 'training';
    data.currentPool = ['B1:6+1:result_unknown']; data.currentPoolIndex = 0;
    game.save(); return data;
}
function engine() {
    return new MathEngine({ get: () => undefined, set: () => undefined } as unknown as Phaser.Data.DataManager);
}

describe('guild notices for the displayed activity', () => {
    it('ignores an out-of-placement catacomb exam and remembers the real teacher offer across visits and reload', async () => {
        const { acknowledgeGuildOffers, hasGuildNews } = await import('../GuildNotices');
        const game = GameStateManager.getInstance();
        const data = prepare();
        data.selectedStartBand = 'E';
        data.bands.E.state = 'training';
        data.subAtoms.E1.state = 'training';
        data.practice = { mode: 'progress', introductionSeen: true };
        game.save();
        const candidates = vi.spyOn(MasterySystem.getInstance(), 'getAvailableExams').mockReturnValue([
            { type: 'fluency_challenge', targetId: 'comparison_symbols', label: 'Porovnávání' },
        ]);
        expect(hasGuildNews()).toBe(false);
        candidates.mockReturnValue([{ type: 'sub_atom', targetId: 'E1', label: 'Sčítání' }]);
        expect(hasGuildNews()).toBe(true);
        acknowledgeGuildOffers();
        game.reload();
        expect(hasGuildNews()).toBe(false);
        const save = vi.spyOn(game, 'save');
        acknowledgeGuildOffers();
        expect(save).not.toHaveBeenCalled();
        candidates.mockReturnValue([{ type: 'sub_atom', targetId: 'E2', label: 'Odčítání' }]);
        expect(hasGuildNews()).toBe(true);
    });

    it('ignores the disabled co-op teacher and acknowledges a partner’s fox lesson only for its owner', async () => {
        const { acknowledgeGuildOffers, hasGuildNews } = await import('../GuildNotices');
        const game = GameStateManager.getInstance();
        for (const slot of [0, 1]) {
            const data = prepare(slot);
            data.practice = { mode: 'progress', introductionSeen: true };
            if (slot === 1) {
                data.subAtoms.A1.state = 'mastery';
                game.getPlayer().catacombFoxBonus = 1;
                game.getPlayer().unlockedPets = ['catacomb_creature_A'];
            }
            game.save();
        }
        const coop = CoopSessionManager.getInstance();
        expect(coop.startSession(0, 1)).toBe(true);
        vi.spyOn(MasterySystem.getInstance(), 'getAvailableExams').mockReturnValue([{ type: 'sub_atom', targetId: 'B1', label: 'Sčítání' }]);
        expect(hasGuildNews()).toBe(true);
        acknowledgeGuildOffers();
        expect(hasGuildNews()).toBe(false);
        expect(coop.getActivePlayer()).toBe('A');
        expect(SaveSystem.readSnapshot(0)?.mathStats.masteryData?.seenGuildOffers).toBeUndefined();
        expect(SaveSystem.readSnapshot(1)?.mathStats.masteryData?.seenGuildOffers).toEqual(['lesson:shield']);
    });
});

describe('practice runtime and save integration', () => {
    it('uses each child’s Legend and explicit catacomb choice regardless of whose profile is active', () => {
        prepare(0);
        const game = GameStateManager.getInstance(), a = game.getPlayer();
        awardFoxRune(a, 'A1', 1, { evidenceId: 'a-first', earnedAt: 1 });
        awardFoxRune(a, 'A1', 2, { evidenceId: 'a-second', earnedAt: 2 });
        game.save();
        prepare(1);
        const coop = CoopSessionManager.getInstance();
        expect(coop.startSession(0, 1)).toBe(true);
        expect(PracticeSystem.setMode('practice', undefined, 'A', 'guild')).toBe(true);
        expect(PracticeSystem.setMode('practice', undefined, 'B', 'guild')).toBe(true);
        expect(PracticeSystem.getOverview('A')?.practiceTargetId).toBe('A2');
        expect(PracticeSystem.getOverview('B')?.practiceTargetId).toBe('A1');
        const ms = MasterySystem.getInstance(), math = engine();
        for (const [owner, target] of [[coop.getPlayerAMasteryData(), 'A2'], [coop.getPlayerBMasteryData(), 'A1']] as const) {
            ms.setActiveData(owner);
            expect(ms.drawPracticeBattleProblems(1, k => math.generateProblemFromKey(k))?.[0].masteryKey?.split(':')[0]).toBe(target);
        }
        ms.setActiveData(null);
        PracticeSystem.setMode('progress', undefined, 'B', 'battle');
        PracticeSystem.setTarget('B1', 'B');
        expect(PracticeSystem.getOverview('B')?.selection).toEqual({ mode:'practice', targetId:'B1' });
        expect(coop.getPlayerBMasteryData()?.practice?.mode).toBe('progress');
        coop.endSession();
        expect(coop.startSession(0, 1)).toBe(true);
        expect(PracticeSystem.getOverview('A')?.practiceTargetId).toBe('A2');
        expect(PracticeSystem.getOverview('B')?.practiceTargetId).toBe('B1');
        coop.endSession();
    });
    it('persists a solo choice, generates real earlier-skill problems and resumes progression after restart', () => {
        prepare(); const game = GameStateManager.getInstance(); const math = engine();
        const before = JSON.stringify(game.getMasteryData().subAtoms);
        expect(PracticeSystem.setMode('practice', 'A2')).toBe(true);
        game.reload();
        expect(PracticeSystem.getOverview()?.selection).toEqual({ mode: 'practice', targetId: 'A2' });
        const problems = MasterySystem.getInstance().drawPracticeBattleProblems(3, key => math.generateProblemFromKey(key));
        expect(problems).toHaveLength(3);
        expect(problems!.every(p => p.masteryKey?.startsWith('A2:'))).toBe(true);
        expect(JSON.stringify(game.getMasteryData().subAtoms)).toBe(before);
        PracticeSystem.setMode('progress'); game.reload();
        expect(MasterySystem.getInstance().drawPracticeBattleProblems(3, key => math.generateProblemFromKey(key))).toBeNull();
        expect(MasterySystem.getInstance().drawFromPool(1)).toEqual(['B1:6+1:result_unknown']);
    });

    it('keeps both co-op choices independent and persists the inactive child without changing the active player', () => {
        prepare(0); prepare(1); const coop = CoopSessionManager.getInstance();
        expect(coop.startSession(0, 1)).toBe(true); coop.activatePlayerB();
        const before = JSON.stringify({ a: coop.getPlayerAMasteryData(), b: coop.getPlayerBMasteryData() });
        PracticeSystem.getOverview('A'); PracticeSystem.getOverview('B');
        expect(JSON.stringify({ a: coop.getPlayerAMasteryData(), b: coop.getPlayerBMasteryData() })).toBe(before);
        expect(coop.getActivePlayer()).toBe('B');
        expect(PracticeSystem.setMode('practice', 'A2', 'A')).toBe(true);
        expect(PracticeSystem.setMode('progress', undefined, 'B')).toBe(true);
        expect(coop.getActivePlayer()).toBe('B');
        expect(GameStateManager.getInstance().getActiveSlotIndex()).toBe(1);
        const mastery = MasterySystem.getInstance(), math = engine();
        mastery.setActiveData(coop.getPlayerAMasteryData());
        expect(mastery.drawPracticeBattleProblems(4, key => math.generateProblemFromKey(key))?.every(p => p.masteryKey?.startsWith('A2:'))).toBe(true);
        mastery.setActiveData(coop.getPlayerBMasteryData());
        expect(mastery.drawPracticeBattleProblems(4, key => math.generateProblemFromKey(key))).toBeNull();
        mastery.setActiveData(null); coop.endSession();
        expect(SaveSystem.readSnapshot(0)?.mathStats.masteryData?.practice).toMatchObject({ mode: 'practice', targetId: 'A2' });
        expect(SaveSystem.readSnapshot(1)?.mathStats.masteryData?.practice).toMatchObject({ mode: 'progress' });
        expect(coop.startSession(0, 1)).toBe(true);
        expect(PracticeSystem.getOverview('A')?.selection).toEqual({ mode: 'practice', targetId: 'A2' });
        expect(PracticeSystem.getOverview('B')?.selection).toEqual({ mode: 'progress' });
    });

    it('rejects locked targets and invalid owners, but accepts a mastered module without awarding progress', () => {
        prepare(); const game = GameStateManager.getInstance(); game.getMasteryData().subAtoms.A1.state = 'mastery';
        const before = JSON.stringify(game.getMathStats());
        expect(PracticeSystem.setMode('practice', 'E4')).toBe(false);
        expect(PracticeSystem.setMode('practice', 'A2', 'B')).toBe(false);
        expect(JSON.stringify(game.getMathStats())).toBe(before);
        const earned = JSON.stringify(game.getMasteryData().subAtoms);
        const player = JSON.stringify(game.getPlayer());
        expect(PracticeSystem.setMode('practice', 'A1')).toBe(true);
        expect(JSON.stringify(game.getMasteryData().subAtoms)).toBe(earned);
        expect(JSON.stringify(game.getPlayer())).toBe(player);
    });

    it('shares exact runtime eligibility with the UI and counts every practice answer once', () => {
        prepare(); const mastery = MasterySystem.getInstance(), math = engine(), data = GameStateManager.getInstance().getMasteryData();
        PracticeSystem.setMode('practice', 'A1');
        for (let batch = 0; batch < 10; batch++) {
            for (const problem of mastery.drawPracticeBattleProblems(5, key => math.generateProblemFromKey(key))!) {
                mastery.recordSolve(problem.masteryKey!, true, 4000, 'battle');
            }
        }
        expect(data.subAtoms.A1.successfulSolves).toBe(50);
        expect(data.subAtoms.B1.successfulSolves).toBe(0);
        expect(mastery.checkFluencyEligibility('A1')).toBe(true);
        expect(mastery.checkFluencyEligibility('A1')).toBe(getCatacombReadiness(data, 'A1', 'fluency_challenge').ready);
        data.subAtoms.A1.state = 'fluent';
        expect(mastery.checkMasteryChallengeEligibility('A1')).toBe(true);
        expect(PracticeSystem.getOverview()?.targets.find(t => t.targetId === 'A1')?.readiness.ready).toBe(true);
    });

    it('preserves chapter demonstrations and later offers independent comparison practice without rerunning an exam', () => {
        prepare(); const data = GameStateManager.getInstance().getMasteryData();
        data.comparisonChapter = createInitialComparisonChapterState('training');
        PracticeSystem.setMode('practice', 'comparison_symbols');
        const mastery = MasterySystem.getInstance();
        const first = mastery.drawPracticeBattleProblems(3, () => { throw new Error('Chapter is not an arithmetic key'); })!;
        expect(first.every(p => p.comparisonMeta?.stage === 'size_crocodile')).toBe(true);
        expect(mastery.needsComparisonStageIntro()).toBe(true);
        data.comparisonChapter = createInitialComparisonChapterState('complete');
        const review = mastery.drawPracticeBattleProblems(4, () => null)!;
        expect(new Set(review.map(p => p.comparisonMeta?.representation))).toEqual(new Set(['number', 'expression']));
        expect(review.every(p => !p.comparisonMeta?.exam && !p.comparisonMeta?.diagnosticMode)).toBe(true);
        expect(data.comparisonChapter.attempts).toHaveLength(0);
        expect(mastery.needsComparisonStageIntro()).toBe(false);
    });

    it('keeps the chosen practice module after mastery and saves the completed introduction per child', () => {
        const data = prepare(); PracticeSystem.setMode('practice', 'A2');
        for (const atom of Object.values(data.subAtoms)) if (atom.state !== 'locked') atom.state = 'mastery';
        data.comparisonChapter!.masteryChallengeResult = 'pass';
        const math = engine();
        const problems = MasterySystem.getInstance().drawPracticeBattleProblems(2, key => math.generateProblemFromKey(key));
        expect(problems).toHaveLength(2);
        expect(problems!.every(problem => problem.masteryKey?.startsWith('A2:'))).toBe(true);
        expect(data.practice?.mode).toBe('practice');
        expect(PracticeSystem.getOverview()).toMatchObject({ available: true, allMastered: true, introductionSeen: false });
        PracticeSystem.markIntroductionSeen(); GameStateManager.getInstance().reload();
        expect(PracticeSystem.getOverview()).toMatchObject({ introductionSeen: true,
            introductionAvailable: false, selection: { mode: 'practice', targetId: 'A2' } });
    });

    it('does not repeat the attack comparison as the sword question before answers are recorded', () => {
        prepare(); PracticeSystem.setMode('practice', 'comparison_symbols');
        const mastery = MasterySystem.getInstance();
        const attack = mastery.drawPracticeBattleProblems(3, () => null)!;
        const sword = mastery.drawPracticeBattleProblems(1, () => null)!;
        expect(new Set([...attack, ...sword].map(p => p.id)).size).toBe(4);
        PracticeSystem.setMode('practice', 'comparison_symbols'); // selecting the same card preserves the cursor
        GameStateManager.getInstance().reload();
        const next = mastery.drawPracticeBattleProblems(1, () => null)!;
        expect([...attack, ...sword].some(p => p.id === next[0].id)).toBe(false);
        expect(GameStateManager.getInstance().getMasteryData().comparisonChapter!.attempts).toHaveLength(0);
    });
});
