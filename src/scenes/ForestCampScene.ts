import Phaser from 'phaser';
import { GameStateManager } from '../systems/GameStateManager';
import { JourneySystem } from '../systems/JourneySystem';

/**
 * Data passed to the scene
 */
interface SceneData {
    healPercent: number;
    isSavePoint: boolean;
    roomId: string;
    parentScene: string;
}

/**
 * ForestCampScene - Rest waypoint overlay
 *
 * Appears when the player interacts with a campfire/rest point.
 * Allows healing, saving progress, and returning to town.
 */
export class ForestCampScene extends Phaser.Scene {
    private gameState = GameStateManager.getInstance();
    private journeySystem = JourneySystem.getInstance();

    // Configuration
    private healPercent = 30;
    private isSavePoint = false;
    private roomId = '';
    private parentScene = '';

    // State
    private hasRested = false;

    constructor() {
        super({ key: 'ForestCampScene' });
    }

    init(data: SceneData): void {
        this.healPercent = data.healPercent || 30;
        this.isSavePoint = data.isSavePoint ?? false;
        this.roomId = data.roomId;
        this.parentScene = data.parentScene;
        this.hasRested = false;
    }

    create(): void {
        // Dim overlay
        const overlay = this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.7);
        overlay.setInteractive(); // Block clicks through

        // Main panel
        this.createPanel();
        this.createHPDisplay();
        this.createButtons();
    }

    private createPanel(): void {
        // Panel background
        this.add.rectangle(640, 360, 500, 420, 0x2a3a2a)
            .setStrokeStyle(4, 0x55aa55);

        // Campfire icon
        this.add.text(640, 190, '🏕️', { fontSize: '48px' }).setOrigin(0.5);

        // Title
        this.add.text(640, 250, 'LESNÍ TÁBOR', {
            fontSize: '32px',
            fontFamily: 'Arial, sans-serif',
            color: '#88cc88',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5);

        // Waypoint indicator
        if (this.isSavePoint) {
            this.add.text(640, 285, '⭐ Úložný bod', {
                fontSize: '14px',
                fontFamily: 'Arial, sans-serif',
                color: '#ffdd44'
            }).setOrigin(0.5);
        }
    }

    private createHPDisplay(): void {
        const player = this.gameState.getPlayer();
        const hpPercent = player.hp / player.maxHp;

        // HP Label
        this.add.text(490, 330, 'HP:', {
            fontSize: '20px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold'
        });

        // HP Bar background
        this.add.rectangle(640, 330, 250, 24, 0x333333)
            .setStrokeStyle(2, 0x666666);

        // HP Bar fill
        const hpBarFill = this.add.rectangle(517, 330, 246 * hpPercent, 20, this.getHPColor(hpPercent))
            .setOrigin(0, 0.5);

        // HP Text
        this.add.text(640, 330, `${player.hp} / ${player.maxHp}`, {
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        // Potential heal amount
        const healAmount = Math.floor(player.maxHp * (this.healPercent / 100));
        const potentialHP = Math.min(player.maxHp, player.hp + healAmount);

        if (player.hp < player.maxHp) {
            this.add.text(640, 360, `Odpočinek: +${healAmount} HP → ${potentialHP}`, {
                fontSize: '14px',
                fontFamily: 'Arial, sans-serif',
                color: '#88cc88'
            }).setOrigin(0.5);
        }
    }

    private getHPColor(percent: number): number {
        if (percent > 0.6) return 0x44aa44;
        if (percent > 0.3) return 0xaaaa44;
        return 0xaa4444;
    }

    private createButtons(): void {
        const buttonY = 430;
        const buttonSpacing = 60;

        // Rest button
        this.createButton(640, buttonY, '🔥 Odpočinek', `+${this.healPercent}% HP`, 0x446644, () => {
            this.handleRest();
        });

        // Return to town button
        this.createButton(640, buttonY + buttonSpacing, '🏠 Návrat do vesnice', 'Vzdát výpravu', 0x664444, () => {
            this.handleReturnToTown();
        });

        // Continue button
        this.createButton(640, buttonY + buttonSpacing * 2, '▶️ Pokračovat', 'Zavřít', 0x445566, () => {
            this.handleContinue();
        });
    }

    private createButton(x: number, y: number, label: string, sublabel: string, color: number, onClick: () => void): Phaser.GameObjects.Container {
        const btn = this.add.container(x, y);

        const bg = this.add.rectangle(0, 0, 320, 50, color)
            .setStrokeStyle(2, this.lightenColor(color));

        const mainText = this.add.text(-10, -8, label, {
            fontSize: '18px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        const subText = this.add.text(-10, 12, sublabel, {
            fontSize: '12px',
            fontFamily: 'Arial, sans-serif',
            color: '#aaaaaa'
        }).setOrigin(0.5);

        btn.add([bg, mainText, subText]);
        btn.setSize(320, 50);
        btn.setInteractive({ useHandCursor: true });

        btn.on('pointerover', () => bg.setFillStyle(this.lightenColor(color)));
        btn.on('pointerout', () => bg.setFillStyle(color));
        btn.on('pointerdown', onClick);

        return btn;
    }

    private lightenColor(color: number): number {
        const r = Math.min(255, ((color >> 16) & 0xff) + 30);
        const g = Math.min(255, ((color >> 8) & 0xff) + 30);
        const b = Math.min(255, (color & 0xff) + 30);
        return (r << 16) | (g << 8) | b;
    }

    private handleRest(): void {
        if (this.hasRested) {
            this.showMessage('Už jsi odpočíval!');
            return;
        }

        this.hasRested = true;

        // Apply healing
        this.journeySystem.applyHeal(this.healPercent);

        // Create save point if applicable
        if (this.isSavePoint) {
            this.journeySystem.createRoomSavePoint();
            this.journeySystem.unlockWaypoint(this.roomId);
        }

        // Show heal animation
        const player = this.gameState.getPlayer();
        const healAmount = Math.floor(player.maxHp * (this.healPercent / 100));

        const healText = this.add.text(640, 300, `+${healAmount} HP`, {
            fontSize: '28px',
            fontFamily: 'Arial, sans-serif',
            color: '#44ff44',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5);

        this.tweens.add({
            targets: healText,
            y: 250,
            alpha: 0,
            duration: 1500,
            onComplete: () => healText.destroy()
        });

        // Save point notification
        if (this.isSavePoint) {
            this.time.delayedCall(500, () => {
                const saveText = this.add.text(640, 280, '⭐ Postup uložen!', {
                    fontSize: '20px',
                    fontFamily: 'Arial, sans-serif',
                    color: '#ffdd44',
                    stroke: '#000000',
                    strokeThickness: 2
                }).setOrigin(0.5);

                this.tweens.add({
                    targets: saveText,
                    alpha: 0,
                    duration: 2000,
                    delay: 1000,
                    onComplete: () => saveText.destroy()
                });
            });
        }

        // Refresh display after a moment
        this.time.delayedCall(300, () => {
            this.scene.restart({
                healPercent: this.healPercent,
                isSavePoint: this.isSavePoint,
                roomId: this.roomId,
                parentScene: this.parentScene
            });
        });
    }

    private handleReturnToTown(): void {
        // Confirm dialog
        const confirmOverlay = this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.5)
            .setDepth(100);

        const confirmPanel = this.add.container(640, 360).setDepth(101);

        const bg = this.add.rectangle(0, 0, 350, 180, 0x333355)
            .setStrokeStyle(3, 0x5566aa);

        const title = this.add.text(0, -50, 'Opustit výpravu?', {
            fontSize: '22px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        const warning = this.add.text(0, -15, 'Ztratíš veškerý postup.', {
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffaa44'
        }).setOrigin(0.5);

        // Yes button
        const yesBtn = this.add.rectangle(-70, 45, 100, 40, 0x884444)
            .setStrokeStyle(2, 0xaa6666)
            .setInteractive({ useHandCursor: true });
        const yesText = this.add.text(-70, 45, 'Ano', {
            fontSize: '16px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff'
        }).setOrigin(0.5);

        yesBtn.on('pointerover', () => yesBtn.setFillStyle(0xaa5555));
        yesBtn.on('pointerout', () => yesBtn.setFillStyle(0x884444));
        yesBtn.on('pointerdown', () => {
            this.journeySystem.abandonJourney();
            this.scene.stop(this.parentScene);
            this.scene.start('TownScene');
        });

        // No button
        const noBtn = this.add.rectangle(70, 45, 100, 40, 0x448844)
            .setStrokeStyle(2, 0x66aa66)
            .setInteractive({ useHandCursor: true });
        const noText = this.add.text(70, 45, 'Ne', {
            fontSize: '16px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff'
        }).setOrigin(0.5);

        noBtn.on('pointerover', () => noBtn.setFillStyle(0x55aa55));
        noBtn.on('pointerout', () => noBtn.setFillStyle(0x448844));
        noBtn.on('pointerdown', () => {
            confirmOverlay.destroy();
            confirmPanel.destroy();
        });

        confirmPanel.add([bg, title, warning, yesBtn, yesText, noBtn, noText]);
    }

    private handleContinue(): void {
        // Close this overlay and resume parent
        this.cameras.main.fadeOut(200, 0, 0, 0);

        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.resume(this.parentScene);
            this.scene.stop();
        });
    }

    private showMessage(text: string): void {
        const msg = this.add.text(640, 390, text, {
            fontSize: '16px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffaa44',
            backgroundColor: '#333333',
            padding: { x: 10, y: 5 }
        }).setOrigin(0.5).setDepth(50);

        this.tweens.add({
            targets: msg,
            alpha: 0,
            duration: 1500,
            delay: 1000,
            onComplete: () => msg.destroy()
        });
    }
}
