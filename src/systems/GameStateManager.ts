import { PlayerState, MathStats, ProblemStats } from '../types';
import { ProgressionSystem } from './ProgressionSystem';
import { SaveSystem } from './SaveSystem';

/**
 * Global game state manager
 * Singleton pattern for managing ALL game state across scenes
 * Includes player state, math stats, and any other persistent data
 */
export class GameStateManager {
    private static instance: GameStateManager;
    private player: PlayerState;
    private mathStats: MathStats;

    private constructor() {
        // Try to load save, or create new game state
        const saveData = SaveSystem.load();
        if (saveData) {
            this.player = saveData.player;
            this.mathStats = this.migrateMathStats(saveData.mathStats);
        } else {
            // Check for old separate mathStats (migration from old save format)
            const oldMathStats = this.loadOldMathStats();

            this.player = ProgressionSystem.createInitialPlayer();
            this.mathStats = oldMathStats || this.createInitialMathStats();

            // Save immediately to unify the data
            if (oldMathStats) {
                this.cleanupOldStorage();
                SaveSystem.save(this.player, this.mathStats);
                console.log('[GameStateManager] Migrated old mathStats to unified save');
            }
        }
    }

    /**
     * Load old mathStats from separate localStorage key (for migration)
     */
    private loadOldMathStats(): MathStats | null {
        try {
            const savedStr = localStorage.getItem('littleMathAdventure_mathStats');
            if (savedStr) {
                const saved = JSON.parse(savedStr);
                return this.migrateMathStats(saved);
            }
        } catch (error) {
            console.warn('[GameStateManager] Could not load old mathStats:', error);
        }
        return null;
    }

    /**
     * Clean up old localStorage keys after migration
     */
    private cleanupOldStorage(): void {
        try {
            localStorage.removeItem('littleMathAdventure_mathStats');
            localStorage.removeItem('littleMathAdventure_player'); // Old player key if exists
            console.log('[GameStateManager] Cleaned up old storage keys');
        } catch (error) {
            console.warn('[GameStateManager] Could not clean up old storage:', error);
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

    getMathStats(): MathStats {
        return this.mathStats;
    }

    /**
     * Update math stats (called by MathEngine)
     */
    setMathStats(stats: MathStats): void {
        this.mathStats = stats;
    }

    save(): void {
        SaveSystem.save(this.player, this.mathStats);
    }

    /**
     * Reset to new game - clears ALL data
     */
    reset(): void {
        this.player = ProgressionSystem.createInitialPlayer();
        this.mathStats = this.createInitialMathStats();

        // Clear ALL localStorage keys related to the game
        SaveSystem.clear();

        // Also clear the old mathStats key if it exists (migration cleanup)
        try {
            localStorage.removeItem('littleMathAdventure_mathStats');
        } catch (e) {
            console.warn('[GameStateManager] Could not clear old mathStats key');
        }

        // Save the fresh state
        this.save();

        console.log('[GameStateManager] Game reset complete - all data cleared');
    }

    /**
     * Create initial empty math stats
     */
    private createInitialMathStats(): MathStats {
        return {
            totalAttempts: 0,
            correctAnswers: 0,
            recentResults: [],
            currentDifficulty: 1,
            highestDifficulty: 1,
            problemStats: {},
            currentPool: [],
            poolCycle: 0,
        };
    }

    /**
     * Migrate old math stats format to new format
     */
    private migrateMathStats(stats: MathStats | null | undefined): MathStats {
        if (!stats) {
            return this.createInitialMathStats();
        }

        // Migrate problemStats to include diamondsCollected if missing
        const migratedProblemStats: Record<string, ProblemStats> = {};
        if (stats.problemStats) {
            for (const [key, problemStats] of Object.entries(stats.problemStats)) {
                const typedStats = problemStats as ProblemStats;
                migratedProblemStats[key] = {
                    correctCount: typedStats.correctCount || 0,
                    wrongCount: typedStats.wrongCount || 0,
                    lastAttempt: typedStats.lastAttempt || 0,
                    mastered: typedStats.mastered || false,
                    diamondsCollected: typedStats.diamondsCollected || 0,
                };
            }
        }

        return {
            totalAttempts: stats.totalAttempts || 0,
            correctAnswers: stats.correctAnswers || 0,
            recentResults: stats.recentResults || [],
            currentDifficulty: stats.currentDifficulty || 1,
            highestDifficulty: stats.highestDifficulty || 1,
            problemStats: migratedProblemStats,
            currentPool: stats.currentPool || [],
            poolCycle: stats.poolCycle || 0,
        };
    }

    /**
     * Force reload from storage (useful after external changes)
     */
    reload(): void {
        const saveData = SaveSystem.load();
        if (saveData) {
            this.player = saveData.player;
            this.mathStats = this.migrateMathStats(saveData.mathStats);
        }
    }

    /**
     * Destroy the singleton instance (for testing or full reset)
     */
    static destroyInstance(): void {
        GameStateManager.instance = null as any;
    }
}
