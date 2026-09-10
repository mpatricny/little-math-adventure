import type { PlayerState } from '../types';
import type { EncounterCatalog } from './EncounterCatalog';
import { getArenaResultsForEncounters } from './ArenaProgressSystem';

export type ArenaChoiceKind = 'progression' | 'improvement' | 'complete';

export interface ArenaChoiceOption {
    id: string;
    kind: ArenaChoiceKind;
    arenaId: string;
    arenaLevel: number;
    waveIndex: number;
    encounterId: string;
}

type WaveResultsByPlayer = ReturnType<typeof getArenaResultsForEncounters>[];

function requirePlayers(players: readonly PlayerState[]): void {
    if (players.length === 0) {
        throw new Error('Arena choices require at least one player');
    }
}

function availableArenaLevels(catalog: EncounterCatalog, cityId?: string): number[] {
    const levels = cityId
        ? catalog.getArenaLevelsForCity(cityId).map(arena => arena.level)
        : catalog.getArenaLevels();
    if (levels.length === 0) {
        throw new Error(`Arena choices require at least one arena${cityId ? ` in city "${cityId}"` : ''}`);
    }
    return levels;
}

function closestAvailableArenaLevel(
    catalog: EncounterCatalog,
    requestedLevel: number,
    cityId?: string,
): number {
    const levels = availableArenaLevels(catalog, cityId);
    const fallback = levels[0];
    return levels.reduce(
        (selected, level) => level <= requestedLevel ? level : selected,
        fallback,
    );
}

function getUnlockedArenaLevel(
    catalog: EncounterCatalog,
    player: PlayerState,
    cityId?: string,
): number {
    let unlockedLevel = closestAvailableArenaLevel(
        catalog,
        player.arena.arenaLevel || 1,
        cityId,
    );

    // Recover saves captured after completion was persisted but before
    // VictoryScene advanced the legacy arenaLevel pointer.
    for (const completedLevel of player.arena.completedArenaLevels ?? []) {
        try {
            const completedArena = catalog.getArena(completedLevel);
            if (cityId && completedArena.cityId !== cityId) continue;
            unlockedLevel = Math.max(unlockedLevel, completedArena.level);
            if (completedArena.metadata.nextArenaId) {
                const nextArena = catalog.getArenaById(completedArena.metadata.nextArenaId);
                if (cityId && nextArena.cityId !== cityId) continue;
                unlockedLevel = Math.max(
                    unlockedLevel,
                    nextArena.level,
                );
            }
        } catch {
            // Ignore obsolete/corrupt completion markers and keep valid progress.
        }
    }

    return unlockedLevel;
}

function getSharedProgressionLevel(
    catalog: EncounterCatalog,
    players: readonly PlayerState[],
    cityId?: string,
): number {
    return Math.min(...players.map(player => getUnlockedArenaLevel(catalog, player, cityId)));
}

function getResultsForArena(
    catalog: EncounterCatalog,
    players: readonly PlayerState[],
    arenaLevel: number,
): WaveResultsByPlayer {
    const encounterIds = catalog.getArena(arenaLevel).waves.map(wave => wave.id);
    return players.map(player => (
        getArenaResultsForEncounters(player, arenaLevel, encounterIds)
    ));
}

function firstWaveIndex(
    resultsByPlayer: WaveResultsByPlayer,
    predicate: (results: WaveResultsByPlayer[number][number][]) => boolean,
): number | null {
    const waveCount = resultsByPlayer[0]?.length ?? 0;
    for (let waveIndex = 0; waveIndex < waveCount; waveIndex += 1) {
        const results = resultsByPlayer.map(results => results[waveIndex]);
        if (predicate(results)) return waveIndex;
    }
    return null;
}

function firstIncompleteWave(resultsByPlayer: WaveResultsByPlayer): number | null {
    return firstWaveIndex(
        resultsByPlayer,
        results => results.some(result => result?.completed !== true),
    );
}

function firstCompletedImperfectWave(resultsByPlayer: WaveResultsByPlayer): number | null {
    return firstWaveIndex(
        resultsByPlayer,
        results => (
            results.every(result => result?.completed === true)
            && results.some(result => result?.perfectWave !== true)
        ),
    );
}

function makeChoice(
    catalog: EncounterCatalog,
    arenaLevel: number,
    waveIndex: number,
    kind: ArenaChoiceKind,
): ArenaChoiceOption {
    const arena = catalog.getArena(arenaLevel);
    return {
        id: `${kind}:${arena.id}`,
        kind,
        arenaId: arena.id,
        arenaLevel,
        waveIndex,
        encounterId: arena.waves[waveIndex].id,
    };
}

/**
 * The first option always advances unlocked content. Imperfect completed waves
 * are offered as separate, voluntary alternatives and therefore never become
 * a progression gate.
 */
export function getArenaChoiceOptions(
    catalog: EncounterCatalog,
    players: readonly PlayerState[],
    cityId?: string,
): ArenaChoiceOption[] {
    requirePlayers(players);
    const progressionLevel = getSharedProgressionLevel(catalog, players, cityId);
    const progressionResults = getResultsForArena(catalog, players, progressionLevel);
    const firstIncomplete = firstIncompleteWave(progressionResults);
    const firstCurrentImprovement = firstCompletedImperfectWave(progressionResults);

    const primary = firstIncomplete !== null
        ? makeChoice(catalog, progressionLevel, firstIncomplete, 'progression')
        : firstCurrentImprovement !== null
            ? makeChoice(catalog, progressionLevel, firstCurrentImprovement, 'improvement')
            : makeChoice(catalog, progressionLevel, 0, 'complete');

    const choices = [primary];

    // Keep the closest optional practice first, then older completed arenas.
    const candidateLevels = availableArenaLevels(catalog, cityId)
        .filter(level => level <= progressionLevel)
        .sort((left, right) => right - left);

    for (const arenaLevel of candidateLevels) {
        const results = arenaLevel === progressionLevel
            ? progressionResults
            : getResultsForArena(catalog, players, arenaLevel);
        const improvementWave = firstCompletedImperfectWave(results);
        if (improvementWave === null) continue;

        const improvement = makeChoice(catalog, arenaLevel, improvementWave, 'improvement');
        if (!choices.some(choice => choice.id === improvement.id)) {
            choices.push(improvement);
        }
    }

    return choices;
}

export function getArenaChoiceKind(choiceId: string | null | undefined): ArenaChoiceKind | null {
    const kind = choiceId?.split(':', 1)[0];
    return kind === 'progression' || kind === 'improvement' || kind === 'complete'
        ? kind
        : null;
}

/** Find the next wave appropriate to the explicitly chosen goal. */
export function findNextArenaWaveForChoice(
    catalog: EncounterCatalog,
    players: readonly PlayerState[],
    arenaLevel: number,
    afterWaveIndex: number,
    choiceKind: ArenaChoiceKind | null,
): number | null {
    requirePlayers(players);
    const resultsByPlayer = getResultsForArena(catalog, players, arenaLevel);
    const waveCount = resultsByPlayer[0]?.length ?? 0;

    for (let waveIndex = afterWaveIndex + 1; waveIndex < waveCount; waveIndex += 1) {
        const results = resultsByPlayer.map(results => results[waveIndex]);
        const shouldPlay = choiceKind === 'progression'
            ? results.some(result => result?.completed !== true)
            : choiceKind === 'improvement'
                ? (
                    results.every(result => result?.completed === true)
                    && results.some(result => result?.perfectWave !== true)
                )
                : results.some(result => (
                    result?.completed !== true || result.perfectWave !== true
                ));

        if (shouldPlay) return waveIndex;
    }

    return null;
}
