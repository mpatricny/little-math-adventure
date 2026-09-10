import Phaser from 'phaser';
import { PreparationKind } from '../types';

export interface BattlePreparationHudOptions {
    x: number;
    y: number;
    depth: number;
    width?: number;
    height?: number;
    name?: string;
}

type Rune = {
    empty: Phaser.GameObjects.Image;
    charged: Phaser.GameObjects.Image;
};

/** One compact preparation icon with three rune charges. */
export class BattlePreparationHud {
    readonly root: Phaser.GameObjects.Container;

    private readonly scene: Phaser.Scene;
    private readonly normalIcon: Phaser.GameObjects.Image;
    private readonly activeIcon: Phaser.GameObjects.Image;
    private readonly runes: Rune[] = [];
    private kind: PreparationKind | null = null;
    private count = 0;

    constructor(scene: Phaser.Scene, options: BattlePreparationHudOptions) {
        this.scene = scene;
        this.root = scene.add.container(options.x, options.y)
            .setDepth(options.depth)
            .setName(options.name ?? 'battle-preparation-hud');
        const frame = scene.add.image(0, 0, 'battle-hud-preparation-frame-v1')
            .setDisplaySize(options.width ?? 112, options.height ?? 116);
        this.normalIcon = scene.add.image(-1, -8, 'prep-sword-normal-v2')
            .setDisplaySize(48, 48);
        this.activeIcon = scene.add.image(-1, -8, 'prep-sword-active-v2')
            .setDisplaySize(48, 48)
            .setAlpha(0);
        this.root.add([frame, this.normalIcon, this.activeIcon]);

        for (let index = 0; index < 3; index++) {
            const x = (index - 1) * 27;
            const empty = scene.add.image(x, 38, 'battle-hud-rune-empty-v1')
                .setDisplaySize(21, 21);
            const charged = scene.add.image(x, 38, 'battle-hud-rune-charged-v1')
                .setDisplaySize(21, 21)
                .setAlpha(0);
            this.root.add([empty, charged]);
            this.runes.push({ empty, charged });
        }
        this.root.setVisible(false);
    }

    setState(kind: PreparationKind | null, count: number, animate = false): this {
        const previousCount = this.count;
        this.kind = kind;
        this.count = Phaser.Math.Clamp(Math.round(count), 0, 3);
        this.root.setData('kind', kind);
        this.root.setData('count', this.count);
        if (!kind || this.count <= 0) {
            this.root.setVisible(false);
            return this;
        }

        const sword = kind === 'sword';
        this.normalIcon.setTexture(sword ? 'prep-sword-normal-v2' : 'prep-shield-normal-v2');
        this.activeIcon.setTexture(sword ? 'prep-sword-active-v2' : 'prep-shield-active-v2');
        this.normalIcon.setAlpha(0);
        this.activeIcon.setAlpha(1);
        this.root.setVisible(true);

        this.runes.forEach((rune, index) => {
            const charged = index < this.count;
            rune.empty.setAlpha(1);
            this.scene.tweens.killTweensOf(rune.charged);
            if (animate && charged && index >= previousCount) {
                rune.charged.setAlpha(0).setScale(0.65);
                this.scene.tweens.add({
                    targets: rune.charged,
                    alpha: 1,
                    scale: 1,
                    duration: 260,
                    ease: 'Back.easeOut',
                });
            } else {
                rune.charged.setAlpha(charged ? 1 : 0).setScale(1);
            }
            rune.charged.setTint(sword ? 0xffffff : 0x77d8ff);
        });
        return this;
    }

    setVisible(visible: boolean): this {
        this.root.setVisible(visible && Boolean(this.kind) && this.count > 0);
        return this;
    }
}
