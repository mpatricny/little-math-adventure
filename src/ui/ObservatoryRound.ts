import Phaser from 'phaser';
import type { MathProblem } from '../types';
import { CatacombBatch, CatacombFrameClock, type CatacombBatchRules } from '../systems/CatacombBatch';
import type { SceneBuilder } from '../systems/SceneBuilder';
import { CatacombObservatoryArt, type ObservatoryReward } from './CatacombObservatoryArt';
import { paintedButton } from './CatacombPaintedUi';
import { learningHost } from './LearningUi';
import { MathBoard, type MathBoardFirstAnswer } from './MathBoard';
import { ObservatoryMathView } from './ObservatoryMathView';

interface RoundCallbacks {
    onAnswer: (answer: MathBoardFirstAnswer) => void;
    onFinish: (batch: CatacombBatch) => void;
    onExit: () => void;
    telemetryContext?: string;
}

/** The shared question evaluator drives the stars; only time spent choosing an answer advances the planet. */
export class ObservatoryRound {
    readonly batch: CatacombBatch;
    readonly board: MathBoard;
    readonly art: CatacombObservatoryArt;
    private readonly clock = new CatacombFrameClock();
    private controls: Phaser.GameObjects.Container;
    private exitButton: Phaser.GameObjects.Container;
    private pauseGlyph: Phaser.GameObjects.Graphics;
    private paused = false;
    private closed = false;
    private finishing = false;
    private motion: Promise<unknown> = Promise.resolve();

    constructor(private scene: Phaser.Scene, builder: SceneBuilder, rules: CatacombBatchRules,
        private questions: readonly MathProblem[], reward: ObservatoryReward, private callbacks: RoundCallbacks) {
        this.batch = new CatacombBatch(rules, this.clock.read);
        this.art = new CatacombObservatoryArt(scene, builder, reward, rules.total);
        this.board = new MathBoard(scene, () => void this.afterFeedback(), owner => new ObservatoryMathView(owner,
            builder, () => ({ answered: this.batch.answers.length, total: rules.total })));
        this.board.setDamageDisplayEnabled(false);
        this.board.setActiveProblemChangedCallback(snapshot => {
            if (snapshot && !this.closed && !this.finishing) this.batch.openQuestion();
        });
        this.board.setAnswerClock((problem, correct, assisted) => {
            if (this.closed || this.finishing || problem !== this.questions[this.batch.answers.length]) return null;
            return this.batch.submit(correct && !assisted, problem.masteryKey ?? problem.id)?.responseTimeMs ?? null;
        });
        this.board.setFirstAnswerCallback(answer => this.acceptAnswer(answer));

        const pauseHost = learningHost(builder, 'observatoryPause');
        const exitHost = learningHost(builder, 'observatoryExit');
        this.controls = scene.add.container(0, 0).setDepth(pauseHost.depth).setName('observatoryControls');
        const pause = paintedButton(scene, this.controls, pauseHost, 'observatoryPauseButton', () => this.togglePause());
        this.pauseGlyph = scene.add.graphics();
        pause.surface.add(this.pauseGlyph);
        this.drawPause();
        const exit = paintedButton(scene, this.controls, exitHost, 'observatoryExitButton', () => this.exit());
        exit.surface.add(scene.add.graphics().lineStyle(4, 0xffe7af).lineBetween(-8, -8, 8, 8).lineBetween(-8, 8, 8, -8));
        this.exitButton = exit.root.setVisible(false);
        this.onVisibility();
        document.addEventListener('visibilitychange', this.onVisibility);
        scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);
        void this.art.ready.then(() => {
            if (this.closed) return;
            if (questions.length !== rules.total) { this.exit(); return; }
            this.present();
        }).catch(error => {
            if (this.closed) return;
            console.error('Cannot open the observatory', error);
            this.exit();
        });
    }

    private present(): void {
        const index = this.batch.answers.length;
        const problem = this.questions[index];
        if (problem.comparisonMeta) problem.comparisonMeta.exam = true;
        this.art.aim(index);
        this.board.show([problem], { presentation: 'sequential', telemetryContext: this.callbacks.telemetryContext ?? 'fox_lesson' });
    }

    private acceptAnswer(answer: MathBoardFirstAnswer): void {
        if (this.closed || this.finishing) return;
        const index = this.batch.answers.length - 1;
        this.callbacks.onAnswer(answer);
        if (this.closed) return;
        this.motion = this.batch.answers[index].correct ? this.art.light(index) : Promise.resolve();
    }

    private async afterFeedback(): Promise<void> {
        if (this.closed || this.finishing) return;
        await this.motion;
        if (this.closed || this.finishing) return;
        if (this.batch.finished) { await this.finish(); return; }
        this.present();
    }

    private tick(): void {
        if (this.finishing || this.closed) return;
        this.clock.frame();
        this.art.setSky(this.batch.timeFraction);
        if (this.batch.expired) void this.finish();
    }

    private async finish(): Promise<void> {
        if (this.finishing || this.closed) return;
        this.finishing = true;
        this.board.dispose();
        this.controls.setVisible(false);
        this.art.setSky(this.batch.timeFraction);
        const passed = this.batch.passed;
        for (const index of this.batch.giftedStars) {
            await this.art.light(index, true);
            if (this.closed) return;
        }
        this.art.finish(passed);
        // Leave the resolved constellation visible before the next panel takes over.
        this.scene.time.delayedCall(650, () => {
            if (!this.closed) this.callbacks.onFinish(this.batch);
        });
    }

    private drawPause(): void {
        this.pauseGlyph.clear().fillStyle(0xffe7af);
        if (this.paused) this.pauseGlyph.fillTriangle(-6, -10, -6, 10, 10, 0);
        else this.pauseGlyph.fillRoundedRect(-8, -9, 5, 18, 1).fillRoundedRect(3, -9, 5, 18, 1);
    }

    private togglePause(): void {
        if (this.closed || this.finishing) return;
        this.paused = !this.paused;
        this.batch.setPaused(this.paused);
        if (this.paused) this.board.suspend('observatory'); else this.board.resume('observatory');
        this.art.setPaused(this.paused || document.hidden);
        this.exitButton.setVisible(this.paused);
        this.drawPause();
    }

    private readonly onVisibility = (): void => {
        this.batch.setHidden(document.hidden);
        this.art.setPaused(this.paused || document.hidden);
    };

    private exit(): void {
        if (this.closed) return;
        this.destroy();
        this.callbacks.onExit();
    }

    private onShutdown(): void { this.dispose(true); }
    destroy(): void { this.dispose(false); }
    private dispose(shutdown: boolean): void {
        if (this.closed) return;
        this.closed = true;
        document.removeEventListener('visibilitychange', this.onVisibility);
        this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this);
        this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);
        if (!shutdown) this.board.dispose();
        this.controls.destroy(true);
        this.art.destroy();
    }
}
