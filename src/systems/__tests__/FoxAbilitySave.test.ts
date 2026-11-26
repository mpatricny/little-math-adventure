import { beforeEach, describe, expect, it } from 'vitest';
import type { MathStats, PlayerState, SaveSlotData } from '../../types';
import type { BattleFoxAbilityCheckpoint } from '../../types/foxBattleSession';
import { SaveSystem } from '../SaveSystem';

let entries: Map<string, string>;
let quotaFailure = false;
beforeEach(() => {
    entries = new Map();
    quotaFailure = false;
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
        getItem: (key: string) => entries.get(key) ?? null,
        setItem: (key: string, value: string) => { if (quotaFailure) throw new Error('Quota'); entries.set(key, value); },
        removeItem: (key: string) => entries.delete(key),
        clear: () => entries.clear(),
        key: (index: number) => [...entries.keys()][index] ?? null,
        get length() { return entries.size; },
    } satisfies Storage });
});

function seed(slot: number, id: string): SaveSlotData {
    const player = { name: id, gameplayProfileId: id, characterType: 'girl_knight', level: 11,
        hp: 24, maxHp: 24, attack: 4, defense: 1, activePet: 'pet_silverpond_mill_turtle',
        catacombFoxBonus: 4, coins: { copper: 9, silver: 2, gold: 1 } } as unknown as PlayerState;
    const mathStats = { totalAttempts: 40, correctAnswers: 39, recentResults: [], currentDifficulty: 1,
        highestDifficulty: 1, problemStats: {}, currentPool: [], poolCycle: 0, dailyAttempts: 4,
        lastAttemptDate: '2026-11-21' } as MathStats;
    SaveSystem.save(slot, player, mathStats);
    return SaveSystem.readSnapshot(slot)!;
}

function checkpoint(profileId = 'host', revision = 0): BattleFoxAbilityCheckpoint {
    return {
        version: 1, encounterKey: 'arena-6-wave-1', battleId: 'battle-7', revision,
        ledger: { version: 1, battleId: 'battle-7', status: 'active', effects: [], owners: {
            A: { profileId, powers: { shield: 0, heal: 0, strike: 0 }, used: { shield: false, heal: false, strike: false }, shieldRemaining: 0 },
        } },
        combat: { battle: { phase: 'player_turn', playerHp: 24, enemies: [], selectedEnemyIndex: -1,
            currentProblems: [], currentProblemIndex: 0, damageDealt: 0, turnCount: 1 }, enemyKeys: [],
            owners: { A: { maxHp: 24, foxEquipped: false, shieldEquipped: false, preparation: { kind: null, charges: 0 } } },
            activeOwner: 'A', turnToken: 'turn-1', paused: false, defenseActive: false, busy: false, resumeData: {} },
    };
}

describe('host save checkpoints', () => {
    it('patches one field while keeping family progress and other slots unchanged', () => {
        const before = seed(1, 'host');
        seed(6, 'guest');
        const guestBefore = entries.get('littleMathAdventure_slot_6');
        expect(SaveSystem.writeFoxAbilityCheckpoint(1, 'host', checkpoint(), null)).toBe(true);
        const after = SaveSystem.readSnapshot(1)!;
        const { foxAbilityBattle, ...player } = after.player;
        expect(player).toEqual(before.player);
        expect(after.mathStats).toEqual(before.mathStats);
        expect(foxAbilityBattle).toEqual(checkpoint());
        expect(entries.get('littleMathAdventure_slot_6')).toBe(guestBefore);
    });

    it('retains current unsaved learning and keeps the live host reference up to date', () => {
        const live = seed(1, 'host');
        live.mathStats.totalAttempts = 41;
        live.player.hp = 22;
        expect(SaveSystem.writeFoxAbilityCheckpoint(1, 'host', checkpoint(), null, live)).toBe(true);
        expect(live.player.foxAbilityBattle).toEqual(checkpoint());
        SaveSystem.save(1, live.player, live.mathStats);
        expect(SaveSystem.readSnapshot(1)?.player.foxAbilityBattle).toEqual(checkpoint());
        expect(SaveSystem.readSnapshot(1)?.mathStats.totalAttempts).toBe(41);
    });

    it('rejects wrong profile, stale revision and an unrelated active singleton', () => {
        seed(1, 'host');
        const guest = seed(6, 'guest');
        expect(SaveSystem.writeFoxAbilityCheckpoint(1, 'guest', checkpoint('guest'), null)).toBe(false);
        expect(SaveSystem.writeFoxAbilityCheckpoint(1, 'host', checkpoint(), null, guest)).toBe(false);
        expect(SaveSystem.writeFoxAbilityCheckpoint(1, 'host', checkpoint(), null)).toBe(true);
        expect(SaveSystem.writeFoxAbilityCheckpoint(1, 'host', checkpoint('host', 1), { battleId: 'battle-7', revision: 0 })).toBe(true);
        expect(SaveSystem.writeFoxAbilityCheckpoint(1, 'host', checkpoint('host', 2), { battleId: 'battle-7', revision: 0 })).toBe(false);
        expect(SaveSystem.readSnapshot(1)?.player.foxAbilityBattle?.revision).toBe(1);
    });

    it('does not report consumption saved or modify the live host when storage rejects a write', () => {
        const live = seed(1, 'host');
        const before = entries.get('littleMathAdventure_slot_1');
        quotaFailure = true;
        expect(SaveSystem.writeFoxAbilityCheckpoint(1, 'host', checkpoint(), null, live)).toBe(false);
        expect(live.player.foxAbilityBattle).toBeUndefined();
        expect(entries.get('littleMathAdventure_slot_1')).toBe(before);
    });

    it('honors the existing save-sync write guard', () => {
        seed(1, 'host');
        const release = SaveSystem.guardWrites(() => false);
        try { expect(SaveSystem.writeFoxAbilityCheckpoint(1, 'host', checkpoint(), null)).toBe(false); }
        finally { release(); }
        expect(SaveSystem.readSnapshot(1)?.player.foxAbilityBattle).toBeUndefined();
    });
});
