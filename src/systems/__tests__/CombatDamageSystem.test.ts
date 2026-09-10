import { describe, expect, it } from 'vitest';
import { damageBonusWouldHelp, resolveDamageAfterDefense } from '../CombatDamageSystem';

describe('resolveDamageAfterDefense', () => {
    it('subtracts defense once from the complete attack total', () => {
        expect(resolveDamageAfterDefense(7, 3)).toEqual({
            rawDamage: 7,
            defense: 3,
            damage: 4,
            blockedDamage: 3,
        });
    });

    it('allows defense to absorb the complete attack', () => {
        expect(resolveDamageAfterDefense(3, 3)).toEqual({
            rawDamage: 3,
            defense: 3,
            damage: 0,
            blockedDamage: 3,
        });
        expect(resolveDamageAfterDefense(2, 4).damage).toBe(0);
    });

    it('never turns negative damage or defense into healing or bonus damage', () => {
        expect(resolveDamageAfterDefense(-2, 3).damage).toBe(0);
        expect(resolveDamageAfterDefense(3, -2).damage).toBe(3);
    });

    it('only spends a damage bonus when it changes post-defense damage', () => {
        expect(damageBonusWouldHelp(1, 1, 3)).toBe(false);
        expect(damageBonusWouldHelp(2, 1, 3)).toBe(false);
        expect(damageBonusWouldHelp(3, 1, 3)).toBe(true);
        expect(damageBonusWouldHelp(4, 1, 3)).toBe(true);
    });
});
