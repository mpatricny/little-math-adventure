import Phaser from 'phaser';
import type { WaterHost } from './UnderwaterUI';

const SOFT_LIGHT = 'underwater-soft-light';

function lightTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists(SOFT_LIGHT)) return;
    const texture = scene.textures.createCanvas(SOFT_LIGHT, 128, 128)!;
    const context = texture.context;
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(218,255,230,0.85)');
    gradient.addColorStop(0.3, 'rgba(118,235,218,0.44)');
    gradient.addColorStop(1, 'rgba(79,201,210,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
    texture.refresh();
}

/** Localized light, floor spill and drifting motes — never a stroked outline of a doorway. */
export class UnderwaterHotspot {
    readonly root: Phaser.GameObjects.Container;
    private light: Phaser.GameObjects.Container;
    private hoverLight: Phaser.GameObjects.Container;
    private boost = { value: 0 };
    private enabled: boolean;
    private clock: Phaser.Tweens.Tween;

    constructor(private scene: Phaser.Scene, host: WaterHost, options: {
        id: string; kind: 'arch' | 'stairs' | 'arrival' | 'bell' | 'spring' | 'chest'; enabled?: boolean; onClick: () => void;
    }) {
        lightTexture(scene);
        this.enabled = options.enabled ?? true;
        this.root = scene.add.container(host.x, host.y).setDepth(host.depth).setName(options.id);
        this.root.setSize(host.width, host.height).setInteractive({ useHandCursor: true });
        this.root.setData('waterHotspot', true);
        this.light = scene.add.container(0, 0);
        this.hoverLight = scene.add.container(0, 0).setAlpha(0);
        this.root.add([this.light, this.hoverLight]);
        const isDoor = options.kind === 'arch' || options.kind === 'stairs';
        this.root.setData('waterExit', isDoor);
        this.root.setData('waterGlow', this.light).setData('waterHoverGlow', this.hoverLight);
        const layers = isDoor ? 5 : 3;
        for (let i = 0; i < layers; i++) {
            const spot = scene.add.image(0, isDoor ? host.height * (0.3 - i * 0.13) : 0, SOFT_LIGHT)
                .setDisplaySize(host.width * (isDoor ? 1.2 - i * 0.11 : 1.12), host.height * (isDoor ? 0.65 : 1))
                .setAlpha(isDoor ? 0.78 : 0.34);
            this.light.add(spot);
        }
        if (isDoor) {
            // Separate additive light volumes keep hover visibly stronger even when
            // the normal container is already near alpha=1 (alpha cannot exceed 1).
            for (let i = 0; i < 3; i++) {
                const shaft = scene.add.image(0, host.height * (0.28 - i * 0.2), SOFT_LIGHT)
                    .setDisplaySize(host.width * 0.9, host.height * 0.75)
                    .setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.72);
                this.hoverLight.add(shaft);
            }
            this.hoverLight.add(scene.add.image(0, host.height * 0.47, SOFT_LIGHT)
                .setDisplaySize(host.width * 2.25, host.height * 0.35)
                .setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.9));
        }
        // The pool of light spills onto the paving, grounding the luminous opening in the room.
        if (isDoor || options.kind === 'spring') {
            this.light.add(scene.add.image(0, host.height * 0.47, SOFT_LIGHT)
                .setDisplaySize(host.width * 2.1, host.height * 0.3).setAlpha(isDoor ? 0.95 : 0.72));
        }
        for (let i = 0; i < 9; i++) {
            const x = ((i * 37) % 83 / 83 - 0.5) * host.width * 0.64;
            const mote = scene.add.image(x, host.height * 0.36, SOFT_LIGHT).setDisplaySize(7, 11).setAlpha(0.6);
            this.light.add(mote);
            scene.tweens.add({ targets: mote, y: -host.height * 0.4, x: x + 8,
                alpha: 0, duration: 2400 + i * 120, delay: i * 300, repeat: -1 });
        }
        if (options.kind === 'stairs') {
            // Three small swimming-direction chevrons; the stairs themselves remain the hit target.
            const arrows = scene.add.graphics().lineStyle(3, 0xd9fff0, 0.6);
            for (let i = 0; i < 3; i++) {
                const y = -i * 24;
                arrows.beginPath().moveTo(-12, y + 7).lineTo(0, y - 5).lineTo(12, y + 7).strokePath();
            }
            this.light.add(arrows);
        }
        const phase = { value: 0 };
        const paintLight = () => {
            this.light.setAlpha(this.enabled
                ? isDoor ? 0.92 + Math.sin(phase.value) * 0.07 : 0.7 + Math.sin(phase.value) * 0.18 + this.boost.value
                : 0.035);
            this.hoverLight.setAlpha(this.enabled ? this.boost.value : 0);
        };
        paintLight();
        this.clock = scene.tweens.add({ targets: phase, value: Math.PI * 2, duration: 3400, repeat: -1, onUpdate: paintLight });
        this.root.on('pointerover', () => this.emphasize(0.65));
        this.root.on('pointerout', () => this.emphasize(0));
        this.root.on('pointerdown', () => this.emphasize(0.9));
        this.root.on('pointerupoutside', () => this.emphasize(0));
        this.root.on('pointerup', (pointer: Phaser.Input.Pointer) => {
            this.emphasize(pointer.wasTouch ? 0 : 0.65); options.onClick();
        });
        this.root.once('destroy', () => { this.clock.stop(); scene.tweens.killTweensOf(this.boost); });
    }

    setEnabled(enabled: boolean): void { this.enabled = enabled; }
    setHovered(active: boolean): void { this.emphasize(active ? 0.65 : 0); }
    pulse(): void {
        this.emphasize(1.2);
        this.scene.time.delayedCall(600, () => { if (this.root.active) this.emphasize(0); });
    }
    private emphasize(value: number): void {
        this.scene.tweens.killTweensOf(this.boost);
        this.scene.tweens.add({ targets: this.boost, value, duration: 180 });
    }
}

export function waterRipple(scene: Phaser.Scene, x: number, y: number, depth: number, color = 0xb8ffdf, size = 1): void {
    lightTexture(scene);
    const glow = scene.add.image(x, y, SOFT_LIGHT).setDepth(depth).setTint(color).setAlpha(0.85).setScale(size);
    scene.tweens.add({ targets: glow, scale: 3 * size, alpha: 0, duration: 950, onComplete: () => glow.destroy() });
    for (let i = 0; i < 3; i++) {
        const ring = scene.add.circle(x, y, 18 * size, 0, 0).setStrokeStyle(2 * Math.min(1, size * 2), color, 0.55).setDepth(depth);
        scene.tweens.add({ targets: ring, scale: 7 + i * 2, alpha: 0, delay: i * 180,
            duration: 1200, ease: 'Sine.easeOut', onComplete: () => ring.destroy() });
    }
}

/** The actual kelp artwork breaks into shared-scale strips; works in Canvas as well as WebGL. */
export function dissolveUnderwaterKelp(scene: Phaser.Scene, kelp: Phaser.GameObjects.Image, done: () => void): void {
    const { width, height } = kelp;
    const strips = 12;
    kelp.setVisible(false);
    for (let i = 0; i < strips; i++) {
        const fragment = scene.add.image(kelp.x, kelp.y, kelp.texture.key)
            .setScale(kelp.scaleX).setDepth(kelp.depth).setCrop(0, i * height / strips, width, height / strips);
        scene.tweens.add({ targets: fragment, x: fragment.x + (i % 2 ? 38 : -38), y: fragment.y - 75,
            alpha: 0, delay: i * 105, duration: 1450, ease: 'Sine.easeIn', onComplete: () => fragment.destroy() });
        const x = kelp.x + Math.sin(i * 2.3) * kelp.displayWidth * 0.3;
        const y = kelp.y - kelp.displayHeight / 2 + i * kelp.displayHeight / strips;
        scene.time.delayedCall(i * 105, () => waterRipple(scene, x, y, kelp.depth + 1, 0xadffd1, 0.23));
    }
    scene.time.delayedCall(2800, done);
}
