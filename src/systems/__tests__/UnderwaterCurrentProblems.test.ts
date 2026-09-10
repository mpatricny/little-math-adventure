import { describe, expect, it } from 'vitest';
import { evaluateCurrents, underwaterCurrentChallenge } from '../UnderwaterCurrentProblems';
import { bandProfile } from '../puzzles/PuzzleDifficulty';
import { seededRandom } from '../puzzles/PuzzleRandom';

describe('shared underwater currents', () => {
    for (const band of ['A', 'B', 'C', 'D', 'E'] as const) it(`${band}: solvable with unique pearls and accepts every valid plan`, () => {
        const challenge = underwaterCurrentChallenge(band, seededRandom(481));
        expect(challenge.cards).toHaveLength(6);
        expect(new Set(challenge.cards).size).toBe(challenge.cards.length);
        expect(challenge.starts.every(n => n >= 0 && n <= bandProfile(band).max)).toBe(true);
        expect(challenge.solutions.length).toBeGreaterThan(0);
        for (const solution of challenge.solutions) {
            const result = evaluateCurrents(challenge, solution);
            expect(result.correct).toBe(true);
            expect(result.targets).toEqual(challenge.targets);
            expect(result.shared.every(v => v >= 0)).toBe(true);
        }
        expect(evaluateCurrents(challenge, [null, null, null]).valid).toBe(false);
        expect(evaluateCurrents(challenge, []).valid).toBe(false);
        expect(evaluateCurrents(challenge, [0, 0, 1]).valid).toBe(false);
        expect(evaluateCurrents(challenge, [0, 1, 99]).valid).toBe(false);
    });

    it('the first pearl affects both routes; the other pearls only affect their own route', () => {
        const challenge = underwaterCurrentChallenge('D');
        const first = evaluateCurrents(challenge, [0, 1, 2]);
        const second = evaluateCurrents(challenge, [3, 1, 2]);
        expect(second.targets.map((v, i) => v - first.targets[i]))
            .toEqual([challenge.cards[3] - challenge.cards[0], challenge.cards[3] - challenge.cards[0]]);
        const branch = evaluateCurrents(challenge, [0, 3, 2]);
        expect(branch.targets[1]).toBe(first.targets[1]);
        expect(branch.targets[0]).not.toBe(first.targets[0]);
    });
});
