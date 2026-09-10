import type { CrystalTier, EnemyDefinition } from './index';

export const ENCOUNTER_SCHEMA_VERSION = 3 as const;
export const ARENA_WAVE_COUNT = 5;
export const MAX_VISIBLE_ARENA_ENEMIES = 3;
export const ARENA_LEVELS_PER_CITY = 3;
export const COOP_FULL_ROSTER_HP_SCALE = 1.35;

export type EncounterEnemySource = 'core';

/** All encounter enemies resolve from the single production enemies.json catalog. */
export interface EncounterEnemyRef {
    source: EncounterEnemySource;
    enemyId: string;
}

export interface ArenaCrystalBonus {
    tier: CrystalTier;
    count: number;
    valueMin: number;
    valueMax: number;
}

export interface ArenaCompletionReward {
    coins: number;
    /** Optional for backward-compatible encounter data; omitted rewards grant no mana. */
    mana?: number;
    crystals: readonly ArenaCrystalBonus[];
}

export interface ArenaWaveCompletionBonus {
    firstCompletion: ArenaCompletionReward;
    firstPerfect: ArenaCompletionReward;
}

export interface ArenaWaveEncounter {
    id: string;
    /** Zero-based, matching ArenaScene's current wave state. */
    index: number;
    completionBonus: ArenaWaveCompletionBonus;
    enemies: readonly EncounterEnemyRef[];
}

export interface ArenaEncounter {
    id: string;
    /** Global legacy level retained for save compatibility. */
    level: number;
    cityId: string;
    /** One-based level inside the city's arena. */
    cityArenaLevel: number;
    multiplayerPolicy: string;
    metadata: {
        completionEncounterId: string;
        nextArenaId: string | null;
        completionBonus: ArenaCompletionReward;
    };
    waves: readonly ArenaWaveEncounter[];
}

export interface AppendLastMultiplayerRule {
    enemyCounts: readonly number[];
    strategy: 'append-last';
}

export interface ScaleFullRosterMultiplayerRule {
    enemyCounts: readonly number[];
    strategy: 'scale-full-roster';
    hpScale: number;
    rounding: 'ceil';
}

export interface ArenaMultiplayerPolicy {
    kind: 'arena';
    rules: readonly [AppendLastMultiplayerRule, ScaleFullRosterMultiplayerRule];
    rewardPolicy: 'preserve-as-if-last-appended';
}

export interface JourneyMultiplayerPolicy {
    kind: 'journey';
    nonBossStrategy: 'append-last';
    bossStrategy: 'scale-all-phases';
    bossHpScale: number;
    rounding: 'ceil';
    rewardPolicy: 'resolved-roster';
}

export type EncounterMultiplayerPolicy = ArenaMultiplayerPolicy | JourneyMultiplayerPolicy;

export interface ArenaSceneEncounterMetadata {
    waveCount: number;
    maxVisibleEnemies: number;
    levelsPerCity: number;
}

export interface ArenaSceneEncounters {
    metadata: ArenaSceneEncounterMetadata;
    arenas: Readonly<Record<string, ArenaEncounter>>;
}

export interface BossPhaseDefinition {
    hp: number;
    attack: number;
    defense: number;
    name: string;
    nameCs: string;
    mathType?: string;
    mathDifficulty?: number;
    ability?: string | null;
    healPercent?: number;
    transitionAnim?: string;
    idleAnim?: string;
    attackAnim?: string;
    tint?: string;
    deathSequence?: string[];
}

export interface BossEncounterDefinition {
    phases: readonly BossPhaseDefinition[];
    phaseHealPlayer: number;
    diamondReward: number;
    tidalWave?: { everyTurns: number; bonusDamage: number; blessingReduction: number };
}

export interface JourneyBattleEncounter {
    id: string;
    kind: 'battle' | 'boss';
    multiplayerPolicy: string;
    enemies: readonly EncounterEnemyRef[];
    bossId?: string;
}

export interface ForestRoomBattleEncounter extends JourneyBattleEncounter {
    objectId: string;
}

export interface ForestRoomEncounterGroup {
    encounters: readonly ForestRoomBattleEncounter[];
}

export interface ForestRoomSceneEncounters {
    roomOrder: readonly string[];
    rooms: Readonly<Record<string, ForestRoomEncounterGroup>>;
}

export interface ForestMapBattleEncounter extends JourneyBattleEncounter {
    encounterIndex: number;
}

export interface ForestMapEncounterGroup {
    encounters: readonly ForestMapBattleEncounter[];
}

export interface ForestMapSceneEncounters {
    stageOrder: readonly string[];
    stages: Readonly<Record<string, ForestMapEncounterGroup>>;
}

export interface EncountersFileV3 {
    schemaVersion: typeof ENCOUNTER_SCHEMA_VERSION;
    sceneOrder: readonly ['ArenaScene', 'ForestRoomScene', 'ForestMapScene', 'UnderwaterRoomScene'?];
    multiplayerPolicies: Readonly<Record<string, EncounterMultiplayerPolicy>>;
    bosses: Readonly<Record<string, BossEncounterDefinition>>;
    scenes: {
        ArenaScene: ArenaSceneEncounters;
        ForestRoomScene: ForestRoomSceneEncounters;
        ForestMapScene: ForestMapSceneEncounters;
        UnderwaterRoomScene?: ForestRoomSceneEncounters;
    };
}

/** @deprecated Use EncountersFileV3. */
export type EncountersFileV2 = EncountersFileV3;

export type EncounterMode = 'solo' | 'coop';

export type ArenaCoopAdjustment = 'none' | 'append-last' | 'scale-full-roster';
export type JourneyCoopAdjustment = 'none' | 'append-last' | 'scale-all-phases';

export interface ArenaRewardSource {
    source: EncounterEnemySource;
    enemyId: string;
    kind: 'base' | 'coop-appended';
    /** Null means a virtual reward source with no extra visible combatant. */
    resolvedEnemyIndex: number | null;
}

export interface ArenaRewardMetadata {
    mode: 'base-roster' | 'preserve-as-if-last-appended';
    sources: readonly ArenaRewardSource[];
}

export interface ResolveArenaWaveRequest {
    arenaLevel: number;
    waveIndex: number;
    mode: EncounterMode;
}

export interface ResolvedArenaWave {
    encounterId: string;
    arenaLevel: number;
    waveIndex: number;
    mode: EncounterMode;
    enemies: EnemyDefinition[];
    coopAdjustment: ArenaCoopAdjustment;
    rewardMetadata: ArenaRewardMetadata;
}

export interface ResolveJourneyEncounterRequest {
    encounterId: string;
    mode: EncounterMode;
}

export interface ResolvedJourneyEncounter {
    encounterId: string;
    kind: 'battle' | 'boss';
    mode: EncounterMode;
    enemies: EnemyDefinition[];
    boss: BossEncounterDefinition | null;
    coopAdjustment: JourneyCoopAdjustment;
    rewardPolicy: 'resolved-roster';
}
