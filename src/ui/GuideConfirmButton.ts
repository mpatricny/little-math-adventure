import Phaser from 'phaser';

export type GuideConfirmOptions = {
    x: number;
    y: number;
    depth: number;
    width: number;
    height: number;
    name?: string;
    theme?: 'medieval' | 'water';
    enabled?: boolean;
    onConfirm: () => void;
};

type ConfirmState = 'normal' | 'hover' | 'pressed' | 'disabled';

/** A single picture-led acknowledgement. Its frame, check and OK share one
 * moving surface; the independently sized root never moves or scales.
 */
export class GuideConfirmButton {
    readonly root: Phaser.GameObjects.Container;
    readonly label: Phaser.GameObjects.Text;
    private readonly surface: Phaser.GameObjects.Container;
    private readonly shadow: Phaser.GameObjects.Image;
    private readonly glow: Phaser.GameObjects.Graphics;
    private readonly check: Phaser.GameObjects.Graphics;
    private pressed = false;
    private isEnabled = true;
    private disposed = false;

    constructor(private readonly scene: Phaser.Scene, private readonly options: GuideConfirmOptions) {
        const { width, height } = options;
        const water = options.theme === 'water';
        this.root = scene.add.container(options.x, options.y).setDepth(options.depth)
            .setName(options.name ?? 'guideConfirm');
        this.root.setSize(width, height).setData('guideConfirm', true);
        this.surface = scene.add.container(0, 0).setName('guideConfirmSurface');
        const texture = water ? 'silverpond-fairy-action-normal' : 'guide-confirm-frame-v1';
        const frame = scene.add.image(0, 0, texture).setName('guideConfirmFrame');
        frame.setScale(Math.min(width / frame.width, height / frame.height));
        frame.setData('waterArtwork', water);
        this.shadow = scene.add.image(0, 5, texture).setScale(frame.scaleX)
            .setTint(0x000000).setAlpha(0.43);
        this.glow = scene.add.graphics().setAlpha(0);
        const checkX = -frame.displayWidth * (water ? 0.275 : 0.20);
        const checkSize = frame.displayHeight * (water ? 0.38 : 0.40);
        this.glow.fillStyle(water ? 0x8dfff0 : 0xb4ff91, 0.20)
            .fillCircle(checkX, 0, checkSize * 0.75);
        this.check = scene.add.graphics().setName('guideConfirmCheck');
        // A drawn mark stays legible without fonts or the short label.
        const points = [
            new Phaser.Math.Vector2(checkX - checkSize * 0.39, -checkSize * 0.02),
            new Phaser.Math.Vector2(checkX - checkSize * 0.10, checkSize * 0.28),
            new Phaser.Math.Vector2(checkX + checkSize * 0.43, -checkSize * 0.34),
        ];
        this.check.lineStyle(checkSize * 0.27, 0x152a17, 0.95).strokePoints(points);
        this.check.lineStyle(checkSize * 0.17, water ? 0xb9fff0 : 0xd7ff9f, 1).strokePoints(points);
        const labelX = frame.displayWidth * (water ? -0.02 : 0.13);
        this.label = scene.add.text(labelX, 0, 'OK', {
            resolution: 2, fontFamily: 'Georgia, serif', fontStyle: 'bold',
            fontSize: `${Math.round(Math.min(34, frame.displayHeight * 0.32))}px`,
            color: '#fff1bd', stroke: water ? '#101827' : '#123f2b', strokeThickness: 2,
        }).setOrigin(0.5).setName('guideConfirmLabel');
        this.label.setData('waterTextBox', {
            x: labelX, y: 0, width: frame.displayWidth * 0.32, height: frame.displayHeight * 0.48,
        });
        this.surface.add([frame, this.glow, this.check, this.label]);
        this.root.add([this.shadow, this.surface]);
        this.bindInteraction();
        this.root.once(Phaser.GameObjects.Events.DESTROY, this.dispose, this);
        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
        this.setEnabled(options.enabled ?? true);
    }

    get enabled(): boolean { return this.isEnabled && !this.disposed; }

    setEnabled(enabled: boolean): this {
        if (this.disposed) return this;
        this.isEnabled = enabled;
        this.pressed = false;
        this.applyState(enabled ? 'normal' : 'disabled', true);
        if (enabled) this.root.setInteractive({ useHandCursor: true });
        else this.root.disableInteractive();
        return this;
    }

    destroy(): void {
        if (this.disposed) return;
        this.dispose();
        this.root.destroy(true);
    }

    private dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.isEnabled = false;
        this.pressed = false;
        this.scene.tweens.killTweensOf([this.surface, this.shadow, this.glow]);
        this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    }

    private bindInteraction(): void {
        this.root.on('pointerover', () => { if (this.enabled && !this.pressed) this.applyState('hover'); });
        this.root.on('pointerout', () => {
            this.pressed = false;
            if (this.enabled) this.applyState('normal', true);
        });
        this.root.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event?: Phaser.Types.Input.EventData) => {
            event?.stopPropagation();
            if (!this.enabled) return;
            this.pressed = true;
            this.applyState('pressed');
        });
        this.root.on('pointerup', (pointer: Phaser.Input.Pointer, _x: number, _y: number, event?: Phaser.Types.Input.EventData) => {
            event?.stopPropagation();
            if (!this.enabled || !this.pressed) return;
            // Latch before the callback: a double tap cannot advance twice or fall
            // through into a scene whose controls the callback has just revealed.
            this.setEnabled(false);
            this.root.emit('action', pointer);
            this.options.onConfirm();
        });
        this.root.on('pointerupoutside', () => {
            this.pressed = false;
            if (this.enabled) this.applyState('normal', true);
        });
    }

    private applyState(state: ConfirmState, immediate = false): void {
        const y = state === 'hover' ? -3 : state === 'pressed' ? 2 : 0;
        const glow = state === 'hover' ? 1 : state === 'pressed' ? 0.55 : 0;
        this.scene.tweens.killTweensOf([this.surface, this.shadow, this.glow]);
        this.surface.setAlpha(state === 'disabled' ? 0.48 : 1);
        this.root.setData('confirmState', state).setData('ready', this.isEnabled);
        if (immediate) {
            this.surface.setY(y);
            this.shadow.setY(5).setAlpha(state === 'disabled' ? 0.2 : 0.43);
            this.glow.setAlpha(glow);
            return;
        }
        const duration = state === 'pressed' ? 70 : 120;
        this.scene.tweens.add({ targets: this.surface, y, duration, ease: 'Cubic.easeOut' });
        this.scene.tweens.add({ targets: this.shadow, y: state === 'hover' ? 7 : 3,
            alpha: state === 'hover' ? 0.55 : 0.43, duration });
        this.scene.tweens.add({ targets: this.glow, alpha: glow, duration });
    }
}

/** Capture object and scene pointer events while a guide is visible. */
export function blockGuidePointer(overlay: Phaser.GameObjects.Rectangle): Phaser.GameObjects.Rectangle {
    overlay.setInteractive();
    for (const type of ['pointerdown', 'pointerup', 'pointermove']) {
        overlay.on(type, (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event?: Phaser.Types.Input.EventData) => event?.stopPropagation());
    }
    return overlay;
}
