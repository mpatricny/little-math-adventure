import type { CrystalTier, EnemyDefinition } from '../types';
import {
    ARENA_LEVELS_PER_CITY,
    ARENA_WAVE_COUNT,
    COOP_FULL_ROSTER_HP_SCALE,
    ENCOUNTER_SCHEMA_VERSION,
    MAX_VISIBLE_ARENA_ENEMIES,
    type AppendLastMultiplayerRule,
    type ArenaEncounter,
    type ArenaCompletionReward,
    type ArenaCrystalBonus,
    type ArenaMultiplayerPolicy,
    type ArenaRewardSource,
    type ArenaWaveEncounter,
    type BossEncounterDefinition,
    type BossPhaseDefinition,
    type EncounterEnemyRef,
    type EncounterMode,
    type EncounterMultiplayerPolicy,
    type EncountersFileV3,
    type ForestMapBattleEncounter,
    type ForestMapEncounterGroup,
    type ForestRoomBattleEncounter,
    type ForestRoomEncounterGroup,
    type JourneyBattleEncounter,
    type JourneyMultiplayerPolicy,
    type ResolveArenaWaveRequest,
    type ResolvedArenaWave,
    type ResolvedJourneyEncounter,
    type ScaleFullRosterMultiplayerRule,
} from '../types/encounters';

const ARENA_SCENE_ID = 'ArenaScene';
const FOREST_ROOM_SCENE_ID = 'ForestRoomScene';
const FOREST_MAP_SCENE_ID = 'ForestMapScene';
const REQUIRED_SCENE_ORDER = [ARENA_SCENE_ID, FOREST_ROOM_SCENE_ID, FOREST_MAP_SCENE_ID] as const;
const ARENA_COOP_POLICY_ID = 'arena-coop-v1';
const FOREST_COOP_POLICY_ID = 'forest-coop-v1';
const ARENA_CRYSTAL_TIERS = new Set<CrystalTier>([
    'shard',
    'fragment',
    'prism',
    'core',
    'special_porcupine',
]);

type UnknownRecord = Record<string, unknown>;

export interface EncounterEnemySources {
    core: readonly EnemyDefinition[];
}

interface ParsedEncounterData {
    encounters: EncountersFileV3;
    enemiesByRef: ReadonlyMap<string, EnemyDefinition>;
    journeyEncountersById: ReadonlyMap<string, JourneyBattleEncounter>;
}

/** A malformed encounter or enemy catalog was rejected at its data boundary. */
export class EncounterCatalogError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'EncounterCatalogError';
    }
}

/**
 * Validates and resolves data-driven encounters without depending on Phaser.
 * Inputs are cloned during construction and every returned enemy is a fresh clone.
 */
export class EncounterCatalog {
    private readonly encounters: EncountersFileV3;
    private readonly enemiesByRef: ReadonlyMap<string, EnemyDefinition>;
    private readonly journeyEncountersById: ReadonlyMap<string, JourneyBattleEncounter>;

    constructor(parsed: ParsedEncounterData) {
        this.encounters = cloneJsonValue(parsed.encounters);
        this.enemiesByRef = new Map(
            [...parsed.enemiesByRef].map(([key, enemy]) => [key, cloneJsonValue(enemy)]),
        );
        this.journeyEncountersById = new Map(
            [...parsed.journeyEncountersById].map(([id, encounter]) => [id, cloneJsonValue(encounter)]),
        );
    }

    getArenaLevels(): number[] {
        return Object.values(this.encounters.scenes.ArenaScene.arenas)
            .map((arena) => arena.level)
            .sort((left, right) => left - right);
    }

    getArenaCities(): string[] {
        return [...new Set(
            Object.values(this.encounters.scenes.ArenaScene.arenas)
                .map((arena) => arena.cityId),
        )];
    }

    getArenaLevelsForCity(cityId: string): ArenaEncounter[] {
        const normalizedCityId = requireNonEmptyString(cityId, 'cityId');
        return Object.values(this.encounters.scenes.ArenaScene.arenas)
            .filter((arena) => arena.cityId === normalizedCityId)
            .sort((left, right) => left.cityArenaLevel - right.cityArenaLevel)
            .map((arena) => cloneJsonValue(arena));
    }

    getArenaByCityLevel(cityId: string, cityArenaLevel: number): ArenaEncounter {
        const normalizedCityId = requireNonEmptyString(cityId, 'cityId');
        if (!Number.isInteger(cityArenaLevel) || cityArenaLevel < 1) {
            fail('cityArenaLevel', 'must be a positive integer');
        }
        const arena = Object.values(this.encounters.scenes.ArenaScene.arenas)
            .find((candidate) => (
                candidate.cityId === normalizedCityId
                && candidate.cityArenaLevel === cityArenaLevel
            ));
        if (!arena) {
            fail('cityArenaLevel', `city "${normalizedCityId}" has no arena level ${cityArenaLevel}`);
        }
        return cloneJsonValue(arena);
    }

    getArena(level: number): ArenaEncounter {
        return cloneJsonValue(this.requireArena(level));
    }

    getArenaById(id: string): ArenaEncounter {
        const arenaId = requireNonEmptyString(id, 'arenaId');
        const arena = Object.values(this.encounters.scenes.ArenaScene.arenas)
            .find((candidate) => candidate.id === arenaId);
        if (!arena) {
            fail('arenaId', `unknown arena "${arenaId}"`);
        }
        return cloneJsonValue(arena);
    }

    getWave(level: number, waveIndex: number): ArenaWaveEncounter {
        const arena = this.requireArena(level);
        assertWaveIndex(waveIndex, arena.waves.length);
        return cloneJsonValue(arena.waves[waveIndex]);
    }

    getWaveById(id: string): ArenaWaveEncounter {
        const waveId = requireNonEmptyString(id, 'encounterId');
        for (const arena of Object.values(this.encounters.scenes.ArenaScene.arenas)) {
            const wave = arena.waves.find((candidate) => candidate.id === waveId);
            if (wave) return cloneJsonValue(wave);
        }
        fail('encounterId', `unknown arena encounter "${waveId}"`);
    }

    /** Compatibility alias for callers that prefer the scene-specific name. */
    getArenaWave(level: number, waveIndex: number): ArenaWaveEncounter {
        return this.getWave(level, waveIndex);
    }

    getMaxArenaLevel(): number {
        return Math.max(...this.getArenaLevels());
    }

    getForestRoomEncounter(roomId: string, objectId: string): ForestRoomBattleEncounter {
        const room = this.encounters.scenes.ForestRoomScene.rooms[requireNonEmptyString(roomId, 'roomId')];
        if (!room) fail('roomId', `unknown forest room "${roomId}"`);
        const encounter = room.encounters.find((candidate) => candidate.objectId === objectId);
        if (!encounter) {
            fail('objectId', `room "${roomId}" has no encounter for object "${objectId}"`);
        }
        return cloneJsonValue(encounter);
    }

    getForestMapEncounter(stageId: string, encounterIndex: number): ForestMapBattleEncounter {
        const stage = this.encounters.scenes.ForestMapScene.stages[requireNonEmptyString(stageId, 'stageId')];
        if (!stage) fail('stageId', `unknown forest map stage "${stageId}"`);
        const encounter = stage.encounters.find((candidate) => candidate.encounterIndex === encounterIndex);
        if (!encounter) {
            fail('encounterIndex', `stage "${stageId}" has no battle at index ${encounterIndex}`);
        }
        return cloneJsonValue(encounter);
    }

    getJourneyEncounterById(id: string): JourneyBattleEncounter {
        const encounterId = requireNonEmptyString(id, 'encounterId');
        const encounter = this.journeyEncountersById.get(encounterId);
        if (!encounter) fail('encounterId', `unknown journey encounter "${encounterId}"`);
        return cloneJsonValue(encounter);
    }

    resolveEnemy(ref: EncounterEnemyRef): EnemyDefinition {
        return this.cloneEnemy(ref);
    }

    resolveArenaWave(request: ResolveArenaWaveRequest): ResolvedArenaWave {
        if (!isRecord(request)) fail('request', 'must be an object');

        const arena = this.requireArena(request.arenaLevel);
        assertWaveIndex(request.waveIndex, arena.waves.length);
        assertEncounterMode(request.mode, 'request.mode');

        const wave = arena.waves[request.waveIndex];
        const enemies = wave.enemies.map((enemyRef) => this.cloneEnemy(enemyRef));
        const rewardSources: ArenaRewardSource[] = wave.enemies.map((enemyRef, index) => ({
            source: enemyRef.source,
            enemyId: enemyRef.enemyId,
            kind: 'base',
            resolvedEnemyIndex: index,
        }));

        if (request.mode === 'solo') {
            return {
                encounterId: wave.id,
                arenaLevel: arena.level,
                waveIndex: wave.index,
                mode: 'solo',
                enemies,
                coopAdjustment: 'none',
                rewardMetadata: { mode: 'base-roster', sources: rewardSources },
            };
        }

        const policy = this.requireArenaPolicy(arena.multiplayerPolicy);
        const rule = policy.rules.find((candidate) => candidate.enemyCounts.includes(enemies.length));
        if (!rule) {
            fail(
                `scenes.${ARENA_SCENE_ID}.arenas.${arena.level}`,
                `multiplayer policy "${arena.multiplayerPolicy}" has no rule for ${enemies.length} enemies`,
            );
        }

        const lastEnemyRef = wave.enemies[wave.enemies.length - 1];
        if (rule.strategy === 'append-last') {
            const appendedIndex = enemies.length;
            enemies.push(this.cloneEnemy(lastEnemyRef));
            rewardSources.push({
                source: lastEnemyRef.source,
                enemyId: lastEnemyRef.enemyId,
                kind: 'coop-appended',
                resolvedEnemyIndex: appendedIndex,
            });
            return {
                encounterId: wave.id,
                arenaLevel: arena.level,
                waveIndex: wave.index,
                mode: 'coop',
                enemies,
                coopAdjustment: 'append-last',
                rewardMetadata: { mode: policy.rewardPolicy, sources: rewardSources },
            };
        }

        const scaledEnemies = enemies.map((enemy) => cloneEnemyWithHp(enemy, applyHpScale(enemy.hp, rule)));
        rewardSources.push({
            source: lastEnemyRef.source,
            enemyId: lastEnemyRef.enemyId,
            kind: 'coop-appended',
            resolvedEnemyIndex: null,
        });
        return {
            encounterId: wave.id,
            arenaLevel: arena.level,
            waveIndex: wave.index,
            mode: 'coop',
            enemies: scaledEnemies,
            coopAdjustment: 'scale-full-roster',
            rewardMetadata: { mode: policy.rewardPolicy, sources: rewardSources },
        };
    }

    resolveJourneyEncounter(encounterId: string, mode: EncounterMode): ResolvedJourneyEncounter {
        assertEncounterMode(mode, 'mode');
        const encounter = this.getJourneyEncounterById(encounterId);
        const policy = this.requireJourneyPolicy(encounter.multiplayerPolicy);
        let enemies = encounter.enemies.map((enemyRef) => this.cloneEnemy(enemyRef));
        let boss = encounter.bossId
            ? cloneJsonValue(this.encounters.bosses[encounter.bossId])
            : null;

        if (encounter.kind === 'boss') {
            if (!boss) fail(`encounter.${encounter.id}.boss`, 'is required for a boss encounter');
            if (mode === 'coop') {
                boss = {
                    ...boss,
                    phases: boss.phases.map((phase) => ({
                        ...phase,
                        deathSequence: phase.deathSequence ? [...phase.deathSequence] : undefined,
                        hp: roundScaledHp(phase.hp, policy.bossHpScale, policy.rounding),
                    })),
                };
            }
            const firstPhase = boss.phases[0];
            const base = enemies[0];
            enemies = [{
                ...base,
                goldReward: [...base.goldReward] as [number, number],
                name: `${base.name} - ${firstPhase.nameCs}`,
                hp: firstPhase.hp,
                attack: firstPhase.attack,
                defense: firstPhase.defense,
            }];
            return {
                encounterId: encounter.id,
                kind: 'boss',
                mode,
                enemies,
                boss,
                coopAdjustment: mode === 'coop' ? 'scale-all-phases' : 'none',
                rewardPolicy: policy.rewardPolicy,
            };
        }

        if (mode === 'coop') {
            enemies.push(cloneJsonValue(enemies[enemies.length - 1]));
        }
        return {
            encounterId: encounter.id,
            kind: 'battle',
            mode,
            enemies,
            boss: null,
            coopAdjustment: mode === 'coop' ? 'append-last' : 'none',
            rewardPolicy: policy.rewardPolicy,
        };
    }

    private requireArena(level: number): ArenaEncounter {
        if (!Number.isInteger(level) || level < 1) fail('arenaLevel', 'must be a positive integer');
        const arena = this.encounters.scenes.ArenaScene.arenas[String(level)];
        if (!arena) fail('arenaLevel', `unknown arena level ${level}`);
        return arena;
    }

    private requireArenaPolicy(id: string): ArenaMultiplayerPolicy {
        const policy = this.encounters.multiplayerPolicies[id];
        if (!policy || policy.kind !== 'arena') fail('multiplayerPolicy', `"${id}" is not an arena policy`);
        return policy;
    }

    private requireJourneyPolicy(id: string): JourneyMultiplayerPolicy {
        const policy = this.encounters.multiplayerPolicies[id];
        if (!policy || policy.kind !== 'journey') fail('multiplayerPolicy', `"${id}" is not a journey policy`);
        return policy;
    }

    private cloneEnemy(ref: EncounterEnemyRef): EnemyDefinition {
        const enemy = this.enemiesByRef.get(enemyRefKey(ref));
        if (!enemy) fail('enemyRef', `unknown ${ref.source} enemy "${ref.enemyId}"`);
        return cloneJsonValue(enemy);
    }
}

/** Validates the file and returns a detached, typed representation. */
export function validateEncountersFile(
    rawEncounters: unknown,
    enemySources: EncounterEnemySources,
): EncountersFileV3 {
    return prepareEncounterData(rawEncounters, enemySources).encounters;
}

/** Creates a pure encounter catalog after validating both encounter and enemy sources. */
export function createEncounterCatalog(
    rawEncounters: unknown,
    enemySources: EncounterEnemySources,
): EncounterCatalog {
    return new EncounterCatalog(prepareEncounterData(rawEncounters, enemySources));
}

function prepareEncounterData(rawEncounters: unknown, rawEnemySources: unknown): ParsedEncounterData {
    const enemySources = requireRecord(rawEnemySources, 'enemySources');
    const core = parseCoreEnemyDefinitions(enemySources.core);
    const enemiesByRef = new Map<string, EnemyDefinition>();
    core.forEach((enemy, id) => enemiesByRef.set(enemyRefKey({ source: 'core', enemyId: id }), enemy));
    const { encounters, journeyEncountersById } = parseEncountersFile(rawEncounters, enemiesByRef);
    return { encounters, enemiesByRef, journeyEncountersById };
}

function parseCoreEnemyDefinitions(raw: unknown): ReadonlyMap<string, EnemyDefinition> {
    if (!Array.isArray(raw)) fail('enemySources.core', 'must be an array');
    return parseEnemyCollection(raw, 'enemySources.core', (enemy, path) => {
        validateStandardEnemy(enemy, path);
        return cloneJsonValue(enemy) as unknown as EnemyDefinition;
    });
}

function parseEnemyCollection(
    raw: readonly unknown[],
    rootPath: string,
    parse: (enemy: UnknownRecord, path: string) => EnemyDefinition,
): ReadonlyMap<string, EnemyDefinition> {
    if (raw.length === 0) fail(rootPath, 'must contain at least one enemy');
    const enemies = new Map<string, EnemyDefinition>();
    raw.forEach((candidate, index) => {
        const path = `${rootPath}[${index}]`;
        const record = requireRecord(candidate, path);
        const id = requireNonEmptyString(record.id, `${path}.id`);
        if (enemies.has(id)) fail(`${path}.id`, `duplicate enemy id "${id}"`);
        enemies.set(id, parse(record, path));
    });
    return enemies;
}

function validateStandardEnemy(enemy: UnknownRecord, path: string): void {
    requireNonEmptyString(enemy.id, `${path}.id`);
    requireNonEmptyString(enemy.name, `${path}.name`);
    requireNonEmptyString(enemy.spriteKey, `${path}.spriteKey`);
    requirePositiveInteger(enemy.hp, `${path}.hp`);
    requireNonNegativeInteger(enemy.attack, `${path}.attack`);
    requireNonNegativeInteger(enemy.defense, `${path}.defense`);
    requireNonNegativeInteger(enemy.difficulty, `${path}.difficulty`);
    validateGoldReward(enemy.goldReward, `${path}.goldReward`);
    validateOptionalString(enemy.animPrefix, `${path}.animPrefix`);
    validateOptionalPositiveNumber(enemy.scale, `${path}.scale`);
    validateOptionalPositiveNumber(enemy.worldScale, `${path}.worldScale`);
    validateOptionalPositiveNumber(enemy.battleScale, `${path}.battleScale`);
    validateOptionalFiniteNumber(enemy.battleOffsetX, `${path}.battleOffsetX`);
    validateOptionalFiniteNumber(enemy.battleOffsetY, `${path}.battleOffsetY`);
}

function parseEncountersFile(
    raw: unknown,
    enemiesByRef: ReadonlyMap<string, EnemyDefinition>,
): { encounters: EncountersFileV3; journeyEncountersById: ReadonlyMap<string, JourneyBattleEncounter> } {
    const root = requireRecord(raw, 'encounters');
    if (root.schemaVersion !== ENCOUNTER_SCHEMA_VERSION) {
        fail('encounters.schemaVersion', `must equal ${ENCOUNTER_SCHEMA_VERSION}`);
    }
    const hasUnderwater = isRecord(root.scenes) && root.scenes.UnderwaterRoomScene !== undefined;
    const sceneOrder = hasUnderwater
        ? [...REQUIRED_SCENE_ORDER, 'UnderwaterRoomScene'] as const
        : REQUIRED_SCENE_ORDER;
    assertExactStrings(root.sceneOrder, sceneOrder, 'encounters.sceneOrder');

    const multiplayerPolicies = parseMultiplayerPolicies(root.multiplayerPolicies);
    const arenaPolicy = multiplayerPolicies[ARENA_COOP_POLICY_ID];
    if (!arenaPolicy || arenaPolicy.kind !== 'arena') {
        fail('encounters.multiplayerPolicies', `must define arena policy "${ARENA_COOP_POLICY_ID}"`);
    }
    const forestPolicy = multiplayerPolicies[FOREST_COOP_POLICY_ID];
    if (!forestPolicy || forestPolicy.kind !== 'journey') {
        fail('encounters.multiplayerPolicies', `must define journey policy "${FOREST_COOP_POLICY_ID}"`);
    }

    const bosses = parseBosses(root.bosses);
    const scenes = requireRecord(root.scenes, 'encounters.scenes');
    const globalEncounterIds = new Set<string>();
    const arenaScene = parseArenaScene(
        scenes[ARENA_SCENE_ID],
        multiplayerPolicies,
        enemiesByRef,
        globalEncounterIds,
    );
    const { scene: forestRoomScene, encounters: roomEncounters } = parseForestRoomScene(
        scenes[FOREST_ROOM_SCENE_ID],
        multiplayerPolicies,
        bosses,
        enemiesByRef,
        globalEncounterIds,
    );
    const { scene: forestMapScene, encounters: mapEncounters } = parseForestMapScene(
        scenes[FOREST_MAP_SCENE_ID],
        multiplayerPolicies,
        bosses,
        enemiesByRef,
        globalEncounterIds,
    );

    const underwater = hasUnderwater ? parseForestRoomScene(
        scenes.UnderwaterRoomScene, multiplayerPolicies, bosses, enemiesByRef,
        globalEncounterIds, 'UnderwaterRoomScene',
    ) : null;

    return {
        encounters: {
            schemaVersion: ENCOUNTER_SCHEMA_VERSION,
            sceneOrder,
            multiplayerPolicies,
            bosses,
            scenes: {
                ArenaScene: arenaScene,
                ForestRoomScene: forestRoomScene,
                ForestMapScene: forestMapScene,
                ...(underwater ? { UnderwaterRoomScene: underwater.scene } : {}),
            },
        },
        journeyEncountersById: new Map([...roomEncounters, ...mapEncounters, ...(underwater?.encounters ?? [])]),
    };
}

function parseArenaScene(
    raw: unknown,
    policies: Readonly<Record<string, EncounterMultiplayerPolicy>>,
    enemiesByRef: ReadonlyMap<string, EnemyDefinition>,
    globalEncounterIds: Set<string>,
): EncountersFileV3['scenes']['ArenaScene'] {
    const path = `encounters.scenes.${ARENA_SCENE_ID}`;
    const scene = requireRecord(raw, path);
    const metadata = requireRecord(scene.metadata, `${path}.metadata`);
    if (metadata.waveCount !== ARENA_WAVE_COUNT) fail(`${path}.metadata.waveCount`, `must equal ${ARENA_WAVE_COUNT}`);
    if (metadata.maxVisibleEnemies !== MAX_VISIBLE_ARENA_ENEMIES) {
        fail(`${path}.metadata.maxVisibleEnemies`, `must equal ${MAX_VISIBLE_ARENA_ENEMIES}`);
    }
    if (metadata.levelsPerCity !== ARENA_LEVELS_PER_CITY) {
        fail(`${path}.metadata.levelsPerCity`, `must equal ${ARENA_LEVELS_PER_CITY}`);
    }
    const rawArenas = requireRecord(scene.arenas, `${path}.arenas`);
    if (Object.keys(rawArenas).length === 0) fail(`${path}.arenas`, 'must not be empty');

    const arenas: Record<string, ArenaEncounter> = {};
    const arenaIds = new Set<string>();
    const cityArenaLevels = new Map<string, Set<number>>();
    for (const [levelKey, rawArena] of Object.entries(rawArenas)) {
        const arenaPath = `${path}.arenas.${levelKey}`;
        const level = Number(levelKey);
        if (!Number.isInteger(level) || level < 1 || String(level) !== levelKey) {
            fail(arenaPath, 'key must be a canonical positive integer');
        }
        const arena = requireRecord(rawArena, arenaPath);
        const id = requireUniqueId(arena.id, `${arenaPath}.id`, arenaIds, 'arena');
        if (arena.level !== level) fail(`${arenaPath}.level`, `must equal arena key ${level}`);
        const cityId = requireNonEmptyString(arena.cityId, `${arenaPath}.cityId`);
        const cityArenaLevel = requirePositiveInteger(arena.cityArenaLevel, `${arenaPath}.cityArenaLevel`);
        if (cityArenaLevel > ARENA_LEVELS_PER_CITY) {
            fail(`${arenaPath}.cityArenaLevel`, `must be between 1 and ${ARENA_LEVELS_PER_CITY}`);
        }
        const levelsForCity = cityArenaLevels.get(cityId) ?? new Set<number>();
        if (levelsForCity.has(cityArenaLevel)) {
            fail(`${arenaPath}.cityArenaLevel`, `duplicate level ${cityArenaLevel} for city "${cityId}"`);
        }
        levelsForCity.add(cityArenaLevel);
        cityArenaLevels.set(cityId, levelsForCity);
        const policyId = requirePolicy(arena.multiplayerPolicy, `${arenaPath}.multiplayerPolicy`, policies, 'arena');
        const arenaMetadata = requireRecord(arena.metadata, `${arenaPath}.metadata`);
        const completionEncounterId = requireNonEmptyString(arenaMetadata.completionEncounterId, `${arenaPath}.metadata.completionEncounterId`);
        const nextArenaId = parseNullableNonEmptyString(arenaMetadata.nextArenaId, `${arenaPath}.metadata.nextArenaId`);
        const completionBonus = parseArenaCompletionReward(
            arenaMetadata.completionBonus,
            `${arenaPath}.metadata.completionBonus`,
        );
        if (!Array.isArray(arena.waves) || arena.waves.length !== ARENA_WAVE_COUNT) {
            fail(`${arenaPath}.waves`, `must contain exactly ${ARENA_WAVE_COUNT} waves`);
        }
        const arenaWaveIds = new Set<string>();
        const waves = arena.waves.map((rawWave, index) => {
            const wavePath = `${arenaPath}.waves[${index}]`;
            const wave = requireRecord(rawWave, wavePath);
            const waveId = requireEncounterId(wave.id, `${wavePath}.id`, globalEncounterIds);
            arenaWaveIds.add(waveId);
            if (wave.index !== index) fail(`${wavePath}.index`, `must equal zero-based array index ${index}`);
            const completionBonusRecord = requireRecord(wave.completionBonus, `${wavePath}.completionBonus`);
            const completionBonus = {
                firstCompletion: parseArenaCompletionReward(
                    completionBonusRecord.firstCompletion,
                    `${wavePath}.completionBonus.firstCompletion`,
                ),
                firstPerfect: parseArenaCompletionReward(
                    completionBonusRecord.firstPerfect,
                    `${wavePath}.completionBonus.firstPerfect`,
                ),
            };
            const enemies = parseEnemyRefs(wave.enemies, `${wavePath}.enemies`, enemiesByRef, {
                max: MAX_VISIBLE_ARENA_ENEMIES,
                requiredSource: 'core',
            });
            return { id: waveId, index, completionBonus, enemies };
        });
        if (!arenaWaveIds.has(completionEncounterId)) {
            fail(`${arenaPath}.metadata.completionEncounterId`, `must reference a wave in arena "${id}"`);
        }
        arenas[levelKey] = {
            id,
            level,
            cityId,
            cityArenaLevel,
            multiplayerPolicy: policyId,
            metadata: { completionEncounterId, nextArenaId, completionBonus },
            waves,
        };
    }
    for (const [cityId, levels] of cityArenaLevels) {
        if (levels.size !== ARENA_LEVELS_PER_CITY) {
            fail(`${path}.arenas`, `city "${cityId}" must define exactly ${ARENA_LEVELS_PER_CITY} arena levels`);
        }
        for (let localLevel = 1; localLevel <= ARENA_LEVELS_PER_CITY; localLevel += 1) {
            if (!levels.has(localLevel)) {
                fail(`${path}.arenas`, `city "${cityId}" is missing arena level ${localLevel}`);
            }
        }
    }
    for (const arena of Object.values(arenas)) {
        const nextArenaId = arena.metadata.nextArenaId;
        if (nextArenaId !== null && !arenaIds.has(nextArenaId)) {
            fail(`${path}.arenas.${arena.level}.metadata.nextArenaId`, `references unknown arena "${nextArenaId}"`);
        }
        if (nextArenaId === arena.id) fail(`${path}.arenas.${arena.level}.metadata.nextArenaId`, 'must not reference the same arena');
        const nextArena = nextArenaId === null
            ? null
            : Object.values(arenas).find((candidate) => candidate.id === nextArenaId) ?? null;
        if (arena.cityArenaLevel < ARENA_LEVELS_PER_CITY) {
            if (
                !nextArena
                || nextArena.cityId !== arena.cityId
                || nextArena.cityArenaLevel !== arena.cityArenaLevel + 1
            ) {
                fail(
                    `${path}.arenas.${arena.level}.metadata.nextArenaId`,
                    `must reference level ${arena.cityArenaLevel + 1} in city "${arena.cityId}"`,
                );
            }
        } else if (nextArenaId !== null) {
            fail(
                `${path}.arenas.${arena.level}.metadata.nextArenaId`,
                `must be null for final city arena level ${ARENA_LEVELS_PER_CITY}`,
            );
        }
    }
    return {
        metadata: {
            waveCount: ARENA_WAVE_COUNT,
            maxVisibleEnemies: MAX_VISIBLE_ARENA_ENEMIES,
            levelsPerCity: ARENA_LEVELS_PER_CITY,
        },
        arenas,
    };
}

function parseArenaCompletionReward(raw: unknown, path: string): ArenaCompletionReward {
    const reward = requireRecord(raw, path);
    if (!Array.isArray(reward.crystals)) fail(`${path}.crystals`, 'must be an array');
    const crystals = reward.crystals.map((candidate, index): ArenaCrystalBonus => {
        const crystalPath = `${path}.crystals[${index}]`;
        const crystal = requireRecord(candidate, crystalPath);
        const tier = requireNonEmptyString(crystal.tier, `${crystalPath}.tier`) as CrystalTier;
        if (!ARENA_CRYSTAL_TIERS.has(tier)) {
            fail(`${crystalPath}.tier`, `unsupported crystal tier "${tier}"`);
        }
        const valueMin = requirePositiveInteger(crystal.valueMin, `${crystalPath}.valueMin`);
        const valueMax = requirePositiveInteger(crystal.valueMax, `${crystalPath}.valueMax`);
        if (valueMin > valueMax) fail(crystalPath, 'valueMin must not exceed valueMax');
        return {
            tier,
            count: requirePositiveInteger(crystal.count, `${crystalPath}.count`),
            valueMin,
            valueMax,
        };
    });
    const mana = reward.mana === undefined
        ? undefined
        : requireNonNegativeInteger(reward.mana, `${path}.mana`);
    return {
        coins: requireNonNegativeInteger(reward.coins, `${path}.coins`),
        ...(mana === undefined ? {} : { mana }),
        crystals,
    };
}

function parseForestRoomScene(
    raw: unknown,
    policies: Readonly<Record<string, EncounterMultiplayerPolicy>>,
    bosses: Readonly<Record<string, BossEncounterDefinition>>,
    enemiesByRef: ReadonlyMap<string, EnemyDefinition>,
    globalEncounterIds: Set<string>,
    sceneId: string = FOREST_ROOM_SCENE_ID,
): {
    scene: EncountersFileV3['scenes']['ForestRoomScene'];
    encounters: ReadonlyMap<string, JourneyBattleEncounter>;
} {
    const path = `encounters.scenes.${sceneId}`;
    const scene = requireRecord(raw, path);
    const rooms = requireRecord(scene.rooms, `${path}.rooms`);
    const roomOrder = parseKeyOrder(scene.roomOrder, rooms, `${path}.roomOrder`);
    const parsedRooms: Record<string, ForestRoomEncounterGroup> = {};
    const encounters = new Map<string, JourneyBattleEncounter>();
    for (const roomId of roomOrder) {
        const roomPath = `${path}.rooms.${roomId}`;
        const group = requireRecord(rooms[roomId], roomPath);
        const rawEncounters = requireNonEmptyArray(group.encounters, `${roomPath}.encounters`);
        const objectIds = new Set<string>();
        const parsed = rawEncounters.map((candidate, index) => {
            const encounterPath = `${roomPath}.encounters[${index}]`;
            const record = requireRecord(candidate, encounterPath);
            const objectId = requireUniqueId(record.objectId, `${encounterPath}.objectId`, objectIds, 'object');
            const encounter = parseJourneyEncounter(record, encounterPath, policies, bosses, enemiesByRef, globalEncounterIds);
            const withContext: ForestRoomBattleEncounter = { ...encounter, objectId };
            encounters.set(encounter.id, encounter);
            return withContext;
        });
        parsedRooms[roomId] = { encounters: parsed };
    }
    return { scene: { roomOrder, rooms: parsedRooms }, encounters };
}

function parseForestMapScene(
    raw: unknown,
    policies: Readonly<Record<string, EncounterMultiplayerPolicy>>,
    bosses: Readonly<Record<string, BossEncounterDefinition>>,
    enemiesByRef: ReadonlyMap<string, EnemyDefinition>,
    globalEncounterIds: Set<string>,
): {
    scene: EncountersFileV3['scenes']['ForestMapScene'];
    encounters: ReadonlyMap<string, JourneyBattleEncounter>;
} {
    const path = `encounters.scenes.${FOREST_MAP_SCENE_ID}`;
    const scene = requireRecord(raw, path);
    const stages = requireRecord(scene.stages, `${path}.stages`);
    const stageOrder = parseKeyOrder(scene.stageOrder, stages, `${path}.stageOrder`);
    const parsedStages: Record<string, ForestMapEncounterGroup> = {};
    const encounters = new Map<string, JourneyBattleEncounter>();
    for (const stageId of stageOrder) {
        const stagePath = `${path}.stages.${stageId}`;
        const group = requireRecord(stages[stageId], stagePath);
        const rawEncounters = requireNonEmptyArray(group.encounters, `${stagePath}.encounters`);
        const encounterIndexes = new Set<number>();
        const parsed = rawEncounters.map((candidate, index) => {
            const encounterPath = `${stagePath}.encounters[${index}]`;
            const record = requireRecord(candidate, encounterPath);
            const encounterIndex = requireNonNegativeInteger(record.encounterIndex, `${encounterPath}.encounterIndex`);
            if (encounterIndexes.has(encounterIndex)) fail(`${encounterPath}.encounterIndex`, `duplicate encounter index ${encounterIndex}`);
            encounterIndexes.add(encounterIndex);
            const encounter = parseJourneyEncounter(record, encounterPath, policies, bosses, enemiesByRef, globalEncounterIds);
            const withContext: ForestMapBattleEncounter = { ...encounter, encounterIndex };
            encounters.set(encounter.id, encounter);
            return withContext;
        });
        parsedStages[stageId] = { encounters: parsed };
    }
    return { scene: { stageOrder, stages: parsedStages }, encounters };
}

function parseJourneyEncounter(
    record: UnknownRecord,
    path: string,
    policies: Readonly<Record<string, EncounterMultiplayerPolicy>>,
    bosses: Readonly<Record<string, BossEncounterDefinition>>,
    enemiesByRef: ReadonlyMap<string, EnemyDefinition>,
    globalEncounterIds: Set<string>,
): JourneyBattleEncounter {
    const id = requireEncounterId(record.id, `${path}.id`, globalEncounterIds);
    if (record.kind !== 'battle' && record.kind !== 'boss') fail(`${path}.kind`, 'must be "battle" or "boss"');
    const kind = record.kind;
    const multiplayerPolicy = requirePolicy(record.multiplayerPolicy, `${path}.multiplayerPolicy`, policies, 'journey');
    const enemies = parseEnemyRefs(record.enemies, `${path}.enemies`, enemiesByRef, {
        max: kind === 'boss' ? 1 : 2,
    });
    if (kind === 'boss') {
        const bossId = requireNonEmptyString(record.bossId, `${path}.bossId`);
        if (!bosses[bossId]) fail(`${path}.bossId`, `references unknown boss "${bossId}"`);
        return { id, kind, multiplayerPolicy, enemies, bossId };
    }
    if (record.bossId !== undefined) fail(`${path}.bossId`, 'must be omitted for a regular battle');
    return { id, kind, multiplayerPolicy, enemies };
}

function parseBosses(raw: unknown): Record<string, BossEncounterDefinition> {
    const records = requireRecord(raw, 'encounters.bosses');
    if (Object.keys(records).length === 0) fail('encounters.bosses', 'must not be empty');
    const bosses: Record<string, BossEncounterDefinition> = {};
    for (const [id, candidate] of Object.entries(records)) {
        if (id.trim().length === 0) fail('encounters.bosses', 'boss ids must not be blank');
        bosses[id] = parseBoss(candidate, `encounters.bosses.${id}`);
    }
    return bosses;
}

function parseBoss(raw: unknown, path: string): BossEncounterDefinition {
    const boss = requireRecord(raw, path);
    const rawPhases = requireNonEmptyArray(boss.phases, `${path}.phases`);
    const phases = rawPhases.map((candidate, index) => parseBossPhase(candidate, `${path}.phases[${index}]`));
    const wave = boss.tidalWave === undefined ? undefined : requireRecord(boss.tidalWave, `${path}.tidalWave`);
    return {
        phases,
        phaseHealPlayer: requireNonNegativeInteger(boss.phaseHealPlayer, `${path}.phaseHealPlayer`),
        diamondReward: requireNonNegativeInteger(boss.diamondReward, `${path}.diamondReward`),
        ...(wave ? { tidalWave: {
            everyTurns: requirePositiveInteger(wave.everyTurns, `${path}.tidalWave.everyTurns`),
            bonusDamage: requireNonNegativeInteger(wave.bonusDamage, `${path}.tidalWave.bonusDamage`),
            blessingReduction: requireNonNegativeInteger(wave.blessingReduction, `${path}.tidalWave.blessingReduction`),
        } } : {}),
    };
}

function parseBossPhase(raw: unknown, path: string): BossPhaseDefinition {
    const phase = requireRecord(raw, path);
    const parsed: BossPhaseDefinition = {
        hp: requirePositiveInteger(phase.hp, `${path}.hp`),
        attack: requireNonNegativeInteger(phase.attack, `${path}.attack`),
        defense: requireNonNegativeInteger(phase.defense, `${path}.defense`),
        name: requireNonEmptyString(phase.name, `${path}.name`),
        nameCs: requireNonEmptyString(phase.nameCs, `${path}.nameCs`),
    };
    if (phase.mathType !== undefined) parsed.mathType = requireNonEmptyString(phase.mathType, `${path}.mathType`);
    if (phase.mathDifficulty !== undefined) parsed.mathDifficulty = requireNonNegativeInteger(phase.mathDifficulty, `${path}.mathDifficulty`);
    if (phase.ability !== undefined) parsed.ability = phase.ability === null ? null : requireNonEmptyString(phase.ability, `${path}.ability`);
    if (phase.healPercent !== undefined) parsed.healPercent = requireNonNegativeInteger(phase.healPercent, `${path}.healPercent`);
    for (const key of ['transitionAnim', 'idleAnim', 'attackAnim', 'tint'] as const) {
        if (phase[key] !== undefined) parsed[key] = requireNonEmptyString(phase[key], `${path}.${key}`);
    }
    if (phase.deathSequence !== undefined) {
        parsed.deathSequence = requireStringArray(phase.deathSequence, `${path}.deathSequence`);
    }
    return parsed;
}

function parseMultiplayerPolicies(raw: unknown): Record<string, EncounterMultiplayerPolicy> {
    const policiesRecord = requireRecord(raw, 'encounters.multiplayerPolicies');
    if (Object.keys(policiesRecord).length === 0) fail('encounters.multiplayerPolicies', 'must not be empty');
    const policies: Record<string, EncounterMultiplayerPolicy> = {};
    for (const [id, rawPolicy] of Object.entries(policiesRecord)) {
        if (id.trim().length === 0) fail('encounters.multiplayerPolicies', 'policy ids must not be blank');
        const path = `encounters.multiplayerPolicies.${id}`;
        const policy = requireRecord(rawPolicy, path);
        if (policy.kind === 'arena') policies[id] = parseArenaPolicy(policy, path);
        else if (policy.kind === 'journey') policies[id] = parseJourneyPolicy(policy, path);
        else fail(`${path}.kind`, 'must be "arena" or "journey"');
    }
    return policies;
}

function parseArenaPolicy(policy: UnknownRecord, path: string): ArenaMultiplayerPolicy {
    if (!Array.isArray(policy.rules) || policy.rules.length !== 2) {
        fail(`${path}.rules`, 'must contain append-last and scale-full-roster rules');
    }
    const appendRule = parseAppendLastRule(policy.rules[0], `${path}.rules[0]`);
    const scaleRule = parseScaleFullRosterRule(policy.rules[1], `${path}.rules[1]`);
    if (policy.rewardPolicy !== 'preserve-as-if-last-appended') {
        fail(`${path}.rewardPolicy`, 'must equal "preserve-as-if-last-appended"');
    }
    return { kind: 'arena', rules: [appendRule, scaleRule], rewardPolicy: 'preserve-as-if-last-appended' };
}

function parseJourneyPolicy(policy: UnknownRecord, path: string): JourneyMultiplayerPolicy {
    if (policy.nonBossStrategy !== 'append-last') fail(`${path}.nonBossStrategy`, 'must equal "append-last"');
    if (policy.bossStrategy !== 'scale-all-phases') fail(`${path}.bossStrategy`, 'must equal "scale-all-phases"');
    if (policy.bossHpScale !== COOP_FULL_ROSTER_HP_SCALE) fail(`${path}.bossHpScale`, `must equal ${COOP_FULL_ROSTER_HP_SCALE}`);
    if (policy.rounding !== 'ceil') fail(`${path}.rounding`, 'must equal "ceil"');
    if (policy.rewardPolicy !== 'resolved-roster') fail(`${path}.rewardPolicy`, 'must equal "resolved-roster"');
    return {
        kind: 'journey',
        nonBossStrategy: 'append-last',
        bossStrategy: 'scale-all-phases',
        bossHpScale: COOP_FULL_ROSTER_HP_SCALE,
        rounding: 'ceil',
        rewardPolicy: 'resolved-roster',
    };
}

function parseAppendLastRule(raw: unknown, path: string): AppendLastMultiplayerRule {
    const rule = requireRecord(raw, path);
    if (rule.strategy !== 'append-last') fail(`${path}.strategy`, 'must equal "append-last"');
    assertExactNumbers(rule.enemyCounts, [1, 2], `${path}.enemyCounts`);
    return { enemyCounts: [1, 2], strategy: 'append-last' };
}

function parseScaleFullRosterRule(raw: unknown, path: string): ScaleFullRosterMultiplayerRule {
    const rule = requireRecord(raw, path);
    if (rule.strategy !== 'scale-full-roster') fail(`${path}.strategy`, 'must equal "scale-full-roster"');
    assertExactNumbers(rule.enemyCounts, [3], `${path}.enemyCounts`);
    if (rule.hpScale !== COOP_FULL_ROSTER_HP_SCALE) fail(`${path}.hpScale`, `must equal ${COOP_FULL_ROSTER_HP_SCALE}`);
    if (rule.rounding !== 'ceil') fail(`${path}.rounding`, 'must equal "ceil"');
    return { enemyCounts: [3], strategy: 'scale-full-roster', hpScale: COOP_FULL_ROSTER_HP_SCALE, rounding: 'ceil' };
}

function parseEnemyRefs(
    raw: unknown,
    path: string,
    enemiesByRef: ReadonlyMap<string, EnemyDefinition>,
    options: { max: number; requiredSource?: 'core' },
): EncounterEnemyRef[] {
    if (!Array.isArray(raw) || raw.length < 1 || raw.length > options.max) {
        fail(path, `must contain between 1 and ${options.max} enemies`);
    }
    return raw.map((candidate, index) => {
        const enemyPath = `${path}[${index}]`;
        const record = requireRecord(candidate, enemyPath);
        if (record.source !== 'core') {
            fail(`${enemyPath}.source`, 'must equal "core"');
        }
        if (options.requiredSource && record.source !== options.requiredSource) {
            fail(`${enemyPath}.source`, `must equal "${options.requiredSource}"`);
        }
        const ref: EncounterEnemyRef = {
            source: record.source,
            enemyId: requireNonEmptyString(record.enemyId, `${enemyPath}.enemyId`),
        };
        if (!enemiesByRef.has(enemyRefKey(ref))) {
            fail(`${enemyPath}.enemyId`, `references unknown enemy "${ref.enemyId}" in enemies.json`);
        }
        return ref;
    });
}

function requirePolicy(
    raw: unknown,
    path: string,
    policies: Readonly<Record<string, EncounterMultiplayerPolicy>>,
    kind: EncounterMultiplayerPolicy['kind'],
): string {
    const id = requireNonEmptyString(raw, path);
    const policy = policies[id];
    if (!policy) fail(path, `references unknown policy "${id}"`);
    if (policy.kind !== kind) fail(path, `policy "${id}" must have kind "${kind}"`);
    return id;
}

function requireEncounterId(raw: unknown, path: string, ids: Set<string>): string {
    const id = requireNonEmptyString(raw, path);
    if (ids.has(id)) fail(path, `duplicate encounter id "${id}"`);
    ids.add(id);
    return id;
}

function requireUniqueId(raw: unknown, path: string, ids: Set<string>, label: string): string {
    const id = requireNonEmptyString(raw, path);
    if (ids.has(id)) fail(path, `duplicate ${label} id "${id}"`);
    ids.add(id);
    return id;
}

function parseKeyOrder(raw: unknown, records: UnknownRecord, path: string): string[] {
    const order = requireStringArray(raw, path);
    if (new Set(order).size !== order.length) fail(path, 'must not contain duplicates');
    const keys = Object.keys(records);
    if (order.length !== keys.length || order.some((key) => !Object.hasOwn(records, key))) {
        fail(path, 'must contain every object key exactly once');
    }
    return order;
}

function applyHpScale(hp: number, rule: ScaleFullRosterMultiplayerRule): number {
    return roundScaledHp(hp, rule.hpScale, rule.rounding);
}

function roundScaledHp(hp: number, scale: number, rounding: 'ceil'): number {
    return rounding === 'ceil' ? Math.ceil(hp * scale) : hp;
}

function cloneEnemyWithHp(enemy: EnemyDefinition, hp: number): EnemyDefinition {
    return { ...enemy, goldReward: [...enemy.goldReward] as [number, number], hp };
}

function enemyRefKey(ref: EncounterEnemyRef): string {
    return `${ref.source}:${ref.enemyId}`;
}

function assertEncounterMode(mode: unknown, path: string): asserts mode is EncounterMode {
    if (mode !== 'solo' && mode !== 'coop') fail(path, 'must be "solo" or "coop"');
}

function assertWaveIndex(waveIndex: number, waveCount: number): void {
    if (!Number.isInteger(waveIndex) || waveIndex < 0 || waveIndex >= waveCount) {
        fail('waveIndex', `must be an integer between 0 and ${waveCount - 1}`);
    }
}

function assertExactNumbers(raw: unknown, expected: readonly number[], path: string): void {
    if (!Array.isArray(raw) || raw.length !== expected.length || raw.some((value, index) => value !== expected[index])) {
        fail(path, `must equal [${expected.join(', ')}]`);
    }
}

function assertExactStrings(raw: unknown, expected: readonly string[], path: string): void {
    if (!Array.isArray(raw) || raw.length !== expected.length || raw.some((value, index) => value !== expected[index])) {
        fail(path, `must equal [${expected.map(value => `"${value}"`).join(', ')}]`);
    }
}

function validateGoldReward(raw: unknown, path: string): void {
    if (!Array.isArray(raw) || raw.length !== 2) fail(path, 'must be a [min, max] pair');
    const minimum = requireNonNegativeInteger(raw[0], `${path}[0]`);
    const maximum = requireNonNegativeInteger(raw[1], `${path}[1]`);
    if (minimum > maximum) fail(path, 'minimum must not exceed maximum');
}

function validateOptionalString(value: unknown, path: string): void {
    if (value !== undefined && typeof value !== 'string') fail(path, 'must be a string when present');
}

function validateOptionalPositiveNumber(value: unknown, path: string): void {
    if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)) {
        fail(path, 'must be a positive finite number when present');
    }
}

function validateOptionalFiniteNumber(value: unknown, path: string): void {
    if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value))) {
        fail(path, 'must be a finite number when present');
    }
}

function parseNullableNonEmptyString(value: unknown, path: string): string | null {
    return value === null ? null : requireNonEmptyString(value, path);
}

function requireStringArray(value: unknown, path: string): string[] {
    if (!Array.isArray(value)) fail(path, 'must be an array');
    return value.map((item, index) => requireNonEmptyString(item, `${path}[${index}]`));
}

function requireNonEmptyArray(value: unknown, path: string): unknown[] {
    if (!Array.isArray(value) || value.length === 0) fail(path, 'must be a non-empty array');
    return value;
}

function requireRecord(value: unknown, path: string): UnknownRecord {
    if (!isRecord(value)) fail(path, 'must be an object');
    return value;
}

function requireNonEmptyString(value: unknown, path: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) fail(path, 'must be a non-empty string');
    return value;
}

function requirePositiveInteger(value: unknown, path: string): number {
    if (!Number.isInteger(value) || (value as number) <= 0) fail(path, 'must be a positive integer');
    return value as number;
}

function requireNonNegativeInteger(value: unknown, path: string): number {
    if (!Number.isInteger(value) || (value as number) < 0) fail(path, 'must be a non-negative integer');
    return value as number;
}

function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneJsonValue<T>(value: T): T {
    if (Array.isArray(value)) return value.map((item) => cloneJsonValue(item)) as T;
    if (isRecord(value)) {
        const clone: UnknownRecord = {};
        for (const [key, item] of Object.entries(value)) clone[key] = cloneJsonValue(item);
        return clone as T;
    }
    return value;
}

function fail(path: string, message: string): never {
    throw new EncounterCatalogError(`${path}: ${message}`);
}
