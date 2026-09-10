/**
 * Bridges production encounter/enemy data to the balance simulator's compact
 * EnemyStats shape. Arena simulations should resolve waves through this module
 * instead of maintaining their own copies of rosters or enemy stats.
 */

import encountersJson from '../../public/assets/data/encounters.json';
import enemiesJson from '../../public/assets/data/enemies.json';
import { createEncounterCatalog } from '../systems/EncounterCatalog';
import type { EnemyDefinition } from '../types';
import type {
  EncounterMode,
  ResolveArenaWaveRequest,
  ResolvedArenaWave,
  ResolvedJourneyEncounter,
} from '../types/encounters';
import { GAME_BALANCE, type EnemyStats } from './types';

export interface SimulationResolvedArenaWave
  extends Omit<ResolvedArenaWave, 'enemies'> {
  enemies: EnemyStats[];
}

const productionEnemies = enemiesJson as unknown as EnemyDefinition[];

/** The validated production catalog shared by simulator adapter calls. */
export const productionEncounterCatalog = createEncounterCatalog(encountersJson, {
  core: productionEnemies,
});

function toSimulationEnemy(enemy: EnemyDefinition): EnemyStats {
  return {
    id: enemy.id,
    name: enemy.name,
    hp: enemy.hp,
    atk: enemy.attack,
    defense: enemy.defense,
    xp: GAME_BALANCE.xpPerBattle,
    coinMin: enemy.goldReward[0],
    coinMax: enemy.goldReward[1],
    difficulty: enemy.difficulty,
  };
}

/** Resolve one production wave and adapt its cloned enemies for simulation. */
export function resolveProductionArenaWave(
  request: ResolveArenaWaveRequest,
): SimulationResolvedArenaWave {
  const resolved = productionEncounterCatalog.resolveArenaWave(request);

  return {
    ...resolved,
    enemies: resolved.enemies.map(toSimulationEnemy),
  };
}

/** Resolve every wave in a production arena through the shared catalog policy. */
export function resolveProductionArena(
  arenaLevel: number,
  mode: EncounterMode = 'solo',
): SimulationResolvedArenaWave[] {
  const arena = productionEncounterCatalog.getArena(arenaLevel);

  return arena.waves.map((_, waveIndex) =>
    resolveProductionArenaWave({ arenaLevel, waveIndex, mode }),
  );
}

export interface SimulationResolvedJourneyEncounter
  extends Omit<ResolvedJourneyEncounter, 'enemies'> {
  enemies: EnemyStats[];
}

/** Resolve a production forest encounter, including co-op and boss phase policy. */
export function resolveProductionJourneyEncounter(
  encounterId: string,
  mode: EncounterMode = 'solo',
): SimulationResolvedJourneyEncounter {
  const resolved = productionEncounterCatalog.resolveJourneyEncounter(encounterId, mode);
  return {
    ...resolved,
    enemies: resolved.enemies.map(toSimulationEnemy),
  };
}
