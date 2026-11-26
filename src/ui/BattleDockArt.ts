import Phaser from 'phaser';

export interface DockHost { x: number; y: number; depth: number; width: number; height: number; safeInset?: number;
    regions?: Record<string, Pick<DockHost,'x'|'y'|'width'|'height'>>; wide?: Partial<DockHost> }
export const DOCK_OWNER_COLORS = { A: 0x39eee5, B: 0xe879ff } as const;
export const dockHost = (host: DockHost, wide: boolean): DockHost => wide ? { ...host, ...host.wide } : host;
export function dockImage(scene: Phaser.Scene, key: string, host: Pick<DockHost, 'x' | 'y' | 'width' | 'height'>): Phaser.GameObjects.Image {
    const image = scene.add.image(host.x, host.y, key);
    image.setScale(Math.min(host.width / image.width, host.height / image.height));
    return image;
}

/** Enamel rails share one construction. Text and portraits are separate layers;
 * the selected state changes light, never silhouette or content placement. */
export function dockTabTexture(scene: Phaser.Scene, width: number, height: number,
    color = 0x53717a, selected = false, kind: 'tab' | 'name' | 'group' = 'tab'): string {
    const key = `battle-dock-rail-v4-${width}-${height}-${color}-${selected}-${kind}`;
    if (scene.textures.exists(key)) return key;
    const tex = scene.textures.createCanvas(key, width * 2, height * 2)!;
    const ctx = tex.getContext(); ctx.scale(2, 2);
    const purple = color === DOCK_OWNER_COLORS.B, group = kind === 'group';
    const hex = selected ? '#' + color.toString(16).padStart(6, '0') : purple ? '#7b608e' : '#417d81';
    const inset = group ? 4 : 5, radius = kind === 'name' ? height / 2 - inset : group ? 16 : 12;
    const path = (extra = 0) => { ctx.beginPath(); ctx.roundRect(inset + extra, inset + extra,
        width - (inset + extra) * 2, height - (inset + extra) * 2, Math.max(2, radius - extra)); };
    const fill = ctx.createLinearGradient(0, inset, 0, height - inset);
    fill.addColorStop(0, selected && !group ? (purple ? '#54226e' : '#14636d') : purple ? '#32273c' : '#163746');
    fill.addColorStop(.38, purple && !group ? selected ? '#251036' : '#1c1b2e' : '#062335');
    fill.addColorStop(1, selected && !group ? (purple ? '#51233f' : '#105b58') : purple ? '#2d2035' : '#102a35');
    path(); ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = hex;
    if (selected) { ctx.shadowColor = hex; ctx.shadowBlur = group ? 8 : 9; }
    ctx.lineWidth = group ? 2.6 : selected ? 2.4 : 1.6; ctx.stroke(); ctx.shadowBlur = 0;
    const rim = ctx.createLinearGradient(0, 0, 0, height);
    rim.addColorStop(0, selected ? '#e9ffff' : purple ? '#876c99' : '#66838d');
    rim.addColorStop(.34, hex); rim.addColorStop(.78, selected ? '#95d7d3' : '#334b55');
    rim.addColorStop(1, selected ? '#ffe49b' : '#51626b');
    path(1.5); ctx.strokeStyle = rim; ctx.lineWidth = .9; ctx.stroke();
    // A fine gold inner lip belongs only to the selected fox tab.
    if (kind === 'tab' && selected) { path(4); ctx.strokeStyle = '#f4cf76'; ctx.lineWidth = 1.1; ctx.stroke(); }
    tex.refresh();
    return key;
}

/** A clipped light field sits inside the existing gold socket, not over its rim. */
export function dockWellTexture(scene: Phaser.Scene, size: number, color: number, round: boolean): string {
    const key = `battle-dock-well-${size}-${color}-${round}`;
    if (scene.textures.exists(key)) return key;
    const tex = scene.textures.createCanvas(key, size * 2, size * 2)!;
    const ctx = tex.getContext(); ctx.scale(2, 2);
    const mid = size / 2, r = size * .405;
    ctx.beginPath();
    if (round) ctx.arc(mid, mid, r, 0, Math.PI * 2);
    else { const cut = size * .09; ctx.moveTo(mid-r+cut,mid-r); ctx.lineTo(mid+r-cut,mid-r);
        ctx.lineTo(mid+r,mid-r+cut); ctx.lineTo(mid+r,mid+r-cut); ctx.lineTo(mid+r-cut,mid+r);
        ctx.lineTo(mid-r+cut,mid+r); ctx.lineTo(mid-r,mid+r-cut); ctx.lineTo(mid-r,mid-r+cut); ctx.closePath(); }
    const hex = '#' + color.toString(16).padStart(6, '0');
    const glow = ctx.createRadialGradient(mid, mid, 0, mid, mid, r * 1.2);
    glow.addColorStop(0, round ? '#fff1aef0' : hex + 'dd');
    if (round) glow.addColorStop(.28, hex + 'f0');
    glow.addColorStop(.6, hex + (round ? 'c0' : '66')); glow.addColorStop(1, hex + '00');
    ctx.fillStyle = glow; ctx.fill(); tex.refresh(); return key;
}

export function dockText(scene: Phaser.Scene, text: string, host: Pick<DockHost, 'x'|'y'|'width'|'height'>,
    fontSize = 20, name = ''): Phaser.GameObjects.Text {
    return scene.add.text(host.x, host.y, text, {
        fontFamily: 'Arial, sans-serif', fontSize, fontStyle: 'bold',
        color: '#fffaf0', stroke: '#071c31', strokeThickness: 2, resolution: 2,
        align: 'center', wordWrap: { width: host.width - 2, useAdvancedWrap: true },
    }).setOrigin(.5).setName(name).setData('safeRegion', host);
}

/** Twelve-character names have room for two balanced lines in the authored
 * inset. Keep the same font size and the complete name in every state. */
export function setDockName(label: Phaser.GameObjects.Text, name: string): void {
    if (label.getData('savedName') === name) return;
    label.setText(name);
    if (!/\s/.test(name) && label.getWrappedText(name).length > 1) {
        const chars = Array.from(name), middle = Math.ceil(chars.length / 2);
        label.setText(chars.slice(0, middle).join('') + '\n' + chars.slice(middle).join(''));
    }
    label.setData('savedName', name);
}

export function dockBadge(scene: Phaser.Scene, size: number, color = 0x092b40) {
    const root = scene.add.container(0, 0);
    const shadow = scene.add.circle(0, 1, size / 2 + 1, 0x03121f).setStrokeStyle(1, 0x714d1a);
    const plate = scene.add.circle(0, 0, size / 2, color).setStrokeStyle(2, 0xffd56c);
    const text = dockText(scene, '', { x: 0, y: 0, width: size - 4, height: size - 4 }, Math.round(size * .65));
    text.setColor('#ffe28b'); root.add([shadow, plate, text]);
    return { root, plate, text };
}

/** One surface owns frame, icon and overlays. The root hit area never moves. */
export class BattleDockControl {
    readonly root: Phaser.GameObjects.Container;
    readonly surface: Phaser.GameObjects.Container;
    readonly frame: Phaser.GameObjects.Image;
    readonly normalIcon: Phaser.GameObjects.Image;
    readonly activeIcon: Phaser.GameObjects.Image;
    readonly light: Phaser.GameObjects.Image;
    readonly badge: ReturnType<typeof dockBadge>;
    enabled = true;
    pressed = false;
    private selected = false;
    private iconSize: number;
    private tint = 0xffffff;
    private glow: Phaser.GameObjects.Image | null = null;
    private vivid = false;
    private readonly shadow: Phaser.GameObjects.Image;

    constructor(private scene: Phaser.Scene, host: DockHost, name: string,
        frameKey: string, normal: string, active: string, private onClick: () => void, iconSize = host.width * .7,
        badgeSize = 30) {
        this.iconSize = iconSize;
        this.root = scene.add.container(host.x, host.y).setName(name).setDepth(host.depth).setSize(host.width, host.height);
        this.surface = scene.add.container(0, 0).setName(`${name}Surface`);
        const local = { x: 0, y: 0, width: host.width, height: host.height };
        this.shadow = dockImage(scene, frameKey, { ...local, y: 3 }).setTint(0x000000).setAlpha(.3);
        this.frame = dockImage(scene, frameKey, local);
        this.light = dockImage(scene, frameKey, local).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
        this.normalIcon = dockImage(scene, normal, { ...local, width: iconSize, height: iconSize });
        this.activeIcon = dockImage(scene, active, { ...local, width: iconSize, height: iconSize }).setAlpha(0);
        this.badge = dockBadge(scene, badgeSize);
        this.badge.root.setVisible(false);
        this.surface.add([this.frame, this.light, this.normalIcon, this.activeIcon, this.badge.root]);
        this.root.add([this.shadow, this.surface]);
        this.root.on('pointerover', () => { if (this.enabled && !this.pressed) this.present(-2); });
        this.root.on('pointerout', () => this.reset());
        this.root.on('pointerupoutside', () => this.reset());
        this.root.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
            event?.stopPropagation();
            if (!this.enabled) return;
            this.pressed = true; this.present(2);
        });
        this.root.on('pointerup', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
            event?.stopPropagation();
            if (!this.enabled || !this.pressed) return;
            this.setEnabled(false); // The next model update alone may re-enable it.
            this.onClick();
        });
        this.root.once('destroy', () => scene.tweens.killTweensOf([this.surface, this.light, this.normalIcon, this.activeIcon]));
        this.setEnabled(false);
    }

    setFrame(key: string, width: number, height: number): void {
        for (const image of [this.frame, this.light, this.shadow]) image.setTexture(key)
            .setScale(Math.min(width / image.width, height / image.height));
    }

    setIllumination(color: number, size: number, round: boolean): void {
        if (!this.glow) {
            this.glow = dockImage(this.scene, dockWellTexture(this.scene, size, color, round), { x: 0, y: 0, width: size, height: size });
            this.surface.addAt(this.glow, 2);
        }
        this.vivid = true; this.reset();
    }

    setIcon(normal: string, active = normal, frame?: number | string): void {
        if (this.normalIcon.texture.key === normal && this.normalIcon.frame.name === (frame ?? '__BASE')) return;
        this.reset();
        this.normalIcon.setTexture(normal, frame); this.activeIcon.setTexture(active, frame);
        for (const image of [this.normalIcon, this.activeIcon]) image.setScale(Math.min(this.iconSize / image.width, this.iconSize / image.height));
    }

    setEnabled(enabled: boolean): void {
        if (enabled === this.enabled) return;
        this.enabled = enabled; this.root.setData('enabled', enabled);
        this.reset();
        if (enabled) this.root.setInteractive({ useHandCursor: true }); else this.root.disableInteractive();
        // Disabling dims the artwork but leaves state markers/counts readable.
        this.frame.setAlpha(enabled ? 1 : .62);
        this.reset();
    }

    setSelected(selected: boolean, tint = 0xffffff): void {
        if (this.selected === selected && this.tint === tint) return;
        this.selected = selected; this.tint = tint;
        this.light.setTint(tint).setAlpha(selected ? .19 : 0);
    }

    reset(): void {
        this.pressed = false;
        this.scene.tweens.killTweensOf([this.surface, this.light, this.normalIcon, this.activeIcon]);
        this.surface.setY(0); this.light.setAlpha(this.selected ? .19 : 0);
        this.normalIcon.setAlpha(this.enabled ? this.vivid ? 0 : 1 : .34);
        this.activeIcon.setAlpha(this.enabled && this.vivid ? 1 : 0);
        this.glow?.setAlpha(this.enabled ? .9 : .12);
    }

    private present(y: number): void {
        this.scene.tweens.killTweensOf([this.surface, this.light, this.normalIcon, this.activeIcon]);
        const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 110;
        this.scene.tweens.add({ targets: this.surface, y, duration, ease: 'Sine.easeOut' });
        this.scene.tweens.add({ targets: this.light, alpha: this.selected ? .3 : .15, duration });
        this.scene.tweens.add({ targets: this.normalIcon, alpha: 0, duration });
        this.scene.tweens.add({ targets: this.activeIcon, alpha: 1, duration });
    }
}
