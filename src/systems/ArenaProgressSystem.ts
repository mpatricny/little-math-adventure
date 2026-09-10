import type { ArenaWaveResult, PlayerState } from '../types';

export const ARENA_PROGRESS_VERSION = 2 as const;

/**
 * Stable IDs used by encounters.json. Kept here as a legacy-save bridge only;
 * normal runtime routing obtains IDs from EncounterCatalog.
 */
export function legacyArenaEncounterId(arenaLevel: number, waveIndex: number): string {
    return `arena-${arenaLevel}-wave-${waveIndex + 1}`;
}

function mergeBestResult(
    first: ArenaWaveResult | undefined,
    second: ArenaWaveResult | undefined,
): ArenaWaveResult | undefined {
    if (!first) return second ? { ...second } : undefined;
    if (!second) return { ...first };

    return {
        completed: first.completed || second.completed,
        perfectWave: first.perfectWave || second.perfectWave,
        // Both stores describe the same historical award. Never add them together.
        crystalsEarned: Math.max(first.crystalsEarned || 0, second.crystalsEarned || 0),
    };
}

/**
 * Older saves did not record which arena owns `waveResults`. After finishing
 * arenas 1 or 2, VictoryScene advanced `arenaLevel` while leaving the completed
 * five-wave array in place. Only recognise that exact, inactive post-completion
 * shape; an active run or a partial inactive run belongs to the current arena.
 */
function inferLegacyWaveResultsArenaLevel(arena: PlayerState['arena']): number {
    if (arena.waveResultsArenaLevel !== undefined) {
        return arena.waveResultsArenaLevel;
    }

    const currentLevel = arena.arenaLevel || 1;
    const previousLevel = currentLevel - 1;
    const completedLevels = arena.completedArenaLevels ?? [];
    const hasCompletedFinalWave = arena.waveResults?.[4]?.completed === true;
    const looksLikeAdvancedCompletedArena = (
        !arena.isActive
        && previousLevel >= 1
        && hasCompletedFinalWave
        && completedLevels.includes(previousLevel)
        && !completedLevels.includes(currentLevel)
    );

    return looksLikeAdvancedCompletedArena ? previousLevel : currentLevel;
}

/**
 * Lazily imports the legacy per-level array into the encounter-keyed store.
 * The legacy data is deliberately retained for a full compatibility window.
 */
export function ensureArenaEncounterProgress(player: PlayerState): boolean {
    const arena = player.arena;
    let changed = false;

    if (!arena.encounterResults) {
        arena.encounterResults = {};
        changed = true;
    }

    const legacyLevel = inferLegacyWaveResultsArenaLevel(arena);
    if (arena.waveResultsArenaLevel === undefined) {
        // Persist the inference so all subsequent reads use an unambiguous owner.
        arena.waveResultsArenaLevel = legacyLevel;
        changed = true;
    }
    for (let waveIndex = 0; waveIndex < (arena.waveResults?.length ?? 0); waveIndex++) {
        const legacyResult = arena.waveResults?.[waveIndex];
        if (!legacyResult) continue;

        const encounterId = legacyArenaEncounterId(legacyLevel, waveIndex);
        const merged = mergeBestResult(arena.encounterResults[encounterId], legacyResult);
        const previous = arena.encounterResults[encounterId];
        if (merged && (
            !previous
            || previous.completed !== merged.completed
            || previous.perfectWave !== merged.perfectWave
            || previous.crystalsEarned !== merged.crystalsEarned
        )) {
            arena.encounterResults[encounterId] = merged;
            changed = true;
        }
    }

    if (arena.arenaProgressVersion !== ARENA_PROGRESS_VERSION) {
        arena.arenaProgressVersion = ARENA_PROGRESS_VERSION;
        changed = true;
    }
    if (!arena.currentEncounterId) {
        arena.currentEncounterId = legacyArenaEncounterId(
            arena.arenaLevel || 1,
            Math.max(0, arena.currentBattle || 0),
        );
        changed = true;
    }

    return changed;
}

export function getArenaEncounterResult(
    player: PlayerState,
    arenaLevel: number,
    waveIndex: number,
    encounterId: string,
): ArenaWaveResult | undefined {
    ensureArenaEncounterProgress(player);
    const arena = player.arena;
    const legacyLevel = arena.waveResultsArenaLevel ?? arena.arenaLevel;
    const legacyResult = legacyLevel === arenaLevel ? arena.waveResults?.[waveIndex] : undefined;
    const merged = mergeBestResult(arena.encounterResults?.[encounterId], legacyResult);

    if (merged) {
        arena.encounterResults![encounterId] = merged;
        if (legacyLevel === arenaLevel) {
            arena.waveResults ??= [];
            arena.waveResults[waveIndex] = { ...merged };
        }
    }
    return merged;
}

export function setArenaEncounterResult(
    player: PlayerState,
    arenaLevel: number,
    waveIndex: number,
    encounterId: string,
    result: ArenaWaveResult,
): ArenaWaveResult {
    ensureArenaEncounterProgress(player);
    const arena = player.arena;
    const previous = getArenaEncounterResult(player, arenaLevel, waveIndex, encounterId);
    const best = mergeBestResult(previous, result)!;

    arena.encounterResults![encounterId] = best;
    arena.waveResultsArenaLevel = arenaLevel;
    arena.waveResults ??= [];
    arena.waveResults[waveIndex] = { ...best };
    return best;
}

/**
 * Selects an encounter without discarding history or lowering the highest
 * unlocked arena when the player voluntarily revisits an older one.
 */
export function selectArenaEncounterProgress(
    player: PlayerState,
    arenaLevel: number,
    encounterId: string,
    waveIndex: number,
): void {
    ensureArenaEncounterProgress(player);
    const arena = player.arena;

    if (arena.waveResultsArenaLevel !== arenaLevel) {
        arena.waveResults = [];
    }

    arena.arenaLevel = Math.max(arena.arenaLevel || 1, arenaLevel);
    arena.waveResultsArenaLevel = arenaLevel;
    arena.currentBattle = waveIndex;
    arena.currentEncounterId = encounterId;
}

export function getArenaResultsForEncounters(
    player: PlayerState,
    arenaLevel: number,
    encounterIds: readonly string[],
): Array<ArenaWaveResult | undefined> {
    return encounterIds.map((encounterId, waveIndex) => (
        getArenaEncounterResult(player, arenaLevel, waveIndex, encounterId)
    ));
}
