import Phaser from 'phaser';
import { SceneDebugger } from '../systems/SceneDebugger';
import { GameStateManager } from '../systems/GameStateManager';
import { ProgressionSystem } from '../systems/ProgressionSystem';

interface VictoryData {
    xpReward?: number;
    goldReward?: number;
    enemyName?: string;
    readyForTrial?: boolean;
    arenaComplete?: boolean;
    // New arena completion data
    arenaCompleted?: boolean;
    arenaLevel?: number;
    nextArenaLevel?: number;
    playerHp?: number;
}

export class VictoryScene extends Phaser.Scene {
    private victoryData!: VictoryData;
    private debugger!: SceneDebugger;
    private gameState!: GameStateManager;

    constructor() {
        super({ key: 'VictoryScene' });
    }

    init(data: VictoryData): void {
        this.victoryData = data;
        this.gameState = GameStateManager.getInstance();

        // Handle arena completion
        if (data.arenaCompleted) {
            const player = this.gameState.getPlayer();

            // Mark current arena as complete, prepare for next
            player.arena.isActive = false;
            player.arena.currentBattle = 0;

            // Advance to next arena level if available
            if (data.nextArenaLevel && data.nextArenaLevel <= 3) {
                player.arena.arenaLevel = data.nextArenaLevel;
            }

            // Full heal after completing arena
            ProgressionSystem.fullHeal(player);
            this.gameState.save();
        }
    }

    create(): void {
        // Dark background overlay (1280x720)
        this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.8);

        // Check for arena completion (both old and new fields)
        const isArenaComplete = this.victoryData.arenaComplete || this.victoryData.arenaCompleted;

        // Victory Title
        const titleText = isArenaComplete ? 'ARÉNA DOKONČENA!' : 'VÍTĚZSTVÍ!';
        const title = this.add.text(640, 120, titleText, {
            fontSize: '48px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffd700',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 6,
            shadow: { offsetX: 2, offsetY: 2, color: '#000000', blur: 5, fill: true }
        }).setOrigin(0.5).setScale(0);

        // Animate title
        this.tweens.add({
            targets: title,
            scale: 1,
            duration: 500,
            ease: 'Back.out'
        });

        // Enemy Defeated Text (skip for arena complete)
        if (!isArenaComplete && this.victoryData.enemyName) {
            const defeatedText = this.add.text(640, 200, `PORAZIL JSI: ${this.victoryData.enemyName.toUpperCase()}`, {
                fontSize: '24px',
                fontFamily: 'Arial, sans-serif',
                color: '#ffffff'
            }).setOrigin(0.5).setAlpha(0);

            this.tweens.add({
                targets: defeatedText,
                alpha: 1,
                duration: 500,
                delay: 300
            });
        }

        // Rewards Container
        const rewardsY = isArenaComplete ? 240 : 300;

        // XP Reward with animation (only if XP was given)
        if (this.victoryData.xpReward) {
            const xpText = this.add.text(540, rewardsY, `XP: +${this.victoryData.xpReward}`, {
                fontSize: '32px',
                fontFamily: 'Arial, sans-serif',
                color: '#44aaff',
                fontStyle: 'bold'
            }).setOrigin(0.5).setAlpha(0).setScale(0.5);

            this.tweens.add({
                targets: xpText,
                alpha: 1,
                scale: 1,
                duration: 400,
                delay: 500,
                ease: 'Back.out'
            });
        }

        // Coin Reward with animation (visual coin icon)
        if (this.victoryData.goldReward) {
            this.showCoinReward(740, rewardsY, this.victoryData.goldReward);
        }

        // Arena Complete celebration
        if (isArenaComplete) {
            this.showArenaCompleteMessage(400);
        }

        // Pet unlock notification
        this.showPetUnlockNotification();

        // Ready for Guild Trial message
        if (this.victoryData.readyForTrial && !isArenaComplete) {
            this.showGuildPrompt();
        } else {
            this.showContinueButton(isArenaComplete ? 520 : 480);
        }

        // Setup universal debugger
        this.debugger = new SceneDebugger(this, 'VictoryScene');
    }

    private showCoinReward(x: number, y: number, amount: number): void {
        // Create coin container with animated coins
        const container = this.add.container(x, y);

        // Coin icon (using emoji for now - can be replaced with sprite)
        const coinIcon = this.add.text(-30, 0, '🪙', {
            fontSize: '36px',
        }).setOrigin(0.5);

        // Amount text
        const amountText = this.add.text(20, 0, `+${amount}`, {
            fontSize: '32px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffaa00',
            fontStyle: 'bold'
        }).setOrigin(0, 0.5);

        container.add([coinIcon, amountText]);
        container.setAlpha(0).setScale(0.5);

        // Animate in
        this.tweens.add({
            targets: container,
            alpha: 1,
            scale: 1,
            duration: 400,
            delay: 700,
            ease: 'Back.out'
        });

        // Coin bounce animation
        this.tweens.add({
            targets: coinIcon,
            y: -10,
            duration: 300,
            delay: 1000,
            yoyo: true,
            repeat: 2,
            ease: 'Sine.inOut'
        });
    }

    private showArenaCompleteMessage(y: number): void {
        const arenaLevel = this.victoryData.arenaLevel || 1;
        const nextLevel = this.victoryData.nextArenaLevel || arenaLevel + 1;

        const completeText = this.add.text(640, y, `🏆 ARÉNA ${arenaLevel} DOKONČENA! 🏆`, {
            fontSize: '28px',
            fontFamily: 'Arial, sans-serif',
            color: '#00ff00',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5).setAlpha(0);

        this.tweens.add({
            targets: completeText,
            alpha: 1,
            duration: 500,
            delay: 1000
        });

        // Pulsing glow effect
        this.tweens.add({
            targets: completeText,
            scale: 1.1,
            duration: 800,
            delay: 1500,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.inOut'
        });

        // Show next arena info if available
        if (nextLevel <= 3) {
            const nextText = this.add.text(640, y + 50, `ARÉNA ${nextLevel} JE ODEMČENA!`, {
                fontSize: '20px',
                fontFamily: 'Arial, sans-serif',
                color: '#ffcc00',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 2
            }).setOrigin(0.5).setAlpha(0);

            this.tweens.add({
                targets: nextText,
                alpha: 1,
                duration: 500,
                delay: 1500
            });
        } else {
            // All arenas completed
            const finalText = this.add.text(640, y + 50, '🎉 VSE ARÉNY DOKONČENY! 🎉', {
                fontSize: '24px',
                fontFamily: 'Arial, sans-serif',
                color: '#ff88ff',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 2
            }).setOrigin(0.5).setAlpha(0);

            this.tweens.add({
                targets: finalText,
                alpha: 1,
                duration: 500,
                delay: 1500
            });
        }
    }

    private showGuildPrompt(): void {
        const startY = 400;

        // Ready for Trial Text
        const readyText = this.add.text(640, startY, 'JSI PŘIPRAVEN!', {
            fontSize: '36px',
            fontFamily: 'Arial, sans-serif',
            color: '#00ff00',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5).setScale(0);

        this.tweens.add({
            targets: readyText,
            scale: 1,
            duration: 500,
            delay: 500,
            ease: 'Back.out'
        });

        // Guild prompt message
        const guildText = this.add.text(640, startY + 60, 'JDI DO CECHU PRO ZKOUŠKU HRDINY!', {
            fontSize: '24px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffd700',
            fontStyle: 'bold'
        }).setOrigin(0.5).setAlpha(0);

        // Pulsing animation for guild text
        this.tweens.add({
            targets: guildText,
            alpha: 1,
            duration: 500,
            delay: 1000,
            onComplete: () => {
                this.tweens.add({
                    targets: guildText,
                    scale: 1.05,
                    duration: 800,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.inOut'
                });
            }
        });

        this.showContinueButton(560);
    }

    private showContinueButton(y: number): void {
        const button = this.add.container(640, y);

        const bg = this.add.rectangle(0, 0, 200, 60, 0x444444)
            .setStrokeStyle(2, 0xffffff);

        const text = this.add.text(0, 0, 'POKRAČOVAT', {
            fontSize: '24px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff'
        }).setOrigin(0.5);

        button.add([bg, text]);
        button.setAlpha(0);

        // Make interactive
        bg.setInteractive({ useHandCursor: true })
            .on('pointerover', () => bg.setFillStyle(0x666666))
            .on('pointerout', () => bg.setFillStyle(0x444444))
            .on('pointerdown', () => this.returnToTown());

        this.tweens.add({
            targets: button,
            alpha: 1,
            duration: 500,
            delay: 1500
        });

        // Also allow spacebar
        this.input.keyboard!.once('keydown-SPACE', () => this.returnToTown());
    }

    private returnToTown(): void {
        // Clear pet unlock notifications before leaving
        this.registry.remove('newPetUnlocks');
        this.scene.start('TownScene');
    }

    private showPetUnlockNotification(): void {
        const newPetUnlocks = this.registry.get('newPetUnlocks') as string[] | undefined;
        if (!newPetUnlocks || newPetUnlocks.length === 0) return;

        const y = this.victoryData.arenaComplete ? 340 : 360;

        // Create notification container
        const container = this.add.container(640, y);

        // Background
        const bg = this.add.rectangle(0, 0, 400, 50, 0x884488, 0.9)
            .setStrokeStyle(2, 0xaa66aa);
        container.add(bg);

        // Pet icon
        const petIcon = this.add.text(-150, 0, '🐾', {
            fontSize: '28px'
        }).setOrigin(0.5);
        container.add(petIcon);

        // Message
        const petNames = newPetUnlocks.join(', ');
        const message = this.add.text(20, 0,
            `NOVÝ MAZLÍČEK K DISPOZICI!\n${petNames}`, {
                fontSize: '14px',
                fontFamily: 'Arial, sans-serif',
                color: '#ffffff',
                fontStyle: 'bold',
                align: 'center'
            }).setOrigin(0.5);
        container.add(message);

        // Animate in
        container.setScale(0).setAlpha(0);
        this.tweens.add({
            targets: container,
            scale: 1,
            alpha: 1,
            duration: 500,
            delay: 1200,
            ease: 'Back.out'
        });

        // Glow animation
        this.tweens.add({
            targets: bg,
            strokeColor: { from: 0xaa66aa, to: 0xffaaff },
            duration: 600,
            delay: 1700,
            yoyo: true,
            repeat: 3
        });

        // Hint to visit witch
        const hint = this.add.text(640, y + 40, 'Navštiv čarodějnici pro koupi!', {
            fontSize: '12px',
            fontFamily: 'Arial, sans-serif',
            color: '#aaaaff'
        }).setOrigin(0.5).setAlpha(0);

        this.tweens.add({
            targets: hint,
            alpha: 1,
            duration: 500,
            delay: 2000
        });
    }
}
