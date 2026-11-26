import type { MathProblem } from '../../types';

/** Numerical working shown after the first answer in the advanced curriculum. */
export function numberFeedback(problem: MathProblem): string[] {
    const { operand1: a, operand2: b, operand3: c, operator, answer } = problem;
    const sign = operator === '-' ? '−' : '+';
    const equation = (left: number, op: string, right: number, total: number) =>
        `${left} ${op} ${right} = ${total}`;
    const calculate = (left: number, right: number) => operator === '-' ? left - right : left + right;
    if (problem.problemType === 'missing_operand') {
        // b is the displayed total; the inverse operation recovers the missing change.
        const inverse = operator === '-' ? equation(a, '−', b, answer) : equation(b, '−', a, answer);
        return [inverse, equation(a, sign, answer, b)];
    }
    if (c !== undefined && problem.operator2) {
        const first = calculate(a, b);
        return [equation(a, sign, b, first), equation(first, problem.operator2 === '-' ? '−' : '+', c, answer)];
    }
    const solved = equation(a, sign, b, answer);
    if (a % 10 === 0 && b % 10 === 0) {
        return [equation(a / 10, sign, b / 10, answer / 10), solved];
    }
    // First apply the tens of a two-digit change; carry its units into the second step.
    const tens = b - b % 10;
    if (tens > 0 && b !== tens) {
        const first = calculate(a, tens);
        return [equation(a, sign, tens, first), equation(first, sign, b - tens, answer)];
    }
    const units = a % 10;
    if (a >= 10 && b < 10) {
        const toBoundary = operator === '-' ? units : 10 - units;
        if (toBoundary > 0 && toBoundary < b) {
            const boundary = calculate(a, toBoundary);
            return [equation(a, sign, toBoundary, boundary), equation(boundary, sign, b - toBoundary, answer)];
        }
        const anchor = operator === '-' && units < b ? units + 10 : units;
        if (anchor !== a) return [equation(anchor, sign, b, calculate(anchor, b)), solved];
    }
    if (tens > 0 && units !== 0) {
        const base = a - units;
        return [equation(base, sign, b, calculate(base, b)), solved];
    }
    return [solved];
}
