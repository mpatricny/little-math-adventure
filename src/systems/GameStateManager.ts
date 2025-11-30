import { PlayerState } from '../types';
import { ProgressionSystem } from './ProgressionSystem';
import { SaveSystem } from './SaveSystem';

/**
 * Global game state manager
 * Singleton pattern for managing player state across scenes
 */
export class GameStateManager {
    private static instance: GameStateManager;
    private player: PlayerState;

    private constructor() {
        // Try to load save, or create new player
        const saveData = SaveSystem.load();
        if (saveData) {
            this.player = saveData.player;
        } else {
            this.player = ProgressionSystem.createInitialPlayer();
        }
    }

    static getInstance(): GameStateManager {
        if (!GameStateManager.instance) {
            GameStateManager.instance = new GameStateManager();
        }
        return GameStateManager.instance;
    }

    getPlayer(): PlayerState {
        return this.player;
    }

    save(): void {
        // For now, just save player state (mathStats would come later)
        SaveSystem.save(this.player, {
            totalAttempts: 0,
            correctAnswers: 0,
            recentResults: [],
            currentDifficulty: 1,
            highestDifficulty: 1
        });
    }

    /**
     * Reset to new game
     */
    reset(): void {
        this.player = ProgressionSystem.createInitialPlayer();
        this.save();
    }
}
