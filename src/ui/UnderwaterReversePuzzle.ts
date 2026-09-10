import { sfx, voice } from '../audio/AudioDirector';
import { bindPuzzleViewState } from './PuzzleViewState';
import Phaser from 'phaser';
import { evaluateReverse, type ReverseChallenge } from '../systems/UnderwaterReverseProblems';
import { UnderwaterUI } from './UnderwaterUI';
import { fitWaterText, waterArtwork } from './UnderwaterTheme';
import { waterPearl } from './UnderwaterPearls';
import { UnderwaterPuzzleSurface, signedWaterValue } from './UnderwaterPuzzleSurface';

/** Find a missing source, then transfer the relationship to two branches. No speed score. */
export class UnderwaterReversePuzzle {
    readonly builder;
    selected: number | null = null;
    phase: 'building' | 'feedback' = 'building';
    hintLevel = 0;

    constructor(scene: Phaser.Scene, ui: UnderwaterUI, readonly challenge: ReverseChallenge, options: {
        state?: Record<string, unknown>;
        onAnswer: (correct: boolean, assisted: boolean) => void; onNext: () => void; onClose: () => void;
    }) {
        bindPuzzleViewState(this, options.state, ['selected', 'hintLevel']);
        const surface = new UnderwaterPuzzleSurface(scene, ui, challenge.split ? 'UnderwaterReverseSplit' : 'UnderwaterReverse');
        this.builder = surface.builder;
        voice(scene, 'vo.water.reverse', true);
        const { modal } = surface;
        surface.label('reverseTitleHost', challenge.split ? 'Jeden začátek pro oba proudy.' : 'Najdi začátek proudu.', 25);
        surface.label('reverseProgressHost', `${challenge.stage + 1} / 3`, 20, '#c6d7bf');
        const feedback = surface.label('reverseFeedbackHost', '', 24);
        const source = surface.host('reverseSourceHost');
        const steps = [0, 1].map(i => surface.host(`reverseStep${i}Host`));
        const targets = challenge.targets.map((_, i) => surface.host(`reverseTarget${i}Host`));
        const paths = challenge.split ? targets.map((target, i) => new Phaser.Curves.Path(source.x, source.y)
            .lineTo(steps[i].x, steps[i].y).lineTo(target.x, target.y))
            : [new Phaser.Curves.Path(source.x, source.y).lineTo(steps[0].x, steps[0].y).lineTo(steps[1].x, steps[1].y).lineTo(targets[0].x, targets[0].y)];
        surface.conduit(paths, source.depth - 1);
        steps.forEach((host, i) => {
            const plate = scene.add.container(host.x, host.y).setDepth(host.depth);
            plate.add(waterArtwork(scene, 'underwater-pump-impeller', { ...host, x: 0, y: -15, width: 65, height: 65 }));
            const text = scene.add.text(0, 34, signedWaterValue(challenge.changes[i]), {
                resolution: 2, fontFamily: 'Georgia', fontSize: '29px', color: '#eff4cc',
            }).setOrigin(0.5).setName(`reverseOperation${i}`);
            fitWaterText(text, { x: 0, y: 34, width: 96, height: 35 }, 29);
            plate.add(text); modal.add(plate);
        });
        const rings: Phaser.GameObjects.Arc[] = [];
        targets.forEach((host, i) => {
            const ring = scene.add.circle(host.x, host.y, 43, 0x173c4c).setStrokeStyle(3, 0xc7c79e).setDepth(host.depth);
            modal.add(ring); rings.push(ring);
            surface.label(`reverseTarget${i}Host`, String(challenge.targets[i]), 34);
        });
        modal.add(waterArtwork(scene, 'underwater-pearl-shell', { ...source, y: source.y + 15 }).setDepth(source.depth));
        const selectedPearl = waterPearl(scene, source.x, source.y - 13, 70).setDepth(source.depth + 1).setVisible(false);
        modal.add(selectedPearl);
        const sourceNumber = scene.add.text(source.x, source.y - 13, '?', {
            resolution: 2, fontFamily: 'Georgia', fontSize: '32px', color: '#e5f4da', stroke: '#142f38', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(source.depth + 2).setName('reverseSelectedValue'); modal.add(sourceNumber);
        const cards: Phaser.GameObjects.Container[] = [];
        const choose = (index: number) => {
            if (this.phase !== 'building') return;
            this.selected = index; selectedPearl.setVisible(true); sourceNumber.setText(String(challenge.cards[index]));
            cards.forEach((card, i) => card.setAlpha(i === index ? 0.38 : 1));
            feedback.setText(''); rings.forEach(ring => ring.setStrokeStyle(3, 0xc7c79e));
        };
        const threshold = scene.input.dragDistanceThreshold; scene.input.dragDistanceThreshold = 8;
        modal.once('destroy', () => { scene.input.dragDistanceThreshold = threshold; });
        challenge.cards.forEach((value, i) => {
            const host = surface.host(`reverseCard${i}Host`);
            const root = scene.add.container(host.x, host.y).setDepth(host.depth).setName(`reverseCard${i}Host`);
            root.setSize(host.width, host.height).setInteractive({ useHandCursor: true }).setData('waterControl', true);
            const ring = scene.add.circle(0, -7, 35, 0x2b676b, 0.1).setStrokeStyle(2, 0xa7ccc4, 0.7);
            root.add([ring, waterPearl(scene, 0, -7, 67)]);
            const number = scene.add.text(0, -7, String(value), { resolution: 2, fontFamily: 'Georgia', fontSize: '30px', color: '#1a3d45' }).setOrigin(0.5);
            root.add(number); modal.add(root); cards.push(root);
            let dragged = false;
            root.on('pointerdown', () => { dragged = false; });
            root.on('pointerover', () => ring.setAlpha(1)); root.on('pointerout', () => ring.setAlpha(0.65));
            scene.input.setDraggable(root);
            root.on('dragstart', () => { dragged = true; });
            root.on('drag', (_p: Phaser.Input.Pointer, x: number, y: number) => { if (this.phase === 'building') root.setPosition(x, y); });
            root.on('dragend', (pointer: Phaser.Input.Pointer) => {
                root.setPosition(host.x, host.y);
                if (Math.abs(pointer.worldX - source.x) < source.width / 2 && Math.abs(pointer.worldY - source.y) < source.height / 2) choose(i);
            });
            root.on('pointerup', () => { if (!dragged) choose(i); });
        });
        ui.button(this.builder, 'iconCloseHost', '×', options.onClose, true, 30);
        ui.hint(this.builder, 'iconReverseHintHost', () => {
            if (this.phase !== 'building') return;
            this.hintLevel++; this.phase = 'feedback';
            // The learner can watch inverse OPERATIONS, without automatically placing an answer.
            const points = challenge.split ? [targets[0], steps[0], source] : [targets[0], steps[1], steps[0], source];
            const path = new Phaser.Curves.Path(points[0].x, points[0].y);
            points.slice(1).forEach(point => path.lineTo(point.x, point.y));
            const end = challenge.targets[0], firstDelta = challenge.split ? challenge.changes[0] : challenge.changes[1];
            feedback.setText(`${end}  ${signedWaterValue(-firstDelta)}  =  ${end - firstDelta}`).setColor('#e1eac4');
            surface.flow(path, 2200, 0xd9efab, fraction => {
                if (!challenge.split && fraction > 0.58) feedback.setText(`${end - firstDelta}  ${signedWaterValue(-challenge.changes[0])}  =  ${challenge.start}`);
            });
            surface.later(2250, () => { this.phase = 'building'; });
        }, () => this.phase === 'building' && this.hintLevel < 1);
        ui.button(this.builder, 'iconReverseRunHost', '▶', () => {
            if (this.phase !== 'building') return;
            if (this.selected === null) { feedback.setText('Vyber počáteční perlu.'); return; }
            this.phase = 'feedback';
            const result = evaluateReverse(challenge, this.selected);
            sfx(scene, result.correct ? 'puzzle.solved' : 'math.retry');
            options.onAnswer(result.correct, this.hintLevel > 0);
            const values = challenge.split ? result.values : [result.values[1]];
            feedback.setText(challenge.split ? result.values.map((value, i) => `${value} ${value === challenge.targets[i] ? '=' : '≠'} ${challenge.targets[i]}`).join('     ·     ')
                : `${result.start}  →  ${result.values[0]}  →  ${result.values[1]}  ${result.correct ? '=' : '≠'}  ${challenge.targets[0]}`)
                .setColor(result.correct ? '#baffd3' : '#ecd0aa');
            paths.forEach(path => surface.flow(path, 1300));
            surface.later(1320, () => rings.forEach((ring, i) => ring.setStrokeStyle(3, values[i] === challenge.targets[i] ? 0xbaffd3 : 0xd5a26d)));
            surface.later(1900, () => { if (result.correct) options.onNext(); else this.phase = 'building'; });
        }, true, 27);
        if (this.selected !== null) choose(this.selected);
        modal.sort('depth');
    }
}
