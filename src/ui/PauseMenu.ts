import Phaser from 'phaser';
import { GameStateManager } from '../systems/GameStateManager';

/**
 * Reusable pause menu overlay component
 * Can be added to any scene to provide ESC key pause functionality
 */
export class PauseMenu {
    private scene: Phaser.Scene;
    private container!: Phaser.GameObjects.Container;
    private isVisible: boolean = false;
    private onResumeCallback?: () => void;
    private escKey!: Phaser.Input.Keyboard.Key;

    constructor(scene: Phaser.Scene, onResume?: () => void) {
        this.scene = scene;
        this.onResumeCallback = onResume;
        this.createUI();
        this.setupInput();
    }

    private createUI(): void {
        const centerX = this.scene.cameras.main.width / 2;
        const centerY = this.scene.cameras.main.height / 2;

        this.container = this.scene.add.container(centerX, centerY)
            .setDepth(9999)
            .setScrollFactor(0)
            .setVisible(false);

        // Dark overlay (covers entire screen)
        const overlay = this.scene.add.rectangle(0, 0, 1280, 720, 0x000000, 0.8)
            .setInteractive(); // Block clicks through to game

        // Dialog panel
        const panel = this.scene.add.rectangle(0, 0, 400, 280, 0x2a2a3a)
            .setStrokeStyle(3, 0x5588aa);

        // Title
        const title = this.scene.add.text(0, -100, 'PAUZA', {
            fontSize: '36px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        // Resume button
        const resumeBtn = this.createButton(0, -20, 'POKRACOVAT', () => this.hide());

        // Quit button
        const quitBtn = this.createButton(0, 60, 'ODEJIT DO MENU', () => this.quitToMenu());

        this.container.add([overlay, panel, title, resumeBtn, quitBtn]);
    }

    private createButton(x: number, y: number, text: string, onClick: () => void): Phaser.GameObjects.Container {
        const btn = this.scene.add.container(x, y);

        const bg = this.scene.add.rectangle(0, 0, 280, 50, 0x444466)
            .setStrokeStyle(2, 0x6688aa)
            .setInteractive({ useHandCursor: true });

        const label = this.scene.add.text(0, 0, text, {
            fontSize: '22px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff'
        }).setOrigin(0.5);

        // Hover effects
        bg.on('pointerover', () => {
            bg.setFillStyle(0x555588);
            label.setColor('#ffdd88');
        });

        bg.on('pointerout', () => {
            bg.setFillStyle(0x444466);
            label.setColor('#ffffff');
        });

        bg.on('pointerdown', onClick);

        btn.add([bg, label]);
        return btn;
    }

    private setupInput(): void {
        // Create ESC key listener
        this.escKey = this.scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

        // Check for ESC key in scene update
        this.scene.events.on('update', this.checkEscKey, this);

        // Clean up when scene shuts down
        this.scene.events.once('shutdown', () => {
            this.scene.events.off('update', this.checkEscKey, this);
        });
    }

    private checkEscKey = (): void => {
        if (Phaser.Input.Keyboard.JustDown(this.escKey)) {
            this.toggle();
        }
    };

    /**
     * Toggle the pause menu visibility
     */
    public toggle(): void {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    /**
     * Show the pause menu
     */
    public show(): void {
        this.isVisible = true;
        this.container.setVisible(true);

        // Pause game time
        this.scene.time.paused = true;

        // Pause physics if active
        if (this.scene.physics && this.scene.physics.world) {
            this.scene.physics.pause();
        }

        // Pause all tweens
        this.scene.tweens.pauseAll();
    }

    /**
     * Hide the pause menu and resume game
     */
    public hide(): void {
        this.isVisible = false;
        this.container.setVisible(false);

        // Resume game time
        this.scene.time.paused = false;

        // Resume physics if it was paused
        if (this.scene.physics && this.scene.physics.world) {
            this.scene.physics.resume();
        }

        // Resume all tweens
        this.scene.tweens.resumeAll();

        // Call resume callback if provided
        this.onResumeCallback?.();
    }

    /**
     * Save game and return to menu
     */
    private quitToMenu(): void {
        // Auto-save current state
        const gameState = GameStateManager.getInstance();
        const player = gameState.getPlayer();

        // If in arena, reset arena state (player loses progress but keeps items)
        if (player.arena.isActive) {
            player.arena.isActive = false;
            player.hp = player.arena.playerHpAtStart; // Restore HP from before arena
        }

        gameState.save();

        // Resume time before switching scenes
        this.scene.time.paused = false;
        if (this.scene.physics && this.scene.physics.world) {
            this.scene.physics.resume();
        }
        this.scene.tweens.resumeAll();

        // Go to menu
        this.scene.scene.start('MenuScene');
    }

    /**
     * Check if pause menu is currently visible
     */
    public isPaused(): boolean {
        return this.isVisible;
    }

    /**
     * Destroy the pause menu and clean up
     */
    public destroy(): void {
        this.scene.events.off('update', this.checkEscKey, this);
        this.container.destroy();
    }
}
