import encountersJson from '../../../public/assets/data/encounters.json';
import enemiesJson from '../../../public/assets/data/enemies.json';

import type { ArenaTarget, RosterEntry } from './arena-harness';

type JsonRecord = Record<string, any>;

export interface ProductionWaveExpectation {
    target: ArenaTarget;
    baseRoster: RosterEntry[];
    resolvedRoster: RosterEntry[];
    coinReward: { min: number; max: number };
}

export interface ProductionBossExpectation {
    encounterId: string;
    phases: Array<{ hp: number; attack: number; defense: number }>;
}

const document = encountersJson as JsonRecord;
const enemyById = new Map(
    (enemiesJson as JsonRecord[]).map(enemy => [enemy.id as string, enemy]),
);
const arenas = (Object.values(
    document.scenes.ArenaScene.arenas,
) as JsonRecord[]).sort((left, right) => left.level - right.level);

function requireEnemy(enemyId: string): JsonRecord {
    const enemy = enemyById.get(enemyId);
    if (!enemy) throw new Error(`encounters.json references missing enemy ${enemyId}`);
    return enemy;
}

function getArena(arenaLevel: number): JsonRecord {
    const arena = arenas.find(candidate => candidate.level === arenaLevel);
    if (!arena) throw new Error(`Missing production arena ${arenaLevel}`);
    return arena;
}

function getJourneyEncounter(encounterId: string): JsonRecord {
    const sceneDefinitions = [
        ...Object.values(document.scenes.ForestRoomScene.rooms),
        ...Object.values(document.scenes.ForestMapScene.stages),
    ] as JsonRecord[];
    const encounter = sceneDefinitions
        .flatMap(definition => definition.encounters as JsonRecord[])
        .find(candidate => candidate.id === encounterId);
    if (!encounter) throw new Error(`Missing production journey encounter ${encounterId}`);
    return encounter;
}

export function getProductionBossExpectation(
    encounterId: string,
    mode: 'solo' | 'coop',
): ProductionBossExpectation {
    const encounter = getJourneyEncounter(encounterId);
    const profile = document.bosses[encounter.bossId];
    if (!profile) throw new Error(`Missing production boss profile ${encounter.bossId}`);
    const policy = document.multiplayerPolicies[encounter.multiplayerPolicy];
    const hpScale = mode === 'coop' ? policy.bossHpScale : 1;
    const roundHp = (hp: number): number => policy.rounding === 'ceil'
        ? Math.ceil(hp * hpScale)
        : Math.round(hp * hpScale);

    return {
        encounterId,
        phases: profile.phases.map((phase: JsonRecord) => ({
            hp: roundHp(phase.hp),
            attack: phase.attack,
            defense: phase.defense,
        })),
    };
}

export function getProductionWaveExpectation(
    arenaLevel: number,
    waveIndex: number,
    mode: 'solo' | 'coop',
): ProductionWaveExpectation {
    const arena = getArena(arenaLevel);
    const wave = arena.waves[waveIndex];
    if (!wave) throw new Error(`Missing production arena ${arenaLevel} wave ${waveIndex}`);

    const baseEnemies = wave.enemies.map((reference: JsonRecord) => requireEnemy(reference.enemyId));
    const policy = document.multiplayerPolicies[arena.multiplayerPolicy];
    const rule = mode === 'coop'
        ? policy.rules.find((candidate: JsonRecord) => candidate.enemyCounts.includes(baseEnemies.length))
        : null;
    const resolvedEnemies = rule?.strategy === 'append-last'
        ? [...baseEnemies, baseEnemies.at(-1)]
        : baseEnemies;
    const hpScale = rule?.strategy === 'scale-full-roster' ? rule.hpScale : 1;
    const rewardEnemies = mode === 'coop'
        ? [...baseEnemies, baseEnemies.at(-1)]
        : baseEnemies;

    return {
        target: {
            arenaLevel,
            wave: waveIndex,
            encounterId: wave.id,
        },
        baseRoster: baseEnemies.map((enemy: JsonRecord) => ({ id: enemy.id, hp: enemy.hp })),
        resolvedRoster: resolvedEnemies.map((enemy: JsonRecord) => ({
            id: enemy.id,
            hp: Math.ceil(enemy.hp * hpScale),
        })),
        coinReward: rewardEnemies.reduce(
            (range: { min: number; max: number }, enemy: JsonRecord) => ({
                min: range.min + enemy.goldReward[0],
                max: range.max + enemy.goldReward[1],
            }),
            { min: 0, max: 0 },
        ),
    };
}

export function getNextProductionEncounterId(
    arenaLevel: number,
    waveIndex: number,
): string | null {
    return getArena(arenaLevel).waves[waveIndex + 1]?.id ?? null;
}

/** One current production wave per roster-size policy branch, with no fixed enemy IDs. */
export function getRepresentativeCoopWaves(): Array<ProductionWaveExpectation & { name: string }> {
    const representatives = new Map<number, ProductionWaveExpectation & { name: string }>();

    for (const arena of arenas) {
        arena.waves.forEach((wave: JsonRecord, waveIndex: number) => {
            const enemyCount = wave.enemies.length;
            if (representatives.has(enemyCount)) return;
            representatives.set(enemyCount, {
                name: `${enemyCount} base ${enemyCount === 1 ? 'enemy' : 'enemies'} from encounters.json`,
                ...getProductionWaveExpectation(arena.level, waveIndex, 'coop'),
            });
        });
    }

    return [...representatives.values()].sort(
        (left, right) => left.baseRoster.length - right.baseRoster.length,
    );
}

export function getFirstEnemyIdOutside(roster: readonly RosterEntry[]): string {
    const rosterIds = new Set(roster.map(enemy => enemy.id));
    const enemy = [...enemyById.values()].find(candidate => !rosterIds.has(candidate.id));
    if (!enemy) throw new Error('No decoy enemy is available for the arena source-of-truth test');
    return enemy.id;
}
