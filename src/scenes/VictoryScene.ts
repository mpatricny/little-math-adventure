import Phaser from 'phaser';

interface VictoryData {
    xpReward: number;
    goldReward: number;
    enemyName: string;
    levelUpResult?: {
        leveledUp: boolean;
        newLevel: number;
        hpGain: number;
        attackGain: number;
    };
}

export class VictoryScene extends Phaser.Scene {
    private victoryData!: VictoryData;

    constructor() {
        super({ key: 'VictoryScene' });
    }

    init(data: VictoryData): void {
        this.victoryData = data;
    }

    create(): void {
        // Dark background overlay
        this.add.rectangle(400, 300, 800, 600, 0x000000, 0.8);

        // Victory Title
        const title = this.add.text(400, 100, 'VÍTĚZSTVÍ!', {
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

        // Enemy Defeated Text
        this.add.text(400, 180, `PORAZIL JSI: ${this.victoryData.enemyName.toUpperCase()}`, {
            fontSize: '24px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff'
        }).setOrigin(0.5).setAlpha(0);

        // Rewards Container
        const rewardsY = 250;

        // XP Reward
        this.add.text(300, rewardsY, `XP: +${this.victoryData.xpReward}`, {
            fontSize: '32px',
            fontFamily: 'Arial, sans-serif',
            color: '#44aaff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        // Gold Reward
        this.add.text(500, rewardsY, `ZLATO: +${this.victoryData.goldReward}`, {
            fontSize: '32px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffaa00',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        // Level Up Handling
        if (this.victoryData.levelUpResult && this.victoryData.levelUpResult.leveledUp) {
            this.showLevelUp(this.victoryData.levelUpResult);
        } else {
            this.showContinueButton(400);
        }
    }

    private showLevelUp(result: { newLevel: number; hpGain: number; attackGain: number }): void {
        const startY = 350;

        // Level Up Text
        const levelText = this.add.text(400, startY, `NOVÁ ÚROVEŇ: ${result.newLevel}!`, {
            fontSize: '36px',
            fontFamily: 'Arial, sans-serif',
            color: '#00ff00',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5).setScale(0);

        this.tweens.add({
            targets: levelText,
            scale: 1,
            duration: 500,
            delay: 500,
            ease: 'Back.out'
        });

        // Stats Increase
        const statsText = [
            `MAX HP: +${result.hpGain}`,
            `ÚTOK: +${result.attackGain}`,
            `ZDRAVÍ DOPLNĚNO!`
        ];

        statsText.forEach((text, index) => {
            this.add.text(400, startY + 60 + (index * 40), text, {
                fontSize: '24px',
                fontFamily: 'Arial, sans-serif',
                color: '#ffffff'
            }).setOrigin(0.5).setAlpha(0);
        });

        // Fade in stats
        this.tweens.add({
            targets: this.children.list.slice(-3), // Last 3 text objects
            alpha: 1,
            duration: 500,
            delay: 1000,
            stagger: 200
        });

        this.showContinueButton(550);
    }

    private showContinueButton(y: number): void {
        const button = this.add.container(400, y);

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
        this.scene.start('TownScene');
    }
}
