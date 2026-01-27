/**
 * Game Balance Simulation - Type Definitions
 *
 * These types define the data structures used for simulating
 * game progression, economy, and balance across different
 * player skill levels.
 */

// ============================================
// Simulation Configuration
// ============================================

export type AccuracyLevel = 'high' | 'medium' | 'low';

export interface SimulationConfig {
  /** Player skill level (determines % correct answers) */
  accuracy: AccuracyLevel;

  /** How many battles before visiting shop */
  shopVisitFrequency: number;

  /** Whether player uses hint tokens */
  usesHints: boolean;

  /** Target level to simulate to */
  targetLevel: number;

  /** Maximum battles before stopping (safety cap) */
  maxBattles: number;

  /** Number of simulation runs for statistical averaging */
  runs: number;
}

export interface AccuracyProfile {
  /** % correct on standard math problems */
  baseProblems: number;

  /** % correct on weapon bonus problems (harder) */
  bonusProblems: number;

  /** % correct on block problems (time pressure) */
  blockProblems: number;

  /** % correct on journey puzzles */
  puzzles: number;

  /** % of guild trials reaching each tier */
  trialTiers: {
    bronze: number;  // Probability of at least bronze
    silver: number;  // Probability of at least silver
    gold: number;    // Probability of gold
  };
}

export const ACCURACY_PROFILES: Record<AccuracyLevel, AccuracyProfile> = {
  high: {
    baseProblems: 0.95,
    bonusProblems: 0.90,
    blockProblems: 0.85,
    puzzles: 0.95,
    trialTiers: { bronze: 1.0, silver: 0.95, gold: 0.80 },
  },
  medium: {
    baseProblems: 0.75,
    bonusProblems: 0.65,
    blockProblems: 0.55,
    puzzles: 0.70,
    trialTiers: { bronze: 0.95, silver: 0.70, gold: 0.30 },
  },
  low: {
    baseProblems: 0.55,
    bonusProblems: 0.40,
    blockProblems: 0.30,
    puzzles: 0.50,
    trialTiers: { bronze: 0.75, silver: 0.35, gold: 0.05 },
  },
};

// ============================================
// Game Balance Constants (from codebase)
// ============================================

export interface EnemyStats {
  id: string;
  name: string;
  hp: number;
  atk: number;
  xp: number;
  coinMin: number;
  coinMax: number;
  difficulty: number;
}

export interface WeaponStats {
  id: string;
  name: string;
  cost: number;
  atk: number;
  multiplier: number;
}

export interface ShieldStats {
  id: string;
  name: string;
  cost: number;
  blockTime: number;
  blockAttempts: number;
}

export const GAME_BALANCE = {
  // Starting stats
  startingHP: 10,
  startingATK: 1,
  startingCoins: 0,

  // Per level gains
  hpPerLevel: 1,
  atkPerLevel: 1,

  // XP requirements per level
  xpToLevel: {
    1: 20,
    2: 60,
    3: 100,
    4: 100,
    5: 100,
    6: 100,
    7: 100,
    8: 100,
    9: 100,
    10: 100,
  } as Record<number, number>,

  // Problems per turn by player level (base problems, not including pet/weapon)
  problemsPerTurn: {
    1: 1,
    2: 2,
    3: 3,
    4: 4,
    5: 4,
    6: 4,
    7: 4,
    8: 4,
    9: 4,
    10: 4,
  } as Record<number, number>,

  // ACTUAL GAME VALUES:
  // NO healing between battles - HP persists
  hpRegenBetweenBattles: 0,

  // XP is fixed at 20 per battle (not enemy-based)
  xpPerBattle: 20,

  // Coin earning: 1 small copper per battle + enemy gold drop
  coinsPerBattle: 1,

  // Damage formula: ONLY correct answers count, NO base ATK added
  // Damage = sum of (damageMultiplier for each correct answer)
  baseATKAddsToDamage: false,

  // Guild trial: 60 seconds, need 10 correct to pass (binary, not tiered)
  trialDuration: 60,
  trialRequiredCorrect: 10,
};

export const ENEMIES: EnemyStats[] = [
  { id: 'slime_green', name: 'Slime', hp: 3, atk: 1, xp: 20, coinMin: 5, coinMax: 15, difficulty: 1 },
  { id: 'purple_demon', name: 'Purple Demon', hp: 4, atk: 2, xp: 40, coinMin: 15, coinMax: 35, difficulty: 2 },
  { id: 'pink_beast', name: 'Pink Beast', hp: 10, atk: 2, xp: 70, coinMin: 30, coinMax: 55, difficulty: 3 },
  { id: 'leafy', name: 'Leafy', hp: 15, atk: 3, xp: 100, coinMin: 50, coinMax: 80, difficulty: 4 },
];

export const WEAPONS: WeaponStats[] = [
  { id: 'sword_wooden', name: 'Wooden Sword', cost: 8, atk: 2, multiplier: 1 },
  { id: 'sword_iron', name: 'Iron Sword', cost: 80, atk: 5, multiplier: 1 },
  { id: 'sword_steel', name: 'Steel Sword', cost: 180, atk: 8, multiplier: 2 },
  { id: 'sword_golden', name: 'Golden Sword', cost: 400, atk: 12, multiplier: 2 },
];

export const SHIELDS: ShieldStats[] = [
  { id: 'shield_wooden', name: 'Wooden Shield', cost: 3, blockTime: 5, blockAttempts: 1 },
  { id: 'shield_iron', name: 'Iron Shield', cost: 100, blockTime: 6, blockAttempts: 2 },
  { id: 'shield_steel', name: 'Steel Shield', cost: 200, blockTime: 8, blockAttempts: 2 },
  { id: 'shield_golden', name: 'Golden Shield', cost: 450, blockTime: 10, blockAttempts: 3 },
];

export interface PotionStats {
  id: string;
  name: string;
  cost: number;
  healAmount: number;
}

export const POTIONS: PotionStats[] = [
  { id: 'potion_small', name: 'Small Potion', cost: 20, healAmount: 25 },
  { id: 'potion_large', name: 'Large Potion', cost: 50, healAmount: 75 },
];

/**
 * Actual game town mechanics:
 * - Entering town gives FREE full heal
 * - If player has potion subscription and used their potion, it refills for FREE
 * - Potion subscription is purchased once at WitchHut for 5 coins
 */
export const TOWN_MECHANICS = {
  /** Town entry is FREE and heals to full */
  freeHealOnEntry: true,

  /** If player has subscription and used potion, refill for FREE */
  freePotionRefillWithSubscription: true,

  /** WitchHut potion subscription cost (one-time) */
  potionSubscriptionCost: 5,
};

// ============================================
// Proposed New Systems
// ============================================

export const PROPOSED_COIN_SYSTEM = {
  /** Base coins per battle victory */
  perBattle: 5,

  /** Bonus coins for 5+ answer streak in battle */
  streakBonus: 10,

  /** One-time bonus for first defeat of each enemy type */
  firstKillBonus: 50,
};

export const PROPOSED_TIER_SYSTEM = {
  /** Points needed for each tier in guild trial */
  thresholds: {
    bronze: 5,
    silver: 8,
    gold: 12,
  },

  /** Rewards by tier */
  rewards: {
    bronze: { hp: 1, atk: 0, coins: 0, diamonds: 0 },
    silver: { hp: 1, atk: 1, coins: 0, diamonds: 0 },
    gold: { hp: 1, atk: 1, coins: 10, diamonds: 3 },
  },

  /** Multiplier for every 5th level (5, 10, 15, 20...) */
  milestone5xMultiplier: 2,
};

export const PROPOSED_ITEMS = {
  hintToken: { cost: 20 },
  journeySupplies: { cost: 50 },
};

// ============================================
// Simulation State
// ============================================

export interface PlayerState {
  level: number;
  hp: number;
  maxHP: number;
  atk: number;
  xp: number;
  coins: number;
  diamonds: number;
  weapon: WeaponStats | null;
  shield: ShieldStats | null;
  hintTokens: number;
  journeySupplies: number;

  /** Potion subscription status (bought once at WitchHut for 5 coins) */
  hasPotionSubscription: boolean;

  /** Current potion count (0 or 1, refills FREE in town if subscription) */
  potions: number;

  /** Track first kills for bonus coins */
  defeatedEnemyTypes: Set<string>;

  /** Track best tier achieved per level (for retry feature) */
  bestTierPerLevel: Map<number, 'bronze' | 'silver' | 'gold'>;
}

export function createInitialPlayerState(): PlayerState {
  return {
    level: 1,
    hp: GAME_BALANCE.startingHP,
    maxHP: GAME_BALANCE.startingHP,
    atk: GAME_BALANCE.startingATK,
    xp: 0,
    coins: GAME_BALANCE.startingCoins,
    diamonds: 0,
    weapon: null,
    shield: null,
    hintTokens: 0,
    journeySupplies: 0,
    hasPotionSubscription: false,
    potions: 0,
    defeatedEnemyTypes: new Set(),
    bestTierPerLevel: new Map(),
  };
}

// ============================================
// Battle Results
// ============================================

export interface BattleResult {
  /** Did player win? */
  won: boolean;

  /** Number of turns the battle took */
  turns: number;

  /** Player HP remaining after battle */
  playerHPRemaining: number;

  /** Total damage dealt to enemy */
  damageDealt: number;

  /** Accuracy during this battle */
  accuracy: number;

  /** Did player achieve 5+ streak? */
  hadStreak: boolean;

  /** Problems solved correctly */
  correctAnswers: number;

  /** Total problems presented */
  totalProblems: number;
}

// ============================================
// Trial Results
// ============================================

export type TrialTier = 'none' | 'bronze' | 'silver' | 'gold';

export interface TrialResult {
  /** Points scored */
  points: number;

  /** Tier achieved */
  tier: TrialTier;

  /** Problems correct */
  correct: number;

  /** Problems wrong */
  wrong: number;

  /** Best streak during trial */
  bestStreak: number;
}

// ============================================
// Economy Tracking
// ============================================

export interface EconomySnapshot {
  battle: number;
  level: number;
  coins: number;
  totalEarned: number;
  totalSpent: number;
  canAfford: {
    ironSword: boolean;
    steelSword: boolean;
    journeySupplies: boolean;
  };
}

// ============================================
// Journey Simulation
// ============================================

export interface JourneyStage {
  id: string;
  name: string;
  encounters: JourneyEncounter[];
}

export type JourneyEncounterType = 'battle' | 'puzzle' | 'rest' | 'chest' | 'boss';

export interface JourneyEncounter {
  type: JourneyEncounterType;
  enemyId?: string;
  puzzleDifficulty?: number;
  healPercent?: number;
  chestCoins?: number;
  bossId?: string;
}

export interface JourneyResult {
  /** Did player complete the journey? */
  completed: boolean;

  /** Stage reached before retreat (if not completed) */
  stageReached: number;

  /** Total battles fought */
  battlesFought: number;

  /** Battles won */
  battlesWon: number;

  /** Puzzles solved */
  puzzlesSolved: number;

  /** Puzzles failed */
  puzzlesFailed: number;

  /** HP at end (or 0 if retreated) */
  finalHP: number;

  /** Coins earned during journey */
  coinsEarned: number;
}

// ============================================
// Simulation Report
// ============================================

export interface SimulationReport {
  config: SimulationConfig;

  /** Summary statistics */
  summary: {
    battlesToLevel5: number;
    battlesToLevel10: number;
    totalDeaths: number;
    averageAccuracy: number;
    finalCoinBalance: number;
    totalCoinsEarned: number;
    totalCoinsSpent: number;
  };

  /** Level progression milestones */
  milestones: {
    level: number;
    battle: number;
    coins: number;
    tier: TrialTier;
  }[];

  /** Economy snapshots over time */
  economyHistory: EconomySnapshot[];

  /** Detected bottlenecks/issues */
  bottlenecks: {
    type: 'low_coins' | 'consecutive_deaths' | 'stuck_at_level' | 'cant_afford_supplies';
    battle: number;
    level: number;
    description: string;
  }[];

  /** Recommendations based on analysis */
  recommendations: string[];
}

// ============================================
// Battle Log Entry
// ============================================

export interface BattleLogEntry {
  battle: number;
  level: number;
  enemyId: string;
  won: boolean;
  turns: number;
  playerHP: number;
  coins: number;
  xp: number;
  hadStreak: boolean;
  accuracy: number;
}

// ============================================
// Utility Functions
// ============================================

/** Get enemy stats by difficulty appropriate for player level */
export function getEnemyForLevel(level: number): EnemyStats {
  if (level <= 2) return ENEMIES[0]; // Slime
  if (level <= 4) return ENEMIES[1]; // Purple Demon
  if (level <= 7) return ENEMIES[2]; // Pink Beast
  return ENEMIES[3]; // Leafy
}

/** Get XP required for next level */
export function getXPForLevel(level: number): number {
  return GAME_BALANCE.xpToLevel[level] ?? 100;
}

/** Get problems per turn for player level */
export function getProblemsForLevel(level: number): number {
  return GAME_BALANCE.problemsPerTurn[level] ?? 4;
}

/** Determine tier from trial points */
export function getTierFromPoints(points: number): TrialTier {
  const { thresholds } = PROPOSED_TIER_SYSTEM;
  if (points >= thresholds.gold) return 'gold';
  if (points >= thresholds.silver) return 'silver';
  if (points >= thresholds.bronze) return 'bronze';
  return 'none';
}

/** Get tier rewards */
export function getTierRewards(tier: TrialTier, level: number): {
  hp: number;
  atk: number;
  coins: number;
  diamonds: number;
} {
  if (tier === 'none') {
    return { hp: 0, atk: 0, coins: 0, diamonds: 0 };
  }

  const base = PROPOSED_TIER_SYSTEM.rewards[tier];
  const isMilestone = level % 5 === 0;
  const multiplier = isMilestone ? PROPOSED_TIER_SYSTEM.milestone5xMultiplier : 1;

  return {
    hp: base.hp,
    atk: base.atk,
    coins: base.coins * multiplier,
    diamonds: base.diamonds * multiplier,
  };
}

/**
 * Calculates coins earned from battle using ACTUAL GAME VALUES.
 *
 * Actual game coin system:
 * - 1 small copper per battle (always)
 * - + random enemy gold drop between coinMin and coinMax
 *
 * Note: hadStreak and isFirstKill are NOT used in actual game - kept for future proposed system
 */
export function calculateBattleCoins(
  enemy: EnemyStats,
  _hadStreak: boolean,
  _isFirstKill: boolean
): number {
  // ACTUAL GAME: 1 small copper + random enemy gold drop
  const baseCoins = GAME_BALANCE.coinsPerBattle; // 1
  const goldDrop = randomInRange(enemy.coinMin, enemy.coinMax);

  return baseCoins + goldDrop;
}

/** Random number in range */
export function randomInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
