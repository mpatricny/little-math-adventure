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
    { tier: 'shard', minValue: 1, maxValue: 20, emoji: '💎', color: '#88ccff', name: 'Střep' },
    { tier: 'fragment', minValue: 10, maxValue: 50, emoji: '💠', color: '#ff88ff', name: 'Úlomek' },
    { tier: 'prism', minValue: 30, maxValue: 99, emoji: '🔮', color: '#ffff44', name: 'Prizma' },
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
            maxCapacity: 20
        };
    }

    // === INVENTÁŘ ===

    /**
     * Add crystal to player's inventory
     * Returns false if inventory is full
     */
    static addToInventory(player: PlayerState, crystal: Crystal): boolean {
        if (!player.crystals) {
            player.crystals = this.createInitialInventory();
        }
        if (player.crystals.crystals.length >= player.crystals.maxCapacity) {
            return false; // Full inventory
        }
        player.crystals.crystals.push(crystal);
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
        if (!this.validateMerge(a, b, answer)) return null;

        // Remove input crystals
        this.removeFromInventory(player, idA);
        this.removeFromInventory(player, idB);

        // Create output crystal (use higher tier if result exceeds current tier max)
        const resultTier = this.getTierForValue(answer);
        const result = this.generateCrystal(resultTier, answer);
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
        if (!player.crystals) {
            return { current: 0, max: 20, isFull: false };
        }
        return {
            current: player.crystals.crystals.length,
            max: player.crystals.maxCapacity,
            isFull: player.crystals.crystals.length >= player.crystals.maxCapacity
        };
    }
}
