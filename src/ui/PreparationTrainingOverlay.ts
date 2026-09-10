import Phaser from 'phaser';
import { MathProblem } from '../types';
import { PREPARATION_CONFIG } from '../systems/PreparationSystem';
import { MathBoard } from './MathBoard';
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
    attemptNumber: number;
}

export interface PreparationTrainingOverlayOptions {
    root: Phaser.GameObjects.Container;
    layout: PreparationTrainingOverlayLayout;
    problemProvider: () => MathProblem[];
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

        this.mathBoard = new MathBoard(scene, () => undefined);
        this.mathBoard.setDamageDisplayEnabled(false);
        this.mathBoard.getContainer().setPosition(this.layout.mathBoard.x, this.layout.mathBoard.y);
        this.root.add(this.mathBoard.getContainer());

        this.attemptsContainer = scene.add.container(this.layout.attempts.x, this.layout.attempts.y);
        this.attemptLabel = scene.add.text(0, -22, '', {
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: '18px',
            fontStyle: 'bold',
            color: '#f3ddb4',
        }).setOrigin(0.5).setResolution(2);
        this.attemptsContainer.add(this.attemptLabel);
        for (let index = 0; index < MAX_ATTEMPTS; index++) {
            const x = (index - 2) * 46;
            const container = scene.add.container(x, 12);
            const plate = scene.add.circle(0, 0, 15, 0x18120d, 0.94)
                .setStrokeStyle(2, 0x8b6234, 0.82);
            const text = scene.add.text(0, -1, String(index + 1), {
                fontFamily: 'Arial, sans-serif',
                fontSize: '15px',
                fontStyle: 'bold',
                color: '#c5ab82',
            }).setOrigin(0.5).setResolution(2);
            container.add([plate, text]);
            this.attemptsContainer.add(container);
            this.attemptMarkers.push({ container, plate, text });
        }
        this.root.add(this.attemptsContainer);

        this.messageText = scene.add.text(this.layout.message.x, this.layout.message.y, '', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '19px',
            fontStyle: 'bold',
            align: 'center',
            color: '#f0dfbe',
            wordWrap: { width: 820 },
        }).setOrigin(0.5).setResolution(2);
        this.root.add(this.messageText);

        this.resultPanel = scene.add.container(this.layout.mathBoard.x, this.layout.mathBoard.y);
        const resultBoard = scene.add.image(0, 0, 'ui-math-board').setDisplaySize(650, 210);
        this.resultTitle = scene.add.text(0, -28, '', {
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: '34px',
            fontStyle: 'bold',
            color: '#4a2a12',
        }).setOrigin(0.5).setResolution(2);
        this.resultDetail = scene.add.text(0, 28, '', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '22px',
            fontStyle: 'bold',
            color: '#6a3d1d',
        }).setOrigin(0.5).setResolution(2);
        this.resultPanel.add([resultBoard, this.resultTitle, this.resultDetail]);
        this.resultPanel.setVisible(false);
        this.root.add(this.resultPanel);

        this.cancelButton = new MedievalActionButton(scene, {
            name: 'preparationCancelButton',
            x: this.layout.cancelButton.x,
            y: this.layout.cancelButton.y,
            depth: 0,
            width: 150,
            label: 'ZRUŠIT',
            labelFontSize: 19,
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
            label: 'ZPĚT DO OBCHODU',
            labelFontSize: 19,
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
        this.sampleProblems = this.problemProvider().slice(0, MAX_ATTEMPTS);
        if (this.sampleProblems.length < MAX_ATTEMPTS) {
            throw new Error(`PreparationTrainingOverlay requires ${MAX_ATTEMPTS} adaptive problems`);
        }
        this.kind = kind;
        this.plannedAttempts = INITIAL_ATTEMPTS;
        this.attemptsCompleted = 0;
        this.earnedCharges = 0;
        this.resultCharges = 0;
        this.attemptStates = Array.from({ length: MAX_ATTEMPTS }, () => 'pending' as AttemptState);
        this.isOpen = true;

        this.headerButtons.sword.root.setVisible(kind === 'sword');
        this.headerButtons.shield.root.setVisible(kind === 'shield');
        this.chargeIndicator.setKind(kind).setCount(0, false);
        this.attemptsContainer.setVisible(true);
        this.messageText.setVisible(true).setColor('#f0dfbe');
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
        if (!this.isOpen || this.attemptsCompleted >= this.sampleProblems.length) return;

        const index = this.attemptsCompleted;
        this.attemptStates[index] = 'active';
        this.messageText.setText('KAŽDÁ SPRÁVNÁ ODPOVĚĎ\nNABÍJÍ JEDNU RUNU')
            .setColor('#f0dfbe');
        this.renderAttemptMarkers();
        this.root.setData('activeProblemIndex', index);
        this.root.setData('activeAnswer', this.sampleProblems[index].answer);
        this.mathBoard.showSingle(this.sampleProblems[index], (isCorrect, responseTimeMs) => {
            this.handleAnswer(isCorrect, responseTimeMs);
        });
    }

    private handleAnswer(isCorrect: boolean, responseTimeMs: number): void {
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
            || this.attemptsCompleted >= this.plannedAttempts
            || this.attemptsCompleted >= this.sampleProblems.length;
        this.nextProblemTimer = this.scene.time.delayedCall(finished ? 450 : 650, () => {
            this.nextProblemTimer = null;
            if (finished) this.finish();
            else this.showNextProblem();
        });
    }

    private finish(): void {
        this.resultCharges = this.earnedCharges;
        const style = KIND_STYLE[this.kind];
        const roundLabel = this.resultCharges === 1 ? 'KOLO' : this.resultCharges < 5 ? 'KOLA' : 'KOL';

        this.chargeIndicator.setCount(this.resultCharges);
        this.attemptsContainer.setVisible(false);
        this.messageText.setVisible(false);
        this.resultTitle.setText(this.resultCharges > 0 ? style.completeTitle : 'ZKUS TO ZNOVU');
        this.resultDetail.setText(
            this.resultCharges > 0
                ? `BONUS NA ${this.resultCharges} ${roundLabel}`
                : 'TENTOKRÁT ŽÁDNÁ RUNA',
        );
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
