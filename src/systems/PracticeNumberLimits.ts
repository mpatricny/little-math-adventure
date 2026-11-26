import type { MasteryData, MathProblem, ProblemDefinition } from '../types';
import tuning from '../data/practice.json';

export const PRACTICE_NUMBER_HISTORY_SIZE = Math.max(tuning.zeroSpacing, tuning.oneSpacing) - 1;

/** Bits describe mathematical values, never digits, distractors or encoded < / = answers. */
export function practiceNumberMask(problem: ProblemDefinition | MathProblem): number {
    if ('comparisonMeta' in problem && problem.comparisonMeta?.representation === 'size') return 0;
    const values = [problem.operand1, problem.operand2, problem.operand3, problem.operand4];
    const comparison = 'form' in problem ? problem.form.startsWith('compare_')
        : problem.problemType === 'comparison';
    if (!comparison) {
        values.push(problem.answer);
    } else if ('comparisonMeta' in problem && problem.comparisonMeta) {
        values.push(problem.comparisonMeta.leftValue, problem.comparisonMeta.rightValue);
    } else {
        const calculate = (a: number, b: number, op?: string) => op === '-' ? a - b : a + b;
        let left = calculate(problem.operand1, problem.operand2, problem.operator);
        if (problem.operator2 && problem.operand3 !== undefined) {
            left = calculate(left, problem.operand3, problem.operator2);
        }
        values.push(left);
        if ('operator3' in problem && problem.operator3 && problem.operand3 !== undefined && problem.operand4 !== undefined) {
            values.push(calculate(problem.operand3, problem.operand4, problem.operator3));
        }
    }
    return Number(values.includes(0)) | (Number(values.includes(1)) << 1);
}

export function recentPracticeNumbers(data: MasteryData): number[] {
    const stored = data.practice?.recentNumberMasks;
    return Array.isArray(stored) ? stored.slice(-PRACTICE_NUMBER_HISTORY_SIZE).map(mask =>
        Number.isInteger(mask) && mask >= 0 && mask <= 3 ? mask : 3) : [];
}

export function canDrawPracticeNumbers(mask: number, recent: number[]): boolean {
    return (!(mask & 1) || !recent.slice(-(tuning.zeroSpacing - 1)).some(value => value & 1))
        && (!(mask & 2) || !recent.slice(-(tuning.oneSpacing - 1)).some(value => value & 2));
}

export function rememberPracticeNumbers(recent: number[], mask: number): void {
    recent.push(mask);
    if (recent.length > PRACTICE_NUMBER_HISTORY_SIZE) recent.splice(0, recent.length - PRACTICE_NUMBER_HISTORY_SIZE);
}
