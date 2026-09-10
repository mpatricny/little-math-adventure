import { describe, expect, it } from 'vitest';
import { evaluatePump, underwaterPumpChallenge } from '../UnderwaterPumpProblems';
import { underwaterLockWheels } from '../UnderwaterPuzzleChoices';

describe('physical underwater locks and valves', () => {
    for (const band of ['A', 'B', 'C', 'D', 'E'] as const) it(`${band}: all three pressure readings require exactly one valve configuration`, () => {
        const challenge = underwaterPumpChallenge(band);
        let solutions = 0;
        for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) for (let c = 0; c < 4; c++)
            if (evaluatePump(challenge, [a, b, c]).correct) solutions++;
        expect(solutions).toBe(1);
        expect(evaluatePump(challenge, challenge.solution).correct).toBe(true);
        expect(evaluatePump(challenge, challenge.initial).correct).toBe(false);
        expect(evaluatePump(challenge, []).correct).toBe(false);
        expect(new Set(challenge.initial.map((n, i) => (n - challenge.solution[i] + 4) % 4)).size).toBe(3);
    });
    it('letter drums never all start one click away and distractors are independently shuffled', () => {
        for (let seed = 1; seed < 100; seed++) for (const word of ['PROUD', 'PERLA']) {
            const { options, indexes } = underwaterLockWheels(word, seed);
            const distances = options.map((choices, i) => {
                expect(choices).toHaveLength(5);
                expect(new Set(choices).size).toBe(5);
                expect(choices[indexes[i]]).not.toBe(word[i]);
                return (choices.indexOf(word[i]) - indexes[i] + choices.length) % choices.length;
            });
            expect(new Set(distances).size).toBe(4);
        }
    });
});
