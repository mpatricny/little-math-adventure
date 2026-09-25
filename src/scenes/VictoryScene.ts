import Phaser from 'phaser';
import { SceneDebugger } from '../systems/SceneDebugger';
import { GameStateManager } from '../systems/GameStateManager';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { SceneBuilder } from '../systems/SceneBuilder';
import { waterHost } from '../ui/UnderwaterUI';
import { auditUnderwaterLayout, fitWaterText, UnderwaterButton, waterArtwork } from '../ui/UnderwaterTheme';
import { UNDERWATER_ROOMS } from '../systems/UnderwaterProgressSystem';
import { Crystal } from '../types';
import { CoopSessionManager } from '../systems/CoopSessionManager';
import { RemoteInputService } from '../remote/RemoteInputService';
import { RemoteCommand } from '../remote/types';
import { legacyArenaEncounterId } from '../systems/ArenaProgressSystem';

interface VictoryData {
    // Navigation after dismiss
    returnScene: string;
    returnData: Record<string, unknown>;

    // Rewards
    goldReward: number;
    enemyName?: string;

    // First-defeat tracking
    isFirstDefeat: boolean;
    isPerfectDefeat: boolean;
    wasPerfectBefore: boolean;

    // Pet unlock with sprite data
    unlockedPet?: {
        name: string;
        spriteKey: string;
        animPrefix: string;
    } | null;

    // Enemy sprite for transformation display
    enemySpriteKey?: string;
    enemyAnimPrefix?: string;

    // Crystal rewards
    crystalDrops: Crystal[];
    crystalLabels: string[];
    crystalOverflow: boolean;

    // Arena-specific
    arenaCompleted?: boolean;
    arenaLevel?: number;
    cityArenaLevel?: number;
    nextArenaLevel?: number;
    nextCityArenaLevel?: number;

    // Co-op specific
    coopMode?: boolean;
    playerAName?: string;
    playerBName?: string;
    goldRewardA?: number;
    goldRewardB?: number;
}

export class VictoryScene extends Phaser.Scene {
    private victoryData!: VictoryData;
    private gameState!: GameStateManager;
    private remoteInput = RemoteInputService.getInstance();
    private unsubscribeRemoteCommand: (() => void) | null = null;
    private remoteContinueReady = false;

    private builder!: SceneBuilder;

    constructor() {
        super({ key: 'VictoryScene' });
    }

    init(data: VictoryData): void {
        this.victoryData = data;
        this.gameState = GameStateManager.getInstance();
        this.remoteContinueReady = false;

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
        const host = (id: string) => waterHost(this.builder, id);
        const shade = host('victoryShadeHost');
        const room = UNDERWATER_ROOMS[String(data.returnData?.roomId)];
        if (room && this.textures.exists(room.background)) {
            waterArtwork(this, room.background, { ...shade, depth: shade.depth - 1 });
        }
        this.add.rectangle(shade.x, shade.y, shade.width, shade.height, 0x020f1c, room ? 0.82 : 1).setDepth(shade.depth);
        const frame = waterArtwork(this, 'silverpond-fairy-reward-frame', host('victoryFrameHost')).setAlpha(0);
        this.tweens.add({ targets: frame, alpha: 1, duration: 280 });

        const text = (id: string, value: string, size: number, color = '#eaf3ef') => {
            const box = host(id);
            const label = this.add.text(box.x, box.y, value, {
                resolution: 2, fontFamily: 'Georgia, serif', fontSize: `${size}px`, color,
                align: 'center', lineSpacing: 3,
            }).setOrigin(0.5).setDepth(box.depth).setName(id);
            fitWaterText(label, box, size, Math.min(size, 16));
            return label;
        };
        text('victoryTitleHost', data.arenaCompleted ? 'Aréna dokončena!' : 'Vítězství!', 42, '#f5dfa3');
        text('victorySubtitleHost', data.arenaCompleted
            ? `Aréna ${data.cityArenaLevel ?? data.arenaLevel ?? 1}`
            : data.enemyName ?? 'Společnými silami!', 23);
        text('victoryNamesHost', data.coopMode ? `${data.playerAName ?? 'Hráč A'}  &  ${data.playerBName ?? 'Hráč B'}` : '', 20, '#b4dce9');

        // One centered reward row; co-op shows each participant's own reward.
        const coinHost = host('victoryCoinsHost');
        const coinRow = this.add.container(coinHost.x, coinHost.y).setDepth(coinHost.depth).setName('victoryCoins');
        const amounts = data.coopMode ? [data.goldRewardA ?? data.goldReward, data.goldRewardB ?? data.goldReward] : [data.goldReward];
        amounts.forEach((amount, index) => {
            const x = (index - (amounts.length - 1) / 2) * coinHost.width / 2;
            const coin = this.add.image(x - 29, 0, 'shop-coins-sheet', 1);
            coin.setScale(Math.min(32 / coin.width, 32 / coin.height)).setData('waterArtwork', true);
            const label = this.add.text(x + 8, 0, `+${amount ?? 0}`, {
                resolution: 2, fontFamily: 'Georgia', fontSize: '26px', color: '#f5d283',
            }).setOrigin(0, 0.5).setName(`victoryCoin${index}`);
            fitWaterText(label, { x: x + 50, y: 0, width: 100, height: 40 }, 26);
            // Bounds contract is centered on the actual label, including variable digit counts.
            label.setOrigin(0.5).setX(x + 30);
            label.setData('waterTextBox', { x: x + 30, y: 0, width: 140, height: 40 });
            coinRow.add([coin, label]);
        });
        if (data.unlockedPet) {
            const pet = data.unlockedPet;
            text('victoryPetTitleHost', 'Nový přítel', 22, '#bde9d3');
            const petHost = host('victoryPetHost');
            const sprite = this.add.image(petHost.x, petHost.y, pet.spriteKey, 0).setDepth(petHost.depth);
            sprite.setScale(Math.min(petHost.width / sprite.width, petHost.height / sprite.height)).setData('waterArtwork', true);
            text('victoryPetNameHost', pet.name, 18);
        }

        // Reward cards paginate instead of overflowing in co-op or on long labels.
        const crystals = data.crystalDrops ?? [];
        if (!crystals.length && !data.unlockedPet) {
            const seal = host('victorySealHost');
            waterArtwork(this, 'enamel-control-socket', seal);
            waterArtwork(this, 'enamel-check-normal', { ...seal, width: seal.width * 0.73, height: seal.height * 0.73, depth: seal.depth + 1 });
        }
        const perPage = 4;
        let page = 0;
        let rewardObjects: Phaser.GameObjects.GameObject[] = [];
        const pageLabel = text('victoryPageHost', '', 18, '#bbdbe8');
        const drawPage = () => {
            rewardObjects.forEach(object => object.destroy());
            rewardObjects = [];
            const pageCount = Math.max(1, Math.ceil(crystals.length / perPage));
            pageLabel.setText(pageCount > 1 ? `${page + 1}/${pageCount}` : '');
            crystals.slice(page * perPage, (page + 1) * perPage).forEach((crystal, index) => {
                const prefix = data.unlockedPet ? 'victoryPetCrystal' : 'victoryCrystal';
                const count = Math.min(perPage, crystals.length - page * perPage);
                const slot = index + Math.floor((perPage - count) / 2);
                const box = host(`${prefix}${slot}Host`);
                const plate = waterArtwork(this, 'enamel-clue-plaque', box);
                const gem = this.add.image(box.x, box.y - 7, 'gemstone-icons',
                    ({ shard: 1, fragment: 3, prism: 5 } as Record<string, number>)[crystal.tier] ?? 1).setDepth(box.depth + 1);
                gem.setScale(Math.min(box.width * 0.57 / gem.width, box.height * 0.57 / gem.height)).setData('waterArtwork', true);
                const value = this.add.text(box.x, box.y + 24, String(crystal.value), {
                    resolution: 2, fontFamily: 'Georgia', fontSize: '20px', color: '#ffedbb',
                }).setOrigin(0.5).setDepth(box.depth + 1).setName(`victoryCrystalValue${index}`);
                fitWaterText(value, { x: box.x, y: box.y + 24, width: box.width * 0.68, height: 24 }, 20, 16);
                const label = text(`${prefix}Label${slot}Host`, (data.crystalLabels ?? [])[page * perPage + index] ?? '', 17, '#c3d9e7');
                rewardObjects.push(plate, gem, value, label);
            });
        };
        drawPage();
        if (crystals.length > perPage) new UnderwaterButton(this, {
            ...host('victoryNextHost'), name: 'victoryNextHost', label: '', fontSize: 18, icon: 'continue',
            onClick: () => { page = (page + 1) % Math.ceil(crystals.length / perPage); drawPage(); },
        });

        const messages: string[] = [];
        if (data.arenaCompleted) messages.push(data.nextCityArenaLevel !== undefined
            ? `Otevřena aréna ${data.nextCityArenaLevel}.` : 'Všechny městské arény dokončeny.');
        if (data.crystalOverflow) messages.push('Plný inventář — další krystaly čekají na zemi.');
        text('victoryStatusHost', messages.join('\n'), 18, '#d8dfbf');

        const button = new UnderwaterButton(this, {
            ...host('victoryContinueHost'), name: 'victoryContinueHost', label: 'POKRAČOVAT',
            fontSize: 21, icon: 'continue', onClick: () => this.returnToNextScene(),
        });
        button.setState('disabled');
        // Match keyboard, touch and remote availability. No invisible early click target.
        this.time.delayedCall(1500, () => {
            this.remoteContinueReady = true;
            button.setState('normal');
            this.publishRemoteVictoryState();
        });
        const keyboardContinue = () => this.returnToNextScene();
        this.input.keyboard?.on('keydown-SPACE', keyboardContinue);
        this.unsubscribeRemoteCommand = this.remoteInput.onCommand(command => this.handleRemoteCommand(command));
        this.events.once('shutdown', () => {
            this.unsubscribeRemoteCommand?.();
            this.unsubscribeRemoteCommand = null;
            this.input.keyboard?.off('keydown-SPACE', keyboardContinue);
        });
        new SceneDebugger(this, 'VictoryScene');
    }

    auditLayout(): string[] { return auditUnderwaterLayout(this); }

    private returnToNextScene(): void {
        if (!this.remoteContinueReady) return;
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

        const reward = this.victoryData.goldReward
            ? `Získáno: ${this.victoryData.goldReward} mincí.`
            : 'Souboj dokončen.';
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
