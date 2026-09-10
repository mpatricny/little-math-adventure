import Phaser from 'phaser';
import {
    createSplitMedievalFrame,
    type MedievalFrameLayer,
} from './MedievalFrame';

export type MedievalActionButtonIcon = {
    texture: string;
    frame?: string | number;
    tint?: number;
};

export type MedievalActionButtonOptions = {
    x: number;
    y: number;
    depth: number;
    width: number;
    height?: number;
    label: string;
    accent: number;
    layout?: 'icon' | 'text';
    normalIcon?: MedievalActionButtonIcon;
    activeIcon?: MedievalActionButtonIcon;
    iconSize?: number;
    iconOffsetX?: number;
    iconCenterRatio?: number;
    labelOffsetX?: number;
    labelCenterRatio?: number;
    labelFontSize?: number;
    labelLineSpacing?: number;
    labelMaxWidth?: number;
    labelMaxHeight?: number;
    frameTexture?: string;
    frameComposition?: 'complete' | 'split';
    name?: string;
    enabled?: boolean;
    onClick?: () => void;
};

export type MedievalActionButtonPresentationState = 'enabled' | 'disabled' | 'selected';

type ButtonState = 'normal' | 'hover' | 'pressed' | 'selected';

const FRAME_ASPECT_RATIO = 2.5;
const ICON_CENTER_RATIO = 0.192;
const LABEL_CENTER_RATIO = 0.67;
const TEXT_FRAME_TEXTURE = 'prep-frame-rail-v2';
const TEXT_FRAME_CENTER = '__medieval-button-center';
const TEXT_FRAME_CAP = '__medieval-button-cap';
const TEXT_FRAME_SOURCE_HEIGHT = 200;
const TEXT_FRAME_CENTER_SOURCE = { x: 218, width: 8 };
const TEXT_FRAME_CAP_SOURCE = { x: 287, width: 63 };

/**
 * Reusable layered action button. The frame never changes geometry; interaction
 * is expressed through a small surface lift, shadow, sheen, and icon cross-fade.
 */
export class MedievalActionButton {
    readonly root: Phaser.GameObjects.Container;
    readonly label: Phaser.GameObjects.Text;

    private readonly scene: Phaser.Scene;
    private readonly options: MedievalActionButtonOptions;
    private readonly height: number;
    private readonly shadow: MedievalFrameLayer;
    private readonly surface: Phaser.GameObjects.Container;
    private readonly frameHighlight: MedievalFrameLayer;
    private readonly normalIcon?: Phaser.GameObjects.Image;
    private readonly activeIcon?: Phaser.GameObjects.Image;
    private readonly sheen: Phaser.GameObjects.Graphics;
    private readonly sheenStartX: number;
    private readonly sheenEndX: number;
    private pressed = false;
    private isEnabled = true;

    constructor(scene: Phaser.Scene, options: MedievalActionButtonOptions) {
        this.scene = scene;
        this.options = options;
        this.height = options.height ?? options.width / FRAME_ASPECT_RATIO;
        this.root = scene.add.container(options.x, options.y).setDepth(options.depth);
        if (options.name) this.root.setName(options.name);
        this.root.setSize(options.width, this.height);

        this.shadow = this.createFrameLayer();
        this.shadow.container.setPosition(0, this.height * 0.04).setAlpha(0.42);
        this.shadow.parts.forEach((part) => part.setTint(0x000000));

        this.surface = scene.add.container(0, 0);
        const frame = this.createFrameLayer();
        this.frameHighlight = this.createFrameLayer();
        this.frameHighlight.container.setAlpha(0);
        this.frameHighlight.parts.forEach((part) => {
            part.setTint(options.accent).setBlendMode(Phaser.BlendModes.ADD);
        });

        const left = -options.width / 2;
        if ((options.layout ?? 'icon') === 'icon') {
            if (!options.normalIcon) throw new Error('MedievalActionButton icon layout requires normalIcon');
            const iconX = left
                + options.width * (options.iconCenterRatio ?? ICON_CENTER_RATIO)
                + (options.iconOffsetX ?? 0);
            const iconSize = options.iconSize ?? this.height * 0.84;
            this.normalIcon = this.createIcon(iconX, options.normalIcon, iconSize);
            const activeIcon = options.activeIcon ?? { ...options.normalIcon, tint: options.accent };
            this.activeIcon = this.createIcon(iconX, activeIcon, iconSize).setAlpha(0);
        }

        const labelX = (options.layout ?? 'icon') === 'text'
            ? (options.labelOffsetX ?? 0)
            : left
                + options.width * (options.labelCenterRatio ?? LABEL_CENTER_RATIO)
                + (options.labelOffsetX ?? 0);
        this.label = scene.add.text(labelX, 1, options.label, {
            // Set at creation: Phaser's late setResolution() leaves Canvas texture resolution stale.
            resolution: 2,
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: `${options.labelFontSize ?? Math.round(this.height * 0.17)}px`,
            fontStyle: 'bold',
            align: 'center',
            color: '#3c210f',
            stroke: '#d69a43',
            strokeThickness: 1,
            shadow: {
                offsetX: 0,
                offsetY: Math.max(1, Math.round(this.height * 0.01)),
                color: '#f6d895',
                blur: 1,
                fill: true,
            },
        }).setOrigin(0.5).setLineSpacing(options.labelLineSpacing ?? 0);
        this.fitLabelToBounds();

        this.sheen = this.createSheen();
        this.sheenStartX = left + options.width * 0.43;
        this.sheenEndX = options.width / 2 - options.width * 0.1;

        const surfaceChildren: Phaser.GameObjects.GameObject[] = [
            frame.container,
            this.frameHighlight.container,
            this.sheen,
            this.label,
        ];
        if (this.normalIcon && this.activeIcon) surfaceChildren.splice(3, 0, this.normalIcon, this.activeIcon);
        this.surface.add(surfaceChildren);
        this.root.add([this.shadow.container, this.surface]);

        this.bindInteraction();
        this.applyState('normal', true);
        this.setEnabled(options.enabled ?? true);
    }

    get enabled(): boolean {
        return this.isEnabled;
    }

    setEnabled(enabled: boolean): this {
        return this.setPresentationState(enabled ? 'enabled' : 'disabled');
    }

    setPresentationState(state: MedievalActionButtonPresentationState): this {
        this.isEnabled = state === 'enabled';
        this.pressed = false;
        this.applyState(state === 'selected' ? 'selected' : 'normal', true);
        this.root.setAlpha(state === 'disabled' ? 0.46 : 1);
        if (this.isEnabled) this.root.setInteractive({ useHandCursor: true });
        else this.root.disableInteractive();
        return this;
    }

    setLabel(label: string, fontSize?: number): this {
        this.label.setText(label);
        if (fontSize !== undefined) this.label.setFontSize(fontSize);
        this.fitLabelToBounds();
        return this;
    }

    destroy(): void {
        this.root.destroy(true);
    }

    private fitLabelToBounds(): void {
        this.label.setScale(1);
        const isTextOnly = (this.options.layout ?? 'icon') === 'text';
        const maxWidth = this.options.labelMaxWidth
            ?? this.options.width * (isTextOnly ? 0.78 : 0.56);
        const maxHeight = this.options.labelMaxHeight ?? this.height * 0.54;
        const scale = Math.min(
            1,
            this.label.width > 0 ? maxWidth / this.label.width : 1,
            this.label.height > 0 ? maxHeight / this.label.height : 1,
        );
        this.label.setScale(scale);
    }

    private createFrameLayer(): MedievalFrameLayer {
        if (this.options.frameComposition === 'split') {
            return createSplitMedievalFrame(
                this.scene,
                this.options.width,
                this.height,
            );
        }

        const container = this.scene.add.container(0, 0);
        const isTextLayout = this.options.layout === 'text';
        const textureKey = this.options.frameTexture ?? (isTextLayout ? TEXT_FRAME_TEXTURE : 'prep-frame-v2');

        if (!isTextLayout || this.options.frameTexture) {
            const image = this.scene.add.image(0, 0, textureKey).setDisplaySize(this.options.width, this.height);
            container.add(image);
            return { container, parts: [image] };
        }

        const texture = this.scene.textures.get(textureKey);
        if (!texture.has(TEXT_FRAME_CENTER)) {
            texture.add(
                TEXT_FRAME_CENTER,
                0,
                TEXT_FRAME_CENTER_SOURCE.x,
                0,
                TEXT_FRAME_CENTER_SOURCE.width,
                TEXT_FRAME_SOURCE_HEIGHT
            );
        }
        if (!texture.has(TEXT_FRAME_CAP)) {
            texture.add(
                TEXT_FRAME_CAP,
                0,
                TEXT_FRAME_CAP_SOURCE.x,
                0,
                TEXT_FRAME_CAP_SOURCE.width,
                TEXT_FRAME_SOURCE_HEIGHT
            );
        }

        const capWidth = this.height * (TEXT_FRAME_CAP_SOURCE.width / TEXT_FRAME_SOURCE_HEIGHT);
        const seamOverlap = 2;
        const centerWidth = this.options.width - capWidth * 2 + seamOverlap * 2;
        const leftCap = this.scene.add.image(
            -this.options.width / 2 + capWidth / 2,
            0,
            textureKey,
            TEXT_FRAME_CAP
        ).setDisplaySize(capWidth, this.height).setFlipX(true);
        const center = this.scene.add.image(0, 0, textureKey, TEXT_FRAME_CENTER)
            .setDisplaySize(centerWidth, this.height);
        const rightCap = this.scene.add.image(
            this.options.width / 2 - capWidth / 2,
            0,
            textureKey,
            TEXT_FRAME_CAP
        ).setDisplaySize(capWidth, this.height);

        container.add([center, leftCap, rightCap]);
        return { container, parts: [center, leftCap, rightCap] };
    }

    private createIcon(x: number, spec: MedievalActionButtonIcon, size: number): Phaser.GameObjects.Image {
        const icon = this.scene.add.image(x, 0, spec.texture, spec.frame).setDisplaySize(size, size);
        if (spec.tint !== undefined) icon.setTint(spec.tint);
        return icon;
    }

    private createSheen(): Phaser.GameObjects.Graphics {
        const sheen = this.scene.add.graphics();
        const sheenHeight = this.height * 0.36;
        const stripWidth = Math.max(3, this.options.width * 0.012);
        [0.08, 0.18, 0.36, 0.62, 0.36, 0.18, 0.08].forEach((alpha, index) => {
            sheen.fillStyle(0xfff7d7, alpha);
            sheen.fillRect(-stripWidth * 3.5 + index * stripWidth, -sheenHeight / 2, stripWidth, sheenHeight);
        });
        return sheen.setRotation(-0.18).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
    }

    private bindInteraction(): void {
        this.root.on('pointerover', () => {
            if (!this.isEnabled || this.pressed) return;
            this.applyState('hover');
        });
        this.root.on('pointerout', () => {
            if (!this.isEnabled) return;
            this.pressed = false;
            this.applyState('normal');
        });
        this.root.on('pointerdown', () => {
            if (!this.isEnabled) return;
            this.pressed = true;
            this.applyState('pressed');
        });
        this.root.on('pointerup', () => {
            if (!this.isEnabled || !this.pressed) return;
            this.pressed = false;
            this.applyState('hover');
            this.root.emit('action');
            this.options.onClick?.();
        });
        this.root.on('pointerupoutside', () => {
            if (!this.isEnabled) return;
            this.pressed = false;
            this.applyState('normal');
        });
    }

    private applyState(state: ButtonState, immediate = false): void {
        const active = state !== 'normal';
        const surfaceY = state === 'pressed' ? -this.height * 0.01 : state === 'hover' ? -this.height * 0.03 : 0;
        const shadowY = state === 'pressed' ? this.height * 0.03 : state === 'hover' ? this.height * 0.06 : this.height * 0.04;
        const shadowAlpha = state === 'hover' ? 0.56 : state === 'pressed' ? 0.45 : 0.42;
        const highlightAlpha = state === 'normal' ? 0 : state === 'pressed' ? 0.2 : state === 'selected' ? 0.13 : 0.09;
        const targets: Phaser.GameObjects.GameObject[] = [
            this.surface,
            this.shadow.container,
            this.frameHighlight.container,
            this.sheen,
        ];
        if (this.normalIcon && this.activeIcon) targets.push(this.normalIcon, this.activeIcon);
        this.scene.tweens.killTweensOf(targets);

        if (immediate) {
            this.surface.setY(surfaceY);
            this.shadow.container.setY(shadowY).setAlpha(shadowAlpha);
            this.frameHighlight.container.setAlpha(highlightAlpha);
            this.normalIcon?.setAlpha(active ? 0 : 1);
            this.activeIcon?.setAlpha(active ? 1 : 0);
            this.sheen.setAlpha(0).setX(this.sheenStartX);
            return;
        }

        const duration = state === 'pressed' ? 80 : 150;
        this.scene.tweens.add({
            targets: this.surface,
            y: surfaceY,
            duration,
            ease: 'Cubic.easeOut',
        });
        this.scene.tweens.add({
            targets: this.shadow.container,
            y: shadowY,
            alpha: shadowAlpha,
            duration,
            ease: 'Cubic.easeOut',
        });
        this.scene.tweens.add({
            targets: this.frameHighlight.container,
            alpha: highlightAlpha,
            duration,
            ease: 'Sine.easeOut',
        });
        if (this.normalIcon && this.activeIcon) {
            this.scene.tweens.add({
                targets: this.normalIcon,
                alpha: active ? 0 : 1,
                duration: 110,
                ease: 'Sine.easeInOut',
            });
            this.scene.tweens.add({
                targets: this.activeIcon,
                alpha: active ? 1 : 0,
                duration: 110,
                ease: 'Sine.easeInOut',
            });
        }

        if (state === 'hover') this.runSheen();
        else this.sheen.setAlpha(0).setX(this.sheenStartX);
    }

    private runSheen(): void {
        this.sheen.setX(this.sheenStartX).setAlpha(0);
        this.scene.tweens.add({
            targets: this.sheen,
            x: this.sheenEndX,
            alpha: 0.38,
            duration: 320,
            ease: 'Sine.easeInOut',
            onComplete: () => {
                this.scene.tweens.add({
                    targets: this.sheen,
                    alpha: 0,
                    duration: 110,
                    ease: 'Sine.easeOut',
                });
            },
        });
    }
}
