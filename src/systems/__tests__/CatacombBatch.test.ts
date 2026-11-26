import { describe, expect, it } from 'vitest';
import type { MasteryData, MathProblem, ProblemForm } from '../../types';
import { CatacombBatch, CatacombFrameClock, catacombBatchGoal, catacombProblemWeight, getCatacombBatchRules } from '../CatacombBatch';
import { recordCatacombTrial } from '../CatacombTrialHistory';
import type { LearningHistoryAttempt } from '../LearningHistory';
import { ProblemDatabase } from '../ProblemDatabase';
import { COMPARISON_STAGES, createComparisonDemoProblems } from '../ComparisonLearningSystem';

const rules = { total: 6, required: 5, paceMs: 1000, budgetMs: 7000 };
const sum: MathProblem = { id: 'add_2_3', operand1: 2, operand2: 3, operator: '+',
    answer: 5, choices: [4, 5, 6], showVisualHint: false, hintType: 'none' };
const missing: MathProblem = { ...sum, problemType: 'missing_operand', operand2: 5, answer: 3 };
const three: MathProblem = { ...sum, operand3: 1, operator2: '-', answer: 4 };
const comparison: MathProblem = { ...sum, problemType: 'comparison', operand3: 4, answer: 2, choices: [0, 1, 2] };
const threeCompared: MathProblem = { ...comparison, operand3: 1, operator2: '-', operand4: 4, answer: 1 };
const expressionsCompared: MathProblem = { ...comparison, problemType: 'comparison_eq_vs_eq', operand4: 2, operator3: '+' };

function history(attempts: Array<Partial<LearningHistoryAttempt>>) {
    return { problemRecords: {}, learningHistory: { version: 1, attempts: attempts.map((a, i) => ({
        source: 'mastery', problemKey: 'A1:3:result_unknown', timestamp: i + 1, correct: true,
        responseTimeMs: 2000, subAtomId: 'A1', ...a,
    })) } } as MasteryData;
}

describe('one planetary transit per catacomb trial', () => {
    it.each([
        ['lesson', 2], ['fluency_challenge', 3], ['mastery_challenge', 2], ['grandmaster', 2], ['legend', 1],
    ] as const)('ends %s at the first impossible score and keeps unattempted questions empty', (stage, fatalMistake) => {
        const batch = new CatacombBatch({ ...rules, ...catacombBatchGoal(stage) }, () => 0);
        for (let mistakes = 0; mistakes < fatalMistake; mistakes++) {
            expect(batch.finished).toBe(false);
            expect(batch.openQuestion()).toBe(true);
            expect(batch.submit(false)).not.toBeNull();
        }
        expect(batch.finished).toBe(true);
        expect(batch.passed).toBe(false);
        expect(batch.expired).toBe(false);
        expect(batch.openQuestion()).toBe(false);
        expect(batch.submit(true)).toBeNull();
        expect(batch.answers).toHaveLength(fatalMistake);
        expect(batch.giftedStars).toEqual([]);
    });

    it('charges ordinary frame intervals in full and only a single frame for a blocked input loop', () => {
        let now = 0;
        const clock = new CatacombFrameClock(() => now);
        const batch = new CatacombBatch(rules, clock.read);
        batch.openQuestion();
        for (let frame = 0; frame < 20; frame++) { now += 25; clock.frame(); }
        now += 1500;
        expect(batch.elapsedMs).toBe(600);
        clock.frame();
        expect(batch.elapsedMs).toBe(600);
        now += 16;
        expect(batch.submit(true)?.responseTimeMs).toBe(616);
    });

    it('retains the actual unanswered questions and frozen deadline for the last two tries at each tier', () => {
        const data = history([]);
        const deck = [sum, missing, expressionsCompared];
        let now = 0;
        const round = new CatacombBatch({ total: 3, required: 2, paceMs: 1000, budgetMs: 6000 }, () => now);
        round.openQuestion();
        now = 950;
        round.submit(true, sum.id);
        round.openQuestion();
        now = 6100;
        for (const id of ['first', 'second', 'third', 'third']) {
            recordCatacombTrial(data, 'A1', 'grandmaster', id, deck, round, false);
        }
        recordCatacombTrial(data, 'A1', 'legend', 'fourth', deck, round, false);
        const records = data.recentCatacombTrials!;
        expect(records.grandmaster?.map(run => run.id)).toEqual(['second', 'third']);
        expect(records.legend).toHaveLength(1);
        expect(records.grandmaster![1]).toMatchObject({
            outcome: 'timeout', elapsedMs: 6000, budgetMs: 6000, required: 2,
            questions: [
                { correct: true, responseTimeMs: 950, weight: 1 },
                { correct: null, responseTimeMs: null, weight: 1.5 },
                { correct: null, responseTimeMs: null, weight: 2.5 },
            ],
        });
    });

    it('distinguishes the sides being compared and counts a comparison only once', () => {
        expect([sum, missing, three, { ...three, problemType: 'missing_operand' as const },
            comparison, threeCompared, expressionsCompared].map(catacombProblemWeight))
            .toEqual([1, 1.5, 2, 2, 1.5, 1.5, 2.5]);
        for (const stage of COMPARISON_STAGES) {
            for (const problem of createComparisonDemoProblems(stage)) {
                expect(catacombProblemWeight(problem), stage).toBe(stage.startsWith('expression_') ? 1.5 : 1);
            }
        }
    });

    it('budgets the chosen set plus one average item, including non-integral reserve weights', () => {
        const data = history([]);
        const deck = [sum, sum, missing, three, comparison, expressionsCompared];
        const lesson = getCatacombBatchRules(data, 'A1', 'lesson', deck);
        // 9.5 units in six questions, plus another 9.5/6 units.
        expect(lesson).toEqual({ total: 6, required: 5, paceMs: 7000, budgetMs: 77583 });
        expect(getCatacombBatchRules(data, 'A1', 'lesson', [...deck].reverse())).toEqual(lesson);
        expect(() => getCatacombBatchRules(data, 'A1', 'lesson', deck.slice(1))).toThrow(RangeError);
        const ten = [...deck, sum, sum, sum, sum]; // 13.5 units plus one average item of 1.35.
        for (const stage of ['fluency_challenge', 'mastery_challenge', 'legend'] as const) {
            const timed = getCatacombBatchRules(data, 'A1', stage, ten);
            expect(timed.budgetMs, stage).toBe(Math.round(timed.paceMs * 14.85));
        }
        const grandmaster = getCatacombBatchRules(data, 'A1', 'grandmaster', [...deck, sum, sum]);
        expect(grandmaster.budgetMs).toBe(Math.round(grandmaster.paceMs * (11.5 + 11.5 / 8)));
    });

    it('keeps the displayed Grandmaster pace for T4’s E1 deck even after quicker retries', () => {
        const deck = [sum, sum, missing, missing, comparison, comparison, expressionsCompared, expressionsCompared];
        for (const responseTimeMs of [1574, 1748, 3500]) {
            const data = history(Array.from({ length: 20 }, () => ({ subAtomId: 'E1', responseTimeMs })));
            // 13 normal-question units, plus 13/8 for the reserve, at the map's 3.6 seconds.
            expect(getCatacombBatchRules(data, 'E1', 'grandmaster', deck))
                .toEqual({ total: 8, required: 7, paceMs: 3600, budgetMs: 52650 });
        }
    });

    it('normalizes the child’s historical time before weighting the new set', () => {
        const db = ProblemDatabase.getInstance();
        const observation = (form: ProblemForm, responseTimeMs: number): Partial<LearningHistoryAttempt> =>
            ({ form, problemKey: db.getProblemsForForm('A1', form)[0].key, responseTimeMs });
        const data = history([observation('result_unknown', 6000), observation('missing_part', 9000),
            observation('compare_equation_vs_number', 9000), observation('compare_equation_vs_equation', 15000)]);
        const mixed = [sum, sum, sum, sum, missing, missing, missing, missing, comparison, expressionsCompared];
        expect(getCatacombBatchRules(data, 'A1', 'mastery_challenge', mixed)).toMatchObject({ paceMs: 6000, budgetMs: 92400 });
        expect(getCatacombBatchRules(data, 'A1', 'mastery_challenge', Array(10).fill(sum)).budgetMs).toBe(66000);
        const pastThree = db.getProblemsForForm('A3', 'result_unknown').find(p => p.operator2)!;
        const tripleHistory = history([{ problemKey: pastThree.key, subAtomId: 'A3', responseTimeMs: 12000 }]);
        expect(getCatacombBatchRules(tripleHistory, 'A3', 'mastery_challenge', Array(10).fill(three)))
            .toMatchObject({ paceMs: 6000, budgetMs: 132000 });
        const chapter = history(COMPARISON_STAGES.map(stage => ({ source: 'comparison',
            problemKey: `comparison:${stage}:5:4`, responseTimeMs: stage.startsWith('expression_') ? 9000 : 6000 })));
        const chapterDeck = COMPARISON_STAGES.map(stage => createComparisonDemoProblems(stage)[0]);
        expect(getCatacombBatchRules(chapter, 'comparison_symbols', 'mastery_challenge', [...chapterDeck, ...chapterDeck.slice(0, 4)]))
            .toMatchObject({ paceMs: 6000, budgetMs: 72600 });
    });

    it('takes the slower of the rank threshold and the last ten independent reliable solves of this module', () => {
        const data = history([
            { responseTimeMs: 80000 }, ...Array.from({ length: 19 }, () => ({})),
            { responseTimeMs: 32000 }, { subAtomId: 'B1' }, { correct: false },
            { assisted: true }, { clockUncertain: true }, { context: 'underwater_bell' }, { responseTimeMs: 130000 },
        ]);
        const before = structuredClone(data);
        expect(getCatacombBatchRules(data, 'A1', 'lesson')).toEqual({ total: 6, required: 5, paceMs: 7000, budgetMs: 49000 });
        // Nine two-second answers and one 32-second answer give a five-second base.
        expect(getCatacombBatchRules(data, 'A1', 'fluency_challenge')).toEqual({ total: 10, required: 8, paceMs: 7000, budgetMs: 77000 });
        expect(getCatacombBatchRules(data, 'A1', 'mastery_challenge')).toEqual({ total: 10, required: 9, paceMs: 5000, budgetMs: 55000 });
        expect(getCatacombBatchRules(data, 'A1', 'grandmaster')).toEqual({ total: 8, required: 7, paceMs: 5000, budgetMs: 45000 });
        expect(getCatacombBatchRules(data, 'A1', 'legend')).toEqual({ total: 10, required: 10, paceMs: 5000, budgetMs: 55000 });
        expect(data).toEqual(before);
    });

    it('uses module-specific fallback times for old saves and valid comparison evidence', () => {
        const data = history([{ source: 'comparison', subAtomId: undefined, problemKey: 'comparison:numerals:5:8', responseTimeMs: 4200 }]);
        expect(getCatacombBatchRules(data, 'E4', 'lesson').paceMs).toBe(9100);
        expect(getCatacombBatchRules(data, 'E4', 'fluency_challenge').paceMs).toBe(9100);
        expect(getCatacombBatchRules(data, 'comparison_symbols', 'lesson').paceMs).toBe(7700);
    });

    it('gives an E1 shield lesson the fluent pace even for a profile averaging under two seconds', () => {
        const data = history(Array.from({ length: 20 }, () => ({ subAtomId: 'E1', form: 'result_unknown', responseTimeMs: 1778 })));
        expect(getCatacombBatchRules(data, 'E1', 'lesson')).toEqual({ total: 6, required: 5, paceMs: 8400, budgetMs: 58800 });
    });

    it('uses slower independent answers to the same kind of problem before applying the lesson floor', () => {
        const data = history([
            { responseTimeMs: 80000 }, ...Array.from({ length: 20 }, () => ({ responseTimeMs: 11000 })),
            ...Array.from({ length: 30 }, () => ({ form: 'missing_part' as const, responseTimeMs: 900 })),
            { form: 'compare_equation_vs_number', responseTimeMs: 60000 }, { subAtomId: 'B1' },
            { correct: false }, { assisted: true }, { clockUncertain: true }, { responseTimeMs: 130000 },
        ]);
        expect(getCatacombBatchRules(data, 'A1', 'lesson').budgetMs).toBe(77000);
        const numberPair = createComparisonDemoProblems('number_symbol')[0];
        expect(getCatacombBatchRules(history([{ source: 'comparison', problemKey: 'comparison:number_symbol:5:4', responseTimeMs: 9500 },
            { form: 'compare_equation_vs_number', responseTimeMs: 1000 }]), 'comparison_symbols', 'lesson', Array(6).fill(numberPair)))
            .toMatchObject({ paceMs: 9500, budgetMs: 66500 });
    });

    it('counts active answering only, including overlapping manual and visibility pauses', () => {
        let now = 0;
        const batch = new CatacombBatch(rules, () => now);
        now += 30000;
        expect(batch.openQuestion()).toBe(true);
        now += 400;
        batch.setPaused(true);
        now += 1000;
        batch.setHidden(true);
        now += 1000;
        batch.setPaused(false);
        expect(batch.submit(true)).toBeNull();
        now += 20000;
        batch.setHidden(false);
        now += 600;
        expect(batch.submit(false)).toEqual({ correct: false, responseTimeMs: 1000 });
        expect(batch.submit(true)).toBeNull();
        now += 10000; // feedback and star animation
        expect(batch.elapsedMs).toBe(1000);
        for (let i = 0; i < 5; i++) {
            expect(batch.openQuestion()).toBe(true);
            expect(batch.openQuestion()).toBe(false);
            now += 900;
            expect(batch.submit(true)?.responseTimeMs).toBe(900);
        }
        expect(batch.openQuestion()).toBe(false);
        expect(batch.correctCount).toBe(5);
        expect(batch.passed).toBe(true);
        expect(batch.timeFraction).toBe(5500 / 7000);
        now += 1e6;
        expect(batch.expired).toBe(false);
    });

    it('evaluates the whole set and does not count unanswered stars at timeout', () => {
        let now = 0;
        const batch = new CatacombBatch(rules, () => now);
        for (let i = 0; i < 5; i++) {
            batch.openQuestion();
            now += 1000;
            batch.submit(true);
        }
        expect(batch.correctCount).toBe(rules.required);
        expect(batch.passed).toBe(false);
        expect(batch.finished).toBe(false);
        batch.openQuestion();
        now += 2000;
        expect(batch.submit(true)).toBeNull();
        expect(batch.expired).toBe(true);
        expect(batch.finished).toBe(true);
        expect(batch.passed).toBe(false);
        expect(batch.timeFraction).toBe(1);
        expect(batch.answers).toHaveLength(5);
        expect(batch.giftedStars).toEqual([]);
    });

    it('lights at most two missed stars on success, even when a future recipe forgives more mistakes', () => {
        let now = 0;
        const batch = new CatacombBatch({ ...rules, required: 3 }, () => now);
        for (const correct of [true, false, true, false, false, true]) {
            expect(batch.giftedStars).toEqual([]);
            batch.openQuestion();
            now += 50;
            batch.submit(correct);
        }
        expect(batch.passed).toBe(true);
        expect(batch.giftedStars).toEqual([1, 3]);
        expect(batch.correctCount).toBe(3);
    });
});
