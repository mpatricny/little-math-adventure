import { describe, expect, it, vi } from 'vitest';
import type { MasteryData, MathProblem, MathStats, PlayerState, ProblemForm, SubAtomId } from '../../types';
import { MasteryMigration } from '../MasteryMigration';
import { createInitialComparisonChapterState, generateComparisonReviewProblems, recordComparisonAttempt } from '../ComparisonLearningSystem';
import { retainLearningHistory } from '../LearningHistory';
import { PersonalBattleBonuses, PERSONAL_BONUS_CONFIG, type BattleAnswerEvidence } from '../PersonalBattleBonuses';
import { resolveDamageAfterDefense } from '../CombatDamageSystem';

function fresh(practice = false): MasteryData {
    const data = MasteryMigration.migrateFromLevel(1, { problemStats: {} } as MathStats);
    data.comparisonChapter = createInitialComparisonChapterState('complete');
    data.subAtoms.A1.state = 'secure';
    if (practice) data.practice = { mode: 'practice', targetId: 'A1' };
    return data;
}
function history(data: MasteryData, times: number[], module: SubAtomId = 'A1', form: ProblemForm = 'result_unknown') {
    const key = `${module}:2+2:${form}`;
    const record = data.problemRecords[key] ??= { problemKey: key, subAtomId: module, form, attempts: [] };
    times.forEach(ms => record.attempts.push({ timestamp: ++data.globalSolveSequence, sequenceIndex: data.globalSolveSequence,
        correct: true, responseTimeMs: ms, context: 'battle' }));
    return record;
}
function evidence(overrides: Partial<BattleAnswerEvidence> = {}): BattleAnswerEvidence {
    const problem: MathProblem = { id: 'sample', operand1: 2, operand2: 2, operator: '+', answer: 4,
        choices: [3, 4, 5], showVisualHint: false, hintType: 'none', damageMultiplier: 4,
        masteryKey: 'A1:2+2:result_unknown' };
    return { problem, correct: true, responseTimeMs: 1800, assisted: false, defense: false, ...overrides };
}
function fight(data = fresh(true)) {
    history(data, Array(10).fill(2000));
    return new PersonalBattleBonuses(data);
}
function solve(session: PersonalBattleBonuses, n: number, extra: Partial<BattleAnswerEvidence> = {}) {
    return Array.from({ length: n }, () => session.answer(evidence(extra)));
}

describe('personal battle bonuses', () => {
    it('uses the arithmetic mean of the latest ten, frozen before this battle', () => {
        const data = fresh(); history(data, [100, 100, ...Array(9).fill(1000), 10000]);
        const before = JSON.stringify(data); const session = new PersonalBattleBonuses(data);
        expect(JSON.stringify(data)).toBe(before);
        expect(session.answer(evidence())).toMatchObject({ baselineMs: 1900, damage: 1 });
        history(data, Array(15).fill(500));
        expect(session.answer(evidence())).toMatchObject({ baselineMs: 1900, damage: 1 });
    });
    it('requires five valid independent samples and never falls back to a fixed time', () => {
        const data = fresh(); const record = history(data, [2000, 2000, 2000, 2000, 0, NaN, PERSONAL_BONUS_CONFIG.maximumReferenceTimeMs + 1]);
        history(data, [2000, 2000, 2000, 2000]).attempts.slice(-4).forEach((a, i) => {
            if (i === 0) a.correct = false;
            if (i === 1) a.assisted = true;
            if (i === 2) a.synthetic = true;
            if (i === 3) a.context = 'underwater_bell';
        });
        expect(new PersonalBattleBonuses(data).answer(evidence({ responseTimeMs: 1 })).damage).toBe(0);
        record.attempts.push({ timestamp: 100, sequenceIndex: 100, responseTimeMs: 2000, correct: true, context: 'battle' });
        expect(new PersonalBattleBonuses(data).answer(evidence()).damage).toBe(1);
    });
    it('keeps module, form and child baselines separate and accepts recovered evidence', () => {
        const a = fresh(), b = fresh(); history(a, Array(5).fill(2000)); history(b, Array(5).fill(1000));
        history(a, Array(10).fill(4000), 'A1', 'missing_part'); history(a, Array(10).fill(9000), 'B1');
        retainLearningHistory(a); a.problemRecords = {};
        expect(new PersonalBattleBonuses(JSON.parse(JSON.stringify(a))).answer(evidence())).toMatchObject({ baselineMs: 2000, damage: 1 });
        expect(new PersonalBattleBonuses(b).answer(evidence()).damage).toBe(0);
    });
    it('adds exactly one to player, sword and pet attack power, before enemy defense once', () => {
        const session = fight();
        const powers = (['player', 'sword', 'pet'] as const).map(source => {
            const answer = evidence(); answer.problem.source = source;
            return answer.problem.damageMultiplier! + session.answer(answer).damage;
        });
        expect(powers).toEqual([5, 5, 5]);
        expect(resolveDamageAfterDefense(powers.reduce((a, b) => a + b, 0), 3).damage).toBe(12);
    });
    it('retains a recovered uncertain-clock flag when an older live copy has no observation', () => {
        const data = fresh(); history(data, Array(5).fill(2000));
        retainLearningHistory(data);
        data.learningHistory!.attempts.forEach(attempt => { attempt.clockUncertain = true; });
        expect(new PersonalBattleBonuses(data).answer(evidence())).toMatchObject({ baselineMs: null, damage: 0 });
    });
    it.each([
        { correct: false }, { assisted: true }, { defense: true },
        { responseTimeMs: 2000 }, { responseTimeMs: 20000 }, { responseTimeMs: 0 },
        { responseTimeMs: NaN }, { responseTimeMs: -1 },
    ])('never adds attack damage for ineligible answers: %j', extra => {
        expect(fight().answer(evidence(extra)).damage).toBe(0);
    });
    it('separates comparison stages and excludes diagnostic/demo and exam answers', () => {
        const data = fresh();
        const chapter = data.comparisonChapter!;
        const problem = generateComparisonReviewProblems(chapter, 1)[0];
        for (let i = 0; i < 5; i++) recordComparisonAttempt(chapter, problem, true, 2000, false, ++data.globalSolveSequence);
        const session = new PersonalBattleBonuses(data);
        expect(session.answer(evidence({ problem })).damage).toBe(1);
        expect(session.answer(evidence({ problem: { ...problem, comparisonMeta: { ...problem.comparisonMeta!, stage: 'size_crocodile' } } })).damage).toBe(0);
        for (const flag of ['exam', 'diagnosticMode']) expect(session.answer(evidence({
            problem: { ...problem, comparisonMeta: { ...problem.comparisonMeta!, [flag]: true } },
        })).damage).toBe(0);
    });
    it('grants one mana at 10% improvement after five independent answers, only on victory in practice', () => {
        const session = fight(); solve(session, 4);
        expect(session.summary(true).mana).toBe(0);
        solve(session, 1);
        expect(session.summary(true)).toMatchObject({ mana: 1, measuredAnswers: 5, accuracy: 1, targetId: 'A1' });
        expect(session.summary(false).mana).toBe(0);
        const progress = fight(fresh()); solve(progress, 5);
        expect(progress.summary(true).mana).toBe(0);
    });
    it('rewards a slower child improving from 30 to 27 seconds without changing mastery thresholds', () => {
        const data = fresh(true); history(data, Array(10).fill(30000));
        const session = new PersonalBattleBonuses(data);
        expect(solve(session, 5, { responseTimeMs: 27000 }).every(bonus => bonus.damage === 1)).toBe(true);
        expect(session.summary(true).mana).toBe(1);
    });
    it('normalizes each form separately and keeps the selected target frozen', () => {
        const data = fresh(true); history(data, Array(5).fill(2000)); history(data, Array(5).fill(6000), 'A1', 'missing_part');
        const session = new PersonalBattleBonuses(data); data.practice = { mode: 'progress' };
        solve(session, 3);
        const problem = evidence().problem; problem.masteryKey = 'A1:2+2:missing_part';
        solve(session, 2, { problem, responseTimeMs: 5400 });
        expect(session.summary(true).mana).toBe(1);
        expect(session.summary(true).improvement).toBeCloseTo(0.1);
    });
    it('counts wrong and assisted first answers in the accuracy gate, including shield answers', () => {
        for (const extra of [{ correct: false }, { assisted: true }]) {
            const session = fight(); solve(session, 5); solve(session, 1, extra);
            expect(session.summary(true).mana).toBe(0);
            solve(session, 4, { defense: true });
            expect(session.summary(true)).toMatchObject({ mana: 1, accuracy: 0.9 });
        }
    });
    it('does not drop slow answers or invalid clocks to manufacture improvement', () => {
        const slow = fight(); solve(slow, 10, { responseTimeMs: 1000 }); solve(slow, 1, { responseTimeMs: 30000 });
        expect(slow.summary(true).mana).toBe(0);
        const invalid = fight(); solve(invalid, 5); solve(invalid, 1, { responseTimeMs: NaN });
        expect(invalid.summary(true).mana).toBe(0);
        const less = fight(); solve(less, 5, { responseTimeMs: 1801 });
        expect(less.summary(true).mana).toBe(0);
    });
    it('does not count another module toward the selected training reward', () => {
        const session = fight(); const problem = evidence().problem; problem.masteryKey = 'B1:2+2:result_unknown';
        solve(session, 10, { problem }); expect(session.summary(true)).toMatchObject({ mana: 0, measuredAnswers: 0 });
    });
    it('claims once per child and fight, also after a saved receipt is restored', () => {
        const session = fight(); solve(session, 5); const add = vi.fn(); const player = {} as PlayerState;
        expect(session.claim(player, 'fight-1', true, add).mana).toBe(1);
        expect(session.claim(player, 'fight-1', true, add).mana).toBe(0);
        const replay = fight(); solve(replay, 5);
        expect(replay.claim(JSON.parse(JSON.stringify(player)), 'fight-1', true, add).mana).toBe(0);
        const childB = fight(); solve(childB, 5);
        expect(childB.claim({} as PlayerState, 'fight-1', true, add).mana).toBe(1);
        expect(add).toHaveBeenCalledTimes(2);
    });

    it('resumes the original reference, selected target and partial improvement after reload', () => {
        const original = fight(); solve(original, 3);
        const saved = JSON.parse(JSON.stringify(original.exportCheckpoint()));
        const changedHistory = fresh(false); history(changedHistory, Array(10).fill(500));
        const resumed = new PersonalBattleBonuses(changedHistory);
        expect(resumed.restoreCheckpoint(saved)).toBe(true);
        expect(solve(resumed, 2).every(bonus => bonus.baselineMs === 2000 && bonus.damage === 1)).toBe(true);
        expect(resumed.summary(true)).toMatchObject({ mana: 1, targetId: 'A1', measuredAnswers: 5 });
        resumed.claim({} as PlayerState, 'resumed', true, () => undefined);
        const again = fight();
        expect(again.restoreCheckpoint(JSON.parse(JSON.stringify(resumed.exportCheckpoint())))).toBe(true);
        expect(again.claim({} as PlayerState, 'resumed', true, vi.fn()).mana).toBe(0);
    });

    it('preserves invalid clocks and rejects inconsistent checkpoints without changing live state', () => {
        const original = fight(); solve(original, 5); solve(original, 1, { responseTimeMs: NaN });
        const resumed = fight();
        expect(resumed.restoreCheckpoint(JSON.parse(JSON.stringify(original.exportCheckpoint())))).toBe(true);
        expect(resumed.summary(true).mana).toBe(0);
        const before = resumed.exportCheckpoint();
        expect(resumed.restoreCheckpoint({ ...before, independentCorrect: before.answers + 1 })).toBe(false);
        expect(resumed.exportCheckpoint()).toEqual(before);
        const detached = resumed.exportCheckpoint(); detached.ratios.push(.1); detached.baselines[0][1] = 1;
        expect(resumed.exportCheckpoint()).toEqual(before);
    });

    it('freezes training speed across a reload and reports slower or faster times without granting another reward', () => {
        const data = fresh(true);
        history(data, [30000]);
        const session = new PersonalBattleBonuses(data);
        const checkpoint = session.exportCheckpoint();
        history(data, [27000, 27000]);
        const resumed = new PersonalBattleBonuses(data);
        expect(resumed.restoreCheckpoint(checkpoint)).toBe(true);
        const result = resumed.victoryResult(resumed.summary(true), data, {});
        expect(result).toMatchObject({ mana: 0, journey: { targetId: 'A1',
            before: { medianMs: 30000 }, after: { medianMs: 27000, door: 'locked' } } });
        history(data, [35000, 35000, 35000, 35000]);
        expect(result.journey?.after.medianMs).toBe(27000);
        expect(resumed.victoryResult(resumed.summary(true), data, {}).journey?.after.medianMs).toBe(35000);
        const other = new PersonalBattleBonuses(fresh());
        expect(other.victoryResult(other.summary(true), data, {}).journey).toBeUndefined();
    });

    it('shows missing speed honestly for first-time training and checkpoints made before speed snapshots', () => {
        const data = fresh(true);
        const session = new PersonalBattleBonuses(data);
        const checkpoint = session.exportCheckpoint();
        const noisy = history(data, [0, 6000, 2000, 2000, 2000]);
        noisy.attempts[1].synthetic = true;
        noisy.attempts[2].assisted = true;
        noisy.attempts[3].correct = false;
        noisy.attempts[4].context = 'underwater_bell';
        history(data, [3900], 'B1');
        expect(session.victoryResult(session.summary(true), data, {}).journey).toMatchObject({
            before: { medianMs: null }, after: { medianMs: null },
        });
        delete checkpoint.practiceBefore;
        history(data, [6400]);
        const resumed = new PersonalBattleBonuses(data);
        expect(resumed.restoreCheckpoint(checkpoint)).toBe(true);
        const result = resumed.victoryResult(resumed.summary(true), data, {});
        expect(result.journey?.before).toBeUndefined();
        expect(result.journey?.after.medianMs).toBe(6400);
    });
});
