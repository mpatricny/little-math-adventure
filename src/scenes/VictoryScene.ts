import Phaser from 'phaser';
import { SceneDebugger } from '../systems/SceneDebugger';
import { GameStateManager } from '../systems/GameStateManager';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { SceneBuilder } from '../systems/SceneBuilder';
import { auditUnderwaterLayout } from '../ui/UnderwaterTheme';
import { victoryDestination, type VictoryDestination } from '../loading/victory-destination';
import { BattleVictoryView } from '../ui/BattleVictoryView';
import { createVictoryFrame } from '../ui/VictoryFrame';
import { CharacterType, Crystal } from '../types';
import { CoopSessionManager } from '../systems/CoopSessionManager';
import { RemoteInputService } from '../remote/RemoteInputService';
import { RemoteCommand } from '../remote/types';
import { legacyArenaEncounterId } from '../systems/ArenaProgressSystem';
import { PracticeVictoryView, isPracticeVictory } from '../ui/PracticeVictoryView';
import type { PracticeVictoryResult } from '../systems/PersonalBattleBonuses';

export interface VictoryLoot {
    crystalDrops: Crystal[];
    crystalLabels: string[];
    crystalOverflow: boolean;
    arenaMana?: number;
    completedWaves?: boolean[];
    firstArenaCompletion?: boolean;
    unlockedPet?: { name: string; spriteKey: string; animPrefix: string } | null;
}

export interface VictoryData extends VictoryLoot {
    // Navigation after dismiss
    returnScene: string;
    returnData: Record<string, unknown>;

    // Rewards
    goldReward: number;
    practiceReward?: PracticeVictoryResult;
    practiceRewardA?: PracticeVictoryResult;
    practiceRewardB?: PracticeVictoryResult;
    enemyName?: string;
    foes?: { id: string; name: string; spriteKey: string }[];
    battleBackground?: string | null;
    personalLoot?: [VictoryLoot, VictoryLoot];

    // First-defeat tracking
    isFirstDefeat: boolean;
    isPerfectDefeat: boolean;
    wasPerfectBefore: boolean;

    // Enemy sprite for transformation display
    enemySpriteKey?: string;
    enemyAnimPrefix?: string;

    // Arena-specific
    arenaCompleted?: boolean;
    arenaWave?: number;
    arenaCity?: string;
    arenaLevel?: number;
    cityArenaLevel?: number;
    nextArenaLevel?: number;
    nextCityArenaLevel?: number;

    // Co-op specific
    coopMode?: boolean;
    playerAName?: string;
    playerBName?: string;
    playerACharacterType?: CharacterType;
    playerBCharacterType?: CharacterType;
    goldRewardA?: number;
    goldRewardB?: number;
}

export class VictoryScene extends Phaser.Scene {
    private victoryData!: VictoryData;
    private gameState!: GameStateManager;
    private remoteInput = RemoteInputService.getInstance();
    private unsubscribeRemoteCommand: (() => void) | null = null;
    private remoteContinueReady = false;
    private result?: BattleVictoryView | PracticeVictoryView;
    private destination!: VictoryDestination;

    private builder!: SceneBuilder;

    constructor() {
        super({ key: 'VictoryScene' });
    }

    init(data: VictoryData): void {
        this.victoryData = data;
        this.gameState = GameStateManager.getInstance();
        this.remoteContinueReady = false;
        this.result = undefined;
        this.destination = victoryDestination(this, data);

        // Handle arena completion
        if (data.arenaCompleted) {
            if (data.coopMode) {
                // Co-op: update both players' arena state
                const coop = CoopSessionManager.getInstance();
                coop.forBothPlayers(() => {
                    const player = this.gameState.getPlayer();
                    player.arena.isActive = false;
                    player.arena.currentBattle = 0;
                    if (data.nextArenaLevel !== undefined) {
                        player.arena.arenaLevel = Math.max(
                            player.arena.arenaLevel || 1,
                            data.nextArenaLevel,
                        );
                    }
                    player.arena.currentEncounterId = legacyArenaEncounterId(player.arena.arenaLevel, 0);
                    ProgressionSystem.fullHeal(player);
                });
            } else {
                const player = this.gameState.getPlayer();
                player.arena.isActive = false;
                player.arena.currentBattle = 0;
                if (data.nextArenaLevel !== undefined) {
                    player.arena.arenaLevel = Math.max(
                        player.arena.arenaLevel || 1,
                        data.nextArenaLevel,
                    );
                }
                player.arena.currentEncounterId = legacyArenaEncounterId(player.arena.arenaLevel, 0);
                ProgressionSystem.fullHeal(player);
                this.gameState.save();
            }
        }
    }

    create(): void {
        const data = this.victoryData;
        this.builder = new SceneBuilder(this);
        this.builder.buildScene('VictoryScene');
        const refreshRemoteFeedback = () => { if (this.remoteContinueReady) this.publishRemoteVictoryState(); };
        const forward = createVictoryFrame(this, this.builder, data, this.destination, () => this.returnToNextScene());
        const rewards = data.coopMode ? [data.practiceRewardA, data.practiceRewardB] : [data.practiceReward];
        const owners = data.personalLoot || rewards.some(isPracticeVictory) ? rewards.length : 1;
        let owner = -1;
        const showOwner = (index: number) => {
            if (index === owner || index >= owners) return;
            owner = index;
            this.result?.destroy();
            const reward = rewards[index];
            this.result = isPracticeVictory(reward)
                ? new PracticeVictoryView(this, this.builder, data, index, reward, showOwner)
                : new BattleVictoryView(this, this.builder, data, this.destination, index, showOwner);
            refreshRemoteFeedback();
        };
        showOwner(Math.max(0, rewards.findIndex(isPracticeVictory)));
        this.time.delayedCall(1500, () => {
            this.remoteContinueReady = true;
            forward.setEnabled(true);
            this.publishRemoteVictoryState();
        });
        const keyboardContinue = () => this.returnToNextScene();
        const firstOwner = () => showOwner(0);
        const secondOwner = () => showOwner(1);
        const keyboard = this.input.keyboard;
        keyboard?.on('keydown-SPACE', keyboardContinue).on('keydown-ENTER', keyboardContinue)
            .on('keydown-LEFT', firstOwner).on('keydown-RIGHT', secondOwner);
        this.events.on('wake', refreshRemoteFeedback);
        this.unsubscribeRemoteCommand = this.remoteInput.onCommand(command => this.handleRemoteCommand(command));
        this.events.once('shutdown', () => {
            this.unsubscribeRemoteCommand?.();
            this.unsubscribeRemoteCommand = null;
            this.events.off('wake', refreshRemoteFeedback);
            keyboard?.off('keydown-SPACE', keyboardContinue).off('keydown-ENTER', keyboardContinue)
                .off('keydown-LEFT', firstOwner).off('keydown-RIGHT', secondOwner);
        });
        new SceneDebugger(this, 'VictoryScene');
    }

    auditLayout(): string[] { return auditUnderwaterLayout(this); }

    private returnToNextScene(): void {
        if (!this.remoteContinueReady || !this.sys.isActive()) return;
        this.remoteContinueReady = false;
        this.scene.start(this.victoryData.returnScene, this.victoryData.returnData);
    }

    private handleRemoteCommand(command: RemoteCommand): void {
        if (command.type === 'continue' && this.remoteContinueReady) {
            this.returnToNextScene();
        }
    }

    private publishRemoteVictoryState(): void {
        if (!this.remoteInput.getRoom()) return;

        const reward = this.result?.remoteSummary() ?? ('🪙 +' + this.victoryData.goldReward);
        this.remoteInput.publishState({
            screen: 'feedback',
            title: this.victoryData.arenaCompleted ? 'Aréna dokončena' : 'Vítězství',
            subtitle: reward,
            actions: [
                {
                    id: 'continue',
                    label: 'Pokračovat',
                    command: { type: 'continue' },
                },
            ],
        });
    }
}
