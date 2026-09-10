/**
 * Journey Simulator
 *
 * Simulates journey mode with multiple stages of battles, puzzles, and rest points.
 */

import {
  AccuracyProfile,
  PlayerState,
  JourneyStage,
  JourneyEncounter,
  JourneyResult,
  EnemyStats,
  ENEMIES,
} from './types';
import { simulateBattle } from './BattleSimulator';
import forestJourneyJson from '../../public/assets/data/forest-journey.json';
import { resolveProductionJourneyEncounter } from './ProductionEncounterAdapter';

export interface JourneyConfig {
  /** HP threshold to consider retreating (% of max) */
  retreatThreshold: number;

  /** Enable debug logging */
  debug: boolean;
}

const DEFAULT_JOURNEY_CONFIG: JourneyConfig = {
  retreatThreshold: 0.2, // Retreat if HP drops below 20%
  debug: false,
};

interface ProductionJourneyJsonEncounter {
  type: JourneyEncounter['type'];
  encounterId?: string;
  healPercent?: number;
  puzzleId?: string;
  gold?: number;
}

const productionJourney = forestJourneyJson.journey;

/** Verdant Forest structure comes directly from the production journey file. */
export const VERDANT_FOREST: JourneyStage[] = productionJourney.stages.map(stage => ({
  id: stage.id,
  name: stage.name,
  encounters: (stage.encounters as ProductionJourneyJsonEncounter[]).map(encounter => {
    if (encounter.type === 'battle' || encounter.type === 'boss') {
      return { type: encounter.type, encounterId: encounter.encounterId };
    }
    if (encounter.type === 'rest') {
      return { type: 'rest', healPercent: encounter.healPercent };
    }
    if (encounter.type === 'chest') {
      return { type: 'chest', chestCoins: encounter.gold };
    }
    return { type: 'puzzle', puzzleDifficulty: 1 };
  }),
}));

/** Legacy support for synthetic simulator fixtures. Production journey entries use encounterId. */
function getLegacyEnemy(enemyId: string): EnemyStats {
  return ENEMIES.find(e => e.id === enemyId) ?? ENEMIES[0];
}

/** Resolve the exact combat sequence used by production, including every boss phase. */
function resolveSimulationCombatants(encounter: JourneyEncounter): {
  rewardEnemies: EnemyStats[];
  battleEnemies: EnemyStats[];
} {
  if (encounter.encounterId) {
    const resolved = resolveProductionJourneyEncounter(encounter.encounterId);
    return {
      rewardEnemies: resolved.enemies,
      battleEnemies: resolved.boss
        ? resolved.boss.phases.map((phase, index) => ({
          ...resolved.enemies[0],
          id: `${resolved.enemies[0].id}-phase-${index + 1}`,
          name: `${resolved.enemies[0].name} - ${phase.name}`,
          hp: phase.hp,
          atk: phase.attack,
          defense: phase.defense,
        }))
        : resolved.enemies,
    };
  }

  const legacyId = encounter.type === 'boss' ? encounter.bossId : encounter.enemyId;
  if (!legacyId) {
    throw new Error(`Journey ${encounter.type} encounter is missing encounterId`);
  }
  const enemy = getLegacyEnemy(legacyId);
  return { rewardEnemies: [enemy], battleEnemies: [enemy] };
}

/**
 * Simulates a complete journey through all stages.
 */
export function simulateJourney(
  player: PlayerState,
  stages: JourneyStage[],
  accuracy: AccuracyProfile,
  config: JourneyConfig = DEFAULT_JOURNEY_CONFIG
): JourneyResult {
  // Consume journey supplies
  if (player.journeySupplies <= 0) {
    return {
      completed: false,
      stageReached: 0,
      battlesFought: 0,
      battlesWon: 0,
      puzzlesSolved: 0,
      puzzlesFailed: 0,
      finalHP: player.hp,
      coinsEarned: 0,
    };
  }
  player.journeySupplies--;

  let battlesFought = 0;
  let battlesWon = 0;
  let puzzlesSolved = 0;
  let puzzlesFailed = 0;
  let coinsEarned = 0;
  let currentStage = 0;

  if (config.debug) {
    console.log(`\n=== Journey Start ===`);
    console.log(`Player HP: ${player.hp}/${player.maxHP}`);
  }

  for (let stageIndex = 0; stageIndex < stages.length; stageIndex++) {
    const stage = stages[stageIndex];
    currentStage = stageIndex + 1;

    if (config.debug) {
      console.log(`\n--- Stage ${currentStage}: ${stage.name} ---`);
    }

    for (const encounter of stage.encounters) {
      // Check retreat condition
      if (player.hp / player.maxHP < config.retreatThreshold) {
        if (config.debug) {
          console.log(`HP too low (${player.hp}/${player.maxHP}), retreating!`);
        }
        return {
          completed: false,
          stageReached: currentStage,
          battlesFought,
          battlesWon,
          puzzlesSolved,
          puzzlesFailed,
          finalHP: player.hp,
          coinsEarned,
        };
      }

      const result = processEncounter(player, encounter, accuracy, config);

      battlesFought += result.battlesFought;
      battlesWon += result.battlesWon;
      puzzlesSolved += result.puzzlesSolved;
      puzzlesFailed += result.puzzlesFailed;
      coinsEarned += result.coinsEarned;

      // Check if player died
      if (player.hp <= 0) {
        if (config.debug) {
          console.log(`Player defeated!`);
        }
        return {
          completed: false,
          stageReached: currentStage,
          battlesFought,
          battlesWon,
          puzzlesSolved,
          puzzlesFailed,
          finalHP: 0,
          coinsEarned,
        };
      }
    }
  }

  if (config.debug) {
    console.log(`\n=== Journey Complete! ===`);
    console.log(`Final HP: ${player.hp}/${player.maxHP}`);
    console.log(`Coins earned: ${coinsEarned}`);
  }

  return {
    completed: true,
    stageReached: stages.length,
    battlesFought,
    battlesWon,
    puzzlesSolved,
    puzzlesFailed,
    finalHP: player.hp,
    coinsEarned,
  };
}

/**
 * Processes a single journey encounter.
 */
function processEncounter(
  player: PlayerState,
  encounter: JourneyEncounter,
  accuracy: AccuracyProfile,
  config: JourneyConfig
): {
  battlesFought: number;
  battlesWon: number;
  puzzlesSolved: number;
  puzzlesFailed: number;
  coinsEarned: number;
} {
  switch (encounter.type) {
    case 'battle':
    case 'boss': {
      const { rewardEnemies, battleEnemies } = resolveSimulationCombatants(encounter);

      if (config.debug) {
        console.log(`Battle: ${battleEnemies.map(enemy => `${enemy.name} (HP: ${enemy.hp}, ATK: ${enemy.atk})`).join(', ')}`);
      }

      let won = true;
      for (const enemy of battleEnemies) {
        const result = simulateBattle(player, enemy, accuracy);
        player.hp = result.playerHPRemaining;
        if (!result.won) {
          won = false;
          break;
        }
      }

      // Award coins on victory
      let coins = 0;
      if (won) {
        coins = rewardEnemies.reduce((total, enemy) => (
          total + Math.floor(Math.random() * (enemy.coinMax - enemy.coinMin + 1)) + enemy.coinMin
        ), 0);
        player.coins += coins;
      }

      if (config.debug) {
        console.log(`  Result: ${won ? 'Victory' : 'Defeat'}, HP: ${player.hp}, Coins: +${coins}`);
      }

      return {
        battlesFought: 1,
        battlesWon: won ? 1 : 0,
        puzzlesSolved: 0,
        puzzlesFailed: 0,
        coinsEarned: coins,
      };
    }

    case 'puzzle': {
      const difficulty = encounter.puzzleDifficulty ?? 1;
      // Harder puzzles have lower success rate
      const successChance = accuracy.puzzles - (difficulty - 1) * 0.1;
      const solved = Math.random() < successChance;

      if (config.debug) {
        console.log(`Puzzle (difficulty ${difficulty}): ${solved ? 'Solved' : 'Failed'}`);
      }

      // Failed puzzles might cost HP (minor penalty)
      if (!solved) {
        player.hp = Math.max(1, player.hp - 2);
      }

      return {
        battlesFought: 0,
        battlesWon: 0,
        puzzlesSolved: solved ? 1 : 0,
        puzzlesFailed: solved ? 0 : 1,
        coinsEarned: 0,
      };
    }

    case 'rest': {
      const healAmount = Math.floor(player.maxHP * (encounter.healPercent ?? 50) / 100);
      const oldHP = player.hp;
      player.hp = Math.min(player.maxHP, player.hp + healAmount);

      if (config.debug) {
        console.log(`Rest: Healed ${player.hp - oldHP} HP (${oldHP} -> ${player.hp})`);
      }

      return {
        battlesFought: 0,
        battlesWon: 0,
        puzzlesSolved: 0,
        puzzlesFailed: 0,
        coinsEarned: 0,
      };
    }

    case 'chest': {
      const coins = encounter.chestCoins ?? 20;
      player.coins += coins;

      if (config.debug) {
        console.log(`Chest: Found ${coins} coins`);
      }

      return {
        battlesFought: 0,
        battlesWon: 0,
        puzzlesSolved: 0,
        puzzlesFailed: 0,
        coinsEarned: coins,
      };
    }

    default:
      return {
        battlesFought: 0,
        battlesWon: 0,
        puzzlesSolved: 0,
        puzzlesFailed: 0,
        coinsEarned: 0,
      };
  }
}

/**
 * Simulates many journeys to get success probability.
 */
export function simulateJourneyMany(
  basePlayer: PlayerState,
  stages: JourneyStage[],
  accuracy: AccuracyProfile,
  count: number,
  config: JourneyConfig = DEFAULT_JOURNEY_CONFIG
): {
  completionRate: number;
  avgStageReached: number;
  avgBattlesWon: number;
  avgPuzzlesSolved: number;
  avgCoinsEarned: number;
  avgFinalHP: number;
} {
  let completions = 0;
  let totalStages = 0;
  let totalBattlesWon = 0;
  let totalPuzzlesSolved = 0;
  let totalCoins = 0;
  let totalFinalHP = 0;

  for (let i = 0; i < count; i++) {
    // Clone player for each run
    const player: PlayerState = {
      ...basePlayer,
      defeatedEnemyTypes: new Set(basePlayer.defeatedEnemyTypes),
      bestTierPerLevel: new Map(basePlayer.bestTierPerLevel),
      journeySupplies: 1, // Ensure supplies for simulation
    };

    const result = simulateJourney(player, stages, accuracy, { ...config, debug: false });

    if (result.completed) completions++;
    totalStages += result.stageReached;
    totalBattlesWon += result.battlesWon;
    totalPuzzlesSolved += result.puzzlesSolved;
    totalCoins += result.coinsEarned;
    totalFinalHP += result.finalHP;
  }

  return {
    completionRate: completions / count,
    avgStageReached: totalStages / count,
    avgBattlesWon: totalBattlesWon / count,
    avgPuzzlesSolved: totalPuzzlesSolved / count,
    avgCoinsEarned: totalCoins / count,
    avgFinalHP: totalFinalHP / count,
  };
}

/**
 * Estimates minimum player level/stats to complete journey.
 */
export function estimateJourneyRequirements(
  stages: JourneyStage[],
  accuracy: AccuracyProfile
): {
  recommendedLevel: number;
  recommendedHP: number;
  recommendedATK: number;
  estimatedBattles: number;
  estimatedDamage: number;
} {
  // Count battles and estimate total enemy HP/damage
  let totalEnemyHP = 0;
  let totalEnemyDamage = 0;
  let battleCount = 0;

  for (const stage of stages) {
    for (const encounter of stage.encounters) {
      if (encounter.type === 'battle' || encounter.type === 'boss') {
        const { battleEnemies } = resolveSimulationCombatants(encounter);
        totalEnemyHP += battleEnemies.reduce((total, enemy) => total + enemy.hp, 0);
        totalEnemyDamage += battleEnemies.reduce(
          (total, enemy) => total + enemy.atk * 3,
          0,
        );
        battleCount++;
      }
    }
  }

  // Factor in accuracy for damage dealt
  const effectiveDamageMultiplier = accuracy.baseProblems;

  // Estimate required stats
  const recommendedATK = Math.ceil(totalEnemyHP / (battleCount * 4 * effectiveDamageMultiplier));
  const recommendedHP = Math.ceil(totalEnemyDamage * (1 - accuracy.blockProblems * 0.5));
  const recommendedLevel = Math.max(5, Math.ceil(recommendedATK / 1.5));

  return {
    recommendedLevel,
    recommendedHP,
    recommendedATK,
    estimatedBattles: battleCount,
    estimatedDamage: totalEnemyDamage,
  };
}
