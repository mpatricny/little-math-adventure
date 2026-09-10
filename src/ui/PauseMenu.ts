import { audioSettingsButton, openAudioSettings } from '../scenes/AudioSettingsScene';
import { gameAudio } from '../audio/AudioDirector';
import Phaser from 'phaser';
import { GameStateManager } from '../systems/GameStateManager';
import { CoopSessionManager } from '../systems/CoopSessionManager';
import { TvFullscreenController, TvFullscreenState } from '../remote/TvFullscreenController';
import { requestLandscapeLock } from '../utils/mobileSetup';

export type PauseMenuHost = {
    x: number;
    y: number;
    depth: number;
    width: number;
    height: number;
};

export type PauseMenuLayout = {
    overlay: PauseMenuHost;
    panel: PauseMenuHost;
    title: PauseMenuHost;
    resumeButton: PauseMenuHost;
    fullscreenButton: PauseMenuHost;
    tvButton: PauseMenuHost;
    quitButton: PauseMenuHost;
};

type PauseMenuButton = {
    root: Phaser.GameObjects.Container;
    background: Phaser.GameObjects.Rectangle;
    label: Phaser.GameObjects.Text;
};

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
    private readonly variant: 'default' | 'medieval';
    private readonly showTvPairing: boolean;
    private readonly showFullscreen: boolean;
    private readonly titleText: string;
    private readonly resumeLabel: string;
    private readonly quitLabel: string;
    private readonly onQuitToMenu?: () => void;
    private readonly layout: PauseMenuLayout;
    private fullscreen: TvFullscreenController | null = null;
    private fullscreenButton: PauseMenuButton | null = null;
    private unsubscribeFullscreen: (() => void) | null = null;

    constructor(
        scene: Phaser.Scene,
        onResume?: () => void,
        options: {
            variant?: 'default' | 'medieval';
            layout?: PauseMenuLayout;
            showTvPairing?: boolean;
            showFullscreen?: boolean;
            title?: string;
            resumeLabel?: string;
            quitLabel?: string;
            onQuitToMenu?: () => void;
        } = {},
    ) {
        this.scene = scene;
        this.onResumeCallback = onResume;
        this.variant = options.variant ?? 'default';
        this.showTvPairing = options.showTvPairing ?? false;
        this.showFullscreen = options.showFullscreen ?? false;
        this.titleText = options.title ?? 'PAUZA';
        this.resumeLabel = options.resumeLabel ?? 'POKRAČOVAT';
        this.quitLabel = options.quitLabel ?? 'ODEJÍT DO MENU';
        this.onQuitToMenu = options.onQuitToMenu;
        this.layout = options.layout ?? this.createDefaultLayout();
        this.createUI();
        this.setupInput();
    }

    private createDefaultLayout(): PauseMenuLayout {
        const centerX = this.scene.cameras.main.width / 2;
        const centerY = this.scene.cameras.main.height / 2;
        const optionCount = 2 + Number(this.showFullscreen) + Number(this.showTvPairing);
        const expanded = optionCount > 2;
        const firstButtonY = expanded ? centerY - 100 : centerY - 20;
        const buttonGap = 70;
        return {
            overlay: { x: centerX, y: centerY, depth: 9998, width: 1280, height: 720 },
            panel: { x: centerX, y: centerY, depth: 9999, width: expanded ? 430 : 400, height: expanded ? 460 : 280 },
            title: { x: centerX, y: expanded ? centerY - 180 : centerY - 100, depth: 10000, width: 320, height: 50 },
            resumeButton: { x: centerX, y: firstButtonY, depth: 10000, width: expanded ? 300 : 280, height: 50 },
            fullscreenButton: { x: centerX, y: firstButtonY + buttonGap, depth: 10000, width: 300, height: 50 },
            tvButton: { x: centerX, y: firstButtonY + buttonGap * (this.showFullscreen ? 2 : 1), depth: 10000, width: 300, height: 50 },
            quitButton: { x: centerX, y: firstButtonY + buttonGap * (optionCount - 1), depth: 10000, width: expanded ? 300 : 280, height: 50 },
        };
    }

    private createUI(): void {
        this.container = this.scene.add.container(0, 0)
            .setDepth(9999)
            .setScrollFactor(0)
            .setVisible(false);

        // Dark overlay (covers entire screen)
        const overlay = this.scene.add.rectangle(
            this.layout.overlay.x,
            this.layout.overlay.y,
            this.layout.overlay.width,
            this.layout.overlay.height,
            0x000000,
            0.8,
        )
            .setInteractive(); // Block clicks through to game

        // Dialog panel. BattleScene opts into the leather/copper variant;
        // ArenaScene keeps the original presentation until its redesign.
        const panel = this.scene.add.rectangle(
            this.layout.panel.x,
            this.layout.panel.y,
            this.layout.panel.width,
            this.layout.panel.height,
            this.variant === 'medieval' ? 0x17110d : 0x2a2a3a,
        ).setStrokeStyle(
            this.variant === 'medieval' ? 5 : 3,
            this.variant === 'medieval' ? 0x9a6433 : 0x5588aa,
        );
        const innerBorder = this.variant === 'medieval'
            ? this.scene.add.rectangle(
                this.layout.panel.x,
                this.layout.panel.y,
                this.layout.panel.width - 18,
                this.layout.panel.height - 18,
                0x000000,
                0,
            )
                .setStrokeStyle(1, 0xe1a85c, 0.9)
            : null;

        // Title
        const title = this.scene.add.text(this.layout.title.x, this.layout.title.y, this.titleText, {
            fontSize: '36px',
            fontFamily: this.variant === 'medieval'
                ? 'Palatino Linotype, Book Antiqua, Georgia, serif'
                : 'Arial, sans-serif',
            color: this.variant === 'medieval' ? '#ffe1a0' : '#ffffff',
            fontStyle: 'bold',
            stroke: this.variant === 'medieval' ? '#32180d' : '#000000',
            strokeThickness: this.variant === 'medieval' ? 4 : 0,
        }).setOrigin(0.5);

        // Resume button
        const resumeBtn = this.createButton(this.layout.resumeButton, this.resumeLabel, () => this.hide());

        if (this.showFullscreen) {
            this.fullscreen = new TvFullscreenController(document.documentElement);
            this.fullscreenButton = this.createButton(
                this.layout.fullscreenButton,
                'CELÁ OBRAZOVKA',
                () => { void this.toggleFullscreen(); },
            );
            this.unsubscribeFullscreen = this.fullscreen.onChange((state) => {
                this.updateFullscreenButton(state);
                this.scene.scale.refresh();
            });
        }

        // TV pairing is optional and starts only after this explicit user action.
        const tvBtn = this.showTvPairing
            ? this.createButton(this.layout.tvButton, 'PROPOJIT S TV', () => this.openTvPairing())
            : null;

        // Quit button
        const quitBtn = this.createButton(this.layout.quitButton, this.quitLabel, () => this.quitToMenu());

        this.container.add([
            overlay,
            panel,
            ...(innerBorder ? [innerBorder] : []),
            title,
            resumeBtn.root,
            ...(this.fullscreenButton ? [this.fullscreenButton.root] : []),
            ...(tvBtn ? [tvBtn.root] : []),
            quitBtn.root,
            audioSettingsButton(this.scene, () => { this.hide(); openAudioSettings(this.scene); }, 'audioPauseOpen'),
        ]);
    }

    private createButton(host: PauseMenuHost, text: string, onClick: () => void): PauseMenuButton {
        const btn = this.scene.add.container(host.x, host.y);

        const medieval = this.variant === 'medieval';
        const bg = this.scene.add.rectangle(0, 0, host.width, host.height, medieval ? 0x3b2618 : 0x444466)
            .setStrokeStyle(2, medieval ? 0x9a6433 : 0x6688aa)
            .setInteractive({ useHandCursor: true });

        const label = this.scene.add.text(0, 0, text, {
            fontSize: '22px',
            fontFamily: medieval
                ? 'Palatino Linotype, Book Antiqua, Georgia, serif'
                : 'Arial, sans-serif',
            color: medieval ? '#f5d18b' : '#ffffff',
            fontStyle: medieval ? 'bold' : 'normal',
        }).setOrigin(0.5);

        // Hover effects
        bg.on('pointerover', () => {
            bg.setFillStyle(medieval ? 0x56351d : 0x555588);
            label.setColor(medieval ? '#ffffff' : '#ffdd88');
        });

        bg.on('pointerout', () => {
            bg.setFillStyle(medieval ? 0x3b2618 : 0x444466);
            label.setColor(medieval ? '#f5d18b' : '#ffffff');
        });

        bg.on('pointerdown', onClick);

        btn.add([bg, label]);
        return { root: btn, background: bg, label };
    }

    private async toggleFullscreen(): Promise<void> {
        if (!this.fullscreen) return;

        try {
            const changed = await this.fullscreen.toggle();
            if (!changed) {
                this.fullscreenButton?.label.setText('FULLSCREEN SE NEPODAŘIL');
                return;
            }
            if (this.fullscreen.isFullscreen()) void requestLandscapeLock();
        } catch (error) {
            console.warn('[PauseMenu] Fullscreen request failed:', error);
            this.fullscreenButton?.label.setText('FULLSCREEN SE NEPODAŘIL');
        }
    }

    private updateFullscreenButton(state: TvFullscreenState): void {
        if (!this.fullscreenButton) return;

        if (state === 'fullscreen') {
            this.fullscreenButton.background.setInteractive({ useHandCursor: true });
            this.fullscreenButton.label.setText('UKONČIT FULLSCREEN').setFontSize(20);
        } else if (state === 'unsupported') {
            this.fullscreenButton.label.setText('FULLSCREEN NENÍ DOSTUPNÝ').setFontSize(17);
            this.fullscreenButton.background.disableInteractive();
        } else {
            this.fullscreenButton.background.setInteractive({ useHandCursor: true });
            this.fullscreenButton.label.setText('CELÁ OBRAZOVKA').setFontSize(22);
        }
    }

    private openTvPairing(): void {
        const returnScene = this.scene.sys.settings.key;

        // Save durable progress, then keep the running scene paused underneath
        // the pairing screen so the player can return without losing the battle.
        GameStateManager.getInstance().save();
        this.hide();
        this.scene.scene.launch('TvPairingScene', { returnScene });
        this.scene.scene.pause(returnScene);
    }

    private setupInput(): void {
        // Create ESC key listener
        this.escKey = this.scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

        // Check for ESC key in scene update
        this.scene.events.on('update', this.checkEscKey, this);

        // Clean up when scene shuts down
        this.scene.events.once('shutdown', () => {
            this.scene.events.off('update', this.checkEscKey, this);
            this.unsubscribeFullscreen?.();
            this.unsubscribeFullscreen = null;
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
        gameAudio().setPaused(this.scene, true);
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
        gameAudio().setPaused(this.scene, false);
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
        if (this.onQuitToMenu) {
            this.resumeSceneForTransition();
            this.onQuitToMenu();
            return;
        }

        // End co-op session if active
        const coop = CoopSessionManager.getInstance();
        if (coop.isCoopActive()) {
            coop.endSession();
        }

        // Auto-save current state
        const gameState = GameStateManager.getInstance();
        const player = gameState.getPlayer();

        // If in arena, reset arena state (player loses progress but keeps items)
        if (player.arena.isActive) {
            player.arena.isActive = false;
            player.hp = player.arena.playerHpAtStart;
        }

        gameState.save();

        // Resume time before switching scenes
        this.resumeSceneForTransition();

        // Go to menu
        this.scene.scene.start('MenuScene');
    }

    private resumeSceneForTransition(): void {
        this.isVisible = false;
        gameAudio().setPaused(this.scene, false);
        this.container.setVisible(false);
        this.scene.time.paused = false;
        if (this.scene.physics && this.scene.physics.world) {
            this.scene.physics.resume();
        }
        this.scene.tweens.resumeAll();
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
        this.unsubscribeFullscreen?.();
        this.unsubscribeFullscreen = null;
        this.container.destroy();
    }
}
