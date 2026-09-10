import { sfx, voice } from '../audio/AudioDirector';
import { bindPuzzleViewState } from './PuzzleViewState';
import Phaser from 'phaser';
import { SceneBuilder } from '../systems/SceneBuilder';
import { evaluatePump, type underwaterPumpChallenge } from '../systems/UnderwaterPumpProblems';
import { UnderwaterUI, waterHost } from './UnderwaterUI';
import { fitWaterText, waterArtwork } from './UnderwaterTheme';
import { waterRipple } from './UnderwaterWorldFX';

/** Set three physical valves to match pressure readings along one continuous pipe. */
export class UnderwaterPumpPuzzle {
    readonly builder: SceneBuilder;
    readonly selected: number[];
    phase: 'building' | 'feedback' = 'building';
    hintLevel = 0;
    private moving = [false, false, false];

    constructor(scene: Phaser.Scene, ui: UnderwaterUI, readonly challenge: ReturnType<typeof underwaterPumpChallenge>,
        options: {
        state?: Record<string, unknown>; onAnswer: (correct: boolean, assisted: boolean) => void; onClose: () => void }) {
        ui.open('');
        voice(scene, 'vo.water.pump', true); const modal = ui.modal!;
        this.builder = new SceneBuilder(scene); this.builder.buildScene('UnderwaterPump');
        this.selected = [...challenge.initial];
        bindPuzzleViewState(this, options.state, ['selected', 'hintLevel']);
        const titleHost = waterHost(this.builder, 'pumpTitleHost');
        const title = scene.add.text(titleHost.x, titleHost.y, 'Otoč ventily podle čísel na potrubí.', {
            resolution: 2, fontFamily: 'Georgia', fontSize: '23px', color: '#eaffef',
        }).setOrigin(0.5).setDepth(titleHost.depth);
        fitWaterText(title, titleHost, 23); modal.add(title);
        ui.button(this.builder, 'iconCloseHost', '×', options.onClose, true, 30);
        const rotors = [0, 1, 2].map(i => waterHost(this.builder, `pumpRotor${i}Host`));
        const readings = [0, 1, 2, 3].map(i => waterHost(this.builder, `pumpReading${i}Host`));
        const conduit = scene.add.graphics().setDepth(rotors[0].depth - 1);
        const path = new Phaser.Curves.Path(readings[0].x, readings[0].y);
        rotors.forEach((rotor, i) => path.lineTo(rotor.x, rotor.y).lineTo(readings[i + 1].x, readings[i + 1].y));
        conduit.lineStyle(18, 0x133b43); path.draw(conduit);
        conduit.lineStyle(8, 0x9fa983); path.draw(conduit);
        conduit.lineStyle(3, 0xdbe2b5, 0.85); path.draw(conduit);
        for (let i = 0; i < 6; i++) {
            const fraction = (i + 0.5) / 6, p = path.getPoint(fraction), t = path.getTangent(fraction);
            conduit.lineStyle(3, 0xf2ffe3).beginPath().moveTo(p.x - 6 * t.x + 5 * t.y, p.y - 6 * t.y - 5 * t.x)
                .lineTo(p.x + 3 * t.x, p.y + 3 * t.y).lineTo(p.x - 6 * t.x - 5 * t.y, p.y - 6 * t.y + 5 * t.x).strokePath();
        }
        modal.add(conduit);
        readings.forEach((host, i) => {
            const gauge = scene.add.container(host.x, host.y).setDepth(host.depth);
            const ring = scene.add.circle(0, 0, 37, 0x163847).setStrokeStyle(3, 0xccbf92);
            const number = scene.add.text(0, 0, String(challenge.readings[i]), {
                resolution: 2, fontFamily: 'Georgia', fontSize: '30px', color: '#f3efd3',
            }).setOrigin(0.5);
            gauge.add([ring, number]); modal.add(gauge);
        });
        const labels: Phaser.GameObjects.Text[] = [];
        const feedbackHost = waterHost(this.builder, 'pumpFeedbackHost');
        const feedback = scene.add.text(feedbackHost.x, feedbackHost.y, '', {
            resolution: 2, fontFamily: 'Georgia', fontSize: '26px', color: '#eddaad',
        }).setOrigin(0.5).setDepth(feedbackHost.depth); modal.add(feedback);
        fitWaterText(feedback, feedbackHost, 26);
        const signed = (value: number) => value >= 0 ? `+${value}` : `−${Math.abs(value)}`;
        rotors.forEach((host, i) => {
            const root = scene.add.container(host.x, host.y).setDepth(host.depth).setName(`pumpRotor${i}Host`);
            root.setSize(host.width, host.height).setInteractive({ useHandCursor: true }).setData('waterControl', true);
            const wheel = waterArtwork(scene, 'underwater-pump-impeller', { ...host, x: 0, y: 0 });
            modal.once('destroy', () => scene.tweens.killTweensOf(wheel));
            const valueHost = waterHost(this.builder, `pumpValue${i}Host`);
            const text = scene.add.text(valueHost.x, valueHost.y, signed(challenge.options[i][this.selected[i]]), {
                resolution: 2, fontFamily: 'Georgia', fontSize: '29px', color: '#f5f1ce',
            }).setOrigin(0.5).setDepth(valueHost.depth).setName(`pumpValue${i}Host`);
            fitWaterText(text, valueHost, 29);
            labels.push(text); modal.add(text); root.add(wheel); modal.add(root);
            root.on('pointerup', () => {
                if (this.phase !== 'building' || this.moving[i]) return;
                this.moving[i] = true; this.selected[i] = (this.selected[i] + 1) % challenge.options[i].length;
                feedback.setText('');
                sfx(scene, 'water.valve');
                scene.tweens.add({ targets: wheel, angle: wheel.angle + 90, duration: 220, ease: 'Sine.easeInOut',
                    onComplete: () => { this.moving[i] = false; text.setText(signed(challenge.options[i][this.selected[i]])); } });
            });
        });
        ui.hint(this.builder, 'iconPumpHintHost', () => {
            if (this.phase !== 'building') return;
            this.hintLevel++;
            const i = Math.min(this.hintLevel - 1, 2);
            feedback.setText(`${challenge.readings[i]}  ${signed(challenge.readings[i + 1] - challenge.readings[i])}  =  ${challenge.readings[i + 1]}`);
        }, () => this.phase === 'building' && !this.moving.some(Boolean) && this.hintLevel < 3);
        let timer: Phaser.Time.TimerEvent | undefined;
        ui.button(this.builder, 'iconPumpRunHost', '▶', () => {
            if (this.phase !== 'building' || this.moving.some(Boolean)) return;
            this.phase = 'feedback';
            const result = evaluatePump(challenge, this.selected); sfx(scene, result.correct ? 'puzzle.solved' : 'math.retry');
            options.onAnswer(result.correct, this.hintLevel > 0);
            feedback.setText(result.values.join('  →  ')).setColor(result.correct ? '#baffd3' : '#eddaad');
            if (result.correct) readings.forEach(host => waterRipple(scene, host.x, host.y, host.depth + 1, 0xb8ffdf, 0.2));
            timer = scene.time.delayedCall(1700, () => { if (result.correct) options.onClose(); else this.phase = 'building'; });
        }, true, 26);
        modal.sort('depth');
        modal.once('destroy', () => {
            timer?.remove(false);
            scene.cache.json.get('scenes').scenes.UnderwaterPump.elements.forEach((def: { id: string }) => this.builder.get(def.id)?.destroy());
        });
    }
}
