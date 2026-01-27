/**
 * Economy Simulator
 *
 * Tracks coin income/spending and simulates shop purchase decisions.
 */

import {
  PlayerState,
  EconomySnapshot,
  EnemyStats,
  WEAPONS,
  SHIELDS,
  PROPOSED_ITEMS,
  calculateBattleCoins,
} from './types';

export interface EconomyConfig {
  /** How often to buy hint tokens (every N battles, 0 = never) */
  hintPurchaseFrequency: number;

  /** Minimum coins to keep as buffer before purchases */
  coinBuffer: number;

  /** Enable debug logging */
  debug: boolean;
}

const DEFAULT_ECONOMY_CONFIG: EconomyConfig = {
  hintPurchaseFrequency: 0,
  coinBuffer: 20,
  debug: false,
};

/**
 * Tracks economy state over simulation.
 */
export class EconomyTracker {
  private totalEarned: number = 0;
  private totalSpent: number = 0;
  private snapshots: EconomySnapshot[] = [];
  private lowCoinWarnings: { battle: number; level: number; coins: number }[] = [];
  private config: EconomyConfig;

  constructor(config: EconomyConfig = DEFAULT_ECONOMY_CONFIG) {
    this.config = config;
  }

  /**
   * Records coins earned from battle.
   */
  earnFromBattle(
    player: PlayerState,
    enemy: EnemyStats,
    hadStreak: boolean,
    battle: number
  ): number {
    const isFirstKill = !player.defeatedEnemyTypes.has(enemy.id);
    const coins = calculateBattleCoins(enemy, hadStreak, isFirstKill);

    player.coins += coins;
    this.totalEarned += coins;

    if (isFirstKill) {
      player.defeatedEnemyTypes.add(enemy.id);
    }

    if (this.config.debug) {
      console.log(`Battle ${battle}: +${coins} coins (streak: ${hadStreak}, first kill: ${isFirstKill})`);
      console.log(`  Total coins: ${player.coins}`);
    }

    return coins;
  }

  /**
   * Records coins earned from level-up tier bonus.
   */
  earnFromLevelUp(player: PlayerState, coins: number, battle: number): void {
    if (coins > 0) {
      player.coins += coins;
      this.totalEarned += coins;

      if (this.config.debug) {
        console.log(`Battle ${battle}: +${coins} coins from tier bonus`);
      }
    }
  }

  /**
   * Takes a snapshot of economy state.
   */
  takeSnapshot(player: PlayerState, battle: number): EconomySnapshot {
    const snapshot: EconomySnapshot = {
      battle,
      level: player.level,
      coins: player.coins,
      totalEarned: this.totalEarned,
      totalSpent: this.totalSpent,
      canAfford: {
        ironSword: player.coins >= WEAPONS[1].cost,
        steelSword: player.coins >= WEAPONS[2].cost,
        journeySupplies: player.coins >= PROPOSED_ITEMS.journeySupplies.cost,
      },
    };

    this.snapshots.push(snapshot);

    // Track low coin warnings
    if (player.coins < this.config.coinBuffer) {
      this.lowCoinWarnings.push({
        battle,
        level: player.level,
        coins: player.coins,
      });
    }

    return snapshot;
  }

  /**
   * Simulates shop purchase decisions.
   */
  simulateShopVisit(player: PlayerState, battle: number): {
    purchased: string[];
    spent: number;
  } {
    const purchased: string[] = [];
    let spent = 0;

    // Priority order for purchases
    const purchasePriority = [
      // 1. Better weapon if affordable and significant upgrade
      () => this.tryBuyWeapon(player),
      // 2. Journey supplies if needed and can afford
      () => this.tryBuyJourneySupplies(player),
      // 3. Hint tokens if configured
      () => this.tryBuyHintTokens(player, battle),
      // 4. Better shield if affordable
      () => this.tryBuyShield(player),
    ];

    for (const tryPurchase of purchasePriority) {
      const result = tryPurchase();
      if (result) {
        purchased.push(result.item);
        spent += result.cost;
      }
    }

    if (spent > 0) {
      this.totalSpent += spent;

      if (this.config.debug) {
        console.log(`Shop visit at battle ${battle}:`);
        console.log(`  Purchased: ${purchased.join(', ')}`);
        console.log(`  Spent: ${spent} coins`);
        console.log(`  Remaining: ${player.coins} coins`);
      }
    }

    return { purchased, spent };
  }

  private tryBuyWeapon(player: PlayerState): { item: string; cost: number } | null {
    // Find best affordable weapon that's better than current
    const currentATK = player.weapon?.atk ?? 0;

    for (let i = WEAPONS.length - 1; i >= 0; i--) {
      const weapon = WEAPONS[i];
      if (
        weapon.atk > currentATK &&
        player.coins >= weapon.cost + this.config.coinBuffer
      ) {
        player.coins -= weapon.cost;
        player.weapon = weapon;
        return { item: weapon.name, cost: weapon.cost };
      }
    }

    return null;
  }

  private tryBuyShield(player: PlayerState): { item: string; cost: number } | null {
    // Find best affordable shield that's better than current
    const currentAttempts = player.shield?.blockAttempts ?? 0;

    for (let i = SHIELDS.length - 1; i >= 0; i--) {
      const shield = SHIELDS[i];
      if (
        shield.blockAttempts > currentAttempts &&
        player.coins >= shield.cost + this.config.coinBuffer
      ) {
        player.coins -= shield.cost;
        player.shield = shield;
        return { item: shield.name, cost: shield.cost };
      }
    }

    return null;
  }

  private tryBuyJourneySupplies(player: PlayerState): { item: string; cost: number } | null {
    // Buy supplies if player is level 5+ and doesn't have them
    if (
      player.level >= 5 &&
      player.journeySupplies === 0 &&
      player.coins >= PROPOSED_ITEMS.journeySupplies.cost + this.config.coinBuffer
    ) {
      player.coins -= PROPOSED_ITEMS.journeySupplies.cost;
      player.journeySupplies = 1;
      return { item: 'Journey Supplies', cost: PROPOSED_ITEMS.journeySupplies.cost };
    }

    return null;
  }

  private tryBuyHintTokens(
    player: PlayerState,
    battle: number
  ): { item: string; cost: number } | null {
    // Buy hint tokens based on frequency config
    if (
      this.config.hintPurchaseFrequency > 0 &&
      battle % this.config.hintPurchaseFrequency === 0 &&
      player.coins >= PROPOSED_ITEMS.hintToken.cost + this.config.coinBuffer
    ) {
      player.coins -= PROPOSED_ITEMS.hintToken.cost;
      player.hintTokens++;
      return { item: 'Hint Token', cost: PROPOSED_ITEMS.hintToken.cost };
    }

    return null;
  }

  /**
   * Returns summary of economy tracking.
   */
  getSummary(): {
    totalEarned: number;
    totalSpent: number;
    snapshots: EconomySnapshot[];
    lowCoinWarnings: { battle: number; level: number; coins: number }[];
  } {
    return {
      totalEarned: this.totalEarned,
      totalSpent: this.totalSpent,
      snapshots: this.snapshots,
      lowCoinWarnings: this.lowCoinWarnings,
    };
  }

  /**
   * Analyzes when player could afford key items.
   */
  analyzeMilestones(): {
    ironSwordBattle: number | null;
    steelSwordBattle: number | null;
    goldenSwordBattle: number | null;
    journeySuppliesBattle: number | null;
  } {
    let ironSwordBattle: number | null = null;
    let steelSwordBattle: number | null = null;
    let goldenSwordBattle: number | null = null;
    let journeySuppliesBattle: number | null = null;

    for (const snapshot of this.snapshots) {
      if (ironSwordBattle === null && snapshot.coins >= WEAPONS[1].cost) {
        ironSwordBattle = snapshot.battle;
      }
      if (steelSwordBattle === null && snapshot.coins >= WEAPONS[2].cost) {
        steelSwordBattle = snapshot.battle;
      }
      if (goldenSwordBattle === null && snapshot.coins >= WEAPONS[3].cost) {
        goldenSwordBattle = snapshot.battle;
      }
      if (journeySuppliesBattle === null && snapshot.coins >= PROPOSED_ITEMS.journeySupplies.cost) {
        journeySuppliesBattle = snapshot.battle;
      }
    }

    return {
      ironSwordBattle,
      steelSwordBattle,
      goldenSwordBattle,
      journeySuppliesBattle,
    };
  }
}

/**
 * Estimates battles needed to afford a specific item.
 */
export function estimateBattlesToAfford(
  currentCoins: number,
  itemCost: number,
  avgCoinsPerBattle: number
): number {
  if (currentCoins >= itemCost) return 0;
  const needed = itemCost - currentCoins;
  return Math.ceil(needed / avgCoinsPerBattle);
}

/**
 * Calculates average coins per battle based on accuracy.
 */
export function getAvgCoinsPerBattle(
  streakProbability: number
): number {
  const { perBattle, streakBonus } = require('./types').PROPOSED_COIN_SYSTEM;
  return perBattle + (streakBonus * streakProbability);
}
