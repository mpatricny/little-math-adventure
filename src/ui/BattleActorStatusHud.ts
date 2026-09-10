import Phaser from 'phaser';
import { SpeedChargeBar } from './SpeedChargeBar';

export type BattleActorStatusKind = 'player' | 'enemy';

export interface BattleActorStatusHudOptions {
    anchor: Phaser.GameObjects.Container;
    sprite: Phaser.GameObjects.Sprite;
    x: number;
    y: number;
    depth: number;
    offsetX: number;
    offsetY: number;
    referenceDisplayHeight: number;
    kind: BattleActorStatusKind;
    hp: number;
    maxHp: number;
    color: number;
    name?: string;
    showSpeed?: boolean;
    speedTint?: number;
    frameWidth?: number;
    frameHeight?: number;
    trackWidth?: number;
    trackHeight?: number;
}

/**
 * Lightweight status plate that stays in the UI layer while following one
 * battle actor. The scene-editor host supplies the reference offset; runtime
 * sprite-height correction keeps the plate above differently scaled actors.
 */
export class BattleActorStatusHud {
    readonly root: Phaser.GameObjects.Container;
    readonly container: Phaser.GameObjects.Container;
    readonly speedChargeBar: SpeedChargeBar | null;

    private readonly scene: Phaser.Scene;
    private readonly anchor: Phaser.GameObjects.Container;
    private readonly sprite: Phaser.GameObjects.Sprite;
    private readonly offsetX: number;
    private readonly offsetY: number;
    private readonly referenceDisplayHeight: number;
    private readonly frameWidth: number;
    private readonly frameHeight: number;
    private readonly trackWidth: number;
    private readonly trackHeight: number;
    private readonly color: number;
    private readonly selection: Phaser.GameObjects.Graphics;
    private readonly background: Phaser.GameObjects.Graphics;
    private readonly fill: Phaser.GameObjects.Graphics;
    private readonly value: Phaser.GameObjects.Text;
    private requestedVisible = true;

    constructor(scene: Phaser.Scene, options: BattleActorStatusHudOptions) {
        this.scene = scene;
        this.anchor = options.anchor;
        this.sprite = options.sprite;
        this.offsetX = options.offsetX;
        this.offsetY = options.offsetY;
        this.referenceDisplayHeight = options.referenceDisplayHeight;
        this.frameWidth = options.frameWidth ?? (options.kind === 'player' ? 150 : 118);
        this.frameHeight = options.frameHeight ?? (options.kind === 'player' ? 34 : 28);
        this.trackWidth = options.trackWidth ?? (options.kind === 'player' ? 115 : 86);
        this.trackHeight = options.trackHeight ?? (options.kind === 'player' ? 9 : 7);
        this.color = options.color;

        this.root = scene.add.container(options.x, options.y)
            .setDepth(options.depth)
            .setName(options.name ?? `battle-${options.kind}-status`);
        this.container = this.root;

        this.selection = scene.add.graphics().setAlpha(0);
        this.background = scene.add.graphics();
        this.fill = scene.add.graphics();
        const frame = scene.add.image(0, 0, 'battle-hud-status-frame-v2');
        frame.setScale(Math.min(this.frameWidth / frame.width, this.frameHeight / frame.height));
        this.value = scene.add.text(0, 0, '', {
            resolution: 2,
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: `${Math.max(11, Math.round(this.trackHeight * 1.5))}px`,
            fontStyle: 'bold',
            color: '#fff4d1',
            stroke: '#24140b',
            strokeThickness: 3,
        }).setOrigin(0.5);

        this.root.add([this.background, this.fill, frame, this.selection, this.value]);

        this.speedChargeBar = options.showSpeed
            ? new SpeedChargeBar(scene, 0, 25, {
                showEmptySlots: true,
                filledTint: options.speedTint,
            })
            : null;
        if (this.speedChargeBar) this.root.add(this.speedChargeBar.getContainer());

        this.setHp(options.hp, options.maxHp);
        this.followAnchor();
        scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.followAnchor, this);
        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.followAnchor, this);
        });
    }

    setHp(current: number, maximum: number): this {
        const safeMaximum = Math.max(1, maximum);
        const ratio = Phaser.Math.Clamp(current / safeMaximum, 0, 1);
        const innerWidth = Math.max(0, (this.trackWidth - 4) * ratio);

        this.background.clear();
        this.background.fillStyle(0x090805, 0.82);
        this.background.fillRoundedRect(
            -this.trackWidth / 2,
            -this.trackHeight / 2,
            this.trackWidth,
            this.trackHeight,
            this.trackHeight / 2,
        );

        this.fill.clear();
        if (innerWidth > 0) {
            const bright = Phaser.Display.Color.ValueToColor(this.color).brighten(24).color;
            this.fill.fillGradientStyle(bright, bright, this.color, this.color, 1);
            this.fill.fillRoundedRect(
                -this.trackWidth / 2 + 2,
                -this.trackHeight / 2 + 2,
                innerWidth,
                Math.max(2, this.trackHeight - 4),
                Math.max(1, (this.trackHeight - 4) / 2),
            );
            this.fill.fillStyle(0xffffff, 0.22);
            this.fill.fillRoundedRect(
                -this.trackWidth / 2 + 5,
                -this.trackHeight / 2 + 3,
                Math.max(0, innerWidth - 6),
                Math.max(1, (this.trackHeight - 4) * 0.3),
                1,
            );
        }
        this.value.setText(`${Math.max(0, current)} / ${maximum}`);
        this.root.setData('hp', Math.max(0, current));
        this.root.setData('maxHp', maximum);
        return this;
    }

    setSelected(selected: boolean): this {
        this.selection.clear();
        if (selected) {
            this.selection.lineStyle(3, 0xffd36a, 0.92);
            this.selection.strokeRoundedRect(
                -this.frameWidth / 2 + 4,
                -this.frameHeight / 2 + 4,
                this.frameWidth - 8,
                this.frameHeight - 8,
                Math.max(5, this.frameHeight * 0.22),
            );
            this.selection.setAlpha(0.82).setBlendMode(Phaser.BlendModes.ADD);
        } else {
            this.selection.setAlpha(0);
        }
        return this;
    }

    setVisible(visible: boolean): this {
        this.requestedVisible = visible;
        this.followAnchor();
        return this;
    }

    setDepth(depth: number): this {
        this.root.setDepth(depth);
        return this;
    }

    getTopY(): number {
        return this.root.y - this.frameHeight / 2;
    }

    destroy(): void {
        this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.followAnchor, this);
        this.root.destroy(true);
    }

    private followAnchor(): void {
        // The scene-editor offset remains authoritative; transparent video padding
        // is intrinsic artwork geometry, not extra visible height above the head.
        const topInset = Number(this.sprite.getData('frameTopInset') ?? 0) * Math.abs(this.sprite.scaleY);
        const heightCorrection = (this.sprite.displayHeight - this.referenceDisplayHeight) / 2 - topInset;
        this.root.setPosition(
            this.anchor.x + this.offsetX,
            this.anchor.y + this.offsetY - heightCorrection,
        );
        this.root.setAlpha(this.anchor.alpha);
        this.root.setVisible(this.requestedVisible && this.anchor.visible);
    }
}
