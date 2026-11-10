import { describe, expect, it } from 'vitest';
import { simulateCombatEncounter, seededCombatRandom, type CombatAuditAnswers, type CombatAuditPlayer } from '../CombatEncounterSimulator';
import type { EnemyStats } from '../types';
import type { BossEncounterDefinition } from '../../types/encounters';

const enemy = (hp: number, atk: number, defense = 0): EnemyStats => ({
    id: 'test', name: 'Test', hp, atk, defense, xp: 0, coinMin: 0, coinMax: 0, difficulty: 0,
});
const correct: CombatAuditAnswers = { attack: 1, sword: 1, pet: 1, block: 1, speed: 'slow' };
const hero: CombatAuditPlayer = { maxHp: 50, attack: 10 };
const boss = (phases: BossEncounterDefinition['phases'], tidalWave?: BossEncounterDefinition['tidalWave']): BossEncounterDefinition => ({
    phases, phaseHealPlayer: 0, diamondReward: 0, ...(tidalWave ? { tidalWave } : {}),
});
const phase = (hp: number, attack: number, extras = {}) => ({ hp, attack, defense: 0, name: 'Phase', nameCs: 'Fáze', ...extras });

describe('production roster combat audit', () => {
    it('is seeded and leaves encounter, profile and player inputs untouched', () => {
        const encounter = { enemies: [enemy(30, 3), enemy(30, 3)] };
        const player = { ...hero, weaponId: 'sword_iron', shieldId: 'shield_iron', potion: true };
        const snapshot = JSON.stringify({ encounter, player, correct });
        const first = simulateCombatEncounter(encounter, [player], correct, 42);
        expect(simulateCombatEncounter(encounter, [player], correct, 42)).toEqual(first);
        expect(JSON.stringify({ encounter, player, correct })).toBe(snapshot);
        expect(Array.from({ length: 20 }, seededCombatRandom(9))).toEqual(Array.from({ length: 20 }, seededCombatRandom(9)));
    });

    it('every living enemy attacks during the same round, including after the first dies', () => {
        const result = simulateCombatEncounter({ enemies: [enemy(10, 3), enemy(20, 4)] }, [hero], correct);
        expect(result).toMatchObject({ won: true, rounds: 3, enemyAttacks: 2, playerHp: [42] });
        const simultaneous = simulateCombatEncounter({ enemies: [enemy(100, 3), enemy(100, 4)] }, [hero], correct, 1, 1);
        expect(simultaneous).toMatchObject({ capped: true, enemyAttacks: 2, playerHp: [43] });
    });

    it('subtracts defense once from the complete hero attack and once from its pet', () => {
        const result = simulateCombatEncounter({ enemies: [enemy(13, 0, 3)] }, [{ ...hero, petId: 'pet_wolf' }], correct, 1, 1);
        // Hero 10-3=7, wolf 7-3=4; 11 is below the 13 HP, so this must cap.
        expect(result).toMatchObject({ won: false, capped: true, problems: 4 });
        expect(simulateCombatEncounter({ enemies: [enemy(11, 0, 3)] }, [{ ...hero, petId: 'pet_wolf' }], correct, 1, 1).won).toBe(true);
    });

    it('uses catalog equipment, quick shield doubling and assistance without changing root power', () => {
        const player = { ...hero, shieldId: 'shield_silverpond_tide' };
        const encounter = { enemies: [enemy(100, 10)] };
        expect(simulateCombatEncounter(encounter, [player], correct, 1, 1).playerHp).toEqual([44]);
        expect(simulateCombatEncounter(encounter, [player], { ...correct, speed: 'swift' }, 1, 1).playerHp).toEqual([48]);
        expect(simulateCombatEncounter(encounter, [player], { ...correct, speed: 'swift', assistance: 1 }, 1, 1).playerHp).toEqual([44]);
    });

    it('honors mastery eligibility for charge damage and genuine three-operand 2x power', () => {
        const encounter = { enemies: [enemy(11, 0)] };
        expect(simulateCombatEncounter(encounter, [hero], { ...correct, speed: 'lightning' }, 1, 1).won).toBe(true);
        expect(simulateCombatEncounter(encounter, [hero], { ...correct, speed: 'lightning', chargeEligible: false }, 1, 1).won).toBe(false);
        expect(simulateCombatEncounter({ enemies: [enemy(20, 0)] }, [hero], { ...correct, threeOperand: 1 }, 1, 1).won).toBe(true);
    });

    it('co-op attacks A then B, pets afterward, and all enemies focus one alternating defender', () => {
        const result = simulateCombatEncounter({ enemies: [enemy(1000, 3), enemy(1000, 4)] }, [hero, { ...hero, maxHp: 40 }], correct, 1, 2);
        expect(result).toMatchObject({ enemyAttacks: 4, playerHp: [43, 33] });
    });

    it('phase transition skips remaining allied actions, heals each living hero from own maximum, and immediately attacks', () => {
        const encounter = { enemies: [enemy(100, 0)], boss: boss([phase(1, 0, { healPercent: 20 }), phase(1, 1)]) };
        const result = simulateCombatEncounter(encounter, [{ maxHp: 10, hp: 1, attack: 1 }, { maxHp: 20, hp: 1, attack: 1 }], correct);
        expect(result).toMatchObject({ won: true, rounds: 2, enemyAttacks: 1, problems: 2,
            playerHp: [2, 5], healing: [2, 4], phasesCompleted: 2 });
    });

    it('a full heal potion does not consume an attack turn', () => {
        const result = simulateCombatEncounter({ enemies: [enemy(10, 0)] }, [{ ...hero, hp: 1, potion: true }], correct);
        expect(result).toMatchObject({ won: true, rounds: 1, potionsUsed: 1, playerHp: [50], healing: [49] });
    });

    it('consumes preparation only when production post-defense/block arithmetic helps', () => {
        const sword = { ...hero, preparation: { kind: 'sword' as const, charges: 3 } };
        expect(simulateCombatEncounter({ enemies: [enemy(1, 0, 10)] }, [sword], correct, 1, 1))
            .toMatchObject({ won: true, preparationRemaining: [2] });
        expect(simulateCombatEncounter({ enemies: [enemy(1, 0, 11)] }, [sword], correct, 1, 1))
            .toMatchObject({ capped: true, preparationRemaining: [3] });
        const shield = { ...hero, shieldId: 'shield_silverpond_tide', preparation: { kind: 'shield' as const, charges: 3 } };
        expect(simulateCombatEncounter({ enemies: [enemy(100, 8)] }, [shield], { ...correct, speed: 'swift' }, 1, 1))
            .toMatchObject({ playerHp: [50], preparationRemaining: [3] });
        expect(simulateCombatEncounter({ enemies: [enemy(100, 9)] }, [shield], { ...correct, speed: 'swift' }, 1, 1))
            .toMatchObject({ playerHp: [50], preparationRemaining: [2] });
    });

    it('counts tidal waves per defender and spends each blessing only once', () => {
        const encounter = { enemies: [enemy(1000, 1)], boss: boss([phase(1000, 1, { ability: 'tidal_wave' })],
            { everyTurns: 2, bonusDamage: 4, blessingReduction: 4 }) };
        const result = simulateCombatEncounter(encounter, [{ ...hero, blessing: true }, { ...hero, blessing: true }], correct, 1, 8);
        expect(result).toMatchObject({ tidalWaves: 4, blessingsUsed: 2, playerHp: [42, 42] });
    });

    it('bounds a defense lock rather than hanging or reporting a win', () => {
        const result = simulateCombatEncounter({ enemies: [enemy(10, 0, 100)] }, [hero], correct, 1, 12);
        expect(result).toMatchObject({ capped: true, won: false, rounds: 12 });
    });
});
