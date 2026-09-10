import { bindPuzzleViewState } from './PuzzleViewState';
import Phaser from 'phaser';
import type { BandId } from '../types';
import { SceneBuilder } from '../systems/SceneBuilder';
import { underwaterWordCipher } from '../systems/UnderwaterWordCipher';
import { underwaterLockWheels } from '../systems/UnderwaterPuzzleChoices';
import { UnderwaterUI, waterHost } from './UnderwaterUI';
import { fitWaterText, waterArtwork } from './UnderwaterTheme';
import { waterRipple } from './UnderwaterWorldFX';
import { UnderwaterSpinWheel } from './UnderwaterSpinWheel';
import { waterPearl } from './UnderwaterPearls';

/** Decode five arithmetic clues, then order their letters. The answer is not named by a picture. */
export class UnderwaterWordChest {
    readonly builder: SceneBuilder;
    readonly letters: string[];
    readonly options: string[][];
    readonly clues: ReturnType<typeof underwaterWordCipher>;
    private indexes: number[];
    private solved = false;
    readonly wheels: UnderwaterSpinWheel[] = [];

    constructor(scene: Phaser.Scene, ui: UnderwaterUI, settings: {
        state?: Record<string, unknown>; word: string; band: BandId; postal?: boolean; clues?: ReturnType<typeof underwaterWordCipher>; onAnswer?: (correct: boolean, assisted: boolean) => void; onSolved: () => void; onClose: () => void;
    }) {
        ui.open('');
        const modal = ui.modal!;
        this.builder = new SceneBuilder(scene);
        this.builder.buildScene('UnderwaterCipher');
        ui.button(this.builder, 'iconCloseHost', '', settings.onClose, true, 30, 'close');
        const titleHost = waterHost(this.builder, 'cipherHintHost');
        const title = scene.add.text(titleHost.x, titleHost.y, 'Seřaď písmena od nejmenšího výsledku.', {
            resolution: 2, fontFamily: 'Georgia', fontSize: '23px', color: '#eaffef',
        }).setOrigin(0.5).setDepth(titleHost.depth).setName('cipherHintHost');
        fitWaterText(title, titleHost, 23); modal.add(title);
        this.clues = settings.clues ?? underwaterWordCipher(settings.word, settings.band, settings.postal);
        const clueResults: Phaser.GameObjects.Text[] = [];
        const cluePanels: Phaser.GameObjects.Image[] = [];
        this.clues.forEach((clue, index) => {
            const host = waterHost(this.builder, `cipherClue${index}Host`);
            const root = scene.add.container(host.x, host.y).setDepth(host.depth).setName(`cipherClue${index}Host`);
            const plate = waterArtwork(scene, 'enamel-clue-plaque', { ...host, x: 0, y: 0 });
            const createText = (name: string, value: string, y: number, size: number, height: number) => {
                const label = scene.add.text(0, y, value, { resolution: 2, fontFamily: 'Georgia', fontSize: `${size}px`, color: '#f4efd1' }).setOrigin(0.5).setName(name);
                fitWaterText(label, { x: 0, y, width: host.width * 0.76, height }, size);
                return label;
            };
            const equation = createText(`cipherEquation${index}`, clue.display, -29, 22, 44);
            const result = createText(`cipherResult${index}`, '', 10, 18, 22);
            const letter = createText(`cipherLetter${index}`, clue.letter, 43, 27, 32);
            root.add([plate, equation, result, letter]); modal.add(root);
            if (clue.pearls) {
                equation.setVisible(false);
                const count = clue.pearls;
                for (let p = 0; p < count; p++) {
                    const columns = Math.min(count, 5);
                    const pearl = waterPearl(scene, (p % 5 - (columns - 1) / 2) * 19, -36 + Math.floor(p / 5) * 20, 20);
                    root.add(pearl);
                }
            }
            clueResults.push(result); cluePanels.push(plate);
        });
        const word = settings.word.toUpperCase();
        modal.add(waterArtwork(scene, 'underwater-lock-backing', waterHost(this.builder, 'wordBackingHost')).setName('wordBackingHost'));
        this.letters = Array.from(word).map(() => '');
        const lock = underwaterLockWheels(word, Phaser.Math.Between(1, 0x7fffffff));
        this.options = lock.options;
        this.indexes = lock.indexes;
        bindPuzzleViewState(this, settings.state, ['options', 'indexes']);
        const labels: Phaser.GameObjects.Text[] = [];
        this.options.forEach((choices, index) => {
            const host = waterHost(this.builder, `wordWheel${index}Host`);
            this.letters[index] = choices[this.indexes[index]];
            const wheel = new UnderwaterSpinWheel(scene, modal, { ...host, id: `wordWheel${index}Host` },
                index === 0 ? 'left' : index === this.options.length - 1 ? 'right' : 'middle', this.letters[index], step => {
                if (this.solved) return;
                this.indexes[index] = (this.indexes[index] + choices.length + step) % choices.length;
                this.letters[index] = choices[this.indexes[index]];
                wheel.turn(this.letters[index], step);
            });
            labels.push(wheel.label); this.wheels.push(wheel);
        });
        let revealed = Number(settings.state?.revealed ?? 0);
        const orderedClues = this.clues.map((clue, index) => ({ ...clue, index })).sort((a, b) => a.value - b.value);
        const revealClue = (clue: typeof orderedClues[number]) => {
            clueResults[clue.index].setText(`${clue.display.includes('?') ? '? ' : ''}= ${clue.value}`).setColor('#baffdc');
        };
        orderedClues.slice(0, revealed).forEach(revealClue);
        // Give one computed clue at a time, never fill the lock or auto-award the chest.
        const hint = ui.hint(this.builder, 'iconClueHost', () => {
            if (this.solved || revealed >= this.clues.length) return;
            const next = orderedClues[revealed++];
            if (settings.state) settings.state.revealed = revealed;
            revealClue(next);
            scene.tweens.add({ targets: cluePanels[next.index], alpha: 0.45, duration: 300, yoyo: true, repeat: 2 });
            if (revealed === this.clues.length) hint.setState('disabled');
        }, () => !this.solved && revealed < this.clues.length);
        const unlock = ui.button(this.builder, 'iconUnlockHost', 'ODEMKNOUT', () => {
            if (this.solved || this.wheels.some(wheel => wheel.animating)) return;
            settings.onAnswer?.(this.letters.join('') === word, revealed > 0);
            if (this.letters.join('') !== word) { labels.forEach(label => label.setColor('#e6c189')); return; }
            this.solved = true;
            unlock.setState('selected'); hint.setState('disabled');
            settings.onSolved();
            labels.forEach(label => label.setColor('#baffd3'));
            const chestHost = waterHost(this.builder, 'wordWheel2Host');
            waterRipple(scene, chestHost.x, chestHost.y, 820, 0xb8ffdf, 0.35);
            const timer = scene.time.delayedCall(1100, settings.onClose);
            modal.once('destroy', () => timer.remove(false));
        }, true, 20, 'check');
        modal.sort('depth');
        modal.once('destroy', () => {
            scene.cache.json.get('scenes').scenes.UnderwaterCipher.elements.forEach((def: { id: string }) => this.builder.get(def.id)?.destroy());
        });
    }
}
