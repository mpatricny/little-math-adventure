import { MathProblem } from '../types';

/** True only when the left arithmetic expression contains three operands. */
export function isGenuineThreeOperandProblem(problem: MathProblem): boolean {
    if (!problem.operator2) return false;
    if (problem.problemType === 'comparison') return problem.operand4 !== undefined;
    return problem.operand3 !== undefined;
}

/** Apply the 2× learning-effort reward after equipment/base attack distribution. */
export function applyProblemComplexityDamage(problem: MathProblem): MathProblem {
    if (isGenuineThreeOperandProblem(problem)) {
        problem.damageMultiplier = (problem.damageMultiplier ?? 1) * 2;
    }
    return problem;
}
