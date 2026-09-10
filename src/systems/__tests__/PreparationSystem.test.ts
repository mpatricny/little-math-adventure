import { describe, expect, it } from 'vitest';
import type { PlayerState } from '../../types';
import { PREPARATION_CONFIG, PreparationSystem } from '../PreparationSystem';

function playerWithEquipment(overrides: Partial<PlayerState> = {}): PlayerState {
    return {
        equippedWeapon: 'sword_wooden',
        equippedShield: 'shield_wooden',
        ...overrides,
    } as PlayerState;
}

describe('PreparationSystem', () => {
    it('requires matching equipped gear', () => {
        const player = playerWithEquipment({
            equippedWeapon: null,
            equippedShield: null,
        });

        expect(PreparationSystem.prepare(player, 'sword', 3)).toBe(false);
        expect(PreparationSystem.prepare(player, 'shield', 3)).toBe(false);
        expect(PreparationSystem.getState(player)).toEqual({ kind: null, charges: 0 });
    });

    it('keeps only one active preparation and clamps its charges', () => {
        const player = playerWithEquipment();

        expect(PreparationSystem.prepare(player, 'sword', 99)).toBe(true);
        expect(PreparationSystem.getState(player)).toEqual({
            kind: 'sword',
            charges: PREPARATION_CONFIG.maxCharges,
        });

        expect(PreparationSystem.prepare(player, 'shield', 2)).toBe(true);
        expect(PreparationSystem.getState(player)).toEqual({ kind: 'shield', charges: 2 });
    });

    it('does not replace an existing preparation with a zero-charge result', () => {
        const player = playerWithEquipment();
        PreparationSystem.prepare(player, 'sword', 2);

        expect(PreparationSystem.prepare(player, 'shield', 0)).toBe(false);
        expect(PreparationSystem.getState(player)).toEqual({ kind: 'sword', charges: 2 });
    });

    it('consumes one matching charge and clears the state at zero', () => {
        const player = playerWithEquipment();
        PreparationSystem.prepare(player, 'sword', 2);

        expect(PreparationSystem.consume(player, 'shield')).toEqual({
            applied: false,
            bonus: 0,
            remainingCharges: 2,
        });
        expect(PreparationSystem.consume(player, 'sword')).toEqual({
            applied: true,
            bonus: PREPARATION_CONFIG.effects.sword.damagePerCharge,
            remainingCharges: 1,
        });
        expect(PreparationSystem.consume(player, 'sword').remainingCharges).toBe(0);
        expect(PreparationSystem.getState(player)).toEqual({ kind: null, charges: 0 });
    });

    it('normalizes malformed save data without granting a charge', () => {
        const player = playerWithEquipment();
        player.preparation = { kind: 'sword', charges: Number.NaN };

        expect(PreparationSystem.getState(player)).toEqual({ kind: null, charges: 0 });
    });
});
