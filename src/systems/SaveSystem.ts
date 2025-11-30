import { PlayerState, GameState, InventoryState, MathStats } from '../types';

const SAVE_KEY = 'littleMathAdventure_saveData';

export class SaveSystem {
    /**
     * Save game state to localStorage
     */
    static save(player: PlayerState, mathStats: MathStats): void {
        const saveData = {
            player,
            mathStats,
            timestamp: Date.now()
        };

        try {
            localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
            console.log('[SaveSystem] Game saved successfully');
        } catch (error) {
            console.error('[SaveSystem] Failed to save:', error);
        }
    }

    /**
     * Load game state from localStorage
     * Returns null if no save exists
     */
    static load(): { player: PlayerState; mathStats: MathStats } | null {
        try {
            const saveDataStr = localStorage.getItem(SAVE_KEY);
            if (!saveDataStr) {
                return null;
            }

            const saveData = JSON.parse(saveDataStr);
            console.log('[SaveSystem] Game loaded successfully');
            return {
                player: saveData.player,
                mathStats: saveData.mathStats
            };
        } catch (error) {
            console.error('[SaveSystem] Failed to load:', error);
            return null;
        }
    }

    /**
     * Check if a save exists
     */
    static hasSave(): boolean {
        return localStorage.getItem(SAVE_KEY) !== null;
    }

    /**
     * Clear save data
     */
    static clear(): void {
        localStorage.removeItem(SAVE_KEY);
        console.log('[SaveSystem] Save data cleared');
    }
}
