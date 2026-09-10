import Phaser from 'phaser';

export type WaterBox = { x: number; y: number; width: number; height: number; depth?: number };
export type WaterButtonState = 'normal' | 'hover' | 'pressed' | 'disabled' | 'selected';
export type EnamelIcon = 'check' | 'close' | 'hint' | 'continue';

/** Artwork is contained, never stretched. These are the existing fairy-reward assets. */
export function waterArtwork(scene: Phaser.Scene, texture: string, box: WaterBox): Phaser.GameObjects.Image {
    const image = scene.add.image(box.x, box.y, texture).setDepth(box.depth ?? 0);
    image.setScale(Math.min(box.width / image.width, box.height / image.height));
    image.setData('waterArtwork', true);
    return image;
}

export function fitWaterText(text: Phaser.GameObjects.Text, box: WaterBox, size: number, minimum = 18): void {
    text.setScale(1).setFontSize(size).setWordWrapWidth(box.width, true);
    while ((text.width > box.width || text.height > box.height) && size > minimum) text.setFontSize(--size);
    // Keep a real layout contract for browser QA. Do not hide overflow with masks or squeeze glyphs.
    text.setData('waterTextBox', box).setData('waterFontSize', size);
}

/** Shared blue enamel/pearl controls. All states retain the same art and hit area. */
export class UnderwaterButton {
    readonly root: Phaser.GameObjects.Container;
    readonly label: Phaser.GameObjects.Text;
    private surface: Phaser.GameObjects.Container;
    private glow: Phaser.GameObjects.Graphics;
    private pressed = false;
    private enabled = true;
    private state: WaterButtonState = 'normal';
    private normalIcon?: Phaser.GameObjects.Image;
    private activeIcon?: Phaser.GameObjects.Image;
    private shadow?: Phaser.GameObjects.Image;

    constructor(scene: Phaser.Scene, options: WaterBox & {
        depth: number; name: string; label: string; fontSize: number; pearl?: boolean; icon?: EnamelIcon; onClick: () => void;
    }) {
        const { width, height } = options;
        this.root = scene.add.container(options.x, options.y).setDepth(options.depth).setName(options.name);
        this.root.setSize(width, height).setInteractive({ useHandCursor: true });
        this.root.setData('waterControl', true);
        this.surface = scene.add.container(0, 0);
        this.glow = scene.add.graphics();
        let safe: WaterBox;
        let labelX = 0;
        if (options.icon) {
            const texture = options.label ? 'silverpond-fairy-title-frame' : 'enamel-control-socket';
            const box = { x: 0, y: 0, width, height };
            this.shadow = waterArtwork(scene, texture, box).setTint(0x000000).setAlpha(0.38).setY(3);
            this.root.add(this.shadow);
            const frame = waterArtwork(scene, texture, box);
            this.surface.add(frame);
            const size = options.label ? frame.displayHeight * 0.61 : frame.displayHeight * 0.73;
            const iconX = options.label ? -frame.displayWidth * 0.24 : 0;
            this.normalIcon = waterArtwork(scene, `enamel-${options.icon}-normal`, { x: iconX, y: 0, width: size, height: size });
            this.activeIcon = waterArtwork(scene, `enamel-${options.icon}-active`, { x: iconX, y: 0, width: size, height: size }).setAlpha(0);
            this.surface.add([this.normalIcon, this.activeIcon]);
            labelX = options.label ? frame.displayWidth * 0.07 : 0;
            safe = { x: labelX, y: 0, width: frame.displayWidth * 0.47, height: frame.displayHeight * 0.42 };
        } else if (options.pearl) {
            const radius = Math.min(width, height) / 2 - 7;
            const orb = scene.add.graphics();
            orb.fillStyle(0x031923, 0.7).fillCircle(0, 3, radius + 3);
            orb.fillStyle(0x173f55).fillCircle(0, 0, radius);
            orb.lineStyle(2, 0xaeced0).strokeCircle(0, 0, radius);
            orb.lineStyle(1, 0x4d91a3).strokeCircle(0, 0, radius - 5);
            orb.fillStyle(0x8de6e7, 0.13).fillEllipse(0, -radius * 0.4, radius * 1.3, radius * 0.65);
            this.glow.lineStyle(3, 0xb6fff0).strokeCircle(0, 0, radius + 3);
            this.surface.add(orb);
            safe = { x: 0, y: 0, width: radius * 1.4, height: radius * 1.35 };
        } else {
            const frame = waterArtwork(scene, 'silverpond-fairy-title-frame', { x: 0, y: 0, width, height });
            this.surface.add(frame);
            safe = { x: 0, y: 0, width: frame.displayWidth * 0.68, height: frame.displayHeight * 0.40 };
            this.glow.lineStyle(1, 0xb6fff0, 0.8).strokeRoundedRect(-safe.width / 2, -safe.height / 2 - 2, safe.width, safe.height + 4, 9);
        }
        this.glow.setAlpha(0);
        this.label = scene.add.text(labelX, 0, options.label, {
            resolution: 2,
            fontFamily: 'Georgia, serif', fontSize: `${options.fontSize}px`, color: '#e9f7ed',
            align: 'center', stroke: '#071e2f', strokeThickness: 1,
        }).setOrigin(0.5).setName(`${options.name}:label`);
        fitWaterText(this.label, safe, options.fontSize);
        this.surface.add([this.glow, this.label]);
        this.root.add(this.surface);
        this.root.on('pointerover', () => { if (this.enabled && !this.pressed) this.setState('hover'); });
        this.root.on('pointerout', () => { this.pressed = false; if (this.enabled) this.setState('normal'); });
        this.root.on('pointerdown', () => { if (this.enabled) { this.pressed = true; this.setState('pressed'); } });
        this.root.on('pointerup', () => {
            if (!this.enabled || !this.pressed) return;
            this.pressed = false;
            this.setState('normal'); // Touch must not leave a permanent hover highlight.
            this.root.emit('action');
            options.onClick();
        });
        this.root.on('pointerupoutside', () => { this.pressed = false; if (this.enabled) this.setState('normal'); });
    }

    setState(state: WaterButtonState): void {
        this.state = state;
        this.enabled = state === 'normal' || state === 'hover' || state === 'pressed';
        if (this.enabled) this.root.setInteractive({ useHandCursor: true });
        else this.root.disableInteractive();
        this.surface.setY(state === 'hover' ? -2 : state === 'pressed' ? 1 : 0);
        this.shadow?.setY(state === 'hover' ? 5 : 3).setAlpha(state === 'hover' ? 0.5 : 0.38);
        const active = state === 'hover' || state === 'pressed' || state === 'selected';
        if (this.normalIcon && this.activeIcon) {
            this.root.scene.tweens.killTweensOf([this.normalIcon, this.activeIcon]);
            this.root.scene.tweens.add({ targets: this.normalIcon, alpha: active ? 0 : 1, duration: 110 });
            this.root.scene.tweens.add({ targets: this.activeIcon, alpha: active ? 1 : 0, duration: 110 });
        }
        this.surface.setAlpha(state === 'disabled' ? 0.48 : 1);
        this.glow.setAlpha(state === 'hover' ? 0.45 : state === 'selected' ? 0.8 : state === 'pressed' ? 0.7 : 0);
        this.label.setColor(state === 'selected' ? '#b9ffee' : state === 'disabled' ? '#91afb8' : '#e9f7ed');
        this.root.setData('waterState', this.state);
    }

    destroy(): void { this.root.destroy(true); }
}

/** Actual rendered bounds, not only declared JSON sizes. Invoked by the browser QA gate. */
export function auditUnderwaterLayout(scene: Phaser.Scene): string[] {
    const errors: string[] = [];
    const labels: { name: string; bounds: Phaser.Geom.Rectangle }[] = [];
    const visit = (object: Phaser.GameObjects.GameObject, visible: boolean) => {
        const item = object as Phaser.GameObjects.Container;
        visible = visible && item.visible !== false;
        if (!visible) return;
        if (object instanceof Phaser.GameObjects.Text && object.frame.source.resolution !== object.style.resolution)
            errors.push(`${object.name || object.text}: text texture resolution differs from layout resolution`);
        if (item.getData('waterArtwork')) {
            const art = object as Phaser.GameObjects.Image;
            if (Math.abs(art.scaleX - art.scaleY) > 0.0001) errors.push(`${art.texture.key}: distorted artwork`);
        }
        const safe = item.getData('waterTextBox') as WaterBox | undefined;
        if (safe) {
            const text = object as Phaser.GameObjects.Text;
            if (text.width > safe.width + 1 || text.height > safe.height + 1 || text.scaleX !== 1 || text.scaleY !== 1)
                errors.push(`${text.name}: text exceeds its safe area`);
            const bounds = text.getBounds();
            const center = text.parentContainer
                ? text.parentContainer.getWorldTransformMatrix().transformPoint(safe.x, safe.y)
                : safe;
            if (bounds.left < center.x - safe.width / 2 - 1 || bounds.right > center.x + safe.width / 2 + 1
                || bounds.top < center.y - safe.height / 2 - 1 || bounds.bottom > center.y + safe.height / 2 + 1)
                errors.push(`${text.name}: text moved outside its safe area`);
            if (bounds.left < 0 || bounds.top < 0 || bounds.right > 1280 || bounds.bottom > 720)
                errors.push(`${text.name}: text outside viewport`);
            if (text.text && text.alpha > 0.1) labels.push({ name: text.name, bounds });
        }
        if (Array.isArray(item.list)) item.list.forEach(child => visit(child, visible));
    };
    scene.children.list.forEach(object => visit(object, true));
    const modal = scene.children.getByName('underwaterModal') as Phaser.GameObjects.Container | null;
    const safe = modal?.getData('waterModalSafeArea') as WaterBox | undefined;
    if (modal?.visible && safe) for (const item of modal.list) {
        if (item.name === 'waterModalFrame') continue;
        if (!(item instanceof Phaser.GameObjects.Text) && !item.getData('waterControl') && !item.getData('waterArtwork')) continue;
        const bounds = (item as Phaser.GameObjects.Container).getBounds();
        if (bounds.left < safe.x - safe.width / 2 || bounds.right > safe.x + safe.width / 2
            || bounds.top < safe.y - safe.height / 2 || bounds.bottom > safe.y + safe.height / 2)
            errors.push(`${item.name}: content touches the modal frame`);
    }
    for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
        if (Phaser.Geom.Intersects.RectangleToRectangle(labels[i].bounds, labels[j].bounds))
            errors.push(`${labels[i].name} overlaps ${labels[j].name}`);
    }
    return errors;
}
