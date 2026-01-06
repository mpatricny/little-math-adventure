import { PlayerState, CoinCurrency, DiamondInventory, DiamondType, CharacterType } from '../types';

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
        return coins.smallCopper + (coins.largeCopper * 2) + (coins.silver * 5) + (coins.gold * 10);
    }

    /**
     * Award 1 small copper coin (battle reward)
     */
    static awardBattleCoin(player: PlayerState): void {
        player.coins.smallCopper += 1;
    }

    /**
     * Spend coins (returns true if successful)
     */
    static spendCoins(player: PlayerState, amount: number): boolean {
        const total = this.getTotalCoinValue(player.coins);
        if (total < amount) return false;

        // Simple deduction - prioritize small coins first
        let remaining = amount;

        // Deduct from small copper first
        const smallToSpend = Math.min(player.coins.smallCopper, remaining);
        player.coins.smallCopper -= smallToSpend;
        remaining -= smallToSpend;

        // Then large copper (worth 2)
        if (remaining > 0) {
            const largeToSpend = Math.min(player.coins.largeCopper, Math.ceil(remaining / 2));
            const largeValue = largeToSpend * 2;
            player.coins.largeCopper -= largeToSpend;
            remaining -= largeValue;
        }

        // Then silver (worth 5)
        if (remaining > 0) {
            const silverToSpend = Math.min(player.coins.silver, Math.ceil(remaining / 5));
            const silverValue = silverToSpend * 5;
            player.coins.silver -= silverToSpend;
            remaining -= silverValue;
        }

        // Then gold (worth 10)
        if (remaining > 0) {
            const goldToSpend = Math.min(player.coins.gold, Math.ceil(remaining / 10));
            player.coins.gold -= goldToSpend;
        }

        // Give change back as small copper if we overpaid
        if (remaining < 0) {
            player.coins.smallCopper += Math.abs(remaining);
        }

        return true;
    }

    /**
     * Award XP to player - caps at xpToNextLevel and sets readyToPromote flag
     * No automatic level-up! Player must visit Guild for trial.
     * Returns { readyForTrial: true } if XP is now capped
     */
    static awardXp(player: PlayerState, xpAmount: number): { readyForTrial: boolean } {
        player.xp += xpAmount;

        // Check if XP reached threshold - cap it and set flag
        if (player.xp >= player.xpToNextLevel) {
            player.xp = player.xpToNextLevel;  // Cap at threshold (don't overflow)
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
     * Reset trial state without leveling up (failed trial)
     */
    static resetTrialState(player: PlayerState): void {
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
                smallCopper: 0,  // Start with 0 coins
                largeCopper: 0,
                silver: 0,
                gold: 0
            },
            diamonds: {           // Multi-tier diamond inventory
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
            }
        };
    }
}
