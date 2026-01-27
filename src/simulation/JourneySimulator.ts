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
  GAME_BALANCE,
} from './types';
import { simulateBattle } from './BattleSimulator';

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

/**
 * Default Verdant Forest journey definition.
 */
export const VERDANT_FOREST: JourneyStage[] = [
  {
    id: 'stage_1',
    name: 'Forest Edge',
    encounters: [
      { type: 'battle', enemyId: 'forest_slime' },
      { type: 'puzzle', puzzleDifficulty: 1 },
      { type: 'battle', enemyId: 'forest_slime' },
      { type: 'rest', healPercent: 50 },
    ],
  },
  {
    id: 'stage_2',
    name: 'Deep Woods',
    encounters: [
      { type: 'battle', enemyId: 'wild_boar' },
      { type: 'chest', chestCoins: 30 },
      { type: 'puzzle', puzzleDifficulty: 2 },
      { type: 'battle', enemyId: 'forest_sprite' },
    ],
  },
  {
    id: 'stage_3',
    name: 'Ancient Grove',
    encounters: [
      { type: 'battle', enemyId: 'elder_treant' },
      { type: 'puzzle', puzzleDifficulty: 2 },
      { type: 'rest', healPercent: 100 },
    ],
  },
  {
    id: 'boss',
    name: 'Forest Guardian',
    encounters: [
      { type: 'boss', bossId: 'forest_guardian' },
    ],
  },
];

/**
 * Forest-specific enemies (slightly harder than town enemies).
 */
const FOREST_ENEMIES: Record<string, EnemyStats> = {
  'forest_slime': { id: 'forest_slime', name: 'Forest Slime', hp: 4, atk: 1, xp: 25, coinMin: 8, coinMax: 18, difficulty: 1 },
  'wild_boar': { id: 'wild_boar', name: 'Wild Boar', hp: 6, atk: 2, xp: 35, coinMin: 12, coinMax: 28, difficulty: 2 },
  'forest_sprite': { id: 'forest_sprite', name: 'Forest Sprite', hp: 5, atk: 2, xp: 30, coinMin: 10, coinMax: 25, difficulty: 2 },
  'elder_treant': { id: 'elder_treant', name: 'Elder Treant', hp: 12, atk: 3, xp: 60, coinMin: 25, coinMax: 45, difficulty: 3 },
  'forest_guardian': { id: 'forest_guardian', name: 'Forest Guardian', hp: 30, atk: 4, xp: 150, coinMin: 80, coinMax: 120, difficulty: 4 },
};

/**
 * Gets enemy stats by ID, checking forest enemies first, then regular enemies.
 */
function getEnemy(enemyId: string): EnemyStats {
  return FOREST_ENEMIES[enemyId] ?? ENEMIES.find(e => e.id === enemyId) ?? ENEMIES[0];
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
      const enemyId = encounter.type === 'boss' ? encounter.bossId! : encounter.enemyId!;
      const enemy = getEnemy(enemyId);

      if (config.debug) {
        console.log(`Battle: ${enemy.name} (HP: ${enemy.hp}, ATK: ${enemy.atk})`);
      }

      const result = simulateBattle(player, enemy, accuracy);

      // Update player HP
      player.hp = result.playerHPRemaining;

      // Award coins on victory
      let coins = 0;
      if (result.won) {
        coins = Math.floor(Math.random() * (enemy.coinMax - enemy.coinMin + 1)) + enemy.coinMin;
        player.coins += coins;
      }

      if (config.debug) {
        console.log(`  Result: ${result.won ? 'Victory' : 'Defeat'}, HP: ${player.hp}, Coins: +${coins}`);
      }

      return {
        battlesFought: 1,
        battlesWon: result.won ? 1 : 0,
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
        const enemyId = encounter.type === 'boss' ? encounter.bossId! : encounter.enemyId!;
        const enemy = getEnemy(enemyId);
        totalEnemyHP += enemy.hp;
        totalEnemyDamage += enemy.atk * 3; // Estimate 3 turns per battle
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
