import { describe, expect, it } from 'vitest';
import {
    applyComparisonExamResult,
    createInitialComparisonChapterState,
    generateComparisonExamProblems,
    generateComparisonTrainingProblems,
    migrateComparisonChapterState,
    recordComparisonAttempt,
} from '../ComparisonLearningSystem';

describe('comparison learning chapter', () => {
    it('balances ten catacomb questions in every rotation without dropping a relation', () => {
        const state = createInitialComparisonChapterState('complete');
        for (let rotation = 0; rotation < 3; rotation++) {
            const problems = generateComparisonExamProblems(state, 10);
            expect(problems).toHaveLength(10);
            expect(['less', 'equal', 'greater'].map(relation => problems.filter(p => p.comparisonMeta!.relation === relation).length).sort()).toEqual([3, 3, 4]);
            expect(new Set(problems.map(p => p.comparisonMeta!.representation)).size).toBe(4);
            expect(problems.every(p => p.comparisonMeta!.exam && !p.comparisonMeta!.showCrocodile)).toBe(true);
        }
    });

    it('balances all three relations and advances the first stage at 5 of 6', () => {
        const state = createInitialComparisonChapterState('training');
        const problems = generateComparisonTrainingProblems(state, 6);
        const relationCounts = problems.reduce<Record<string, number>>((counts, problem) => {
            const relation = problem.comparisonMeta!.relation;
            counts[relation] = (counts[relation] ?? 0) + 1;
            return counts;
        }, {});
        expect(relationCounts).toEqual({ less: 2, equal: 2, greater: 2 });

        problems.forEach((problem, index) => {
            recordComparisonAttempt(state, problem, index < 5, 4000, false, index + 1);
        });
        expect(state.currentStageIndex).toBe(1);
        expect(state.status).toBe('training');
    });

    it('does not count assisted phase-six answers as independent mastery', () => {
        const state = createInitialComparisonChapterState('training');
        state.currentStageIndex = 5;
        const problems = generateComparisonTrainingProblems(state, 9);
        problems.forEach((problem, index) => {
            recordComparisonAttempt(state, problem, true, 5000, index < 2, index + 1);
        });
        expect(state.status).toBe('training');
    });

    it('adds the 15-second arithmetic hint only to the guided expression phase', () => {
        const state = createInitialComparisonChapterState('training');
        state.currentStageIndex = 4;
        const [guided] = generateComparisonTrainingProblems(state, 1);
        expect(guided.comparisonMeta?.autoArithmeticHintMs).toBe(15000);
        expect(guided.comparisonMeta?.arithmeticHintText).toMatch(/=/);

        state.currentStageIndex = 5;
        const [independent] = generateComparisonTrainingProblems(state, 1);
        expect(independent.comparisonMeta?.autoArithmeticHintMs).toBeUndefined();
    });

    it('stores versioned, analysis-ready attempt details and per-relation totals', () => {
        const state = createInitialComparisonChapterState('training');
        const [problem] = generateComparisonTrainingProblems(state, 1, true);
        problem.comparisonMeta!.selectedRelation = 'less';

        recordComparisonAttempt(state, problem, true, 4321, false, 7);

        expect(state.schemaVersion).toBe(1);
        expect(state.stages[0].relationStats.less).toEqual({
            attempts: 1,
            correctFirst: 1,
            correctIndependent: 1,
        });
        expect(state.attempts[0]).toMatchObject({
            selectedRelation: 'less',
            leftValue: problem.comparisonMeta!.leftValue,
            rightValue: problem.comparisonMeta!.rightValue,
            operand1: problem.operand1,
            operand2: problem.operand2,
            operator: problem.operator,
            activeTimeMs: 4321,
            responseTimeMs: 4321,
            context: 'diagnostic',
        });
    });

    it('derives an eight-item mixed exam from the shared module configuration', () => {
        const state = createInitialComparisonChapterState('exam_ready');
        const problems = generateComparisonExamProblems(state);
        expect(problems).toHaveLength(8);
        const representations = problems.map(problem => problem.comparisonMeta!.representation);
        for (const representation of ['size', 'count', 'number', 'expression']) {
            expect(representations.filter(value => value === representation)).toHaveLength(2);
        }
        const relationCounts = ['less', 'equal', 'greater']
            .map(relation => problems.filter(problem => problem.comparisonMeta!.relation === relation).length)
            .sort();
        expect(relationCounts).toEqual([2, 3, 3]);
        expect(problems.every(problem => !problem.comparisonMeta?.showCrocodile)).toBe(true);
        expect(problems.every(problem => problem.comparisonMeta?.autoArithmeticHintMs === undefined)).toBe(true);
    });

    it('completes on a shared bronze result and grandfathers advanced saves', () => {
        const state = createInitialComparisonChapterState('exam_ready');
        applyComparisonExamResult(state, 'bronze');
        expect(state.status).toBe('complete');

        const migrated = migrateComparisonChapterState(undefined, true, true);
        expect(migrated.status).toBe('complete');
    });
});
