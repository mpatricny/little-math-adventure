import { describe, expect, it } from 'vitest';
import { applyProblemComplexityDamage, isGenuineThreeOperandProblem } from '../ProblemComplexity';
import { calculateShieldAnswerBlock } from '../ShieldBlockSystem';
import { MathProblem } from '../../types';
import { ProblemDatabase } from '../ProblemDatabase';

const baseProblem = (overrides: Partial<MathProblem>): MathProblem => ({
    id: 'test', operand1: 2, operand2: 1, operator: '+', answer: 3,
    choices: [2, 3, 4], showVisualHint: false, hintType: 'none', ...overrides,
});

describe('combat learning rules', () => {
    it('never generates a missing operand for the three-operand module', () => {
        expect(ProblemDatabase.getInstance().getProblemsForForm('A3', 'missing_part')).toHaveLength(0);
    });

    it('rewards a genuine three-operand expression after its existing power', () => {
        const ordinaryComparison = baseProblem({ problemType: 'comparison', operand3: 4, answer: 0 });
        const threeOperandComparison = baseProblem({
            problemType: 'comparison', operand3: 1, operand4: 4, operator2: '+', answer: 0,
            damageMultiplier: 3,
        });
        expect(isGenuineThreeOperandProblem(ordinaryComparison)).toBe(false);
        expect(isGenuineThreeOperandProblem(threeOperandComparison)).toBe(true);
        applyProblemComplexityDamage(threeOperandComparison);
        expect(threeOperandComparison.damageMultiplier).toBe(6);
    });

    it('uses one shield answer, doubles only a quick independent block, and caps at damage', () => {
        expect(calculateShieldAnswerBlock(3, 9, true, false, false)).toBe(3);
        expect(calculateShieldAnswerBlock(3, 9, true, true, false)).toBe(6);
        expect(calculateShieldAnswerBlock(3, 4, true, true, false)).toBe(4);
        expect(calculateShieldAnswerBlock(3, 9, true, true, true)).toBe(3);
        expect(calculateShieldAnswerBlock(3, 9, false, true, false)).toBe(0);
    });
});
