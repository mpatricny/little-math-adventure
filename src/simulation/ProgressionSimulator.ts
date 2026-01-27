/**
 * Progression Simulator
 *
 * Simulates player leveling, XP gain, and guild trials.
 */

import {
  AccuracyProfile,
  PlayerState,
  TrialResult,
  TrialTier,
  getXPForLevel,
  getTierFromPoints,
  getTierRewards,
  PROPOSED_TIER_SYSTEM,
} from './types';

export interface TrialSimulatorConfig {
  /** Trial duration in seconds */
  trialDuration: number;

  /** Average time per problem in seconds */
  avgTimePerProblem: number;

  /** Points for correct answer */
  correctPoints: number;

  /** Bonus points per answer when streak >= 3 */
  streakBonus: number;

  /** Enable debug logging */
  debug: boolean;
}

const DEFAULT_TRIAL_CONFIG: TrialSimulatorConfig = {
  trialDuration: 60,
  avgTimePerProblem: 4,
  correctPoints: 1,
  streakBonus: 0.5,
  debug: false,
};

/**
 * Simulates a guild trial.
 *
 * Trial mechanics:
 * - 60 seconds to answer as many problems as possible
 * - Each correct answer = 1 point
 * - Streak bonus: +0.5 points per answer after 3+ streak
 */
export function simulateTrial(
  accuracy: AccuracyProfile,
  config: TrialSimulatorConfig = DEFAULT_TRIAL_CONFIG
): TrialResult {
  const maxProblems = Math.floor(config.trialDuration / config.avgTimePerProblem);

  let points = 0;
  let correct = 0;
  let wrong = 0;
  let currentStreak = 0;
  let bestStreak = 0;

  for (let i = 0; i < maxProblems; i++) {
    if (Math.random() < accuracy.baseProblems) {
      correct++;
      currentStreak++;
      bestStreak = Math.max(bestStreak, currentStreak);

      // Base points
      points += config.correctPoints;

      // Streak bonus (after 3 consecutive correct)
      if (currentStreak >= 3) {
        points += config.streakBonus;
      }
    } else {
      wrong++;
      currentStreak = 0;
    }
  }

  const tier = getTierFromPoints(points);

  if (config.debug) {
    console.log(`\n=== Trial Result ===`);
    console.log(`Problems: ${maxProblems} (${config.trialDuration}s / ${config.avgTimePerProblem}s per problem)`);
    console.log(`Correct: ${correct}, Wrong: ${wrong}`);
    console.log(`Best Streak: ${bestStreak}`);
    console.log(`Points: ${points.toFixed(1)}`);
    console.log(`Tier: ${tier.toUpperCase()}`);
  }

  return {
    points,
    tier,
    correct,
    wrong,
    bestStreak,
  };
}

/**
 * Simulates many trials to get probability distribution of tiers.
 */
export function simulateTrialMany(
  accuracy: AccuracyProfile,
  count: number,
  config: TrialSimulatorConfig = DEFAULT_TRIAL_CONFIG
): {
  avgPoints: number;
  tierProbabilities: Record<TrialTier, number>;
  avgCorrect: number;
  avgStreak: number;
} {
  const tierCounts: Record<TrialTier, number> = {
    none: 0,
    bronze: 0,
    silver: 0,
    gold: 0,
  };

  let totalPoints = 0;
  let totalCorrect = 0;
  let totalStreak = 0;

  for (let i = 0; i < count; i++) {
    const result = simulateTrial(accuracy, { ...config, debug: false });
    tierCounts[result.tier]++;
    totalPoints += result.points;
    totalCorrect += result.correct;
    totalStreak += result.bestStreak;
  }

  return {
    avgPoints: totalPoints / count,
    tierProbabilities: {
      none: tierCounts.none / count,
      bronze: tierCounts.bronze / count,
      silver: tierCounts.silver / count,
      gold: tierCounts.gold / count,
    },
    avgCorrect: totalCorrect / count,
    avgStreak: totalStreak / count,
  };
}

/**
 * Applies level-up rewards to player state based on trial tier.
 */
export function applyLevelUp(
  player: PlayerState,
  tier: TrialTier
): {
  newLevel: number;
  hpGained: number;
  atkGained: number;
  coinsGained: number;
  diamondsGained: number;
} {
  const nextLevel = player.level + 1;
  const rewards = getTierRewards(tier, nextLevel);

  // Apply rewards
  player.level = nextLevel;
  player.xp = 0;
  player.maxHP += rewards.hp;
  player.hp = player.maxHP; // Full heal on level up
  player.atk += rewards.atk;
  player.coins += rewards.coins;
  player.diamonds += rewards.diamonds;

  // Track best tier for this level
  const existingTier = player.bestTierPerLevel.get(nextLevel);
  if (!existingTier || tierRank(tier) > tierRank(existingTier)) {
    player.bestTierPerLevel.set(nextLevel, tier as 'bronze' | 'silver' | 'gold');
  }

  return {
    newLevel: nextLevel,
    hpGained: rewards.hp,
    atkGained: rewards.atk,
    coinsGained: rewards.coins,
    diamondsGained: rewards.diamonds,
  };
}

/**
 * Returns numeric rank for tier comparison.
 */
function tierRank(tier: TrialTier): number {
  switch (tier) {
    case 'gold': return 3;
    case 'silver': return 2;
    case 'bronze': return 1;
    default: return 0;
  }
}

/**
 * Checks if player is ready to level up (has enough XP).
 */
export function canLevelUp(player: PlayerState): boolean {
  const xpNeeded = getXPForLevel(player.level);
  return player.xp >= xpNeeded;
}

/**
 * Adds XP to player, capping at level threshold.
 * Returns whether player is now ready to level up.
 */
export function addXP(player: PlayerState, xp: number): boolean {
  const xpNeeded = getXPForLevel(player.level);
  player.xp = Math.min(player.xp + xp, xpNeeded);
  return player.xp >= xpNeeded;
}

/**
 * Estimates battles needed to reach next level based on enemy XP.
 */
export function estimateBattlesToLevel(
  player: PlayerState,
  enemyXP: number
): number {
  const xpNeeded = getXPForLevel(player.level);
  const xpRemaining = xpNeeded - player.xp;
  return Math.ceil(xpRemaining / enemyXP);
}

/**
 * Returns expected tier for accuracy profile based on simulation.
 */
export function getExpectedTier(accuracy: AccuracyProfile): TrialTier {
  // Use tier probabilities from accuracy profile
  const roll = Math.random();

  if (roll < accuracy.trialTiers.gold) return 'gold';
  if (roll < accuracy.trialTiers.silver) return 'silver';
  if (roll < accuracy.trialTiers.bronze) return 'bronze';
  return 'none';
}
