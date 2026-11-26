import Phaser from 'phaser';

export interface PracticeChoiceRegion { x: number; y: number; width: number; height: number }
export interface PracticeChoiceHost extends PracticeChoiceRegion {
    depth: number;
    regions?: Record<string, PracticeChoiceRegion>;
}

export function practiceArt(scene: Phaser.Scene, key: string, host: PracticeChoiceRegion): Phaser.GameObjects.Image {
    const image = scene.add.image(host.x, host.y, key);
    return image.setScale(Math.min(host.width / image.width, host.height / image.height));
}

export function practiceLabel(scene: Phaser.Scene, value: string, host: PracticeChoiceRegion, size: number): Phaser.GameObjects.Text {
    return scene.add.text(host.x, host.y, value, {
        fontFamily: 'Gelasio, Georgia, serif', fontSize: size, fontStyle: 'bold',
        color: '#fff0bb', resolution: 2, shadow: { offsetY: 2, color: '#071421', blur: 2, fill: true },
    }).setOrigin(0.5).setData('practiceWord', true).setData('safeRegion', host);
}

export function practiceCheck(scene: Phaser.Scene, x: number, y: number, size: number, color = 0xb8f8cc): Phaser.GameObjects.Graphics {
    return scene.add.graphics().setPosition(x, y).lineStyle(size * 0.12, color, 1)
        .strokePoints([{ x: -size * .36, y: 0 }, { x: -size * .08, y: size * .28 }, { x: size * .42, y: -size * .34 }]);
}

/** Frame, picture and caption share one moving surface; the touch target stays still. */
export class PracticeChoiceControl {
    readonly root: Phaser.GameObjects.Container;
    readonly surface: Phaser.GameObjects.Container;
    private readonly shadow: Phaser.GameObjects.Image;
    private readonly light: Phaser.GameObjects.Image;
    private readonly frameY: number;
    private readonly seal?: Phaser.GameObjects.Container;
    private enabled = true;
    private selected = false;
    private pressed = false;
    private disposed = false;

    constructor(private scene: Phaser.Scene, host: PracticeChoiceHost, name: string, frameKey: string,
        label: string, picture: string | null, private onClick: () => void, tall = false,
        private readonly disabledAlpha = .38) {
        this.root = scene.add.container(host.x, host.y).setDepth(host.depth).setName(name).setSize(host.width, host.height);
        this.surface = scene.add.container(0, 0).setName('surface');
        const local = host.regions?.frame ?? { x: 0, y: 0, width: host.width, height: host.height };
        this.frameY = local.y;
        this.shadow = practiceArt(scene, frameKey, { ...local, y: this.frameY + 5 }).setTint(0x000000).setAlpha(.38);
        const frame = practiceArt(scene, frameKey, local).setName('frame');
        this.light = practiceArt(scene, frameKey, local).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
        this.surface.add([frame, this.light]);
        if (picture) {
            const region = host.regions!.picture;
            this.surface.add(practiceArt(scene, picture, region).setName('picture'));
        }
        if (label) this.surface.add(practiceLabel(scene, label, host.regions!.label, tall ? 30 : picture ? 26 : 32));
        if (picture) {
            const r = host.regions!.seal;
            this.seal = scene.add.container(r.x, r.y).setVisible(false);
            const radius = r.width / 2;
            const disk = scene.add.graphics().fillStyle(0x7b4b1d).fillCircle(0, 2, radius)
                .fillStyle(0xf1c36b).fillCircle(0, 0, radius).lineStyle(2, 0xffe8aa).strokeCircle(0, 0, radius)
                .fillStyle(0xffe6a0, .45).fillCircle(-radius * .2, -radius * .25, radius * .6);
            this.seal.add([disk, practiceCheck(scene, 0, 0, r.width * .64, 0x513a1d)]);
            this.surface.add(this.seal);
        }
        this.root.add([this.shadow, this.surface]).setInteractive({ useHandCursor: true });
        this.root.on('pointerover', () => { if (this.enabled && !this.pressed) this.present(-3); });
        this.root.on('pointerout', () => this.release());
        this.root.on('pointerupoutside', () => this.release());
        this.root.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
            event.stopPropagation();
            if (!this.enabled) return;
            this.pressed = true; this.present(2);
        });
        this.root.on('pointerup', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
            event.stopPropagation();
            if (!this.enabled || !this.pressed) return;
            this.pressed = false; this.present(0); this.onClick();
        });
        this.root.once('destroy', () => {
            this.disposed = true;
            scene.tweens.killTweensOf([this.surface, this.shadow, this.light]);
        });
    }

    setEnabled(value: boolean): void {
        this.enabled = value; this.pressed = false;
        this.root.setData('enabled', value);
        if (value) this.root.setInteractive({ useHandCursor: true }); else this.root.disableInteractive();
        this.present(0, true);
    }

    setSelected(value: boolean): void {
        this.selected = value;
        this.seal?.setVisible(value);
        this.root.setData('selected', value);
        this.present(0, true);
    }

    private release(): void { this.pressed = false; this.present(0, true); }

    private present(y: number, immediate = false): void {
        if (this.disposed) return;
        this.scene.tweens.killTweensOf([this.surface, this.shadow, this.light]);
        const alpha = this.enabled ? 1 : this.disabledAlpha;
        const light = this.selected ? .22 : y ? .12 : 0;
        this.surface.setAlpha(alpha);
        this.root.setData('pressed', this.pressed);
        if (immediate) {
            this.surface.setY(y); this.light.setAlpha(light); this.shadow.setY(this.frameY + 5).setAlpha(alpha * .38);
        } else {
            this.scene.tweens.add({ targets: this.surface, y, duration: 110 });
            this.scene.tweens.add({ targets: this.light, alpha: light, duration: 130 });
            this.scene.tweens.add({ targets: this.shadow, y: this.frameY + (y < 0 ? 8 : 5), alpha: alpha * .38, duration: 110 });
        }
    }
}
