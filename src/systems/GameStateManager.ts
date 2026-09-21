import { PlayerState, MathStats, ProblemStats, CharacterType, MasteryData, BandId, SubAtomId, ALL_BANDS, ALL_SUB_ATOM_NUMBERS } from '../types';
import { restoreLearningPlacement } from './LearningProgress';
import { MasteryMigration } from './MasteryMigration';
import { ProgressionSystem } from './ProgressionSystem';
import { SaveSystem } from './SaveSystem';
import { createInitialComparisonChapterState, ensureComparisonChapter } from './ComparisonLearningSystem';

/** Deferred level sync — called after GameStateManager is fully constructed */
let pendingLevelSync = false;

/** Sync player level from mastery data (lazy import to break circular dependency) */
function syncPlayerLevel(): void {
    // Use dynamic import to avoid circular dependency
    import('./MasterySystem').then(({ MasterySystem }) => {
        MasterySystem.getInstance().updatePlayerLevel();
    }).catch(() => { /* MasterySystem not available */ });
}

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
    private previewSnapshot: { player: PlayerState; mathStats: MathStats; slot: number | null } | null = null;

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
                pendingLevelSync = true;
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
        // Deferred level sync: update player.level from mastery data after construction
        if (pendingLevelSync) {
            pendingLevelSync = false;
            syncPlayerLevel();
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

        // Sync player level from mastery data
        import('./MasterySystem').then(({ MasterySystem }) => {
            MasterySystem.destroyInstance(); // Force re-init with new GameStateManager data
            MasterySystem.getInstance().updatePlayerLevel();
        }).catch(() => { /* MasterySystem not available */ });

        console.log(`[GameStateManager] Loaded slot ${slotIndex}`);
        return true;
    }

    /**
     * Synchronous slot swap for co-op context switching.
     * Unlike loadSlot(), this is fully synchronous — the caller is
     * responsible for calling MasterySystem.destroyInstance() directly.
     *
     * Saves current state before loading the target slot.
     * Returns true if successful, false if slot is empty.
     */
    swapToSlot(slotIndex: number): boolean {
        // Save current state first (preserve save integrity invariant)
        this.save();

        const saveData = SaveSystem.load(slotIndex);
        if (!saveData) {
            return false;
        }

        this.activeSlotIndex = slotIndex;
        SaveSystem.setActiveSlot(slotIndex);

        this.player = saveData.player;
        if (!this.player.characterType) {
            this.player.characterType = 'girl_knight';
        }
        this.player = ProgressionSystem.migratePlayerState(this.player);
        this.mathStats = this.migrateMathStats(saveData.mathStats);

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
        if (this.previewSnapshot) return; // Menu playtests must never write a real slot.
        if (this.activeSlotIndex === null) {
            console.warn('[GameStateManager] No active slot - cannot save');
            return;
        }
        SaveSystem.save(this.activeSlotIndex, this.player, this.mathStats);
    }

    /** Isolated, disposable playtest profile; the user's active slot stays untouched. */
    beginUnderwaterPreview(): void {
        if (this.previewSnapshot) return;
        this.previewSnapshot = { player: this.player, mathStats: this.mathStats, slot: this.activeSlotIndex };
        this.player = ProgressionSystem.createInitialPlayer(this.player.characterType);
        this.player.name = 'Průzkumník';
        this.player.maxHp = this.player.hp = 24;
        this.player.attack = 8;
        // Representative, disposable exploration kit for the multi-enemy Silverpond rooms.
        this.player.equippedWeapon = 'sword_iron';
        this.player.equippedShield = 'shield_iron';
        this.player.potions = 3;
        this.mathStats = this.createInitialMathStats();
        this.activeSlotIndex = null;
    }

    /** Disposable chapter test profile used only by the development-menu shortcut. */
    beginComparisonPreview(): void {
        if (this.previewSnapshot) return;
        this.previewSnapshot = { player: this.player, mathStats: this.mathStats, slot: this.activeSlotIndex };
        this.player = ProgressionSystem.createInitialPlayer(this.player.characterType);
        this.player.name = 'Tester porovnávání';
        this.player.maxHp = this.player.hp = 24;
        this.player.attack = 1;
        this.player.equippedWeapon = null;
        this.player.equippedShield = null;
        this.player.pet = null;
        this.player.activePet = null;
        this.player.potions = 0;
        this.mathStats = this.createInitialMathStats();
        const mastery = this.getMasteryData();
        mastery.subAtoms.A1.state = 'secure';
        mastery.subAtoms.A1.examBestMedal = 'bronze';
        mastery.subAtoms.A2.state = 'secure';
        mastery.subAtoms.A2.examBestMedal = 'bronze';
        mastery.subAtoms.A3.state = 'locked';
        mastery.comparisonChapter = createInitialComparisonChapterState('training');
        this.activeSlotIndex = null;
    }

    isPreviewActive(): boolean { return this.previewSnapshot !== null; }

    endPreview(): boolean {
        if (!this.previewSnapshot) return false;
        this.player = this.previewSnapshot.player;
        this.mathStats = this.previewSnapshot.mathStats;
        this.activeSlotIndex = this.previewSnapshot.slot;
        this.previewSnapshot = null;
        return true;
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

        const masteryData = stats.masteryData
            ? this.migrateExistingMasteryData(stats.masteryData)
            : this.migrateMasteryData(stats);

        // Keep the old field readable so existing saves remain compatible.
        const migratedProblemStats: Record<string, ProblemStats> = {};
        if (stats.problemStats) {
            for (const [key, problemStats] of Object.entries(stats.problemStats)) {
                const typedStats = problemStats as ProblemStats & { diamondsCollected?: number };
                migratedProblemStats[key] = {
                    correctCount: typedStats.correctCount || 0,
                    wrongCount: typedStats.wrongCount || 0,
                    lastAttempt: typedStats.lastAttempt || 0,
                    mastered: typedStats.mastered || false,
                    // Legacy only; gameplay no longer derives mana from solve counts.
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
            masteryData,
        };
    }

    /**
     * Migrate mastery data from existing stats — if player has progress, import it
     */
    private migrateMasteryData(stats: MathStats): MasteryData {
        // If player has solved problems, try to infer level from stats
        const totalCorrect = stats.correctAnswers || 0;
        const estimatedLevel = Math.min(10, Math.max(1, Math.floor(totalCorrect / 20) + 1));

        if (estimatedLevel > 1 && Object.keys(stats.problemStats || {}).length > 0) {
            return this.migrateExistingMasteryData(MasteryMigration.migrateFromLevel(estimatedLevel, stats));
        }

        return this.createInitialMasteryData();
    }

    private migrateExistingMasteryData(data: MasteryData): MasteryData {
        restoreLearningPlacement(data);
        ensureComparisonChapter(data);
        return { ...data, coopAutoPromotionBases: data.coopAutoPromotionBases || {} };
    }

    /**
     * Create initial mastery data: Band A = Training, A1 = Training, rest locked
     */
    private createInitialMasteryData(): MasteryData {
        const bands = {} as Record<BandId, { id: BandId; state: 'locked' | 'training' | 'secure' | 'fluent' | 'mastery'; gateExamBestMedal: null; bandMasteryChallengeResult: null }>;
        const subAtoms = {} as Record<SubAtomId, { id: SubAtomId; state: 'locked' | 'training' | 'secure' | 'fluent' | 'mastery'; successfulSolves: number; examBestMedal: null; fluencyChallengeResult: null; masteryChallengeResult: null; fightsSinceSeen: number }>;

        for (const band of ALL_BANDS) {
            bands[band] = {
                id: band,
                state: band === 'A' ? 'training' : 'locked',
                gateExamBestMedal: null,
                bandMasteryChallengeResult: null,
            };

            for (const num of ALL_SUB_ATOM_NUMBERS) {
                const subAtomId = `${band}${num}` as SubAtomId;
                subAtoms[subAtomId] = {
                    id: subAtomId,
                    state: (band === 'A' && num === 1) ? 'training' : 'locked',
                    successfulSolves: 0,
                    examBestMedal: null,
                    fluencyChallengeResult: null,
                    masteryChallengeResult: null,
                    fightsSinceSeen: 0,
                };
            }
        }

        return {
            bands,
            subAtoms,
            problemRecords: {},
            globalSolveSequence: 0,
            fightCount: 0,
            retryPool: [],
            slowPool: [],
            currentPool: [],
            currentPoolIndex: 0,
            lastPoolProblems: [],
            lastStruggleOfferFight: 0,
            coopAutoPromotionBases: {},
            comparisonChapter: createInitialComparisonChapterState(),
        };
    }

    /**
     * Get mastery data (creates if missing)
     */
    getMasteryData(): MasteryData {
        if (!this.mathStats.masteryData) {
            this.mathStats.masteryData = this.createInitialMasteryData();
        }
        return this.mathStats.masteryData;
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
