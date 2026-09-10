import { describe, expect, it } from 'vitest';
import encountersJson from '../../../public/assets/data/encounters.json';
import enemiesJson from '../../../public/assets/data/enemies.json';
import forestRoomsJson from '../../../public/assets/data/forest-rooms.json';
import forestJourneyJson from '../../../public/assets/data/forest-journey.json';
import type { EnemyDefinition } from '../../types';
import {
    EncounterCatalogError,
    createEncounterCatalog,
    validateEncountersFile,
    type EncounterEnemySources,
} from '../EncounterCatalog';

type MutableFixture = Record<string, any>;

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

function mutableEncounters(): MutableFixture {
    return clone(encountersJson) as MutableFixture;
}

function mutableEnemies(): EnemyDefinition[] & MutableFixture[] {
    return clone(enemiesJson) as unknown as EnemyDefinition[] & MutableFixture[];
}

function enemySources(core = mutableEnemies()): EncounterEnemySources {
    return { core };
}

function createProductionCatalog() {
    return createEncounterCatalog(encountersJson, enemySources());
}

function productionArenas(): MutableFixture[] {
    const arenas = Object.values(
        (encountersJson as MutableFixture).scenes.ArenaScene.arenas,
    ) as MutableFixture[];
    return arenas.sort((left, right) => left.level - right.level);
}

function setWaveEnemies(
    document: MutableFixture,
    arenaLevel: number,
    waveIndex: number,
    enemyIds: readonly string[],
): void {
    document.scenes.ArenaScene.arenas[String(arenaLevel)].waves[waveIndex].enemies = enemyIds.map(
        enemyId => ({ source: 'core', enemyId }),
    );
}

function requireEnemy(id: string, enemies = mutableEnemies()): EnemyDefinition {
    const enemy = enemies.find(candidate => candidate.id === id);
    if (!enemy) throw new Error(`Missing test enemy ${id}`);
    return enemy;
}

describe('EncounterCatalog production parity', () => {
    it('validates the production file and its required scene-first metadata', () => {
        const validated = validateEncountersFile(encountersJson, enemySources());

        expect(validated.schemaVersion).toBe(3);
        expect(validated.sceneOrder).toEqual(['ArenaScene', 'ForestRoomScene', 'ForestMapScene', 'UnderwaterRoomScene']);
        expect(validated.scenes.ArenaScene.metadata).toEqual({
            waveCount: 5,
            maxVisibleEnemies: 3,
            levelsPerCity: 3,
        });
        expect(validated.multiplayerPolicies['arena-coop-v1']).toEqual({
            kind: 'arena',
            rules: [
                { enemyCounts: [1, 2], strategy: 'append-last' },
                {
                    enemyCounts: [3],
                    strategy: 'scale-full-roster',
                    hpScale: 1.35,
                    rounding: 'ceil',
                },
            ],
            rewardPolicy: 'preserve-as-if-last-appended',
        });
    });

    it('preserves the exact enemy order published in encounters.json', () => {
        const catalog = createProductionCatalog();
        const sourceArenas = productionArenas();
        const expectedLevels = sourceArenas.map(arena => arena.level);
        const expectedRosters = sourceArenas.flatMap(arena => (
            arena.waves.map((wave: MutableFixture) => (
                wave.enemies.map((enemy: MutableFixture) => enemy.enemyId)
            ))
        ));
        const actual = catalog.getArenaLevels().flatMap((level) =>
            catalog.getArena(level).waves.map((_, waveIndex) =>
                catalog.resolveArenaWave({ arenaLevel: level, waveIndex, mode: 'solo' }),
            ),
        );

        expect(catalog.getArenaLevels()).toEqual(expectedLevels);
        expect(actual).toHaveLength(expectedRosters.length);
        expect(actual.map((wave) => wave.enemies.map((enemy) => enemy.id)))
            .toEqual(expectedRosters);
        expect(actual.every((wave) => wave.coopAdjustment === 'none')).toBe(true);
        for (const arena of sourceArenas) {
            for (let waveIndex = 0; waveIndex < arena.waves.length; waveIndex += 1) {
                expect(catalog.getWave(arena.level, waveIndex).enemies.every(
                    (enemy) => enemy.source === 'core',
                )).toBe(true);
            }
        }
    });

    it('exposes arena and encounter lookup helpers without mutable internal data', () => {
        const catalog = createProductionCatalog();
        const sourceArenas = productionArenas();
        const firstArena = sourceArenas[0];
        const lookupArena = sourceArenas[1] ?? firstArena;
        const lastArena = sourceArenas.at(-1)!;
        const lookupWave = lastArena.waves.at(-1)!;
        const originalEnemyId = firstArena.waves[0].enemies[0].enemyId;
        const replacementEnemyId = mutableEnemies().find(enemy => enemy.id !== originalEnemyId)!.id;

        expect(catalog.getMaxArenaLevel()).toBe(lastArena.level);
        expect(catalog.getArenaCities()).toEqual(['mathoria', 'silverpond']);
        expect(catalog.getArenaLevelsForCity('mathoria').map(arena => arena.cityArenaLevel))
            .toEqual([1, 2, 3]);
        expect(catalog.getArenaLevelsForCity('silverpond').map(arena => arena.level))
            .toEqual([4, 5, 6]);
        expect(catalog.getArenaByCityLevel('mathoria', 3).id).toBe('arena-3');
        expect(catalog.getArenaByCityLevel('silverpond', 3).id).toBe('silverpond-arena-3');
        expect(catalog.getArenaById(lookupArena.id).level).toBe(lookupArena.level);
        expect(catalog.getWaveById(lookupWave.id)).toEqual(
            catalog.getWave(lastArena.level, lookupWave.index),
        );
        expect(catalog.getArenaWave(firstArena.level, 0)).toEqual(
            catalog.getWave(firstArena.level, 0),
        );

        const arena = catalog.getArena(firstArena.level);
        (arena.waves[0].enemies as unknown as MutableFixture[])[0].enemyId = replacementEnemyId;
        expect(catalog.getWave(firstArena.level, 0).enemies[0].enemyId).toBe(originalEnemyId);
    });

    it('preserves completion links and bonuses published in encounters.json', () => {
        const catalog = createProductionCatalog();

        for (const sourceArena of productionArenas()) {
            expect(catalog.getArena(sourceArena.level).metadata).toEqual(sourceArena.metadata);
        }
    });

    it('accepts optional mana in arena rewards and defaults existing rewards to none', () => {
        const document = mutableEncounters();
        document.scenes.ArenaScene.arenas['1'].waves[0].completionBonus.firstCompletion.mana = 3;
        delete document.scenes.ArenaScene.arenas['1'].waves[1].completionBonus.firstCompletion.mana;
        const catalog = createEncounterCatalog(document, enemySources());

        expect(catalog.getArena(1).waves[0].completionBonus.firstCompletion.mana).toBe(3);
        expect(catalog.getArena(1).waves[1].completionBonus.firstCompletion.mana).toBeUndefined();
    });
});

describe('EncounterCatalog runtime validation', () => {
    it('rejects an unsupported schema version or scene order', () => {
        const badVersion = mutableEncounters();
        badVersion.schemaVersion = 1;
        expect(() => validateEncountersFile(badVersion, enemySources()))
            .toThrowError(/schemaVersion.*must equal 3/);

        const badOrder = mutableEncounters();
        badOrder.sceneOrder = ['BattleScene', 'ArenaScene', 'ForestMapScene'];
        expect(() => validateEncountersFile(badOrder, enemySources()))
            .toThrowError(/sceneOrder.*ArenaScene/);
    });

    it('rejects malformed or unreferenced multiplayer policies', () => {
        const badScale = mutableEncounters();
        badScale.multiplayerPolicies['arena-coop-v1'].rules[1].hpScale = 1.5;
        expect(() => createEncounterCatalog(badScale, enemySources()))
            .toThrowError(/hpScale.*1\.35/);

        const unknownPolicy = mutableEncounters();
        unknownPolicy.scenes.ArenaScene.arenas['1'].multiplayerPolicy = 'missing';
        expect(() => createEncounterCatalog(unknownPolicy, enemySources()))
            .toThrowError(/multiplayerPolicy.*unknown policy/);
    });

    it('rejects bad wave counts, indices, ids, and roster sizes', () => {
        const shortArena = mutableEncounters();
        shortArena.scenes.ArenaScene.arenas['1'].waves.pop();
        expect(() => createEncounterCatalog(shortArena, enemySources()))
            .toThrowError(/waves.*exactly 5/);

        const badIndex = mutableEncounters();
        badIndex.scenes.ArenaScene.arenas['1'].waves[1].index = 4;
        expect(() => createEncounterCatalog(badIndex, enemySources()))
            .toThrowError(/index.*array index 1/);

        const duplicateId = mutableEncounters();
        duplicateId.scenes.ArenaScene.arenas['1'].waves[1].id = 'arena-1-wave-1';
        expect(() => createEncounterCatalog(duplicateId, enemySources()))
            .toThrowError(/duplicate encounter id/);

        const emptyRoster = mutableEncounters();
        emptyRoster.scenes.ArenaScene.arenas['1'].waves[0].enemies = [];
        expect(() => createEncounterCatalog(emptyRoster, enemySources()))
            .toThrowError(/between 1 and 3 enemies/);
    });

    it('rejects unsupported enemy sources and unknown core enemy ids', () => {
        const unsupportedSource = mutableEncounters();
        unsupportedSource.scenes.ArenaScene.arenas['1'].waves[0].enemies[0].source = 'mod';
        expect(() => createEncounterCatalog(unsupportedSource, enemySources()))
            .toThrowError(/source.*must equal "core"/);

        const unknownEnemy = mutableEncounters();
        unknownEnemy.scenes.ArenaScene.arenas['1'].waves[0].enemies[0].enemyId = 'missing';
        expect(() => createEncounterCatalog(unknownEnemy, enemySources()))
            .toThrowError(/unknown enemy "missing" in enemies\.json/);
    });

    it('rejects broken completion metadata and arena links', () => {
        const badCompletion = mutableEncounters();
        badCompletion.scenes.ArenaScene.arenas['1'].metadata.completionEncounterId = 'arena-2-wave-5';
        expect(() => createEncounterCatalog(badCompletion, enemySources()))
            .toThrowError(/completionEncounterId.*must reference a wave/);

        const badNextArena = mutableEncounters();
        badNextArena.scenes.ArenaScene.arenas['1'].metadata.nextArenaId = 'arena-99';
        expect(() => createEncounterCatalog(badNextArena, enemySources()))
            .toThrowError(/nextArenaId.*unknown arena/);
    });

    it('rejects a negative or fractional mana reward', () => {
        const negativeMana = mutableEncounters();
        negativeMana.scenes.ArenaScene.arenas['1'].metadata.completionBonus.mana = -1;
        expect(() => createEncounterCatalog(negativeMana, enemySources()))
            .toThrowError(/completionBonus\.mana.*non-negative integer/);

        const fractionalMana = mutableEncounters();
        fractionalMana.scenes.ArenaScene.arenas['1'].waves[0].completionBonus.firstPerfect.mana = 1.5;
        expect(() => createEncounterCatalog(fractionalMana, enemySources()))
            .toThrowError(/firstPerfect\.mana.*non-negative integer/);
    });

    it('requires exactly three locally numbered arena levels per city', () => {
        const duplicateCityLevel = mutableEncounters();
        duplicateCityLevel.scenes.ArenaScene.arenas['2'].cityArenaLevel = 1;
        expect(() => createEncounterCatalog(duplicateCityLevel, enemySources()))
            .toThrowError(/cityArenaLevel.*duplicate level 1/);

        const missingCityLevel = mutableEncounters();
        delete missingCityLevel.scenes.ArenaScene.arenas['3'];
        missingCityLevel.scenes.ArenaScene.arenas['2'].metadata.nextArenaId = null;
        expect(() => createEncounterCatalog(missingCityLevel, enemySources()))
            .toThrowError(/city "mathoria" must define exactly 3 arena levels/);
    });

    it('rejects duplicate or malformed core enemy definitions', () => {
        const duplicateEnemies = mutableEnemies();
        duplicateEnemies.push(clone(duplicateEnemies[0]));
        expect(() => createEncounterCatalog(encountersJson, enemySources(duplicateEnemies)))
            .toThrowError(/duplicate enemy id/);

        const invertedReward = mutableEnemies();
        invertedReward[0].goldReward = [5, 1];
        expect(() => createEncounterCatalog(encountersJson, enemySources(invertedReward)))
            .toThrowError(/minimum must not exceed maximum/);
    });

    it('uses a dedicated error type and rejects invalid lookup requests', () => {
        const catalog = createProductionCatalog();

        expect(() => catalog.getArena(0)).toThrow(EncounterCatalogError);
        expect(() => catalog.getArena(99)).toThrowError(/unknown arena level/);
        expect(() => catalog.getArenaById('missing')).toThrowError(/unknown arena/);
        expect(() => catalog.getWave(1, 5)).toThrowError(/between 0 and 4/);
        expect(() => catalog.getWaveById('missing')).toThrowError(/unknown arena encounter/);
    });
});

describe('EncounterCatalog arena resolver', () => {
    it('resolves solo waves without applying multiplayer adjustments', () => {
        const document = mutableEncounters();
        const enemies = mutableEnemies();
        const arenaLevel = productionArenas()[0].level;
        const enemyIds = enemies.slice(0, 2).map(enemy => enemy.id);
        setWaveEnemies(document, arenaLevel, 0, enemyIds);
        const result = createEncounterCatalog(document, enemySources(enemies)).resolveArenaWave({
            arenaLevel,
            waveIndex: 0,
            mode: 'solo',
        });

        expect(result.encounterId).toBe(document.scenes.ArenaScene.arenas[String(arenaLevel)].waves[0].id);
        expect(result.enemies.map((enemy) => enemy.id)).toEqual(enemyIds);
        expect(result.enemies.map((enemy) => enemy.hp)).toEqual(
            enemyIds.map(id => requireEnemy(id, enemies).hp),
        );
        expect(result.coopAdjustment).toBe('none');
        expect(result.rewardMetadata).toEqual({
            mode: 'base-roster',
            sources: enemyIds.map((enemyId, index) => ({
                source: 'core',
                enemyId,
                kind: 'base',
                resolvedEnemyIndex: index,
            })),
        });
    });

    it('appends a cloned last enemy for one- and two-enemy co-op waves', () => {
        const document = mutableEncounters();
        const enemies = mutableEnemies();
        const arenaLevel = productionArenas()[0].level;
        const [firstId, secondId] = enemies.slice(0, 2).map(enemy => enemy.id);
        setWaveEnemies(document, arenaLevel, 0, [firstId]);
        setWaveEnemies(document, arenaLevel, 1, [firstId, secondId]);
        const catalog = createEncounterCatalog(document, enemySources(enemies));
        const oneEnemy = catalog.resolveArenaWave({ arenaLevel, waveIndex: 0, mode: 'coop' });
        const twoEnemies = catalog.resolveArenaWave({ arenaLevel, waveIndex: 1, mode: 'coop' });

        expect(oneEnemy.enemies.map((enemy) => [enemy.id, enemy.hp])).toEqual(
            Array.from({ length: 2 }, () => [firstId, requireEnemy(firstId, enemies).hp]),
        );
        expect(oneEnemy.enemies[0]).not.toBe(oneEnemy.enemies[1]);
        expect(oneEnemy.coopAdjustment).toBe('append-last');
        expect(oneEnemy.rewardMetadata.sources.at(-1)).toEqual({
            source: 'core',
            enemyId: firstId,
            kind: 'coop-appended',
            resolvedEnemyIndex: 1,
        });

        expect(twoEnemies.enemies.map((enemy) => enemy.id)).toEqual([
            firstId,
            secondId,
            secondId,
        ]);
        expect(twoEnemies.rewardMetadata.mode).toBe('preserve-as-if-last-appended');
        expect(twoEnemies.rewardMetadata.sources.at(-1)?.resolvedEnemyIndex).toBe(2);
    });

    it('keeps three visible enemies, scales every HP with ceil, and preserves virtual rewards', () => {
        const document = mutableEncounters();
        const enemies = mutableEnemies();
        const arenaLevel = productionArenas()[0].level;
        const enemyIds = enemies.slice(0, 3).map(enemy => enemy.id);
        setWaveEnemies(document, arenaLevel, 2, enemyIds);
        const result = createEncounterCatalog(document, enemySources(enemies)).resolveArenaWave({
            arenaLevel,
            waveIndex: 2,
            mode: 'coop',
        });

        expect(result.enemies.map((enemy) => enemy.id)).toEqual(enemyIds);
        expect(result.enemies.map((enemy) => enemy.hp)).toEqual(
            enemyIds.map(id => Math.ceil(requireEnemy(id, enemies).hp * 1.35)),
        );
        expect(result.coopAdjustment).toBe('scale-full-roster');
        expect(result.rewardMetadata).toEqual({
            mode: 'preserve-as-if-last-appended',
            sources: [
                ...enemyIds.map((enemyId, index) => ({
                    source: 'core',
                    enemyId,
                    kind: 'base',
                    resolvedEnemyIndex: index,
                })),
                { source: 'core', enemyId: enemyIds.at(-1), kind: 'coop-appended', resolvedEnemyIndex: null },
            ],
        });
    });

    it('does not mutate source JSON, source enemies, or catalog state', () => {
        const rawEncounters = mutableEncounters();
        const rawEnemies = mutableEnemies();
        const arenaLevel = productionArenas()[0].level;
        const enemyIds = rawEnemies.slice(0, 3).map(enemy => enemy.id);
        setWaveEnemies(rawEncounters, arenaLevel, 0, enemyIds);
        const encountersBefore = clone(rawEncounters);
        const enemiesBefore = clone(rawEnemies);
        const catalog = createEncounterCatalog(rawEncounters, enemySources(rawEnemies));

        const expected = catalog.resolveArenaWave({ arenaLevel, waveIndex: 0, mode: 'coop' });
        const resolved = catalog.resolveArenaWave({ arenaLevel, waveIndex: 0, mode: 'coop' });
        expect(rawEncounters).toEqual(encountersBefore);
        expect(rawEnemies).toEqual(enemiesBefore);

        resolved.enemies[0].hp = 999;
        resolved.enemies[0].goldReward[0] = 999;
        rawEncounters.scenes.ArenaScene.arenas[String(arenaLevel)].waves[0].enemies[0].enemyId = enemyIds[1];
        rawEnemies.find((enemy) => enemy.id === enemyIds[0])!.hp = 999;

        const resolvedAgain = catalog.resolveArenaWave({ arenaLevel, waveIndex: 0, mode: 'coop' });
        expect(resolvedAgain).toEqual(expected);
    });

    it('rejects invalid resolver requests at runtime', () => {
        const catalog = createProductionCatalog();

        expect(() => catalog.resolveArenaWave({ arenaLevel: 9, waveIndex: 0, mode: 'solo' }))
            .toThrowError(/unknown arena level/);
        expect(() => catalog.resolveArenaWave({ arenaLevel: 1, waveIndex: -1, mode: 'solo' }))
            .toThrowError(/waveIndex/);
        expect(() => catalog.resolveArenaWave({
            arenaLevel: 1,
            waveIndex: 0,
            mode: 'invalid' as 'solo',
        })).toThrowError(/request.mode/);
    });
});

describe('EncounterCatalog forest and boss resolver', () => {
    it('maps every room battle object and legacy map battle to an encounter id', () => {
        const catalog = createProductionCatalog();
        const rooms = (forestRoomsJson as MutableFixture).rooms as Record<string, MutableFixture>;
        for (const [roomId, room] of Object.entries(rooms)) {
            for (const object of room.objects as MutableFixture[]) {
                if (object.type !== 'enemy' && object.type !== 'boss') continue;
                const mapped = catalog.getForestRoomEncounter(roomId, object.id);
                expect(mapped.id).toBe(object.encounterId);
            }
        }

        const stages = (forestJourneyJson as MutableFixture).journey.stages as MutableFixture[];
        for (const stage of stages) {
            (stage.encounters as MutableFixture[]).forEach((encounter, encounterIndex) => {
                if (encounter.type !== 'battle' && encounter.type !== 'boss') return;
                const mapped = catalog.getForestMapEncounter(stage.id, encounterIndex);
                expect(mapped.id).toBe(encounter.encounterId);
            });
        }
    });

    it('resolves forest battles exclusively from enemies.json', () => {
        const catalog = createProductionCatalog();
        const wolf = catalog.resolveJourneyEncounter('forest-room-edge-wolf', 'solo').enemies[0];
        const mushroom = catalog.resolveJourneyEncounter('forest-room-riddle-mushroom', 'solo').enemies[0];
        const treant = catalog.resolveJourneyEncounter('forest-room-grove-treant', 'solo').enemies[0];

        expect([wolf.id, wolf.hp, wolf.attack, wolf.defense]).toEqual(['forest_wolf', 15, 4, 2]);
        expect([mushroom.id, mushroom.hp, mushroom.attack, mushroom.defense]).toEqual(['giant_mushroom', 20, 3, 3]);
        expect([treant.id, treant.hp, treant.attack, treant.defense]).toEqual(['ancient_treant', 25, 3, 4]);
    });

    it('resolves a two-enemy room encounter and appends the last enemy in co-op', () => {
        const catalog = createProductionCatalog();
        const solo = catalog.resolveJourneyEncounter('forest-room-deep-mushroom-pack', 'solo');
        const coop = catalog.resolveJourneyEncounter('forest-room-deep-mushroom-pack', 'coop');

        expect(solo.enemies.map(enemy => enemy.id)).toEqual(['giant_mushroom', 'forest_wolf']);
        expect(coop.enemies.map(enemy => enemy.id)).toEqual([
            'giant_mushroom',
            'forest_wolf',
            'forest_wolf',
        ]);
        expect(coop.coopAdjustment).toBe('append-last');
        expect(coop.enemies[1]).not.toBe(coop.enemies[2]);
    });

    it('resolves all boss phases from one profile and scales every phase in co-op', () => {
        const catalog = createProductionCatalog();
        const solo = catalog.resolveJourneyEncounter('forest-room-guardian-boss', 'solo');
        const coop = catalog.resolveJourneyEncounter('forest-map-guardian-boss', 'coop');
        const sourceProfile = (encountersJson as MutableFixture).bosses['verdant-guardian-v1'];
        const sourcePolicy = (encountersJson as MutableFixture).multiplayerPolicies['forest-coop-v1'];
        const sourcePhases = sourceProfile.phases.map((phase: MutableFixture) => [
            phase.hp,
            phase.attack,
            phase.defense,
        ]);

        expect(solo.kind).toBe('boss');
        expect(solo.boss?.phases.map(phase => [phase.hp, phase.attack, phase.defense]))
            .toEqual(sourcePhases);
        expect(coop.boss?.phases.map(phase => phase.hp)).toEqual(
            sourceProfile.phases.map((phase: MutableFixture) => (
                Math.ceil(phase.hp * sourcePolicy.bossHpScale)
            )),
        );
        expect(solo.boss?.diamondReward).toBe(sourceProfile.diamondReward);
        expect(coop.enemies[0].hp).toBe(
            Math.ceil(sourceProfile.phases[0].hp * sourcePolicy.bossHpScale),
        );
        expect(coop.coopAdjustment).toBe('scale-all-phases');
        expect([
            solo.enemies[0].hp,
            solo.enemies[0].attack,
            solo.enemies[0].defense,
        ]).toEqual(sourcePhases[0]);
    });

    it('rejects missing enemies.json entries and invalid boss profile links', () => {
        const missingEnemy = mutableEncounters();
        missingEnemy.scenes.ForestRoomScene.rooms.forest_edge.encounters[0].enemies[0].enemyId = 'missing';
        expect(() => createEncounterCatalog(missingEnemy, enemySources()))
            .toThrowError(/unknown enemy "missing" in enemies\.json/);

        const missingBoss = mutableEncounters();
        missingBoss.scenes.ForestRoomScene.rooms.guardian_lair.encounters[0].bossId = 'missing';
        expect(() => createEncounterCatalog(missingBoss, enemySources()))
            .toThrowError(/bossId.*unknown boss/);
    });
});
