import type { BattleState, PreparationState } from './index';
import type { FoxAbilityBattleSnapshot, FoxOwnerId } from './foxAbilities';

/** Scene-owned JSON needed to reconstruct an interrupted animation/math sequence. */
export interface BattleFoxCombatCheckpoint {
    battle: BattleState;
    enemyKeys: string[];
    owners: Partial<Record<FoxOwnerId, {
        maxHp: number;
        foxEquipped: boolean;
        shieldEquipped: boolean;
        preparation: PreparationState;
    }>>;
    activeOwner: FoxOwnerId;
    turnToken: string;
    paused: boolean;
    defenseActive: boolean;
    busy: boolean;
    resumeData: Record<string, unknown>;
}

/** One atomic record pairs ability consumption with the resulting combat state. */
export interface BattleFoxAbilityCheckpoint {
    version: 1;
    encounterKey: string;
    battleId: string;
    revision: number;
    ledger: FoxAbilityBattleSnapshot;
    combat: BattleFoxCombatCheckpoint;
}

export interface BattleFoxCheckpointToken { battleId: string; revision: number }

export interface BattleFoxCheckpointStore {
    read(): BattleFoxAbilityCheckpoint | null;
    /** Compare-and-set. A failed/stale write must leave the old record intact. */
    write(checkpoint: BattleFoxAbilityCheckpoint, expected: BattleFoxCheckpointToken | null): boolean;
}
