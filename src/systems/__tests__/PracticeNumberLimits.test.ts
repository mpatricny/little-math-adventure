import { describe, expect, it } from 'vitest';
import { ALL_BANDS, ALL_SUB_ATOM_NUMBERS, type BandId, type MasteryData, type MathStats, type ProblemDefinition, type SubAtomId } from '../../types';
import { MasteryMigration } from '../MasteryMigration';
import { COMPARISON_STAGES, createInitialComparisonChapterState, generateComparisonPracticeProblem } from '../ComparisonLearningSystem';
import { ADVANCED_NODES, isAdvancedNode } from '../AdvancedCurriculum';
import { drawPracticeProblemKeys } from '../PracticeProblems';
import { setPracticeSelection } from '../PracticeProgress';
import { canDrawPracticeNumbers, practiceNumberMask, rememberPracticeNumbers } from '../PracticeNumberLimits';
import { ProblemDatabase } from '../ProblemDatabase';

const db = ProblemDatabase.getInstance();
const targets = ALL_BANDS.flatMap(band => ALL_SUB_ATOM_NUMBERS.map(num => `${band}${num}` as SubAtomId));
function fresh(target: SubAtomId = 'A1'): MasteryData {
    const data = MasteryMigration.migrateFromLevel(1, { problemStats: {} } as MathStats);
    data.comparisonChapter = createInitialComparisonChapterState('complete');
    data.bands[target[0] as BandId].state = 'training';
    data.subAtoms[target].state = 'fluent';
    data.practice = { mode: 'practice', targetId: target };
    return data;
}
function verifyWindows(masks: number[]): void {
    for (let end = 1; end <= masks.length; end++) {
        expect(masks.slice(Math.max(0, end - 20), end).filter(mask => mask & 1).length).toBeLessThanOrEqual(1);
        expect(masks.slice(Math.max(0, end - 10), end).filter(mask => mask & 2).length).toBeLessThanOrEqual(1);
    }
}

describe('focused practice numeric limits', () => {
    it('can always fill a practice turn from a fresh module, even immediately after issuing both rare values', () => {
        for (const target of targets) {
            const data = fresh(target);
            data.subAtoms[target].state = 'training';
            data.subAtoms[target].successfulSolves = 0;
            data.practice!.recentNumberMasks = [3];
            const keys = drawPracticeProblemKeys(data, target, 5);
            expect(keys, target).toHaveLength(5);
            expect(keys.every(key => db.getProblemByKey(key)?.subAtomId === target)).toBe(true);
        }
    });
    it.each(targets)('%s stays within its module over deck boundaries, reloads and separate combat draws', target => {
        let data = fresh(target);
        data.currentPool = ['keep-the-progression-queue'];
        data.retryPool = db.getAllProblems(target).map(problem => problem.key);
        const stream: ProblemDefinition[] = [];
        for (let draw = 0; draw < 50; draw++) {
            const count = [3, 1, 2, 1][draw % 4]; // attack, sword, shield, pet
            const keys = drawPracticeProblemKeys(data, target, count);
            expect(keys).toHaveLength(count);
            stream.push(...keys.map(key => db.getProblemByKey(key)!));
            if (draw % 7 === 0) data = JSON.parse(JSON.stringify(data));
        }
        verifyWindows(stream.map(practiceNumberMask));
        expect(stream.every(problem => problem.subAtomId === target)).toBe(true);
        if (isAdvancedNode(target)) {
            // After this node is fluent, practice rotates the taught families,
            // including mixed-operation modules and both kinds of missing part.
            const stages = ADVANCED_NODES[target].stages;
            const practiced = new Set(stream.map(p => p.advanced?.stageId));
            expect(practiced).toEqual(new Set(stages.map(s => s.id)));
            expect(new Set(stream.map(p => p.advanced?.group))).toEqual(new Set([0, 1]));
            expect(stream.every(p => p.advanced?.role === 'target')).toBe(true);
        } else if (target[1] === '1' || target[1] === '2') {
            const operator = target[1] === '1' ? '+' : '-';
            expect(stream.every(p => [p.operator, p.operator2, p.operator3].every(op => op === undefined || op === operator))).toBe(true);
        }
        expect(data.currentPool).toEqual(['keep-the-progression-queue']);
    });

    it('counts exact values and real results, not the digits of 10/11 or encoded comparison answers', () => {
        const base: ProblemDefinition = { key: 'test', bandId: 'D', subAtomId: 'D1', form: 'result_unknown',
            operand1: 10, operand2: 2, operator: '+', answer: 12 };
        expect(practiceNumberMask(base)).toBe(0);
        expect(practiceNumberMask({ ...base, operand1: 11, answer: 13 })).toBe(0);
        expect(practiceNumberMask({ ...base, operand1: 2, operand2: 2, operator: '-', answer: 0 })).toBe(1);
        expect(practiceNumberMask({ ...base, operand1: 3, operand2: 2, operator: '-', answer: 1 })).toBe(2);
        expect(practiceNumberMask({ ...base, operand1: 2, operand2: 3, operand3: 5, form: 'compare_equation_vs_number', answer: 1 })).toBe(0);
        expect(practiceNumberMask({ ...base, operand1: 2, operand2: 2, operand3: 5, form: 'compare_equation_vs_number', answer: 0 })).toBe(0);
        expect(practiceNumberMask({ ...base, operand1: 3, operand2: 2, operator: '-', operand3: 5, form: 'compare_equation_vs_number', answer: 0 })).toBe(2);
    });

    it('revalidates legacy cached tasks and retains spacing when changing mode or module', () => {
        const data = fresh();
        data.subAtoms.A2.state = 'fluent';
        data.practice!.pool = { targetId: 'A1', keys: ['A1:0+1:result_unknown', 'A1:0+2:result_unknown', 'A1:1+2:result_unknown'], index: 1 };
        const first = drawPracticeProblemKeys(data, 'A1', 6).map(key => practiceNumberMask(db.getProblemByKey(key)!));
        expect(first.every(mask => mask === 0)).toBe(true);
        const history = [...data.practice!.recentNumberMasks!];
        setPracticeSelection(data, 'progress');
        expect(data.practice!.recentNumberMasks).toEqual(history);
        setPracticeSelection(data, 'practice', 'A2');
        const rest = drawPracticeProblemKeys(data, 'A2', 20).map(key => practiceNumberMask(db.getProblemByKey(key)!));
        verifyWindows([3, ...first, ...rest]);
    });

    it('uses separate limits for each child', () => {
        const a = fresh(); const b = fresh();
        a.practice!.recentNumberMasks = [3];
        const rare = 'A1:0+1:result_unknown';
        a.practice!.pool = { targetId: 'A1', keys: [rare], index: 0 };
        b.practice!.pool = { targetId: 'A1', keys: [rare], index: 0 };
        expect(drawPracticeProblemKeys(a, 'A1', 1)).not.toEqual([rare]);
        expect(drawPracticeProblemKeys(b, 'A1', 1)).toEqual([rare]);
    });

    it.each([...COMPARISON_STAGES, 'complete'] as const)('keeps comparison stage %s and all three relations while limiting trivial values', stage => {
        const state = createInitialComparisonChapterState(stage === 'complete' ? 'complete' : 'training');
        if (stage !== 'complete') state.currentStageIndex = COMPARISON_STAGES.indexOf(stage);
        const recent: number[] = []; const masks: number[] = [];
        const ids = new Set<string>(); const relations = new Set<string>();
        for (let i = 0; i < 90; i++) {
            const problem = generateComparisonPracticeProblem(state, i,
                candidate => canDrawPracticeNumbers(practiceNumberMask(candidate), recent));
            const mask = practiceNumberMask(problem);
            rememberPracticeNumbers(recent, mask); masks.push(mask); ids.add(problem.id);
            relations.add(problem.comparisonMeta!.relation);
            if (stage !== 'complete') expect(problem.comparisonMeta!.stage).toBe(stage);
            expect(problem.comparisonMeta!.exam).not.toBe(true);
        }
        verifyWindows(masks);
        expect(ids.size).toBe(90);
        expect(relations).toEqual(new Set(['less', 'equal', 'greater']));
        expect(state.attempts).toEqual([]);
    });
});
