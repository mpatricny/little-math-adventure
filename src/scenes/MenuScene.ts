import Phaser from 'phaser';
import { SaveSystem } from '../systems/SaveSystem';
import { GameStateManager } from '../systems/GameStateManager';
import { SceneDebugger } from '../systems/SceneDebugger';
import { SceneBuilder } from '../systems/SceneBuilder';

export class MenuScene extends Phaser.Scene {
    private debugger!: SceneDebugger;
    private sceneBuilder!: SceneBuilder;

    constructor() {
        super({ key: 'MenuScene' });
    }

    create(): void {
        this.sceneBuilder = new SceneBuilder(this);

        // Register handlers before building
        this.sceneBuilder.registerHandler('onContinue', () => {
            this.scene.start('TownScene');
        });

        this.sceneBuilder.registerHandler('onNewGame', () => {
            if (SaveSystem.hasSave()) {
                this.showConfirmDialog();
            } else {
                this.startNewGame();
            }
        });

        // Build the scene from JSON
        this.sceneBuilder.buildScene('MenuScene');

        // Handle dynamic state (Continue button visibility and positioning)
        const hasSave = SaveSystem.hasSave();
        const btnContinue = this.sceneBuilder.get<Phaser.GameObjects.Container>('btnContinue');
        const btnNewGame = this.sceneBuilder.get<Phaser.GameObjects.Container>('btnNewGame');

        if (hasSave) {
            if (btnContinue) btnContinue.setVisible(true);
        } else {
            // If no save, move New Game button up to where Continue would be
            if (btnNewGame && btnContinue) {
                btnNewGame.y = btnContinue.y;
            }
        }

        // Setup universal debugger
        this.debugger = new SceneDebugger(this, 'MenuScene');
    }

    private showConfirmDialog(): void {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        // Dark overlay
        const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.8)
            .setInteractive()
            .setDepth(100);

        // Dialog box
        const dialog = this.add.container(width / 2, height / 2)
            .setDepth(101);

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
        // Reset game state completely
        GameStateManager.getInstance().reset();

        // Destroy the singleton so it reloads fresh data in TownScene
        GameStateManager.destroyInstance();

        this.scene.start('TownScene');
    }
}
