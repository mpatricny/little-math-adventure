#!/usr/bin/env npx ts-node

/**
 * Game Balance Simulator
 *
 * Main entry point for running game balance simulations.
 * Simulates player progression through the game at different skill levels.
 *
 * Usage:
 *   npx ts-node src/simulation/GameSimulator.ts [--accuracy=high|medium|low] [--level=10] [--runs=100]
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

import {
  SimulationConfig,
  SimulationReport,
  AccuracyLevel,
  AccuracyProfile,
  TrialTier,
  ACCURACY_PROFILES,
  GAME_BALANCE,
  PROPOSED_ITEMS,
  SHIELDS,
  WEAPONS,
  TOWN_MECHANICS,
  createInitialPlayerState,
  getXPForLevel,
} from './types';
import { simulateTrial, applyLevelUp } from './ProgressionSimulator';
import { EconomyTracker } from './EconomySimulator';
import { VERDANT_FOREST, estimateJourneyRequirements } from './JourneySimulator';
import { simulateArenaAttempt, ArenaAttemptResult } from './ArenaSimulator';

declare const process: {
  argv: string[];
};
declare const require: {
  main: { filename: string } | undefined;
};
declare const module: {
  filename: string;
};

/**
 * Runs a complete game simulation.
 */
export function runSimulation(config: SimulationConfig): SimulationReport {
  const accuracy = ACCURACY_PROFILES[config.accuracy];

  // Aggregate results across multiple runs
  const allRuns: {
    battlesToLevel5: number;
    battlesToLevel10: number;
    deaths: number;
    finalCoins: number;
    totalEarned: number;
    totalSpent: number;
    accuracy: number;
  }[] = [];

  const allMilestones: { level: number; battle: number; coins: number; tier: TrialTier }[] = [];
  const allBottlenecks: SimulationReport['bottlenecks'] = [];

  for (let run = 0; run < config.runs; run++) {
    const result = runSingleSimulation(config, accuracy);
    allRuns.push(result.summary);
    allMilestones.push(...result.milestones);
    allBottlenecks.push(...result.bottlenecks);
  }

  // Aggregate statistics
  const avgBattlesToLevel5 = average(allRuns.map(r => r.battlesToLevel5));
  const avgBattlesToLevel10 = average(allRuns.map(r => r.battlesToLevel10));
  const avgDeaths = average(allRuns.map(r => r.deaths));
  const avgFinalCoins = average(allRuns.map(r => r.finalCoins));
  const avgTotalEarned = average(allRuns.map(r => r.totalEarned));
  const avgTotalSpent = average(allRuns.map(r => r.totalSpent));
  const avgAccuracy = average(allRuns.map(r => r.accuracy));

  // Deduplicate and summarize bottlenecks
  const bottleneckSummary = summarizeBottlenecks(allBottlenecks);

  // Generate recommendations
  const recommendations = generateRecommendations(config, {
    avgBattlesToLevel5,
    avgBattlesToLevel10,
    avgDeaths,
    avgFinalCoins,
    bottleneckSummary,
  }, accuracy);

  return {
    config,
    summary: {
      battlesToLevel5: Math.round(avgBattlesToLevel5),
      battlesToLevel10: Math.round(avgBattlesToLevel10),
      totalDeaths: Math.round(avgDeaths),
      averageAccuracy: avgAccuracy,
      finalCoinBalance: Math.round(avgFinalCoins),
      totalCoinsEarned: Math.round(avgTotalEarned),
      totalCoinsSpent: Math.round(avgTotalSpent),
    },
    milestones: summarizeMilestones(allMilestones),
    economyHistory: [], // Simplified for aggregate report
    bottlenecks: bottleneckSummary,
    recommendations,
  };
}

/**
 * Runs a single simulation pass using the ACTUAL game loop:
 * 1. Enter Arena → fight waves until hurt → retreat (or die)
 * 2. Return to Town → get FREE heal + potion refill
 * 3. Buy gear when affordable (shield 3 → potion 5 → sword 8)
 * 4. Retry Arena with better stats/gear
 */
function runSingleSimulation(
  config: SimulationConfig,
  accuracy: AccuracyProfile
): {
  summary: {
    battlesToLevel5: number;
    battlesToLevel10: number;
    deaths: number;
    finalCoins: number;
    totalEarned: number;
    totalSpent: number;
    accuracy: number;
  };
  milestones: { level: number; battle: number; coins: number; tier: TrialTier }[];
  bottlenecks: SimulationReport['bottlenecks'];
} {
  const player = createInitialPlayerState();
  const tracker = new EconomyTracker({ hintPurchaseFrequency: config.usesHints ? 20 : 0, coinBuffer: 20, debug: false });

  const milestones: { level: number; battle: number; coins: number; tier: TrialTier }[] = [];
  const bottlenecks: SimulationReport['bottlenecks'] = [];

  let totalBattles = 0;  // Count individual battles within arena waves
  let arenaAttempts = 0;
  let deaths = 0;
  let battlesToLevel5 = 0;
  let battlesToLevel10 = 0;
  let totalCoinsEarned = 0;
  let totalCoinsSpent = 0;

  // Determine arena level based on player level
  const getArenaLevel = (level: number): number => {
    if (level <= 5) return 1;
    if (level <= 10) return 2;
    return 3;
  };

  while (player.level < config.targetLevel && arenaAttempts < config.maxBattles) {
    arenaAttempts++;

    // STEP 1: Visit town before arena (FREE heal + potion refill)
    visitTown(player);

    // STEP 2: Try to buy gear before arena
    const spent = makeShopPurchases(player);
    totalCoinsSpent += spent;

    // STEP 3: Enter arena
    const arenaLevel = getArenaLevel(player.level);
    const arenaResult = simulateArenaAttempt(
      player,
      arenaLevel,
      accuracy,
      {
        retreatThreshold: 0.2,
        hasPotion: player.potions > 0,
        potionUseThreshold: 0.3,
        debug: false,
      }
    );

    // Count enemy battles (not waves - each wave can have multiple enemies)
    totalBattles += arenaResult.enemiesDefeated;

    // Apply results
    player.xp += arenaResult.xpEarned;
    player.coins += arenaResult.coinsEarned;
    totalCoinsEarned += arenaResult.coinsEarned;

    // Track potion usage
    if (arenaResult.usedPotion) {
      player.potions = 0;
    }

    // Update HP (will be healed when visiting town next loop)
    player.hp = arenaResult.finalHP;

    if (arenaResult.playerDied) {
      deaths++;
      // On death, player respawns in town (will get healed next iteration)
    }

    // Check for level up (XP threshold reached)
    const xpNeeded = getXPForLevel(player.level);
    while (player.xp >= xpNeeded && player.level < config.targetLevel) {
      // Guild trial to determine tier
      const trialResult = simulateTrial(accuracy);
      const levelUpResult = applyLevelUp(player, trialResult.tier);

      // Track milestone
      milestones.push({
        level: player.level,
        battle: totalBattles,
        coins: player.coins,
        tier: trialResult.tier,
      });

      // Track key level milestones
      if (player.level === 5 && battlesToLevel5 === 0) battlesToLevel5 = totalBattles;
      if (player.level === 10 && battlesToLevel10 === 0) battlesToLevel10 = totalBattles;

      // Reset XP for next level (remaining XP carries over)
      player.xp -= xpNeeded;
    }

    // Track bottlenecks
    if (arenaResult.playerDied && arenaResult.wavesCompleted <= 1) {
      bottlenecks.push({
        type: 'consecutive_deaths',
        battle: totalBattles,
        level: player.level,
        description: `Died in arena wave ${arenaResult.wavesCompleted + 1} at level ${player.level}`,
      });
    }

    if (player.level === 5 && player.coins < PROPOSED_ITEMS.journeySupplies.cost) {
      bottlenecks.push({
        type: 'cant_afford_supplies',
        battle: totalBattles,
        level: player.level,
        description: `Can't afford journey supplies at level 5 (have ${player.coins}, need ${PROPOSED_ITEMS.journeySupplies.cost})`,
      });
    }

    // Take economy snapshot
    tracker.takeSnapshot(player, totalBattles);
  }

  return {
    summary: {
      battlesToLevel5,
      battlesToLevel10,
      deaths,
      finalCoins: player.coins,
      totalEarned: totalCoinsEarned,
      totalSpent: totalCoinsSpent,
      accuracy: accuracy.baseProblems,  // Use profile accuracy
    },
    milestones,
    bottlenecks,
  };
}

/**
 * Visit town: FREE full heal + potion refill if subscription
 */
function visitTown(player: import('./types').PlayerState): void {
  // Full heal on town entry
  player.hp = player.maxHP;

  // Refill potion if player has subscription and used their potion
  if (player.hasPotionSubscription && player.potions === 0) {
    player.potions = 1;
  }
}

/**
 * Make shop purchases in priority order:
 * 1. Wooden Shield (3 coins) - first defense
 * 2. Potion subscription (5 coins) - sustain
 * 3. Wooden Sword (8 coins) - more damage
 * 4. Better gear as affordable
 *
 * Returns total coins spent.
 */
function makeShopPurchases(player: import('./types').PlayerState): number {
  let spent = 0;

  // Priority 1: Wooden Shield (3 coins)
  if (!player.shield && player.coins >= SHIELDS[0].cost) {
    player.coins -= SHIELDS[0].cost;
    player.shield = SHIELDS[0];
    spent += SHIELDS[0].cost;
  }

  // Priority 2: Potion subscription (5 coins)
  if (!player.hasPotionSubscription && player.coins >= TOWN_MECHANICS.potionSubscriptionCost) {
    player.coins -= TOWN_MECHANICS.potionSubscriptionCost;
    player.hasPotionSubscription = true;
    player.potions = 1;
    spent += TOWN_MECHANICS.potionSubscriptionCost;
  }

  // Priority 3: Wooden Sword (8 coins)
  if (!player.weapon && player.coins >= WEAPONS[0].cost) {
    player.coins -= WEAPONS[0].cost;
    player.weapon = WEAPONS[0];
    spent += WEAPONS[0].cost;
  }

  // Priority 4: Iron Shield upgrade (100 coins)
  if (player.shield?.id === 'shield_wooden' && player.coins >= SHIELDS[1].cost) {
    player.coins -= SHIELDS[1].cost;
    player.shield = SHIELDS[1];
    spent += SHIELDS[1].cost;
  }

  // Priority 5: Iron Sword upgrade (80 coins)
  if (player.weapon?.id === 'sword_wooden' && player.coins >= WEAPONS[1].cost) {
    player.coins -= WEAPONS[1].cost;
    player.weapon = WEAPONS[1];
    spent += WEAPONS[1].cost;
  }

  return spent;
}

/**
 * Helper to calculate average.
 */
function average(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/**
 * Summarize milestones across runs.
 */
function summarizeMilestones(
  milestones: { level: number; battle: number; coins: number; tier: TrialTier }[]
): { level: number; battle: number; coins: number; tier: TrialTier }[] {
  const byLevel = new Map<number, { battles: number[]; coins: number[]; tiers: TrialTier[] }>();

  for (const m of milestones) {
    const existing = byLevel.get(m.level) ?? { battles: [], coins: [], tiers: [] };
    existing.battles.push(m.battle);
    existing.coins.push(m.coins);
    existing.tiers.push(m.tier);
    byLevel.set(m.level, existing);
  }

  const result: { level: number; battle: number; coins: number; tier: TrialTier }[] = [];
  for (const [level, data] of byLevel) {
    result.push({
      level,
      battle: Math.round(average(data.battles)),
      coins: Math.round(average(data.coins)),
      tier: mostCommon(data.tiers),
    });
  }

  return result.sort((a, b) => a.level - b.level);
}

/**
 * Get most common element in array.
 */
function mostCommon<T>(arr: T[]): T {
  const counts = new Map<T, number>();
  for (const item of arr) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  let maxCount = 0;
  let maxItem = arr[0];
  for (const [item, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      maxItem = item;
    }
  }
  return maxItem;
}

/**
 * Summarize bottlenecks, counting frequency.
 */
function summarizeBottlenecks(
  bottlenecks: SimulationReport['bottlenecks']
): SimulationReport['bottlenecks'] {
  const counts = new Map<string, { count: number; bottleneck: SimulationReport['bottlenecks'][0] }>();

  for (const b of bottlenecks) {
    const key = `${b.type}-${b.level}`;
    const existing = counts.get(key);
    if (existing) {
      existing.count++;
    } else {
      counts.set(key, { count: 1, bottleneck: b });
    }
  }

  // Return bottlenecks that occurred in >20% of runs
  return Array.from(counts.values())
    .filter(c => c.count >= 2)
    .map(c => ({
      ...c.bottleneck,
      description: `${c.bottleneck.description} (occurred ${c.count} times)`,
    }));
}

/**
 * Generate recommendations based on simulation results.
 */
function generateRecommendations(
  config: SimulationConfig,
  stats: {
    avgBattlesToLevel5: number;
    avgBattlesToLevel10: number;
    avgDeaths: number;
    avgFinalCoins: number;
    bottleneckSummary: SimulationReport['bottlenecks'];
  },
  accuracy: AccuracyProfile
): string[] {
  const recommendations: string[] = [];

  // Check progression speed
  if (config.accuracy === 'low') {
    if (stats.avgBattlesToLevel5 > 60) {
      recommendations.push('Low-skill players take too long to reach level 5. Consider reducing XP requirements for early levels.');
    }
    if (stats.avgDeaths > 15) {
      recommendations.push('Low-skill players die too often. Consider reducing early enemy damage or adding easier enemies.');
    }
  }

  if (config.accuracy === 'medium') {
    if (stats.avgBattlesToLevel5 > 40) {
      recommendations.push('Medium-skill progression is slow. Consider increasing XP rewards.');
    }
  }

  // Check economy
  if (stats.avgFinalCoins < 100 && config.targetLevel >= 5) {
    recommendations.push('Players end with too few coins. Consider increasing battle rewards.');
  }

  // Check specific bottlenecks
  const deathBottlenecks = stats.bottleneckSummary.filter(b => b.type === 'consecutive_deaths');
  if (deathBottlenecks.length > 0) {
    const levels = [...new Set(deathBottlenecks.map(b => b.level))];
    recommendations.push(`Difficulty spike at level(s) ${levels.join(', ')}. Consider adjusting enemy stats.`);
  }

  const coinBottlenecks = stats.bottleneckSummary.filter(b => b.type === 'low_coins' || b.type === 'cant_afford_supplies');
  if (coinBottlenecks.length > 0) {
    recommendations.push('Players frequently run low on coins. Consider increasing coin drops or reducing item costs.');
  }

  // Journey feasibility check
  if (config.targetLevel >= 5) {
    const journeyReqs = estimateJourneyRequirements(VERDANT_FOREST, accuracy);
    if (journeyReqs.recommendedLevel > 7) {
      recommendations.push(`Journey may be too hard for ${config.accuracy} players. Consider reducing forest enemy stats.`);
    }
  }

  if (recommendations.length === 0) {
    recommendations.push('Balance looks good for this accuracy level!');
  }

  return recommendations;
}

/**
 * Formats simulation report as markdown.
 */
export function formatReport(report: SimulationReport): string {
  const lines: string[] = [];

  lines.push('# Game Balance Simulation Report');
  lines.push('');
  lines.push('## Configuration');
  lines.push(`- **Accuracy Level**: ${report.config.accuracy} (${getAccuracyDescription(report.config.accuracy)})`);
  lines.push(`- **Target Level**: ${report.config.targetLevel}`);
  lines.push(`- **Simulation Runs**: ${report.config.runs}`);
  lines.push('');

  lines.push('## Summary');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Battles to Level 5 | ${report.summary.battlesToLevel5} |`);
  lines.push(`| Battles to Level 10 | ${report.summary.battlesToLevel10} |`);
  lines.push(`| Total Deaths | ${report.summary.totalDeaths} |`);
  lines.push(`| Average Accuracy | ${(report.summary.averageAccuracy * 100).toFixed(1)}% |`);
  lines.push(`| Final Coin Balance | ${report.summary.finalCoinBalance} |`);
  lines.push(`| Total Coins Earned | ${report.summary.totalCoinsEarned} |`);
  lines.push(`| Total Coins Spent | ${report.summary.totalCoinsSpent} |`);
  lines.push('');

  lines.push('## Level Milestones');
  lines.push(`| Level | Battle | Coins | Tier |`);
  lines.push(`|-------|--------|-------|------|`);
  for (const m of report.milestones) {
    lines.push(`| ${m.level} | ${m.battle} | ${m.coins} | ${m.tier} |`);
  }
  lines.push('');

  if (report.bottlenecks.length > 0) {
    lines.push('## Bottlenecks Detected');
    for (const b of report.bottlenecks) {
      lines.push(`- **${b.type}** at Level ${b.level}: ${b.description}`);
    }
    lines.push('');
  }

  lines.push('## Recommendations');
  for (const r of report.recommendations) {
    lines.push(`- ${r}`);
  }
  lines.push('');

  return lines.join('\n');
}

function getAccuracyDescription(level: AccuracyLevel): string {
  switch (level) {
    case 'high': return '95% correct - advanced player';
    case 'medium': return '75% correct - average player';
    case 'low': return '55% correct - struggling player';
  }
}

/**
 * CLI entry point.
 */
function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const config: SimulationConfig = {
    accuracy: 'medium',
    shopVisitFrequency: 10,
    usesHints: false,
    targetLevel: 10,
    maxBattles: 500,
    runs: 50,
  };

  for (const arg of args) {
    if (arg.startsWith('--accuracy=')) {
      config.accuracy = arg.split('=')[1] as AccuracyLevel;
    } else if (arg.startsWith('--level=')) {
      config.targetLevel = parseInt(arg.split('=')[1]);
    } else if (arg.startsWith('--runs=')) {
      config.runs = parseInt(arg.split('=')[1]);
    } else if (arg === '--hints') {
      config.usesHints = true;
    } else if (arg === '--all') {
      // Run all accuracy levels
      runAllSimulations();
      return;
    }
  }

  console.log('Running simulation...\n');
  const report = runSimulation(config);
  console.log(formatReport(report));
}

/**
 * Run simulations for all accuracy levels and combine into single report.
 */
function runAllSimulations() {
  const accuracyLevels: AccuracyLevel[] = ['high', 'medium', 'low'];
  const reports: SimulationReport[] = [];

  for (const accuracy of accuracyLevels) {
    console.log(`Running ${accuracy} accuracy simulation...`);
    const report = runSimulation({
      accuracy,
      shopVisitFrequency: 10,
      usesHints: false,
      targetLevel: 10,
      maxBattles: 500,
      runs: 50,
    });
    reports.push(report);
  }

  // Print combined report
  console.log('\n# Combined Balance Report\n');
  console.log('## Summary by Accuracy Level\n');
  console.log('| Metric | High | Medium | Low |');
  console.log('|--------|------|--------|-----|');
  console.log(`| Battles to Lv5 | ${reports[0].summary.battlesToLevel5} | ${reports[1].summary.battlesToLevel5} | ${reports[2].summary.battlesToLevel5} |`);
  console.log(`| Battles to Lv10 | ${reports[0].summary.battlesToLevel10} | ${reports[1].summary.battlesToLevel10} | ${reports[2].summary.battlesToLevel10} |`);
  console.log(`| Deaths | ${reports[0].summary.totalDeaths} | ${reports[1].summary.totalDeaths} | ${reports[2].summary.totalDeaths} |`);
  console.log(`| Final Coins | ${reports[0].summary.finalCoinBalance} | ${reports[1].summary.finalCoinBalance} | ${reports[2].summary.finalCoinBalance} |`);

  console.log('\n## All Recommendations\n');
  for (let i = 0; i < reports.length; i++) {
    console.log(`### ${accuracyLevels[i].toUpperCase()} Accuracy\n`);
    for (const r of reports[i].recommendations) {
      console.log(`- ${r}`);
    }
    console.log('');
  }
}

// Run if executed directly
// @ts-ignore - Node.js module check
if (typeof require !== 'undefined' && require.main && require.main.filename === module.filename) {
  main();
}

export { main, runAllSimulations };
