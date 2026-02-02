import { GameStateManager } from './GameStateManager';

/**
 * Journey encounter types
 */
export type EncounterType = 'battle' | 'rest' | 'puzzle' | 'chest' | 'boss';

export interface Encounter {
    type: EncounterType;
    enemy?: string;
    healPercent?: number;
    isSavePoint?: boolean;
    name?: string;
    nameCs?: string;
    puzzleId?: string;
    gold?: number;
    potionRefill?: boolean;
    optional?: boolean;
}

export interface JourneyStage {
    id: string;
    name: string;
    nameCs: string;
    background: string;
    encounters: Encounter[];
}

export interface JourneyConfig {
    id: string;
    name: string;
    nameCs: string;
    requirements: {
        minLevel: number;
        arenaLevel: number;
        supplyCost: number;
    };
    stages: JourneyStage[];
    rewards: {
        unlock: string;
        unlockMessage: string;
        unlockMessageCs: string;
    };
}

export interface JourneyState {
    journeyId: string;
    currentStage: number;
    currentEncounter: number;
    journeyHp: number;
    journeyMaxHp: number;
    lastSavePoint: {
        stage: number;
        encounter: number;
        hp: number;
    } | null;
    completed: boolean;
    failed: boolean;
    startedAt: number;
    totalXp: number;
    totalGold: number;
    totalDiamonds: number;
}

/**
 * JourneySystem - Manages journey progress through multi-stage adventures
 * 
 * Features:
 * - Track progress through stages and encounters
 * - Save points at rest locations
 * - HP tracking separate from main player HP during journey
 * - Resume from last save point if failed
 */
export class JourneySystem {
    private static instance: JourneySystem;
    private gameState = GameStateManager.getInstance();
    private currentJourney: JourneyState | null = null;
    private journeyConfig: JourneyConfig | null = null;

    private constructor() {}

    static getInstance(): JourneySystem {
        if (!JourneySystem.instance) {
            JourneySystem.instance = new JourneySystem();
        }
        return JourneySystem.instance;
    }

    /**
     * Calculate total gold from coin currency
     */
    private getTotalGold(player: { coins?: { gold?: number; silver?: number; largeCopper?: number; smallCopper?: number } }): number {
        return (player.coins?.gold ?? 0) * 10 + 
               (player.coins?.silver ?? 0) * 5 + 
               (player.coins?.largeCopper ?? 0) * 2 + 
               (player.coins?.smallCopper ?? 0);
    }

    /**
     * Check if player meets journey requirements
     */
    canStartJourney(config: JourneyConfig): { canStart: boolean; reason?: string } {
        const player = this.gameState.getPlayer();
        const totalGold = this.getTotalGold(player);
        
        if (player.level < config.requirements.minLevel) {
            return { 
                canStart: false, 
                reason: `Level ${config.requirements.minLevel} required (you are level ${player.level})` 
            };
        }

        if ((player.arena?.arenaLevel ?? 0) < config.requirements.arenaLevel) {
            return { 
                canStart: false, 
                reason: `Arena level ${config.requirements.arenaLevel} required` 
            };
        }

        if (totalGold < config.requirements.supplyCost) {
            return { 
                canStart: false, 
                reason: `${config.requirements.supplyCost} gold required for supplies` 
            };
        }

        return { canStart: true };
    }

    /**
     * Start a new journey
     */
    startJourney(config: JourneyConfig, debugMode = false): boolean {
        const player = this.gameState.getPlayer();

        // Check requirements (skip in debug mode)
        if (!debugMode) {
            const check = this.canStartJourney(config);
            if (!check.canStart) {
                console.warn('Cannot start journey:', check.reason);
                return false;
            }

            // Deduct supply cost from coins (prefer small denominations)
            let remaining = config.requirements.supplyCost;
            if (player.coins) {
                // Take from small copper first
                const fromSmall = Math.min(player.coins.smallCopper ?? 0, remaining);
                player.coins.smallCopper = (player.coins.smallCopper ?? 0) - fromSmall;
                remaining -= fromSmall;

                // Then large copper (worth 2)
                const fromLarge = Math.min(player.coins.largeCopper ?? 0, Math.floor(remaining / 2));
                player.coins.largeCopper = (player.coins.largeCopper ?? 0) - fromLarge;
                remaining -= fromLarge * 2;

                // Then silver (worth 5)
                const fromSilver = Math.min(player.coins.silver ?? 0, Math.floor(remaining / 5));
                player.coins.silver = (player.coins.silver ?? 0) - fromSilver;
                remaining -= fromSilver * 5;

                // Then gold (worth 10)
                const fromGold = Math.min(player.coins.gold ?? 0, Math.ceil(remaining / 10));
                player.coins.gold = (player.coins.gold ?? 0) - fromGold;
            }
        }

        this.journeyConfig = config;
        this.currentJourney = {
            journeyId: config.id,
            currentStage: 0,
            currentEncounter: 0,
            journeyHp: player.hp,
            journeyMaxHp: player.maxHp,
            lastSavePoint: null,
            completed: false,
            failed: false,
            startedAt: Date.now(),
            totalXp: 0,
            totalGold: 0,
            totalDiamonds: 0
        };

        // Save initial state as first save point
        this.createSavePoint();

        console.log(`Started journey: ${config.name}`);
        return true;
    }

    /**
     * Check if there's an active journey
     */
    hasActiveJourney(): boolean {
        return this.currentJourney !== null && !this.currentJourney.completed && !this.currentJourney.failed;
    }

    /**
     * Get current journey state
     */
    getJourneyState(): JourneyState | null {
        return this.currentJourney;
    }

    /**
     * Get journey config
     */
    getJourneyConfig(): JourneyConfig | null {
        return this.journeyConfig;
    }

    /**
     * Get current stage
     */
    getCurrentStage(): JourneyStage | null {
        if (!this.currentJourney || !this.journeyConfig) return null;
        return this.journeyConfig.stages[this.currentJourney.currentStage] ?? null;
    }

    /**
     * Get current encounter
     */
    getCurrentEncounter(): Encounter | null {
        const stage = this.getCurrentStage();
        if (!stage || !this.currentJourney) return null;
        return stage.encounters[this.currentJourney.currentEncounter] ?? null;
    }

    /**
     * Get total progress (0-1)
     */
    getProgress(): number {
        if (!this.currentJourney || !this.journeyConfig) return 0;
        
        let totalEncounters = 0;
        let completedEncounters = 0;

        for (let s = 0; s < this.journeyConfig.stages.length; s++) {
            const stage = this.journeyConfig.stages[s];
            totalEncounters += stage.encounters.length;

            if (s < this.currentJourney.currentStage) {
                completedEncounters += stage.encounters.length;
            } else if (s === this.currentJourney.currentStage) {
                completedEncounters += this.currentJourney.currentEncounter;
            }
        }

        return totalEncounters > 0 ? completedEncounters / totalEncounters : 0;
    }

    /**
     * Create a save point at current position
     */
    createSavePoint(): void {
        if (!this.currentJourney) return;

        this.currentJourney.lastSavePoint = {
            stage: this.currentJourney.currentStage,
            encounter: this.currentJourney.currentEncounter,
            hp: this.currentJourney.journeyHp
        };

        console.log(`Save point created at stage ${this.currentJourney.currentStage}, encounter ${this.currentJourney.currentEncounter}`);
    }

    /**
     * Advance to the next encounter
     * Returns true if journey continues, false if completed
     */
    advanceEncounter(): boolean {
        if (!this.currentJourney || !this.journeyConfig) return false;

        const currentStage = this.journeyConfig.stages[this.currentJourney.currentStage];
        
        // Move to next encounter
        this.currentJourney.currentEncounter++;

        // Check if stage is complete
        if (this.currentJourney.currentEncounter >= currentStage.encounters.length) {
            // Move to next stage
            this.currentJourney.currentStage++;
            this.currentJourney.currentEncounter = 0;

            // Check if journey is complete
            if (this.currentJourney.currentStage >= this.journeyConfig.stages.length) {
                this.completeJourney();
                return false;
            }
        }

        return true;
    }

    /**
     * Apply damage to journey HP
     */
    applyDamage(amount: number): void {
        if (!this.currentJourney) return;

        this.currentJourney.journeyHp = Math.max(0, this.currentJourney.journeyHp - amount);

        if (this.currentJourney.journeyHp <= 0) {
            this.failJourney();
        }
    }

    /**
     * Apply healing (percentage of max HP)
     */
    applyHeal(percent: number): void {
        if (!this.currentJourney) return;

        const healAmount = Math.floor(this.currentJourney.journeyMaxHp * (percent / 100));
        this.currentJourney.journeyHp = Math.min(
            this.currentJourney.journeyMaxHp,
            this.currentJourney.journeyHp + healAmount
        );
    }

    /**
     * Add rewards (XP, gold, diamonds)
     */
    addRewards(xp: number, gold: number, diamonds = 0): void {
        if (!this.currentJourney) return;

        this.currentJourney.totalXp += xp;
        this.currentJourney.totalGold += gold;
        this.currentJourney.totalDiamonds += diamonds;
    }

    /**
     * Get current journey HP
     */
    getJourneyHp(): number {
        return this.currentJourney?.journeyHp ?? 0;
    }

    /**
     * Get journey max HP
     */
    getJourneyMaxHp(): number {
        return this.currentJourney?.journeyMaxHp ?? 0;
    }

    /**
     * Handle rest encounter - heal and possibly save
     */
    handleRestEncounter(encounter: Encounter): void {
        if (!this.currentJourney) return;

        // Apply healing
        if (encounter.healPercent) {
            this.applyHeal(encounter.healPercent);
        }

        // Create save point if marked
        if (encounter.isSavePoint) {
            this.createSavePoint();
        }
    }

    /**
     * Handle chest encounter - add gold
     */
    handleChestEncounter(encounter: Encounter): void {
        if (!this.currentJourney) return;

        if (encounter.gold) {
            this.addRewards(0, encounter.gold);
        }
    }

    /**
     * Mark journey as failed
     */
    private failJourney(): void {
        if (!this.currentJourney) return;

        this.currentJourney.failed = true;
        console.log('Journey failed!');
    }

    /**
     * Resume from last save point
     */
    resumeFromSavePoint(): boolean {
        if (!this.currentJourney || !this.currentJourney.lastSavePoint) {
            return false;
        }

        const savePoint = this.currentJourney.lastSavePoint;
        this.currentJourney.currentStage = savePoint.stage;
        this.currentJourney.currentEncounter = savePoint.encounter;
        this.currentJourney.journeyHp = savePoint.hp;
        this.currentJourney.failed = false;

        console.log(`Resumed from save point at stage ${savePoint.stage}, encounter ${savePoint.encounter}`);
        return true;
    }

    /**
     * Complete the journey
     */
    private completeJourney(): void {
        if (!this.currentJourney || !this.journeyConfig) return;

        this.currentJourney.completed = true;

        // Apply accumulated rewards to player
        const player = this.gameState.getPlayer();
        player.xp += this.currentJourney.totalXp;
        
        // Add gold to coins (as small copper for now)
        if (player.coins) {
            player.coins.smallCopper = (player.coins.smallCopper ?? 0) + this.currentJourney.totalGold;
        }
        
        // Add diamonds to crystal inventory
        if (this.currentJourney.totalDiamonds > 0) {
            // TODO: Add crystals via CrystalSystem
        }

        // Mark region as unlocked (store in a registry or game state)
        // For now, just log it - proper implementation depends on how regions are tracked
        if (this.journeyConfig.rewards.unlock) {
            console.log(`Unlocked region: ${this.journeyConfig.rewards.unlock}`);
            // TODO: Store unlocked regions in GameStateManager or separate registry
        }

        // Restore player HP to journey HP (survived amount)
        player.hp = this.currentJourney.journeyHp;

        console.log(`Journey completed! XP: ${this.currentJourney.totalXp}, Gold: ${this.currentJourney.totalGold}`);
    }

    /**
     * Abandon the journey (go back to village)
     */
    abandonJourney(): void {
        this.currentJourney = null;
        this.journeyConfig = null;
        console.log('Journey abandoned');
    }

    /**
     * Check if player is at boss encounter
     */
    isAtBoss(): boolean {
        const encounter = this.getCurrentEncounter();
        return encounter?.type === 'boss';
    }

    /**
     * Get journey summary for UI
     */
    getJourneySummary(): {
        stageName: string;
        stageNameCs: string;
        encounterIndex: number;
        totalEncounters: number;
        hp: number;
        maxHp: number;
        progress: number;
    } | null {
        const stage = this.getCurrentStage();
        if (!stage || !this.currentJourney) return null;

        return {
            stageName: stage.name,
            stageNameCs: stage.nameCs,
            encounterIndex: this.currentJourney.currentEncounter + 1,
            totalEncounters: stage.encounters.length,
            hp: this.currentJourney.journeyHp,
            maxHp: this.currentJourney.journeyMaxHp,
            progress: this.getProgress()
        };
    }
}
