import Phaser from 'phaser';
import { SceneBuilder } from '../systems/SceneBuilder';
import { CharacterType } from '../types';
import { LEARNING_STATE_MARKS } from '../systems/LearningProfileView';
import type { LearningStage } from '../systems/CatacombProgress';

export const LEARNING_INK = '#244944';
export const LEARNING_MUTED = '#6a6a51';
export const LEARNING_TEAL = 0x267e79;
export const LEARNING_GOLD = 0xbc8b39;
export interface LearningHost { x: number; y: number; width: number; height: number; depth: number }

export function learningHost(builder: SceneBuilder, id: string): LearningHost {
    const host = builder.get<Phaser.GameObjects.Container>(id);
    const def = builder.getElementDef(id);
    if (!host || !def) throw new Error(`Missing learning layout host: ${id}`);
    return { x: host.x, y: host.y, width: def.width ?? 0, height: def.height ?? 0, depth: host.depth };
}

/** These layouts contain editor hosts outside the visual root; dispose them on overlay replacement too. */
export function destroyLearningLayout(scene: Phaser.Scene, builder: SceneBuilder, key: string): void {
    const elements = scene.cache.json.get('scenes')?.scenes[key]?.elements as Array<{ id: string }> | undefined;
    elements?.forEach(element => builder.get(element.id)?.destroy());
}

export function learningText(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, x: number, y: number,
    value: string, size = 20, color = LEARNING_INK, align: 'left' | 'center' | 'right' = 'center'): Phaser.GameObjects.Text {
    const text = scene.add.text(x, y, value, { resolution: 2, fontFamily: 'Georgia, serif', fontSize: `${size}px`,
        fontStyle: 'bold', color, align }).setOrigin(align === 'left' ? 0 : align === 'right' ? 1 : 0.5, 0.5);
    parent.add(text);
    return text;
}

export function learningCard(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, x: number, y: number,
    width: number, height: number, selected = false): Phaser.GameObjects.Graphics {
    const shape = scene.add.graphics();
    shape.fillStyle(selected ? 0xd9eee0 : 0xfff7dd, 0.94);
    shape.fillRoundedRect(x - width / 2, y - height / 2, width, height, 12);
    shape.lineStyle(selected ? 3 : 1.5, selected ? LEARNING_TEAL : 0xcbb987, 1);
    shape.strokeRoundedRect(x - width / 2, y - height / 2, width, height, 12);
    parent.add(shape);
    return shape;
}

/** Stable root hit area; the complete drawn surface moves together. */
export class LearningButton {
    readonly root: Phaser.GameObjects.Container;
    readonly surface: Phaser.GameObjects.Container;
    private enabled = true;
    private pressed = false;
    constructor(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, host: LearningHost, name: string,
        label: string, symbol: string, onClick: () => void, selected = false) {
        this.root = scene.add.container(host.x, host.y).setDepth(host.depth).setName(name);
        this.root.setSize(host.width, host.height).setInteractive({ useHandCursor: true });
        this.surface = scene.add.container();
        learningCard(scene, this.surface, 0, 0, host.width, host.height, selected);
        if (symbol) learningText(scene, this.surface, label ? -host.width * 0.32 : 0, 0, symbol, label ? 28 : 36);
        if (label) learningText(scene, this.surface, symbol ? host.width * 0.09 : 0, 0, label, 19);
        this.root.add(this.surface); parent.add(this.root);
        const restore = () => { this.pressed = false; this.surface.setY(0); };
        this.root.on('pointerover', () => { if (this.enabled && !this.pressed) this.surface.setY(-2); });
        this.root.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
            event?.stopPropagation();
            if (!this.enabled) return;
            this.pressed = true; this.surface.setY(2);
        });
        this.root.on('pointerup', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
            event?.stopPropagation();
            const activate = this.enabled && this.pressed; restore();
            if (activate) onClick();
        });
        this.root.on('pointerout', restore);
        this.root.on('pointerupoutside', restore);
        this.root.once('destroy', restore);
    }
    setEnabled(enabled: boolean): this {
        this.enabled = enabled; this.pressed = false; this.surface.setY(0).setAlpha(enabled ? 1 : 0.4);
        if (this.root.input) this.root.input.enabled = enabled;
        return this;
    }
}

export function learningPortrait(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, x: number, y: number,
    characterType: CharacterType | 'girl' | 'boy', size: number): Phaser.GameObjects.Sprite {
    const portrait = scene.add.sprite(x, y, characterType?.startsWith('boy')
        ? 'town-hud-hero-portrait' : 'town-hud-heroine-portrait');
    portrait.setScale(Math.min(size / portrait.width, size / portrait.height));
    parent.add(portrait);
    return portrait;
}

export function learningMarks(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, x: number, y: number,
    state: LearningStage, size = 8, total = 4): void {
    const count = LEARNING_STATE_MARKS[state];
    if (!count) {
        const lock = scene.add.graphics();
        lock.lineStyle(2, 0x7d806b); lock.strokeRoundedRect(x - 7, y - 8, 14, 13, 6);
        lock.fillStyle(0x7d806b); lock.fillRoundedRect(x - 10, y - 1, 20, 13, 3);
        parent.add(lock); return;
    }
    for (let i = 0; i < total; i++) {
        const mark = scene.add.star(x + (i - (total - 1) / 2) * (size * 2.4), y, 4, size * 0.48, size,
            i < count ? LEARNING_TEAL : 0xf6ecd0).setStrokeStyle(1.3, i < count ? 0x155d57 : 0xbfb38c);
        parent.add(mark);
    }
}
