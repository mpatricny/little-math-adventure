import { PlayerState, CoinCurrency, DiamondInventory, DiamondType, CharacterType, Crystal, CrystalInventory, TownProgress, TrialTier, TrialHistory, TrialAttempt, TRIAL_TIER_THRESHOLDS } from '../types';
import { CrystalSystem } from './CrystalSystem';
import { ManaSystem } from './ManaSystem';

/**
 * Create initial TownProgress for a new player.
 * Arena is always unlocked from the start.
 */
export function createInitialTownProgress(): TownProgress {
    return {
        unlockedBuildings: ['arena-building'],
        revealedBuildings: ['arena-building'],
        visitedBuildings: [],
        totalWavesCompleted: 0,
        wavesAfterForgeUnlock: 0
    };
}

// XP needed per level transition (battles needed)
const XP_PER_LEVEL: Record<number, number> = {
    1: 20,   // 1 battle (slime gives 20 XP)
    2: 60,   // ~3 battles
    3: 100,  // ~5 battles
    4: 100,  // ~5 battles
    5: 100,  // ~5 battles (and beyond)
};

export class ProgressionSystem {
    /**
     * Calculate XP needed for next level
     */
    static getXpForLevel(level: number): number {
        return XP_PER_LEVEL[level] || 100;
    }

    /**
     * Get total coin value
     */
    static getTotalCoinValue(coins: CoinCurrency): number {
        if (!coins) return 0;
        return (coins.copper || 0) + ((coins.silver || 0) * 5) + ((coins.gold || 0) * 10) + ((coins.pouch ?? 0) * 100);
    }

    /**
     * Auto-normalize coin denominations for cleaner display.
     * Keeps min 4 copper and min 1 silver (when total >= 9), rest as gold.
     */
    static normalizeCoins(player: PlayerState): void {
        const total = this.getTotalCoinValue(player.coins);
        if (total < 9) {
            player.coins = { copper: total, silver: 0, gold: 0, pouch: 0 };
            return;
        }
        // Reserve minimum denominations: 4 copper (4) + 1 silver (5) = 9
        const remaining = total - 4 - 5;
        const gold = Math.floor(remaining / 10);
        const afterGold = remaining - gold * 10;
        const extraSilver = Math.floor(afterGold / 5);
        const extraCopper = afterGold - extraSilver * 5;

        // Keep at least 9 gold; only convert excess (in blocks of 10) into pouches
        let pouches = 0;
        let finalGold = gold;
        if (gold > 9) {
            const excessGold = gold - 9;
            pouches = Math.floor(excessGold / 10);
            finalGold = 9 + (excessGold - pouches * 10);
        }

        player.coins = {
            copper: 4 + extraCopper,
            silver: 1 + extraSilver,
            gold: finalGold,
            pouch: pouches
        };
    }

    /**
     * Award coins (battle reward) and auto-normalize
     * @param player - Player state
     * @param count - Number of copper-equivalent coins to award (default 1)
     */
    static awardBattleCoin(player: PlayerState, count: number = 1): void {
        player.coins.copper += count;
        this.normalizeCoins(player);
    }

    /**
     * Spend coins (returns true if successful). Flattens to copper, deducts, re-normalizes.
     */
    static spendCoins(player: PlayerState, amount: number): boolean {
        const total = this.getTotalCoinValue(player.coins);
        if (total < amount) return false;
        // Flatten to copper, deduct, re-normalize
        player.coins = { copper: total - amount, silver: 0, gold: 0, pouch: 0 };
        this.normalizeCoins(player);
        return true;
    }

    /**
     * Award XP to player - caps at xpToNextLevel and sets readyToPromote flag
     * No automatic level-up! Player must visit Guild for trial.
     * Fail blocking: if player has a failedTrialLevel, XP caps but readyToPromote stays false.
     * Returns { readyForTrial: true } if XP is now capped
     */
    static awardXp(player: PlayerState, xpAmount: number): { readyForTrial: boolean } {
        player.xp += xpAmount;

        // Check if XP reached threshold - cap it and set flag
        if (player.xp >= player.xpToNextLevel) {
            player.xp = player.xpToNextLevel;  // Cap at threshold (don't overflow)

            // Fail blocking: if player failed a trial, don't set readyToPromote
            // They must retry the failed trial first
            if (player.trialHistory?.failedTrialLevel != null) {
                return { readyForTrial: false };
            }

            player.readyToPromote = true;
            return { readyForTrial: true };
        }

        return { readyForTrial: false };
    }

    /**
     * Apply level-up after successful Guild trial
     * @param player Player state
     * @param levels Number of levels to gain (1 or 2)
     */
    static applyLevelUp(player: PlayerState, levels: number): { newLevel: number; hpGain: number; attackGain: number } {
        const hpGainPerLevel = 1;  // +1 HP per level (was 5)
        const attackGainPerLevel = 1;

        const totalHpGain = hpGainPerLevel * levels;
        const totalAttackGain = attackGainPerLevel * levels;

        player.level += levels;
        player.maxHp += totalHpGain;
        player.hp += totalHpGain;  // Also heal on level-up
        player.attack += totalAttackGain;

        // Reset for next level
        player.xp = 0;
        player.xpToNextLevel = this.getXpForLevel(player.level);
        player.readyToPromote = false;

        return {
            newLevel: player.level,
            hpGain: totalHpGain,
            attackGain: totalAttackGain
        };
    }

    /**
     * Tiered reward configuration for trial results
     */
    private static readonly TRIAL_TIER_REWARDS: Record<TrialTier, { hp: number; atk: number; mana: number }> = {
        none:   { hp: 0, atk: 0, mana: 0 },
        bronze: { hp: 1, atk: 0, mana: 0 },
        silver: { hp: 1, atk: 1, mana: 0 },
        gold:   { hp: 1, atk: 1, mana: 2 },
    };

    /**
     * Determine trial tier from correct answer count
     */
    static getTrialTier(correctCount: number): TrialTier {
        if (correctCount >= TRIAL_TIER_THRESHOLDS.gold) return 'gold';
        if (correctCount >= TRIAL_TIER_THRESHOLDS.silver) return 'silver';
        if (correctCount >= TRIAL_TIER_THRESHOLDS.bronze) return 'bronze';
        return 'none';
    }

    /**
     * Apply trial result with tiered rewards.
     * Returns the gains applied.
     */
    static applyTrialResult(player: PlayerState, tier: TrialTier): {
        leveledUp: boolean;
        newLevel: number;
        hpGain: number;
        attackGain: number;
        manaGain: number;
    } {
        const rewards = this.TRIAL_TIER_REWARDS[tier];

        // Track best tier per level
        if (!player.bestTrialTiers) player.bestTrialTiers = {};
        const currentBest = player.bestTrialTiers[player.level];
        const tierOrder: TrialTier[] = ['none', 'bronze', 'silver', 'gold'];
        if (!currentBest || tierOrder.indexOf(tier) > tierOrder.indexOf(currentBest)) {
            player.bestTrialTiers[player.level] = tier;
        }

        if (tier === 'none') {
            // Failed - no level up, but player can retry
            return { leveledUp: false, newLevel: player.level, hpGain: 0, attackGain: 0, manaGain: 0 };
        }

        // Apply level up
        player.level += 1;
        player.maxHp += rewards.hp;
        player.hp += rewards.hp;
        player.attack += rewards.atk;

        // Mana bonus for gold
        if (rewards.mana > 0) {
            ManaSystem.add(player, rewards.mana);
        }

        // Reset XP for next level
        player.xp = 0;
        player.xpToNextLevel = this.getXpForLevel(player.level);
        player.readyToPromote = false;

        return {
            leveledUp: true,
            newLevel: player.level,
            hpGain: rewards.hp,
            attackGain: rewards.atk,
            manaGain: rewards.mana,
        };
    }

    /**
     * Numeric rank for tier comparison (none=0, bronze=1, silver=2, gold=3)
     */
    static tierRank(tier: TrialTier): number {
        const ranks: Record<TrialTier, number> = { none: 0, bronze: 1, silver: 2, gold: 3 };
        return ranks[tier];
    }

    /**
     * Initialize or get trial history for player
     */
    static ensureTrialHistory(player: PlayerState): TrialHistory {
        if (!player.trialHistory) {
            player.trialHistory = {
                attempts: [],
                bestTiers: {},
                failedTrialLevel: null,
                retryLevel: null,
            };
        }
        return player.trialHistory;
    }

    /**
     * Determine if player can start a trial and what kind.
     * Returns status and the trial level to use.
     */
    static canStartTrial(player: PlayerState): {
        canStart: boolean;
        reason: 'ready' | 'retry_fail' | 'not_ready' | 'blocked_by_fail';
        trialLevel: number;
    } {
        const history = this.ensureTrialHistory(player);

        // Check for failed trial that must be retried
        if (history.failedTrialLevel != null) {
            // Player has a pending failed trial
            if (player.xp >= player.xpToNextLevel) {
                // XP is capped but blocked by fail
                return { canStart: true, reason: 'blocked_by_fail', trialLevel: history.failedTrialLevel };
            }
            // XP not capped but still blocked
            return { canStart: true, reason: 'retry_fail', trialLevel: history.failedTrialLevel };
        }

        // Check for retry for improvement
        if (history.retryLevel != null) {
            return { canStart: true, reason: 'ready', trialLevel: history.retryLevel };
        }

        // Normal trial
        if (player.readyToPromote) {
            return { canStart: true, reason: 'ready', trialLevel: player.level };
        }

        return { canStart: false, reason: 'not_ready', trialLevel: player.level };
    }

    /**
     * Check if player can retry a trial level for tier improvement
     */
    static canRetryForImprovement(player: PlayerState, level: number): boolean {
        const history = this.ensureTrialHistory(player);
        const bestTier = history.bestTiers[level];
        return bestTier === 'bronze' || bestTier === 'silver';
    }

    /**
     * Set up a retry for improvement
     */
    static startRetryForImprovement(player: PlayerState, level: number): void {
        const history = this.ensureTrialHistory(player);
        history.retryLevel = level;
    }

    /**
     * Apply trial result with full history tracking, differential rewards, and fail blocking.
     * Replaces applyTrialResult for new flow.
     */
    static applyTrialResultWithHistory(
        player: PlayerState,
        tier: TrialTier,
        correctCount: number,
        wrongCount: number,
    ): {
        leveledUp: boolean;
        newLevel: number;
        hpGain: number;
        attackGain: number;
        manaGain: number;
        isImprovement: boolean;
        wasRetry: boolean;
    } {
        const history = this.ensureTrialHistory(player);
        const isRetryFail = history.failedTrialLevel != null;
        const isRetryImprove = history.retryLevel != null;
        const isRetry = isRetryFail || isRetryImprove;

        // Determine the trial level
        let trialLevel: number;
        if (isRetryFail) {
            trialLevel = history.failedTrialLevel!;
        } else if (isRetryImprove) {
            trialLevel = history.retryLevel!;
        } else {
            trialLevel = player.level;
        }

        const previousBest = history.bestTiers[trialLevel] || 'none';
        const isImprovement = this.tierRank(tier) > this.tierRank(previousBest);

        // Calculate rewards (differential for retries)
        let rewards = { hp: 0, atk: 0, mana: 0 };
        let leveledUp = false;

        if (tier === 'none') {
            // Failed
            if (!isRetry) {
                // First attempt fail — set fail block
                history.failedTrialLevel = trialLevel;
            }
            // If retry fail, failedTrialLevel stays set
        } else {
            // Passed (bronze, silver, or gold)
            if (isRetryFail) {
                // Retry after fail — clear fail block, grant full rewards, level up
                history.failedTrialLevel = null;
                rewards = { ...this.TRIAL_TIER_REWARDS[tier] };
                leveledUp = true;
            } else if (isRetryImprove) {
                // Retry for improvement — only differential rewards, no level up
                history.retryLevel = null;
                if (isImprovement) {
                    const oldRewards = this.TRIAL_TIER_REWARDS[previousBest];
                    const newRewards = this.TRIAL_TIER_REWARDS[tier];
                    rewards = {
                        hp: Math.max(0, newRewards.hp - oldRewards.hp),
                        atk: Math.max(0, newRewards.atk - oldRewards.atk),
                        mana: Math.max(0, newRewards.mana - oldRewards.mana),
                    };
                }
                // No level up on improvement retry
            } else {
                // First attempt pass — full rewards + level up
                rewards = { ...this.TRIAL_TIER_REWARDS[tier] };
                leveledUp = true;
            }

            // Update best tier
            if (isImprovement) {
                history.bestTiers[trialLevel] = tier;
            }
        }

        // Also update legacy bestTrialTiers for compatibility
        if (!player.bestTrialTiers) player.bestTrialTiers = {};
        if (isImprovement) {
            player.bestTrialTiers[trialLevel] = tier;
        }

        // Apply stat rewards
        if (rewards.hp > 0) { player.maxHp += rewards.hp; player.hp += rewards.hp; }
        if (rewards.atk > 0) { player.attack += rewards.atk; }
        if (rewards.mana > 0) { ManaSystem.add(player, rewards.mana); }

        // Apply level up
        if (leveledUp) {
            player.level += 1;
            player.xp = 0;
            player.xpToNextLevel = this.getXpForLevel(player.level);
            player.readyToPromote = false;
        }

        // Record attempt
        const attempt: TrialAttempt = {
            level: trialLevel,
            tier,
            correctCount,
            wrongCount,
            timestamp: Date.now(),
            isRetry,
            rewardsGiven: { hp: rewards.hp, atk: rewards.atk, mana: rewards.mana },
        };
        history.attempts.push(attempt);

        return {
            leveledUp,
            newLevel: player.level,
            hpGain: rewards.hp,
            attackGain: rewards.atk,
            manaGain: rewards.mana,
            isImprovement,
            wasRetry: isRetry,
        };
    }

    /**
     * Reset trial state without leveling up (failed trial)
     */
    static resetTrialState(_player: PlayerState): void {
        // Player keeps readyToPromote = true so they can retry
        // XP stays capped
    }

    /**
     * Award diamond to player (for mastering problems)
     */
    static awardDiamond(player: PlayerState, type: DiamondType = 'common'): void {
        player.diamonds[type] += 1;
    }

    /**
     * Get total diamond count across all types
     */
    static getTotalDiamonds(diamonds: DiamondInventory): number {
        return diamonds.common + diamonds.red + diamonds.green;
    }

    /**
     * Check if player can afford a diamond cost
     */
    static canAffordDiamonds(player: PlayerState, cost: { common: number; red: number; green: number }): boolean {
        return player.diamonds.common >= cost.common &&
               player.diamonds.red >= cost.red &&
               player.diamonds.green >= cost.green;
    }

    /**
     * Spend diamonds (for pet purchase)
     */
    static spendDiamonds(player: PlayerState, cost: { common: number; red: number; green: number }): boolean {
        if (!this.canAffordDiamonds(player, cost)) return false;
        player.diamonds.common -= cost.common;
        player.diamonds.red -= cost.red;
        player.diamonds.green -= cost.green;
        return true;
    }

    /**
     * Set player to defeated state
     */
    static setDefeated(player: PlayerState): void {
        player.hp = 1;  // Don't kill, just bring to 1 HP
        player.status = 'přizabitý';
    }

    /**
     * Full heal player (when returning to town from arena)
     */
    static fullHeal(player: PlayerState): void {
        player.hp = player.maxHp;
        player.status = 'healthy';
    }

    /**
     * Buy potion (costs coins, adds to inventory)
     */
    static buyPotion(player: PlayerState, cost: number): boolean {
        if (!this.spendCoins(player, cost)) {
            return false;
        }
        player.potions += 1;
        return true;
    }

    /**
     * Use potion in battle
     */
    static usePotion(player: PlayerState, healAmount: number): boolean {
        if (player.potions <= 0) return false;
        player.potions -= 1;
        player.hp = Math.min(player.hp + healAmount, player.maxHp);
        return true;
    }

    /**
     * Reset arena state
     */
    static resetArena(player: PlayerState): void {
        player.arena = {
            isActive: false,
            arenaLevel: player.arena.arenaLevel,
            currentBattle: 0,
            playerHpAtStart: player.hp,
            completedArenaLevels: player.arena.completedArenaLevels || []
        };
    }

    /**
     * Start arena run
     */
    static startArena(player: PlayerState): void {
        player.arena = {
            isActive: true,
            arenaLevel: player.arena.arenaLevel,
            currentBattle: 0,
            playerHpAtStart: player.hp,
            completedArenaLevels: player.arena.completedArenaLevels || []
        };
    }

    /**
     * Advance to next arena battle
     */
    static advanceArenaBattle(player: PlayerState): boolean {
        if (!player.arena.isActive) return false;
        player.arena.currentBattle += 1;

        // Check if arena complete (5 battles)
        if (player.arena.currentBattle >= 5) {
            player.arena.isActive = false;
            return false; // Arena complete
        }
        return true; // More battles
    }

    /**
     * Create initial player state
     */
    static createInitialPlayer(characterType: CharacterType = 'girl_knight'): PlayerState {
        return {
            name: 'Hrdina',
            characterType,
            level: 1,
            xp: 0,
            xpToNextLevel: this.getXpForLevel(1),
            hp: 10,
            maxHp: 10,
            coins: {
                copper: 0,
                silver: 0,
                gold: 0,
                pouch: 0
            },
            diamonds: {           // Multi-tier diamond inventory (legacy, migrated to crystals)
                common: 0,
                red: 0,
                green: 0
            },
            status: 'healthy',
            attack: 1,
            defense: 0,
            equippedWeapon: null,
            equippedArmor: null,
            equippedShield: null,
            equippedHelmet: null,
            readyToPromote: false,
            potions: 0,
            hasPotionSubscription: false,
            pet: null,
            unlockedPets: [],     // Enemy IDs defeated (unlocks purchase)
            ownedPets: [],        // Pet IDs player owns
            activePet: null,      // Currently equipped pet ID
            arena: {
                isActive: false,
                arenaLevel: 1,
                currentBattle: 0,
                playerHpAtStart: 10,
                completedArenaLevels: []
            },
            // === CRYSTAL & MANA SYSTEM ===
            crystals: CrystalSystem.createInitialInventory(),
            mana: ManaSystem.createInitialMana(),
            groundCrystals: [],
            defeatedBosses: [],
            // === TOWN PROGRESS ===
            townProgress: createInitialTownProgress()
        };
    }

    // === CRYSTAL MIGRATION ===

    /**
     * Create initial empty crystal inventory
     */
    static createInitialCrystals(): CrystalInventory {
        return CrystalSystem.createInitialInventory();
    }

    /**
     * Migrate old diamond inventory to new crystal system
     * Common diamonds → shards with value 5
     * Red diamonds → fragments with value 20
     * Green diamonds → prisms with value 50
     */
    static migrateDiamondsToCrystals(diamonds: DiamondInventory): Crystal[] {
        const crystals: Crystal[] = [];

        // Common diamonds → shards with value 5
        for (let i = 0; i < diamonds.common; i++) {
            crystals.push(CrystalSystem.generateCrystal('shard', 5));
        }

        // Red diamonds → fragments with value 20
        for (let i = 0; i < diamonds.red; i++) {
            crystals.push(CrystalSystem.generateCrystal('fragment', 20));
        }

        // Green diamonds → prisms with value 50
        for (let i = 0; i < diamonds.green; i++) {
            crystals.push(CrystalSystem.generateCrystal('prism', 50));
        }

        return crystals;
    }

    /**
     * Migrate player state to include crystal and mana systems
     * Called when loading old saves
     */
    static migratePlayerState(player: PlayerState): PlayerState {
        // Migrate: Add crystals if missing
        if (!player.crystals) {
            player.crystals = this.createInitialCrystals();
            // Convert old diamonds to crystals
            if (player.diamonds) {
                player.crystals.crystals = this.migrateDiamondsToCrystals(player.diamonds);
            }
        }

        // Migrate: Convert old ManaState format to number, or initialize
        // Old format was { current: number, max: number }, new format is just number
        player.mana = ManaSystem.migrateFromOldFormat(player.mana as any);

        // Migrate: Add groundCrystals if missing
        if (!player.groundCrystals) {
            player.groundCrystals = [];
        }

        // Migrate: Add defeatedBosses if missing
        if (!player.defeatedBosses) {
            player.defeatedBosses = [];
        }

        // Migrate: Convert ancient `gold: number` to `coins: CoinCurrency`
        if (!player.coins || typeof player.coins === 'number') {
            const oldGold = (player as any).gold ?? (typeof player.coins === 'number' ? player.coins : 0);
            player.coins = { copper: oldGold || 0, silver: 0, gold: 0, pouch: 0 };
            this.normalizeCoins(player);
        }

        // Migrate: Add pouch field if missing (pre-pouch saves) and re-normalize
        if ((player.coins as any).pouch === undefined) {
            (player.coins as any).pouch = 0;
            this.normalizeCoins(player);
        }

        // Migrate: Convert old coin format (smallCopper/largeCopper) to new (copper)
        if ('smallCopper' in (player.coins as any)) {
            const old = player.coins as any;
            const total = (old.smallCopper ?? 0) + (old.largeCopper ?? 0) * 2
                        + (old.silver ?? 0) * 5 + (old.gold ?? 0) * 10;
            player.coins = { copper: total, silver: 0, gold: 0, pouch: 0 };
            this.normalizeCoins(player);
        }

        // Migrate: Add waveResults to arena state if missing
        if (player.arena && !player.arena.waveResults) {
            player.arena.waveResults = [];
        }

        // Migrate: Add revealedBuildings if missing (existing save with townProgress but no revealedBuildings)
        if (player.townProgress && !player.townProgress.revealedBuildings) {
            player.townProgress.revealedBuildings = [...player.townProgress.unlockedBuildings];
        }

        // Migrate: Create trialHistory from legacy bestTrialTiers
        if (!player.trialHistory && player.bestTrialTiers) {
            const history: TrialHistory = {
                attempts: [],
                bestTiers: { ...player.bestTrialTiers },
                failedTrialLevel: null,
                retryLevel: null,
            };
            // Reconstruct approximate attempts from bestTiers
            for (const [levelStr, tier] of Object.entries(player.bestTrialTiers)) {
                const level = parseInt(levelStr);
                // Estimate correct/wrong from tier
                const estimated: Record<TrialTier, { correct: number; wrong: number }> = {
                    gold:   { correct: 10, wrong: 0 },
                    silver: { correct: 8, wrong: 2 },
                    bronze: { correct: 6, wrong: 4 },
                    none:   { correct: 0, wrong: 10 },
                };
                const est = estimated[tier];
                const rewards = this.TRIAL_TIER_REWARDS[tier];
                history.attempts.push({
                    level,
                    tier,
                    correctCount: est.correct,
                    wrongCount: est.wrong,
                    timestamp: 0, // unknown
                    isRetry: false,
                    rewardsGiven: { hp: rewards.hp, atk: rewards.atk, mana: rewards.mana },
                });
            }
            player.trialHistory = history;
        } else if (!player.trialHistory) {
            player.trialHistory = {
                attempts: [],
                bestTiers: {},
                failedTrialLevel: null,
                retryLevel: null,
            };
        }

        // Migrate: Add townProgress if missing (retroactive computation for existing saves)
        if (!player.townProgress) {
            player.townProgress = createInitialTownProgress();

            // Retroactively compute totalWavesCompleted from existing arena data
            let retroWaves = 0;
            if (player.arena?.waveResults) {
                retroWaves = player.arena.waveResults.filter(r => r?.completed).length;
            }
            // Also count completed arena levels (each = 5 waves)
            if (player.arena?.completedArenaLevels) {
                // Each completed arena level means at least 5 waves were completed
                // But waveResults only tracks current level, so add 5 per completed level
                // minus the waves already counted from current waveResults
                const completedLevels = player.arena.completedArenaLevels.length;
                if (completedLevels > 0) {
                    retroWaves = Math.max(retroWaves, completedLevels * 5);
                }
            }
            player.townProgress.totalWavesCompleted = retroWaves;

            // Auto-unlock buildings based on retroactive progress
            const hasArena1 = player.arena?.completedArenaLevels?.includes(1) ?? false;
            const hasArena2 = player.arena?.completedArenaLevels?.includes(2) ?? false;

            if (retroWaves >= 1) player.townProgress.unlockedBuildings.push('guild');
            if (retroWaves >= 2) player.townProgress.unlockedBuildings.push('witch');
            if (retroWaves >= 3) player.townProgress.unlockedBuildings.push('shop');
            if (hasArena1) player.townProgress.unlockedBuildings.push('Crystal Forge small');
            if (hasArena2) player.townProgress.unlockedBuildings.push('forest-exit');

            // Mark all retroactively unlocked buildings as revealed and visited (no NEW badges for existing players)
            player.townProgress.revealedBuildings = [...player.townProgress.unlockedBuildings];
            player.townProgress.visitedBuildings = [...player.townProgress.unlockedBuildings];
        }

        return player;
    }
}
