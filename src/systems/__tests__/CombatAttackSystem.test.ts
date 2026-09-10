import { describe, expect, it } from 'vitest';
import {
    applyAttackPowerDistribution,
    COMBAT_ATTACK_CONFIG,
    getCoopAttackDamageMultipliers,
    getPlayerAttackDamageMultipliers,
    getPlayerAttackProblemCount,
    type AttackPowerProblem,
} from '../CombatAttackSystem';
import { resolveDamageAfterDefense } from '../CombatDamageSystem';

describe('solo combat attack compression', () => {
    it('uses the shared three-problem combat limit', () => {
        expect(COMBAT_ATTACK_CONFIG.playerAttack.maxProblemsPerTurn).toBe(3);
        expect(getPlayerAttackProblemCount(1)).toBe(1);
        expect(getPlayerAttackProblemCount(3)).toBe(3);
        expect(getPlayerAttackProblemCount(4)).toBe(3);
        expect(getPlayerAttackProblemCount(10)).toBe(3);
    });

    it.each([
        [1, [1]],
        [3, [1, 1, 1]],
        [4, [2, 1, 1]],
        [5, [2, 2, 1]],
        [6, [2, 2, 2]],
        [7, [3, 2, 2]],
        [9, [3, 3, 3]],
        [10, [4, 3, 3]],
        [13, [5, 4, 4]],
        [100, [34, 33, 33]],
    ])('compresses attack %i into the expected multipliers', (attack, expected) => {
        expect(getPlayerAttackDamageMultipliers(attack)).toEqual(expected);
    });

    it('retains the complete uncapped attack value', () => {
        for (let attack = 1; attack <= 100; attack++) {
            const distributedDamage = getPlayerAttackDamageMultipliers(attack)
                .reduce((sum, multiplier) => sum + multiplier, 0);

            expect(distributedDamage).toBe(attack);
        }
    });

    it('normalizes invalid attack values without creating attack problems', () => {
        expect(getPlayerAttackProblemCount(0)).toBe(0);
        expect(getPlayerAttackProblemCount(-3)).toBe(0);
        expect(getPlayerAttackProblemCount(Number.NaN)).toBe(0);
        expect(getPlayerAttackDamageMultipliers(Number.POSITIVE_INFINITY)).toEqual([]);
    });
});

describe('attack power application', () => {
    it('applies the same compressed power to boss and fallback base problems', () => {
        const bossProblems: AttackPowerProblem[] = [
            { source: 'player' as const },
            { source: 'player' as const },
            { source: 'player' as const },
        ];
        const fallbackProblems: AttackPowerProblem[] = [{}, {}, {}];

        expect(applyAttackPowerDistribution(bossProblems, 7, 'solo')).toEqual([3, 2, 2]);
        expect(applyAttackPowerDistribution(fallbackProblems, 7, 'solo')).toEqual([3, 2, 2]);
        expect(bossProblems.map(problem => problem.damageMultiplier)).toEqual([3, 2, 2]);
        expect(fallbackProblems.map(problem => problem.damageMultiplier)).toEqual([3, 2, 2]);
    });

    it('leaves sword and pet multipliers independent from base attack power', () => {
        const problems: AttackPowerProblem[] = [
            { source: 'player' as const },
            { source: 'sword' as const, damageMultiplier: 2 },
            { source: 'player' as const },
            { source: 'pet' as const, damageMultiplier: 3 },
            { source: 'player' as const },
        ];

        applyAttackPowerDistribution(problems, 10, 'solo');

        expect(problems.map(problem => problem.damageMultiplier)).toEqual([4, 2, 3, 3, 3]);
    });

    it('still subtracts enemy defense once from the compressed total', () => {
        const problems: AttackPowerProblem[] = [{}, {}, {}];
        applyAttackPowerDistribution(problems, 10, 'solo');
        const rawDamage = problems.reduce<number>(
            (sum, problem) => sum + (problem.damageMultiplier ?? 1),
            0,
        );

        expect(resolveDamageAfterDefense(rawDamage, 4)).toMatchObject({
            rawDamage: 10,
            defense: 4,
            damage: 6,
        });
    });
});

describe('co-op attack compatibility', () => {
    it('keeps the existing shared-problem multiplier curve', () => {
        expect(getCoopAttackDamageMultipliers(4, 5)).toEqual([1, 1, 1, 1, 1]);
        expect(getCoopAttackDamageMultipliers(7, 5)).toEqual([2, 2, 1, 1, 1]);
        expect(getCoopAttackDamageMultipliers(13, 5)).toEqual([2, 2, 2, 2, 2]);
    });

    it('does not count the sword bonus problem as a shared co-op problem', () => {
        const problems: AttackPowerProblem[] = [
            { source: 'player' as const },
            { source: 'player' as const },
            { source: 'sword' as const, damageMultiplier: 2 },
        ];

        expect(applyAttackPowerDistribution(problems, 7, 'coop')).toEqual([2, 2]);
        expect(problems.map(problem => problem.damageMultiplier)).toEqual([2, 2, 2]);
    });
});
