const COMPARISON_SYMBOLS = ['<', '=', '>'];

function displayOp(op: string | undefined): string {
    if (op === '*') return '×';
    return op || '+';
}

/** Fields needed for formatting — satisfied by both MathProblem and MathProblemDef */
interface FormattableProblem {
    operand1: number;
    operand2: number;
    operand3?: number;
    operand4?: number;
    operator: string;
    operator2?: string;
    operator3?: string;
    answer: number;
    problemType?: string;
}

/**
 * Single source of truth for formatting math problems as display strings.
 *
 * @param mode
 *   - 'question' — active problem: uses ○ for comparisons, ? for unknowns
 *   - 'answer'   — feedback/resolved: uses <​/=/> for comparisons, shows actual values
 */
export function formatMathProblem(problem: FormattableProblem, mode: 'question' | 'answer'): string {
    const { operand1, operand2, operand3, operand4, operator, operator2, operator3, answer } = problem;
    const op = displayOp(operator);
    const isThreeOp = operand4 !== undefined && operator2;

    switch (problem.problemType) {
        case 'comparison_eq_vs_eq': {
            const sym = mode === 'question' ? '○' : COMPARISON_SYMBOLS[answer];
            if (operand4 !== undefined && operator3) {
                const rightOp = displayOp(operator3);
                return `${operand1} ${op} ${operand2} ${sym} ${operand3} ${rightOp} ${operand4}`;
            }
            return `${operand1} ${op} ${operand2} ${sym} ${operand3}`;
        }

        case 'comparison': {
            const sym = mode === 'question' ? '○' : COMPARISON_SYMBOLS[answer];
            if (isThreeOp) {
                const op2 = displayOp(operator2);
                return `${operand1} ${op} ${operand2} ${op2} ${operand3} ${sym} ${operand4}`;
            }
            return `${operand1} ${op} ${operand2} ${sym} ${operand3}`;
        }

        case 'missing_operand': {
            const val = mode === 'question' ? '?' : String(answer);
            if (operand3 !== undefined && operator2) {
                const op2 = displayOp(operator2);
                return `${operand1} ${op} ${val} ${op2} ${operand3} = ${operand2}`;
            }
            return `${operand1} ${op} ${val} = ${operand2}`;
        }

        default: {
            // Standard / result_unknown
            const rhs = mode === 'question' ? '?' : String(answer);
            if (operand3 !== undefined && operator2) {
                const op2 = displayOp(operator2);
                return `${operand1} ${op} ${operand2} ${op2} ${operand3} = ${rhs}`;
            }
            return `${operand1} ${op} ${operand2} = ${rhs}`;
        }
    }
}
