import Phaser from 'phaser';
import type { AnswerChoiceIndex } from '../remote/types';
import type { SceneBuilder } from '../systems/SceneBuilder';
import type { ComparisonStageId, MathProblem } from '../types';
import { formatMathProblem, getComparisonExpressions } from '../utils/formatMathProblem';
import { ComparisonExpressionView } from './ComparisonExpressionView';
import { ComparisonProblemView, drawComparisonSymbol } from './ComparisonProblemView';
import { learningHost, type LearningHost } from './LearningUi';
import type { MathBoardPresentation } from './MathBoard';
import { PracticeChoiceControl, practiceArt } from './PracticeChoiceControl';
import { icon, text } from './mathboard/Art';

/** Exam-only dock. The shared MathBoard owns timing, first answers and input from every device. */
export class ObservatoryMathView implements MathBoardPresentation {
    readonly root: Phaser.GameObjects.Container;
    readonly origin: LearningHost;
    readonly hints: Phaser.GameObjects.Image[] = [];
    readonly handlesWrongFeedback = true;
    private readonly answers: LearningHost;
    private readonly progress: LearningHost;
    private controls: PracticeChoiceControl[] = [];
    private comparison?: ComparisonProblemView | ComparisonExpressionView;
    private correctIndex = 0;
    private feedback?: Phaser.Time.TimerEvent;
    private paused = false;

    constructor(private scene: Phaser.Scene, builder: SceneBuilder,
        private readonly batchProgress?: () => { answered: number; total: number }) {
        this.origin = learningHost(builder, 'observatoryQuestion');
        this.answers = learningHost(builder, 'observatoryAnswers');
        this.progress = learningHost(builder, 'observatoryAttempts');
        this.root = scene.add.container().setName('observatoryMathDock');
    }

    showQuestion(problem: MathProblem, choose: (index: AnswerChoiceIndex) => void): void {
        this.cancel();
        this.root.removeAll(true);
        this.root.setVisible(true);
        this.controls = [];
        this.comparison = undefined;
        const { width, height } = this.origin;
        const scene = this.scene;
        this.root.add(practiceArt(scene, 'mathboard-plaque-v4', { x: 0, y: 0, width, height }));
        const comparison = !!getComparisonExpressions(problem);
        if (problem.comparisonMeta) {
            const side = Math.min(width * .26, 94);
            const host = (x: number, w: number, h: number): LearningHost => ({ x, y: 0, width: w, height: h, depth: 1 });
            const size = problem.comparisonMeta.representation === 'count' ? Math.min(66, height * .6) : side;
            this.comparison = new ComparisonProblemView(scene, problem, {
                left: host(-width * .209, size, height * .65), right: host(width * .209, size, height * .65),
                relation: host(0, 45, 43),
            }, 0xffedc6);
            this.root.add(this.comparison.root);
        } else if (comparison) {
            this.comparison = new ComparisonExpressionView(scene, problem, {
                x: 0, y: 0, depth: 1, fontSize: 36, color: '#fff3d4', compact: true,
            });
            this.comparison.root.setScale(Math.min(1, width * .77 / this.comparison.width));
            this.root.add(this.comparison.root);
        } else {
            const prompt = formatMathProblem(problem, 'question').replace(/ = \?$/, '');
            const label = text(scene, 0, 0, prompt, 46, '#fff1ce');
            label.setScale(Math.min(1, width * .78 / label.width));
            this.root.add(label);
        }
        this.correctIndex = problem.choices.indexOf(problem.answer);
        const cell = this.answers.width / problem.choices.length;
        problem.choices.forEach((value, index) => {
            const w = Math.min(cell * .89, this.answers.height * 1.87), h = this.answers.height;
            const host = { x: this.answers.x - this.origin.x + (index + .5 - problem.choices.length / 2) * cell,
                y: this.answers.y - this.origin.y, width: w, height: h, depth: this.answers.depth,
                regions: { label: { x: 0, y: 0, width: w * .75, height: h * .65 } } };
            const button = new PracticeChoiceControl(scene, host, 'observatoryChoice' + index,
                'mathboard-answer-v4', '', null, () => choose(index as AnswerChoiceIndex), false, 1);
            button.surface.add(comparison ? drawComparisonSymbol(scene, value, 48, 0x432816)
                : text(scene, 0, -1, String(value), 44, '#392416'));
            this.controls.push(button);
            this.root.add(button.root);
        });
        const batch = this.batchProgress?.();
        if (batch) {
            const gap = Math.min(19, this.progress.width / batch.total);
            for (let i = 0; i < batch.total; i++) {
                const x = this.progress.x - this.origin.x + (i + .5 - batch.total / 2) * gap;
                this.root.add(scene.add.circle(x, this.progress.y - this.origin.y, Math.min(6.4, gap * .36),
                    i < batch.answered ? 0xf6cc6e : 0x11233c).setStrokeStyle(1.6, 0xc7a86c));
            }
        }
    }

    setEnabled(enabled: boolean): void { this.controls.forEach(control => control.setEnabled(enabled && !this.paused)); }
    answer(correct: boolean, index: number, done: () => void): void {
        this.setEnabled(false);
        this.comparison?.reveal();
        this.controls.forEach((control, i) => {
            if (i !== index && i !== this.correctIndex) return;
            const right = i === this.correctIndex;
            const badge = this.scene.add.container(control.root.width * .32, -control.root.height * .27);
            badge.add([this.scene.add.circle(0, 0, 13, right ? 0x206b56 : 0x933934).setStrokeStyle(1.5, 0xffedc6),
                icon(this.scene, right ? 'check' : 'cross', 26, 0xfff3da)]);
            control.surface.add(badge);
        });
        this.feedback = this.scene.time.delayedCall(correct ? 220 : 850, done);
        this.feedback.paused = this.paused;
    }
    setPaused(value: boolean): void {
        this.paused = value;
        if (this.feedback) this.feedback.paused = value;
    }
    cancel(): void { this.feedback?.remove(false); this.feedback = undefined; }
    hide(): void { this.cancel(); this.root.setVisible(false); }
    destroy(): void { this.cancel(); this.root.destroy(true); }
    // Exams have no teaching assistance, damage, or per-answer speed bonus.
    playDemo(_stage: ComparisonStageId, done: () => void): void { done(); }
    setDefense(): void {}
    updateProgress(): void {}
    showHints(): void {}
    hideHints(): void {}
    showArithmeticHint(): void {}
    showSpeedBonus(): void {}
    showDefenseResult(): void {}
    resetSurfaces(): void { this.controls.forEach(control => control.surface.setY(0)); }
}
