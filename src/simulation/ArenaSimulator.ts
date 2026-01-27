/**
 * Arena Simulator
 *
 * Simulates arena mode with 5 consecutive waves and NO healing between waves.
 * Models the actual game loop:
 * 1. Enter Arena → fight waves until hurt → retreat (or die)
 * 2. Return to Town → get FREE heal + potion refill
 * 3. Retry Arena with better stats/gear
 */

import {
  AccuracyProfile,
  PlayerState,
  EnemyStats,
  ENEMIES,
  GAME_BALANCE,
} from './types';
import { simulateBattle } from './BattleSimulator';

/**
 * Arena wave configuration from ArenaScene.ts
 * Each arena level has 5 waves, each wave can have multiple enemies
 */
export const ARENA_WAVES: Record<number, string[][]> = {
  1: [
    ['slime_green'],                    // Wave 1: 1 slime
    ['purple_demon'],                    // Wave 2: 1 purple demon
    ['slime_green', 'slime_green'],      // Wave 3: 2 slimes
    ['purple_demon', 'slime_green'],     // Wave 4: 1 purple demon + 1 slime
    ['purple_demon', 'purple_demon'],    // Wave 5: 2 purple demons
  ],
  2: [
    ['pink_beast'],
    ['pink_beast', 'slime_green'],
    ['pink_beast', 'pink_beast'],
    ['leafy'],
    ['leafy', 'slime_green'],
  ],
  3: [
    ['leafy'],
    ['leafy', 'pink_beast'],
    ['leafy', 'leafy'],
    ['purple_demon', 'leafy'],
    ['purple_demon', 'purple_demon', 'slime_green'],
  ],
};

/**
 * Maps enemy IDs to stats
 */
function getEnemyById(id: string): EnemyStats {
  const enemy = ENEMIES.find(e => e.id === id);
  if (enemy) return enemy;

  // Fallback to slime
  return ENEMIES[0];
}

/**
 * Result of a single arena attempt (may be partial if player retreats)
 */
export interface ArenaAttemptResult {
  /** Did player complete all 5 waves? */
  completed: boolean;

  /** How many waves were completed (0-5) */
  wavesCompleted: number;

  /** How many individual enemy battles were won */
  enemiesDefeated: number;

  /** Did player die? (false = retreated before death) */
  playerDied: boolean;

  /** Player HP at end of attempt */
  finalHP: number;

  /** Total XP earned (20 per enemy) */
  xpEarned: number;

  /** Total coins earned (1 per enemy) */
  coinsEarned: number;

  /** Did player use their potion? */
  usedPotion: boolean;

  /** Battles where streak was achieved */
  streakCount: number;
}

export interface ArenaSimulatorConfig {
  /** HP threshold to retreat (% of max HP). Default: 0.2 (20%) */
  retreatThreshold: number;

  /** Whether player has a potion to use */
  hasPotion: boolean;

  /** HP threshold to use potion (% of max HP). Default: 0.3 (30%) */
  potionUseThreshold: number;

  /** Enable debug logging */
  debug: boolean;
}

const DEFAULT_CONFIG: ArenaSimulatorConfig = {
  retreatThreshold: 0.2,
  hasPotion: false,
  potionUseThreshold: 0.3,
  debug: false,
};

/**
 * Simulates a single arena attempt.
 * Player fights waves until completion, retreat, or death.
 * NO healing between waves (except potions if available).
 */
export function simulateArenaAttempt(
  player: PlayerState,
  arenaLevel: number,
  accuracy: AccuracyProfile,
  config: ArenaSimulatorConfig = DEFAULT_CONFIG
): ArenaAttemptResult {
  const waves = ARENA_WAVES[arenaLevel] ?? ARENA_WAVES[1];

  let playerHP = player.hp;
  let wavesCompleted = 0;
  let enemiesDefeated = 0;
  let xpEarned = 0;
  let coinsEarned = 0;
  let usedPotion = false;
  let streakCount = 0;
  let playerDied = false;

  if (config.debug) {
    console.log(`\n=== Arena ${arenaLevel} Attempt ===`);
    console.log(`Player: Lv${player.level} HP:${playerHP}/${player.maxHP} ATK:${player.atk}`);
  }

  for (let waveIndex = 0; waveIndex < waves.length; waveIndex++) {
    const waveEnemies = waves[waveIndex];

    if (config.debug) {
      console.log(`\n--- Wave ${waveIndex + 1}/5: ${waveEnemies.join(', ')} ---`);
    }

    // Check if should retreat before this wave
    const hpPercent = playerHP / player.maxHP;
    if (hpPercent < config.retreatThreshold && waveIndex > 0) {
      if (config.debug) {
        console.log(`Retreating! HP: ${playerHP}/${player.maxHP} (${(hpPercent * 100).toFixed(0)}%)`);
      }
      break;
    }

    // Check if should use potion before this wave
    if (config.hasPotion && !usedPotion && hpPercent < config.potionUseThreshold && waveIndex > 0) {
      // Small potion heals 25 HP
      const healAmount = 25;
      const oldHP = playerHP;
      playerHP = Math.min(player.maxHP, playerHP + healAmount);
      usedPotion = true;

      if (config.debug) {
        console.log(`Used potion! HP: ${oldHP} → ${playerHP}`);
      }
    }

    // Fight each enemy in the wave (sequentially)
    for (const enemyId of waveEnemies) {
      const enemy = getEnemyById(enemyId);

      // Create a temporary player state for the battle
      const tempPlayer = { ...player, hp: playerHP };

      const battleResult = simulateBattle(tempPlayer, enemy, accuracy);

      if (config.debug) {
        console.log(`  vs ${enemy.name}: ${battleResult.won ? 'WIN' : 'LOSE'}, HP: ${battleResult.playerHPRemaining}`);
      }

      if (battleResult.won) {
        playerHP = battleResult.playerHPRemaining;
        enemiesDefeated++;
        // XP is fixed at 20 per enemy battle
        xpEarned += GAME_BALANCE.xpPerBattle;
        // Coins: ONLY 1 small copper per battle (no gold drop per enemy)
        coinsEarned += GAME_BALANCE.coinsPerBattle;
        if (battleResult.hadStreak) streakCount++;
      } else {
        // Player died
        playerDied = true;
        playerHP = 0;

        if (config.debug) {
          console.log(`DEFEATED at wave ${waveIndex + 1}!`);
        }

        return {
          completed: false,
          wavesCompleted,
          enemiesDefeated,
          playerDied: true,
          finalHP: 0,
          xpEarned,
          coinsEarned,
          usedPotion,
          streakCount,
        };
      }
    }

    // Wave completed
    wavesCompleted++;

    if (config.debug) {
      console.log(`Wave ${waveIndex + 1} complete! HP: ${playerHP}/${player.maxHP}`);
    }
  }

  const completed = wavesCompleted === waves.length;

  if (config.debug) {
    console.log(`\n=== Arena ${completed ? 'COMPLETED' : 'RETREATED'} ===`);
    console.log(`Waves: ${wavesCompleted}/5, XP: ${xpEarned}, Coins: ${coinsEarned}`);
  }

  return {
    completed,
    wavesCompleted,
    enemiesDefeated,
    playerDied: false,
    finalHP: playerHP,
    xpEarned,
    coinsEarned,
    usedPotion,
    streakCount,
  };
}

/**
 * Calculates total enemy HP for an arena level
 */
export function calculateArenaStats(arenaLevel: number): {
  totalHP: number;
  totalATK: number;
  waveDetails: { wave: number; enemies: string[]; hp: number; atk: number }[];
} {
  const waves = ARENA_WAVES[arenaLevel] ?? ARENA_WAVES[1];
  let totalHP = 0;
  let totalATK = 0;
  const waveDetails: { wave: number; enemies: string[]; hp: number; atk: number }[] = [];

  for (let i = 0; i < waves.length; i++) {
    let waveHP = 0;
    let waveATK = 0;

    for (const enemyId of waves[i]) {
      const enemy = getEnemyById(enemyId);
      waveHP += enemy.hp;
      waveATK += enemy.atk;
    }

    totalHP += waveHP;
    totalATK += waveATK;

    waveDetails.push({
      wave: i + 1,
      enemies: waves[i],
      hp: waveHP,
      atk: waveATK,
    });
  }

  return { totalHP, totalATK, waveDetails };
}

/**
 * Estimates arena difficulty for a player
 */
export function estimateArenaDifficulty(
  player: PlayerState,
  arenaLevel: number,
  accuracy: AccuracyProfile
): {
  canComplete: boolean;
  estimatedWaves: number;
  estimatedDamageTaken: number;
  recommendedLevel: number;
} {
  const stats = calculateArenaStats(arenaLevel);

  // Estimate damage per turn from player
  const problemsPerTurn = GAME_BALANCE.problemsPerTurn[player.level] ?? 4;
  const expectedDamagePerTurn = problemsPerTurn * accuracy.baseProblems;

  // Add weapon bonus
  const weaponDamage = player.weapon
    ? accuracy.bonusProblems * player.weapon.multiplier
    : 0;

  const totalDamagePerTurn = expectedDamagePerTurn + weaponDamage;

  // Estimate turns to clear all waves
  const turnsNeeded = Math.ceil(stats.totalHP / totalDamagePerTurn);

  // Estimate damage taken (each enemy gets ~2-3 attacks on average)
  const avgAttacksPerEnemy = 2.5;
  const estimatedDamageTaken = stats.totalATK * avgAttacksPerEnemy;

  // Factor in blocking
  const blockReduction = player.shield
    ? player.shield.blockAttempts * accuracy.blockProblems
    : 0;
  const reducedDamage = Math.max(0, estimatedDamageTaken - blockReduction * stats.waveDetails.length);

  // Can complete if HP > estimated damage
  const canComplete = player.hp > reducedDamage;

  // Estimate how many waves before retreat/death
  let hpRemaining = player.hp;
  let wavesCompleted = 0;
  for (const wave of stats.waveDetails) {
    const waveDamage = wave.atk * avgAttacksPerEnemy;
    hpRemaining -= Math.max(0, waveDamage - (player.shield ? accuracy.blockProblems : 0));
    if (hpRemaining <= player.maxHP * 0.2) break;
    wavesCompleted++;
  }

  // Recommended level (rough estimate)
  const recommendedLevel = Math.ceil(reducedDamage / GAME_BALANCE.hpPerLevel);

  return {
    canComplete,
    estimatedWaves: wavesCompleted,
    estimatedDamageTaken: Math.round(reducedDamage),
    recommendedLevel: Math.max(1, recommendedLevel),
  };
}

/**
 * Simulates multiple arena runs to get completion probability
 */
export function simulateArenaMany(
  basePlayer: PlayerState,
  arenaLevel: number,
  accuracy: AccuracyProfile,
  count: number,
  config: ArenaSimulatorConfig = DEFAULT_CONFIG
): {
  completionRate: number;
  avgWavesCompleted: number;
  avgXPEarned: number;
  avgCoinsEarned: number;
  deathRate: number;
  potionUsageRate: number;
} {
  let completions = 0;
  let totalWaves = 0;
  let totalXP = 0;
  let totalCoins = 0;
  let deaths = 0;
  let potionUses = 0;

  for (let i = 0; i < count; i++) {
    // Clone player for each run
    const player: PlayerState = {
      ...basePlayer,
      hp: basePlayer.maxHP, // Start each attempt at full HP (after town heal)
      defeatedEnemyTypes: new Set(basePlayer.defeatedEnemyTypes),
      bestTierPerLevel: new Map(basePlayer.bestTierPerLevel),
    };

    const result = simulateArenaAttempt(player, arenaLevel, accuracy, { ...config, debug: false });

    if (result.completed) completions++;
    totalWaves += result.wavesCompleted;
    totalXP += result.xpEarned;
    totalCoins += result.coinsEarned;
    if (result.playerDied) deaths++;
    if (result.usedPotion) potionUses++;
  }

  return {
    completionRate: completions / count,
    avgWavesCompleted: totalWaves / count,
    avgXPEarned: totalXP / count,
    avgCoinsEarned: totalCoins / count,
    deathRate: deaths / count,
    potionUsageRate: potionUses / count,
  };
}
