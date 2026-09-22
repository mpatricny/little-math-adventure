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
    comparisonMeta?: {
        representation: 'size' | 'count' | 'number' | 'expression';
        leftValue: number;
        rightValue: number;
    };
}

/** Keep full expressions on both sides; never infer a side from the answer code. */
export function getComparisonExpressions(problem: FormattableProblem): { left: string; right: string } | null {
    const { operand1, operand2, operand3, operand4, operator, operator2, operator3, comparisonMeta: meta } = problem;
    if (meta) {
        return {
            left: meta.representation === 'expression' ? `${operand1} ${displayOp(operator)} ${operand2}` : String(meta.leftValue),
            right: String(meta.rightValue),
        };
    }
    if (problem.problemType !== 'comparison' && problem.problemType !== 'comparison_eq_vs_eq') return null;
    const left = `${operand1} ${displayOp(operator)} ${operand2}`;
    if (problem.problemType === 'comparison_eq_vs_eq') {
        return { left, right: operand4 !== undefined && operator3
            ? `${operand3} ${displayOp(operator3)} ${operand4}` : String(operand3) };
    }
    return operand4 !== undefined && operator2
        ? { left: `${left} ${displayOp(operator2)} ${operand3}`, right: String(operand4) }
        : { left, right: String(operand3) };
}

/**
 * Single source of truth for formatting math problems as display strings.
 *
 * @param mode
 *   - 'question' — active problem: leaves a blank relation, ? for unknown numbers
 *   - 'answer'   — feedback/resolved: uses <​/=/> for comparisons, shows actual values
 */
export function formatMathProblem(problem: FormattableProblem, mode: 'question' | 'answer'): string {
    const { operand1, operand2, operand3, operator, operator2, answer } = problem;
    const op = displayOp(operator);

    // Visual consumers draw a dashed slot using getComparisonExpressions().
    // Plain-text fallbacks also leave this space empty, never a circle or '='.
    const comparison = getComparisonExpressions(problem);
    if (comparison) {
        if (mode === 'question') return `${comparison.left} \u2003 ${comparison.right}`;
        const symbol = COMPARISON_SYMBOLS[answer];
        const representation = problem.comparisonMeta?.representation;
        if (representation === 'size' || representation === 'count') return `Správně: ${symbol}`;
        return `${comparison.left} ${symbol} ${comparison.right}`;
    }

    switch (problem.problemType) {
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
