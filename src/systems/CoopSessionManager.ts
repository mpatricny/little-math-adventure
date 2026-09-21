import { EnemyDefinition, ExamType, MasteryData, MasteryTargetId } from '../types';
import { GameStateManager } from './GameStateManager';
import { MasterySystem } from './MasterySystem';


/**
 * CoopSessionManager - Singleton coordinator for hotseat 2-player co-op mode.
 *
 * Orchestrates the "singleton swap pattern": before each player's turn,
 * it saves the current player's state and loads the other player's save slot
 * into GameStateManager. All existing code that calls gameState.getPlayer()
 * automatically sees the correct player.
 */
export class CoopSessionManager {
    private static instance: CoopSessionManager;
    private static readonly MAX_SHARED_ATTACK_COUNT = 5;
    private static readonly SHARED_ATTACK_GROWTH_INTERVAL = 2;
    private static readonly BOSS_HP_SCALE = 1.35;

    private _isActive: boolean = false;
    private playerASlotIndex: number = -1;
    private playerBSlotIndex: number = -1;
    private _activePlayer: 'A' | 'B' = 'A';
    private _sharedAttackCount: number = 1;
    private _sharedVictories: number = 0;
    private _playerAMasteryData: MasteryData | null = null;
    private _playerBMasteryData: MasteryData | null = null;

    // Battle-scoped state (reset each battle via resetBattleState)
    private _playerABattleHp: number = 0;
    private _playerBBattleHp: number = 0;
    private _playerAMaxHp: number = 0;
    private _playerBMaxHp: number = 0;
    private _playerAFallen: boolean = false;
    private _playerBFallen: boolean = false;
    private _playerAWrongCount: number = 0;
    private _playerBWrongCount: number = 0;
    private _enemyTargetPlayer: 'A' | 'B' = 'A';

    private constructor() {}

    static getInstance(): CoopSessionManager {
        if (!CoopSessionManager.instance) {
            CoopSessionManager.instance = new CoopSessionManager();
        }
        return CoopSessionManager.instance;
    }

    /**
     * Start a co-op session with two save slots.
     * Both slots must exist and be different.
     * After this call, Player A's slot is the active context.
     */
    startSession(slotA: number, slotB: number): boolean {
        if (slotA === slotB) {
            console.error('[CoopSession] Cannot use the same slot for both players');
            return false;
        }

        const gameState = GameStateManager.getInstance();

        // Verify both slots have data
        if (!gameState.loadSlot(slotA)) {
            console.error(`[CoopSession] Slot ${slotA} is empty`);
            return false;
        }
        this._playerAMasteryData = this.createSessionMastery(gameState.getMasteryData());
        // loadSlot already set slotA as active — save it back so we can test slotB
        gameState.save();

        if (!gameState.loadSlot(slotB)) {
            console.error(`[CoopSession] Slot ${slotB} is empty`);
            this._playerAMasteryData = null;
            // Restore slot A
            gameState.loadSlot(slotA);
            return false;
        }
        this._playerBMasteryData = this.createSessionMastery(gameState.getMasteryData());
        // Slot B is valid — save and switch back to A
        gameState.save();
        gameState.loadSlot(slotA);

        this.playerASlotIndex = slotA;
        this.playerBSlotIndex = slotB;
        this._activePlayer = 'A';
        this._isActive = true;
        this.resetCasualProgress();

        console.log(`[CoopSession] Started: Player A = slot ${slotA}, Player B = slot ${slotB}`);
        return true;
    }

    /**
     * End the co-op session. Saves current player's state and clears session.
     */
    endSession(): void {
        if (!this._isActive) return;

        // Co-op learning belongs to both save slots, even when the session ends
        // outside the normal victory/defeat flow.
        this.persistMasteryProgress();

        this._isActive = false;
        this._activePlayer = 'A';
        this.playerASlotIndex = -1;
        this.playerBSlotIndex = -1;
        this._playerAMasteryData = null;
        this._playerBMasteryData = null;
        this.resetCasualProgress();
        this.resetBattleState();

        console.log('[CoopSession] Session ended');
    }

    /**
     * Activate Player A's context.
     * Saves current state, loads Player A's slot. No-op if already on A.
     */
    activatePlayerA(): void {
        if (!this._isActive) return;
        if (this._activePlayer === 'A') return;

        this.swapTo(this.playerASlotIndex);
        this._activePlayer = 'A';
    }

    /**
     * Activate Player B's context.
     * Saves current state, loads Player B's slot. No-op if already on B.
     */
    activatePlayerB(): void {
        if (!this._isActive) return;
        if (this._activePlayer === 'B') return;

        this.swapTo(this.playerBSlotIndex);
        this._activePlayer = 'B';
    }

    /**
     * Synchronous slot swap: save current, load target.
     * MasterySystem reads via its data getter — no reset needed.
     */
    private swapTo(targetSlot: number): void {
        const gameState = GameStateManager.getInstance();

        // swapToSlot saves current state, then loads target
        const success = gameState.swapToSlot(targetSlot);
        if (!success) {
            console.error(`[CoopSession] Failed to swap to slot ${targetSlot}`);
            return;
        }
    }

    // --- Getters ---

    isCoopActive(): boolean {
        return this._isActive;
    }

    getActivePlayer(): 'A' | 'B' {
        return this._activePlayer;
    }

    getPlayerASlotIndex(): number {
        return this.playerASlotIndex;
    }

    getPlayerBSlotIndex(): number {
        return this.playerBSlotIndex;
    }

    getSharedAttackCount(): number {
        return this._sharedAttackCount;
    }

    getSharedVictories(): number {
        return this._sharedVictories;
    }

    getPlayerAMasteryData(): MasteryData | null {
        return this._playerAMasteryData;
    }

    getPlayerBMasteryData(): MasteryData | null {
        return this._playerBMasteryData;
    }

    /**
     * Evaluate co-op learning thresholds and persist both players' mastery,
     * rewards and derived levels to their own save slots.
     */
    applyAndPersistMasteryProgress(): Array<{
        player: 'A' | 'B';
        type: ExamType;
        targetId: MasteryTargetId;
    }> {
        return this.persistMasteryTracks(true);
    }

    /** Persist recorded co-op attempts without evaluating another promotion. */
    persistMasteryProgress(): void {
        this.persistMasteryTracks(false);
    }

    /** Checkpoint a completed math phase without swapping players or awarding promotions. */
    persistActiveMasteryProgress(): void {
        if (!this._isActive) return;
        const data = this._activePlayer === 'A' ? this._playerAMasteryData : this._playerBMasteryData;
        if (!data) return;
        const gameState = GameStateManager.getInstance();
        gameState.getMathStats().masteryData = this.cloneMasteryData(data);
        gameState.save();
    }

    resetCasualProgress(): void {
        this._sharedAttackCount = 1;
        this._sharedVictories = 0;
    }

    recordCoopVictory(): { leveledUp: boolean; sharedAttackCount: number; sharedVictories: number } {
        if (!this._isActive) {
            return {
                leveledUp: false,
                sharedAttackCount: this._sharedAttackCount,
                sharedVictories: this._sharedVictories,
            };
        }

        this._sharedVictories += 1;
        const targetAttackCount = Math.min(
            CoopSessionManager.MAX_SHARED_ATTACK_COUNT,
            1 + Math.floor(this._sharedVictories / CoopSessionManager.SHARED_ATTACK_GROWTH_INTERVAL),
        );
        const leveledUp = targetAttackCount > this._sharedAttackCount;
        this._sharedAttackCount = targetAttackCount;

        return {
            leveledUp,
            sharedAttackCount: this._sharedAttackCount,
            sharedVictories: this._sharedVictories,
        };
    }

    // --- Battle-scoped state ---

    resetBattleState(): void {
        this._playerABattleHp = 0;
        this._playerBBattleHp = 0;
        this._playerAMaxHp = 0;
        this._playerBMaxHp = 0;
        this._playerAFallen = false;
        this._playerBFallen = false;
        this._playerAWrongCount = 0;
        this._playerBWrongCount = 0;
        this._enemyTargetPlayer = 'A';
    }

    get playerABattleHp(): number { return this._playerABattleHp; }
    set playerABattleHp(v: number) { this._playerABattleHp = v; }
    get playerBBattleHp(): number { return this._playerBBattleHp; }
    set playerBBattleHp(v: number) { this._playerBBattleHp = v; }
    get playerAMaxHp(): number { return this._playerAMaxHp; }
    set playerAMaxHp(v: number) { this._playerAMaxHp = v; }
    get playerBMaxHp(): number { return this._playerBMaxHp; }
    set playerBMaxHp(v: number) { this._playerBMaxHp = v; }
    get playerAFallen(): boolean { return this._playerAFallen; }
    set playerAFallen(v: boolean) { this._playerAFallen = v; }
    get playerBFallen(): boolean { return this._playerBFallen; }
    set playerBFallen(v: boolean) { this._playerBFallen = v; }
    get playerAWrongCount(): number { return this._playerAWrongCount; }
    set playerAWrongCount(v: number) { this._playerAWrongCount = v; }
    get playerBWrongCount(): number { return this._playerBWrongCount; }
    set playerBWrongCount(v: number) { this._playerBWrongCount = v; }

    /**
     * Get the next enemy attack target (alternates per round).
     * Call this once per enemy_turn phase, then all enemies in that round
     * attack the returned player.
     */
    getNextEnemyTarget(): 'A' | 'B' {
        const target = this._enemyTargetPlayer;
        // Advance for next round
        this._enemyTargetPlayer = (target === 'A') ? 'B' : 'A';

        // Skip fallen players
        if (target === 'A' && this._playerAFallen) return 'B';
        if (target === 'B' && this._playerBFallen) return 'A';

        return target;
    }

    /**
     * Adjust enemy definitions for co-op difficulty.
     * Regular fights add one extra enemy; bosses keep the original roster and gain HP.
     */
    getCoopEnemyDefs(baseDefs: EnemyDefinition[], isBoss: boolean): EnemyDefinition[] {
        if (!this._isActive) return baseDefs;

        const adjustedDefs = baseDefs.map(def => ({ ...def }));

        if (isBoss) {
            return adjustedDefs.map(def => ({
                ...def,
                hp: Math.ceil(def.hp * CoopSessionManager.BOSS_HP_SCALE),
            }));
        }

        if (adjustedDefs.length === 0) {
            return adjustedDefs;
        }

        adjustedDefs.push({
            ...adjustedDefs[adjustedDefs.length - 1],
        });

        return adjustedDefs;
    }

    private createSessionMastery(source: MasteryData): MasteryData {
        // Each player needs an isolated object during hotseat turns, but it must
        // start from (and later return to) that player's real learning progress.
        return this.cloneMasteryData(source);
    }

    private cloneMasteryData(source: MasteryData): MasteryData {
        return JSON.parse(JSON.stringify(source)) as MasteryData;
    }

    private persistMasteryTracks(applyPromotions: boolean): Array<{
        player: 'A' | 'B';
        type: ExamType;
        targetId: MasteryTargetId;
    }> {
        if (!this._isActive) return [];

        const originalPlayer = this._activePlayer;
        const gameState = GameStateManager.getInstance();
        const masterySystem = MasterySystem.getInstance();
        const promotions: Array<{
            player: 'A' | 'B';
            type: ExamType;
            targetId: MasteryTargetId;
        }> = [];

        const persistPlayer = (playerId: 'A' | 'B', data: MasteryData | null): void => {
            if (!data) return;

            if (playerId === 'A') this.activatePlayerA();
            else this.activatePlayerB();

            masterySystem.setActiveData(data);
            if (applyPromotions) {
                promotions.push(...masterySystem.applyCoopAutoPromotions(false).map(promotion => ({
                    player: playerId,
                    ...promotion,
                })));
            }

            // Keep the session object isolated from save hydration while writing
            // its complete learning history back to the correct slot.
            gameState.getMathStats().masteryData = this.cloneMasteryData(data);
            masterySystem.updatePlayerLevel();
            gameState.save();
        };

        try {
            persistPlayer('A', this._playerAMasteryData);
            persistPlayer('B', this._playerBMasteryData);
        } finally {
            masterySystem.setActiveData(null);
            if (originalPlayer === 'A') this.activatePlayerA();
            else this.activatePlayerB();
        }

        return promotions;
    }

    /**
     * Utility: run a callback for both players, handling swap+save.
     * After completion, the originally active player is restored.
     */
    forBothPlayers(callback: (player: 'A' | 'B') => void): void {
        if (!this._isActive) return;

        const originalPlayer = this._activePlayer;

        this.activatePlayerA();
        callback('A');
        GameStateManager.getInstance().save();

        this.activatePlayerB();
        callback('B');
        GameStateManager.getInstance().save();

        // Restore original context
        if (originalPlayer === 'A') {
            this.activatePlayerA();
        }
    }

    static destroyInstance(): void {
        if (CoopSessionManager.instance) {
            CoopSessionManager.instance.endSession();
        }
        CoopSessionManager.instance = null as any;
    }
}
