import { sfx, voice } from '../audio/AudioDirector';
import { bindPuzzleViewState } from './PuzzleViewState';
import Phaser from 'phaser';
import { SceneBuilder } from '../systems/SceneBuilder';
import { evaluateCurrents, type CurrentChallenge } from '../systems/UnderwaterCurrentProblems';
import { UnderwaterUI, waterHost, type WaterHost } from './UnderwaterUI';
import { fitWaterText } from './UnderwaterTheme';
import { waterPearl } from './UnderwaterPearls';
import { waterRipple } from './UnderwaterWorldFX';

/** Reuses the pearl/flow language, but one decision now affects two routes. */
export class UnderwaterCurrentPuzzle {
    readonly builder: SceneBuilder;
    readonly selected: Array<number | null> = [null, null, null];
    phase: 'building' | 'feedback' | 'solved' = 'building';
    hintLevel = 0;
    private slots: Phaser.GameObjects.Container[] = [];
    private cards: Phaser.GameObjects.Container[] = [];
    private feedback: Phaser.GameObjects.Text;
    private targets: Phaser.GameObjects.Arc[] = [];
    private disposed = false;
    private timers: Phaser.Time.TimerEvent[] = [];

    constructor(private scene: Phaser.Scene, ui: UnderwaterUI, readonly challenge: CurrentChallenge, options: {
        state?: Record<string, unknown>;
        onAnswer: (correct: boolean, assisted: boolean) => void;
        onClose: () => void;
    }) {
        bindPuzzleViewState(this, options.state, ['selected', 'hintLevel']);
        ui.open('');
        voice(scene, 'vo.water.current', true);
        const modal = ui.modal!;
        this.builder = new SceneBuilder(scene);
        this.builder.buildScene('UnderwaterCurrents');
        const label = (host: WaterHost, value: string, size: number, name: string) => {
            const text = scene.add.text(host.x, host.y, value, {
                resolution: 2, fontFamily: 'Georgia', fontSize: `${size}px`, color: '#e9fff0', align: 'center',
            }).setOrigin(0.5).setDepth(host.depth).setName(name);
            fitWaterText(text, host, size); return text;
        };
        modal.add(label(waterHost(this.builder, 'currentTitleHost'), 'První perla mění oba proudy.', 23, 'currentTitleHost'));
        this.feedback = label(waterHost(this.builder, 'currentFeedbackHost'), '', 23, 'currentFeedbackHost');
        modal.add(this.feedback);
        ui.button(this.builder, 'iconCloseHost', '×', options.onClose, true, 30);
        const sources = [0, 1].map(i => waterHost(this.builder, `currentSource${i}Host`));
        const steps = [0, 1, 2].map(i => waterHost(this.builder, `currentStep${i}Host`));
        const homes = [0, 1].map(i => waterHost(this.builder, `currentTarget${i}Host`));
        const fishTextures = ['silverpond-bubble-fish-idle-sheet', 'silverpond-ruin-axolotl-idle-sheet'];
        const paths: Phaser.Curves.Path[] = [];
        const conduit = scene.add.graphics().setDepth(steps[0].depth - 1);
        sources.forEach((source, i) => {
            const branch = steps[i + 1], home = homes[i];
            const path = new Phaser.Curves.Path(source.x + 40, source.y);
            path.lineTo(steps[0].x, steps[0].y).lineTo(branch.x, branch.y).lineTo(home.x, home.y);
            paths.push(path);
            conduit.lineStyle(12, 0x184451, 0.8); path.draw(conduit);
            conduit.lineStyle(3, i === 0 ? 0x8edce1 : 0xa9d8b8, 0.78); path.draw(conduit);
            for (const fraction of [0.14, 0.55, 0.87]) {
                const point = path.getPoint(fraction);
                conduit.lineStyle(2, 0xe2ffed, 0.8).beginPath().moveTo(point.x - 5, point.y - 5)
                    .lineTo(point.x + 2, point.y).lineTo(point.x - 5, point.y + 5).strokePath();
            }
            const fish = scene.add.sprite(source.x, source.y, fishTextures[i], 0).setDepth(source.depth);
            fish.setScale(Math.min(source.width / fish.width, source.height / fish.height));
            fish.setData('waterArtwork', true); modal.add(fish);
            modal.add(label({ ...source, y: source.y + 48, height: 34 }, String(challenge.starts[i]), 28, `currentSourceValue${i}`));
            const homeRoot = scene.add.container(home.x, home.y).setDepth(home.depth).setName(`currentTarget${i}Host`);
            const ring = scene.add.circle(0, 0, 47, 0x123b49, 0.95).setStrokeStyle(3, 0xb4c9b2);
            this.targets.push(ring);
            const miniature = scene.add.sprite(0, -19, fishTextures[i], 0);
            miniature.setScale(Math.min(88 / miniature.width, 70 / miniature.height)).setData('waterArtwork', true);
            const number = label({ ...home, x: 0, y: 24, width: 80, height: 40 }, String(challenge.targets[i]), 31, `currentTargetValue${i}`);
            homeRoot.add([ring, miniature, number]); modal.add(homeRoot);
        });
        modal.add(conduit);
        steps.forEach((host, i) => {
            const slot = scene.add.container(host.x, host.y).setDepth(host.depth).setName(`currentStep${i}Host`);
            slot.setSize(host.width, host.height).setInteractive({ useHandCursor: true }).setData('waterControl', true);
            slot.on('pointerdown', () => {
                if (this.phase !== 'building') return;
                this.selected[i] = null; this.refresh();
            });
            this.slots.push(slot); modal.add(slot);
        });
        const threshold = scene.input.dragDistanceThreshold;
        scene.input.dragDistanceThreshold = 8;
        challenge.cards.forEach((value, i) => {
            const host = waterHost(this.builder, `currentCard${i}Host`);
            const root = scene.add.container(host.x, host.y).setDepth(host.depth).setName(`currentCard${i}Host`);
            root.setSize(host.width, host.height).setInteractive({ useHandCursor: true }).setData('waterControl', true);
            const halo = scene.add.circle(0, -12, 34, 0x73d7c5, 0.09).setStrokeStyle(2, 0xd2d8ab, 0.6);
            root.add([halo, waterPearl(scene, 0, -12, 66), label({ ...host, x: 0, y: 31, width: 86, height: 36 }, this.signed(value), 28, `currentCardValue${i}`)]);
            let dragged = false;
            root.on('pointerover', () => halo.setAlpha(1));
            root.on('pointerout', () => halo.setAlpha(0.5));
            root.on('pointerdown', () => { dragged = false; });
            scene.input.setDraggable(root);
            root.on('dragstart', () => { dragged = true; });
            root.on('drag', (_p: Phaser.Input.Pointer, x: number, y: number) => { if (this.phase === 'building') root.setPosition(x, y); });
            root.on('dragend', (p: Phaser.Input.Pointer) => {
                root.setPosition(host.x, host.y);
                const slot = steps.findIndex(h => Math.abs(p.worldX - h.x) < h.width / 2 && Math.abs(p.worldY - h.y) < h.height / 2);
                if (slot >= 0) this.place(i, slot);
            });
            root.on('pointerup', () => {
                if (dragged || this.phase !== 'building') return;
                const existing = this.selected.indexOf(i);
                if (existing >= 0) { this.selected[existing] = null; this.refresh(); }
                else { const free = this.selected.indexOf(null); if (free >= 0) this.place(i, free); }
            });
            this.cards.push(root); modal.add(root);
        });
        ui.hint(this.builder, 'iconCurrentHintHost', () => {
            if (this.phase !== 'building') return;
            this.hintLevel++;
            if (this.hintLevel > 1) this.place(challenge.solutions[0][0], 0);
            const deltas = challenge.targets.map((v, i) => this.signed(v - challenge.starts[i]));
            this.feedback.setText(`Ryby potřebují: ${deltas[0]} a ${deltas[1]}.`).setColor('#e0eebd');
        }, () => this.phase === 'building' && this.hintLevel < 2);
        ui.button(this.builder, 'iconCurrentRunHost', '▶', () => {
            if (this.phase !== 'building') return;
            if (this.selected.includes(null)) { this.feedback.setText('Vyber tři perly.'); return; }
            this.phase = 'feedback';
            const result = evaluateCurrents(challenge, this.selected);
            sfx(scene, result.correct ? 'puzzle.solved' : 'math.retry');
            options.onAnswer(result.correct, this.hintLevel > 0);
            this.feedback.setText(result.targets.map((v, i) => `${v} ${result.matches[i] ? '=' : '≠'} ${challenge.targets[i]}`).join('     ·     '))
                .setColor(result.correct ? '#baffd3' : '#eed1a8');
            paths.forEach((path, i) => {
                const fish = scene.add.sprite(sources[i].x, sources[i].y, fishTextures[i], 0);
                fish.setScale(Math.min(58 / fish.width, 45 / fish.height)); modal.add(fish);
                scene.tweens.addCounter({ from: 0, to: 1, duration: 1300,
                    onUpdate: tween => {
                        if (this.disposed) return;
                        const point = path.getPoint(tween.getValue() ?? 0); fish.setPosition(point.x, point.y);
                    }, onComplete: () => { if (!this.disposed) fish.destroy(); } });
            });
            this.timers.push(scene.time.delayedCall(1320, () => {
                if (this.disposed) return;
                homes.forEach((home, i) => {
                    const color = result.matches[i] && result.valid ? 0xbaffd3 : 0xe0ad77;
                    this.targets[i].setStrokeStyle(3, color); waterRipple(scene, home.x, home.y, 820, color, 0.2);
                });
            }));
            this.timers.push(scene.time.delayedCall(2400, () => {
                if (this.disposed) return;
                if (result.correct) { this.phase = 'solved'; options.onClose(); }
                else this.phase = 'building';
            }));
        }, true, 27);
        this.refresh(); modal.sort('depth');
        modal.once('destroy', () => {
            this.disposed = true; this.timers.forEach(t => t.remove(false));
            scene.input.dragDistanceThreshold = threshold;
            scene.cache.json.get('scenes').scenes.UnderwaterCurrents.elements.forEach((def: { id: string }) => this.builder.get(def.id)?.destroy());
        });
    }

    private signed(value: number): string { return value >= 0 ? `+${value}` : `−${Math.abs(value)}`; }

    place(card: number, slot: number): void {
        if (this.phase !== 'building') return;
        const existing = this.selected.indexOf(card);
        if (existing >= 0) this.selected[existing] = null;
        this.selected[slot] = card; this.refresh();
    }

    private refresh(): void {
        this.feedback.setText('');
        this.targets.forEach(ring => ring.setStrokeStyle(3, 0xb4c9b2));
        this.slots.forEach((slot, i) => {
            slot.removeAll(true);
            slot.add(this.scene.add.circle(0, -7, 43, 0x0d3042, 1).setStrokeStyle(i === 0 ? 4 : 2, 0xa4c8c6));
            if (i === 0) slot.add(this.scene.add.circle(0, -7, 36, 0, 0).setStrokeStyle(1, 0x648b92));
            const card = this.selected[i];
            if (card !== null) slot.add(waterPearl(this.scene, 0, -7, 78));
            const y = card === null ? -7 : 44;
            const text = this.scene.add.text(0, y, card === null ? String(i + 1) : this.signed(this.challenge.cards[card]), {
                resolution: 2, fontFamily: 'Georgia', fontSize: '28px', color: card === null ? '#92adae' : '#efffed',
            }).setOrigin(0.5).setName(`currentStepValue${i}`);
            fitWaterText(text, { x: 0, y, width: 90, height: 34 }, 28); slot.add(text);
        });
        this.cards.forEach((card, i) => card.setAlpha(this.selected.includes(i) ? 0.3 : 1));
    }
}
