import Phaser from 'phaser';

/**
 * Abstract base class for modal overlay panels.
 * Provides: dark backdrop, rounded panel, title bar, close button (X), ESC to close,
 * entrance/exit animations, and a content area for subclasses.
 *
 * IMPORTANT: buildContent() is called lazily on first show(), NOT during construction.
 * This avoids the useDefineForClassFields pitfall where subclass field initializers
 * overwrite values set during super() with undefined.
 */
export abstract class OverlayBase {
    protected scene: Phaser.Scene;
    protected container!: Phaser.GameObjects.Container;
    protected isVisible: boolean = false;
    private escHandler: (() => void) | null = null;
    private contentBuilt: boolean = false;
    private contentArea!: { x: number; y: number; width: number; height: number };

    constructor(scene: Phaser.Scene, title: string, panelWidth: number, panelHeight: number) {
        this.scene = scene;

        this.createBase(title, panelWidth, panelHeight);
        this.setupEscListener();

        // Clean up on scene shutdown
        this.scene.events.once('shutdown', () => this.destroy());
    }

    private createBase(title: string, pw: number, ph: number): void {
        this.container = this.scene.add.container(640, 360);
        this.container.setDepth(10000);
        this.container.setScrollFactor(0);
        this.container.setVisible(false);

        // Dark backdrop (full screen, blocks clicks)
        const backdrop = this.scene.add.rectangle(0, 0, 1280, 720, 0x000000, 0.85)
            .setInteractive();
        this.container.add(backdrop);

        // Panel background with rounded corners
        const panelGfx = this.scene.add.graphics();
        panelGfx.fillStyle(0x1a1a2e, 1);
        panelGfx.fillRoundedRect(-pw / 2, -ph / 2, pw, ph, 12);
        panelGfx.lineStyle(2, 0x4a6fa5, 1);
        panelGfx.strokeRoundedRect(-pw / 2, -ph / 2, pw, ph, 12);
        this.container.add(panelGfx);

        // Title bar
        const titleText = this.scene.add.text(0, -ph / 2 + 30, title, {
            fontSize: '24px',
            fontFamily: 'Arial, sans-serif',
            color: '#e8d44d',
            fontStyle: 'bold',
        }).setOrigin(0.5);
        this.container.add(titleText);

        // Separator line below title
        const sepGfx = this.scene.add.graphics();
        sepGfx.lineStyle(1, 0x4a6fa5, 0.5);
        sepGfx.beginPath();
        sepGfx.moveTo(-pw / 2 + 20, -ph / 2 + 55);
        sepGfx.lineTo(pw / 2 - 20, -ph / 2 + 55);
        sepGfx.strokePath();
        this.container.add(sepGfx);

        // Close button (X) top-right
        const closeX = pw / 2 - 30;
        const closeY = -ph / 2 + 30;
        const closeBg = this.scene.add.rectangle(closeX, closeY, 36, 36, 0x444466, 0.8)
            .setInteractive({ useHandCursor: true });
        const closeText = this.scene.add.text(closeX, closeY, 'X', {
            fontSize: '18px',
            fontFamily: 'Arial, sans-serif',
            color: '#aaaacc',
            fontStyle: 'bold',
        }).setOrigin(0.5);

        closeBg.on('pointerover', () => {
            closeBg.setFillStyle(0xff4444, 1);
            closeText.setColor('#ffffff');
        });
        closeBg.on('pointerout', () => {
            closeBg.setFillStyle(0x444466, 0.8);
            closeText.setColor('#aaaacc');
        });
        closeBg.on('pointerdown', () => this.hide());

        this.container.add(closeBg);
        this.container.add(closeText);

        // Store content area for lazy buildContent call
        this.contentArea = {
            x: -pw / 2 + 20,
            y: -ph / 2 + 65,
            width: pw - 40,
            height: ph - 85,
        };
    }

    private setupEscListener(): void {
        this.escHandler = () => {
            if (this.isVisible) {
                this.hide();
            }
        };
        this.scene.input.keyboard?.on('keydown-ESC', this.escHandler);
    }

    /**
     * Subclasses implement this to populate the overlay content area.
     * Called once, lazily on first show().
     */
    protected abstract buildContent(contentArea: { x: number; y: number; width: number; height: number }): void;

    public show(): void {
        if (this.isVisible) return;

        // Lazy init: build content on first show (after all constructors have finished)
        if (!this.contentBuilt) {
            this.buildContent(this.contentArea);
            this.contentBuilt = true;
        }

        this.isVisible = true;
        this.container.setVisible(true);
        this.container.setScale(0.95);
        this.container.setAlpha(0);

        this.onShow();

        this.scene.tweens.add({
            targets: this.container,
            scaleX: 1,
            scaleY: 1,
            alpha: 1,
            duration: 200,
            ease: 'Back.easeOut',
        });
    }

    public hide(): void {
        if (!this.isVisible) return;
        this.isVisible = false;

        this.scene.tweens.add({
            targets: this.container,
            scaleX: 0.97,
            scaleY: 0.97,
            alpha: 0,
            duration: 150,
            ease: 'Power2',
            onComplete: () => {
                this.container.setVisible(false);
            },
        });
    }

    public toggle(): void {
        if (this.isVisible) this.hide();
        else this.show();
    }

    /** Called when overlay becomes visible. Override to refresh data. */
    protected onShow(): void {}

    public getIsVisible(): boolean {
        return this.isVisible;
    }

    public destroy(): void {
        if (this.escHandler) {
            this.scene.input.keyboard?.off('keydown-ESC', this.escHandler);
            this.escHandler = null;
        }
        this.container?.destroy();
    }
}
