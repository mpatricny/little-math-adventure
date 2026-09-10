import Phaser from 'phaser';

export type ForestDirectionPromptOptions = {
    x: number;
    y: number;
    depth: number;
    label: string;
    onClick: () => void;
    alpha?: number;
};

/**
 * Small story-world direction sign built from the canonical forest arrow.
 * Runtime text and interaction stay separate from the decorative bitmap.
 */
export class ForestDirectionPrompt {
    readonly root: Phaser.GameObjects.Container;

    private readonly surface: Phaser.GameObjects.Container;
    private readonly glow: Phaser.GameObjects.Ellipse;
    private enabled = true;

    constructor(scene: Phaser.Scene, options: ForestDirectionPromptOptions) {
        this.root = scene.add.container(options.x, options.y)
            .setDepth(options.depth)
            .setAlpha(options.alpha ?? 1);
        this.root.setSize(192, 122);

        this.glow = scene.add.ellipse(2, 8, 166, 78, 0xb8f29e, 0.12)
            .setAlpha(0);
        this.surface = scene.add.container(0, 0);
        const sign = scene.add.image(0, 0, 'Arrow-forest').setDisplaySize(192, 122);
        const label = scene.add.text(-6, 4, options.label, {
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: '16px',
            fontStyle: 'bold',
            color: '#f8edc9',
            stroke: '#1b2a17',
            strokeThickness: 4,
            align: 'center',
        }).setOrigin(0.5).setResolution(2);
        this.surface.add([sign, label]);
        this.root.add([this.glow, this.surface]);

        this.root.setInteractive({ useHandCursor: true });
        this.root.on('pointerover', () => {
            if (!this.enabled) return;
            this.surface.setY(-4);
            this.glow.setAlpha(0.48);
        });
        this.root.on('pointerout', () => {
            this.surface.setY(0);
            this.glow.setAlpha(0);
        });
        this.root.on('pointerdown', () => {
            if (this.enabled) this.surface.setY(2);
        });
        this.root.on('pointerup', () => {
            if (!this.enabled) return;
            this.surface.setY(-4);
            options.onClick();
        });
    }

    setEnabled(enabled: boolean): this {
        this.enabled = enabled;
        this.root.setAlpha(enabled ? 1 : 0.45);
        if (enabled) this.root.setInteractive({ useHandCursor: true });
        else this.root.disableInteractive();
        return this;
    }
}
