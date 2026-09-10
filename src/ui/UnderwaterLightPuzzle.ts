import { bindPuzzleViewState } from './PuzzleViewState';
import Phaser from 'phaser';
import { SceneBuilder } from '../systems/SceneBuilder';
import { traceUnderwaterLight, underwaterLightHint, type LightChallenge } from '../systems/UnderwaterLightPuzzle';
import { UnderwaterUI, waterHost } from './UnderwaterUI';
import { fitWaterText, waterArtwork } from './UnderwaterTheme';
import { waterPearl } from './UnderwaterPearls';

export class UnderwaterLightPuzzle {
    readonly turns: number[];
    readonly builder: SceneBuilder;
    private mirrors: Phaser.GameObjects.Container[] = [];
    private mirrorFaces: Phaser.GameObjects.Graphics[] = [];
    private lamps: Phaser.GameObjects.Image[] = [];
    private assisted = false;
    private solved = false;
    constructor(scene: Phaser.Scene, ui: UnderwaterUI, callbacks: {
        state?: Record<string, unknown>;
        onAnswer: (correct: boolean, assisted: boolean) => void; onClose: () => void;
    }, readonly challenge: LightChallenge) {
        this.turns = [...challenge.initial];
        bindPuzzleViewState(this, callbacks.state, ['turns', 'assisted']);
        ui.open('');
        const modal = ui.modal!;
        this.builder = new SceneBuilder(scene); this.builder.buildScene('UnderwaterLight');
        const label = (id: string, value: string, size: number) => {
            const box = waterHost(this.builder, id);
            const text = scene.add.text(box.x, box.y, value, { resolution: 2, fontFamily: 'Georgia', fontSize: `${size}px`, color: '#eaf7df', align: 'center' })
                .setOrigin(0.5).setDepth(box.depth).setName(id);
            fitWaterText(text, box, size); modal.add(text); return text;
        };
        label('lightTitleHost', 'Rozsviť obě perly a doveď světlo do lastury.', 22);
        const feedback = label('lightFeedbackHost', '', 22);
        const beamHost = waterHost(this.builder, 'lightBoardHost');
        const beam = scene.add.graphics().setDepth(beamHost.depth); modal.add(beam);
        const hostIds = ['lightMirror0Host', 'lightMirror1Host', 'lightMirror2Host', 'lightMirror3Host'];
        const point = (p: { x: number; y: number }) => ({
            x: beamHost.x - beamHost.width / 2 + p.x / challenge.width * beamHost.width,
            y: beamHost.y - beamHost.height / 2 + p.y / challenge.height * beamHost.height,
        });
        // Runtime puzzle geometry is relative to the editor's safe board host.
        challenge.mirrors.forEach((p, i) => this.builder.get<Phaser.GameObjects.Container>(hostIds[i])!.setPosition(point(p).x, point(p).y));
        challenge.lamps.forEach((p, i) => this.builder.get<Phaser.GameObjects.Container>(`lightLamp${i}Host`)!.setPosition(point(p).x, point(p).y));
        for (const [id,p] of [['lightSourceHost',challenge.source],['lightTargetHost',challenge.target]] as const)
            this.builder.get<Phaser.GameObjects.Container>(id)!.setPosition(point(p).x,point(p).y);
        const draw = () => {
            const trace = traceUnderwaterLight(this.turns, challenge);
            beam.clear();
            for (const [width, alpha] of [[18, 0.09], [9, 0.2], [3, 0.92]]) {
                beam.lineStyle(width, 0xc6fff4, alpha).beginPath();
                trace.points.forEach((p, index) => { const xy = point(p); index ? beam.lineTo(xy.x, xy.y) : beam.moveTo(xy.x, xy.y); });
                beam.strokePath();
            }
            this.lamps.forEach((lamp, i) => lamp.setAlpha(trace.lit.includes(i) ? 1 : 0.28));
            this.mirrorFaces.forEach((face, i) => {
                face.clear().lineStyle(10, 0x947e58, 1);
                const endpoints = [[-14, 14, 14, -14], [-14, -14, 14, 14], [0, -19, 0, 19], [-19, 0, 19, 0]][this.turns[i]];
                face.lineBetween(...endpoints as [number, number, number, number]);
                face.lineStyle(5, 0xdffff6, 1).lineBetween(...endpoints as [number, number, number, number]);
            });
            return trace;
        };
        hostIds.forEach((id, index) => {
            const host = waterHost(this.builder, id);
            const root = scene.add.container(host.x, host.y).setDepth(host.depth).setName(id);
            root.add(waterArtwork(scene, 'underwater-pearl-shell', { ...host, x: 0, y: 6, width: 50, height: 50 }));
            root.add(waterArtwork(scene, 'enamel-control-socket', { x: 0, y: 0, width: 48, height: 48 }));
            const face = scene.add.graphics(); root.add(face); this.mirrorFaces.push(face);
            root.setSize(host.width, host.height).setInteractive({ useHandCursor: true });
            root.on('pointerup', () => {
                if (this.solved) return;
                const allowed = challenge.allowedTurns ?? [0, 1, 2, 3];
                this.turns[index] = allowed[(allowed.indexOf(this.turns[index]) + 1) % allowed.length];
                feedback.setText(''); draw();
            });
            root.on('pointerover', () => face.setAlpha(0.75)); root.on('pointerout', () => face.setAlpha(1));
            modal.add(root); this.mirrors.push(root);
        });
        for (let i = 0; i < 2; i++) {
            const h = waterHost(this.builder, `lightLamp${i}Host`);
            const pearl = waterPearl(scene, h.x, h.y, h.width).setDepth(h.depth);
            modal.add(pearl); this.lamps.push(pearl);
        }
        for (const [id, source] of [['lightSourceHost', true], ['lightTargetHost', false]] as const) {
            const h = waterHost(this.builder, id);
            modal.add(waterArtwork(scene, 'underwater-pearl-shell', h));
            modal.add(waterPearl(scene, h.x, h.y - 5, h.width * 0.4).setDepth(h.depth + 1).setAlpha(source ? 1 : 0.4));
        }
        ui.button(this.builder, 'iconCloseHost', '', callbacks.onClose, true, 20, 'close');
        const hint = ui.hint(this.builder, 'lightHintHost', () => {
            if (this.solved) return;
            this.assisted = true;
            const help = underwaterLightHint(this.turns, challenge);
            // Point out the next mirror, but leave its orientation to the learner.
            if (help) scene.tweens.add({ targets: this.mirrorFaces[help.index], alpha: 0.25, duration: 380, yoyo: true, repeat: 3 });
        }, () => !this.solved && Boolean(underwaterLightHint(this.turns, challenge)));
        const run = ui.button(this.builder, 'lightRunHost', 'ROZSVÍTIT', () => {
            if (this.solved) return;
            const trace = draw(); callbacks.onAnswer(trace.solved, this.assisted);
            feedback.setText(trace.solved ? 'Požehnání perly' : trace.reachesPearl ? 'Ještě obě malé perly.' : 'Otoč lastury do cesty světla.');
            fitWaterText(feedback, waterHost(this.builder, 'lightFeedbackHost'), 22);
            if (trace.solved) {
                this.solved = true; run.setState('selected'); hint.setState('disabled');
                this.mirrors.forEach(mirror => mirror.disableInteractive());
            }
        }, true, 19, 'check');
        draw(); modal.sort('depth');
        modal.once('destroy', () => {
            scene.cache.json.get('scenes').scenes.UnderwaterLight.elements.forEach((def: { id: string }) => this.builder.get(def.id)?.destroy());
        });
    }
}
