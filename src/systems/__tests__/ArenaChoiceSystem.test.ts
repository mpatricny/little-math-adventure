import { describe, expect, it } from 'vitest';
import encountersJson from '../../../public/assets/data/encounters.json';
import enemiesJson from '../../../public/assets/data/enemies.json';
import type { ArenaWaveResult, EnemyDefinition, PlayerState } from '../../types';
import { createEncounterCatalog } from '../EncounterCatalog';
import {
    findNextArenaWaveForChoice,
    getArenaChoiceOptions,
} from '../ArenaChoiceSystem';

const catalog = createEncounterCatalog(encountersJson, {
    core: enemiesJson as unknown as EnemyDefinition[],
});

function result(perfect: boolean): ArenaWaveResult {
    return { completed: true, perfectWave: perfect, crystalsEarned: perfect ? 2 : 1 };
}

function player(
    arenaLevel: number,
    results: Record<string, ArenaWaveResult> = {},
    completedArenaLevels: number[] = [],
): PlayerState {
    return {
        arena: {
            isActive: false,
            arenaLevel,
            currentBattle: 0,
            playerHpAtStart: 10,
            completedArenaLevels,
            waveResults: [],
            arenaProgressVersion: 2,
            currentEncounterId: `arena-${arenaLevel}-wave-1`,
            encounterResults: results,
        },
    } as PlayerState;
}

function arenaResults(arenaLevel: number, perfectByWave: boolean[]): Record<string, ArenaWaveResult> {
    return Object.fromEntries(perfectByWave.map((perfect, index) => [
        `arena-${arenaLevel}-wave-${index + 1}`,
        result(perfect),
    ]));
}

function silverpondArenaResults(
    cityArenaLevel: number,
    perfectByWave: boolean[],
): Record<string, ArenaWaveResult> {
    return Object.fromEntries(perfectByWave.map((perfect, index) => [
        `silverpond-arena-${cityArenaLevel}-wave-${index + 1}`,
        result(perfect),
    ]));
}

describe('ArenaChoiceSystem', () => {
    it('defaults to new progress and offers an older imperfect arena separately', () => {
        const hero = player(2, arenaResults(1, [true, false, true, true, true]), [1]);

        expect(getArenaChoiceOptions(catalog, [hero])).toEqual([
            expect.objectContaining({
                id: 'progression:arena-2',
                kind: 'progression',
                arenaLevel: 2,
                waveIndex: 0,
            }),
            expect.objectContaining({
                id: 'improvement:arena-1',
                kind: 'improvement',
                arenaLevel: 1,
                waveIndex: 1,
            }),
        ]);
    });

    it('recovers the next arena from a persisted completion when the legacy pointer is stale', () => {
        const hero = player(1, arenaResults(1, [true, false, true, true, true]), [1]);

        expect(getArenaChoiceOptions(catalog, [hero])).toEqual([
            expect.objectContaining({
                id: 'progression:arena-2',
                arenaLevel: 2,
                waveIndex: 0,
            }),
            expect.objectContaining({
                id: 'improvement:arena-1',
                arenaLevel: 1,
                waveIndex: 1,
            }),
        ]);
    });

    it('does not force an imperfect completed wave before the next incomplete wave', () => {
        const hero = player(1, {
            'arena-1-wave-1': result(false),
        });

        expect(getArenaChoiceOptions(catalog, [hero])).toEqual([
            expect.objectContaining({
                id: 'progression:arena-1',
                waveIndex: 1,
            }),
            expect.objectContaining({
                id: 'improvement:arena-1',
                waveIndex: 0,
            }),
        ]);
    });

    it('uses the lower shared progression in co-op and offers practice if either profile needs it', () => {
        const playerA = player(3, {
            ...arenaResults(1, [true, true, true, true, true]),
            ...arenaResults(2, [true, true, true, true, true]),
        }, [1, 2]);
        const playerB = player(2, {
            ...arenaResults(1, [true, false, true, true, true]),
        }, [1]);

        expect(getArenaChoiceOptions(catalog, [playerA, playerB])).toEqual([
            expect.objectContaining({
                id: 'progression:arena-2',
                arenaLevel: 2,
                waveIndex: 0,
            }),
            expect.objectContaining({
                id: 'improvement:arena-1',
                arenaLevel: 1,
                waveIndex: 1,
            }),
        ]);
    });

    it('routes progression only to incomplete waves and improvement only to imperfect completions', () => {
        const hero = player(1, {
            'arena-1-wave-1': result(true),
            'arena-1-wave-2': result(false),
            'arena-1-wave-4': result(true),
        });

        expect(findNextArenaWaveForChoice(catalog, [hero], 1, 0, 'progression')).toBe(2);
        expect(findNextArenaWaveForChoice(catalog, [hero], 1, 0, 'improvement')).toBe(1);
    });

    it('shows a fully completed current arena without adding perfected replay options', () => {
        const hero = player(3, {
            ...arenaResults(1, [true, true, true, true, true]),
            ...arenaResults(2, [true, true, true, true, true]),
            ...arenaResults(3, [true, true, true, true, true]),
        }, [1, 2, 3]);

        expect(getArenaChoiceOptions(catalog, [hero])).toEqual([
            expect.objectContaining({
                id: 'complete:arena-3',
                kind: 'complete',
                arenaLevel: 3,
            }),
        ]);
    });

    it('keeps Mathoria and Silverpond choices inside their own three-level progressions', () => {
        const freshSilverpondHero = player(3, {}, [1, 2, 3]);
        expect(getArenaChoiceOptions(catalog, [freshSilverpondHero], 'silverpond')).toEqual([
            expect.objectContaining({
                id: 'progression:silverpond-arena-1',
                arenaLevel: 4,
                waveIndex: 0,
            }),
        ]);

        const advancingSilverpondHero = player(
            4,
            silverpondArenaResults(1, [true, false, true, true, true]),
            [1, 2, 3, 4],
        );
        expect(getArenaChoiceOptions(catalog, [advancingSilverpondHero], 'silverpond')).toEqual([
            expect.objectContaining({
                id: 'progression:silverpond-arena-2',
                arenaLevel: 5,
            }),
            expect.objectContaining({
                id: 'improvement:silverpond-arena-1',
                arenaLevel: 4,
                waveIndex: 1,
            }),
        ]);
        expect(getArenaChoiceOptions(catalog, [advancingSilverpondHero], 'mathoria')[0])
            .toEqual(expect.objectContaining({ id: 'progression:arena-3', arenaLevel: 3 }));
    });
});
