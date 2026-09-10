import { describe, expect, it } from 'vitest';
import type { PlayerState } from '../../types';
import {
    ensureArenaEncounterProgress,
    getArenaEncounterResult,
    selectArenaEncounterProgress,
    setArenaEncounterResult,
} from '../ArenaProgressSystem';

function playerWithArena(arena: PlayerState['arena']): PlayerState {
    return { arena } as PlayerState;
}

describe('ArenaProgressSystem', () => {
    it('imports a completed legacy array under the previous arena after Victory advanced arenaLevel', () => {
        const completedWave = { completed: true, perfectWave: false, crystalsEarned: 1 };
        const player = playerWithArena({
            isActive: false,
            arenaLevel: 2,
            currentBattle: 0,
            playerHpAtStart: 10,
            completedArenaLevels: [1],
            waveResults: Array.from({ length: 5 }, () => ({ ...completedWave })),
        });

        expect(ensureArenaEncounterProgress(player)).toBe(true);
        expect(player.arena.waveResultsArenaLevel).toBe(1);
        expect(player.arena.currentEncounterId).toBe('arena-2-wave-1');
        expect(Object.keys(player.arena.encounterResults ?? {})).toEqual([
            'arena-1-wave-1',
            'arena-1-wave-2',
            'arena-1-wave-3',
            'arena-1-wave-4',
            'arena-1-wave-5',
        ]);
        expect(player.arena.encounterResults?.['arena-2-wave-1']).toBeUndefined();
        expect(ensureArenaEncounterProgress(player)).toBe(false);
    });

    it('keeps an active legacy run assigned to its current arena', () => {
        const player = playerWithArena({
            isActive: true,
            arenaLevel: 2,
            currentBattle: 4,
            playerHpAtStart: 10,
            completedArenaLevels: [1],
            waveResults: Array.from({ length: 5 }, () => ({
                completed: true,
                perfectWave: false,
                crystalsEarned: 1,
            })),
        });

        ensureArenaEncounterProgress(player);

        expect(player.arena.waveResultsArenaLevel).toBe(2);
        expect(player.arena.encounterResults?.['arena-2-wave-5']).toBeDefined();
        expect(player.arena.encounterResults?.['arena-1-wave-5']).toBeUndefined();
    });

    it('does not mistake an abandoned partial run for the previously completed arena', () => {
        const player = playerWithArena({
            isActive: false,
            arenaLevel: 2,
            currentBattle: 0,
            playerHpAtStart: 10,
            completedArenaLevels: [1],
            waveResults: [
                { completed: true, perfectWave: false, crystalsEarned: 1 },
                { completed: true, perfectWave: true, crystalsEarned: 2 },
            ],
        });

        ensureArenaEncounterProgress(player);

        expect(player.arena.waveResultsArenaLevel).toBe(2);
        expect(player.arena.encounterResults?.['arena-2-wave-1']).toBeDefined();
        expect(player.arena.encounterResults?.['arena-1-wave-1']).toBeUndefined();
    });

    it('imports legacy wave results without deleting or re-awarding them', () => {
        const player = playerWithArena({
            isActive: true,
            arenaLevel: 2,
            currentBattle: 1,
            playerHpAtStart: 10,
            completedArenaLevels: [1],
            waveResultsArenaLevel: 2,
            waveResults: [
                { completed: true, perfectWave: true, crystalsEarned: 2 },
                { completed: true, perfectWave: false, crystalsEarned: 1 },
            ],
        });

        expect(ensureArenaEncounterProgress(player)).toBe(true);
        expect(player.arena.encounterResults).toEqual({
            'arena-2-wave-1': { completed: true, perfectWave: true, crystalsEarned: 2 },
            'arena-2-wave-2': { completed: true, perfectWave: false, crystalsEarned: 1 },
        });
        expect(player.arena.waveResults).toHaveLength(2);
        expect(ensureArenaEncounterProgress(player)).toBe(false);
    });

    it('merges dual stores by best result and never sums historical crystals', () => {
        const player = playerWithArena({
            isActive: true,
            arenaLevel: 1,
            currentBattle: 0,
            playerHpAtStart: 10,
            completedArenaLevels: [],
            waveResultsArenaLevel: 1,
            waveResults: [{ completed: true, perfectWave: false, crystalsEarned: 1 }],
            arenaProgressVersion: 2,
            encounterResults: {
                'arena-1-wave-1': { completed: true, perfectWave: true, crystalsEarned: 2 },
            },
        });

        expect(getArenaEncounterResult(player, 1, 0, 'arena-1-wave-1')).toEqual({
            completed: true,
            perfectWave: true,
            crystalsEarned: 2,
        });
    });

    it('retains other-arena history while dual-writing the selected arena', () => {
        const player = playerWithArena({
            isActive: false,
            arenaLevel: 1,
            currentBattle: 4,
            playerHpAtStart: 10,
            completedArenaLevels: [1],
            waveResultsArenaLevel: 1,
            waveResults: [{ completed: true, perfectWave: true, crystalsEarned: 2 }],
        });

        selectArenaEncounterProgress(player, 2, 'arena-2-wave-1', 0);
        setArenaEncounterResult(player, 2, 0, 'arena-2-wave-1', {
            completed: true,
            perfectWave: false,
            crystalsEarned: 1,
        });

        expect(player.arena.encounterResults?.['arena-1-wave-1']).toBeDefined();
        expect(player.arena.encounterResults?.['arena-2-wave-1']).toBeDefined();
        expect(player.arena.currentEncounterId).toBe('arena-2-wave-1');
        expect(player.arena.waveResults).toEqual([
            { completed: true, perfectWave: false, crystalsEarned: 1 },
        ]);
    });

    it('does not lower the highest unlocked arena when selecting an older replay', () => {
        const player = playerWithArena({
            isActive: false,
            arenaLevel: 3,
            currentBattle: 0,
            playerHpAtStart: 10,
            completedArenaLevels: [1, 2],
            waveResultsArenaLevel: 3,
            waveResults: [],
            arenaProgressVersion: 2,
            currentEncounterId: 'arena-3-wave-1',
            encounterResults: {},
        });

        selectArenaEncounterProgress(player, 1, 'arena-1-wave-2', 1);

        expect(player.arena.arenaLevel).toBe(3);
        expect(player.arena.waveResultsArenaLevel).toBe(1);
        expect(player.arena.currentBattle).toBe(1);
        expect(player.arena.currentEncounterId).toBe('arena-1-wave-2');
    });
});
