import { StoryProgress } from '../types';
import { GameStateManager } from './GameStateManager';

/**
 * StorySystem - Manages story progress tracking for visual storytelling
 *
 * This singleton tracks which story milestones the player has seen,
 * enabling picture dialogs to be shown at appropriate times and
 * skipped on subsequent playthroughs.
 *
 * Design Philosophy:
 * - Story flags are persisted to PlayerState via GameStateManager
 * - Flags are one-way: once set to true, they stay true
 * - The system is queried before showing picture dialogs
 */
export class StorySystem {
    private static instance: StorySystem;

    private constructor() {}

    static getInstance(): StorySystem {
        if (!StorySystem.instance) {
            StorySystem.instance = new StorySystem();
        }
        return StorySystem.instance;
    }

    /**
     * Get the current story progress, initializing if needed
     */
    getProgress(): StoryProgress {
        const player = GameStateManager.getInstance().getPlayer();

        if (!player.storyProgress) {
            player.storyProgress = this.createInitialProgress();
        }

        return player.storyProgress;
    }

    /**
     * Create initial story progress with all flags false
     */
    private createInitialProgress(): StoryProgress {
        return {
            hasCompletedIntro: false,
            hasSeenArenaExplanation: false,
            hasSeenPetUnlockHint: false,
            hasSeenShopHint: false,
            hasSeenForgeIntro: false,
            hasSeenPythiaIntro: false,
            hasSeenPostArena1: false,
            hasSeenPostArena2: false,
        };
    }

    /**
     * Check if the intro (comic + crash site tutorial) has been completed
     */
    hasCompletedIntro(): boolean {
        return this.getProgress().hasCompletedIntro;
    }

    /**
     * Mark the intro as completed
     * Called when player finishes the crash site tutorial
     */
    completeIntro(): void {
        const progress = this.getProgress();
        progress.hasCompletedIntro = true;
        this.save();
    }

    /**
     * Check if a specific story flag is set
     */
    hasSeenFlag(flag: keyof StoryProgress): boolean {
        return this.getProgress()[flag];
    }

    /**
     * Set a story flag to true
     * Flags are one-way - once true, they stay true
     */
    setFlag(flag: keyof StoryProgress): void {
        const progress = this.getProgress();
        progress[flag] = true;
        this.save();
    }

    /**
     * Mark arena explanation as shown
     * Called after first arena battle
     */
    markArenaExplanationSeen(): void {
        this.setFlag('hasSeenArenaExplanation');
    }

    /**
     * Mark pet unlock hint as shown
     * Called after first pet is freed
     */
    markPetUnlockHintSeen(): void {
        this.setFlag('hasSeenPetUnlockHint');
    }

    /**
     * Mark shop hint as shown
     * Called when player can afford equipment
     */
    markShopHintSeen(): void {
        this.setFlag('hasSeenShopHint');
    }

    /**
     * Mark forge intro as shown
     * Called on first Crystal Forge visit
     */
    markForgeIntroSeen(): void {
        this.setFlag('hasSeenForgeIntro');
    }

    /**
     * Mark Pythia intro as shown
     * Called on first Pythia's Workshop visit
     */
    markPythiaIntroSeen(): void {
        this.setFlag('hasSeenPythiaIntro');
    }

    /**
     * Mark post-Arena 1 story as shown
     */
    markPostArena1Seen(): void {
        this.setFlag('hasSeenPostArena1');
    }

    /**
     * Mark post-Arena 2 story as shown
     */
    markPostArena2Seen(): void {
        this.setFlag('hasSeenPostArena2');
    }

    /**
     * Persist story progress to game state
     */
    private save(): void {
        GameStateManager.getInstance().save();
    }

    /**
     * Reset all story progress (used for testing or new game)
     */
    resetProgress(): void {
        const player = GameStateManager.getInstance().getPlayer();
        player.storyProgress = this.createInitialProgress();
        this.save();
    }
}
