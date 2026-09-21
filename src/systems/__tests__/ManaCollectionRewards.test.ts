import { describe, expect, it } from 'vitest';
import { manaForCorrectAnswers } from '../ManaCollectionRewards';

describe('mana collection rewards', () => {
    it.each([
        [0, 0], [1, 1], [2, 1], [3, 2], [5, 2], [6, 3], [9, 3],
        [10, 4], [14, 4], [15, 5], [19, 5], [20, 6], [24, 6], [25, 7], [100, 22],
    ])('%i correct answers earn %i mana in total', (correct, mana) => {
        expect(manaForCorrectAnswers(correct)).toBe(mana);
    });

    it('awards only one additional mana at each threshold', () => {
        const earnedAt = Array.from({ length: 30 }, (_, i) => i + 1)
            .filter(correct => manaForCorrectAnswers(correct) > manaForCorrectAnswers(correct - 1));
        expect(earnedAt).toEqual([1, 3, 6, 10, 15, 20, 25, 30]);
    });
});
