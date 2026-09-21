import { describe, expect, it } from 'vitest';
import { COMPARISON_INTRO_VERSION, comparisonHintDelay, normalizeComparisonSupport, updateComparisonSupport } from '../ComparisonSupport';
import { createInitialComparisonChapterState, generateComparisonTrainingProblems, migrateComparisonChapterState, needsComparisonStageIntro, recordComparisonAttempt } from '../ComparisonLearningSystem';

describe('fading crocodile reminders', () => {
    it('starts at 4 seconds, fades through 8/16/24 and switches off after correct first answers', () => {
        const support = normalizeComparisonSupport();
        const waits = [comparisonHintDelay(support)];
        for (let i = 0; i < 4; i++) {
            updateComparisonSupport(support, true);
            expect(comparisonHintDelay(support)).toBe(waits.at(-1));
            updateComparisonSupport(support, true);
            waits.push(comparisonHintDelay(support));
        }
        expect(waits).toEqual([4000, 8000, 16000, 24000, null]);
        for (let i = 0; i < 10; i++) updateComparisonSupport(support, true);
        expect(comparisonHintDelay(support)).toBeNull();
    });

    it('restores exactly one step after each error, including from off, and resets the correct streak', () => {
        const support = normalizeComparisonSupport({ hintLevel: 4, hintCorrectStreak: 1 });
        const waits = [];
        for (let i = 0; i < 5; i++) {
            updateComparisonSupport(support, false);
            waits.push(comparisonHintDelay(support));
            expect(support.hintCorrectStreak).toBe(0);
        }
        expect(waits).toEqual([24000, 16000, 8000, 4000, 4000]);
        updateComparisonSupport(support, true);
        expect(comparisonHintDelay(support)).toBe(4000);
    });

    it('retains support across saved attack batches; assisted and slow correct answers can fade it', () => {
        let state = createInitialComparisonChapterState('training');
        state.currentStageIndex = 3;
        for (let batch = 0; batch < 2; batch++) {
            const problems = generateComparisonTrainingProblems(state, 2);
            problems.forEach((problem, i) => recordComparisonAttempt(state, problem, true, 45000, true, batch * 2 + i));
            state = migrateComparisonChapterState(JSON.parse(JSON.stringify(state)), true, false);
        }
        expect(state.stages[3].hintLevel).toBe(2);
        expect(state.currentStageIndex).toBe(3);
        expect(state.stages[3].correctIndependent).toBe(0);
        const [problem] = generateComparisonTrainingProblems(state, 1);
        recordComparisonAttempt(state, problem, false, 1000, false, 5);
        expect(state.stages[3].hintLevel).toBe(1);
    });

    it('ignores exam answers for support and keeps symbol choices after mistakes', () => {
        const state = createInitialComparisonChapterState('training');
        state.currentStageIndex = 3;
        state.stages[3].supportMode = true;
        state.stages[3].hintLevel = 4;
        const [problem] = generateComparisonTrainingProblems(state, 1);
        expect(problem.comparisonMeta!.showCrocodile).toBe(false);
        problem.comparisonMeta!.exam = true;
        recordComparisonAttempt(state, problem, false, 1000, false, 1);
        expect(state.stages[3].hintLevel).toBe(4);
    });

    it('replays the new visual introduction for legacy in-progress saves without clearing progress', () => {
        const old = createInitialComparisonChapterState('training');
        old.currentStageIndex = 2;
        old.stages[2].introSeen = true;
        old.stages[2].attempts = 4;
        old.stages.forEach(stage => { delete stage.introVersionSeen; delete stage.hintLevel; delete stage.hintCorrectStreak; });
        const hydrated = migrateComparisonChapterState(old, true, false);
        expect(hydrated.currentStageIndex).toBe(2);
        expect(hydrated.stages[2].attempts).toBe(4);
        expect(needsComparisonStageIntro(hydrated)).toBe(true);
        expect(hydrated.stages[3].hintLevel).toBe(0);
        const complete = migrateComparisonChapterState({ ...old, status: 'complete' }, true, false);
        expect(complete.status).toBe('complete');
        expect(complete.stages[2].introVersionSeen).toBe(COMPARISON_INTRO_VERSION);
    });
});
