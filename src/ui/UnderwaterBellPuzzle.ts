import { sfx, voice } from '../audio/AudioDirector';
import { bindPuzzleViewState } from './PuzzleViewState';
import Phaser from 'phaser';
import { SceneBuilder } from '../systems/SceneBuilder';
import { evaluatePearlFlow, type PearlFlowChallenge } from '../systems/UnderwaterBellProblems';
import { UnderwaterUI, waterHost } from './UnderwaterUI';
import { fitWaterText, waterArtwork } from './UnderwaterTheme';
import { waterPearl } from './UnderwaterPearls';
import { waterRipple } from './UnderwaterWorldFX';

export class UnderwaterBellPuzzle {
    readonly builder: SceneBuilder;
    readonly challenge: PearlFlowChallenge;
    readonly selected: Array<number | null> = [null, null];
    phase: 'building' | 'feedback' = 'building';
    hintLevel = 0;
    private submitted = false;
    private disposed = false;
    private root: Phaser.GameObjects.Container;
    private cards: Phaser.GameObjects.Container[] = [];
    private slots: Phaser.GameObjects.Container[] = [];
    private feedback: Phaser.GameObjects.Text;
    private lamps: Phaser.GameObjects.Image[] = [];
    private timers: Phaser.Time.TimerEvent[] = [];

    constructor(private scene: Phaser.Scene, ui: UnderwaterUI, options: {
        state?: Record<string, unknown>;
        challenge: PearlFlowChallenge; notes: number; total: number;
        onAnswer: (correct: boolean, evidence: { assisted: boolean; firstSubmission: boolean }) => void;
        onNext: () => void; onClose: () => void;
        solver?: { texture: string; id: 'A' | 'B' };
    }) {
        this.challenge = options.challenge;
        bindPuzzleViewState(this, options.state, ['selected', 'hintLevel', 'submitted']);
        ui.open('');
        voice(scene, 'vo.water.bell', true);
        this.root = ui.modal!;
        this.builder = new SceneBuilder(scene);
        this.builder.buildScene('UnderwaterFlow');
        const dragThreshold = scene.input.dragDistanceThreshold;
        scene.input.dragDistanceThreshold = 8;
        const text = (id: string, value: string, size: number) => {
            const host = waterHost(this.builder, id);
            const label = scene.add.text(host.x, host.y, value, {
                resolution: 2, fontFamily: 'Georgia', fontSize: `${size}px`, color: '#e9fff0', align: 'center',
            }).setOrigin(0.5).setDepth(host.depth).setName(id);
            fitWaterText(label, host, size); this.root.add(label); return label;
        };
        text('flowHintHost', 'Dva kroky. Pak rozezvoň zvon.', 23);
        this.feedback = text('flowFeedbackHost', '', 25);
        ui.button(this.builder, 'iconCloseHost', '×', options.onClose, true, 30);
        ui.hint(this.builder, 'iconFlowHintHost', () => this.showHint(), () => this.phase === 'building' && this.hintLevel < 2);
        if (options.solver) {
            const host = waterHost(this.builder, 'puzzleSolverHost');
            const hero = scene.add.sprite(host.x, host.y, options.solver.texture, 0).setDepth(host.depth).setName('activePuzzleSolver');
            hero.setScale(Math.min(host.width / hero.width, host.height / hero.height));
            hero.setData('waterArtwork', true).setData('solverId', options.solver.id);
            this.root.add(hero);
        }
        const start = waterHost(this.builder, 'flowStartHost');
        const bellHost = waterHost(this.builder, 'bellInstrumentHost');
        const conduit = scene.add.graphics().setDepth(start.depth);
        const slotHosts = [0, 1].map(i => waterHost(this.builder, `flowStep${i}Host`));
        const points = [start, ...slotHosts, { ...bellHost, y: start.y }];
        for (let i = 0; i < 3; i++) {
            const left = points[i], right = points[i + 1];
            conduit.lineStyle(12, 0x143e56, 0.8).lineBetween(left.x + 55, start.y, right.x - 62, start.y);
            conduit.lineStyle(3, 0x73c7c2, 0.7).lineBetween(left.x + 55, start.y, right.x - 62, start.y);
            const x = (left.x + right.x) / 2;
            conduit.lineStyle(3, 0xc3f8e8, 0.8).beginPath().moveTo(x - 7, start.y - 7).lineTo(x + 2, start.y).lineTo(x - 7, start.y + 7).strokePath();
        }
        this.root.add(conduit);
        // One source only; its outgoing current leads through two sockets to the bell.
        this.root.add(waterArtwork(scene, 'underwater-pearl-shell', { ...start, y: start.y + 32, height: start.height * 0.68 }));
        this.root.add(waterPearl(scene, start.x, start.y - 12, 82).setDepth(start.depth));
        text('flowStartValueHost', String(this.challenge.start), 31).setColor('#153343');
        const bell = waterArtwork(scene, 'underwater-bell-instrument', bellHost);
        this.root.add(bell);
        const target = waterHost(this.builder, 'bellTargetHost');
        this.root.add(scene.add.circle(target.x, target.y, 29, 0x0c2b39, 0.95).setStrokeStyle(2, 0xd2c899).setDepth(target.depth));
        text('bellTargetHost', String(this.challenge.target), 33);
        slotHosts.forEach((host, i) => {
            const root = scene.add.container(host.x, host.y).setDepth(host.depth).setName(`flowStep${i}Host`);
            root.setSize(host.width, host.height).setInteractive({ useHandCursor: true }).setData('waterControl', true);
            root.on('pointerdown', () => { if (this.phase === 'building') { this.selected[i] = null; this.feedback.setText(''); this.refresh(); } });
            this.root.add(root); this.slots.push(root);
        });
        const progress = waterHost(this.builder, 'flowProgressHost');
        for (let i = 0; i < options.total; i++) {
            const pearl = waterPearl(scene, progress.x + (i - 1) * progress.width / 3, progress.y, 22)
                .setDepth(progress.depth).setAlpha(i < options.notes ? 1 : 0.22).setName(`waterNote${i}`);
            this.lamps.push(pearl); this.root.add(pearl);
        }
        this.challenge.cards.forEach((value, index) => {
            const host = waterHost(this.builder, `flowCard${index}Host`);
            const card = scene.add.container(host.x, host.y).setDepth(host.depth).setName(`flowCard${index}Host`);
            card.setSize(host.width, host.height).setInteractive({ useHandCursor: true }).setData('waterControl', true);
            const halo = scene.add.circle(0, -12, 35, 0x72dacc, 0.1).setStrokeStyle(2, value > 0 ? 0xd7d7a8 : 0x9bbfdc, 0.5);
            const pearl = waterPearl(scene, 0, -12, 68);
            const label = scene.add.text(0, 31, this.signed(value), {
                resolution: 2, fontFamily: 'Georgia', fontSize: '29px', color: '#f3f4d9',
            }).setOrigin(0.5).setName(`flowCard${index}Value`);
            fitWaterText(label, { x: 0, y: 31, width: 85, height: 36 }, 29);
            card.add([halo, pearl, label]); this.root.add(card); this.cards.push(card);
            card.on('pointerover', () => halo.setAlpha(1));
            card.on('pointerout', () => halo.setAlpha(0.5));
            let dragged = false;
            card.on('pointerdown', () => { dragged = false; });
            scene.input.setDraggable(card);
            card.on('dragstart', () => { dragged = true; });
            card.on('drag', (_p: Phaser.Input.Pointer, x: number, y: number) => {
                if (this.phase === 'building') card.setPosition(x, y);
            });
            card.on('dragend', (p: Phaser.Input.Pointer) => {
                card.setPosition(host.x, host.y);
                const slot = slotHosts.findIndex(h => Math.abs(p.worldX - h.x) <= h.width / 2 && Math.abs(p.worldY - h.y) <= h.height / 2);
                if (slot >= 0) this.place(index, slot);
            });
            card.on('pointerup', () => {
                if (dragged || this.phase !== 'building') return;
                const existing = this.selected.indexOf(index);
                if (existing >= 0) this.selected[existing] = null;
                else { const free = this.selected.indexOf(null); if (free >= 0) this.selected[free] = index; }
                this.feedback.setText('');
                this.refresh();
            });
        });
        const ring = scene.add.zone(bellHost.x, bellHost.y, bellHost.width, bellHost.height).setDepth(bellHost.depth).setName('ringBell').setInteractive({ useHandCursor: true });
        let ringing = false;
        ring.on('pointerdown', () => { ringing = true; });
        ring.on('pointerout', () => { ringing = false; });
        ring.on('pointerup', () => {
            if (!ringing || this.phase !== 'building') return;
            ringing = false;
            if (this.selected.includes(null)) { this.feedback.setText('Vyber dvě perly.'); return; }
            this.phase = 'feedback';
            const result = evaluatePearlFlow(this.challenge, this.selected);
            sfx(scene, result.correct ? 'puzzle.solved' : 'math.retry');
            options.onAnswer(result.correct, { assisted: this.hintLevel > 0, firstSubmission: !this.submitted });
            this.submitted = true;
            this.feedback.setText(result.values.join('  →  ')).setColor(result.correct ? '#beffd9' : '#f2d2ac');
            const moving = waterPearl(scene, start.x, start.y, 28); this.root.add(moving);
            scene.tweens.add({ targets: moving, x: bellHost.x, duration: 1000,
                onComplete: () => { if (!this.disposed) moving.destroy(); } });
            this.timers.push(scene.time.delayedCall(1020, () => {
                if (this.disposed) return;
                waterRipple(scene, bellHost.x, bellHost.y + 45, 820, result.correct ? 0xb6ffce : 0xf2b782);
                if (result.correct) {
                    this.lamps[options.notes]?.setAlpha(1);
                    scene.tweens.add({ targets: bell, angle: { from: -7, to: 7 }, duration: 130, yoyo: true, repeat: 2,
                        onComplete: () => { if (!this.disposed) bell.setAngle(0); } });
                }
            }));
            this.timers.push(scene.time.delayedCall(2300, () => {
                if (this.disposed) return;
                if (result.correct) options.onNext();
                else { this.phase = 'building'; this.refresh(); }
            }));
        });
        this.root.add(ring);
        this.refresh();
        this.root.sort('depth');
        this.root.once('destroy', () => {
            this.disposed = true; this.timers.forEach(timer => timer.remove(false));
            scene.input.dragDistanceThreshold = dragThreshold;
            const defs = scene.cache.json.get('scenes').scenes.UnderwaterFlow.elements;
            defs.forEach((def: { id: string }) => this.builder.get(def.id)?.destroy());
        });
    }

    place(card: number, slot: number): void {
        if (this.phase !== 'building') return;
        const existing = this.selected.indexOf(card);
        if (existing >= 0) this.selected[existing] = null;
        this.selected[slot] = card; this.feedback.setText(''); this.refresh();
    }

    private signed(value: number): string { return value >= 0 ? `+${value}` : `−${Math.abs(value)}`; }

    private refresh(): void {
        this.slots.forEach((slot, i) => {
            slot.removeAll(true);
            slot.add(this.scene.add.circle(0, -8, 43, 0x0b2c40, 0.65).setStrokeStyle(3, 0x99b6b4));
            const index = this.selected[i];
            if (index !== null) slot.add(waterPearl(this.scene, 0, -8, 78));
            const label = this.scene.add.text(0, index === null ? -8 : 46, index === null ? String(i + 1) : this.signed(this.challenge.cards[index]), {
                resolution: 2, fontFamily: 'Georgia', fontSize: '29px', color: index === null ? '#839aa7' : '#efffed',
            }).setOrigin(0.5).setName(`flowStep${i}Value`);
            fitWaterText(label, { x: 0, y: index === null ? -8 : 46, width: 96, height: 36 }, 29);
            slot.add(label);
        });
        this.cards.forEach((card, index) => card.setAlpha(this.selected.includes(index) ? 0.32 : 1));
    }

    private showHint(): void {
        if (this.phase !== 'building') return;
        this.hintLevel++;
        const delta = this.challenge.target - this.challenge.start;
        if (this.hintLevel > 1) {
            const [first] = this.challenge.solutions[0];
            this.place(first, 0);
            const card = this.cards[first];
            this.scene.tweens.add({ targets: card, alpha: 0.8, duration: 300, yoyo: true, repeat: 2 });
        }
        this.feedback.setText(`${this.challenge.start}  ${this.signed(delta)}  =  ${this.challenge.target}`).setColor('#e0eebd');
    }
}
