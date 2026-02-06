import { Crystal, CrystalTier, CrystalInventory, PlayerState } from '../types';
import Phaser from 'phaser';

/**
 * Configuration for each crystal tier
 * Tiers represent increasing value ranges and rarity
 */
export interface CrystalTierConfig {
    tier: CrystalTier;
    minValue: number;
    maxValue: number;
    emoji: string;
    color: string;
    name: string;
}

const TIER_CONFIGS: CrystalTierConfig[] = [
    // All basic tiers can have values 1-99 (forge operations create any value)
    // The tier represents the crystal TYPE, not its value range
    { tier: 'shard', minValue: 1, maxValue: 99, emoji: '💎', color: '#88ccff', name: 'Střep' },
    { tier: 'fragment', minValue: 1, maxValue: 99, emoji: '💠', color: '#ff88ff', name: 'Úlomek' },
    { tier: 'prism', minValue: 1, maxValue: 99, emoji: '🔮', color: '#ffff44', name: 'Prizma' },
    { tier: 'core', minValue: 100, maxValue: 100, emoji: '⭐', color: '#ff4444', name: 'Jádro' },
    // Special arena crystal for pet binding
    { tier: 'special_porcupine', minValue: 1, maxValue: 1, emoji: '🦔', color: '#ff8844', name: 'Bodlinčin střep' },
];

/**
 * CrystalSystem handles all crystal-related operations:
 * - Crystal generation with tier-appropriate values
 * - Inventory management (add, remove, capacity)
 * - Ground drops for overflow
 * - Crystal Forge operations (merge, split)
 */
export class CrystalSystem {
    // === GENEROVÁNÍ ===

    /**
     * Generate a new crystal with random or specified value
     * Value is clamped to tier's valid range
     */
    static generateCrystal(tier: CrystalTier, valueOverride?: number): Crystal {
        const config = this.getTierConfig(tier);
        const value = valueOverride ?? Phaser.Math.Between(config.minValue, config.maxValue);
        return {
            id: Phaser.Utils.String.UUID(),
            tier,
            value: Math.min(Math.max(value, config.minValue), config.maxValue),
            locked: false,
            createdAt: Date.now(),
        };
    }

    /**
     * Create initial empty crystal inventory
     */
    static createInitialInventory(): CrystalInventory {
        return {
            crystals: [],
            maxCapacity: 60
        };
    }

    // === INVENTÁŘ ===

    /**
     * Ensure player's inventory has correct max capacity (upgrades old saves)
     */
    static ensureInventoryCapacity(player: PlayerState): void {
        if (!player.crystals) {
            player.crystals = this.createInitialInventory();
        }
        // Upgrade old saves that had maxCapacity of 20
        if (player.crystals.maxCapacity < 60) {
            player.crystals.maxCapacity = 60;
        }
    }

    /**
     * Add crystal to player's inventory
     * Returns false if inventory is full
     */
    static addToInventory(player: PlayerState, crystal: Crystal): boolean {
        this.ensureInventoryCapacity(player);
        if (player.crystals!.crystals.length >= player.crystals!.maxCapacity) {
            return false; // Full inventory
        }
        player.crystals!.crystals.push(crystal);
        return true;
    }

    /**
     * Remove crystal from inventory by ID
     * Returns the removed crystal or null if not found
     */
    static removeFromInventory(player: PlayerState, crystalId: string): Crystal | null {
        if (!player.crystals) return null;
        const index = player.crystals.crystals.findIndex(c => c.id === crystalId);
        if (index === -1) return null;
        return player.crystals.crystals.splice(index, 1)[0];
    }

    /**
     * Get all unlocked crystals from inventory
     */
    static getUnlockedCrystals(player: PlayerState): Crystal[] {
        if (!player.crystals) return [];
        return player.crystals.crystals.filter(c => !c.locked);
    }

    /**
     * Toggle crystal lock status
     */
    static toggleLock(player: PlayerState, crystalId: string): boolean {
        if (!player.crystals) return false;
        const crystal = player.crystals.crystals.find(c => c.id === crystalId);
        if (!crystal) return false;
        crystal.locked = !crystal.locked;
        return true;
    }

    // === GROUND DROPS ===

    /**
     * Add crystals to ground (for overflow when inventory is full)
     */
    static addToGroundDrops(player: PlayerState, crystals: Crystal[]): void {
        if (!player.groundCrystals) {
            player.groundCrystals = [];
        }
        player.groundCrystals.push(...crystals);
    }

    /**
     * Collect a crystal from ground to inventory
     * Returns true if successful
     */
    static collectFromGround(player: PlayerState, crystalId: string): boolean {
        if (!player.groundCrystals) return false;
        const index = player.groundCrystals.findIndex(c => c.id === crystalId);
        if (index === -1) return false;

        const crystal = player.groundCrystals[index];
        if (!this.addToInventory(player, crystal)) {
            return false; // Full inventory
        }
        player.groundCrystals.splice(index, 1);
        return true;
    }

    /**
     * Get count of ground crystals
     */
    static getGroundCrystalCount(player: PlayerState): number {
        return player.groundCrystals?.length ?? 0;
    }

    // === FORGE VALIDACE ===

    /**
     * Validate merge operation: a + b = answer
     */
    static validateMerge(a: Crystal, b: Crystal, answer: number): boolean {
        return a.value + b.value === answer;
    }

    /**
     * Validate split operation: crystal - splitValue = answer
     * Split value must be positive and less than crystal value
     */
    static validateSplit(crystal: Crystal, splitValue: number, answer: number): boolean {
        return crystal.value - splitValue === answer && splitValue > 0 && splitValue < crystal.value;
    }

    // === FORGE PROVEDENÍ ===

    /**
     * Execute merge operation: combine two crystals into one
     * Requires correct answer to complete
     * Returns the new crystal or null if validation fails
     */
    static executeMerge(player: PlayerState, idA: string, idB: string, answer: number): Crystal | null {
        if (!player.crystals) return null;

        const a = player.crystals.crystals.find(c => c.id === idA);
        const b = player.crystals.crystals.find(c => c.id === idB);

        if (!a || !b) return null;
        if (a.locked || b.locked) return null;
        // Basic merge only works with shards (💎)
        if (a.tier !== 'shard' || b.tier !== 'shard') return null;
        if (!this.validateMerge(a, b, answer)) return null;

        // Remove input crystals
        this.removeFromInventory(player, idA);
        this.removeFromInventory(player, idB);

        // Create output crystal - keeps the same tier as inputs (basic merge doesn't change tier)
        // Tier changes require advanced operations unlocked after bosses
        const result = this.generateCrystal(a.tier, answer);
        this.addToInventory(player, result);

        return result;
    }

    /**
     * Execute split operation: divide one crystal into two
     * Requires correct answer to complete
     * Returns array of two new crystals or null if validation fails
     */
    static executeSplit(player: PlayerState, id: string, splitValue: number, answer: number): Crystal[] | null {
        if (!player.crystals) return null;

        const crystal = player.crystals.crystals.find(c => c.id === id);

        if (!crystal) return null;
        if (crystal.locked) return null;
        // Basic split only works with shards (💎)
        if (crystal.tier !== 'shard') return null;
        if (!this.validateSplit(crystal, splitValue, answer)) return null;

        // Check if we have space for 2 crystals (we remove 1, add 2 = net +1)
        if (player.crystals.crystals.length >= player.crystals.maxCapacity) {
            return null; // Need at least 1 free slot
        }

        // Remove input crystal
        this.removeFromInventory(player, id);

        // Create two output crystals
        const result1 = this.generateCrystal(crystal.tier, answer);
        const result2 = this.generateCrystal(crystal.tier, splitValue);

        this.addToInventory(player, result1);
        this.addToInventory(player, result2);

        return [result1, result2];
    }

    // === ADVANCED OPERATIONS (Boss Unlocks) ===

    /**
     * Check if player has defeated a specific boss
     */
    static hasBossDefeated(player: PlayerState, bossId: string): boolean {
        return player.defeatedBosses?.includes(bossId) ?? false;
    }

    /**
     * Check if Boss I (Slime King) is defeated - unlocks fragment operations
     */
    static hasFragmentOperationsUnlocked(player: PlayerState): boolean {
        return this.hasBossDefeated(player, 'slime_king');
    }

    /**
     * Validate create fragment operation: a + b + c = answer
     */
    static validateCreateFragment(a: Crystal, b: Crystal, c: Crystal, answer: number): boolean {
        return a.value + b.value + c.value === answer;
    }

    /**
     * Execute create fragment: combine three shards into one fragment
     * 💎 + 💎 + 💎 → 💠
     * Requires Boss I defeat to unlock
     * Returns the new fragment or null if validation fails
     */
    static executeCreateFragment(
        player: PlayerState,
        idA: string,
        idB: string,
        idC: string,
        answer: number
    ): Crystal | null {
        if (!player.crystals) return null;

        const a = player.crystals.crystals.find(c => c.id === idA);
        const b = player.crystals.crystals.find(c => c.id === idB);
        const c = player.crystals.crystals.find(c => c.id === idC);

        if (!a || !b || !c) return null;
        if (a.locked || b.locked || c.locked) return null;
        // All three must be shards
        if (a.tier !== 'shard' || b.tier !== 'shard' || c.tier !== 'shard') return null;
        if (!this.validateCreateFragment(a, b, c, answer)) return null;

        // Remove input crystals (3 shards)
        this.removeFromInventory(player, idA);
        this.removeFromInventory(player, idB);
        this.removeFromInventory(player, idC);

        // Create output fragment (net -2 crystals: remove 3, add 1)
        const result = this.generateCrystal('fragment', answer);
        this.addToInventory(player, result);

        return result;
    }

    /**
     * Validate split fragment operation: fragment = split1 + split2 + remainder
     * where remainder = fragment.value - split1 - split2 = answer
     */
    static validateSplitFragment(
        fragment: Crystal,
        split1: number,
        split2: number,
        answer: number
    ): boolean {
        const remainder = fragment.value - split1 - split2;
        return remainder === answer &&
               split1 > 0 && split2 > 0 && remainder > 0 &&
               split1 + split2 < fragment.value;
    }

    /**
     * Execute split fragment: divide one fragment into three shards
     * 💠 → 💎 + 💎 + 💎
     * Requires Boss I defeat to unlock
     * Returns array of three shards or null if validation fails
     */
    static executeSplitFragment(
        player: PlayerState,
        id: string,
        split1: number,
        split2: number,
        answer: number
    ): Crystal[] | null {
        if (!player.crystals) return null;

        const fragment = player.crystals.crystals.find(c => c.id === id);

        if (!fragment) return null;
        if (fragment.locked) return null;
        // Must be a fragment
        if (fragment.tier !== 'fragment') return null;
        if (!this.validateSplitFragment(fragment, split1, split2, answer)) return null;

        // Check inventory space (we remove 1, add 3 = net +2)
        if (player.crystals.crystals.length + 1 >= player.crystals.maxCapacity) {
            return null; // Need at least 2 free slots
        }

        // Remove input fragment
        this.removeFromInventory(player, id);

        // Create three output shards
        const shard1 = this.generateCrystal('shard', split1);
        const shard2 = this.generateCrystal('shard', split2);
        const shard3 = this.generateCrystal('shard', answer);

        this.addToInventory(player, shard1);
        this.addToInventory(player, shard2);
        this.addToInventory(player, shard3);

        return [shard1, shard2, shard3];
    }

    // === MASTER OPERATIONS (Boss II & III Unlocks) ===

    /**
     * Check if Boss II (Verdant Guardian) is defeated - unlocks refine operation
     */
    static hasRefineUnlocked(player: PlayerState): boolean {
        return this.hasBossDefeated(player, 'verdant_guardian');
    }

    /**
     * Check if Boss III (Crystal Serpent) is defeated - unlocks create prism operation
     */
    static hasPrismOperationsUnlocked(player: PlayerState): boolean {
        return this.hasBossDefeated(player, 'crystal_serpent');
    }

    /**
     * Validate refine operation: crystal - cutAmount = answer
     * Input must be fragment (💠) or prism (🔮), not shard
     * Cut amount must be positive and less than crystal value
     */
    static validateRefine(crystal: Crystal, cutAmount: number, answer: number): boolean {
        return (crystal.tier === 'fragment' || crystal.tier === 'prism') &&
               crystal.value - cutAmount === answer &&
               cutAmount > 0 && answer > 0;
    }

    /**
     * Execute refine operation: cut a piece off a fragment or prism
     * 💠(value) → 💠(answer) + 💎(cutAmount)
     * 🔮(value) → 🔮(answer) + 💎(cutAmount)
     * Requires Boss II defeat to unlock
     * Returns array [sameTierCrystal, shard] or null if validation fails
     */
    static executeRefine(
        player: PlayerState,
        id: string,
        cutAmount: number,
        answer: number
    ): Crystal[] | null {
        if (!player.crystals) return null;

        const crystal = player.crystals.crystals.find(c => c.id === id);

        if (!crystal) return null;
        if (crystal.locked) return null;
        // Must be fragment or prism (shards cannot be refined)
        if (crystal.tier !== 'fragment' && crystal.tier !== 'prism') return null;
        if (!this.validateRefine(crystal, cutAmount, answer)) return null;

        // Check inventory space (we remove 1, add 2 = net +1)
        if (player.crystals.crystals.length >= player.crystals.maxCapacity) {
            return null; // Need at least 1 free slot
        }

        // Remove input crystal
        this.removeFromInventory(player, id);

        // Create output crystals: same tier with reduced value + shard with cut amount
        const refinedCrystal = this.generateCrystal(crystal.tier, answer);
        const cutShard = this.generateCrystal('shard', cutAmount);

        this.addToInventory(player, refinedCrystal);
        this.addToInventory(player, cutShard);

        return [refinedCrystal, cutShard];
    }

    /**
     * Validate create prism operation: shard + fragment - 20 = answer
     * Shard value must be >= 10
     * Fragment value must be >= 10
     */
    static validateCreatePrism(shard: Crystal, fragment: Crystal, answer: number): boolean {
        return shard.tier === 'shard' && fragment.tier === 'fragment' &&
               shard.value >= 10 && fragment.value >= 10 &&
               shard.value + fragment.value - 20 === answer;
    }

    /**
     * Execute create prism: combine a shard and fragment into a prism
     * 💎(≥10) + 💠(≥10) → 🔮(shard + fragment - 20)
     * Requires Boss III defeat to unlock
     * Returns the new prism or null if validation fails
     */
    static executeCreatePrism(
        player: PlayerState,
        shardId: string,
        fragmentId: string,
        answer: number
    ): Crystal | null {
        if (!player.crystals) return null;

        const shard = player.crystals.crystals.find(c => c.id === shardId);
        const fragment = player.crystals.crystals.find(c => c.id === fragmentId);

        if (!shard || !fragment) return null;
        if (shard.locked || fragment.locked) return null;
        if (!this.validateCreatePrism(shard, fragment, answer)) return null;

        // Net inventory change: remove 2, add 1 = -1 (no space check needed)

        // Remove input crystals
        this.removeFromInventory(player, shardId);
        this.removeFromInventory(player, fragmentId);

        // Create output prism
        const prism = this.generateCrystal('prism', answer);
        this.addToInventory(player, prism);

        return prism;
    }

    // === UTILITY ===

    /**
     * Get tier configuration by tier name
     */
    static getTierConfig(tier: CrystalTier): CrystalTierConfig {
        return TIER_CONFIGS.find(c => c.tier === tier) || TIER_CONFIGS[0];
    }

    /**
     * Get all tier configurations
     */
    static getAllTierConfigs(): CrystalTierConfig[] {
        return [...TIER_CONFIGS];
    }

    /**
     * Determine appropriate tier for a value
     */
    static getTierForValue(value: number): CrystalTier {
        if (value >= 100) return 'core';
        if (value >= 30) return 'prism';
        if (value >= 10) return 'fragment';
        return 'shard';
    }

    /**
     * Get display string for crystal: emoji(value)
     */
    static getCrystalDisplay(crystal: Crystal): string {
        const config = this.getTierConfig(crystal.tier);
        return `${config.emoji}(${crystal.value})`;
    }

    /**
     * Calculate total value of all crystals in inventory
     */
    static getTotalInventoryValue(player: PlayerState): number {
        if (!player.crystals) return 0;
        return player.crystals.crystals.reduce((sum, c) => sum + c.value, 0);
    }

    /**
     * Get inventory capacity info
     */
    static getInventoryStatus(player: PlayerState): { current: number; max: number; isFull: boolean } {
        this.ensureInventoryCapacity(player);
        return {
            current: player.crystals!.crystals.length,
            max: player.crystals!.maxCapacity,
            isFull: player.crystals!.crystals.length >= player.crystals!.maxCapacity
        };
    }
}
