import { describe, expect, it } from 'vitest';
import type { BattleFoxAbilityCheckpoint, BattleFoxCheckpointStore, BattleFoxCombatCheckpoint } from '../../types/foxBattleSession';
import type { PlayerState } from '../../types';
import { BattleFoxAbilitySession } from '../BattleFoxAbilitySession';
import { legacyFoxJourney } from './legacyFoxJourney';

function fixture() {
    const player: Pick<PlayerState, 'catacombFoxJourney'> = { catacombFoxJourney: legacyFoxJourney({ A1: 2, A2: 2, A3: 2 }) };
    const owners = [{ id: 'A' as const, profileId: 'profile-1', player }, { id: 'B' as const, profileId: 'profile-2', player: {} }];
    let combat: BattleFoxCombatCheckpoint = {
        battle: { phase: 'player_math', playerHp: 20, playerBHp: 21, playerBMaxHp: 25,
            enemies: [{ id: 'crab', name: 'Crab', spriteKey: 'crab', hp: 8, maxHp: 8, attack: 3, defense: 9 }],
            selectedEnemyIndex: 0, currentProblems: [], currentProblemIndex: 0, damageDealt: 0, turnCount: 2 },
        enemyKeys: ['phase-1:crab:0'],
        owners: {
            A: { maxHp: 24, foxEquipped: true, shieldEquipped: true, preparation: { kind: 'shield', charges: 2 } },
            B: { maxHp: 25, foxEquipped: true, shieldEquipped: false, preparation: { kind: null, charges: 0 } },
        },
        activeOwner: 'A', turnToken: 'turn-2:A', paused: false, defenseActive: false, busy: false,
        resumeData: { bossPhase: 0, math: { currentIndex: 2, activeTimeMs: 1234 } },
    };
    let stored: BattleFoxAbilityCheckpoint | null = null;
    let failWrites = false;
    const store: BattleFoxCheckpointStore = {
        read: () => structuredClone(stored),
        write: (value, expected) => {
            if (failWrites || (expected ? stored?.battleId !== expected.battleId || stored?.revision !== expected.revision : stored !== null)) return false;
            stored = structuredClone(value);
            return true;
        },
    };
    const options = { encounterKey: 'arena:6:wave:2', owners, store, capture: () => structuredClone(combat), newBattleId: () => 'battle-7' };
    const opened = BattleFoxAbilitySession.open(options);
    if (!opened.ok) throw new Error(opened.reason);
    return { options, session: opened.session,
        apply: (value: BattleFoxCombatCheckpoint) => { combat = structuredClone(value); },
        live: () => combat, stored: () => stored!, fail: () => { failWrites = true; } };
}

describe('durable combat/fox session', () => {
    it('commits healing, use receipt and unfinished math state in one revision', () => {
        const f = fixture();
        const result = f.session.useAbility('A', 'heal');
        expect(result.ok).toBe(true);
        expect(f.stored().ledger.owners.A?.used.heal).toBe(true);
        expect(f.stored().combat.battle.playerHp).toBe(22);
        expect(f.stored().combat.battle.playerBHp).toBe(21);
        expect(f.stored().combat.resumeData).toEqual(f.live().resumeData);
        expect(f.live().battle.playerHp).toBe(20); // Caller applies only after successful persistence.
        if (result.ok) f.apply(result.combat);
        expect(f.live().battle.playerHp).toBe(22);
    });

    it('resumes the same battle, enemy damage and used ability after a simulated reload', () => {
        const f = fixture();
        const result = f.session.useAbility('A', 'strike', 'phase-1:crab:0');
        if (!result.ok) throw new Error(result.reason);
        f.apply(result.combat);
        const opened = BattleFoxAbilitySession.open({ ...f.options, newBattleId: () => 'must-not-be-used' });
        expect(opened.ok).toBe(true);
        if (!opened.ok) return;
        expect(opened.resumed).toBe(true);
        expect(opened.session.snapshot().battleId).toBe('battle-7');
        expect(opened.combat.battle.enemies[0].hp).toBe(6);
        expect(opened.session.readOwner('A').strike.disabledReason).toBe('used');
    });

    it('does not let another active encounter silently refill uses', () => {
        const f = fixture();
        expect(BattleFoxAbilitySession.open({ ...f.options, encounterKey: 'other' }))
            .toEqual({ ok: false, reason: 'different-active-encounter' });
    });

    it('rejects stale simultaneous sessions instead of overwriting a newer effect', () => {
        const f = fixture();
        const stale = BattleFoxAbilitySession.open(f.options);
        if (!stale.ok) throw new Error(stale.reason);
        expect(f.session.useAbility('A', 'heal').ok).toBe(true);
        expect(stale.session.useAbility('A', 'strike', 'phase-1:crab:0')).toEqual({ ok: false, reason: 'persistence-failed' });
        expect(f.stored().ledger.owners.A?.used.strike).toBe(false);
        expect(f.stored().combat.battle.enemies[0].hp).toBe(8);
    });

    it('keeps effects and consumption absent when storage fails', () => {
        const f = fixture();
        f.fail();
        expect(f.session.useAbility('A', 'heal')).toEqual({ ok: false, reason: 'persistence-failed' });
        expect(f.session.readOwner('A').heal.used).toBe(false);
        expect(f.stored().combat.battle.playerHp).toBe(20);
    });

    it('resolves ordinary-block remainder through fox first, then only one useful shop rune', () => {
        const f = fixture();
        const shield = f.session.useAbility('A', 'shield');
        if (!shield.ok) throw new Error(shield.reason);
        f.apply(shield.combat);
        const first = f.session.applyIncomingDamage('A', 1);
        expect(first).toMatchObject({ ok: true, damage: 0, foxBlocked: 1, preparedBlock: 0 });
        if (first.ok) f.apply(first.combat);
        expect(f.stored().combat.owners.A?.preparation.charges).toBe(2);
        const second = f.session.applyIncomingDamage('A', 4);
        expect(second).toMatchObject({ ok: true, damage: 2, foxBlocked: 1, preparedBlock: 1 });
        expect(f.stored().ledger.owners.A?.shieldRemaining).toBe(0);
        expect(f.stored().combat.owners.A?.preparation.charges).toBe(1);
        expect(f.stored().combat.battle.playerHp).toBe(18);
    });

    it('still checkpoints unprotected damage without inventing a fox block', () => {
        const f = fixture();
        const hit = f.session.applyIncomingDamage('B', 5);
        expect(hit).toMatchObject({ ok: true, damage: 5, foxBlocked: 0, preparedBlock: 0 });
        expect(f.stored().combat.battle.playerBHp).toBe(16);
        expect(f.stored().combat.battle.playerHp).toBe(20);
    });

    it('checkpoints ordinary combat changes and preserves opaque scene resume data', () => {
        const f = fixture();
        f.live().battle.enemies[0].hp = 4;
        f.live().battle.phase = 'pet_turn';
        f.live().turnToken = 'turn-2:A:pet';
        f.live().resumeData = { bossPhase: 1, returning: { scene: 'ArenaScene', wave: 2 } };
        expect(f.session.checkpointCombat()).toBe(true);
        expect(f.stored().combat.battle.enemies[0].hp).toBe(4);
        expect(f.stored().combat.resumeData).toEqual(f.live().resumeData);
    });

    it('starts a genuinely new attempt only after the prior battle is closed', () => {
        const f = fixture();
        expect(f.session.close()).toBe(true);
        const next = BattleFoxAbilitySession.open({ ...f.options, newBattleId: () => 'battle-8' });
        if (!next.ok) throw new Error(next.reason);
        expect(next.resumed).toBe(false);
        expect(next.session.snapshot().battleId).toBe('battle-8');
        expect(next.session.snapshot().ledger.owners.A?.used).toEqual({ shield: false, heal: false, strike: false });
    });
});
