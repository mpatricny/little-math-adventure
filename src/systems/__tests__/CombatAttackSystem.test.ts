import { describe, expect, it } from 'vitest';
import {
    applyAttackPowerDistribution,
    COMBAT_ATTACK_CONFIG,
    getPlayerAttackDamageMultipliers,
    getPlayerAttackProblemCount,
    type AttackPowerProblem,
} from '../CombatAttackSystem';
import { resolveDamageAfterDefense } from '../CombatDamageSystem';

describe('shared solo/co-op combat attack compression', () => {
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

        expect(applyAttackPowerDistribution(bossProblems, 7)).toEqual([3, 2, 2]);
        expect(applyAttackPowerDistribution(fallbackProblems, 7)).toEqual([3, 2, 2]);
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

        applyAttackPowerDistribution(problems, 10);

        expect(problems.map(problem => problem.damageMultiplier)).toEqual([4, 2, 3, 3, 3]);
    });

    it('still subtracts enemy defense once from the compressed total', () => {
        const problems: AttackPowerProblem[] = [{}, {}, {}];
        applyAttackPowerDistribution(problems, 10);
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

describe('equipment-independent hero power', () => {
    it.each([1, 2, 3])('retains every hero attack from 1 to 100 with sword power %i', swordPower => {
        for (let attack = 1; attack <= 100; attack++) {
            const count = getPlayerAttackProblemCount(attack);
            const problems: AttackPowerProblem[] = [
                ...Array.from({ length: count }, () => ({ source: 'player' as const })),
                { source: 'sword', damageMultiplier: swordPower },
            ];
            const powers = applyAttackPowerDistribution(problems, attack);
            expect(powers).toHaveLength(count);
            expect(powers.reduce((sum, power) => sum + power, 0)).toBe(attack);
            expect(problems.at(-1)?.damageMultiplier).toBe(swordPower);
            expect(problems).toHaveLength(count + 1);
        }
    });
});
