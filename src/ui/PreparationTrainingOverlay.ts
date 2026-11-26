import Phaser from 'phaser';
import { MathProblem } from '../types';
import { PREPARATION_CONFIG } from '../systems/PreparationSystem';
import { MathBoard, type NumberIntroductionProvider } from './MathBoard';
import { createMathBoardView } from './mathboard/MathBoardView';
import { MedievalActionButton } from './MedievalActionButton';
import { PreparationChargeIndicator, PreparationKind } from './PreparationChargeIndicator';

type LayoutPoint = { x: number; y: number };
type AttemptState = 'pending' | 'active' | 'clean' | 'wrong';

type AttemptMarker = {
    container: Phaser.GameObjects.Container;
    plate: Phaser.GameObjects.Arc;
    text: Phaser.GameObjects.Text;
};

export interface PreparationTrainingOverlayLayout {
    title: LayoutPoint;
    charges: LayoutPoint;
    mathBoard: LayoutPoint;
    result: LayoutPoint;
    resultTitle: LayoutPoint;
    resultCharges: LayoutPoint;
    resultDetail: LayoutPoint;
    attempts: LayoutPoint;
    message: LayoutPoint;
    cancelButton: LayoutPoint;
    doneButton: LayoutPoint;
}

export interface PreparationTrainingResult {
    kind: PreparationKind;
    charges: number;
    attempts: number;
}

export interface PreparationTrainingAttempt {
    kind: PreparationKind;
    problem: MathProblem;
    correct: boolean;
    responseTimeMs: number;
    assisted: boolean;
    attemptNumber: number;
}

export interface PreparationTrainingOverlayOptions {
    root: Phaser.GameObjects.Container;
    layout: PreparationTrainingOverlayLayout;
    problemProvider: () => MathProblem[];
    nextAdaptiveProblem?: () => MathProblem | undefined;
    numberIntroduction?: NumberIntroductionProvider;
    onAttempt: (attempt: PreparationTrainingAttempt) => void;
    onComplete: (result: PreparationTrainingResult) => void;
}

const INITIAL_ATTEMPTS = PREPARATION_CONFIG.initialProblems;
const MAX_ATTEMPTS = PREPARATION_CONFIG.maxProblems;
const SHOP_PREP_BUTTON_WIDTH = 250;
const HEADER_BUTTON_WIDTH = 430;
const HEADER_SCALE = HEADER_BUTTON_WIDTH / SHOP_PREP_BUTTON_WIDTH;

const KIND_STYLE: Record<PreparationKind, {
    title: string;
    completeTitle: string;
    normalIcon: string;
    activeIcon: string;
    accent: number;
    labelFontSize: number;
    iconOffsetX?: number;
}> = {
    sword: {
        title: 'BROUŠENÍ\nMEČE',
        completeTitle: 'MEČ JE OSTRÝ',
        normalIcon: 'prep-sword-normal-v2',
        activeIcon: 'prep-sword-active-v2',
        accent: 0xffb12b,
        labelFontSize: 12,
    },
    shield: {
        title: 'NABÍJENÍ\nŠTÍTU',
        completeTitle: 'ŠTÍT JE NABITÝ',
        normalIcon: 'prep-shield-normal-v2',
        activeIcon: 'prep-shield-active-v2',
        accent: 0x4bdcff,
        labelFontSize: 13,
        iconOffsetX: 4,
    },
};

/** Short adaptive preparation flow shared by sword and shield training. */
export class PreparationTrainingOverlay {
    private readonly scene: Phaser.Scene;
    private readonly root: Phaser.GameObjects.Container;
    private readonly layout: PreparationTrainingOverlayLayout;
    private sampleProblems: MathProblem[] = [];
    private readonly problemProvider: () => MathProblem[];
    private readonly nextAdaptiveProblem?: () => MathProblem | undefined;
    private readonly onAttempt: (attempt: PreparationTrainingAttempt) => void;
    private readonly onComplete: (result: PreparationTrainingResult) => void;
    private readonly headerButtons: Record<PreparationKind, MedievalActionButton>;
    private readonly chargeIndicator: PreparationChargeIndicator;
    private readonly attemptsContainer: Phaser.GameObjects.Container;
    private readonly attemptLabel: Phaser.GameObjects.Text;
    private readonly attemptMarkers: AttemptMarker[] = [];
    private readonly messageText: Phaser.GameObjects.Text;
    private readonly resultPanel: Phaser.GameObjects.Container;
    private readonly resultTitle: Phaser.GameObjects.Text;
    private readonly resultDetail: Phaser.GameObjects.Text;
    private readonly resultChargeIndicator: PreparationChargeIndicator;
    private readonly cancelButton: MedievalActionButton;
    private readonly doneButton: MedievalActionButton;
    private readonly mathBoard: MathBoard;

    private kind: PreparationKind = 'sword';
    private plannedAttempts = INITIAL_ATTEMPTS;
    private attemptsCompleted = 0;
    private earnedCharges = 0;
    private resultCharges = 0;
    private attemptStates: AttemptState[] = [];
    private nextProblemTimer: Phaser.Time.TimerEvent | null = null;
    private isOpen = false;

    constructor(scene: Phaser.Scene, options: PreparationTrainingOverlayOptions) {
        this.scene = scene;
        this.root = options.root;
        this.layout = options.layout;
        this.problemProvider = options.problemProvider;
        this.nextAdaptiveProblem = options.nextAdaptiveProblem;
        this.onAttempt = options.onAttempt;
        this.onComplete = options.onComplete;

        this.root.setName('preparationTrainingOverlay').setVisible(false);

        const blocker = scene.add.rectangle(0, 0, 1280, 720, 0x050403, 0.82)
            .setInteractive();
        const innerShade = scene.add.rectangle(0, 0, 1160, 680, 0x160f09, 0.2)
            .setStrokeStyle(2, 0x8a5d2d, 0.32);
        this.root.add([blocker, innerShade]);

        this.headerButtons = {
            sword: this.createHeaderButton('sword'),
            shield: this.createHeaderButton('shield'),
        };
        this.root.add([this.headerButtons.sword.root, this.headerButtons.shield.root]);

        this.chargeIndicator = new PreparationChargeIndicator(scene, {
            parent: this.root,
            x: this.layout.charges.x,
            y: this.layout.charges.y,
            kind: this.kind,
            iconSize: 58,
            spacing: 72,
            showEmptySlots: true,
            name: 'preparationRewardCharges',
        });

        this.mathBoard = new MathBoard(scene, () => undefined,
            (owner, onDemo) => createMathBoardView(owner, onDemo, () => ({
                mode: this.kind === 'sword' ? 'prep-sword' : 'prep-shield',
                progress:{index:this.attemptsCompleted,total:this.plannedAttempts,
                    results:this.attemptStates.slice(0,this.attemptsCompleted).map(state=>state==='clean')},
            })));
        this.mathBoard.setNumberIntroductionProvider(options.numberIntroduction);
        this.mathBoard.setDamageDisplayEnabled(false);
        this.mathBoard.getContainer().setPosition(this.layout.mathBoard.x, this.layout.mathBoard.y);
        this.root.add(this.mathBoard.getContainer());

        this.attemptsContainer = scene.add.container(this.layout.attempts.x, this.layout.attempts.y);
        this.attemptLabel = scene.add.text(0, -22, '', {
            resolution: 2, fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: '18px',
            fontStyle: 'bold',
            color: '#f3ddb4',
        }).setOrigin(0.5);
        this.attemptsContainer.add(this.attemptLabel);
        for (let index = 0; index < MAX_ATTEMPTS; index++) {
            const x = (index - 2) * 46;
            const container = scene.add.container(x, 12);
            const plate = scene.add.circle(0, 0, 15, 0x18120d, 0.94)
                .setStrokeStyle(2, 0x8b6234, 0.82);
            const text = scene.add.text(0, -1, String(index + 1), {
                resolution: 2, fontFamily: 'Arial, sans-serif',
                fontSize: '15px',
                fontStyle: 'bold',
                color: '#c5ab82',
            }).setOrigin(0.5);
            container.add([plate, text]);
            this.attemptsContainer.add(container);
            this.attemptMarkers.push({ container, plate, text });
        }
        this.root.add(this.attemptsContainer);

        this.messageText = scene.add.text(this.layout.message.x, this.layout.message.y, '', {
            resolution: 2, fontFamily: 'Arial, sans-serif',
            fontSize: '19px',
            fontStyle: 'bold',
            align: 'center',
            color: '#f0dfbe',
            wordWrap: { width: 820 },
        }).setOrigin(0.5);
        this.root.add(this.messageText);

        this.resultPanel = scene.add.container(this.layout.result.x, this.layout.result.y);
        const resultBoard = scene.add.image(0, 0, 'ui-math-board');
        resultBoard.setScale(Math.min(850 / resultBoard.width, 458 / resultBoard.height));
        const relative = (point: LayoutPoint) => ({ x: point.x - this.layout.result.x, y: point.y - this.layout.result.y });
        const title = relative(this.layout.resultTitle);
        const detail = relative(this.layout.resultDetail);
        this.resultTitle = scene.add.text(title.x, title.y, '', {
            resolution: 2, fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: '34px',
            fontStyle: 'bold',
            color: '#4a2a12',
        }).setOrigin(0.5);
        this.resultDetail = scene.add.text(detail.x, detail.y, '', {
            resolution: 2, fontFamily: 'Arial, sans-serif',
            fontSize: '22px',
            fontStyle: 'bold',
            color: '#6a3d1d',
        }).setOrigin(0.5);
        this.resultPanel.add([resultBoard, this.resultTitle, this.resultDetail]);
        this.resultChargeIndicator = new PreparationChargeIndicator(scene, {
            parent: this.resultPanel,
            ...relative(this.layout.resultCharges),
            kind: this.kind,
            iconSize: 100,
            spacing: 112,
            showEmptySlots: true,
            name: 'preparationResultCharges',
        });
        this.resultPanel.setVisible(false);
        this.root.add(this.resultPanel);

        this.cancelButton = new MedievalActionButton(scene, {
            name: 'preparationCancelButton',
            x: this.layout.cancelButton.x,
            y: this.layout.cancelButton.y,
            depth: 0,
            width: 150,
            label: '×',
            labelFontSize: 32,
            accent: 0xd68a45,
            layout: 'text',
            onClick: () => this.close(false),
        });
        this.doneButton = new MedievalActionButton(scene, {
            name: 'preparationDoneButton',
            x: this.layout.doneButton.x,
            y: this.layout.doneButton.y,
            depth: 0,
            width: 270,
            label: '↩ ZPĚT',
            labelFontSize: 28,
            accent: 0xf5bd45,
            layout: 'text',
            onClick: () => this.close(true),
        });
        this.doneButton.root.setVisible(false);
        this.root.add([this.cancelButton.root, this.doneButton.root]);
    }

    private createHeaderButton(kind: PreparationKind): MedievalActionButton {
        const style = KIND_STYLE[kind];
        const button = new MedievalActionButton(this.scene, {
            name: `${kind}PreparationHeader`,
            x: this.layout.title.x,
            y: this.layout.title.y,
            depth: 0,
            width: HEADER_BUTTON_WIDTH,
            label: style.title,
            labelFontSize: Math.round(style.labelFontSize * HEADER_SCALE),
            labelLineSpacing: Math.round(-4 * HEADER_SCALE),
            accent: style.accent,
            normalIcon: { texture: style.normalIcon },
            activeIcon: { texture: style.activeIcon },
            iconSize: 84 * HEADER_SCALE,
            iconOffsetX: (style.iconOffsetX ?? 0) * HEADER_SCALE,
        });
        button.setPresentationState('selected');
        return button;
    }

    open(kind: PreparationKind): void {
        this.cancelPendingTransition();
        const first = this.nextAdaptiveProblem?.();
        this.sampleProblems = first ? [first] : this.problemProvider().slice(0, MAX_ATTEMPTS);
        if (!first && this.sampleProblems.length < MAX_ATTEMPTS) {
            throw new Error(`PreparationTrainingOverlay requires ${MAX_ATTEMPTS} adaptive problems`);
        }
        this.kind = kind;
        this.plannedAttempts = INITIAL_ATTEMPTS;
        this.attemptsCompleted = 0;
        this.earnedCharges = 0;
        this.resultCharges = 0;
        this.attemptStates = Array.from({ length: MAX_ATTEMPTS }, () => 'pending' as AttemptState);
        this.isOpen = true;

        this.headerButtons.sword.root.setVisible(false);
        this.headerButtons.shield.root.setVisible(false);
        this.chargeIndicator.setKind(kind).setCount(0, false).setVisible(true);
        this.resultChargeIndicator.setKind(kind).setCount(0, false);
        this.attemptsContainer.setVisible(true);
        this.messageText.setVisible(false);
        this.resultPanel.setVisible(false);
        this.cancelButton.root.setVisible(true);
        this.doneButton.root.setVisible(false);
        this.renderAttemptMarkers();

        this.root.setData('phase', 'training');
        this.root.setData('kind', kind);
        this.root.setData('charges', 0);
        this.root.setData('attemptsCompleted', 0);
        this.root.setData('plannedAttempts', this.plannedAttempts);
        this.root.setVisible(true).setAlpha(0);
        this.scene.tweens.add({
            targets: this.root,
            alpha: 1,
            duration: 180,
            ease: 'Sine.easeOut',
        });

        this.nextProblemTimer = this.scene.time.delayedCall(170, () => {
            this.nextProblemTimer = null;
            this.showNextProblem();
        });
    }

    private showNextProblem(): void {
        if (!this.isOpen || this.attemptsCompleted >= this.plannedAttempts) return;

        const index = this.attemptsCompleted;
        if (!this.sampleProblems[index]) {
            const next = this.nextAdaptiveProblem?.() ?? this.problemProvider()[0];
            this.sampleProblems.push(next);
        }
        this.attemptStates[index] = 'active';
        this.messageText.setText('')
            .setColor('#f0dfbe');
        this.renderAttemptMarkers();
        this.root.setData('activeProblemIndex', index);
        this.root.setData('activeAnswer', this.sampleProblems[index].answer);
        this.mathBoard.showSingle(this.sampleProblems[index], (isCorrect, responseTimeMs, assisted) => {
            this.handleAnswer(isCorrect, responseTimeMs, assisted);
        },{telemetryContext:this.kind==='sword'?'shop_prep_sword':'shop_prep_shield'});
    }

    private handleAnswer(isCorrect: boolean, responseTimeMs: number, assisted: boolean): void {
        if (!this.isOpen) return;

        const index = this.attemptsCompleted;
        const problem = this.sampleProblems[index];
        this.attemptStates[index] = isCorrect ? 'clean' : 'wrong';
        this.attemptsCompleted++;
        this.onAttempt({
            kind: this.kind,
            problem,
            correct: isCorrect,
            responseTimeMs,
            assisted,
            attemptNumber: this.attemptsCompleted,
        });

        let addedAttempt = false;
        if (isCorrect) {
            this.earnedCharges = Math.min(PREPARATION_CONFIG.maxCharges, this.earnedCharges + 1);
            this.chargeIndicator.setCount(this.earnedCharges);
            this.messageText.setText('RUNA NABITÁ!').setColor('#9effa8');
        } else {
            if (this.plannedAttempts < MAX_ATTEMPTS) {
                this.plannedAttempts++;
                addedAttempt = true;
            }
            const message = addedAttempt
                ? 'TO NEVADÍ. PŘIDÁVÁM JEDEN PŘÍKLAD NAVÍC.'
                : 'TO NEVADÍ. PODÍVÁME SE NA VÝSLEDEK.';
            this.messageText.setText(message).setColor('#f5c879');
        }

        this.root.setData('charges', this.earnedCharges);
        this.root.setData('attemptsCompleted', this.attemptsCompleted);
        this.root.setData('plannedAttempts', this.plannedAttempts);
        this.renderAttemptMarkers(addedAttempt ? this.plannedAttempts - 1 : undefined);
        this.mathBoard.hide();

        const finished = this.earnedCharges >= PREPARATION_CONFIG.maxCharges
            || this.attemptsCompleted >= this.plannedAttempts;
        this.nextProblemTimer = this.scene.time.delayedCall(finished ? 450 : 650, () => {
            this.nextProblemTimer = null;
            if (finished) this.finish();
            else this.showNextProblem();
        });
    }

    private finish(): void {
        this.resultCharges = this.earnedCharges;
        const style = KIND_STYLE[this.kind];

        this.chargeIndicator.setVisible(false);
        this.resultChargeIndicator.setCount(this.resultCharges);
        this.attemptsContainer.setVisible(false);
        this.messageText.setVisible(false);
        this.resultTitle.setText(this.resultCharges > 0 ? style.completeTitle : 'ZKUS TO ZNOVU');
        this.resultDetail.setText(String(this.resultCharges));
        this.resultPanel.setVisible(true).setAlpha(0).setScale(0.88);
        this.cancelButton.root.setVisible(false);
        this.doneButton.root.setVisible(true);
        this.root.setData('phase', 'complete');
        this.root.setData('charges', this.resultCharges);

        this.scene.tweens.add({
            targets: this.resultPanel,
            alpha: 1,
            scale: 1,
            duration: 280,
            ease: 'Back.easeOut',
        });
    }

    private renderAttemptMarkers(newMarkerIndex?: number): void {
        this.attemptLabel.setText(
            this.attemptsCompleted < this.plannedAttempts
                ? `PŘÍKLAD ${this.attemptsCompleted + 1} Z ${this.plannedAttempts}`
                : `VYŘEŠENO ${this.attemptsCompleted} / ${this.plannedAttempts}`
        );

        this.attemptMarkers.forEach((marker, index) => {
            const visible = index < this.plannedAttempts;
            marker.container.setVisible(visible).setScale(1);
            if (!visible) return;

            const state = this.attemptStates[index];
            if (state === 'active') {
                marker.plate.setFillStyle(0x5a3b1d, 1).setStrokeStyle(3, 0xffdd88, 1);
                marker.text.setText(String(index + 1)).setColor('#ffffff');
            } else if (state === 'clean') {
                marker.plate.setFillStyle(0x17391f, 1).setStrokeStyle(2, 0x70e488, 1);
                marker.text.setText('✓').setColor('#9effa8');
            } else if (state === 'wrong') {
                marker.plate.setFillStyle(0x4a2f16, 1).setStrokeStyle(2, 0xe7a74e, 1);
                marker.text.setText('×').setColor('#f5c879');
            } else {
                marker.plate.setFillStyle(0x18120d, 0.94).setStrokeStyle(2, 0x8b6234, 0.82);
                marker.text.setText(String(index + 1)).setColor('#c5ab82');
            }

            if (index === newMarkerIndex) {
                marker.container.setScale(0.2);
                this.scene.tweens.add({
                    targets: marker.container,
                    scale: 1,
                    duration: 340,
                    ease: 'Back.easeOut',
                });
            }
        });
    }

    private close(completed: boolean): void {
        if (!this.isOpen) return;
        this.cancelPendingTransition();
        this.scene.tweens.killTweensOf(this.root);
        this.mathBoard.hide();
        this.root.setVisible(false);
        this.isOpen = false;
        this.root.setData('phase', 'closed');

        if (completed) {
            this.onComplete({
                kind: this.kind,
                charges: this.resultCharges,
                attempts: this.attemptsCompleted,
            });
        }
    }

    private cancelPendingTransition(): void {
        if (this.nextProblemTimer) {
            this.nextProblemTimer.destroy();
            this.nextProblemTimer = null;
        }
    }
}
