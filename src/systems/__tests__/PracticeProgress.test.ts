import { describe, expect, it } from 'vitest';
import { type MasteryData, type MathStats, type PlayerState, type ProblemForm, type SubAtomId } from '../../types';
import { MasteryMigration } from '../MasteryMigration';
import { createInitialComparisonChapterState, generateComparisonReviewProblems, recordComparisonAttempt } from '../ComparisonLearningSystem';
import { getCatacombReadiness, getOpenPracticeTargets, getPracticeOverview, getPracticeSelection,
    reconcilePracticeSelection, setPracticeSelection } from '../PracticeProgress';
import { drawPracticeProblemKeys } from '../PracticeProblems';
import { ProblemDatabase } from '../ProblemDatabase';
import { awardFoxRune } from '../FoxAbilitySystem';

function fresh(): MasteryData {
    const data = MasteryMigration.migrateFromLevel(1, { problemStats: {} } as MathStats);
    data.comparisonChapter = createInitialComparisonChapterState();
    return data;
}
function evidence(data: MasteryData, id: SubAtomId, count: number, time = 4000,
    forms: ProblemForm[] = ['result_unknown', 'missing_part']): void {
    for (let i = 0; i < count; i++) {
        const form = forms[i % forms.length];
        const key = `${id}:fixture:${form}`;
        const record = data.problemRecords[key] ??= { problemKey: key, subAtomId: id, form, attempts: [] };
        record.attempts.push({ correct: true, responseTimeMs: time, timestamp: ++data.globalSolveSequence,
            sequenceIndex: data.globalSolveSequence, context: 'battle' });
        data.subAtoms[id].successfulSolves++;
    }
}

describe('practice choice and readiness', () => {
    it('remembers the chosen module across Dál, reload and earned mastery', () => {
        let data = fresh(); data.subAtoms.A2.state = 'training';
        setPracticeSelection(data, 'practice', 'A2'); setPracticeSelection(data, 'progress');
        data = JSON.parse(JSON.stringify(data));
        expect(getPracticeOverview(data, 5)).toMatchObject({ selection: { mode: 'progress' }, practiceTargetId: 'A2' });
        expect(setPracticeSelection(data, 'practice')).toBe(true);
        expect(getPracticeSelection(data)).toEqual({ mode: 'practice', targetId: 'A2' });
        setPracticeSelection(data, 'progress'); data.subAtoms.A2.state = 'mastery';
        expect(getPracticeOverview(data, 5).practiceTargetId).toBe('A2');
        setPracticeSelection(data, 'practice');
        expect(getPracticeSelection(data)).toEqual({ mode: 'practice', targetId: 'A2' });
    });
    it('reads old saves as progression without modifying any evidence or scheduling state', () => {
        const data = fresh(); data.currentPool = ['old']; data.retryPool = ['retry'];
        const before = JSON.stringify(data);
        expect(getPracticeOverview(data, 1)).toMatchObject({ selection: { mode: 'progress' }, available: true, introductionAvailable: false });
        expect(JSON.stringify(data)).toBe(before);
    });

    it('limits practice to unlocked skills above placement and below a repair boundary', () => {
        const data = fresh(); data.selectedStartBand = 'B';
        data.bands.B.state = 'training'; data.subAtoms.B1.state = 'secure';
        data.bands.C.state = 'training'; data.subAtoms.C1.state = 'training'; data.requiredBand = 'B';
        data.comparisonChapter = createInitialComparisonChapterState('complete');
        expect(getOpenPracticeTargets(data)).toEqual(['B1']);
        expect(setPracticeSelection(data, 'practice', 'A1')).toBe(false);
        expect(setPracticeSelection(data, 'practice', 'C1')).toBe(false);
        expect(setPracticeSelection(data, 'practice', 'B2')).toBe(false);
        expect(data.practice).toBeUndefined();
    });

    it('keeps voluntary practice open after every available module reaches mastery', () => {
        const data = fresh(); setPracticeSelection(data, 'practice', 'A1');
        data.subAtoms.A1.state = 'mastery';
        expect(reconcilePracticeSelection(data)).toEqual({ mode: 'practice', targetId: 'A1' });
        expect(getPracticeOverview(data, 5)).toMatchObject({ available: true, allMastered: true, remainingCount: 0,
            recommendations: [{ targetId: 'A1', completed: true, readiness: { ready: false } }] });
        expect(setPracticeSelection(data, 'practice')).toBe(true);
        data.subAtoms.A2.state = 'training';
        expect(getPracticeOverview(data, 5)).toMatchObject({ available: true, allMastered: false, remainingCount: 1 });
        expect(getPracticeOverview(data, 5).recommendations[0].targetId).toBe('A2');
        expect(getPracticeSelection(data)).toEqual({ mode: 'practice', targetId: 'A1' });
        const before = JSON.stringify(data.subAtoms);
        const keys = drawPracticeProblemKeys(data, 'A1', 20);
        expect(keys).toHaveLength(20);
        expect(keys.every(key => key.startsWith('A1:'))).toBe(true);
        expect(JSON.stringify(data.subAtoms)).toBe(before);
    });

    it('replaces unmarked legacy recommendations with the earliest open module', () => {
        const data = fresh();
        data.practice = { mode: 'practice', targetId: 'E4', lastTargetId: 'E4', introductionSeen: true };
        expect(getPracticeSelection(data)).toEqual({ mode: 'practice', targetId: 'A1' });
        expect(getPracticeOverview(data, 5).practiceTargetId).toBe('A1');
        expect(reconcilePracticeSelection(data)).toEqual({ mode: 'practice', targetId: 'A1' });
        expect(data.practice).toMatchObject({ mode: 'practice', targetId: 'A1', introductionSeen: true });
        expect(data.practice?.pinnedTargetId).toBeUndefined();
    });

    it('continues past mastery and grandmaster, advances at Legend, and respects a manually selected Legend', () => {
        const data = fresh(), player: Pick<PlayerState, 'catacombFoxJourney'> = {};
        data.subAtoms.A1.state = 'mastery';
        data.subAtoms.A2.state = 'secure';
        data.practice = { mode: 'practice', targetId: 'A2', lastTargetId: 'A2' };
        expect(awardFoxRune(player, 'A1', 1, { evidenceId: 'first', earnedAt: 1 })).toBe(true);
        expect(reconcilePracticeSelection(data, player)).toEqual({ mode: 'practice', targetId: 'A1' });
        expect(awardFoxRune(player, 'A1', 2, { evidenceId: 'second', earnedAt: 2 })).toBe(true);
        expect(reconcilePracticeSelection(data, player)).toEqual({ mode: 'practice', targetId: 'A2' });
        awardFoxRune(player, 'A2', 1, { evidenceId: 'third', earnedAt: 3 });
        awardFoxRune(player, 'A2', 2, { evidenceId: 'fourth', earnedAt: 4 });
        expect(getPracticeOverview(data, 5, player).available).toBe(false);
        data.comparisonChapter = createInitialComparisonChapterState('complete');
        data.subAtoms.A3.state = 'secure';
        expect(getPracticeOverview(data, 5, player).practiceTargetId).toBe('comparison_symbols');
        setPracticeSelection(data, 'practice', 'A1', player);
        expect(getPracticeSelection(data, player)).toEqual({ mode: 'practice', targetId: 'A1' });
    });

    it('preserves the target after mastery and leaves the progression pool and history untouched', () => {
        const data = fresh(); data.subAtoms.A2.state = 'secure'; data.currentPool = ['resume-me']; data.currentPoolIndex = 1;
        data.retryPool = ['retry-me']; evidence(data, 'A1', 5);
        const records = JSON.stringify(data.problemRecords);
        setPracticeSelection(data, 'practice', 'A1'); data.subAtoms.A1.state = 'mastery';
        expect(reconcilePracticeSelection(data)).toEqual({ mode: 'practice', targetId: 'A1' });
        expect(setPracticeSelection(data, 'practice', 'E4')).toBe(false);
        expect(data.practice?.targetId).toBe('A1');
        setPracticeSelection(data, 'progress');
        expect([data.currentPool, data.currentPoolIndex, data.retryPool]).toEqual([['resume-me'], 1, ['retry-me']]);
        expect(JSON.stringify(data.problemRecords)).toBe(records);
    });

    it('introduces the choice at level five or an unfinished earlier band and remembers completion', () => {
        const data = fresh();
        expect(getPracticeOverview(data, 4).introductionAvailable).toBe(false);
        expect(getPracticeOverview(data, 5).introductionAvailable).toBe(true);
        data.bands.B.state = 'training'; data.subAtoms.B1.state = 'training';
        expect(getPracticeOverview(data, 2).introductionAvailable).toBe(true);
        data.practice = { mode: 'progress', introductionSeen: true };
        expect(getPracticeOverview(data, 20).introductionAvailable).toBe(false);
    });

    it('does not promise an unlock for speed alone, or display absent timing as zero seconds', () => {
        const data = fresh(); data.subAtoms.A1.state = 'fluent';
        expect(getCatacombReadiness(data, 'A1', 'mastery_challenge')).toMatchObject({ ready: false, speed: { value: null, progress: 0, met: false } });
        evidence(data, 'A1', 5, 1000);
        expect(getCatacombReadiness(data, 'A1', 'mastery_challenge')).toMatchObject({ ready: false, speed: { met: true }, solves: { met: false } });
        evidence(data, 'A1', 45, 1000, ['result_unknown']);
        data.problemRecords['A1:fixture:missing_part'].attempts = [];
        expect(getCatacombReadiness(data, 'A1', 'mastery_challenge')).toMatchObject({ ready: false, forms: { value: 1, met: false } });
    });

    it('uses the real skill threshold, recent accuracy, form coverage and current learning stage', () => {
        const data = fresh(); data.subAtoms.A1.state = 'fluent'; evidence(data, 'A1', 50, 5000);
        expect(getCatacombReadiness(data, 'A1', 'mastery_challenge')).toMatchObject({ ready: true, percentage: 100, speed: { target: 5000 } });
        data.subAtoms.A1.state = 'training';
        expect(getCatacombReadiness(data, 'A1', 'mastery_challenge')).toMatchObject({ ready: false, prerequisiteMet: false });
        data.bands.E.state = 'training'; data.subAtoms.E4.state = 'fluent'; evidence(data, 'E4', 50, 6000);
        expect(getCatacombReadiness(data, 'E4', 'mastery_challenge')).toMatchObject({ ready: true, speed: { target: 6500 } });
        for (const record of Object.values(data.problemRecords).filter(r => r.subAtomId === 'E4')) record.attempts.at(-1)!.correct = false;
        expect(getCatacombReadiness(data, 'E4', 'mastery_challenge')).toMatchObject({ ready: false, accuracy: { value: 0.9, met: false } });
    });

    it('ignores invalid, paused and underwater timing without erasing correct answers', () => {
        for (const time of [0, -1, NaN, Infinity, 30000]) {
            const data = fresh(); data.subAtoms.A1.state = 'fluent'; evidence(data, 'A1', 50, time);
            expect(getCatacombReadiness(data, 'A1', 'mastery_challenge')).toMatchObject({ ready: false, speed: { value: null }, solves: { value: 50 } });
        }
        const data = fresh(); data.subAtoms.A1.state = 'fluent'; evidence(data, 'A1', 50, 1000);
        Object.values(data.problemRecords).forEach(record => record.attempts.forEach(a => a.context = 'underwater_bell'));
        expect(getCatacombReadiness(data, 'A1', 'mastery_challenge').speed.value).toBeNull();
    });

    it('offers the nearest three actual trials and uses two representations for completed comparison review', () => {
        const data = fresh(); data.comparisonChapter = createInitialComparisonChapterState('complete');
        data.comparisonChapter.fluencyChallengeResult = 'pass';
        for (let i = 0; i < 50; i++) {
            const problem = generateComparisonReviewProblems(data.comparisonChapter, 1)[0];
            expect(problem.comparisonMeta?.exam).not.toBe(true);
            recordComparisonAttempt(data.comparisonChapter, problem, true, 4000, false, ++data.globalSolveSequence);
        }
        expect(new Set(data.comparisonChapter.attempts.map(a => a.representation))).toEqual(new Set(['number', 'expression']));
        expect(getCatacombReadiness(data, 'comparison_symbols', 'mastery_challenge').ready).toBe(true);
        data.subAtoms.A1.state = 'secure'; evidence(data, 'A1', 30, 4000);
        data.subAtoms.A2.state = 'secure'; data.subAtoms.A3.state = 'secure'; data.subAtoms.A4.state = 'secure';
        const view = getPracticeOverview(data, 5);
        expect(view.recommendations).toHaveLength(3);
        expect(view.recommendations.slice(0, 2).every(target => target.readiness.ready)).toBe(true);
        data.comparisonChapter.attempts.forEach(attempt => attempt.assisted = true);
        expect(getCatacombReadiness(data, 'comparison_symbols', 'mastery_challenge').ready).toBe(false);
    });
});

describe('focused problem scheduling', () => {
    it('keeps single-operation practice on arithmetic after comparison unlocks, even with an old mixed deck', () => {
        const data = fresh(); data.comparisonChapter = createInitialComparisonChapterState('complete');
        data.subAtoms.A1.state = 'fluent'; data.bands.C.state = 'training'; data.subAtoms.C1.state = 'training';
        data.currentPool = ['C1:10+2:result_unknown']; setPracticeSelection(data, 'practice', 'A1');
        data.practice!.pool = { targetId: 'A1', keys: ['A1:2+3vs5:compare_eq_num'], index: 0 };
        const keys = drawPracticeProblemKeys(data, 'A1', 20);
        const db = ProblemDatabase.getInstance();
        expect(keys).toHaveLength(20);
        expect(keys.every(key => db.getProblemByKey(key)?.subAtomId === 'A1')).toBe(true);
        expect(new Set(keys.map(key => db.getProblemByKey(key)?.form))).toEqual(new Set(['result_unknown', 'missing_part']));
        expect(data.currentPool).toEqual(['C1:10+2:result_unknown']);
    });

    it('resumes its own pool after serialization and removes invalid cached entries without skipping valid ones', () => {
        const data = fresh(); setPracticeSelection(data, 'practice', 'A1'); drawPracticeProblemKeys(data, 'A1', 1);
        const next = data.practice!.pool!.keys[1];
        const restored = JSON.parse(JSON.stringify(data)) as MasteryData;
        restored.practice!.pool!.keys.splice(1, 0, 'deleted-catalog-key');
        expect(drawPracticeProblemKeys(restored, 'A1', 1)).toEqual([next]);
        expect(drawPracticeProblemKeys(restored, 'A1', NaN)).toEqual([]);
    });

    it('keeps chapter and three-operand restrictions when practicing', () => {
        const data = fresh(); data.subAtoms.A1.state = 'secure'; setPracticeSelection(data, 'practice', 'A1');
        const db = ProblemDatabase.getInstance();
        expect(drawPracticeProblemKeys(data, 'A1', 20).every(key => !db.getProblemByKey(key)?.form.startsWith('compare_'))).toBe(true);
        data.comparisonChapter = createInitialComparisonChapterState('complete'); data.subAtoms.A3.state = 'secure';
        setPracticeSelection(data, 'practice', 'A3');
        expect(drawPracticeProblemKeys(data, 'A3', 20).every(key => db.getProblemByKey(key)?.form !== 'missing_part')).toBe(true);
    });
});
