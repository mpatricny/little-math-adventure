import { sfx, voice } from '../audio/AudioDirector';
import { bindPuzzleViewState } from './PuzzleViewState';
import Phaser from 'phaser';
import { evaluateRouting, type RoutingChallenge } from '../systems/UnderwaterRoutingProblems';
import { UnderwaterUI } from './UnderwaterUI';
import { waterArtwork } from './UnderwaterTheme';
import { UnderwaterPuzzleSurface, signedWaterValue } from './UnderwaterPuzzleSurface';

/** Three two-channel switches; the drawn routes and the evaluated routes are the same graph. */
export class UnderwaterRoutingPuzzle {
    readonly builder;
    readonly selected: boolean[];
    phase: 'building' | 'feedback' = 'building';
    hintLevel = 0;
    private moving = false;

    constructor(scene: Phaser.Scene, ui: UnderwaterUI, readonly challenge: RoutingChallenge, options: {
        state?: Record<string, unknown>;
        onAnswer: (correct: boolean, assisted: boolean) => void; onClose: () => void;
    }) {
        const surface = new UnderwaterPuzzleSurface(scene, ui, 'UnderwaterRouting');
        this.builder = surface.builder;
        voice(scene, 'vo.water.routing', true); this.selected = [...challenge.initial];
        bindPuzzleViewState(this, options.state, ['selected', 'hintLevel']);
        const { modal } = surface;
        surface.label('routingTitleHost', 'Otoč výhybky. Dostaň vodu k jejím číslům.', 23);
        const feedback = surface.label('routingFeedbackHost', '', 23);
        const sources = [0, 1].map(i => surface.host(`routingSource${i}Host`));
        const targets = [0, 1].map(i => surface.host(`routingTarget${i}Host`));
        const switches = [0, 1, 2].map(i => surface.host(`routingSwitch${i}Host`));
        const changes = [0, 1].map(column => [0, 1].map(lane => surface.host(`routingChange${column}${lane}Host`)));
        const rings: Phaser.GameObjects.Arc[] = [];
        sources.forEach((host, i) => {
            modal.add(scene.add.circle(host.x, host.y, 31, 0x123342).setStrokeStyle(2, 0x9bbdb8).setDepth(host.depth));
            surface.label(`routingSource${i}Host`, String(challenge.starts[i]), 29);
        });
        targets.forEach((host, i) => {
            const ring = scene.add.circle(host.x, host.y, 39, 0x153b4c).setStrokeStyle(3, 0xbab88f).setDepth(host.depth);
            rings.push(ring); modal.add(ring);
            surface.label(`routingTarget${i}Host`, String(challenge.targets[i]), 31);
        });
        changes.forEach((column, c) => column.forEach((host, lane) => {
            const border = scene.add.graphics().setDepth(host.depth);
            border.fillStyle(0x9d9b71).fillRoundedRect(host.x - host.width / 2, host.y - 29, host.width, 58, 17);
            border.fillStyle(0x143943).fillRoundedRect(host.x - host.width / 2 + 3, host.y - 26, host.width - 6, 52, 15);
            modal.add(border); surface.label(`routingChange${c}${lane}Host`, signedWaterValue(challenge.changes[c][lane]), 30, '#f1efcd');
        }));
        let conduit: Phaser.GameObjects.Graphics | undefined;
        let paths: Phaser.Curves.Path[] = [];
        const redraw = () => {
            conduit?.destroy();
            const result = evaluateRouting(challenge, this.selected);
            paths = result.traces.map(trace => {
                const source = sources[trace.identity];
                const path = new Phaser.Curves.Path(source.x, source.y);
                trace.legs.forEach((leg, column) => {
                    const host = switches[column], left = host.x - host.width / 2, right = host.x + host.width / 2;
                    const fromY = sources[leg.from].y, toY = sources[leg.lane].y;
                    path.lineTo(left, fromY);
                    if (leg.from === leg.lane) path.lineTo(right, toY);
                    else path.cubicBezierTo(right, toY, host.x, fromY, host.x, toY);
                    if (column < changes.length) path.lineTo(changes[column][leg.lane].x, changes[column][leg.lane].y);
                });
                path.lineTo(targets[trace.lane].x, targets[trace.lane].y); return path;
            });
            conduit = surface.conduit(paths, switches[0].depth - 1);
            modal.sort('depth');
        };
        const knobs: Phaser.GameObjects.Image[] = [];
        switches.forEach((host, i) => {
            // Stable housing, two visible lane ports, central physical hand wheel.
            const housing = scene.add.graphics().setDepth(host.depth - 2);
            housing.fillStyle(0x081d29, 0.94).fillRoundedRect(host.x - host.width / 2 - 5, host.y - host.height / 2, host.width + 10, host.height, 27);
            housing.lineStyle(3, 0x8e9270).strokeRoundedRect(host.x - host.width / 2 - 5, host.y - host.height / 2, host.width + 10, host.height, 27);
            modal.add(housing);
            const root = scene.add.container(host.x, host.y).setDepth(host.depth).setName(`routingSwitch${i}Host`);
            root.setSize(host.width, host.height).setInteractive({ useHandCursor: true }).setData('waterControl', true);
            const knob = waterArtwork(scene, 'underwater-pump-impeller', { ...host, x: 0, y: 0, width: 66, height: 66 });
            const halo = scene.add.circle(0, 0, 35, 0x72cdbd, 0.07).setStrokeStyle(1, 0xb6b686, 0.7);
            root.add([halo, knob]); knobs.push(knob); modal.add(root);
            root.on('pointerover', () => halo.setAlpha(1)); root.on('pointerout', () => halo.setAlpha(0.5));
            root.on('pointerup', () => {
                if (this.phase !== 'building' || this.moving) return;
                this.moving = true; feedback.setText('');
                surface.tween({ targets: knob, angle: knob.angle + 90, duration: 230, ease: 'Sine.easeInOut', onComplete: () => {
                    this.selected[i] = !this.selected[i]; this.moving = false;
                    rings.forEach(ring => ring.setStrokeStyle(3, 0xbab88f)); redraw();
                } });
            });
        });
        const play = (duration: number) => paths.forEach((path, i) => surface.flow(path, duration, i === 0 ? 0x9af9e3 : 0xf0dc99));
        ui.button(this.builder, 'iconCloseHost', '×', options.onClose, true, 30);
        ui.hint(this.builder, 'iconRoutingHintHost', () => {
            if (this.phase !== 'building' || this.moving) return;
            this.hintLevel++; this.phase = 'feedback';
            if (this.hintLevel > 1) {
                const index = this.selected.findIndex((value, i) => value !== challenge.solution[i]);
                if (index >= 0) surface.tween({ targets: knobs[index], alpha: 0.35, duration: 300, yoyo: true, repeat: 2 });
            }
            feedback.setText('Sleduj, kudy proudy protékají.').setColor('#dfe7bb');
            play(2500); surface.later(2550, () => { this.phase = 'building'; });
        }, () => this.phase === 'building' && !this.moving && this.hintLevel < 2);
        ui.button(this.builder, 'iconRoutingRunHost', '▶', () => {
            if (this.phase !== 'building' || this.moving) return;
            this.phase = 'feedback';
            const result = evaluateRouting(challenge, this.selected);
            sfx(scene, result.correct ? 'puzzle.solved' : 'math.retry');
            options.onAnswer(result.correct, this.hintLevel > 0);
            feedback.setText(''); play(2100);
            surface.later(2120, () => {
                feedback.setText(result.targets.map((value, i) => `${value} ${value === challenge.targets[i] ? '=' : '≠'} ${challenge.targets[i]}`).join('     ·     '))
                    .setColor(result.correct ? '#baffd3' : '#ecd0aa');
                rings.forEach((ring, i) => ring.setStrokeStyle(3, result.targets[i] === challenge.targets[i] ? 0xbaffd3 : 0xd5a26d));
            });
            surface.later(3150, () => { if (result.correct) options.onClose(); else this.phase = 'building'; });
        }, true, 27);
        redraw();
    }
}
