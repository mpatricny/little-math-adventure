import Phaser from 'phaser';
import type { MedievalActionButtonIcon } from './MedievalActionButton';
import { createSplitMedievalFrame } from './MedievalFrame';

export type MedievalStatusPanelOptions = {
    x: number;
    y: number;
    depth: number;
    width: number;
    height?: number;
    title: string;
    value: string;
    icon: MedievalActionButtonIcon;
    iconSize?: number;
    iconText?: string;
    accent?: number;
    progress?: number;
};

/**
 * Static companion to MedievalActionButton. It reuses the same canonical frame,
 * but keeps status data non-interactive and renders all text at runtime.
 */
export class MedievalStatusPanel {
    readonly root: Phaser.GameObjects.Container;
    readonly title: Phaser.GameObjects.Text;
    readonly value: Phaser.GameObjects.Text;

    private readonly scene: Phaser.Scene;
    private readonly width: number;
    private readonly height: number;
    private readonly progressTrack?: Phaser.GameObjects.Graphics;
    private readonly progressFill?: Phaser.GameObjects.Graphics;
    private progress = 0;
    private readonly accent: number;

    constructor(scene: Phaser.Scene, options: MedievalStatusPanelOptions) {
        this.scene = scene;
        this.width = options.width;
        this.height = options.height ?? Math.round(options.width / 2.5);
        this.accent = options.accent ?? 0x6ecb55;
        this.progress = Phaser.Math.Clamp(options.progress ?? 0, 0, 1);

        this.root = scene.add.container(options.x, options.y).setDepth(options.depth);
        const frame = createSplitMedievalFrame(scene, this.width, this.height);

        const iconX = -this.width / 2 + this.width * 0.192;
        const icon = scene.add.image(iconX, 0, options.icon.texture, options.icon.frame)
            .setDisplaySize(
                options.iconSize ?? this.height * 0.68,
                options.iconSize ?? this.height * 0.68,
            );
        if (options.icon.tint !== undefined) icon.setTint(options.icon.tint);

        const labelX = -this.width / 2 + this.width * 0.67;
        const hasProgress = options.progress !== undefined;
        this.title = scene.add.text(labelX, hasProgress ? -this.height * 0.11 : -this.height * 0.15, options.title, {
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: `${Math.round(this.height * 0.13)}px`,
            fontStyle: 'bold',
            color: '#4b2a13',
            align: 'center',
        }).setOrigin(0.5).setResolution(2);

        this.value = scene.add.text(labelX, hasProgress ? this.height * 0.11 : this.height * 0.16, options.value, {
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: `${Math.round(this.height * 0.17)}px`,
            fontStyle: 'bold',
            color: '#2d180c',
            stroke: '#f2c874',
            strokeThickness: 1,
            align: 'center',
        }).setOrigin(0.5).setResolution(2);

        this.root.add([frame.container, icon, this.title, this.value]);

        if (options.iconText) {
            const iconText = scene.add.text(iconX, 1, options.iconText, {
                fontFamily: 'Georgia, serif',
                fontSize: `${Math.round(this.height * 0.34)}px`,
                fontStyle: 'bold',
                color: '#fff4dd',
                stroke: '#5c120e',
                strokeThickness: Math.max(2, Math.round(this.height * 0.025)),
            }).setOrigin(0.5).setResolution(2);
            this.root.add(iconText);
        }

        if (hasProgress) {
            this.progressTrack = scene.add.graphics();
            this.progressFill = scene.add.graphics();
            this.root.add([this.progressTrack, this.progressFill]);
            this.redrawProgress();
        }
    }

    setValue(value: string): this {
        this.value.setText(value);
        return this;
    }

    setProgress(progress: number): this {
        this.progress = Phaser.Math.Clamp(progress, 0, 1);
        this.redrawProgress();
        return this;
    }

    destroy(): void {
        this.root.destroy(true);
    }

    private redrawProgress(): void {
        if (!this.progressTrack || !this.progressFill) return;

        const labelLeft = -this.width / 2 + this.width * 0.405;
        const labelRight = this.width / 2 - this.width * 0.075;
        const barWidth = labelRight - labelLeft;
        const barHeight = Math.max(8, this.height * 0.09);
        const y = this.height * 0.27;

        this.progressTrack.clear();
        this.progressTrack.fillStyle(0x29170f, 0.9);
        this.progressTrack.fillRoundedRect(labelLeft, y, barWidth, barHeight, barHeight / 2);
        this.progressTrack.lineStyle(1, 0x8d5a2f, 1);
        this.progressTrack.strokeRoundedRect(labelLeft, y, barWidth, barHeight, barHeight / 2);

        this.progressFill.clear();
        const fillWidth = Math.max(0, barWidth * this.progress);
        if (fillWidth > 0) {
            this.progressFill.fillStyle(this.accent, 1);
            this.progressFill.fillRoundedRect(
                labelLeft + 2,
                y + 2,
                Math.max(1, fillWidth - 4),
                Math.max(1, barHeight - 4),
                Math.max(1, (barHeight - 4) / 2),
            );
        }
    }
}
