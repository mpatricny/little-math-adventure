import roomsJson from '../../public/assets/data/underwater-rooms.json';
import type { PlayerState } from '../types';
import type { UnderwaterProgress, UnderwaterRoom } from '../types/underwater';
import { shouldBackfillLakeFairyReward } from './SilverpondProgressSystem';

export const UNDERWATER_START = roomsJson.startRoom;
export const UNDERWATER_ROOMS = roomsJson.rooms as Record<string, UnderwaterRoom>;

export function canEnterUnderwater(player: PlayerState): boolean {
    return player.storyProgress?.hasWaterBreathingScale === true || shouldBackfillLakeFairyReward(player);
}

/** Hydrates old saves without a database/schema migration or resetting known progress. */
export function getUnderwaterProgress(player: PlayerState): UnderwaterProgress {
    if (!player.underwaterProgress) {
        player.underwaterProgress = {
            schemaVersion: 1, active: false, roomId: UNDERWATER_START, entryId: 'surface',
            introSeen: false, visitedRooms: [], defeatedEncounters: [], openedChests: [],
            bellNotes: 0, puzzleAttempts: 0,
        };
    }
    const progress = player.underwaterProgress;
    if (!UNDERWATER_ROOMS[progress.roomId]) {
        progress.roomId = UNDERWATER_START;
        progress.entryId = 'surface';
    }
    return progress;
}

export function visitUnderwaterRoom(player: PlayerState, roomId: string, entryId: string): void {
    if (!UNDERWATER_ROOMS[roomId]) throw new Error(`Unknown underwater room: ${roomId}`);
    const progress = getUnderwaterProgress(player);
    progress.active = true;
    if (progress.roomId !== roomId) delete progress.position;
    progress.roomId = roomId;
    progress.entryId = entryId;
    if (!progress.visitedRooms.includes(roomId)) progress.visitedRooms.push(roomId);
}

export function canUseUnderwaterExit(player: PlayerState, roomId: string, exitId: string): boolean {
    const exit = UNDERWATER_ROOMS[roomId]?.exits.find(candidate => candidate.id === exitId);
    if (!exit) return false;
    const progress = getUnderwaterProgress(player);
    return (!exit.requiresEncounter || progress.defeatedEncounters.includes(exit.requiresEncounter))
        && (!exit.requiresBell || progress.bellNotes >= UNDERWATER_ROOMS.sp_bell_hub.puzzle!.requiredNotes)
        && (!exit.requiresMechanism || Boolean(progress.restoredMechanisms?.includes(exit.requiresMechanism)))
        && (!exit.requiresSeals || getUnderwaterSeals(player).length === 2)
        && (!exit.requiresShortcut || (progress.restoredMechanisms ?? []).some(id => id === 'garden-current' || id === 'canal-pump'));
}

export function canRestoreUnderwaterMechanism(player: PlayerState, roomId: string): boolean {
    const room = UNDERWATER_ROOMS[roomId];
    return Boolean(room?.mechanism && (!room.encounter
        || getUnderwaterProgress(player).defeatedEncounters.includes(room.encounter.id)));
}

/** World applications are not multiple independently observed arithmetic answers. */
export function restoreUnderwaterMechanism(player: PlayerState, roomId: string, worldPlayer: PlayerState = player): boolean {
    if (!canRestoreUnderwaterMechanism(worldPlayer, roomId)) return false;
    const mechanism = UNDERWATER_ROOMS[roomId].mechanism!;
    const id = mechanism.id;
    const progress = getUnderwaterProgress(player);
    if (mechanism.stages && (getUnderwaterProgress(worldPlayer).mechanismStages?.[id] ?? 0) < mechanism.stages) return false;
    const restored = progress.restoredMechanisms ??= [];
    if (restored.includes(id)) return false;
    restored.push(id);
    return true;
}

/** Persist a completed stage, not an in-flight animation. Duplicate callbacks cannot skip a stage. */
export function completeUnderwaterMechanismStage(player: PlayerState, roomId: string, stage: number): boolean {
    const mechanism = UNDERWATER_ROOMS[roomId]?.mechanism;
    if (!mechanism?.stages || !canRestoreUnderwaterMechanism(player, roomId)
        || !Number.isInteger(stage) || stage < 0 || stage >= mechanism.stages) return false;
    const progress = getUnderwaterProgress(player);
    if (progress.restoredMechanisms?.includes(mechanism.id)) return false;
    const stages = progress.mechanismStages ??= {};
    if ((stages[mechanism.id] ?? 0) > stage) return false;
    // A co-op guest joins the host's current world stage, never gets fictitious math solves.
    stages[mechanism.id] = stage + 1;
    return true;
}

/** Seals are permanent story keys derived from claimed mechanisms, not spendable inventory. */
export function getUnderwaterSeals(player: PlayerState): Array<'shell' | 'current'> {
    const restored = getUnderwaterProgress(player).restoredMechanisms ?? [];
    return Object.values(UNDERWATER_ROOMS).flatMap(room => room.mechanism?.seal && restored.includes(room.mechanism.id)
        ? [room.mechanism.seal] : []);
}

export function recordUnderwaterMechanismAttempt(player: PlayerState, roomId: string, assisted: boolean): void {
    if (!canRestoreUnderwaterMechanism(player, roomId)) return;
    const id = UNDERWATER_ROOMS[roomId].mechanism!.id;
    const progress = getUnderwaterProgress(player);
    if (progress.restoredMechanisms?.includes(id)) return;
    const record = (progress.mechanismAttempts ??= {})[id] ??= { attempts: 0, assisted: 0 };
    record.attempts++;
    if (assisted) record.assisted++;
}

export function canOpenUnderwaterChest(player: PlayerState, roomId: string): boolean {
    const chest = UNDERWATER_ROOMS[roomId]?.chest;
    if (!chest) return false;
    const progress = getUnderwaterProgress(player);
    return (!chest.requiresMechanism || Boolean(progress.restoredMechanisms?.includes(chest.requiresMechanism)))
        && (!chest.requiresEncounter || progress.defeatedEncounters.includes(chest.requiresEncounter));
}

/** Record at the same save boundary as battle rewards, before victory animations. */
export function completeUnderwaterEncounter(player: PlayerState, encounterId: string): boolean {
    if (!Object.values(UNDERWATER_ROOMS).some(room => room.encounter?.id === encounterId)) return false;
    const progress = getUnderwaterProgress(player);
    if (progress.defeatedEncounters.includes(encounterId)) return false;
    progress.defeatedEncounters.push(encounterId);
    return true;
}

/** Permanent story reward, outside the limited/spendable crystal inventory. */
export function claimUnderwaterDepthCrystal(player: PlayerState): boolean {
    const progress = getUnderwaterProgress(player);
    const bossId = UNDERWATER_ROOMS.sp_lake_heart?.encounter?.id;
    if (!bossId || !progress.defeatedEncounters.includes(bossId) || progress.depthCrystalClaimed) return false;
    progress.depthCrystalClaimed = true;
    return true;
}

export function hasUnderwaterBlessing(player: PlayerState): boolean {
    return Boolean(getUnderwaterProgress(player).restoredMechanisms?.includes('grotto-light'));
}

export function setUnderwaterRestPoint(player: PlayerState, roomId: string, entryId: string): void {
    const room = UNDERWATER_ROOMS[roomId];
    if (!room?.rest || room.rest.entry !== entryId) return;
    if (room.rest.requiresEncounter && !getUnderwaterProgress(player).defeatedEncounters.includes(room.rest.requiresEncounter)) return;
    getUnderwaterProgress(player).restPoint = { roomId, entryId };
}

export function getUnderwaterRestPoint(player: PlayerState): { roomId: string; entryId: string } {
    const progress = getUnderwaterProgress(player);
    const rest = progress.restPoint;
    if (rest && UNDERWATER_ROOMS[rest.roomId]?.rest?.entry === rest.entryId) return rest;
    return progress.visitedRooms.includes('sp_bell_hub')
        ? { roomId: 'sp_bell_hub', entryId: 'shallows' } : { roomId: UNDERWATER_START, entryId: 'surface' };
}

/** Claim first, then grant and save together. Duplicate clicks/returns cannot pay twice. */
export function claimUnderwaterChest(player: PlayerState, roomId: string, worldPlayer: PlayerState = player): UnderwaterRoom['chest'] | null {
    const chest = UNDERWATER_ROOMS[roomId]?.chest;
    // Co-op uses the host's world gates, but each participant owns their claim.
    // A guest joining after the guard was defeated may share a newly opened chest,
    // without inventing a combat victory in their personal history.
    if (!chest || !canOpenUnderwaterChest(worldPlayer, roomId)) return null;
    const progress = getUnderwaterProgress(player);
    if (progress.openedChests.includes(chest.id)) return null;
    progress.openedChests.push(chest.id);
    return chest;
}

export function recordUnderwaterPuzzleAttempt(player: PlayerState, correct: boolean, assisted = false): void {
    const progress = getUnderwaterProgress(player);
    const limit = UNDERWATER_ROOMS.sp_bell_hub.puzzle!.requiredNotes;
    if (progress.bellNotes >= limit) return;
    progress.puzzleAttempts += 1;
    if (assisted) progress.assistedPuzzleAttempts = (progress.assistedPuzzleAttempts ?? 0) + 1;
    if (correct) progress.bellNotes += 1;
}
