import { PlayerState } from '../types';

/**
 * ManaSystem handles mana resource for Crystal Forge operations
 *
 * Mana is a simple counter (like crystals):
 * - Earned by solving math problems in Guild (at 5/10/20 correct thresholds)
 * - Spent in Crystal Forge for merge/split operations (1 mana per operation)
 * - No maximum limit - accumulates indefinitely
 * - Starting value for new players: 3
 */
export class ManaSystem {
    /** Starting mana for new players */
    static readonly INITIAL_MANA = 3;

    /**
     * Get current mana count
     */
    static getMana(player: PlayerState): number {
        return player.mana ?? 0;
    }

    /**
     * Check if player can afford a mana cost
     */
    static canAfford(player: PlayerState, cost: number): boolean {
        return this.getMana(player) >= cost;
    }

    /**
     * Spend mana (returns true if successful)
     */
    static spend(player: PlayerState, cost: number): boolean {
        if (!this.canAfford(player, cost)) return false;
        player.mana = this.getMana(player) - cost;
        return true;
    }

    /**
     * Add mana to player (no limit)
     */
    static add(player: PlayerState, amount: number): void {
        player.mana = this.getMana(player) + amount;
    }

    /**
     * Create initial mana for new player
     */
    static createInitialMana(): number {
        return this.INITIAL_MANA;
    }

    /**
     * Migrate old ManaState format to new number format
     */
    static migrateFromOldFormat(oldMana: { current?: number; max?: number } | number | undefined): number {
        if (oldMana === undefined || oldMana === null) {
            return this.INITIAL_MANA;
        }
        if (typeof oldMana === 'number') {
            return oldMana;
        }
        // Old format: { current, max } - just use current value
        return oldMana.current ?? this.INITIAL_MANA;
    }
}
