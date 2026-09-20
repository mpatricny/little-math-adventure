import { describe, expect, it } from 'vitest';
import { ProblemDatabase } from '../ProblemDatabase';

describe('crossing-ten curriculum', () => {
    const database = ProblemDatabase.getInstance();

    it('teaches the ten transition rather than commuted two-digit addition or subtraction without borrowing', () => {
        expect(database.getProblemByKey('E1:8+7:result_unknown')).toBeDefined();
        expect(database.getProblemByKey('E2:13-6:result_unknown')).toBeDefined();
        expect(database.getProblemByKey('E1:1+11:result_unknown')).toBeUndefined();
        expect(database.getProblemByKey('E2:19-12:result_unknown')).toBeUndefined();
        expect(database.getProblemByKey('E4:5-1:result_unknown')).toBeUndefined();
    });

    it('keeps every two-term E problem within 20 and requires a ten transition', () => {
        for (const atom of ['E1', 'E2', 'E4'] as const) {
            const problems = database.getProblemsForForm(atom, 'result_unknown');
            expect(problems.length).toBeGreaterThan(20);
            for (const problem of problems) {
                expect(problem.operand2).toBeGreaterThan(0);
                expect(problem.operand2).toBeLessThan(10);
                expect(problem.answer).toBeLessThanOrEqual(20);
                expect(problem.operator === '+'
                    ? problem.operand1 < 10 && problem.answer > 10
                    : problem.operand1 > 10 && problem.answer < 10).toBe(true);
            }
        }
    });

    it('recognizes a transition at either step of three-term arithmetic', () => {
        const problems = database.getProblemsForForm('E3', 'result_unknown');
        expect(problems.length).toBeGreaterThan(0);
        for (const problem of problems) {
            const middle = problem.operator === '+' ? problem.operand1 + problem.operand2 : problem.operand1 - problem.operand2;
            const crosses = (left: number, right: number, result: number) => right > 0 && right < 10
                && (left < 10 && right < 10 && result > 10 || left > 10 && result < 10);
            expect(crosses(problem.operand1, problem.operand2, middle)
                || crosses(middle, problem.operand3!, problem.answer)).toBe(true);
        }
    });
});
