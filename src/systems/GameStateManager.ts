import { PlayerState, MathStats, ProblemStats, CharacterType } from '../types';
import { ProgressionSystem } from './ProgressionSystem';
import { SaveSystem } from './SaveSystem';

/**
 * Global game state manager
 * Singleton pattern for managing ALL game state across scenes
 * Includes player state, math stats, and any other persistent data
 *
 * Now supports multi-slot saves via activeSlotIndex
 */
export class GameStateManager {
    private static instance: GameStateManager;
    private player: PlayerState;
    private mathStats: MathStats;
    private activeSlotIndex: number | null = null;

    private constructor() {
        // Try to load from active slot, or create new game state
        const activeSlot = SaveSystem.getActiveSlot();

        if (activeSlot !== null) {
            const saveData = SaveSystem.load(activeSlot);
            if (saveData) {
                this.activeSlotIndex = activeSlot;
                this.player = saveData.player;
                // Migration: add characterType if missing (default to girl_knight for existing saves)
                if (!this.player.characterType) {
                    this.player.characterType = 'girl_knight';
                }
                // Migration: add crystal and mana systems if missing
                this.player = ProgressionSystem.migratePlayerState(this.player);
                this.mathStats = this.migrateMathStats(saveData.mathStats);
                return;
            }
        }

        // No active slot or slot is empty - create fresh state
        // (actual slot selection happens via loadSlot or reset)
        this.player = ProgressionSystem.createInitialPlayer();
        this.mathStats = this.createInitialMathStats();
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
     * Get the currently active save slot index
     */
    getActiveSlotIndex(): number | null {
        return this.activeSlotIndex;
    }

    /**
     * Set the active save slot index
     * Does NOT load data - use loadSlot() for that
     */
    setActiveSlotIndex(slotIndex: number): void {
        this.activeSlotIndex = slotIndex;
        SaveSystem.setActiveSlot(slotIndex);
    }

    /**
     * Load data from a specific save slot
     * Returns true if successful, false if slot is empty
     */
    loadSlot(slotIndex: number): boolean {
        const saveData = SaveSystem.load(slotIndex);

        if (!saveData) {
            return false;
        }

        this.activeSlotIndex = slotIndex;
        SaveSystem.setActiveSlot(slotIndex);

        this.player = saveData.player;
        // Migration: add characterType if missing
        if (!this.player.characterType) {
            this.player.characterType = 'girl_knight';
        }
        // Migration: add crystal and mana systems if missing
        this.player = ProgressionSystem.migratePlayerState(this.player);

        this.mathStats = this.migrateMathStats(saveData.mathStats);

        console.log(`[GameStateManager] Loaded slot ${slotIndex}`);
        return true;
    }

    /**
     * Check if a slot is currently loaded
     */
    isSlotLoaded(): boolean {
        return this.activeSlotIndex !== null;
    }

    /**
     * Update math stats (called by MathEngine)
     */
    setMathStats(stats: MathStats): void {
        this.mathStats = stats;
    }

    /**
     * Save to the currently active slot
     */
    save(): void {
        if (this.activeSlotIndex === null) {
            console.warn('[GameStateManager] No active slot - cannot save');
            return;
        }
        SaveSystem.save(this.activeSlotIndex, this.player, this.mathStats);
    }

    /**
     * Reset to new game state for a specific slot
     * @param characterType Character type for new game (defaults to girl_knight)
     * @param characterName Character name for new game (defaults to 'Hrdina')
     * @param slotIndex Optional slot index (uses active slot if not provided)
     */
    reset(characterType: CharacterType = 'girl_knight', characterName: string = 'Hrdina', slotIndex?: number): void {
        // Use provided slot or active slot
        const targetSlot = slotIndex ?? this.activeSlotIndex;

        if (targetSlot === null) {
            console.error('[GameStateManager] No slot specified for reset');
            return;
        }

        // Create fresh player with name
        this.player = ProgressionSystem.createInitialPlayer(characterType);
        this.player.name = characterName;
        this.mathStats = this.createInitialMathStats();

        // Set active slot and save
        this.activeSlotIndex = targetSlot;
        SaveSystem.setActiveSlot(targetSlot);
        this.save();

        console.log(`[GameStateManager] Game reset to slot ${targetSlot} with character "${characterName}"`);
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
            dailyAttempts: 0,
            lastAttemptDate: '',
        };
    }

    /**
     * Migrate old math stats format to new format
     */
    private migrateMathStats(stats: MathStats | null | undefined): MathStats {
        if (!stats) {
            return this.createInitialMathStats();
        }

        // Migrate problemStats to include manaCollected if missing
        // Also migrate old diamondsCollected → manaCollected
        const migratedProblemStats: Record<string, ProblemStats> = {};
        if (stats.problemStats) {
            for (const [key, problemStats] of Object.entries(stats.problemStats)) {
                const typedStats = problemStats as ProblemStats & { diamondsCollected?: number };
                migratedProblemStats[key] = {
                    correctCount: typedStats.correctCount || 0,
                    wrongCount: typedStats.wrongCount || 0,
                    lastAttempt: typedStats.lastAttempt || 0,
                    mastered: typedStats.mastered || false,
                    // Migrate diamondsCollected → manaCollected (backwards compatibility)
                    manaCollected: typedStats.manaCollected ?? typedStats.diamondsCollected ?? 0,
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
            dailyAttempts: stats.dailyAttempts || 0,
            lastAttemptDate: stats.lastAttemptDate || '',
        };
    }

    /**
     * Force reload from storage (useful after external changes)
     */
    reload(): void {
        if (this.activeSlotIndex === null) {
            console.warn('[GameStateManager] No active slot - cannot reload');
            return;
        }

        const saveData = SaveSystem.load(this.activeSlotIndex);
        if (saveData) {
            this.player = saveData.player;
            // Migration: add crystal and mana systems if missing
            this.player = ProgressionSystem.migratePlayerState(this.player);
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
