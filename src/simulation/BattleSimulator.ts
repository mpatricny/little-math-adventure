/**
 * Battle Simulator
 *
 * Simulates individual battles between player and enemy,
 * calculating outcomes based on player accuracy profile.
 */

import {
  AccuracyProfile,
  BattleResult,
  EnemyStats,
  PlayerState,
  getProblemsForLevel,
  GAME_BALANCE,
} from './types';

export interface BattleSimulatorConfig {
  /** Minimum streak length for bonus */
  streakThreshold: number;

  /** Enable debug logging */
  debug: boolean;
}

const DEFAULT_CONFIG: BattleSimulatorConfig = {
  streakThreshold: 5,
  debug: false,
};

/**
 * Simulates a single battle between player and enemy.
 *
 * Battle flow:
 * 1. Player attacks (solve problems)
 * 2. Enemy attacks (player can block with shield)
 * 3. Repeat until one side's HP <= 0
 */
export function simulateBattle(
  player: PlayerState,
  enemy: EnemyStats,
  accuracy: AccuracyProfile,
  config: BattleSimulatorConfig = DEFAULT_CONFIG
): BattleResult {
  // Clone HP values for simulation
  let playerHP = player.hp;
  let enemyHP = enemy.hp;

  // Battle tracking
  let turns = 0;
  let totalCorrect = 0;
  let totalProblems = 0;
  let currentStreak = 0;
  let maxStreak = 0;

  // Problems per turn based on player level
  const problemsPerTurn = getProblemsForLevel(player.level);

  if (config.debug) {
    console.log(`\n=== Battle Start ===`);
    console.log(`Player: Lv${player.level} HP:${playerHP} ATK:${player.atk}`);
    console.log(`Enemy: ${enemy.name} HP:${enemyHP} ATK:${enemy.atk}`);
    console.log(`Problems/turn: ${problemsPerTurn}`);
  }

  while (playerHP > 0 && enemyHP > 0) {
    turns++;

    // === PLAYER ATTACK PHASE ===
    let damage = 0;

    // Solve base problems
    for (let i = 0; i < problemsPerTurn; i++) {
      totalProblems++;
      if (Math.random() < accuracy.baseProblems) {
        damage += 1;
        totalCorrect++;
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
    }

    // Weapon bonus problem (if equipped)
    if (player.weapon) {
      totalProblems++;
      if (Math.random() < accuracy.bonusProblems) {
        damage += player.weapon.multiplier;
        totalCorrect++;
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
    }

    // ACTUAL GAME: Only correct answers deal damage, NO base ATK added
    // ATK stat affects problem generation difficulty, not direct damage
    const totalDamage = damage;
    enemyHP -= totalDamage;

    if (config.debug) {
      console.log(`Turn ${turns}: Player deals ${totalDamage} damage (from ${damage} correct answers)`);
      console.log(`  Enemy HP: ${Math.max(0, enemyHP)}/${enemy.hp}`);
    }

    // Check if enemy defeated
    if (enemyHP <= 0) {
      break;
    }

    // === ENEMY ATTACK PHASE ===
    let enemyDamage = enemy.atk;

    // Shield blocking (if equipped)
    if (player.shield) {
      let blocked = 0;
      for (let i = 0; i < player.shield.blockAttempts && enemyDamage > 0; i++) {
        totalProblems++;
        if (Math.random() < accuracy.blockProblems) {
          blocked++;
          enemyDamage--;
          totalCorrect++;
        }
      }
      if (config.debug && blocked > 0) {
        console.log(`  Player blocks ${blocked} damage with shield`);
      }
    }

    playerHP -= enemyDamage;

    if (config.debug) {
      console.log(`  Enemy deals ${enemyDamage} damage`);
      console.log(`  Player HP: ${Math.max(0, playerHP)}/${player.maxHP}`);
    }
  }

  const won = enemyHP <= 0;
  const hadStreak = maxStreak >= config.streakThreshold;
  const finalAccuracy = totalProblems > 0 ? totalCorrect / totalProblems : 0;

  if (config.debug) {
    console.log(`\n=== Battle End ===`);
    console.log(`Result: ${won ? 'VICTORY' : 'DEFEAT'}`);
    console.log(`Turns: ${turns}`);
    console.log(`Accuracy: ${(finalAccuracy * 100).toFixed(1)}%`);
    console.log(`Max Streak: ${maxStreak} (bonus: ${hadStreak ? 'YES' : 'NO'})`);
  }

  return {
    won,
    turns,
    playerHPRemaining: Math.max(0, playerHP),
    damageDealt: enemy.hp - Math.max(0, enemyHP),
    accuracy: finalAccuracy,
    hadStreak,
    correctAnswers: totalCorrect,
    totalProblems,
  };
}

/**
 * Simulates multiple battles and returns average results.
 * Useful for getting statistical probability of outcomes.
 */
export function simulateBattleMany(
  player: PlayerState,
  enemy: EnemyStats,
  accuracy: AccuracyProfile,
  count: number
): {
  winRate: number;
  avgTurns: number;
  avgHPRemaining: number;
  avgAccuracy: number;
  streakRate: number;
} {
  let wins = 0;
  let totalTurns = 0;
  let totalHPRemaining = 0;
  let totalAccuracy = 0;
  let streaks = 0;

  for (let i = 0; i < count; i++) {
    // Clone player state for each simulation
    const playerCopy = { ...player };
    const result = simulateBattle(playerCopy, enemy, accuracy);

    if (result.won) wins++;
    totalTurns += result.turns;
    totalHPRemaining += result.won ? result.playerHPRemaining : 0;
    totalAccuracy += result.accuracy;
    if (result.hadStreak) streaks++;
  }

  return {
    winRate: wins / count,
    avgTurns: totalTurns / count,
    avgHPRemaining: totalHPRemaining / wins || 0,
    avgAccuracy: totalAccuracy / count,
    streakRate: streaks / count,
  };
}

/**
 * Estimates expected damage per turn for given player/accuracy.
 * Useful for quick balance calculations.
 */
export function estimateDamagePerTurn(
  player: PlayerState,
  accuracy: AccuracyProfile
): {
  expected: number;
  min: number;
  max: number;
} {
  const problems = getProblemsForLevel(player.level);
  const baseATK = player.atk;
  const weaponMultiplier = player.weapon?.multiplier ?? 0;

  // Expected damage from problems
  const expectedFromProblems = problems * accuracy.baseProblems;

  // Expected damage from weapon (if equipped)
  const expectedFromWeapon = player.weapon
    ? accuracy.bonusProblems * weaponMultiplier
    : 0;

  const expected = baseATK + expectedFromProblems + expectedFromWeapon;
  const min = baseATK; // All problems wrong
  const max = baseATK + problems + (player.weapon ? weaponMultiplier : 0); // All correct

  return { expected, min, max };
}

/**
 * Estimates turns to defeat enemy with given player/accuracy.
 */
export function estimateTurnsToDefeat(
  player: PlayerState,
  enemy: EnemyStats,
  accuracy: AccuracyProfile
): {
  expected: number;
  best: number;
  worst: number;
} {
  const { expected, min, max } = estimateDamagePerTurn(player, accuracy);

  return {
    expected: Math.ceil(enemy.hp / expected),
    best: Math.ceil(enemy.hp / max),
    worst: min > 0 ? Math.ceil(enemy.hp / min) : Infinity,
  };
}
