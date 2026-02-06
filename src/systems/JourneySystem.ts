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

/**
 * State for a single interactive object in a room
 */
export interface ObjectState {
    interacted: boolean;      // Has been clicked/approached
    defeated?: boolean;       // For enemies: was defeated in battle
    looted?: boolean;         // For chests: has been opened
    completed?: boolean;      // For puzzles: was solved
}

/**
 * Room states track which objects have been interacted with
 */
export interface RoomStates {
    [roomId: string]: {
        [objectId: string]: ObjectState;
    };
}

export interface JourneyState {
    journeyId: string;
    currentStage: number;
    currentEncounter: number;
    lastSavePoint: {
        stage: number;
        encounter: number;
        hp: number;  // Player HP at save point
        room?: string;  // Room ID at save point (for room-based journeys)
    } | null;
    completed: boolean;
    failed: boolean;
    startedAt: number;
    totalXp: number;
    totalGold: number;
    totalDiamonds: number;

    // Room-based exploration fields
    currentRoom?: string;              // Current room ID (for room-based journeys)
    roomStates?: RoomStates;           // Object states per room
    unlockedWaypoints?: string[];      // IDs of unlocked rest waypoints
}

/**
 * JourneySystem - Manages journey progress through multi-stage adventures
 *
 * Features:
 * - Track progress through stages and encounters
 * - Save points at rest locations (saves player HP at that moment)
 * - Uses player's real HP (no separate journey HP)
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
            lastSavePoint: null,
            completed: false,
            failed: false,
            startedAt: Date.now(),
            totalXp: 0,
            totalGold: 0,
            totalDiamonds: 0
        };

        // Save initial state as first save point (stores current player HP)
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

        const player = this.gameState.getPlayer();
        this.currentJourney.lastSavePoint = {
            stage: this.currentJourney.currentStage,
            encounter: this.currentJourney.currentEncounter,
            hp: player.hp  // Save current player HP
        };

        console.log(`Save point created at stage ${this.currentJourney.currentStage}, encounter ${this.currentJourney.currentEncounter}, HP: ${player.hp}`);
    }

    /**
     * Advance to the next encounter
     * Returns true if journey continues, false if completed
     */
    advanceEncounter(): boolean {
        if (!this.currentJourney || !this.journeyConfig) return false;

        const currentStage = this.journeyConfig.stages[this.currentJourney.currentStage];
        const prevStageIdx = this.currentJourney.currentStage;
        const prevEncounterIdx = this.currentJourney.currentEncounter;

        // Move to next encounter
        this.currentJourney.currentEncounter++;

        // Check if stage is complete
        if (this.currentJourney.currentEncounter >= currentStage.encounters.length) {
            // Move to next stage
            this.currentJourney.currentStage++;
            this.currentJourney.currentEncounter = 0;

            console.log(`[JourneySystem] Stage ${prevStageIdx} complete! Moving to stage ${this.currentJourney.currentStage}`);

            // Check if journey is complete
            if (this.currentJourney.currentStage >= this.journeyConfig.stages.length) {
                console.log(`[JourneySystem] All ${this.journeyConfig.stages.length} stages complete! Journey finished.`);
                this.completeJourney();
                return false;
            }
        } else {
            console.log(`[JourneySystem] Advanced: Stage ${this.currentJourney.currentStage}, Encounter ${prevEncounterIdx} → ${this.currentJourney.currentEncounter}`);
        }

        return true;
    }

    /**
     * Apply damage to player HP (used during journey)
     */
    applyDamage(amount: number): void {
        if (!this.currentJourney) return;

        const player = this.gameState.getPlayer();
        player.hp = Math.max(0, player.hp - amount);

        if (player.hp <= 0) {
            this.failJourney();
        }
    }

    /**
     * Apply healing (percentage of max HP) directly to player
     */
    applyHeal(percent: number): void {
        if (!this.currentJourney) return;

        const player = this.gameState.getPlayer();
        const healAmount = Math.floor(player.maxHp * (percent / 100));
        player.hp = Math.min(player.maxHp, player.hp + healAmount);

        // Save game to persist the healing
        this.gameState.save();
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
     * Get current HP (player's actual HP)
     */
    getJourneyHp(): number {
        if (!this.currentJourney) return 0;
        return this.gameState.getPlayer().hp;
    }

    /**
     * Get max HP (player's actual max HP)
     */
    getJourneyMaxHp(): number {
        if (!this.currentJourney) return 0;
        return this.gameState.getPlayer().maxHp;
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
        this.currentJourney.failed = false;

        // Restore player HP to what it was at the save point
        const player = this.gameState.getPlayer();
        player.hp = savePoint.hp;
        this.gameState.save();

        console.log(`Resumed from save point at stage ${savePoint.stage}, encounter ${savePoint.encounter}, HP restored to ${savePoint.hp}`);
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

        // Player HP is already at current value (no sync needed - we use player HP directly)
        this.gameState.save();

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

        const player = this.gameState.getPlayer();
        return {
            stageName: stage.name,
            stageNameCs: stage.nameCs,
            encounterIndex: this.currentJourney.currentEncounter + 1,
            totalEncounters: stage.encounters.length,
            hp: player.hp,
            maxHp: player.maxHp,
            progress: this.getProgress()
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ROOM-BASED EXPLORATION METHODS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Start a room-based journey (no stages/encounters, uses rooms instead)
     */
    startRoomJourney(journeyId: string, startRoom: string, debugMode = false): boolean {
        // For room-based journeys, we don't need JourneyConfig with stages
        // Just initialize the state with room tracking
        this.currentJourney = {
            journeyId,
            currentStage: 0,
            currentEncounter: 0,
            lastSavePoint: null,
            completed: false,
            failed: false,
            startedAt: Date.now(),
            totalXp: 0,
            totalGold: 0,
            totalDiamonds: 0,
            // Room-based fields
            currentRoom: startRoom,
            roomStates: {},
            unlockedWaypoints: []
        };

        // Create initial save point
        this.createRoomSavePoint();

        console.log(`Started room-based journey: ${journeyId}, starting room: ${startRoom}`);
        return true;
    }

    /**
     * Set current room ID
     */
    setCurrentRoom(roomId: string): void {
        if (!this.currentJourney) return;
        this.currentJourney.currentRoom = roomId;
        console.log(`[JourneySystem] Moved to room: ${roomId}`);
    }

    /**
     * Get current room ID
     */
    getCurrentRoom(): string | undefined {
        return this.currentJourney?.currentRoom;
    }

    /**
     * Get state of an object in a room
     */
    getObjectState(roomId: string, objectId: string): ObjectState | undefined {
        if (!this.currentJourney?.roomStates) return undefined;
        return this.currentJourney.roomStates[roomId]?.[objectId];
    }

    /**
     * Set state of an object in a room
     */
    setObjectState(roomId: string, objectId: string, state: Partial<ObjectState>): void {
        if (!this.currentJourney) return;

        // Initialize room states if needed
        if (!this.currentJourney.roomStates) {
            this.currentJourney.roomStates = {};
        }
        if (!this.currentJourney.roomStates[roomId]) {
            this.currentJourney.roomStates[roomId] = {};
        }

        // Merge state
        const existing = this.currentJourney.roomStates[roomId][objectId] || { interacted: false };
        this.currentJourney.roomStates[roomId][objectId] = { ...existing, ...state };

        console.log(`[JourneySystem] Object state updated: ${roomId}/${objectId}`, this.currentJourney.roomStates[roomId][objectId]);
    }

    /**
     * Check if an enemy has been defeated
     */
    isObjectDefeated(roomId: string, objectId: string): boolean {
        const state = this.getObjectState(roomId, objectId);
        return state?.defeated === true;
    }

    /**
     * Check if a chest/puzzle has been looted/completed
     */
    isObjectLooted(roomId: string, objectId: string): boolean {
        const state = this.getObjectState(roomId, objectId);
        return state?.looted === true || state?.completed === true;
    }

    /**
     * Unlock a waypoint for fast travel
     */
    unlockWaypoint(waypointId: string): void {
        if (!this.currentJourney) return;

        if (!this.currentJourney.unlockedWaypoints) {
            this.currentJourney.unlockedWaypoints = [];
        }

        if (!this.currentJourney.unlockedWaypoints.includes(waypointId)) {
            this.currentJourney.unlockedWaypoints.push(waypointId);
            console.log(`[JourneySystem] Waypoint unlocked: ${waypointId}`);
        }
    }

    /**
     * Check if a waypoint is unlocked
     */
    isWaypointUnlocked(waypointId: string): boolean {
        return this.currentJourney?.unlockedWaypoints?.includes(waypointId) ?? false;
    }

    /**
     * Get all unlocked waypoints
     */
    getUnlockedWaypoints(): string[] {
        return this.currentJourney?.unlockedWaypoints ?? [];
    }

    /**
     * Check if all enemies in a room are defeated
     */
    isRoomCleared(roomId: string, roomObjects: Array<{ id: string; type: string }>): boolean {
        const enemies = roomObjects.filter(obj => obj.type === 'enemy' || obj.type === 'boss');
        return enemies.every(enemy => this.isObjectDefeated(roomId, enemy.id));
    }

    /**
     * Create a save point for room-based journeys (saves room + HP)
     */
    createRoomSavePoint(): void {
        if (!this.currentJourney) return;

        const player = this.gameState.getPlayer();
        this.currentJourney.lastSavePoint = {
            stage: this.currentJourney.currentStage,
            encounter: this.currentJourney.currentEncounter,
            hp: player.hp,
            room: this.currentJourney.currentRoom
        };

        console.log(`[JourneySystem] Room save point created at ${this.currentJourney.currentRoom}, HP: ${player.hp}`);
    }

    /**
     * Resume from room save point
     */
    resumeFromRoomSavePoint(): boolean {
        if (!this.currentJourney || !this.currentJourney.lastSavePoint) {
            return false;
        }

        const savePoint = this.currentJourney.lastSavePoint;

        // Restore room position
        if (savePoint.room) {
            this.currentJourney.currentRoom = savePoint.room;
        }

        // Restore HP
        const player = this.gameState.getPlayer();
        player.hp = savePoint.hp;
        this.gameState.save();

        // Clear failed state
        this.currentJourney.failed = false;

        console.log(`[JourneySystem] Resumed from room save point at ${savePoint.room}, HP restored to ${savePoint.hp}`);
        return true;
    }

    /**
     * Mark room-based journey as complete (called when boss is defeated)
     */
    completeRoomJourney(): void {
        if (!this.currentJourney) return;

        this.currentJourney.completed = true;

        // Apply accumulated rewards
        const player = this.gameState.getPlayer();
        player.xp += this.currentJourney.totalXp;

        if (player.coins) {
            player.coins.smallCopper = (player.coins.smallCopper ?? 0) + this.currentJourney.totalGold;
        }

        this.gameState.save();

        console.log(`[JourneySystem] Room journey completed! XP: ${this.currentJourney.totalXp}, Gold: ${this.currentJourney.totalGold}`);
    }

    /**
     * Get room states for persistence/debugging
     */
    getRoomStates(): RoomStates | undefined {
        return this.currentJourney?.roomStates;
    }
}
