import { describe, expect, it } from 'vitest';
import type { PlayerState, PracticeTargetId } from '../../types';
import type { FoxAbilityBattleSnapshot, FoxAbilityContext, FoxRuneTier } from '../../types/foxAbilities';
import { getPetAttackPower } from '../CatacombPetProgress';
import { awardFoxRune, FOX_ABILITY_CONFIG, FoxAbilitySystem, getFoxJourney } from '../FoxAbilitySystem';
import { legacyFoxJourney } from './legacyFoxJourney';

function player(tiers: Partial<Record<PracticeTargetId, FoxRuneTier>> = {}) {
    return { catacombFoxJourney: legacyFoxJourney(tiers) };
}

function setup(commit = (_snapshot: FoxAbilityBattleSnapshot) => true) {
    const owners = [
        { id: 'A' as const, profileId: 'kitten-profile', player: player({ A1: 2, A2: 2, A3: 2 }) },
        { id: 'B' as const, profileId: 'eli-profile', player: player({ C2: 1, C3: 1, C1: 1 }) },
    ];
    const system = new FoxAbilitySystem('wave-1-attempt-7', owners, commit);
    const context: FoxAbilityContext = {
        phase: 'player_turn', paused: false,
        owners: {
            A: { hp: 18, maxHp: 24, foxEquipped: true },
            B: { hp: 19, maxHp: 25, foxEquipped: true },
        },
        targets: [{ id: 'phase-1:crab:0', hp: 9, defense: 99 }, { id: 'phase-1:crab:1', hp: 1, defense: 0 }],
    };
    return { owners, system, context };
}

describe('earned fox runes', () => {
    it('leaves old saves, owned fox and existing attack unchanged', () => {
        const legacy = { catacombFoxBonus: 4, catacombPetUpgrades: { E: 4 }, activePet: 'pet_catacomb_A', catacombFoxJourney: undefined };
        const before = structuredClone(legacy);
        expect(getFoxJourney(legacy)).toMatchObject({ points: 0, form: '01', powers: { shield: 0, heal: 0, strike: 0 } });
        expect(getPetAttackPower({ id: 'pet_catacomb_A', damageMultiplier: 6 }, legacy)).toBe(10);
        expect(legacy).toEqual(before);
    });

    it('preserves a historical contribution when a new tier banks a point, and rejects repeat receipts', () => {
        const value = player({ A1: 1 });
        const first = getFoxJourney(value).powers.shield;
        expect(awardFoxRune(value, 'A1', 2, { evidenceId: 'new-tier', earnedAt: 2 })).toBe(true);
        expect(getFoxJourney(value)).toMatchObject({ points: 2, availablePoints: 0, powers: { shield: first } });
        expect(value.catacombFoxJourney.awards.A1?.II?.allocation).toBeNull();
        expect(awardFoxRune(value, 'A1', 2, { evidenceId: 'new-tier', earnedAt: 2 })).toBe(false);
        expect(awardFoxRune(value, 'A4', 1, { evidenceId: 'new-tier', earnedAt: 2 })).toBe(false);
        expect(awardFoxRune(value, 'B3', 2, { evidenceId: 'skip-tier-I', earnedAt: 2 })).toBe(false);
    });

    it('sums independent modules and keeps the fixed appearance milestones', () => {
        const value = player({ A1: 2, A4: 2 });
        expect(getFoxJourney(value)).toMatchObject({ points: 4, form: '02', powers: { shield: 2 * FOX_ABILITY_CONFIG.contribution.shield[2] } });
        for (const id of ['A2', 'A3', 'B1'] as const) {
            awardFoxRune(value, id, 1, { evidenceId: `${id}-I`, earnedAt: 3 });
            awardFoxRune(value, id, 2, { evidenceId: `${id}-II`, earnedAt: 4 });
        }
        expect(getFoxJourney(value)).toMatchObject({ points: 10, form: '03' });
    });

    it('does not invent awards for malformed or future-version records', () => {
        const invalid = { catacombFoxJourney: { version: 1, awards: { A1: { II: { evidenceId: 'orphan', earnedAt: 1 } } } } } as PlayerState;
        expect(getFoxJourney(invalid).points).toBe(0);
        const future = { catacombFoxJourney: { version: 2, awards: {} } } as unknown as PlayerState;
        expect(awardFoxRune(future, 'A1', 1, { evidenceId: 'x', earnedAt: 1 })).toBe(false);
        expect(future.catacombFoxJourney?.version).toBe(2);
    });
});

describe('fox abilities in combat', () => {
    it('uses the explicitly selected owner while the ordinary turn belongs to A', () => {
        const { system, context } = setup();
        const result = system.useAbility('B', 'heal', context);
        expect(result).toMatchObject({ ok: true, effect: { owner: 'B', before: 19, after: 20 } });
        expect(system.readOwner('A', context).heal.used).toBe(false);
        expect(system.readOwner('B', context).heal.used).toBe(true);
        expect(context.owners.A?.hp).toBe(18); // HP effects belong to the adapter, not a global singleton.
    });

    it('caps healing and does not consume it at full health or on a fallen hero', () => {
        const { system, context } = setup();
        context.owners.A!.hp = 24;
        expect(system.useAbility('A', 'heal', context)).toEqual({ ok: false, reason: 'full-health' });
        context.owners.A!.hp = 0;
        expect(system.useAbility('A', 'heal', context)).toEqual({ ok: false, reason: 'fallen' });
        context.owners.A!.hp = 23;
        expect(system.useAbility('A', 'heal', context)).toMatchObject({ ok: true, effect: { amount: 1, after: 24 } });
    });

    it.each(['enemy_turn', 'enemy_attack', 'player_defend'] as const)('blocks the complete %s defense phase without spending', phase => {
        const { system, context } = setup();
        context.phase = phase;
        expect(system.useAbility('A', 'strike', context, 'phase-1:crab:0')).toEqual({ ok: false, reason: 'defense' });
        expect(system.snapshot().effects).toHaveLength(0);
    });

    it('also respects the defense edge guard, pause, ended combat and animation busy state', () => {
        const { system, context } = setup();
        for (const [patch, reason] of [
            [{ defenseActive: true }, 'defense'], [{ paused: true }, 'paused'],
            [{ busy: true }, 'busy'], [{ phase: 'victory' }, 'battle-ended'],
        ] as const) {
            expect(system.useAbility('A', 'shield', { ...context, ...patch })).toEqual({ ok: false, reason });
        }
    });

    it('does not spend on an absent, dead or ambiguous target, then applies direct damage once', () => {
        const { system, context } = setup();
        expect(system.useAbility('A', 'strike', context, 'missing')).toEqual({ ok: false, reason: 'invalid-target' });
        expect(system.useAbility('A', 'strike', { ...context, targets: [...context.targets, context.targets[0]] }, context.targets[0].id))
            .toEqual({ ok: false, reason: 'invalid-target' });
        const result = system.useAbility('A', 'strike', context, 'phase-1:crab:0');
        expect(result).toMatchObject({ ok: true, effect: { amount: 2, before: 9, after: 7, targetId: 'phase-1:crab:0' } });
        expect(system.useAbility('A', 'strike', context, 'phase-1:crab:0')).toEqual({ ok: false, reason: 'used' });
        expect(system.readOwner('B', context).strike.used).toBe(false);
    });

    it('caps a killing strike at the remaining target HP', () => {
        const { system, context } = setup();
        expect(system.useAbility('A', 'strike', context, 'phase-1:crab:1')).toMatchObject({ ok: true, effect: { amount: 1, after: 0 } });
    });

    it('persists finite protection, consumes only residual damage and keeps owners separate', () => {
        const { system, context } = setup();
        system.useAbility('A', 'shield', context);
        expect(system.absorbDamage('A', 0)).toMatchObject({ damage: 0, blocked: 0, remainingShield: 2 });
        expect(system.absorbDamage('B', 5)).toMatchObject({ damage: 5, blocked: 0 });
        expect(system.absorbDamage('A', 1)).toMatchObject({ damage: 0, blocked: 1, remainingShield: 1 });
        expect(system.absorbDamage('A', 4)).toMatchObject({ damage: 3, blocked: 1, remainingShield: 0 });
        expect(system.useAbility('A', 'shield', context)).toEqual({ ok: false, reason: 'used' });
    });

    it('leaves both effect and use uncommitted when persistence fails', () => {
        const { system, context } = setup(() => false);
        expect(system.useAbility('A', 'heal', context)).toEqual({ ok: false, reason: 'persistence-failed' });
        expect(system.readOwner('A', context).heal.used).toBe(false);
        expect(system.snapshot().effects).toEqual([]);
    });

    it('blocks a re-entrant second click during a commit and isolates callback snapshots', () => {
        let second: unknown;
        const { owners, context } = setup();
        const system = new FoxAbilitySystem('same', owners, snapshot => {
            second = system.useAbility('A', 'heal', context);
            snapshot.owners.A!.used.heal = false;
            return true;
        });
        expect(system.useAbility('A', 'heal', context).ok).toBe(true);
        expect(second).toEqual({ ok: false, reason: 'busy' });
        expect(system.snapshot().owners.A?.used.heal).toBe(true);
    });

    it('restores spent uses and partial shield without replaying effects or resetting on a new turn', () => {
        const { system, context, owners } = setup();
        system.useAbility('A', 'shield', context);
        system.absorbDamage('A', 1);
        system.useAbility('B', 'strike', context, 'phase-1:crab:0');
        const snapshot = JSON.parse(JSON.stringify(system.snapshot())) as FoxAbilityBattleSnapshot;
        let commits = 0;
        const restored = new FoxAbilitySystem(snapshot.battleId, owners, () => { commits++; return true; }, snapshot);
        context.phase = 'pet_b_turn';
        expect(restored.readOwner('B', context).strike.disabledReason).toBe('used');
        expect(restored.snapshot().owners.A?.shieldRemaining).toBe(1);
        expect(commits).toBe(0);
        expect(restored.snapshot().effects).toEqual(snapshot.effects);
    });

    it('rejects mismatched/partial checkpoints instead of granting fresh uses', () => {
        const { system, context, owners } = setup();
        system.useAbility('A', 'shield', context);
        const snapshot = system.snapshot();
        expect(FoxAbilitySystem.canRestore(snapshot, 'different-battle', owners)).toBe(false);
        expect(FoxAbilitySystem.canRestore(snapshot, snapshot.battleId, [{ ...owners[0], profileId: 'other-profile' }, owners[1]])).toBe(false);
        expect(FoxAbilitySystem.canRestore({ ...snapshot, effects: [] }, snapshot.battleId, owners)).toBe(false);
        snapshot.effects[0].amount = 999;
        expect(FoxAbilitySystem.canRestore(snapshot, snapshot.battleId, owners)).toBe(false);
    });

    it('closes the battle without restoring charges; only a new battle has new uses', () => {
        const { system, context, owners } = setup();
        system.useAbility('A', 'shield', context);
        expect(system.close()).toBe(true);
        expect(system.readOwner('A', context).heal.disabledReason).toBe('battle-ended');
        expect(system.snapshot().owners.A?.shieldRemaining).toBe(0);
        const next = new FoxAbilitySystem('next-wave', owners, () => true);
        expect(next.readOwner('A', context).shield.used).toBe(false);
        expect(next.snapshot().effects).toEqual([]);
    });
});
