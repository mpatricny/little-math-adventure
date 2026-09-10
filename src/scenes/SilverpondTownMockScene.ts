import Phaser from 'phaser';
import { SceneBuilder } from '../systems/SceneBuilder';
import { WalkingSceneHud } from '../ui/WalkingSceneHud';
import { GameStateManager } from '../systems/GameStateManager';
import { StorySystem } from '../systems/StorySystem';
import { MasterySystem } from '../systems/MasterySystem';
import { shouldBackfillLakeFairyReward } from '../systems/SilverpondProgressSystem';
import { needsDepthCrystalShipReturn, hasNextCityAccess } from '../systems/DepthCrystalProgressSystem';
import { UnderwaterButton } from '../ui/UnderwaterTheme';
import { getPlayerSpriteConfig } from '../utils/characterUtils';
import { canEnterUnderwater } from '../systems/UnderwaterProgressSystem';
import { MedievalActionButton } from '../ui/MedievalActionButton';

type DoorConfig = {
    hostId: string;
    message: string;
    archRatio: number;
    destinationScene?: string;
};

type HostLayout = {
    x: number;
    y: number;
    width: number;
    height: number;
    depth: number;
    scale: number;
    scaleX: number;
    scaleY: number;
};

const DOOR_GLOW_COLOR = 0x92eeff;

const DOORS: DoorConfig[] = [
    {
        hostId: 'shopDoorHost',
        message: 'OBCHOD · vybavení a zásoby',
        archRatio: 0.24,
        destinationScene: 'SilverpondShopMockScene',
    },
    {
        hostId: 'guildDoorHost',
        message: 'CECH · nové zkoušky jsou připravené',
        archRatio: 0.48,
        destinationScene: 'SilverpondGuildMockScene',
    },
    {
        hostId: 'workshopDoorHost',
        message: 'DÍLNA PYTHIE · lektvary a práce s mazlíčky',
        archRatio: 0.45,
        destinationScene: 'SilverpondPythiaWorkshopMockScene',
    },
    {
        hostId: 'forgeDoorHost',
        message: 'KRYSTALOVÁ KOVÁRNA · opravy a krystalové operace',
        archRatio: 0.42,
        destinationScene: 'SilverpondCrystalForgeMockScene',
    },
    {
        hostId: 'arenaGateHost',
        message: 'VODNÍ ARÉNA · osvoboď jezerní vílu',
        archRatio: 0.48,
        destinationScene: 'SilverpondArenaMockScene',
    },
];

/**
 * Production Silverpond town hub. The legacy scene key is retained so existing
 * scene-editor data and saves remain compatible.
 */
export class SilverpondTownMockScene extends Phaser.Scene {
    private sceneBuilder!: SceneBuilder;
    private player!: Phaser.GameObjects.Sprite;
    private walkingHud!: WalkingSceneHud;
    private toast?: Phaser.GameObjects.Text;
    private doorGlows = new Map<string, Phaser.GameObjects.Graphics>();
    private hoveredDoors = new Set<string>();

    constructor() {
        super({ key: 'SilverpondTownMockScene' });
    }

    create(): void {
        this.input.enabled = true;
        this.sceneBuilder = new SceneBuilder(this);
        this.sceneBuilder.buildScene('SilverpondTownMockScene');

        const gameState = GameStateManager.getInstance();
        if (needsDepthCrystalShipReturn(gameState.getPlayer())) {
            this.scene.start('ZyxRocketInterludeScene');
            return;
        }
        const story = StorySystem.getInstance();
        if (story.getProgress().hasUnlockedSilverpond) {
            // Reaching this scene is the persistent regional checkpoint.
            gameState.save();
        }
        if (shouldBackfillLakeFairyReward(gameState.getPlayer())) {
            story.completeLakeFairyQuest();
        }

        this.createPlayer();
        if (hasNextCityAccess(gameState.getPlayer())) {
            new UnderwaterButton(this, { ...this.requireHost('depthShipEntryHost'), name: 'depthShipEntry',
                label: 'ZYXOVA LOĎ', fontSize: 20,
                onClick: () => this.scene.start('ZyxRocketInterludeScene', { crystal: 'depth' }) });
        }
        DOORS.forEach((config) => this.createDoorInteraction(config));
        this.createGuildNotification();
        if (canEnterUnderwater(gameState.getPlayer())) {
            const host = this.requireHost('underwaterEntryHost');
            new MedievalActionButton(this, {
                ...host, label: '↓ PONOŘIT SE', layout: 'text', accent: 0x76e7df, labelFontSize: 20,
                name: 'underwaterEntry',
                onClick: () => {
                    if (!this.input.enabled) return;
                    this.input.enabled = false;
                    this.scene.start('UnderwaterRoomScene', { fromSurface: true });
                },
            });
        }
        this.walkingHud = new WalkingSceneHud(this, {
            onMenu: () => this.quitToMenu(),
        });

        this.input.keyboard?.on('keydown-ESC', () => {
            if (!this.walkingHud.closeBook()) this.quitToMenu();
        });
        if (import.meta.env.DEV) {
            this.input.keyboard?.on('keydown-R', () => {
                this.scene.start('SilverpondFairyRewardScene', { testMode: true });
            });
        }
        this.time.delayedCall(250, () => {
            this.showToast('Najeď na dveře a klikni na budovu.', 1900);
        });
    }

    private createPlayer(): void {
        const spawn = this.sceneBuilder.getZone('playerSpawn');
        if (!spawn) {
            throw new Error('SilverpondTownMockScene is missing the playerSpawn zone');
        }

        const playerConfig = getPlayerSpriteConfig(
            GameStateManager.getInstance().getPlayer().characterType,
        );
        this.player = this.add.sprite(spawn.x, spawn.y, playerConfig.idleTexture, 0)
            .setOrigin(0.5, 1)
            .setScale(0.44)
            .setDepth(18);

        if (this.anims.exists(playerConfig.idleAnim)) {
            this.player.play(playerConfig.idleAnim);
        }
    }

    private createDoorInteraction(config: DoorConfig): void {
        const host = this.requireHost(config.hostId);
        const width = host.width * Math.abs(host.scaleX);
        const height = host.height * Math.abs(host.scaleY);
        const glow = this.add.graphics()
            .setPosition(host.x, host.y)
            .setDepth(host.depth)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setAlpha(0);

        this.drawDoorGlow(glow, width, height, config.archRatio);
        this.doorGlows.set(config.hostId, glow);

        const hitArea = this.add.zone(host.x, host.y, width, height)
            .setOrigin(0.5)
            .setDepth(host.depth + 2);
        hitArea.setSize(width, height);
        hitArea.setInteractive({ useHandCursor: true });

        hitArea
            .on('pointerover', () => {
                this.hoveredDoors.add(config.hostId);
                this.tweenGlow(glow, 1, 140);
            })
            .on('pointerout', () => {
                this.hoveredDoors.delete(config.hostId);
                this.tweenGlow(glow, 0, 180);
            })
            .on('pointerdown', () => {
                this.tweenGlow(glow, 1, 80);
            })
            .on('pointerup', () => {
                this.walkToDestination(config, host.x);
            });
    }

    private drawDoorGlow(
        graphics: Phaser.GameObjects.Graphics,
        width: number,
        height: number,
        archRatio: number
    ): void {
        graphics.fillStyle(DOOR_GLOW_COLOR, 0.05);
        this.traceDoorArch(graphics, width, height, archRatio);
        graphics.fillPath();

        [
            { width: 14, alpha: 0.04 },
            { width: 8, alpha: 0.08 },
            { width: 3, alpha: 0.72 },
        ].forEach((stroke) => {
            graphics.lineStyle(stroke.width, DOOR_GLOW_COLOR, stroke.alpha);
            this.traceDoorArch(graphics, width, height, archRatio);
            graphics.strokePath();
        });
    }

    private traceDoorArch(
        graphics: Phaser.GameObjects.Graphics,
        width: number,
        height: number,
        archRatio: number
    ): void {
        const left = -width / 2;
        const right = width / 2;
        const top = -height / 2;
        const bottom = height / 2;
        const archHeight = Math.min(width * archRatio, height * 0.5);
        const archCenterY = top + archHeight;

        graphics.beginPath();
        graphics.moveTo(left, bottom);
        graphics.lineTo(left, archCenterY);

        for (let pointIndex = 0; pointIndex <= 24; pointIndex++) {
            const angle = Math.PI + (Math.PI * pointIndex) / 24;
            graphics.lineTo(
                Math.cos(angle) * (width / 2),
                archCenterY + Math.sin(angle) * archHeight
            );
        }

        graphics.lineTo(right, bottom);
        graphics.closePath();
    }

    private tweenGlow(
        glow: Phaser.GameObjects.Graphics,
        alpha: number,
        duration: number
    ): void {
        this.tweens.killTweensOf(glow);
        this.tweens.add({
            targets: glow,
            alpha,
            duration,
            ease: 'Sine.easeOut',
        });
    }

    private walkToDestination(config: DoorConfig, targetX: number): void {
        this.tweens.killTweensOf(this.player);
        this.player.setFlipX(targetX < this.player.x);

        const distance = Math.abs(targetX - this.player.x);
        this.tweens.add({
            targets: this.player,
            x: Phaser.Math.Clamp(targetX, 55, 1225),
            duration: Phaser.Math.Clamp(distance * 1.5, 260, 900),
            ease: 'Sine.easeInOut',
            onComplete: () => {
                this.player.setFlipX(false);
                this.showToast(config.message);
                this.flashDoor(config.hostId);

                if (config.destinationScene) {
                    this.input.enabled = false;
                    this.cameras.main.fadeOut(280, 8, 30, 35);
                    this.time.delayedCall(300, () => {
                        this.scene.start(config.destinationScene);
                    });
                }
            },
        });
    }

    private flashDoor(hostId: string): void {
        const glow = this.doorGlows.get(hostId);
        if (!glow) return;

        this.tweens.killTweensOf(glow);
        glow.setAlpha(1);
        this.tweens.add({
            targets: glow,
            alpha: this.hoveredDoors.has(hostId) ? 1 : 0,
            delay: 230,
            duration: 260,
            ease: 'Sine.easeOut',
        });
    }

    private createGuildNotification(): void {
        const host = this.requireHost('guildNotificationHost');
        const root = this.add.container(host.x, host.y).setDepth(host.depth);
        const progress = StorySystem.getInstance().getProgress();
        const hasExam = MasterySystem.getInstance().getAvailableExams().length > 0;
        const shouldShow = !progress.hasSeenSilverpondQuest || hasExam;
        const normal = this.add.image(0, 0, 'silverpond-guild-notification-normal')
            .setScale(host.scale);
        const active = this.add.image(0, 0, 'silverpond-guild-notification-active')
            .setScale(host.scale)
            .setAlpha(0.15);
        const exclamation = this.add.text(0, 1, '!', {
            fontFamily: 'Arial, sans-serif',
            fontSize: `${Math.round(host.width * 0.46)}px`,
            fontStyle: 'bold',
            color: '#fff7cf',
            stroke: '#164b5b',
            strokeThickness: 3,
        }).setOrigin(0.5);
        const hitArea = this.add.zone(0, 0, host.width, host.height);
        hitArea.setSize(host.width, host.height);
        hitArea.setInteractive({ useHandCursor: true });

        root.add([normal, active, exclamation, hitArea]);
        root.setVisible(shouldShow);

        if (!shouldShow) return;

        this.tweens.add({
            targets: active,
            alpha: 1,
            duration: 720,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1,
        });
        this.tweens.add({
            targets: exclamation,
            alpha: 0.72,
            duration: 720,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1,
        });

        hitArea.on('pointerup', () => {
            const guildHost = this.requireHost('guildDoorHost');
            this.walkToDestination(DOORS[1], guildHost.x);
        });
    }

    private showToast(message: string, hold = 1400): void {
        const host = this.requireHost('toastHost');
        this.toast?.destroy();

        const toast = this.add.text(host.x, host.y, message, {
            resolution: 2,
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: '18px',
            fontStyle: 'bold',
            color: '#efffff',
            backgroundColor: '#102b31e8',
            stroke: '#071c21',
            strokeThickness: 3,
            padding: { x: 16, y: 8 },
        }).setOrigin(0.5).setDepth(host.depth);
        this.toast = toast;

        this.tweens.add({
            targets: toast,
            alpha: 0,
            y: host.y - 8,
            delay: hold,
            duration: 360,
            ease: 'Sine.easeIn',
            onComplete: () => {
                toast.destroy();
                if (this.toast === toast) this.toast = undefined;
            },
        });
    }

    private requireHost(id: string): HostLayout {
        const object = this.sceneBuilder.get<Phaser.GameObjects.Container>(id);
        const definition = this.sceneBuilder.getElementDef(id);
        if (!object || !definition) {
            throw new Error(`SilverpondTownMockScene is missing the ${id} host`);
        }

        return {
            x: object.x,
            y: object.y,
            width: definition.width ?? 80,
            height: definition.height ?? 80,
            depth: object.depth,
            scale: definition.scale ?? 1,
            scaleX: definition.scaleX ?? definition.scale ?? 1,
            scaleY: definition.scaleY ?? definition.scale ?? 1,
        };
    }

    private quitToMenu(): void {
        GameStateManager.getInstance().save();
        this.scene.start('MenuScene');
    }
}
