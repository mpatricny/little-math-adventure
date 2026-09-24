import Phaser from 'phaser';
import { ComparisonStageId, MathProblem } from '../types';
import { SceneBuilder } from '../systems/SceneBuilder';
import { createComparisonDemoProblems } from '../systems/ComparisonLearningSystem';
import { formatMathProblem, getComparisonExpressions } from '../utils/formatMathProblem';
import { ComparisonExpressionView } from './ComparisonExpressionView';
import { ComparisonHost, ComparisonProblemView, comparisonGlyph } from './ComparisonProblemView';
import { COMPARISON_CHOICE_SCALE } from './ComparisonPresentation';
import comparisonConfig from '../data/comparison-learning.json';

export interface MathBoardDefense {
    power: number;
    incomingDamage: number;
}

/** One visible item inside the shared board. MathBoard owns the complete batch. */
export class SequentialMathView {
    readonly root: Phaser.GameObjects.Container;
    readonly origin: ComparisonHost;
    readonly buttons: Phaser.GameObjects.Container[] = [];
    readonly hints: Phaser.GameObjects.Image[] = [];
    comparison: ComparisonProblemView | null = null;
    expression: ComparisonExpressionView | null = null;
    private readonly builder: SceneBuilder;
    private readonly content: Phaser.GameObjects.Container;
    private readonly heading: Phaser.GameObjects.Text;
    private readonly feedback: Phaser.GameObjects.Text;
    private readonly arithmeticHint: Phaser.GameObjects.Text;
    private readonly progress: Phaser.GameObjects.Container;
    private readonly power: Phaser.GameObjects.Text;
    private readonly source: Phaser.GameObjects.Text;
    private readonly bonus: Phaser.GameObjects.Text;
    private readonly demo: Phaser.GameObjects.Container;
    private timers = new Set<Phaser.Time.TimerEvent>();
    private tweens = new Set<Phaser.Tweens.Tween>();
    private generation = 0;
    private paused = document.hidden;
    private problem: MathProblem | null = null;
    private defense: MathBoardDefense | null = null;

    constructor(private scene: Phaser.Scene, onDemo: () => void) {
        this.builder = new SceneBuilder(scene);
        this.builder.buildScene('MathBoardComparisonLayout');
        this.origin = this.host('board', false);
        this.root = scene.add.container(0, 0).setName('sequentialMathView').setDepth(this.origin.depth).setVisible(false);
        this.createParchment();
        this.content = scene.add.container(0, 0);
        this.heading = this.text('title', '', 24).setOrigin(0, 0.5).setFontFamily('Georgia, serif');
        this.feedback = this.text('feedback', '', 22);
        this.arithmeticHint = this.text('arithmeticHint', '', 28).setColor('#496c35');
        this.power = this.text('power', '', 22).setOrigin(0, 0.5);
        this.source = this.text('source', '', 18);
        this.bonus = this.text('bonus', '', 22).setColor('#8c5b0e');
        const progressHost = this.host('progress');
        this.progress = scene.add.container(progressHost.x, progressHost.y).setDepth(progressHost.depth);
        const demoHost = this.host('demo');
        this.demo = this.control(demoHost, scene.add.text(0, 0, '▷ Ukázka', {
            fontFamily: 'Arial, sans-serif', fontSize: '18px', fontStyle: 'bold', color: '#4a3826', resolution: 2,
        }).setOrigin(0.5), onDemo, true);
        this.demo.setName('comparisonReplay');
        this.root.add([this.content, this.heading, this.feedback, this.arithmeticHint, this.progress, this.power, this.source, this.bonus, this.demo]);
    }

    private host(id: string, relative = true): ComparisonHost {
        const object = this.builder.get<Phaser.GameObjects.Container>(id);
        const definition = this.builder.getElementDef(id);
        if (!object || !definition?.width || !definition.height) throw new Error(`Missing MathBoardComparisonLayout host: ${id}`);
        return { x: object.x - (relative ? this.origin.x : 0), y: object.y - (relative ? this.origin.y : 0),
            width: definition.width, height: definition.height, depth: object.depth };
    }

    private text(id: string, label: string, size: number): Phaser.GameObjects.Text {
        const host = this.host(id);
        return this.scene.add.text(host.x, host.y, label, {
            fontFamily: 'Arial, sans-serif', fontSize: `${size}px`, fontStyle: 'bold', color: '#654325', resolution: 2,
        }).setOrigin(0.5).setDepth(host.depth);
    }

    /** Authored 9-slice using Images also renders in Phaser's Canvas fallback. */
    private createParchment(): void {
        const texture = this.scene.textures.get('ui-math-board');
        const frame = texture.get('__BASE');
        const w = frame.width, h = frame.height, scale = 24 / 90;
        const xs = [0, 170, w - 170, w], ys = [0, 90, h - 90, h];
        const dw = [170 * scale, this.origin.width - 340 * scale, 170 * scale];
        const dh = [90 * scale, this.origin.height - 180 * scale, 90 * scale];
        let y = -this.origin.height / 2;
        for (let row = 0; row < 3; row++) {
            let x = -this.origin.width / 2;
            for (let col = 0; col < 3; col++) {
                const name = `comparison-slice-${row}-${col}`;
                if (!texture.has(name)) texture.add(name, 0, xs[col], ys[row], xs[col + 1] - xs[col], ys[row + 1] - ys[row]);
                this.root.add(this.scene.add.image(x, y, 'ui-math-board', name).setOrigin(0).setDisplaySize(dw[col], dh[row]));
                x += dw[col];
            }
            y += dh[row];
        }
        // Texture.add promotes the first named slice to the default frame.
        // This is still a shared full-image texture: later battles and shop
        // boards that omit a frame must receive the entire parchment.
        texture.firstFrame = frame.name;
    }

    private control(host: ComparisonHost, symbol: Phaser.GameObjects.Image | Phaser.GameObjects.Text, click: () => void, smallAction = false): Phaser.GameObjects.Container {
        const bg = smallAction ? this.scene.add.graphics() : this.scene.add.image(0, 0, 'ui-button');
        if (bg instanceof Phaser.GameObjects.Image) bg.setScale(Math.min(host.width / bg.width, host.height / bg.height));
        else {
            bg.fillStyle(0xffefd0, 0.7).fillRoundedRect(-host.width / 2, -host.height / 2, host.width, host.height, 8);
            bg.lineStyle(2, 0x876337, 1).strokeRoundedRect(-host.width / 2, -host.height / 2, host.width, host.height, 8);
        }
        const border = this.scene.add.graphics();
        const surface = this.scene.add.container(0, 0, [bg, symbol, border]);
        const button = this.scene.add.container(host.x, host.y, [surface]).setDepth(host.depth);
        button.setSize(host.width, host.height).setInteractive({ useHandCursor: true });
        button.setData({ surface, bg, symbol, border, width: host.width, height: host.height });
        button.on('pointerover', () => { if (button.input?.enabled) surface.setY(-2); });
        button.on('pointerout', () => surface.setY(0));
        button.on('pointerup', () => surface.setY(0));
        button.on('pointerdown', () => {
            if (!button.input?.enabled) return;
            surface.setY(1);
            click();
        });
        return button;
    }

    private outline(button: Phaser.GameObjects.Container, color: number): void {
        const border = button.getData('border') as Phaser.GameObjects.Graphics;
        border.clear().lineStyle(3, color, 0.9);
        border.strokeRoundedRect(-button.width / 2 + 3, -button.height / 2 + 3, button.width - 6, button.height - 6, 9);
    }

    showQuestion(problem: MathProblem, onChoice: (index: 0 | 1 | 2) => void): void {
        this.cancel();
        this.clearQuestion();
        this.problem = problem;
        this.root.setVisible(true);
        const meta = problem.comparisonMeta;
        this.heading.setText(this.defense ? 'Braň se' : meta?.showCrocodile ? 'Vyber tlamu' : getComparisonExpressions(problem) ? 'Vyber znaménko' : 'Spočítej');
        this.feedback.setText('');
        this.bonus.setText('');
        this.arithmeticHint.setText('');
        this.source.setText(this.defense ? `⚔ ${this.defense.incomingDamage}` : problem.source === 'sword' ? '⚔ ' + (problem.damageMultiplier || 1) : problem.source === 'pet' ? '🐾 ⚔ ' + (problem.damageMultiplier || 1) : '');
        if (meta) {
            const expression = meta.representation === 'expression';
            this.comparison = new ComparisonProblemView(this.scene, problem, {
                left: this.host(expression ? 'expressionLeft' : 'left'),
                right: this.host(expression ? 'expressionRight' : 'right'),
                relation: this.host(expression ? 'expressionRelation' : 'relation'),
            });
            this.content.add(this.comparison.root);
        } else if (getComparisonExpressions(problem)) {
            this.expression = new ComparisonExpressionView(this.scene, problem, {
                ...this.host('arithmetic'), fontSize: 32, color: '#4a3826', compact: true,
            });
            this.content.add(this.expression.root);
        } else {
            const host = this.host('arithmetic');
            const text = this.text('arithmetic', formatMathProblem(problem, 'question'), 32);
            if (text.width > host.width) text.setFontSize(Math.max(24, Math.floor(32 * host.width / text.width)));
            this.content.add(text);
        }
        const comparison = problem.problemType === 'comparison' || problem.problemType === 'comparison_eq_vs_eq';
        for (let i = 0; i < 3; i++) {
            const value = problem.choices[i];
            const symbol = comparison ? comparisonGlyph(this.scene, value, !meta?.showCrocodile, (meta?.showCrocodile ? 70 : 58) * COMPARISON_CHOICE_SCALE)
                : this.scene.add.text(0, 0, `${value}`, { fontFamily: 'Arial, sans-serif', fontSize: '38px', fontStyle: 'bold', color: '#4a3826', resolution: 2 }).setOrigin(0.5);
            const button = this.control(this.host(`answer${i}`), symbol, () => onChoice(i as 0 | 1 | 2));
            button.setData({ value, isCorrect: value === problem.answer }).setName(`comparisonAnswer${i}`);
            this.buttons.push(button);
            this.content.add(button);
            const host = this.host(`hint${i}`);
            const hint = comparisonGlyph(this.scene, value, false, host.width).setPosition(host.x, host.y).setDepth(host.depth).setVisible(false).setName(`comparisonHint${i}`);
            this.hints.push(hint); this.content.add(hint);
        }
        this.demo.setVisible(Boolean(meta && !meta.exam && !this.defense));
        this.setEnabled(true);
    }

    updateProgress(index: number, total: number, results: boolean[], damage: number, showDamage: boolean): void {
        this.progress.removeAll(true);
        const width = this.host('progress').width;
        const spacing = Math.min(24, width / Math.max(1, total));
        for (let i = 0; i < total; i++) {
            const value = results[i];
            const color = value === true ? 0x588342 : value === false ? 0xad563b : 0xc7b582;
            const circle = this.scene.add.circle(i * spacing, 0, 9, color, value === undefined ? 0.65 : 1);
            if (i === index && value === undefined) circle.setStrokeStyle(2, 0x74512f, 1);
            this.progress.add(circle);
            if (value !== undefined) this.progress.add(this.scene.add.text(i * spacing, 0, value ? '✓' : '×', { fontSize: '15px', color: '#fff6d8', resolution: 2 }).setOrigin(0.5));
        }
        this.power.setText(this.defense ? `🛡 ${this.defense.power}` : `⚔ ${damage}`).setVisible(showDamage || Boolean(this.defense));
    }

    setDefense(defense: MathBoardDefense | null): void { this.defense = defense; }

    showSpeedBonus(charges: number): void { this.bonus.setText(`⚡ +${charges}`); }

    showDefenseResult(blocked: number, quick: boolean): void {
        this.power.setText(`🛡 ${blocked}`);
        this.bonus.setText(quick ? '🛡 ×2' : '');
    }

    setEnabled(enabled: boolean): void {
        for (const button of [...this.buttons, this.demo]) {
            (button.getData('surface') as Phaser.GameObjects.Container).setY(0);
            if (enabled) button.setInteractive({ useHandCursor: true }); else button.disableInteractive();
        }
    }

    resetSurfaces(): void {
        for (const button of [...this.buttons, this.demo]) (button.getData('surface') as Phaser.GameObjects.Container).setY(0);
    }

    showHints(): void { this.hints.forEach(hint => hint.setVisible(true)); }
    hideHints(): void { this.hints.forEach(hint => hint.setVisible(false)); }
    showArithmeticHint(): void {
        if (this.problem?.comparisonMeta?.representation === 'expression') this.arithmeticHint.setText(`= ${this.problem.comparisonMeta.leftValue}`);
    }

    answer(correct: boolean, choice: number, done: () => void): void {
        this.setEnabled(false); this.hideHints();
        this.expression?.reveal();
        this.outline(this.buttons[choice], correct ? 0x668c43 : 0xad563b);
        this.feedback.setText(correct ? '✓' : 'Podívej').setColor(correct ? '#527b37' : '#9a4a30');
        if (!this.comparison) { this.later(this.bonus.text ? 1100 : 550, done); return; }
        this.later(correct ? 100 : 600, () => this.illustrate(!correct, () => this.later(correct ? 500 : 900, done)));
    }

    playDemo(stage: ComparisonStageId, done: () => void): void {
        this.cancel();
        const examples = createComparisonDemoProblems(stage);
        const pace = stage === 'size_crocodile' ? comparisonConfig.firstIntroDurationScale : 1;
        const next = (index: number): void => {
            if (index >= examples.length) { done(); return; }
            this.showQuestion(examples[index], () => undefined);
            this.setEnabled(false);
            this.heading.setText(stage.startsWith('expression') ? 'Spočítej a porovnej' : 'Krokodýl má hlad');
            this.demo.setVisible(false);
            this.later(800 * pace, () => {
                if (stage.startsWith('expression')) this.showArithmeticHint();
                this.illustrate(true, () => this.later(950 * pace, () => next(index + 1)), pace);
            });
        };
        next(0);
    }

    private illustrate(teaching: boolean, done: () => void, pace = 1): void {
        const view = this.comparison, problem = this.problem;
        if (!view || !problem) { done(); return; }
        const value = problem.answer;
        const button = this.buttons.find(item => item.getData('value') === value)!;
        this.outline(button, 0x668c43);
        const mouth = comparisonGlyph(this.scene, value, !teaching && !problem.comparisonMeta?.showCrocodile,
            (button.getData('symbol') as Phaser.GameObjects.Image).displayWidth).setPosition(button.x, button.y);
        this.content.add(mouth);
        const width = teaching || problem.comparisonMeta?.showCrocodile ? 86 : 52;
        this.animate({ targets: mouth, x: view.relation.x, y: view.relation.y, scale: width / mouth.width,
            duration: (teaching ? 600 : 280) * pace, ease: 'Sine.easeInOut', onComplete: () => {
                mouth.destroy(); view.reveal(!teaching && !problem.comparisonMeta?.showCrocodile);
                if (value === 1) {
                    view.pairEqual(); this.feedback.setText('Stejně!').setColor('#527b37');
                    this.later((teaching ? 1000 : 450) * pace, () => { view.clearPairing(); view.reveal(); done(); });
                } else if (teaching || problem.comparisonMeta?.showCrocodile) {
                    const side = value === 0 ? view.right : view.left;
                    const items = side.list.filter(item => item.type === 'Image' || problem.comparisonMeta?.representation === 'number') as Array<Phaser.GameObjects.Image | Phaser.GameObjects.Text>;
                    const original = items.map(item => ({ item, x: item.x, y: item.y, scale: item.scaleX }));
                    items.forEach((item, i) => this.animate({ targets: item, x: view.relation.x - side.x, y: view.relation.y - side.y,
                        scale: item.scaleX * 0.15, alpha: 0, duration: (teaching ? 320 : 140) * pace, delay: i * (teaching ? 280 : 100) * pace }));
                    this.later((items.length * (teaching ? 280 : 100) + 400) * pace, () => {
                        original.forEach(({item, x, y, scale}) => item.setPosition(x, y).setScale(scale).setAlpha(1));
                        view.reveal(); this.feedback.setText('Mňam!').setColor('#527b37'); done();
                    });
                } else done();
            } });
    }

    private later(delay: number, callback: () => void): void {
        const generation = this.generation;
        const timer = this.scene.time.delayedCall(delay, () => { this.timers.delete(timer); if (generation === this.generation) callback(); });
        timer.paused = this.paused;
        this.timers.add(timer);
    }

    private animate(config: Phaser.Types.Tweens.TweenBuilderConfig): void {
        const tween = this.scene.tweens.add(config); this.tweens.add(tween);
        if (this.paused) tween.pause();
        tween.once('complete', () => this.tweens.delete(tween));
    }

    setPaused(paused: boolean): void {
        this.paused = paused;
        this.timers.forEach(timer => { timer.paused = paused; });
        this.tweens.forEach(tween => paused ? tween.pause() : tween.resume());
    }

    cancel(): void {
        this.generation++;
        this.timers.forEach(timer => timer.remove(false)); this.timers.clear();
        this.tweens.forEach(tween => tween.stop()); this.tweens.clear();
    }

    private clearQuestion(): void {
        this.content.removeAll(true); this.comparison = null; this.expression = null;
        this.buttons.length = 0; this.hints.length = 0;
    }

    hide(): void { this.cancel(); this.setEnabled(false); this.clearQuestion(); this.root.setVisible(false); }

    destroy(): void {
        this.cancel(); this.root.destroy(true);
        const definition = this.scene.cache.json.get('scenes')?.scenes.MathBoardComparisonLayout;
        for (const element of definition?.elements ?? []) this.builder.get(element.id)?.destroy();
    }
}
