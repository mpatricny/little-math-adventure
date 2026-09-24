import { describe, expect, it } from 'vitest';
import { createInitialComparisonChapterState, generateComparisonTrainingProblems, recordComparisonAttempt } from '../ComparisonLearningSystem';
import { getComparisonStatistics } from '../ComparisonStatistics';
import type { ComparisonAttempt } from '../../types';

const attempt = (patch: Partial<ComparisonAttempt> = {}): ComparisonAttempt => ({
    timestamp: 1, sequenceIndex: 1, stage: 'size_crocodile', representation: 'size',
    relation: 'less', selectedRelation: 'less', leftValue: 1, rightValue: 2,
    operand1: 1, operand2: 2, operator: '<', correct: true, responseTimeMs: 2000,
    activeTimeMs: 2000, assisted: false, exam: false, diagnosticMode: false, context: 'battle', ...patch,
});

describe('comparison map statistics', () => {
    it('counts actual first answers per stage, including assisted answers and exams, but not diagnostics', () => {
        const chapter = createInitialComparisonChapterState('training');
        chapter.attempts = [attempt(), attempt({ correct: false, responseTimeMs: 1000 }),
            attempt({ assisted: true, responseTimeMs: 4000 }),
            attempt({ exam: true, stage: 'number_symbol', responseTimeMs: 6000 }),
            attempt({ diagnosticMode: true, responseTimeMs: 1 })];
        const before = JSON.stringify(chapter);
        const stats = getComparisonStatistics(chapter);
        expect(stats).toMatchObject({ total: 4, correct: 3, wrong: 1, accuracy: .75, recentAccuracy: .75, meanMs: 4000, medianMs: 4000 });
        expect(stats.stages[0]).toMatchObject({ total: 3, correct: 2, wrong: 1, meanMs: 3000 });
        expect(stats.stages[3]).toMatchObject({ total: 1, meanMs: 6000 });
        expect(stats.stages[5]).toMatchObject({ total: 0, accuracy: null, meanMs: null, medianMs: null });
        expect(JSON.stringify(chapter)).toBe(before);
    });

    it('uses the newest 20 first answers and ignores invalid or interrupted times', () => {
        const chapter = createInitialComparisonChapterState();
        chapter.attempts = Array.from({ length: 22 }, (_, i) => attempt({ sequenceIndex: i,
            correct: i !== 21, responseTimeMs: i < 2 ? 9000 : i === 2 ? 20001 : i === 3 ? 0 : i === 4 ? NaN : 2000 })).reverse();
        expect(getComparisonStatistics(chapter)).toMatchObject({ total: 22, recentAccuracy: .95, medianMs: 2000 });
    });

    it('does not fabricate missing records from chapter completion or start placement', () => {
        const chapter = createInitialComparisonChapterState('complete');
        chapter.stages[0].attempts = 30;
        expect(getComparisonStatistics(chapter)).toMatchObject({ total: 0, correct: 0, medianMs: null, recentAccuracy: null });
    });

    it('keeps lifetime counts when history rolls past 400 and after saving/reloading', () => {
        let chapter = createInitialComparisonChapterState('training');
        const problem = generateComparisonTrainingProblems(chapter, 1)[0];
        for (let i = 0; i < 430; i++) recordComparisonAttempt(chapter, problem, i % 2 === 0, 2000, false, i);
        expect(chapter.attempts).toHaveLength(400);
        expect(getComparisonStatistics(chapter)).toMatchObject({ total: 430, correct: 215, wrong: 215, meanMs: 2000 });
        chapter = JSON.parse(JSON.stringify(chapter));
        recordComparisonAttempt(chapter, problem, true, 2000, false, 431);
        expect(getComparisonStatistics(chapter).correct).toBe(216);
    });

    it('seeds older saves once from retained answers before appending the next result', () => {
        const chapter = createInitialComparisonChapterState('training');
        chapter.attempts = [attempt(), attempt({ correct: false }), attempt({ diagnosticMode: true })];
        const problem = generateComparisonTrainingProblems(chapter, 1)[0];
        recordComparisonAttempt(chapter, problem, true, 2000, false, 4);
        expect(getComparisonStatistics(chapter)).toMatchObject({ total: 3, correct: 2, wrong: 1 });
        recordComparisonAttempt(chapter, problem, true, 2000, false, 5);
        expect(getComparisonStatistics(chapter)).toMatchObject({ total: 4, correct: 3, wrong: 1 });
    });
});
