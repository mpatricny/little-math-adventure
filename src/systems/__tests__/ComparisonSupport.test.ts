import { describe, expect, it } from 'vitest';
import { COMPARISON_INTRO_VERSION, comparisonHintDelay, normalizeComparisonSupport, updateComparisonSupport } from '../ComparisonSupport';
import { createInitialComparisonChapterState, generateComparisonTrainingProblems, migrateComparisonChapterState, needsComparisonStageIntro, recordComparisonAttempt } from '../ComparisonLearningSystem';

describe('crocodile reminders', () => {
    it('shows the first five immediately, then always after ten seconds, including after mistakes', () => {
        const support = normalizeComparisonSupport();
        for (let i = 0; i < 5; i++) {
            expect(comparisonHintDelay(support)).toBe(0);
            updateComparisonSupport(support, i % 2 === 0);
        }
        for (let i = 0; i < 20; i++) {
            expect(comparisonHintDelay(support)).toBe(10000);
            updateComparisonSupport(support, i % 2 === 0);
        }
    });

    it('persists the five-answer boundary across batches and save hydration', () => {
        let state = createInitialComparisonChapterState('training');
        state.currentStageIndex = 3;
        for (let batch = 0; batch < 2; batch++) {
            generateComparisonTrainingProblems(state, 2).forEach((problem, i) => {
                recordComparisonAttempt(state, problem, i === 0, 45000, true, batch * 2 + i);
            });
            state = migrateComparisonChapterState(JSON.parse(JSON.stringify(state)), true, false);
        }
        expect(state.stages[3].symbolAnswers).toBe(4);
        expect(state.stages[3].correctIndependent).toBe(0);
        const [problem] = generateComparisonTrainingProblems(state, 1);
        recordComparisonAttempt(state, problem, false, 1000, false, 5);
        expect(comparisonHintDelay(normalizeComparisonSupport(state.stages[3]))).toBe(10000);
        expect(state.currentStageIndex).toBe(3);
    });

    it('ignores exam answers and keeps plain buttons after mistakes', () => {
        const state = createInitialComparisonChapterState('training');
        state.currentStageIndex = 3;
        state.stages[3].supportMode = true;
        state.stages[3].symbolAnswers = 5;
        const [problem] = generateComparisonTrainingProblems(state, 1);
        expect(problem.comparisonMeta!.showCrocodile).toBe(false);
        problem.comparisonMeta!.exam = true;
        recordComparisonAttempt(state, problem, false, 1000, false, 1);
        expect(state.stages[3].symbolAnswers).toBe(5);
    });

    it('hydrates legacy attempt counts without resetting progress or introductions', () => {
        const old = createInitialComparisonChapterState('training');
        old.currentStageIndex = 3;
        old.stages[3].introSeen = true;
        old.stages[3].attempts = 7;
        old.stages.forEach(stage => { delete stage.introVersionSeen; delete stage.symbolAnswers; });
        const hydrated = migrateComparisonChapterState(old, true, false);
        expect(hydrated.currentStageIndex).toBe(3);
        expect(hydrated.stages[3].attempts).toBe(7);
        expect(hydrated.stages[3].symbolAnswers).toBe(7);
        expect(needsComparisonStageIntro(hydrated)).toBe(true);
        const complete = migrateComparisonChapterState({ ...old, status: 'complete' }, true, false);
        expect(complete.status).toBe('complete');
        expect(complete.stages[3].introVersionSeen).toBe(COMPARISON_INTRO_VERSION);
    });
});
