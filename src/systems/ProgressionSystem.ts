import { PlayerState, CoinCurrency, DiamondInventory, DiamondType, CharacterType, Crystal, CrystalInventory, TownProgress } from '../types';
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

export class ProgressionSystem {
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

        // Migrate: Ensure trialHistory exists
        if (!player.trialHistory) {
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
