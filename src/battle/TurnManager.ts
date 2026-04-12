import { BattlePhase, BattleState } from '../types';

/**
 * Interface that BattleScene must implement for TurnManager to call back.
 * This decouples TurnManager from the scene's internals.
 */
export interface BattleSceneCallbacks {
    // Phase entry actions — Player A
    onEnterPlayerTurn(): void;
    onEnterPlayerMath(): void;
    onEnterPlayerAttack(): void;
    onEnterPlayerMiss(): void;

    // Phase entry actions — Player B (co-op)
    onEnterPlayerBTurn(): void;
    onEnterPlayerBMath(): void;
    onEnterPlayerBAttack(): void;
    onEnterPlayerBMiss(): void;

    // Phase entry actions — Pet A
    onEnterPetTurn(): void;
    onEnterPetMath(): void;
    onEnterPetAttack(): void;

    // Phase entry actions — Pet B (co-op)
    onEnterPetBTurn(): void;
    onEnterPetBMath(): void;
    onEnterPetBAttack(): void;

    // Phase entry actions — shared
    onEnterEnemyTurn(): void;
    onEnterVictory(): void;
    onEnterDefeat(): void;

    // State queries
    hasPet(): boolean;
    hasPetB(): boolean;
    hasAliveEnemies(): boolean;
    isPlayerDefeated(): boolean;
    isPlayerBDefeated(): boolean;
    isCoopModeActive(): boolean;
}

/**
 * TurnManager - Owns the battle phase state machine and routing decisions.
 *
 * Solo flow:
 *   player_turn → player_math → player_attack/miss
 *     → pet_turn (if pet) → pet_math → pet_attack
 *     → enemy_turn → enemy_attack
 *     → player_turn (next round)
 *
 * Co-op flow:
 *   player_turn (A) → player_math → player_attack/miss
 *     → player_b_turn (B) → player_b_math → player_b_attack/miss  [skip if fallen]
 *     → pet_turn (A's pet) → pet_math → pet_attack                [skip if no pet or fallen]
 *     → pet_b_turn (B's pet) → pet_b_math → pet_b_attack          [skip if no pet or fallen]
 *     → enemy_turn → enemy_attack
 *     → player_turn (next round)
 */
export class TurnManager {
    private battleState: BattleState;
    private scene: BattleSceneCallbacks;

    constructor(battleState: BattleState, scene: BattleSceneCallbacks) {
        this.battleState = battleState;
        this.scene = scene;
    }

    setPhase(phase: BattlePhase): void {
        this.battleState.phase = phase;

        switch (phase) {
            case 'player_turn':
                this.scene.onEnterPlayerTurn();
                break;
            case 'player_math':
                this.scene.onEnterPlayerMath();
                break;
            case 'player_attack':
                this.scene.onEnterPlayerAttack();
                break;
            case 'player_miss':
                this.scene.onEnterPlayerMiss();
                break;

            case 'player_b_turn':
                this.scene.onEnterPlayerBTurn();
                break;
            case 'player_b_math':
                this.scene.onEnterPlayerBMath();
                break;
            case 'player_b_attack':
                this.scene.onEnterPlayerBAttack();
                break;
            case 'player_b_miss':
                this.scene.onEnterPlayerBMiss();
                break;

            case 'pet_turn':
                this.scene.onEnterPetTurn();
                break;
            case 'pet_math':
                this.scene.onEnterPetMath();
                break;
            case 'pet_attack':
                this.scene.onEnterPetAttack();
                break;

            case 'pet_b_turn':
                this.scene.onEnterPetBTurn();
                break;
            case 'pet_b_math':
                this.scene.onEnterPetBMath();
                break;
            case 'pet_b_attack':
                this.scene.onEnterPetBAttack();
                break;

            case 'enemy_turn':
                this.scene.onEnterEnemyTurn();
                break;
            case 'victory':
                this.scene.onEnterVictory();
                break;
            case 'defeat':
                this.scene.onEnterDefeat();
                break;
        }
    }

    getPhase(): BattlePhase {
        return this.battleState.phase;
    }

    // --- Phase routing decisions ---

    /**
     * After Player A's attack (hit or miss), what's next?
     * Solo: pet_turn (if pet) or enemy_turn
     * Co-op: player_b_turn (if B alive), else pet_turn or enemy_turn
     */
    nextPhaseAfterPlayerAttack(): BattlePhase {
        if (this.scene.isCoopModeActive()) {
            if (!this.scene.isPlayerBDefeated()) {
                return 'player_b_turn';
            }
            return this.nextPhaseAfterPlayerB();
        }

        if (this.scene.hasPet()) {
            return 'pet_turn';
        }
        return 'enemy_turn';
    }

    /**
     * After Player B's attack (hit or miss), what's next?
     * → pet_turn (A's pet, if alive and has pet) or pet_b_turn or enemy_turn
     */
    nextPhaseAfterPlayerB(): BattlePhase {
        // Player A's pet
        if (this.scene.hasPet() && !this.scene.isPlayerDefeated()) {
            return 'pet_turn';
        }
        // Player B's pet
        if (this.scene.hasPetB() && !this.scene.isPlayerBDefeated()) {
            return 'pet_b_turn';
        }
        return 'enemy_turn';
    }

    /**
     * After Pet A's turn, what's next?
     * Solo: enemy_turn
     * Co-op: pet_b_turn (if B has pet and alive) or enemy_turn
     */
    nextPhaseAfterPetAction(): BattlePhase {
        if (this.scene.isCoopModeActive()) {
            if (this.scene.hasPetB() && !this.scene.isPlayerBDefeated()) {
                return 'pet_b_turn';
            }
        }
        return 'enemy_turn';
    }

    /**
     * After Pet B's turn, what's next?
     * Always: enemy_turn
     */
    nextPhaseAfterPetBAction(): BattlePhase {
        return 'enemy_turn';
    }

    /**
     * After all enemies have attacked, what's next?
     * A starts each round, but skip to B if A is fallen.
     */
    nextPhaseAfterEnemies(): BattlePhase {
        if (this.scene.isCoopModeActive() && this.scene.isPlayerDefeated()) {
            // Player A is fallen — skip directly to Player B
            return 'player_b_turn';
        }
        return 'player_turn';
    }

    /**
     * After victory/continue check when enemies remain.
     */
    nextPhaseWhenEnemiesRemain(): BattlePhase {
        return 'enemy_turn';
    }
}
