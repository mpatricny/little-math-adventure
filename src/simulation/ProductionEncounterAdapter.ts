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
const productionAdapter = createProductionEncounterAdapter(encountersJson, productionEnemies);
export const productionEncounterCatalog = productionAdapter.catalog;

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
  return productionAdapter.resolveArenaWave(request);
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
  return productionAdapter.resolveJourneyEncounter(encounterId, mode);
}

/** Audit a staged, complete catalog through the same validation/policy adapter. */
export function createProductionEncounterAdapter(rawEncounters: unknown, enemies: readonly EnemyDefinition[]) {
  const catalog = createEncounterCatalog(rawEncounters, { core: enemies });
  return {
    catalog,
    resolveArenaWave(request: ResolveArenaWaveRequest): SimulationResolvedArenaWave {
      const resolved = catalog.resolveArenaWave(request);
      return { ...resolved, enemies: resolved.enemies.map(toSimulationEnemy) };
    },
    resolveJourneyEncounter(encounterId: string, mode: EncounterMode = 'solo'): SimulationResolvedJourneyEncounter {
      const resolved = catalog.resolveJourneyEncounter(encounterId, mode);
      return { ...resolved, enemies: resolved.enemies.map(toSimulationEnemy) };
    },
  };
}
