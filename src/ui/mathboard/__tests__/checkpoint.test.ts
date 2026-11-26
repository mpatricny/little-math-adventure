import { describe, expect, it } from 'vitest';
import { validMathBoardCheckpoint, type MathBoardCheckpoint } from '../checkpoint';

function question(): MathBoardCheckpoint {
    return { version: 1, problems: [{ id: 'q', operand1: 2, operand2: 2, operator: '+', answer: 4,
        choices: [3, 4, 5], showVisualHint: false, hintType: 'none' }], index: 0,
        results: [], timings: [], assisted: [], feedback: [], damage: 0, activeTimeMs: 1750,
        currentAssisted: false, support: { symbolAnswers: 0 }, defense: null, sequential: true,
        damageDisplayEnabled: true, stage: 'question', completionDelivered: false };
}
function answered(): MathBoardCheckpoint {
    return { ...question(), results: [true], timings: [1750], assisted: [false], stage: 'feedback',
        feedback: [{ choiceIndex: 1, correct: true, speedCharges: 1, blocked: 0, quickBlock: false }], damage: 5 };
}

describe('MathBoard checkpoint validation', () => {
    it('accepts a JSON round trip for a timed question, accepted answer and delivered completion', () => {
        for (const value of [question(), answered(), { ...answered(), index: 1, stage: 'complete', completionDelivered: true }]) {
            expect(validMathBoardCheckpoint(JSON.parse(JSON.stringify(value)))).toBe(true);
        }
    });
    it('rejects mismatched results or feedback rather than allowing another attempt', () => {
        expect(validMathBoardCheckpoint({ ...answered(), stage: 'question' })).toBe(false);
        expect(validMathBoardCheckpoint({ ...answered(), feedback: [] })).toBe(false);
        expect(validMathBoardCheckpoint({ ...answered(), timings: [NaN] })).toBe(false);
        expect(validMathBoardCheckpoint({ ...question(), completionDelivered: true })).toBe(false);
        const badChoice = answered(); badChoice.feedback[0].choiceIndex = 3;
        expect(validMathBoardCheckpoint(badChoice)).toBe(false);
    });
    it('requires a valid demonstration and valid defense configuration', () => {
        expect(validMathBoardCheckpoint({ ...question(), stage: 'demo', demoStage: 'size_crocodile' })).toBe(true);
        expect(validMathBoardCheckpoint({ ...question(), stage: 'demo' })).toBe(false);
        expect(validMathBoardCheckpoint({ ...question(), defense: { power: 2, incomingDamage: 4 } })).toBe(true);
        expect(validMathBoardCheckpoint({ ...question(), defense: { power: NaN, incomingDamage: 4 } })).toBe(false);
    });
});
