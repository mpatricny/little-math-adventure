import Phaser from 'phaser';

/**
 * Scene initialization data
 */
interface ComicSceneData {
    skipToPanel?: number;  // For testing: start from a specific panel
}

/**
 * ComicScene - 6-panel intro comic viewer
 *
 * This scene displays the game's intro story through a series of
 * comic panels. It's designed for pre-readers, using visual storytelling
 * to convey the narrative of Zyx's crash landing and the player's mission.
 *
 * Features:
 * - Full-screen panels (1280x720) displayed one at a time
 * - Cross-fade transitions between panels
 * - Click/tap anywhere to advance to next panel
 * - Skip button (top-right corner) to jump to CrashSiteScene
 * - Auto-transitions to CrashSiteScene after final panel
 *
 * Panel Content (from GAME_DESIGN_DOCUMENT):
 * 1. Zyx's ship flying through stars (peaceful space scene)
 * 2. Ship being struck by something (danger!)
 * 3. Ship crash-landing on planet
 * 4. Zyx emerging from crashed ship
 * 5. Confused creatures with swirling "chaos" effects
 * 6. Zyx pointing at the chaos, player figure appearing
 */
export class ComicScene extends Phaser.Scene {
    // Panel texture keys (in order)
    // All panels are registered in textures.json from the asset library
    private static readonly PANEL_KEYS = [
        'Intro_Comic_1-cropped',    // Panel 1
        'intro-comic-2-cropped',    // Panel 2
        'Intro_comic_3-cropped',    // Panel 3
        'Intro_comic_4-cropped',    // Panel 4
        'Intro_comic_5-cropped',    // Panel 5
        'Intro_comic_6-cropped',    // Panel 6
    ];

    private currentPanelIndex = 0;
    private currentPanel: Phaser.GameObjects.Image | null = null;
    private nextPanel: Phaser.GameObjects.Image | null = null;
    private isTransitioning = false;
    private skipButton: Phaser.GameObjects.Container | null = null;
    private panelIndicators: Phaser.GameObjects.Container | null = null;

    constructor() {
        super({ key: 'ComicScene' });
    }

    init(data: ComicSceneData): void {
        this.currentPanelIndex = data.skipToPanel ?? 0;
        this.isTransitioning = false;
        this.currentPanel = null;
        this.nextPanel = null;
    }

    create(): void {
        // Black background
        this.add.rectangle(640, 360, 1280, 720, 0x000000).setDepth(-10);

        // Display first panel
        this.showPanel(this.currentPanelIndex);

        // Create skip button
        this.createSkipButton();

        // Create panel progress indicators
        this.createPanelIndicators();

        // Setup input for advancing panels
        this.setupInput();

        // Fade in from black
        this.cameras.main.fadeIn(500, 0, 0, 0);
    }

    /**
     * Show a specific panel with fade-in effect
     */
    private showPanel(index: number): void {
        const key = this.getPanelKey(index);

        // Create the panel image
        const panel = this.add.image(640, 360, key)
            .setOrigin(0.5)
            .setDepth(0);

        // Scale to fit screen while maintaining aspect ratio
        this.fitPanelToScreen(panel);

        // Set as current panel
        this.currentPanel = panel;

        // Fade in
        panel.setAlpha(0);
        this.tweens.add({
            targets: panel,
            alpha: 1,
            duration: 400,
            ease: 'Power2.easeOut',
        });

        // Update indicators
        this.updatePanelIndicators();
    }

    /**
     * Get the texture key for a panel, with fallback for missing textures
     */
    private getPanelKey(index: number): string {
        const key = ComicScene.PANEL_KEYS[index];

        // Check if texture exists
        if (this.textures.exists(key)) {
            return key;
        }

        // Fallback: use panel 1 if available, otherwise any available panel
        console.warn(`[ComicScene] Panel texture missing: ${key}, using fallback`);

        for (const fallbackKey of ComicScene.PANEL_KEYS) {
            if (this.textures.exists(fallbackKey)) {
                return fallbackKey;
            }
        }

        // Last resort: return the requested key (will show missing texture placeholder)
        return key;
    }

    /**
     * Scale panel to fit screen while maintaining aspect ratio
     */
    private fitPanelToScreen(panel: Phaser.GameObjects.Image): void {
        const scaleX = 1280 / panel.width;
        const scaleY = 720 / panel.height;
        const scale = Math.max(scaleX, scaleY); // Use max to cover screen (crop if needed)
        panel.setScale(scale);
    }

    /**
     * Create the skip button in the top-right corner
     */
    private createSkipButton(): void {
        const container = this.add.container(1200, 50).setDepth(100);

        // Button background
        const bg = this.add.rectangle(0, 0, 120, 40, 0x444444, 0.8)
            .setStrokeStyle(2, 0x666666);

        // Button text
        const text = this.add.text(0, 0, 'Přeskočit ▸', {
            fontSize: '16px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
        }).setOrigin(0.5);

        container.add([bg, text]);
        container.setSize(120, 40);
        container.setInteractive({ useHandCursor: true });

        // Hover effects
        container.on('pointerover', () => {
            bg.setFillStyle(0x555555);
            text.setColor('#ffff88');
        });

        container.on('pointerout', () => {
            bg.setFillStyle(0x444444);
            text.setColor('#ffffff');
        });

        // Click to skip
        container.on('pointerdown', () => {
            this.skipToGame();
        });

        this.skipButton = container;

        // Start slightly transparent, fade in
        container.setAlpha(0.6);
        this.tweens.add({
            targets: container,
            alpha: 1,
            delay: 1000,
            duration: 500,
        });
    }

    /**
     * Create panel progress indicators (dots at bottom)
     */
    private createPanelIndicators(): void {
        const container = this.add.container(640, 680).setDepth(100);
        const totalPanels = ComicScene.PANEL_KEYS.length;
        const dotSpacing = 20;
        const startX = -((totalPanels - 1) * dotSpacing) / 2;

        for (let i = 0; i < totalPanels; i++) {
            const dot = this.add.circle(
                startX + i * dotSpacing,
                0,
                6,
                i === this.currentPanelIndex ? 0xffffff : 0x666666
            ).setName(`dot_${i}`);
            container.add(dot);
        }

        this.panelIndicators = container;
    }

    /**
     * Update panel indicators to show current position
     */
    private updatePanelIndicators(): void {
        if (!this.panelIndicators) return;

        const totalPanels = ComicScene.PANEL_KEYS.length;
        for (let i = 0; i < totalPanels; i++) {
            const dot = this.panelIndicators.getByName(`dot_${i}`) as Phaser.GameObjects.Arc;
            if (dot) {
                dot.setFillStyle(i === this.currentPanelIndex ? 0xffffff : 0x666666);
            }
        }
    }

    /**
     * Setup input for advancing panels
     */
    private setupInput(): void {
        // Click/tap anywhere (except skip button) advances to next panel
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            // Check if click is on skip button area
            if (pointer.x > 1140 && pointer.y < 90) {
                return; // Let skip button handle it
            }

            this.advancePanel();
        });

        // Keyboard support
        this.input.keyboard?.on('keydown-SPACE', () => this.advancePanel());
        this.input.keyboard?.on('keydown-ENTER', () => this.advancePanel());
        this.input.keyboard?.on('keydown-RIGHT', () => this.advancePanel());
        this.input.keyboard?.on('keydown-ESC', () => this.skipToGame());
    }

    /**
     * Advance to the next panel
     */
    private advancePanel(): void {
        if (this.isTransitioning) return;

        const nextIndex = this.currentPanelIndex + 1;

        if (nextIndex >= ComicScene.PANEL_KEYS.length) {
            // Last panel - transition to game
            this.transitionToGame();
            return;
        }

        // Transition to next panel
        this.transitionToPanel(nextIndex);
    }

    /**
     * Cross-fade transition to a new panel
     */
    private transitionToPanel(newIndex: number): void {
        if (this.isTransitioning) return;
        this.isTransitioning = true;

        const oldPanel = this.currentPanel;
        const newKey = this.getPanelKey(newIndex);

        // Create new panel behind current one
        const newPanel = this.add.image(640, 360, newKey)
            .setOrigin(0.5)
            .setDepth(-1)
            .setAlpha(0);

        this.fitPanelToScreen(newPanel);
        this.nextPanel = newPanel;

        // Cross-fade animation
        this.tweens.add({
            targets: oldPanel,
            alpha: 0,
            duration: 400,
            ease: 'Power2.easeIn',
            onComplete: () => {
                oldPanel?.destroy();
            },
        });

        this.tweens.add({
            targets: newPanel,
            alpha: 1,
            duration: 400,
            ease: 'Power2.easeOut',
            onComplete: () => {
                this.currentPanelIndex = newIndex;
                this.currentPanel = newPanel;
                this.nextPanel = null;
                this.isTransitioning = false;

                // Update depth so new panel is on top
                newPanel.setDepth(0);

                // Update indicators
                this.updatePanelIndicators();
            },
        });
    }

    /**
     * Skip directly to the game (CrashSiteScene)
     */
    private skipToGame(): void {
        if (this.isTransitioning) return;
        this.transitionToGame();
    }

    /**
     * Transition to CrashSiteScene
     */
    private transitionToGame(): void {
        if (this.isTransitioning) return;
        this.isTransitioning = true;

        // Disable input
        this.input.enabled = false;

        // Fade out
        this.cameras.main.fadeOut(600, 0, 0, 0);

        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start('CrashSiteScene');
        });
    }
}
