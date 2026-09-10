import Phaser from 'phaser';
import { PreparationKind } from '../types';

export type { PreparationKind } from '../types';

type ChargeSlot = {
    container: Phaser.GameObjects.Container;
    glow: Phaser.GameObjects.Arc;
    plate: Phaser.GameObjects.Arc;
    normalIcon: Phaser.GameObjects.Image;
    activeIcon: Phaser.GameObjects.Image;
};

export interface PreparationChargeIndicatorOptions {
    parent?: Phaser.GameObjects.Container;
    x?: number;
    y?: number;
    kind: PreparationKind;
    iconSize?: number;
    spacing?: number;
    showEmptySlots?: boolean;
    name?: string;
}

const ICON_TEXTURES: Record<PreparationKind, { normal: string; active: string; accent: number }> = {
    sword: {
        normal: 'prep-sword-normal-v2',
        active: 'prep-sword-active-v2',
        accent: 0xffad2f,
    },
    shield: {
        normal: 'prep-shield-normal-v2',
        active: 'prep-shield-active-v2',
        accent: 0x39cfff,
    },
};

/** Shared 1-3 charge display for the preparation overlay, shop, and battle HUD. */
export class PreparationChargeIndicator {
    readonly root: Phaser.GameObjects.Container;

    private readonly scene: Phaser.Scene;
    private readonly iconSize: number;
    private readonly spacing: number;
    private readonly showEmptySlots: boolean;
    private readonly slots: ChargeSlot[] = [];
    private kind: PreparationKind;
    private count = 0;

    constructor(scene: Phaser.Scene, options: PreparationChargeIndicatorOptions) {
        this.scene = scene;
        this.kind = options.kind;
        this.iconSize = options.iconSize ?? 54;
        this.spacing = options.spacing ?? Math.round(this.iconSize * 0.92);
        this.showEmptySlots = options.showEmptySlots ?? true;
        this.root = scene.add.container(options.x ?? 0, options.y ?? 0);
        if (options.name) this.root.setName(options.name);

        for (let index = 0; index < 3; index++) {
            this.slots.push(this.createSlot(index));
        }

        options.parent?.add(this.root);
        this.setCount(0, false);
    }

    setKind(kind: PreparationKind): this {
        this.kind = kind;
        const textures = ICON_TEXTURES[kind];
        for (const slot of this.slots) {
            slot.normalIcon.setTexture(textures.normal);
            slot.activeIcon.setTexture(textures.active);
        }
        this.render(false);
        return this;
    }

    setCount(count: number, animate = true): this {
        const previousCount = this.count;
        this.count = Phaser.Math.Clamp(Math.round(count), 0, 3);
        this.render(animate, previousCount);
        this.root.setData('count', this.count);
        this.root.setData('kind', this.kind);
        return this;
    }

    setVisible(visible: boolean): this {
        this.root.setVisible(visible);
        return this;
    }

    destroy(): void {
        this.root.destroy(true);
    }

    private createSlot(index: number): ChargeSlot {
        const radius = this.iconSize * 0.34;
        const container = this.scene.add.container((index - 1) * this.spacing, 0);
        const glow = this.scene.add.circle(0, 0, radius * 1.28, ICON_TEXTURES[this.kind].accent, 0)
            .setBlendMode(Phaser.BlendModes.ADD);
        const shadow = this.scene.add.circle(0, 3, radius * 1.04, 0x000000, 0.58);
        const plate = this.scene.add.circle(0, 0, radius, 0x17110c, 0.94)
            .setStrokeStyle(Math.max(2, this.iconSize * 0.035), 0x8b6234, 0.95);
        const normalIcon = this.scene.add.image(0, 0, ICON_TEXTURES[this.kind].normal)
            .setDisplaySize(this.iconSize, this.iconSize);
        const activeIcon = this.scene.add.image(0, 0, ICON_TEXTURES[this.kind].active)
            .setDisplaySize(this.iconSize, this.iconSize)
            .setAlpha(0);

        container.add([glow, shadow, plate, normalIcon, activeIcon]);
        this.root.add(container);
        return { container, glow, plate, normalIcon, activeIcon };
    }

    private render(animate: boolean, previousCount = this.count): void {
        const textures = ICON_TEXTURES[this.kind];
        const visibleCount = this.showEmptySlots ? 3 : this.count;

        this.slots.forEach((slot, index) => {
            const filled = index < this.count;
            const visible = this.showEmptySlots || index < visibleCount;
            const positionIndex = this.showEmptySlots ? index - 1 : index - (visibleCount - 1) / 2;

            this.scene.tweens.killTweensOf([
                slot.container,
                slot.glow,
                slot.normalIcon,
                slot.activeIcon,
            ]);
            slot.container.setVisible(visible).setPosition(positionIndex * this.spacing, 0);
            slot.plate.setStrokeStyle(
                Math.max(2, this.iconSize * 0.035),
                filled ? textures.accent : 0x8b6234,
                filled ? 0.95 : 0.72
            );
            slot.normalIcon.setAlpha(filled ? 0 : 0.3);
            slot.activeIcon.setAlpha(filled ? 1 : 0);
            slot.glow.setFillStyle(textures.accent, 1).setAlpha(filled ? 0.34 : 0);
            slot.container.setScale(1);

            if (animate && filled && index >= previousCount) {
                slot.container.setScale(0.68);
                slot.activeIcon.setAlpha(0);
                slot.glow.setAlpha(0);
                this.scene.tweens.add({
                    targets: slot.container,
                    scale: 1,
                    duration: 330,
                    ease: 'Back.easeOut',
                });
                this.scene.tweens.add({
                    targets: [slot.activeIcon, slot.glow],
                    alpha: 1,
                    duration: 220,
                    ease: 'Sine.easeOut',
                });
                this.scene.tweens.add({
                    targets: slot.glow,
                    alpha: 0.34,
                    duration: 520,
                    delay: 220,
                    ease: 'Sine.easeOut',
                });
            }
        });
    }
}
