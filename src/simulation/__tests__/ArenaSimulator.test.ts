import { describe, expect, it } from 'vitest';
import encountersJson from '../../../public/assets/data/encounters.json';
import enemiesJson from '../../../public/assets/data/enemies.json';
import {
  calculateArenaStats,
  simulateArenaAttempt,
} from '../ArenaSimulator';
import { resolveProductionArena } from '../ProductionEncounterAdapter';
import { createInitialPlayerState, type AccuracyProfile } from '../types';

type JsonRecord = Record<string, any>;

interface SourceWaveStats {
  wave: number;
  enemies: string[];
  hp: number;
  atk: number;
}

const sourceDocument = encountersJson as JsonRecord;
const sourceEnemies = new Map(
  (enemiesJson as JsonRecord[]).map(enemy => [enemy.id as string, enemy]),
);
const sourceArenas = (Object.values(
  sourceDocument.scenes.ArenaScene.arenas,
) as JsonRecord[]).sort((left, right) => left.level - right.level);

function sourceWaveStats(arena: JsonRecord, mode: 'solo' | 'coop'): SourceWaveStats[] {
  return arena.waves.map((wave: JsonRecord, waveIndex: number) => {
    const baseEnemies = wave.enemies.map((reference: JsonRecord) => {
      const enemy = sourceEnemies.get(reference.enemyId);
      if (!enemy) throw new Error(`Missing source enemy ${reference.enemyId}`);
      return enemy;
    });
    const policy = sourceDocument.multiplayerPolicies[arena.multiplayerPolicy];
    const rule = mode === 'coop'
      ? policy.rules.find((candidate: JsonRecord) => candidate.enemyCounts.includes(baseEnemies.length))
      : null;
    const resolvedEnemies = rule?.strategy === 'append-last'
      ? [...baseEnemies, baseEnemies.at(-1)]
      : baseEnemies;
    const hpScale = rule?.strategy === 'scale-full-roster' ? rule.hpScale : 1;

    return {
      wave: waveIndex + 1,
      enemies: resolvedEnemies.map((enemy: JsonRecord) => enemy.id),
      hp: resolvedEnemies.reduce(
        (total: number, enemy: JsonRecord) => total + Math.ceil(enemy.hp * hpScale),
        0,
      ),
      atk: resolvedEnemies.reduce(
        (total: number, enemy: JsonRecord) => total + enemy.attack,
        0,
      ),
    };
  });
}

function sourceArenaStats(arena: JsonRecord, mode: 'solo' | 'coop') {
  const waveDetails = sourceWaveStats(arena, mode);
  return {
    totalHP: waveDetails.reduce((total, wave) => total + wave.hp, 0),
    totalATK: waveDetails.reduce((total, wave) => total + wave.atk, 0),
    waveDetails,
  };
}

const perfectAccuracy: AccuracyProfile = {
  baseProblems: 1,
  bonusProblems: 1,
  blockProblems: 1,
  puzzles: 1,
  trialTiers: { bronze: 1, silver: 1, gold: 1 },
};

describe('ArenaSimulator production encounter integration', () => {
  it.each(sourceArenas.map(arena => [arena.level, arena] as const))(
    'derives every solo stat for arena %i from encounters.json and enemies.json',
    (arenaLevel, sourceArena) => {
      const expected = sourceArenaStats(sourceArena, 'solo');
      expect(calculateArenaStats(arenaLevel)).toEqual(expected);
      expect(calculateArenaStats(arenaLevel, { mode: 'solo' })).toEqual(expected);
    },
  );

  it.each(sourceArenas.map(arena => [arena.level, arena] as const))(
    'derives every co-op stat for arena %i from its encounter policy',
    (arenaLevel, sourceArena) => {
      expect(calculateArenaStats(arenaLevel, { mode: 'coop' }))
        .toEqual(sourceArenaStats(sourceArena, 'coop'));
    },
  );

  it('resolves all simulator rosters directly from the published encounter references', () => {
    for (const arena of sourceArenas) {
      for (const mode of ['solo', 'coop'] as const) {
        const resolved = resolveProductionArena(arena.level, mode);
        const expected = sourceWaveStats(arena, mode);

        expect(resolved.map(wave => wave.enemies.map(enemy => enemy.id)))
          .toEqual(expected.map(wave => wave.enemies));
        expect(resolved.map(wave => wave.enemies.reduce((total, enemy) => total + enemy.hp, 0)))
          .toEqual(expected.map(wave => wave.hp));
      }
    }
  });

  it('uses the configured encounter mode for full arena attempts', () => {
    const sourceArena = sourceArenas.find(arena => (
      arena.cityId === 'mathoria' && arena.cityArenaLevel === 3
    ))!;
    const soloEnemyCount = sourceWaveStats(sourceArena, 'solo')
      .reduce((total, wave) => total + wave.enemies.length, 0);
    const coopEnemyCount = sourceWaveStats(sourceArena, 'coop')
      .reduce((total, wave) => total + wave.enemies.length, 0);
    const player = {
      ...createInitialPlayerState(),
      level: 10,
      hp: 1_000,
      maxHP: 1_000,
    };
    const baseConfig = {
      retreatThreshold: 0,
      hasPotion: false,
      potionUseThreshold: 0,
      debug: false,
    };

    const solo = simulateArenaAttempt(player, sourceArena.level, perfectAccuracy, {
      ...baseConfig,
      mode: 'solo',
    });
    const coop = simulateArenaAttempt(player, sourceArena.level, perfectAccuracy, {
      ...baseConfig,
      mode: 'coop',
    });

    expect(solo).toMatchObject({
      completed: true,
      wavesCompleted: sourceArena.waves.length,
      enemiesDefeated: soloEnemyCount,
    });
    expect(coop).toMatchObject({
      completed: true,
      wavesCompleted: sourceArena.waves.length,
      enemiesDefeated: coopEnemyCount,
    });
  });

  it('rejects an unknown arena instead of silently simulating arena 1', () => {
    const unknownLevel = Math.max(...sourceArenas.map(arena => arena.level)) + 100;
    expect(() => calculateArenaStats(unknownLevel)).toThrowError(/unknown arena level/);
  });
});
