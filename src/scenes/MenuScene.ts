import Phaser from 'phaser';
import { SaveSystem } from '../systems/SaveSystem';
import { GameStateManager } from '../systems/GameStateManager';

export class MenuScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MenuScene' });
    }

    create(): void {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        // Title
        this.add.text(width / 2, height / 4, 'LITTLE MATH ADVENTURE', {
            fontSize: '48px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold',
        }).setOrigin(0.5);

        // Subtitle
        this.add.text(width / 2, height / 4 + 50, 'MATEMATICKÉ DOBRODRUŽSTVÍ', {
            fontSize: '24px',
            fontFamily: 'Arial, sans-serif',
            color: '#aaaaaa',
        }).setOrigin(0.5);

        const hasSave = SaveSystem.hasSave();
        let buttonY = height / 2;

        // Continue button (only if save exists)
        if (hasSave) {
            const continueBtn = this.createMenuButton(width / 2, buttonY, 'POKRAČOVAT', '#44aa44');
            continueBtn.on('pointerdown', () => {
                this.scene.start('TownScene');
            });
            buttonY += 60;
        }

        // New Game button
        const newGameBtn = this.createMenuButton(width / 2, buttonY, 'NOVÁ HRA', hasSave ? '#aa8844' : '#44aa44');
        newGameBtn.on('pointerdown', () => {
            if (hasSave) {
                this.showConfirmDialog(width, height);
            } else {
                this.startNewGame();
            }
        });
    }

    private createMenuButton(x: number, y: number, text: string, color: string): Phaser.GameObjects.Text {
        const btn = this.add.text(x, y, text, {
            fontSize: '32px',
            fontFamily: 'Arial, sans-serif',
            color: color,
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        const hoverColor = this.lightenColor(color);
        btn.on('pointerover', () => btn.setColor(hoverColor));
        btn.on('pointerout', () => btn.setColor(color));

        return btn;
    }

    private lightenColor(hex: string): string {
        // Simple color lightening
        const colors: Record<string, string> = {
            '#44aa44': '#88ff88',
            '#aa8844': '#ddbb77',
            '#aa4444': '#ff8888',
        };
        return colors[hex] || '#ffffff';
    }

    private showConfirmDialog(width: number, height: number): void {
        // Dark overlay
        const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.8)
            .setInteractive();

        // Dialog box
        const dialog = this.add.container(width / 2, height / 2);

        const bg = this.add.rectangle(0, 0, 400, 200, 0x333333)
            .setStrokeStyle(3, 0x666666);
        dialog.add(bg);

        const title = this.add.text(0, -60, 'ZAČÍT NOVOU HRU?', {
            fontSize: '28px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold',
        }).setOrigin(0.5);
        dialog.add(title);

        const warning = this.add.text(0, -20, 'SOUČASNÝ POSTUP BUDE SMAZÁN!', {
            fontSize: '18px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffaaaa',
        }).setOrigin(0.5);
        dialog.add(warning);

        // Yes button
        const yesBtn = this.add.text(-70, 50, 'ANO', {
            fontSize: '24px',
            fontFamily: 'Arial, sans-serif',
            color: '#44aa44',
            backgroundColor: '#224422',
            padding: { x: 20, y: 10 },
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        yesBtn.on('pointerover', () => yesBtn.setColor('#88ff88'));
        yesBtn.on('pointerout', () => yesBtn.setColor('#44aa44'));
        yesBtn.on('pointerdown', () => {
            overlay.destroy();
            dialog.destroy();
            this.startNewGame();
        });
        dialog.add(yesBtn);

        // No button
        const noBtn = this.add.text(70, 50, 'NE', {
            fontSize: '24px',
            fontFamily: 'Arial, sans-serif',
            color: '#aa4444',
            backgroundColor: '#442222',
            padding: { x: 20, y: 10 },
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        noBtn.on('pointerover', () => noBtn.setColor('#ff8888'));
        noBtn.on('pointerout', () => noBtn.setColor('#aa4444'));
        noBtn.on('pointerdown', () => {
            overlay.destroy();
            dialog.destroy();
        });
        dialog.add(noBtn);
    }

    private startNewGame(): void {
        // Reset game state
        GameStateManager.getInstance().reset();
        this.scene.start('TownScene');
    }
}
