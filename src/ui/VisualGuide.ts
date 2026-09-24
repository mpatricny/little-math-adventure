import { createMedievalPanel } from './MedievalPanel';
import Phaser from 'phaser';
import { gameAudio } from '../audio/AudioDirector';
import { SceneBuilder } from '../systems/SceneBuilder';
import { GameStateManager } from '../systems/GameStateManager';
import { PlayerState, PreparationKind } from '../types';
import preparation from '../data/preparation.json';
import { MedievalActionButton } from './MedievalActionButton';

export type GuideToken = { texture?: string; frame?: number; value?: number; symbol?: string; badge?: string; tint?: number };
export type GuidePage = {
    id: string;
    title: string;
    voiceId: string;
    before: GuideToken[];
    after: GuideToken[];
    equation?: string;
    target?: Phaser.GameObjects.GameObject;
    preparation?: PreparationKind;
    onShow?: () => void;
};

export function hasSeenGuide(player: PlayerState, id: string): boolean {
    return Array.isArray(player.seenGuides) && player.seenGuides.includes(id);
}

/** Isolated demonstration: never spends currency, prepares equipment or records a math attempt. */
export class VisualGuide {
    private root!: Phaser.GameObjects.Container;
    private timers: Phaser.Time.TimerEvent[] = [];
    private tweens: Phaser.Tweens.Tween[] = [];
    private index = 0;
    private completed = false;
    private destroyed = false;
    private next!: MedievalActionButton;
    private readonly player: PlayerState;

    constructor(
        private readonly scene: Phaser.Scene,
        private readonly builder: SceneBuilder,
        private readonly pages: GuidePage[],
        private readonly persist = true,
        private readonly onClose?: () => void,
    ) {
        this.player = GameStateManager.getInstance().getPlayer();
        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
        this.show();
    }

    private point(id: string) {
        const host = this.builder.get<Phaser.GameObjects.Container>(id)!;
        return { x: host.x, y: host.y, depth: host.depth };
    }

    private show(): void {
        this.clearPage();
        this.completed = false;
        const page = this.pages[this.index];
        page.onShow?.();
        const panel = this.point('guidePanelHost');
        this.root = this.scene.add.container(0, 0).setDepth(panel.depth).setName(`guide:${page.id}`);
        // One stable input shield prevents a demonstration click from buying or selecting anything underneath.
        this.root.add(this.scene.add.rectangle(640, 360, 1280, 720, 0x000000, 0).setInteractive());
        this.drawSpotlight(page.target);
        const panelHeight = this.builder.getElementDef('guidePanelHost')?.height ?? 392;
        this.root.add(createMedievalPanel(this.scene, panel.x, panel.y, 1000, panelHeight, 32));
        const title = this.point('guideTitleHost');
        this.root.add(this.text(title.x, title.y, page.title, 27));
        const before = this.point('guideBeforeHost');
        const after = this.point('guideAfterHost');
        const arrow = this.point('guideArrowHost');
        this.root.add(this.text(arrow.x, arrow.y, '→', 62));
        this.tokens(page.before, before.x, before.y);
        const outputs = this.tokens(page.after, after.x, after.y);
        outputs.forEach(token => token.setAlpha(0));
        const equation = this.point('guideEquationHost');
        const equationText = this.text(equation.x, equation.y, page.equation ?? '', 34).setAlpha(0);
        this.root.add(equationText);
        // Animated copies connect the pictured input and output; the originals remain as a visual reference.
        const moving = this.tokens(page.before, before.x, before.y);
        moving.forEach(token => this.tweens.push(this.scene.tweens.add({
            targets: token, x: arrow.x, alpha: 0, delay: 800, duration: 1100, ease: 'Sine.easeInOut',
        })));
        outputs.forEach((token, i) => {
            const x = token.x;
            token.setX(arrow.x);
            this.tweens.push(this.scene.tweens.add({ targets: token, x, alpha: 1, delay: 1900 + i * 120,
                duration: 700, ease: 'Sine.easeOut' }));
        });
        this.tweens.push(this.scene.tweens.add({ targets: equationText, alpha: 1, delay: 2500, duration: 350 }));
        if (page.preparation) this.animateCharges(page.preparation, equation.x, equation.y, equationText);
        const replay = this.point('guideReplayHost');
        const next = this.point('guideNextHost');
        const close = this.point('guideCloseHost');
        const replayButton = new MedievalActionButton(this.scene, {
            ...replay, width: 122, height: 58, layout: 'text', label: '↻', labelFontSize: 30,
            accent: 0xd9c27c, onClick: () => this.show(),
        });
        this.next = new MedievalActionButton(this.scene, {
            ...next, width: 160, height: 58, layout: 'text', label: this.index < this.pages.length - 1 ? '▶' : '✓',
            labelFontSize: 27, accent: 0xa5df8c, enabled: false, onClick: () => this.advance(),
        });
        const closeButton = new MedievalActionButton(this.scene, {
            ...close, width: 88, height: 52, layout: 'text', label: '×', labelFontSize: 25,
            accent: 0xe3b286, onClick: () => this.destroy(),
        });
        this.root.add([replayButton.root, this.next.root, closeButton.root]);
        // Audio is optional: muted players can finish after seeing the same complete demonstration.
        this.timers.push(this.scene.time.delayedCall(page.preparation ? 6500 : 3300, () => {
            this.completed = true;
            this.root.setData('ready', true);
            this.next.setEnabled(true);
        }));
        void gameAudio().speak(page.voiceId, this);
        // Keep a stable, inspectable description of the current page for accessibility and visual QA.
        this.root.setData({ guideId: page.id, before: page.before, after: page.after });
    }

    private drawSpotlight(target?: Phaser.GameObjects.GameObject): void {
        const object = target as Phaser.GameObjects.Image | Phaser.GameObjects.Container | undefined;
        const bounds = object?.active && 'getBounds' in object ? object.getBounds() : null;
        if (!bounds) {
            this.root.add(this.scene.add.rectangle(640, 360, 1280, 720, 0x08080d, 0.66));
            return;
        }
        const left = Math.max(0, bounds.x - 10), right = Math.min(1280, bounds.right + 10);
        const top = Math.max(0, bounds.y - 10), bottom = Math.min(720, bounds.bottom + 10);
        const shade = (x: number, y: number, w: number, h: number) => {
            if (w > 0 && h > 0) this.root.add(this.scene.add.rectangle(x, y, w, h, 0x08080d, 0.66).setOrigin(0));
        };
        shade(0, 0, 1280, top); shade(0, bottom, 1280, 720 - bottom);
        shade(0, top, left, bottom - top); shade(right, top, 1280 - right, bottom - top);
        const ring = this.scene.add.rectangle((left + right) / 2, (top + bottom) / 2,
            right - left, bottom - top, 0xffce67, 0.08).setStrokeStyle(4, 0xffd779);
        this.root.add(ring);
        this.tweens.push(this.scene.tweens.add({ targets: ring, alpha: 0.45, duration: 650, yoyo: true, repeat: -1 }));
    }

    private text(x: number, y: number, value: string, size: number): Phaser.GameObjects.Text {
        return this.scene.add.text(x, y, value, {
            resolution: 2, fontFamily: 'Georgia', fontSize: `${size}px`, color: '#ffedc0',
            stroke: '#171119', strokeThickness: 3,
        }).setOrigin(0.5);
    }

    private tokens(tokens: GuideToken[], x: number, y: number): Phaser.GameObjects.Container[] {
        return tokens.map((token, index) => {
            const root = this.scene.add.container(x + (index - (tokens.length - 1) / 2) * 100, y);
            if (token.texture && this.scene.textures.exists(token.texture)) {
                const image = this.scene.add.image(0, -10, token.texture, token.frame ?? 0);
                image.setScale(Math.min(92 / image.width, 92 / image.height));
                if (token.tint !== undefined) image.setTint(token.tint);
                root.add(image);
            } else root.add(this.text(0, -10, token.symbol ?? '✦', 64));
            if (token.badge) root.add(this.text(39, -37, token.badge, 32));
            if (token.value !== undefined) root.add(this.text(0, 55, String(token.value), 36));
            this.root.add(root);
            return root;
        });
    }

    private animateCharges(kind: PreparationKind, x: number, y: number, equation: Phaser.GameObjects.Text): void {
        equation.setVisible(false);
        const count = preparation.maxCharges;
        const runes = Array.from({ length: count }, (_, i) => this.scene.add.circle(x + (i - (count - 1) / 2) * 40, y, 12,
            kind === 'sword' ? 0xffc56c : 0x82dcff).setStrokeStyle(2, 0xfff2cc));
        this.root.add(runes);
        const bonus = kind === 'sword' ? preparation.effects.sword.damagePerCharge : preparation.effects.shield.blockPerCharge;
        const hit = this.text(x + 140, y, `${kind === 'sword' ? '⚔' : '🛡'} +${bonus}`, 30).setAlpha(0);
        this.root.add(hit);
        runes.forEach((rune, index) => {
            this.timers.push(this.scene.time.delayedCall(3100 + index * 1000, () => {
                rune.setFillStyle(0x3e3944).setStrokeStyle(2, 0x69616c);
                hit.setAlpha(1);
                this.tweens.push(this.scene.tweens.add({ targets: hit, alpha: 0, duration: 650, delay: 120 }));
            }));
        });
    }

    private advance(): void {
        if (!this.completed || this.destroyed) return;
        const id = this.pages[this.index].id;
        if (this.persist && GameStateManager.getInstance().getPlayer() === this.player) {
            if (!hasSeenGuide(this.player, id)) this.player.seenGuides = [...(Array.isArray(this.player.seenGuides) ? this.player.seenGuides : []), id];
            GameStateManager.getInstance().save();
        }
        this.scene.events.emit('guide-completed', id);
        if (++this.index < this.pages.length) this.show();
        else this.destroy();
    }

    private clearPage(): void {
        gameAudio().cancel(this);
        this.timers.forEach(timer => timer.remove()); this.timers = [];
        this.tweens.forEach(tween => tween.remove()); this.tweens = [];
        this.root?.destroy();
    }

    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.clearPage();
        this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
        this.onClose?.();
    }
}
