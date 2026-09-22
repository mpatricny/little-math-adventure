import { describe, expect, it } from 'vitest';
import { formatMathProblem, getComparisonExpressions } from '../formatMathProblem';

describe('comparison expressions in every presentation', () => {
    it.each([
        [{ operand1: 2, operand2: 1, operator: '+', operand3: 4, answer: 0, problemType: 'comparison' }, '2 + 1', '4', '2 + 1 < 4'],
        [{ operand1: 17, operand2: 8, operator: '-', operand3: 4, operator2: '+', operand4: 13, answer: 1, problemType: 'comparison' }, '17 - 8 + 4', '13', '17 - 8 + 4 = 13'],
        [{ operand1: 12, operand2: 8, operator: '+', operand3: 19, operator3: '-', operand4: 7, answer: 2, problemType: 'comparison_eq_vs_eq' }, '12 + 8', '19 - 7', '12 + 8 > 19 - 7'],
        [{ operand1: 4, operand2: 3, operator: '*', operand3: 2, operator3: '*', operand4: 6, answer: 1, problemType: 'comparison_eq_vs_eq' }, '4 × 3', '2 × 6', '4 × 3 = 2 × 6'],
    ] as const)('preserves all operands and hides only the unknown relation', (problem, left, right, answer) => {
        expect(getComparisonExpressions(problem)).toEqual({ left, right });
        expect(formatMathProblem(problem, 'question')).toBe(`${left} \u2003 ${right}`);
        expect(formatMathProblem(problem, 'answer')).toBe(answer);
    });

    it('leaves ordinary equations and missing-number questions unchanged', () => {
        const problem = { operand1: 2, operand2: 1, operator: '+', answer: 3 };
        expect(getComparisonExpressions(problem)).toBeNull();
        expect(formatMathProblem(problem, 'question')).toBe('2 + 1 = ?');
        expect(formatMathProblem({ ...problem, operand2: 4, answer: 2, problemType: 'missing_operand' }, 'question')).toBe('2 + ? = 4');
    });
});
