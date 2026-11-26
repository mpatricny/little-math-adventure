import { describe, expect, it } from 'vitest';
import { advancedProblems } from '../../../systems/AdvancedCurriculum';
import type { MathProblem } from '../../../types';
import { numberFeedback } from '../numberFeedback';

describe('number feedback after an advanced answer', () => {
    it('uses the decade, inverse operation, and first intermediate result', () => {
        const base: MathProblem = { id: 'example', operand1: 17, operator: '+', operand2: 6,
            answer: 23, choices: [], showVisualHint: false, hintType: 'none' };
        expect(numberFeedback(base)).toEqual(['17 + 3 = 20', '20 + 3 = 23']);
        expect(numberFeedback({ ...base, operand1: 30, operator: '-', operand2: 15, answer: 15 }))
            .toEqual(['30 − 10 = 20', '20 − 5 = 15']);
        expect(numberFeedback({ ...base, problemType: 'missing_operand', operand1: 25, operator: '-', operand2: 9, answer: 16 }))
            .toEqual(['25 − 9 = 16', '25 − 16 = 9']);
        expect(numberFeedback({ ...base, operand3: 11, operator2: '-', answer: 12 }))
            .toEqual(['17 + 6 = 23', '23 − 11 = 12']);
    });

    it('keeps every displayed step true and within 0–100 for the entire catalog', () => {
        for (const p of advancedProblems()) {
            const working = numberFeedback({ ...p, id: p.key, choices: [], hintType: 'none', showVisualHint: false,
                problemType: p.form === 'missing_part' ? 'missing_operand' : 'standard' });
            for (const line of working) {
                const match = /^(\d+) ([+−]) (\d+) = (\d+)$/.exec(line);
                expect(match, p.key).not.toBeNull();
                const [, a, sign, b, answer] = match!;
                expect(sign === '+' ? Number(a) + Number(b) : Number(a) - Number(b), p.key).toBe(Number(answer));
                expect(Math.max(Number(a), Number(b), Number(answer)), p.key).toBeLessThanOrEqual(100);
            }
        }
    });
});
