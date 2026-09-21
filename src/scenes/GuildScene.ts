import { ComparisonProblemView, comparisonGlyph } from '../ui/ComparisonProblemView';
import { COMPARISON_CHOICE_SCALE } from '../ui/ComparisonPresentation';
import Phaser from 'phaser';
import { GameStateManager } from '../systems/GameStateManager';
import { MathEngine } from '../systems/MathEngine';
import { MathProblem, TrialState, TrialProblemResult, TrialTier, ExamType, SubAtomId, BandId, MasteryTargetId, EXAM_CONFIGS, MathStats, PlayerState } from '../types';
import { MasterySystem } from '../systems/MasterySystem';
import { SceneDebugger } from '../systems/SceneDebugger';
import { SceneBuilder } from '../systems/SceneBuilder';
import { TrialFeedbackVisualizer } from '../ui/TrialFeedbackVisualizer';
import { formatMathProblem } from '../utils/formatMathProblem';
import { CoopSwitchUI } from '../ui/CoopSwitchUI';
import { MasteryMapOverlay } from '../ui/MasteryMapOverlay';
import { DailyProgressOverlay } from '../ui/DailyProgressOverlay';
import { CoopSessionManager } from '../systems/CoopSessionManager';
import { GuildHallUI } from '../ui/GuildHallUI';
import { SilverpondQuestDialog } from '../ui/SilverpondQuestDialog';
import { MedievalActionButton } from '../ui/MedievalActionButton';
import { createGuildExamBoard, createGuildExamRule } from '../ui/GuildExamTheme';

type AvailableGuildExam = {
    type: ExamType;
    targetId: MasteryTargetId;
    label: string;
};

type GuildHostLayout = {
    x: number;
    y: number;
    width: number;
    height: number;
    depth: number;
};

export interface GuildSceneOptions {
    key?: string;
    backSceneKey?: string;
    layoutSceneKey?: string;
    backgroundTexture?: string;
    persistChanges?: boolean;
    accentColor?: number;
    silverpondStory?: boolean;
}

export class GuildScene extends Phaser.Scene {
    private readonly backSceneKey: string;
    private readonly layoutSceneKey: string;
    private readonly backgroundTexture: string;
    private readonly persistChanges: boolean;
    private readonly accentColor: number;
    private readonly silverpondStory: boolean;
    private gameState!: GameStateManager;
    private mathEngine!: MathEngine;
    private catacombExam: AvailableGuildExam | null = null;
    private transientSnapshot: { player: PlayerState; mathStats: MathStats } | null = null;

    // Trial mode state
    private trialState: TrialState = {
        isActive: false,
        currentProblemIndex: 0,
        totalProblems: 10,
        timePerProblem: 15,
        timeRemainingForProblem: 15,
        correctCount: 0,
        wrongCount: 0,
        results: [],
        tier: 'none',
        phase: 'overview',
    };
    private trialProblems: MathProblem[] = [];
    private currentTrialProblem: MathProblem | null = null;
    private trialTimer: Phaser.Time.TimerEvent | null = null;
    private problemStartTime: number = 0;

    // Trial UI elements
    private trialOverlay!: Phaser.GameObjects.Container;
    private trialQuestionCounter!: Phaser.GameObjects.Text;
    private problemText!: Phaser.GameObjects.Text;
    private comparisonProblemVisual: ComparisonProblemView | null = null;
    private answerButtons: MedievalActionButton[] = [];
    private answerButtonValues: number[] = [0, 0, 0];
    private progressDots: Phaser.GameObjects.Text[] = [];
    private progressFrames: Phaser.GameObjects.Arc[] = [];
    private feedbackOverlay!: Phaser.GameObjects.Container;
    private feedbackVisualizer: TrialFeedbackVisualizer | null = null;
    private feedbackActionButton!: MedievalActionButton;
    private resultsOverlay!: Phaser.GameObjects.Container;
    private overviewOverlay!: Phaser.GameObjects.Container;
    private overviewStartButton!: MedievalActionButton;
    private overviewMedalCards: Phaser.GameObjects.Container[] = [];
    private overviewMedalTexts: Phaser.GameObjects.Text[] = [];
    private resultsContinueButton!: MedievalActionButton;
    private resultsTitleText!: Phaser.GameObjects.Text;
    private resultsMedalText!: Phaser.GameObjects.Text;
    private resultsScoreText!: Phaser.GameObjects.Text;
    private resultsRewardText!: Phaser.GameObjects.Text;
    private resultsZyxText!: Phaser.GameObjects.Text;
    private resultEntryTexts: Phaser.GameObjects.Text[] = [];
    private comparisonResultGrid!: Phaser.GameObjects.Container;

    // Mastery exam state (used when taking mastery-system exams)
    private currentMasteryExamType: ExamType | null = null;
    private currentMasteryExamTarget: MasteryTargetId | null = null;
    private masteryExamStatGains: { hpGain: number; attackGain: number; manaGain: number; shardGain?: number; coinGain?: number } = { hpGain: 0, attackGain: 0, manaGain: 0 };

    // Info overlays
    private dailyProgressOverlay!: DailyProgressOverlay;
    private masteryMapOverlay!: MasteryMapOverlay;

    // Scene Builder
    private sceneBuilder!: SceneBuilder;

    constructor(options: GuildSceneOptions = {}) {
        const sceneKey = options.key ?? 'GuildScene';
        super({ key: sceneKey });
        this.backSceneKey = options.backSceneKey ?? 'TownScene';
        this.layoutSceneKey = options.layoutSceneKey ?? sceneKey;
        this.backgroundTexture = options.backgroundTexture ?? 'interior-guild';
        this.persistChanges = options.persistChanges ?? true;
        this.accentColor = options.accentColor ?? 0xd5943c;
        this.silverpondStory = options.silverpondStory ?? false;
    }

    create(): void {
        this.gameState = GameStateManager.getInstance();
        this.captureTransientState();

        // Set player level in registry for MathEngine's adaptive difficulty
        const player = this.gameState.getPlayer();
        this.registry.set('playerLevel', player.level);

        this.mathEngine = new MathEngine(this.registry);

        // Scene Editor layout stays authoritative for both visual variants.
        this.sceneBuilder = new SceneBuilder(this);
        this.sceneBuilder.registerHandler('onBack', () => this.leaveGuild());
        this.sceneBuilder.buildScene(this.layoutSceneKey);
        this.applyBackgroundTexture();

        this.createTrialUI();

        const dailyOverlayHost = this.getHostLayout('dailyProgressOverlayHost', {
            x: 640, y: 360, width: 1160, height: 620, depth: 10000,
        });
        const learningOverlayHost = this.getHostLayout('learningMapOverlayHost', {
            x: 640, y: 360, width: 1150, height: 610, depth: 10000,
        });
        this.dailyProgressOverlay = new DailyProgressOverlay(this);
        this.dailyProgressOverlay.setPlacement(dailyOverlayHost.x, dailyOverlayHost.y, dailyOverlayHost.depth);
        this.masteryMapOverlay = new MasteryMapOverlay(this);
        this.masteryMapOverlay.setPlacement(learningOverlayHost.x, learningOverlayHost.y, learningOverlayHost.depth);
        this.createHallUI();

        if (this.silverpondStory) {
            new SilverpondQuestDialog(this, this.sceneBuilder);
        }

        const coopHost = this.getHostLayout('coopSwitchHost', { x: 280, y: 655, width: 260, height: 45, depth: 80 });
        new CoopSwitchUI(this, coopHost.x, coopHost.y);

        this.setupDebugger();
    }

    private captureTransientState(): void {
        if (this.persistChanges || this.transientSnapshot) return;

        this.transientSnapshot = {
            player: this.cloneState(this.gameState.getPlayer()),
            mathStats: this.cloneState(this.gameState.getMathStats()),
        };
    }

    private cloneState<T>(state: T): T {
        return JSON.parse(JSON.stringify(state)) as T;
    }

    private restoreTransientState(): void {
        if (!this.transientSnapshot) return;

        Object.assign(this.gameState.getPlayer(), this.cloneState(this.transientSnapshot.player));
        this.gameState.setMathStats(this.cloneState(this.transientSnapshot.mathStats));
        MasterySystem.destroyInstance();
        this.transientSnapshot = null;
    }

    private saveState(): void {
        if (this.persistChanges) this.gameState.save();
    }

    private leaveGuild(): void {
        this.restoreTransientState();
        this.scene.start(this.backSceneKey);
    }

    private applyBackgroundTexture(): void {
        this.sceneBuilder.get<Phaser.GameObjects.Image>('interior')?.setTexture(this.backgroundTexture);
    }

    private getHostLayout(id: string, fallback: GuildHostLayout): GuildHostLayout {
        const object = this.sceneBuilder.get<Phaser.GameObjects.Container>(id);
        const definition = this.sceneBuilder.getElementDef(id) as Partial<GuildHostLayout> | undefined;
        return {
            x: object?.x ?? definition?.x ?? fallback.x,
            y: object?.y ?? definition?.y ?? fallback.y,
            width: definition?.width ?? object?.width ?? fallback.width,
            height: definition?.height ?? object?.height ?? fallback.height,
            depth: object?.depth ?? definition?.depth ?? fallback.depth,
        };
    }

    private createHallUI(): void {
        const availableExams = MasterySystem.getInstance().getAvailableExams();
        const standardExam = this.currentMasteryExamType && this.currentMasteryExamTarget
            ? availableExams.find(exam =>
                exam.type === this.currentMasteryExamType
                && exam.targetId === this.currentMasteryExamTarget
            ) ?? null
            : null;

        new GuildHallUI({
            scene: this,
            sceneBuilder: this.sceneBuilder,
            gameState: this.gameState,
            accentColor: this.accentColor,
            standardExam,
            catacombExam: this.catacombExam,
            onStartExam: () => this.showTrialOverview(),
            onStartManaCollection: () => {
                this.scene.start('ManaCollectionScene', { returnScene: this.scene.key });
            },
            onStartCatacomb: exam => {
                this.scene.start('CatacombTrialScene', {
                    examType: exam.type,
                    subAtomId: exam.targetId,
                    returnScene: this.scene.key,
                });
            },
            onShowLearning: () => this.masteryMapOverlay.show(),
            onShowDailyProgress: () => this.dailyProgressOverlay.show(),
        });
    }

    private setupDebugger(): void {
        new SceneDebugger(this, this.layoutSceneKey);
    }

    // ============ TRIAL MODE (4-phase system) ============

    private createTrialUI(): void {
        const isCoopReadOnly = CoopSessionManager.getInstance().isCoopActive();
        const availableExams = MasterySystem.getInstance().getAvailableExams();

        this.currentMasteryExamType = null;
        this.currentMasteryExamTarget = null;
        this.catacombExam = null;

        if (!isCoopReadOnly) {
            const standardExam = availableExams.find(
                exam => exam.type !== 'fluency_challenge' && exam.type !== 'mastery_challenge',
            );
            if (standardExam) {
                this.currentMasteryExamType = standardExam.type;
                this.currentMasteryExamTarget = standardExam.targetId;
            }

            this.catacombExam = availableExams.find(
                exam => exam.type === 'fluency_challenge' || exam.type === 'mastery_challenge',
            ) ?? null;
        }

        const trialOverlayEl = this.sceneBuilder.get('trialOverlay') as Phaser.GameObjects.Container | undefined;
        const overlayX = trialOverlayEl?.x ?? 640;
        const overlayY = trialOverlayEl?.y ?? 360;
        this.createOverviewOverlay(overlayX, overlayY);
        this.createTrialOverlay(overlayX, overlayY);
        this.createFeedbackOverlay(overlayX, overlayY);
        this.createResultsOverlay(overlayX, overlayY);
    }

    private getLocalHost(
        id: string,
        rootX: number,
        rootY: number,
        fallback: GuildHostLayout,
    ): GuildHostLayout {
        const host = this.getHostLayout(id, fallback);
        return { ...host, x: host.x - rootX, y: host.y - rootY };
    }

    private addExamBackdrop(container: Phaser.GameObjects.Container): void {
        const dimmer = this.add.rectangle(0, 0, 1280, 720, 0x080b0d, 0.76)
            .setInteractive();
        const vignette = this.add.graphics();
        vignette.fillStyle(0x000000, 0.28);
        vignette.fillRect(-640, -360, 1280, 74);
        vignette.fillRect(-640, 286, 1280, 74);
        vignette.lineStyle(2, this.accentColor, 0.23);
        vignette.lineBetween(-520, -308, 520, -308);
        vignette.lineBetween(-520, 308, 520, 308);
        container.add([dimmer, vignette]);
    }

    private accentHex(): string {
        return `#${this.accentColor.toString(16).padStart(6, '0')}`;
    }

    // === Phase 1: Overview ===

    private createOverviewOverlay(x: number, y: number): void {
        const rootHost = this.getHostLayout('overviewOverlay', {
            x, y, width: 1280, height: 720, depth: 200,
        });
        this.overviewOverlay = this.add.container(rootHost.x, rootHost.y)
            .setDepth(rootHost.depth)
            .setVisible(false);
        this.addExamBackdrop(this.overviewOverlay);

        const boardHost = this.getLocalHost('trialBoardHost', rootHost.x, rootHost.y, {
            x: 640, y: 360, width: 1080, height: 610, depth: 201,
        });
        const board = createGuildExamBoard(this, {
            x: boardHost.x,
            y: boardHost.y,
            width: boardHost.width,
            height: boardHost.height,
            accent: this.accentColor,
        }).setDepth(boardHost.depth);
        this.overviewOverlay.add(board);

        const headerHost = this.getLocalHost('trialHeaderHost', rootHost.x, rootHost.y, {
            x: 640, y: 103, width: 760, height: 74, depth: 203,
        });
        const title = this.add.text(headerHost.x, headerHost.y - 7, 'CECHOVNÍ ZKOUŠKA', {
            resolution: 2,
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: '38px',
            fontStyle: 'bold',
            color: '#3b210f',
            stroke: '#f5d88b',
            strokeThickness: 2,
            align: 'center',
        }).setOrigin(0.5).setDepth(headerHost.depth);
        const subtitle = this.add.text(headerHost.x, headerHost.y + 30, 'MISTROVA SÍŇ • PROVĚŘENÍ DOVEDNOSTI', {
            resolution: 2,
            fontFamily: 'Georgia, serif',
            fontSize: '14px',
            fontStyle: 'bold',
            color: '#6e4524',
            letterSpacing: 1,
        }).setOrigin(0.5).setDepth(headerHost.depth);
        this.overviewOverlay.add([title, subtitle]);

        const rule = createGuildExamRule(
            this,
            headerHost.x,
            headerHost.y + 54,
            Math.min(720, headerHost.width),
            this.accentColor,
        );
        this.overviewOverlay.add(rule);

        const contentHost = this.getLocalHost('trialProblemHost', rootHost.x, rootHost.y, {
            x: 640, y: 285, width: 820, height: 190, depth: 203,
        });
        const dialog = this.add.text(contentHost.x, contentHost.y - 45, '', {
            resolution: 2,
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: '24px',
            fontStyle: 'bold',
            color: '#3b210f',
            align: 'center',
            lineSpacing: 7,
            wordWrap: { width: contentHost.width },
        }).setOrigin(0.5).setDepth(contentHost.depth);
        const desc = this.add.text(contentHost.x, contentHost.y + 37, '', {
            resolution: 2,
            fontFamily: 'Georgia, serif',
            fontSize: '18px',
            color: '#5f3a1c',
            align: 'center',
            lineSpacing: 6,
            wordWrap: { width: contentHost.width },
        }).setOrigin(0.5).setDepth(contentHost.depth);
        this.overviewOverlay.add([dialog, desc]);
        this.overviewOverlay.setData('dialog', dialog);
        this.overviewOverlay.setData('desc', desc);

        const medalsHost = this.getLocalHost('trialMedalsHost', rootHost.x, rootHost.y, {
            x: 640, y: 452, width: 720, height: 82, depth: 204,
        });
        this.overviewMedalCards = [];
        this.overviewMedalTexts = [];
        const medalNames = ['BRONZ', 'STŘÍBRO', 'ZLATO'];
        const medalColors = [0xb87333, 0xbfc7ce, 0xe0b33c];
        for (let i = 0; i < 3; i++) {
            const cardX = medalsHost.x + (i - 1) * (medalsHost.width / 3.15);
            const card = this.add.container(cardX, medalsHost.y).setDepth(medalsHost.depth);
            const plate = this.add.graphics();
            plate.fillStyle(0x2a180e, 0.92);
            plate.fillRoundedRect(-105, -34, 210, 68, 13);
            plate.lineStyle(2, medalColors[i], 0.95);
            plate.strokeRoundedRect(-105, -34, 210, 68, 13);
            const medal = this.add.circle(-72, 0, 22, medalColors[i], 1)
                .setStrokeStyle(3, 0x4b301a, 1);
            const star = this.add.text(-72, 1, '★', {
                resolution: 2,
                fontFamily: 'Georgia, serif', fontSize: '22px', color: '#fff2be',
            }).setOrigin(0.5);
            const label = this.add.text(20, 0, medalNames[i], {
                resolution: 2,
                fontFamily: 'Georgia, serif',
                fontSize: '15px',
                fontStyle: 'bold',
                color: '#f4ddb0',
                align: 'center',
            }).setOrigin(0.5);
            card.add([plate, medal, star, label]);
            this.overviewOverlay.add(card);
            this.overviewMedalCards.push(card);
            this.overviewMedalTexts.push(label);
        }

        const actionHost = this.getLocalHost('trialOverviewActionHost', rootHost.x, rootHost.y, {
            x: 640, y: 585, width: 340, height: 82, depth: 205,
        });
        this.overviewStartButton = new MedievalActionButton(this, {
            x: actionHost.x,
            y: actionHost.y,
            depth: actionHost.depth,
            width: actionHost.width,
            height: actionHost.height,
            label: 'VSTOUPIT DO ZKOUŠKY',
            accent: this.accentColor,
            layout: 'text',
            labelFontSize: 21,
            onClick: () => this.startTrial(),
        });
        this.overviewOverlay.add(this.overviewStartButton.root);

        const cancelHost = this.getLocalHost('trialCancelHost', rootHost.x, rootHost.y, {
            x: 1040, y: 105, width: 170, height: 54, depth: 205,
        });
        const cancelButton = new MedievalActionButton(this, {
            x: cancelHost.x,
            y: cancelHost.y,
            depth: cancelHost.depth,
            width: cancelHost.width,
            height: cancelHost.height,
            label: 'ZPĚT',
            accent: this.accentColor,
            layout: 'text',
            labelFontSize: 17,
            onClick: () => this.overviewOverlay.setVisible(false),
        });
        this.overviewOverlay.add(cancelButton.root);
    }

    private showTrialOverview(): void {
        const examType = this.currentMasteryExamType;
        const examTarget = this.currentMasteryExamTarget;
        const dialog = this.overviewOverlay.getData('dialog') as Phaser.GameObjects.Text;
        const desc = this.overviewOverlay.getData('desc') as Phaser.GameObjects.Text;

        dialog.setText('Předstup před cechovní radu.\nUkaž klidnou hlavu a přesné počítání.');
        if (examType && examTarget) {
            const config = EXAM_CONFIGS[examType];
            const examLabel = MasterySystem.getInstance().getAvailableExams()
                .find(e => e.type === examType && e.targetId === examTarget)?.label || `Zkouška ${examTarget}`;
            const rules = config.bronzeThreshold
                ? `${config.itemCount} příkladů • medaile podle počtu správných odpovědí`
                : `${config.itemCount} příkladů • ${config.passThreshold}+ správně pro postup`;
            desc.setText(`${examLabel.toUpperCase()}\n${rules}`);

            if (config.passThreshold) {
                this.overviewMedalCards[0].setVisible(false);
                this.overviewMedalCards[2].setVisible(false);
                this.overviewMedalCards[1].setVisible(true);
                this.overviewMedalTexts[1].setText(`POSTUP\n${config.passThreshold} / ${config.itemCount}`);
            } else {
                this.overviewMedalCards.forEach(card => card.setVisible(true));
                this.overviewMedalTexts[0].setText(`BRONZ\n${config.bronzeThreshold}+ SPRÁVNĚ`);
                this.overviewMedalTexts[1].setText(`STŘÍBRO\n${config.silverThreshold}+ SPRÁVNĚ`);
                this.overviewMedalTexts[2].setText(`ZLATO\n${config.goldThreshold}+ SPRÁVNĚ`);
            }
        }

        this.overviewOverlay.setVisible(true);
        this.trialState.phase = 'overview';
    }

    // === Phase 2: Problem display with per-problem timer ===

    private createTrialOverlay(x: number, y: number): void {
        const rootHost = this.getHostLayout('trialOverlay', {
            x, y, width: 1280, height: 720, depth: 200,
        });
        this.trialOverlay = this.add.container(rootHost.x, rootHost.y)
            .setDepth(rootHost.depth)
            .setVisible(false);
        this.addExamBackdrop(this.trialOverlay);

        const boardHost = this.getLocalHost('trialBoardHost', rootHost.x, rootHost.y, {
            x: 640, y: 360, width: 1080, height: 610, depth: 201,
        });
        this.trialOverlay.add(createGuildExamBoard(this, {
            x: boardHost.x,
            y: boardHost.y,
            width: boardHost.width,
            height: boardHost.height,
            accent: this.accentColor,
        }).setDepth(boardHost.depth));

        const headerHost = this.getLocalHost('trialHeaderHost', rootHost.x, rootHost.y, {
            x: 640, y: 101, width: 760, height: 66, depth: 203,
        });
        this.trialQuestionCounter = this.add.text(headerHost.x, headerHost.y, 'OTÁZKA 1 Z 8', {
            resolution: 2,
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: '28px',
            fontStyle: 'bold',
            color: '#3b210f',
            stroke: '#f5d88b',
            strokeThickness: 1,
        }).setOrigin(0.5).setDepth(headerHost.depth);
        this.trialOverlay.add(this.trialQuestionCounter);

        const progressHost = this.getLocalHost('trialProgressHost', rootHost.x, rootHost.y, {
            x: 640, y: 165, width: 760, height: 48, depth: 204,
        });
        this.progressDots = [];
        this.progressFrames = [];
        const maxDots = Math.max(...Object.values(EXAM_CONFIGS).map(config => config.itemCount));
        const gap = Math.min(52, progressHost.width / Math.max(1, maxDots - 1));
        const dotsStartX = progressHost.x - ((maxDots - 1) * gap) / 2;
        this.trialOverlay.setData('progressHost', progressHost);
        for (let i = 0; i < maxDots; i++) {
            const nodeX = dotsStartX + i * gap;
            const frame = this.add.circle(nodeX, progressHost.y, 17, 0x2b190e, 1)
                .setStrokeStyle(2, 0x8b633a, 1)
                .setDepth(progressHost.depth);
            const dot = this.add.text(nodeX, progressHost.y + 1, `${i + 1}`, {
                fontSize: '13px',
                resolution: 2,
                fontFamily: 'Georgia, serif',
                fontStyle: 'bold',
                color: '#dcc79f',
            }).setOrigin(0.5).setDepth(progressHost.depth + 1);
            this.trialOverlay.add([frame, dot]);
            this.progressFrames.push(frame);
            this.progressDots.push(dot);
        }

        const problemHost = this.getLocalHost('trialProblemHost', rootHost.x, rootHost.y, {
            x: 640, y: 305, width: 860, height: 150, depth: 204,
        });
        this.problemText = this.add.text(problemHost.x, problemHost.y, '', {
            fontSize: '72px',
            resolution: 2,
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            color: '#2f1a0d',
            fontStyle: 'bold',
            stroke: '#f9e6ad',
            strokeThickness: 2,
            align: 'center',
        }).setOrigin(0.5).setDepth(problemHost.depth);
        this.trialOverlay.add(this.problemText);
        this.trialOverlay.setData('problemHost', problemHost);

        this.answerButtons = [];
        ['answerButton1', 'answerButton2', 'answerButton3'].forEach((id, index) => {
            const fallbackX = 320 + index * 320;
            const host = this.getLocalHost(id, rootHost.x, rootHost.y, {
                x: fallbackX, y: 475, width: 292, height: 88, depth: 205,
            });
            const button = new MedievalActionButton(this, {
                x: host.x,
                y: host.y,
                depth: host.depth,
                width: host.width,
                height: host.height,
                label: '',
                accent: this.accentColor,
                layout: 'text',
                frameTexture: 'guild-nav-frame-v2',
                labelOffsetX: host.width * 0.1,
                labelFontSize: 34,
                labelMaxWidth: host.width * 0.56,
                onClick: () => this.checkTrialAnswer(index),
            });
            const badge = this.add.text(-host.width * 0.305, 1, ['I', 'II', 'III'][index], {
                resolution: 2,
                fontFamily: 'Georgia, serif',
                fontSize: '20px',
                fontStyle: 'bold',
                color: this.accentHex(),
                stroke: '#130c08',
                strokeThickness: 3,
            }).setOrigin(0.5);
            button.root.add(badge);
            this.trialOverlay.add(button.root);
            this.answerButtons.push(button);
        });

        const hintHost = this.getLocalHost('trialHintHost', rootHost.x, rootHost.y, {
            x: 640, y: 575, width: 760, height: 42, depth: 204,
        });
        const hintRule = createGuildExamRule(this, hintHost.x, hintHost.y - 24, hintHost.width, this.accentColor);
        const hint = this.add.text(hintHost.x, hintHost.y + 2, 'Každá odpověď platí', {
            resolution: 2,
            fontFamily: 'Georgia, serif',
            fontSize: '14px',
            fontStyle: 'bold',
            color: '#6b4425',
            letterSpacing: 1,
        }).setOrigin(0.5).setDepth(hintHost.depth);
        this.trialOverlay.add([hintRule, hint]);
    }

    // === Phase 3: Feedback overlay ===

    private createFeedbackOverlay(x: number, y: number): void {
        const rootHost = this.getHostLayout('feedbackOverlay', {
            x, y, width: 1280, height: 720, depth: 210,
        });
        this.feedbackOverlay = this.add.container(rootHost.x, rootHost.y)
            .setDepth(rootHost.depth)
            .setVisible(false);
        this.addExamBackdrop(this.feedbackOverlay);

        const boardHost = this.getLocalHost('trialBoardHost', rootHost.x, rootHost.y, {
            x: 640, y: 360, width: 1080, height: 610, depth: 211,
        });
        this.feedbackOverlay.add(createGuildExamBoard(this, {
            x: boardHost.x,
            y: boardHost.y,
            width: boardHost.width,
            height: boardHost.height,
            accent: this.accentColor,
        }).setDepth(boardHost.depth));

        const headerHost = this.getLocalHost('trialFeedbackHeaderHost', rootHost.x, rootHost.y, {
            x: 640, y: 120, width: 780, height: 90, depth: 213,
        });
        const heading = this.add.text(headerHost.x, headerHost.y - 20, 'MISTROVA RADA', {
            resolution: 2,
            fontFamily: 'Georgia, serif',
            fontSize: '17px',
            fontStyle: 'bold',
            color: '#6b4425',
            letterSpacing: 2,
        }).setOrigin(0.5).setDepth(headerHost.depth);
        const correctLabel = this.add.text(headerHost.x, headerHost.y + 25, '', {
            fontSize: '40px',
            resolution: 2,
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            color: '#276129',
            fontStyle: 'bold',
            stroke: '#e9cf83',
            strokeThickness: 2,
        }).setOrigin(0.5).setDepth(headerHost.depth);
        this.feedbackOverlay.add([heading, correctLabel]);
        this.feedbackOverlay.setData('correctLabel', correctLabel);

        const visualHost = this.getLocalHost('trialFeedbackVisualHost', rootHost.x, rootHost.y, {
            x: 640, y: 355, width: 820, height: 310, depth: 213,
        });
        const visualContainer = this.add.container(visualHost.x, visualHost.y).setDepth(visualHost.depth);
        this.feedbackOverlay.add(visualContainer);
        this.feedbackOverlay.setData('visualContainer', visualContainer);

        const actionHost = this.getLocalHost('trialFeedbackActionHost', rootHost.x, rootHost.y, {
            x: 640, y: 585, width: 310, height: 78, depth: 214,
        });
        this.feedbackActionButton = new MedievalActionButton(this, {
            x: actionHost.x,
            y: actionHost.y,
            depth: actionHost.depth,
            width: actionHost.width,
            height: actionHost.height,
            label: 'PŘESKOČIT',
            accent: this.accentColor,
            layout: 'text',
            labelFontSize: 21,
            onClick: () => this.closeFeedback(),
        });
        this.feedbackOverlay.add(this.feedbackActionButton.root);
    }

    private showFeedback(problem: MathProblem, _playerAnswer: number | null): void {
        this.trialState.phase = 'feedback';
        if (this.trialTimer) this.trialTimer.paused = true;
        if (this.feedbackVisualizer) {
            this.feedbackVisualizer.destroy();
            this.feedbackVisualizer = null;
        }

        const correctLabel = this.feedbackOverlay.getData('correctLabel') as Phaser.GameObjects.Text;
        const visualContainer = this.feedbackOverlay.getData('visualContainer') as Phaser.GameObjects.Container;
        visualContainer.removeAll(true);
        correctLabel.setText(problem.comparisonMeta ? 'Podívej' : formatMathProblem(problem, 'answer'));
        this.feedbackActionButton.setLabel('PŘESKOČIT');
        this.feedbackOverlay.setVisible(true);

        let animationDone = false;
        const showTime = Date.now();
        this.feedbackVisualizer = new TrialFeedbackVisualizer(this, visualContainer, () => {
            if (animationDone) return;
            animationDone = true;
            const remaining = Math.max(0, 3000 - (Date.now() - showTime));
            this.time.delayedCall(remaining, () => {
                if (this.feedbackActionButton.root.active) this.feedbackActionButton.setLabel('ROZUMÍM');
            });
        });
        this.feedbackVisualizer.show(problem);
    }

    private closeFeedback(): void {
        this.feedbackOverlay.setVisible(false);
        if (this.feedbackVisualizer) {
            this.feedbackVisualizer.destroy();
            this.feedbackVisualizer = null;
        }

        // Resume timer and advance to next problem
        if (this.trialTimer) this.trialTimer.paused = false;
        this.advanceToNextProblem();
    }

    // === Phase 4: Results overlay ===

    private createResultsOverlay(x: number, y: number): void {
        const rootHost = this.getHostLayout('resultsOverlay', {
            x, y, width: 1280, height: 720, depth: 200,
        });
        this.resultsOverlay = this.add.container(rootHost.x, rootHost.y)
            .setDepth(rootHost.depth)
            .setVisible(false);
        this.addExamBackdrop(this.resultsOverlay);

        const boardHost = this.getLocalHost('trialBoardHost', rootHost.x, rootHost.y, {
            x: 640, y: 360, width: 1080, height: 610, depth: 201,
        });
        this.resultsOverlay.add(createGuildExamBoard(this, {
            x: boardHost.x,
            y: boardHost.y,
            width: boardHost.width,
            height: boardHost.height,
            accent: this.accentColor,
        }).setDepth(boardHost.depth));

        const headerHost = this.getLocalHost('trialResultsHeaderHost', rootHost.x, rootHost.y, {
            x: 640, y: 115, width: 800, height: 110, depth: 203,
        });
        this.resultsTitleText = this.add.text(headerHost.x, headerHost.y - 22, '', {
            resolution: 2,
            fontFamily: 'Palatino Linotype, Book Antiqua, Georgia, serif',
            fontSize: '32px',
            fontStyle: 'bold',
            color: '#3b210f',
            align: 'center',
        }).setOrigin(0.5).setDepth(headerHost.depth);
        this.resultsMedalText = this.add.text(headerHost.x, headerHost.y + 25, '', {
            resolution: 2,
            fontFamily: 'Georgia, serif',
            fontSize: '30px',
            color: '#d19a26',
            stroke: '#5c3718',
            strokeThickness: 2,
        }).setOrigin(0.5).setDepth(headerHost.depth);
        this.resultsOverlay.add([this.resultsTitleText, this.resultsMedalText]);

        const scoreHost = this.getLocalHost('trialResultsScoreHost', rootHost.x, rootHost.y, {
            x: 640, y: 205, width: 720, height: 48, depth: 203,
        });
        this.resultsScoreText = this.add.text(scoreHost.x, scoreHost.y, '', {
            resolution: 2,
            fontFamily: 'Georgia, serif',
            fontSize: '18px',
            fontStyle: 'bold',
            color: '#68411f',
            align: 'center',
        }).setOrigin(0.5).setDepth(scoreHost.depth);
        this.resultsOverlay.add(this.resultsScoreText);
        this.resultsOverlay.add(createGuildExamRule(this, scoreHost.x, scoreHost.y + 29, scoreHost.width, this.accentColor));

        const gridHost = this.getLocalHost('trialResultsGridHost', rootHost.x, rootHost.y, {
            x: 640, y: 355, width: 790, height: 220, depth: 203,
        });
        this.comparisonResultGrid = this.add.container(gridHost.x, gridHost.y)
            .setDepth(gridHost.depth).setSize(gridHost.width, gridHost.height).setVisible(false);
        this.resultsOverlay.add(this.comparisonResultGrid);
        this.resultEntryTexts = [];
        const maxResults = Math.max(...Object.values(EXAM_CONFIGS).map(config => config.itemCount));
        const maxRows = Math.ceil(maxResults / 2);
        const rowHeight = gridHost.height / maxRows;
        const columnWidth = gridHost.width / 2;
        for (let i = 0; i < maxResults; i++) {
            const col = i < maxRows ? 0 : 1;
            const row = i < maxRows ? i : i - maxRows;
            const entry = this.add.text(
                gridHost.x - gridHost.width / 2 + col * columnWidth + 26,
                gridHost.y - gridHost.height / 2 + row * rowHeight + rowHeight / 2,
                '',
                {
                    resolution: 2,
                    fontFamily: 'Georgia, serif',
                    fontSize: '16px',
                    fontStyle: 'bold',
                    color: '#3f2a19',
                },
            ).setOrigin(0, 0.5).setDepth(gridHost.depth).setVisible(false);
            this.resultsOverlay.add(entry);
            this.resultEntryTexts.push(entry);
        }

        const rewardHost = this.getLocalHost('trialRewardHost', rootHost.x, rootHost.y, {
            x: 640, y: 500, width: 820, height: 54, depth: 204,
        });
        this.resultsRewardText = this.add.text(rewardHost.x, rewardHost.y, '', {
            resolution: 2,
            fontFamily: 'Georgia, serif',
            fontSize: '18px',
            fontStyle: 'bold',
            color: '#5f3a1b',
            align: 'center',
            wordWrap: { width: rewardHost.width },
        }).setOrigin(0.5).setDepth(rewardHost.depth);
        this.resultsOverlay.add(this.resultsRewardText);

        const messageHost = this.getLocalHost('trialResultMessageHost', rootHost.x, rootHost.y, {
            x: 640, y: 545, width: 760, height: 42, depth: 204,
        });
        this.resultsZyxText = this.add.text(messageHost.x, messageHost.y, '', {
            resolution: 2,
            fontFamily: 'Georgia, serif',
            fontSize: '15px',
            fontStyle: 'italic',
            color: '#35637a',
            align: 'center',
            wordWrap: { width: messageHost.width },
        }).setOrigin(0.5).setDepth(messageHost.depth);
        this.resultsOverlay.add(this.resultsZyxText);

        const actionHost = this.getLocalHost('trialResultsActionHost', rootHost.x, rootHost.y, {
            x: 640, y: 607, width: 310, height: 76, depth: 205,
        });
        this.resultsContinueButton = new MedievalActionButton(this, {
            x: actionHost.x,
            y: actionHost.y,
            depth: actionHost.depth,
            width: actionHost.width,
            height: actionHost.height,
            label: 'ZPĚT DO CECHU',
            accent: this.accentColor,
            layout: 'text',
            labelFontSize: 20,
            onClick: () => {
                this.resultsOverlay.setVisible(false);
                this.scene.restart();
            },
        });
        this.resultsOverlay.add(this.resultsContinueButton.root);
    }

    private showResults(): void {
        this.resultsOverlay.setVisible(true);
        this.trialState.phase = 'results';
        const tier = this.trialState.tier;
        const isComparison = this.currentMasteryExamType === 'comparison_chapter';
        const tierConfig = this.getTierDisplay(tier);
        this.resultsTitleText.setText(tierConfig.title).setColor(tierConfig.color);
        this.resultsMedalText.setText(tierConfig.stars);
        this.resultsScoreText.setFontSize(isComparison ? 28 : 18).setText(isComparison
            ? `✓ ${this.trialState.correctCount} / ${this.trialState.totalProblems}`
            : `${this.trialState.correctCount} Z ${this.trialState.totalProblems} SPRÁVNĚ`);

        this.resultEntryTexts.forEach(entry => entry.setVisible(false));
        this.comparisonResultGrid.removeAll(true).setVisible(isComparison);
        const half = Math.ceil(this.trialState.results.length / 2);
        for (let i = 0; i < this.trialState.results.length; i++) {
            const result = this.trialState.results[i];
            if (isComparison) {
                const grid = this.comparisonResultGrid;
                const columns = 4, rows = Math.ceil(this.trialState.results.length / columns);
                const cellWidth = grid.width / columns, cellHeight = grid.height / rows;
                const x = (i % columns - (columns - 1) / 2) * cellWidth;
                const y = (Math.floor(i / columns) - (rows - 1) / 2) * cellHeight;
                const color = result.wasCorrect ? 0x427238 : 0x9b4939;
                const card = this.add.graphics().setPosition(x, y);
                card.fillStyle(color, 0.14).fillRoundedRect(-cellWidth * 0.4, -cellHeight * 0.39, cellWidth * 0.8, cellHeight * 0.78, 14);
                card.lineStyle(2, color, 0.75).strokeRoundedRect(-cellWidth * 0.4, -cellHeight * 0.39, cellWidth * 0.8, cellHeight * 0.78, 14);
                const number = this.add.text(x - cellWidth * 0.29, y - cellHeight * 0.23, `${i + 1}`, {
                    fontFamily: 'Arial, sans-serif', fontSize: '18px', color: '#68411f', resolution: 2,
                }).setOrigin(0.5);
                const mark = this.add.text(x, y + 2, result.wasCorrect ? '✓' : '×', {
                    fontFamily: 'Arial, sans-serif', fontSize: '46px', fontStyle: 'bold',
                    color: result.wasCorrect ? '#28622b' : '#8b2f26', resolution: 2,
                }).setOrigin(0.5);
                grid.add([card, number, mark]);
                continue;
            }
            const targetIndex = i < half ? i : 7 + (i - half);
            const entry = this.resultEntryTexts[targetIndex];
            if (!entry) continue;
            entry
                .setText(`${result.wasCorrect ? '✓' : '✕'}   ${formatMathProblem(result.problem, 'answer')}`)
                .setColor(result.wasCorrect ? '#28622b' : '#8b2f26')
                .setVisible(true);
        }

        const player = this.gameState.getPlayer();
        this.saveState();
        this.registry.set('playerLevel', player.level);
        const gains = this.masteryExamStatGains;
        const hasGains = gains.hpGain > 0 || gains.attackGain > 0 || gains.manaGain > 0
            || (gains.shardGain ?? 0) > 0 || (gains.coinGain ?? 0) > 0;

        let rewardText: string;
        if (tier !== 'none' && hasGains) {
            const parts: string[] = [`ÚROVEŇ ${player.level}`];
            if (gains.hpGain > 0) parts.push(`HP +${gains.hpGain}`);
            if (gains.attackGain > 0) parts.push(`ÚTOK +${gains.attackGain}`);
            if (gains.manaGain > 0) parts.push(`MANA +${gains.manaGain}`);
            if ((gains.shardGain ?? 0) > 0) parts.push(`KRYSTAL +${gains.shardGain}`);
            if ((gains.coinGain ?? 0) > 0) parts.push(`MINCE +${gains.coinGain}`);
            rewardText = `ODMĚNA  •  ${parts.join('  •  ')}`;
        } else if (tier !== 'none') {
            rewardText = `ODMĚNA  •  ÚROVEŇ ${player.level}  •  POSTUP POTVRZEN`;
        } else {
            rewardText = 'CECH DOPORUČUJE DALŠÍ TRÉNINK. NOVÝ POKUS JE PŘIPRAVEN.';
        }
        if (isComparison) {
            const rewards: string[] = [];
            if (tier !== 'none') {
                if (gains.hpGain > 0) rewards.push(`♥ +${gains.hpGain}`);
                if (gains.attackGain > 0) rewards.push(`⚔ +${gains.attackGain}`);
                if (gains.manaGain > 0) rewards.push(`✦ +${gains.manaGain}`);
                if ((gains.shardGain ?? 0) > 0) rewards.push(`💎 +${gains.shardGain}`);
                if ((gains.coinGain ?? 0) > 0) rewards.push(`🪙 +${gains.coinGain}`);
            }
            rewardText = tier === 'none' ? 'Ještě potrénujeme' : rewards.join('    ') || 'Hotovo!';
        }
        this.resultsRewardText.setFontSize(isComparison ? 26 : 18).setText(rewardText);
        this.resultsZyxText.setVisible(!isComparison).setText(isComparison ? '' : this.getZyxMessage(tier));
    }

    private getTierDisplay(tier: TrialTier): { title: string; stars: string; color: string } {
        switch (tier) {
            case 'gold':   return { title: 'ZLATÁ ZKOUŠKA!', stars: '★ ★ ★', color: '#8a5d08' };
            case 'silver': return { title: 'STŘÍBRNÁ ZKOUŠKA!', stars: '★ ★ ☆', color: '#56616a' };
            case 'bronze': return { title: 'BRONZOVÁ ZKOUŠKA!', stars: '★ ☆ ☆', color: '#874918' };
            default:       return { title: 'ZKOUŠKA NEÚSPĚŠNÁ', stars: '☆ ☆ ☆', color: '#8b2f26' };
        }
    }

    private getZyxMessage(tier: TrialTier): string {
        switch (tier) {
            case 'gold':   return '"Perfektní! Tvá Numera Energie září jako hvězda!"';
            case 'silver': return '"Skvělá práce! Ještě trocha cviku a budeš mistr!"';
            case 'bronze': return '"Dobrý začátek! Každá zkouška tě posouvá dál."';
            default:       return '"Nevěš hlavu! Procvič si příklady a zkus to znovu."';
        }
    }

    // === Trial flow control ===

    private startTrial(): void {
        this.overviewOverlay.setVisible(false);
        this.startMasteryExam();
    }

    /** Start a mastery-system exam (sub-atom, fluency, mastery challenge, band gate, band mastery) */
    private startMasteryExam(): void {
        const examType = this.currentMasteryExamType!;
        const target = this.currentMasteryExamTarget!;
        const config = EXAM_CONFIGS[examType];
        const masterySystem = MasterySystem.getInstance();

        // Generate exam problems based on type
        let problemKeys: string[] = [];
        switch (examType) {
            case 'comparison_chapter':
                this.trialProblems = masterySystem.generateComparisonExamProblems();
                break;
            case 'sub_atom':
                problemKeys = masterySystem.generateSubAtomExamProblems(target as SubAtomId);
                break;
            case 'fluency_challenge':
            case 'mastery_challenge':
                problemKeys = masterySystem.generateChallengeProblemKeys(target as SubAtomId, config.itemCount, examType);
                break;
            case 'band_gate':
                problemKeys = masterySystem.generateBandGateProblems(target as BandId);
                break;
            case 'band_mastery':
                problemKeys = masterySystem.generateBandMasteryProblems(target as BandId);
                break;
        }

        // Convert keys to MathProblems
        if (examType !== 'comparison_chapter') {
            this.trialProblems = [];
            for (const key of problemKeys) {
                const problem = this.mathEngine.generateProblemFromKey(key);
                if (problem) this.trialProblems.push(problem);
            }
        }

        // Ensure we have enough problems
        while (this.trialProblems.length < config.itemCount) {
            // Fallback: generate more problems from the same target
            if (examType === 'comparison_chapter') {
                this.trialProblems.push(...masterySystem.generateComparisonExamProblems()
                    .slice(0, config.itemCount - this.trialProblems.length));
                break;
            }
            const additionalKeys = examType === 'band_gate' || examType === 'band_mastery'
                ? masterySystem.generateBandGateProblems(target as BandId)
                : masterySystem.generateSubAtomExamProblems(target as SubAtomId);
            for (const key of additionalKeys) {
                if (this.trialProblems.length >= config.itemCount) break;
                const problem = this.mathEngine.generateProblemFromKey(key);
                if (problem && !this.trialProblems.some(p => p.id === problem.id)) {
                    this.trialProblems.push(problem);
                }
            }
            break; // Prevent infinite loop
        }

        this.initTrialState(config.itemCount, config.timePerItem);
    }

    /** Common initialization for trial/exam state */
    private initTrialState(totalProblems: number, timePerProblem: number): void {
        this.trialState = {
            isActive: true,
            currentProblemIndex: 0,
            totalProblems: totalProblems,
            timePerProblem: timePerProblem,
            timeRemainingForProblem: timePerProblem,
            correctCount: 0,
            wrongCount: 0,
            results: [],
            tier: 'none',
            phase: 'problem',
        };

        // Reset and center the numbered progress seals for this exam length.
        const progressHost = this.trialOverlay.getData('progressHost') as GuildHostLayout;
        const progressGap = Math.min(52, progressHost.width / Math.max(1, totalProblems - 1));
        const progressStartX = progressHost.x - ((totalProblems - 1) * progressGap) / 2;
        for (let i = 0; i < this.progressDots.length; i++) {
            if (i < totalProblems) {
                const x = progressStartX + i * progressGap;
                this.progressDots[i]
                    .setText(`${i + 1}`)
                    .setColor('#dcc79f')
                    .setPosition(x, progressHost.y + 1)
                    .setVisible(true);
                this.progressFrames[i]
                    .setPosition(x, progressHost.y)
                    .setFillStyle(0x2b190e, 1)
                    .setStrokeStyle(2, 0x8b633a, 1)
                    .setVisible(true);
            } else {
                this.progressDots[i].setVisible(false);
                this.progressFrames[i].setVisible(false);
            }
        }

        this.trialOverlay.setVisible(true);
        this.showCurrentProblem();

        // Per-problem timer
        this.trialTimer = this.time.addEvent({
            delay: 1000,
            callback: this.onProblemTick,
            callbackScope: this,
            loop: true,
        });
    }

    private showCurrentProblem(): void {
        const idx = this.trialState.currentProblemIndex;
        if (idx >= this.trialProblems.length) {
            this.endTrial();
            return;
        }

        this.currentTrialProblem = this.trialProblems[idx];
        this.trialState.timeRemainingForProblem = this.trialState.timePerProblem;
        this.trialState.phase = 'problem';
        this.problemStartTime = this.time.now;

        this.trialQuestionCounter.setText(`OTÁZKA ${idx + 1} Z ${this.trialState.totalProblems}`);
        this.problemText
            .setText(formatMathProblem(this.currentTrialProblem, 'question'))
            .setColor('#2f1a0d')
            .setVisible(true);
        this.comparisonProblemVisual?.destroy();
        this.comparisonProblemVisual = null;
        const comparisonMeta = this.currentTrialProblem.comparisonMeta;
        if (comparisonMeta) {
            this.comparisonProblemVisual = this.createComparisonExamVisual(this.currentTrialProblem);
            this.trialOverlay.add(this.comparisonProblemVisual.root);
            this.problemText.setVisible(false);
        }

        // Update choices — display symbols for comparison types
        const answers = this.currentTrialProblem.choices;
        const isComparison = this.currentTrialProblem.problemType === 'comparison' || this.currentTrialProblem.problemType === 'comparison_eq_vs_eq';
        const comparisonSymbols = ['<', '=', '>'];
        for (let i = 0; i < 3; i++) {
            const displayText = isComparison ? comparisonSymbols[answers[i]] : answers[i].toString();
            const button = this.answerButtons[i];
            (button.root.getData('comparisonGlyph') as Phaser.GameObjects.Image | undefined)?.destroy();
            button.root.setData('comparisonGlyph', null);
            button.setLabel(isComparison ? '' : displayText, 34).setEnabled(true);
            button.label.setColor('#3c210f');
            if (isComparison) {
                const glyph = comparisonGlyph(this, answers[i], true, 72 * COMPARISON_CHOICE_SCALE).setPosition(button.label.x, button.label.y);
                button.label.parentContainer.add(glyph);
                button.root.setData('comparisonGlyph', glyph);
            }
            this.answerButtonValues[i] = answers[i];
        }

        // Highlight the active seal without changing its geometry.
        this.progressDots[idx].setColor('#fff4ca');
        this.progressFrames[idx]
            .setFillStyle(this.accentColor, 1)
            .setStrokeStyle(3, 0xeafaff, 0.9);
    }

    private createComparisonExamVisual(problem: MathProblem): ComparisonProblemView {
        const host = (id: string): GuildHostLayout => {
            const object = this.sceneBuilder.get<Phaser.GameObjects.Container>(id)!;
            const definition = this.sceneBuilder.getElementDef(id)!;
            return { x: object.x - this.trialOverlay.x, y: object.y - this.trialOverlay.y,
                width: definition.width!, height: definition.height!, depth: object.depth };
        };
        return new ComparisonProblemView(this, problem, {
            left: host('trialComparisonLeft'), right: host('trialComparisonRight'), relation: host('trialComparisonRelation'),
        });
    }

    private revealComparisonExamVisual(_problem: MathProblem): void {
        this.comparisonProblemVisual?.reveal(true);
    }

    private onProblemTick(): void {
        // Timer ticks internally for time tracking only — no auto-fail, no visible UI
        if (this.trialState.phase !== 'problem') return;
    }

    private checkTrialAnswer(index: number): void {
        if (this.trialState.phase !== 'problem' || !this.currentTrialProblem) return;

        this.answerButtons.forEach(button => button.setEnabled(false));
        const value = this.answerButtonValues[index];
        this.recordTrialAnswer(value);
    }

    private recordTrialAnswer(playerAnswer: number | null): void {
        if (!this.currentTrialProblem) return;

        const problem = this.currentTrialProblem;
        const isCorrect = playerAnswer === problem.answer;
        if (problem.comparisonMeta && playerAnswer !== null && playerAnswer >= 0 && playerAnswer <= 2) {
            problem.comparisonMeta.selectedRelation = (['less', 'equal', 'greater'] as const)[playerAnswer];
        }
        const timeSpent = Math.max(0, this.time.now - this.problemStartTime) / 1000;
        const idx = this.trialState.currentProblemIndex;
        this.revealComparisonExamVisual(problem);

        // Record stats
        this.mathEngine.recordResultForProblem(problem.id, isCorrect);

        // Store result
        const result: TrialProblemResult = {
            problemId: problem.id,
            problem,
            wasCorrect: isCorrect,
            playerAnswer,
            correctAnswer: problem.answer,
            timeSpent,
        };
        this.trialState.results.push(result);

        // Update progress dot
        if (isCorrect) {
            this.trialState.correctCount++;
            this.progressDots[idx].setText('✓');
            this.progressDots[idx].setColor('#efffdc');
            this.progressFrames[idx]
                .setFillStyle(0x2f7333, 1)
                .setStrokeStyle(3, 0xbbe59f, 1);

            // A short ink-color acknowledgement keeps the parchment stable.
            this.problemText.setColor('#2f7333');
            this.time.delayedCall(400, () => {
                this.problemText.setColor('#2f1a0d');
                this.advanceToNextProblem();
            });
        } else {
            this.trialState.wrongCount++;
            this.progressDots[idx].setText('✕');
            this.progressDots[idx].setColor('#ffe3d8');
            this.progressFrames[idx]
                .setFillStyle(0x8d332a, 1)
                .setStrokeStyle(3, 0xf0a28d, 1);

            // Show feedback for wrong answer
            this.cameras.main.shake(200, 0.01);
            this.showFeedback(problem, playerAnswer);
        }
    }

    private advanceToNextProblem(): void {
        this.trialState.currentProblemIndex++;

        if (this.trialState.currentProblemIndex >= this.trialState.totalProblems) {
            this.endTrial();
        } else {
            this.showCurrentProblem();
        }
    }

    private endTrial(): void {
        this.trialState.isActive = false;
        this.trialState.phase = 'results';

        if (this.trialTimer) {
            this.trialTimer.remove();
            this.trialTimer = null;
        }
        this.trialOverlay.setVisible(false);

        // Record answers to mastery system
        if (this.currentMasteryExamType && this.currentMasteryExamTarget) {
            const masterySystem = MasterySystem.getInstance();
            const context = this.getMasteryExamContext();

            for (const result of this.trialState.results) {
                if (result.problem.comparisonMeta) {
                    masterySystem.recordComparisonSolve(
                        result.problem,
                        result.wasCorrect,
                        result.timeSpent * 1000,
                        false,
                    );
                } else if (result.problem.masteryKey) {
                    masterySystem.recordSolve(
                        result.problem.masteryKey,
                        result.wasCorrect,
                        result.timeSpent * 1000, // Convert seconds to ms
                        context
                    );
                }
            }

            // Apply mastery exam result
            this.applyMasteryExamResult();
        }

        // Tier is already set by applyMasteryExamResult() — no need to overwrite

        this.showResults();

        // Clear mastery exam state
        this.currentMasteryExamType = null;
        this.currentMasteryExamTarget = null;
    }

    /** Map exam type to mastery attempt context */
    private getMasteryExamContext(): 'exam' | 'fluency' | 'mastery_challenge' | 'band_gate' {
        switch (this.currentMasteryExamType) {
            case 'comparison_chapter': return 'exam';
            case 'sub_atom': return 'exam';
            case 'fluency_challenge': return 'fluency';
            case 'mastery_challenge': return 'mastery_challenge';
            case 'band_gate': return 'band_gate';
            case 'band_mastery': return 'band_gate'; // Same context
            default: return 'exam';
        }
    }

    /** Apply the result of a mastery exam to the mastery system */
    private applyMasteryExamResult(): void {
        const masterySystem = MasterySystem.getInstance();
        const target = this.currentMasteryExamTarget!;
        const correct = this.trialState.correctCount;

        // Reset stat gains
        this.masteryExamStatGains = { hpGain: 0, attackGain: 0, manaGain: 0 };

        switch (this.currentMasteryExamType) {
            case 'comparison_chapter': {
                const tier = masterySystem.computeExamTier(correct, 'comparison_chapter');
                const result = masterySystem.applyComparisonExamResult(correct, tier);
                this.trialState.tier = result.tier;
                this.masteryExamStatGains = { hpGain: result.hpGain, attackGain: result.attackGain, manaGain: result.manaGain };
                break;
            }
            case 'sub_atom': {
                const tier = masterySystem.computeExamTier(correct, 'sub_atom');
                const result = masterySystem.applyExamResult(target as SubAtomId, correct, tier);
                this.trialState.tier = result.tier;
                this.masteryExamStatGains = { hpGain: result.hpGain, attackGain: result.attackGain, manaGain: result.manaGain };
                break;
            }
            case 'fluency_challenge': {
                const result = masterySystem.applyFluencyResult(target as SubAtomId, correct);
                this.trialState.tier = result.passed ? 'gold' : 'none';
                this.masteryExamStatGains = { hpGain: result.hpGain, attackGain: result.attackGain, manaGain: result.manaGain };
                break;
            }
            case 'mastery_challenge': {
                const result = masterySystem.applyMasteryResult(target as SubAtomId, correct);
                this.trialState.tier = result.passed ? 'gold' : 'none';
                this.masteryExamStatGains = { hpGain: result.hpGain, attackGain: result.attackGain, manaGain: result.manaGain, shardGain: result.shardGain, coinGain: result.coinGain };
                break;
            }
            case 'band_gate': {
                const tier = masterySystem.computeExamTier(correct, 'band_gate');
                const result = masterySystem.applyBandGateResult(target as BandId, correct, tier);
                this.trialState.tier = result.tier;
                this.masteryExamStatGains = { hpGain: result.hpGain, attackGain: result.attackGain, manaGain: result.manaGain };
                break;
            }
            case 'band_mastery': {
                const result = masterySystem.applyBandMasteryResult(target as BandId, correct);
                this.trialState.tier = result.passed ? 'gold' : 'none';
                this.masteryExamStatGains = { hpGain: result.hpGain, attackGain: result.attackGain, manaGain: result.manaGain, shardGain: result.shardGain, coinGain: result.coinGain };
                break;
            }
        }

        // Save state
        this.saveState();
    }

}
