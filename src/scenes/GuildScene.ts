import Phaser from 'phaser';
import { GameStateManager } from '../systems/GameStateManager';
import { MathEngine } from '../systems/MathEngine';
import { ManaSystem } from '../systems/ManaSystem';
import { MathProblemDef, ProblemStats, MathProblem, TrialState, TrialProblemResult, TrialTier, ExamType, ExamConfig, SubAtomId, BandId, EXAM_CONFIGS } from '../types';
import { MasterySystem } from '../systems/MasterySystem';
import { SceneDebugger } from '../systems/SceneDebugger';
import { SceneBuilder } from '../systems/SceneBuilder';
import { TrialFeedbackVisualizer } from '../ui/TrialFeedbackVisualizer';
import { formatMathProblem } from '../utils/formatMathProblem';
import { CoopSwitchUI } from '../ui/CoopSwitchUI';
import { ExamsOverlay } from '../ui/ExamsOverlay';
import { MasteryMapOverlay } from '../ui/MasteryMapOverlay';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { CoopSessionManager } from '../systems/CoopSessionManager';

const ROW_HEIGHT = 28;
const VISIBLE_ROWS = 8;
const MANA_COLLECTION_PLAY_COST = 3;

export class GuildScene extends Phaser.Scene {
    private gameState!: GameStateManager;
    private mathEngine!: MathEngine;
    private problemList: Array<MathProblemDef & { stats: ProblemStats }> = [];
    private scrollOffset: number = 0;
    private listContainer!: Phaser.GameObjects.Container;
    private listPanel!: Phaser.GameObjects.Container;

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
    private trialStartButton!: Phaser.GameObjects.Container;
    private timerText!: Phaser.GameObjects.Text;
    private timerBar!: Phaser.GameObjects.Graphics;
    private timerFrame!: Phaser.GameObjects.Image;
    private timerBg!: Phaser.GameObjects.Rectangle;
    private problemText!: Phaser.GameObjects.Text;
    private answerButtonBgs: Phaser.GameObjects.Rectangle[] = [];
    private answerButtonTexts: Phaser.GameObjects.Text[] = [];
    private answerButtonValues: number[] = [0, 0, 0];
    private progressDots: Phaser.GameObjects.Text[] = [];
    private feedbackOverlay!: Phaser.GameObjects.Container;
    private feedbackVisualizer: TrialFeedbackVisualizer | null = null;
    private resultsOverlay!: Phaser.GameObjects.Container;
    private overviewOverlay!: Phaser.GameObjects.Container;
    private actionButtonsBottomY: number = 430;

    // Current trial level (may differ from player level on retry)
    private currentTrialLevel: number = 0;

    // Mastery exam state (used when taking mastery-system exams)
    private currentMasteryExamType: ExamType | null = null;
    private currentMasteryExamTarget: SubAtomId | BandId | null = null;
    private masteryExamStatGains: { hpGain: number; attackGain: number; manaGain: number; shardGain?: number; coinGain?: number } = { hpGain: 0, attackGain: 0, manaGain: 0 };

    // Info overlays
    private examsOverlay!: ExamsOverlay;
    private masteryMapOverlay!: MasteryMapOverlay;

    // Universal debugger
    private debugger!: SceneDebugger;

    // Scene Builder
    private sceneBuilder!: SceneBuilder;

    // UI references for debug repositioning
    private titleText!: Phaser.GameObjects.Text;
    private statsContainer!: Phaser.GameObjects.Container;
    private resultsTableImage!: Phaser.GameObjects.Image;
    private backButtonContainer!: Phaser.GameObjects.Container;
    private totalStatsPanel!: Phaser.GameObjects.Container;
    private collectButtonContainer!: Phaser.GameObjects.Container;
    private manaCollectionButton: Phaser.GameObjects.Container | null = null;

    constructor() {
        super({ key: 'GuildScene' });
    }

    create(): void {
        this.gameState = GameStateManager.getInstance();

        // Set player level in registry for MathEngine's adaptive difficulty
        const player = this.gameState.getPlayer();
        this.registry.set('playerLevel', player.level);

        this.mathEngine = new MathEngine(this.registry);
        // Use ALL problems ever attempted, not just current level pool
        this.problemList = this.mathEngine.getAllProblemsWithStats();
        this.scrollOffset = 0;

        // Initialize SceneBuilder - this creates all elements from scenes.json
        this.sceneBuilder = new SceneBuilder(this);
        this.sceneBuilder.buildScene();

        // Co-op: add player switch UI
        new CoopSwitchUI(this, 300, 640);

        // Retrieve references from SceneBuilder (positions come from scenes.json)
        this.titleText = this.sceneBuilder.get('title') as Phaser.GameObjects.Text;
        this.backButtonContainer = this.sceneBuilder.get('backButton') as Phaser.GameObjects.Container;
        this.resultsTableImage = this.sceneBuilder.get('resultsTable') as Phaser.GameObjects.Image;

        // Get positions from SceneBuilder for complex UI components
        // Cast to Container to access x/y properties (all game objects have these via Transform component)
        const statsPanel = this.sceneBuilder.get('statsPanel') as Phaser.GameObjects.Container | undefined;
        const totalStatsPanel = this.sceneBuilder.get('totalStatsPanel') as Phaser.GameObjects.Container | undefined;
        const collectButton = this.sceneBuilder.get('collectButton') as Phaser.GameObjects.Container | undefined;
        // Hide the sceneBuilder-built collectButton - we create a dynamic one
        collectButton?.setVisible(false);

        // Get depth directly from scene-layouts.json overrides (not from game object which uses scenes.json)
        const statsPanelDepth = this.sceneBuilder.getLayoutOverride('statsPanel')?.depth ?? 10;
        const resultsTableDepth = this.sceneBuilder.getLayoutOverride('resultsTable')?.depth ?? 10;
        const totalStatsPanelDepth = this.sceneBuilder.getLayoutOverride('totalStatsPanel')?.depth ?? 15;
        const collectButtonDepth = this.sceneBuilder.getLayoutOverride('collectButton')?.depth ?? 15;

        // Create complex UI components using positions and depths from JSON
        this.createStatsSummary(statsPanel?.x ?? 880, statsPanel?.y ?? 110, statsPanelDepth);
        this.createListPanel(resultsTableDepth);
        this.createTotalStats(
            totalStatsPanel?.x ?? 800,
            totalStatsPanel?.y ?? 650,
            collectButton?.x ?? 950,
            totalStatsPanelDepth,
            collectButtonDepth
        );
        this.createTrialUI();

        // Create info overlays and their buttons
        this.examsOverlay = new ExamsOverlay(this);
        this.masteryMapOverlay = new MasteryMapOverlay(this);
        this.createInfoButtons();

        // Setup universal debugger
        this.setupDebugger();

        // Mouse wheel scrolling
        this.input.on('wheel', (_pointer: any, _gameObjects: any, _deltaX: number, deltaY: number) => {
            this.scroll(deltaY > 0 ? 1 : -1);
        });

        // Touch-drag scrolling for mobile
        this.setupTouchScroll();
    }

    private setupTouchScroll(): void {
        let lastPointerY = 0;
        let isScrollDragging = false;

        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            const panelBounds = this.listPanel.getBounds();
            if (panelBounds.contains(pointer.x, pointer.y)) {
                const hitObjects = this.input.hitTestPointer(pointer);
                if (hitObjects.length === 0) {
                    lastPointerY = pointer.y;
                    isScrollDragging = true;
                }
            }
        });

        this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
            if (!isScrollDragging) return;
            const delta = lastPointerY - pointer.y;
            if (Math.abs(delta) > 10) {
                this.scroll(delta > 0 ? 1 : -1);
                lastPointerY = pointer.y;
            }
        });

        this.input.on('pointerup', () => { isScrollDragging = false; });
    }

    private createStatsSummary(x: number, y: number, depth: number): void {
        const player = this.gameState.getPlayer();
        const masteryPct = this.mathEngine.getMasteryPercentage();
        const poolCycle = this.mathEngine.getPoolCycle();

        this.statsContainer = this.add.container(x, y);
        this.statsContainer.setDepth(depth);

        // Background panel
        const bg = this.add.rectangle(0, 0, 300, 50, 0x000000, 0.6)
            .setStrokeStyle(2, 0x4488aa);
        this.statsContainer.add(bg);

        const statsText = this.add.text(0, 0,
            `ÚROVEŇ: ${player.level}   |   CYKLUS: ${poolCycle + 1}   |   ${masteryPct}%`,
            {
                fontSize: '16px',
                fontFamily: 'Arial, sans-serif',
                color: '#ffffff'
            }).setOrigin(0.5);
        this.statsContainer.add(statsText);
    }

    private createListPanel(depth: number): void {
        // Get listPanel position from scene-layouts.json if available
        // Falls back to resultsTable position + offset if not defined
        const listPanelLayout = this.sceneBuilder.getLayoutOverride('listPanel');
        const tableX = this.resultsTableImage?.x ?? 800;
        const tableY = this.resultsTableImage?.y ?? 380;

        // Use layout position if available, otherwise calculate from resultsTable
        const panelX = listPanelLayout?.x ?? (tableX + 80);
        const panelY = listPanelLayout?.y ?? tableY;

        // List panel container
        this.listPanel = this.add.container(panelX, panelY);
        this.listPanel.setDepth(depth);

        // Headers
        const headerText = this.add.text(-148, -150, 'PŘÍKLAD', {
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            color: '#5a4a3a',
            fontStyle: 'bold'
        }).setOrigin(0, 0.5);
        this.listPanel.add(headerText);

        const correctHeader = this.add.text(42, -150, '✓', {
            fontSize: '18px',
            fontFamily: 'Arial, sans-serif',
            color: '#228822'
        }).setOrigin(0.5);
        this.listPanel.add(correctHeader);

        const wrongHeader = this.add.text(92, -150, '✗', {
            fontSize: '18px',
            fontFamily: 'Arial, sans-serif',
            color: '#882222'
        }).setOrigin(0.5);
        this.listPanel.add(wrongHeader);

        // List container
        this.listContainer = this.add.container(0, 0);
        this.listPanel.add(this.listContainer);

        // Mask - use panel position (not table position) to properly include diamond slots
        // Diamond slots are at x offsets -196 to -160, so mask needs to start before that
        const maskLeft = panelX - 220;  // Include diamond area with some margin
        const maskTop = panelY - 135;
        const maskWidth = 400;  // Wider to include all content
        const maskHeight = VISIBLE_ROWS * ROW_HEIGHT + 35;  // Extra height to show all 8 rows fully
        const maskShape = this.make.graphics({ x: 0, y: 0, add: false });
        maskShape.fillStyle(0xffffff);
        maskShape.fillRect(maskLeft, maskTop, maskWidth, maskHeight);
        const mask = maskShape.createGeometryMask();
        this.listContainer.setMask(mask);

        // Render list items
        this.renderList();

        // Scroll buttons
        this.createScrollButtons();
    }

    private renderList(): void {
        this.listContainer.removeAll(true);

        // Sort problems by correct count (descending)
        const sortedProblems = [...this.problemList].sort((a, b) => {
            return b.stats.correctCount - a.stats.correctCount;
        });

        // Start below header
        const startY = -100 + ROW_HEIGHT / 2;

        for (let i = 0; i < sortedProblems.length; i++) {
            const problem = sortedProblems[i];
            const y = startY + i * ROW_HEIGHT - this.scrollOffset * ROW_HEIGHT;

            // Mana slots (changed from diamond slots)
            const correct = problem.stats.correctCount;
            const collected = problem.stats.manaCollected || 0;
            const thresholds = [5, 10, 20];

            for (let d = 0; d < 3; d++) {
                const threshold = thresholds[d];
                const slotX = -160 - (2 - d) * 18;

                let symbol: string;
                let color: string;

                if (correct >= threshold) {
                    if (collected > d) {
                        // Already collected - gray
                        symbol = '⚡';
                        color = '#666666';
                    } else {
                        // Available to collect - bright cyan
                        symbol = '⚡';
                        color = '#44ffff';
                    }
                } else {
                    // Not yet reached - dim
                    symbol = '○';
                    color = '#444444';
                }

                const slot = this.add.text(slotX, y, symbol, {
                    fontSize: '14px',
                    fontFamily: 'Arial, sans-serif',
                    color: color,
                }).setOrigin(0.5);
                this.listContainer.add(slot);
            }

            // Problem text — question mode for comparison/missing (shows ○ and ?), answer mode for standard (shows result)
            const reviewMode = (problem.problemType === 'comparison' || problem.problemType === 'comparison_eq_vs_eq' || problem.problemType === 'missing_operand')
                ? 'question' : 'answer';
            const problemText = formatMathProblem(problem, reviewMode);
            const txt = this.add.text(-120, y, problemText, {
                fontSize: '16px',
                fontFamily: 'Arial, sans-serif',
                color: '#3a2a1a',
                fontStyle: 'bold'
            }).setOrigin(0, 0.5);
            this.listContainer.add(txt);

            // Correct count
            const correctTxt = this.add.text(70, y, correct.toString(), {
                fontSize: '16px',
                fontFamily: 'Arial, sans-serif',
                color: '#228822',
                fontStyle: 'bold'
            }).setOrigin(0.5);
            this.listContainer.add(correctTxt);

            // Wrong count
            const wrong = problem.stats.wrongCount;
            const wrongTxt = this.add.text(120, y, wrong.toString(), {
                fontSize: '16px',
                fontFamily: 'Arial, sans-serif',
                color: '#882222',
                fontStyle: 'bold'
            }).setOrigin(0.5);
            this.listContainer.add(wrongTxt);
        }
    }

    private createScrollButtons(): void {
        const maxScroll = Math.max(0, this.problemList.length - VISIBLE_ROWS);
        if (maxScroll <= 0) return;

        // Up button
        const upBtn = this.add.text(155, -100, '▲', {
            fontSize: '28px',
            fontFamily: 'Arial, sans-serif',
            color: '#5a4a3a'
        }).setOrigin(0.5).setInteractive({
            hitArea: new Phaser.Geom.Rectangle(-22, -22, 44, 44),
            hitAreaCallback: Phaser.Geom.Rectangle.Contains,
            useHandCursor: true
        });

        upBtn.on('pointerover', () => upBtn.setColor('#8a6a4a'));
        upBtn.on('pointerout', () => upBtn.setColor('#5a4a3a'));
        upBtn.on('pointerdown', () => this.scroll(-3));
        this.listPanel.add(upBtn);

        // Down button
        const downBtn = this.add.text(155, 100, '▼', {
            fontSize: '28px',
            fontFamily: 'Arial, sans-serif',
            color: '#5a4a3a'
        }).setOrigin(0.5).setInteractive({
            hitArea: new Phaser.Geom.Rectangle(-22, -22, 44, 44),
            hitAreaCallback: Phaser.Geom.Rectangle.Contains,
            useHandCursor: true
        });

        downBtn.on('pointerover', () => downBtn.setColor('#8a6a4a'));
        downBtn.on('pointerout', () => downBtn.setColor('#5a4a3a'));
        downBtn.on('pointerdown', () => this.scroll(3));
        this.listPanel.add(downBtn);

        // Scroll info
        const scrollInfo = this.add.text(155, 0,
            `${Math.min(this.problemList.length, VISIBLE_ROWS)}/${this.problemList.length}`, {
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            color: '#7a6a5a'
        }).setOrigin(0.5);
        this.listPanel.add(scrollInfo);
        this.data.set('scrollInfo', scrollInfo);
    }

    private scroll(delta: number): void {
        const maxScroll = Math.max(0, this.problemList.length - VISIBLE_ROWS);
        const oldOffset = this.scrollOffset;
        this.scrollOffset = Phaser.Math.Clamp(this.scrollOffset + delta, 0, maxScroll);

        if (oldOffset !== this.scrollOffset) {
            this.renderList();

            const scrollInfo = this.data.get('scrollInfo') as Phaser.GameObjects.Text;
            if (scrollInfo) {
                const start = this.scrollOffset + 1;
                const end = Math.min(this.scrollOffset + VISIBLE_ROWS, this.problemList.length);
                scrollInfo.setText(`${start}-${end}/${this.problemList.length}`);
            }
        }
    }

    private createTotalStats(x: number, y: number, _collectX: number, panelDepth: number, buttonDepth: number): void {
        const stats = this.mathEngine.getStats();
        const player = this.gameState.getPlayer();

        const allTimeTotal = stats.totalAttempts;
        const allTimeCorrect = stats.correctAnswers;
        const allTimeWrong = allTimeTotal - allTimeCorrect;
        const todayProblems = stats.dailyAttempts;
        const manaCount = ManaSystem.getMana(player);

        // === Stats panel ===
        this.totalStatsPanel = this.add.container(x, y);
        this.totalStatsPanel.setDepth(panelDepth);

        const bg = this.add.rectangle(0, 0, 340, 70, 0x000000, 0.85)
            .setStrokeStyle(1, 0x5a4a3a);
        this.totalStatsPanel.add(bg);

        // Single-line daily + all-time
        this.totalStatsPanel.add(this.add.text(0, -18,
            `Dnes: ${todayProblems}  |  Celkem: ${allTimeTotal}  (✓${allTimeCorrect}  ✗${allTimeWrong})`, {
            fontSize: '12px', fontFamily: 'Arial, sans-serif', color: '#cccccc',
        }).setOrigin(0.5));

        // Mana line
        this.totalStatsPanel.add(this.add.text(0, 6,
            `⚡ Mana: ${manaCount}`, {
            fontSize: '13px', fontFamily: 'Arial, sans-serif', color: '#44ffff',
        }).setOrigin(0.5));

        // === Action row below stats: collect + mana minigame side by side ===
        const actionY = y + 55;

        // Count collectable mana
        let collectableMana = 0;
        const thresholds = [5, 10, 20];
        for (const problem of this.problemList) {
            const correct = problem.stats.correctCount;
            const collected = problem.stats.manaCollected || 0;
            for (let d = 0; d < 3; d++) {
                if (correct >= thresholds[d] && collected <= d) {
                    collectableMana++;
                }
            }
        }

        // Collect mana button (left)
        this.collectButtonContainer = this.add.container(x - 55, actionY);
        this.collectButtonContainer.setDepth(buttonDepth);

        if (collectableMana > 0) {
            const btnBg = this.add.rectangle(0, 0, 150, 36, 0x2288aa)
                .setStrokeStyle(1, 0x44aacc);
            const btnText = this.add.text(0, 0, `⚡ Sbírat (${collectableMana})`, {
                fontSize: '13px', fontFamily: 'Arial, sans-serif',
                color: '#ffffff', fontStyle: 'bold',
            }).setOrigin(0.5);

            this.collectButtonContainer.add([btnBg, btnText]);

            btnBg.setInteractive({ useHandCursor: true })
                .on('pointerover', () => btnBg.setFillStyle(0x3399bb))
                .on('pointerout', () => btnBg.setFillStyle(0x2288aa))
                .on('pointerdown', () => this.collectMana());
        }

        // Mana Collection minigame button (right)
        this.createManaCollectionButton(x + 115, actionY, buttonDepth);
    }

    private collectMana(): void {
        const collectedCount = this.mathEngine.collectAllMana();

        if (collectedCount > 0) {
            const player = this.gameState.getPlayer();
            ManaSystem.add(player, collectedCount);
            this.gameState.save();

            this.showCollectionAnimation(collectedCount);
            this.problemList = this.mathEngine.getAllProblemsWithStats();
            this.scene.restart();
        }
    }

    private showCollectionAnimation(count: number): void {
        const floatText = this.add.text(800, 620, `+${count} ⚡`, {
            fontSize: '28px',
            fontFamily: 'Arial, sans-serif',
            color: '#44ffff',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5).setDepth(1000);

        this.tweens.add({
            targets: floatText,
            y: floatText.y - 80,
            alpha: 0,
            scale: 1.3,
            duration: 1500,
            ease: 'Power2',
            onComplete: () => floatText.destroy()
        });
    }

    private createInfoButtons(): void {
        const y = this.actionButtonsBottomY + 15;

        // "ZKOUŠKY" programmatic button
        this.createInfoButton(200, y, 'ZKOUŠKY', () => this.examsOverlay.show());

        // "MISTROVSTVÍ" uses the template Mastery button from scenes.json
        const masteryBtn = this.sceneBuilder.get<Phaser.GameObjects.Container>('masteryButton');
        if (masteryBtn) {
            this.sceneBuilder.bindClick('masteryButton', () => this.masteryMapOverlay.show());
        }
    }

    private createInfoButton(x: number, y: number, label: string, onClick: () => void): void {
        const container = this.add.container(x, y).setDepth(50);

        const bg = this.add.rectangle(0, 0, 95, 32, 0x3a3a5a)
            .setStrokeStyle(1, 0x5a5a7a);
        const text = this.add.text(0, 0, label, {
            fontSize: '11px',
            fontFamily: 'Arial, sans-serif',
            color: '#aaaacc',
            fontStyle: 'bold',
        }).setOrigin(0.5);

        container.add([bg, text]);

        bg.setInteractive({ useHandCursor: true })
            .on('pointerover', () => { bg.setFillStyle(0x4a4a6a); text.setColor('#ffffff'); })
            .on('pointerout', () => { bg.setFillStyle(0x3a3a5a); text.setColor('#aaaacc'); })
            .on('pointerdown', onClick);
    }

    private setupDebugger(): void {
        this.debugger = new SceneDebugger(this, 'GuildScene');
        // Register elements
    }

    // ============ TRIAL MODE (4-phase system) ============

    private createTrialUI(): void {
        const isCoopReadOnly = CoopSessionManager.getInstance().isCoopActive();
        const availableExams = MasterySystem.getInstance().getAvailableExams();

        const trialOverlayEl = this.sceneBuilder.get('trialOverlay') as Phaser.GameObjects.Container | undefined;
        const overlayX = trialOverlayEl?.x ?? 640;
        const overlayY = trialOverlayEl?.y ?? 360;

        // === Dynamic button stacking ===
        const btnX = 200;
        let nextY = 380;
        const btnSpacing = 50;
        const btnColor = 0x2a5a2a;
        const btnHoverColor = 0x3a7a3a;
        const btnStrokeColor = 0x4a8a4a;

        if (isCoopReadOnly) {
            this.trialStartButton = this.add.container(btnX, nextY).setVisible(false);

            const note = this.add.text(btnX, nextY, [
                'CO-OP REŽIM',
                'Zkoušky a katakomby jsou zde jen pro přehled.',
                'Postup do Plynulosti a Mistrovství se zapisuje automaticky po soubojích.',
            ].join('\n'), {
                fontSize: '15px',
                fontFamily: 'Arial, sans-serif',
                color: '#c8d6e5',
                align: 'left',
                lineSpacing: 5,
                stroke: '#000000',
                strokeThickness: 3,
            }).setOrigin(0, 0);

            nextY += note.height + 12;
        } else {
            // Exam button (sub_atom, band_gate, band_mastery)
            const standardExam = availableExams.find(
                e => e.type !== 'fluency_challenge' && e.type !== 'mastery_challenge'
            );
            if (standardExam) {
                this.currentMasteryExamType = standardExam.type;
                this.currentMasteryExamTarget = standardExam.targetId as SubAtomId | BandId;

                this.trialStartButton = this.createActionButton(
                    btnX, nextY, 'ZAČÍT ZKOUŠKU', btnColor, btnHoverColor, btnStrokeColor,
                    () => this.showTrialOverview()
                );
                nextY += btnSpacing;
            } else {
                this.trialStartButton = this.add.container(btnX, nextY).setVisible(false);
            }

            // Catacomb button (fluency/mastery challenges)
            const catacombExam = availableExams.find(
                e => e.type === 'fluency_challenge' || e.type === 'mastery_challenge'
            );
            if (catacombExam) {
                this.createActionButton(
                    btnX, nextY, 'VSTUP DO KATAKOMB', btnColor, btnHoverColor, btnStrokeColor,
                    () => {
                        this.scene.start('CatacombTrialScene', {
                            examType: catacombExam.type,
                            subAtomId: catacombExam.targetId,
                            returnScene: 'GuildScene',
                        });
                    }
                );
                nextY += btnSpacing;
            }
        }

        this.actionButtonsBottomY = nextY;

        this.createOverviewOverlay(overlayX, overlayY);
        this.createTrialOverlay(overlayX, overlayY);
        this.createFeedbackOverlay(overlayX, overlayY);
        this.createResultsOverlay(overlayX, overlayY);
    }

    private createActionButton(
        x: number, y: number, label: string,
        color: number, hoverColor: number, strokeColor: number,
        onClick: () => void
    ): Phaser.GameObjects.Container {
        const container = this.add.container(x, y).setDepth(50);

        const bg = this.add.rectangle(0, 0, 200, 44, color)
            .setStrokeStyle(2, strokeColor);
        const text = this.add.text(0, 0, label, {
            fontSize: '15px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold',
        }).setOrigin(0.5);

        container.add([bg, text]);
        container.setSize(200, 44);

        bg.setInteractive({ useHandCursor: true })
            .on('pointerover', () => bg.setFillStyle(hoverColor))
            .on('pointerout', () => bg.setFillStyle(color))
            .on('pointerdown', onClick);

        return container;
    }

    /** Unlocked once player has earned 10+ coins total (not current balance). */
    private createManaCollectionButton(x: number, y: number, depth: number): void {
        const coop = CoopSessionManager.getInstance();
        const originalPlayer = coop.isCoopActive() ? coop.getActivePlayer() : 'A';
        let canAfford: boolean;

        if (coop.isCoopActive()) {
            coop.activatePlayerA();
            const canAffordA = ProgressionSystem.getTotalCoinValue(this.gameState.getPlayer().coins) >= MANA_COLLECTION_PLAY_COST;
            coop.activatePlayerB();
            const canAffordB = ProgressionSystem.getTotalCoinValue(this.gameState.getPlayer().coins) >= MANA_COLLECTION_PLAY_COST;

            if (originalPlayer === 'A') {
                coop.activatePlayerA();
            } else {
                coop.activatePlayerB();
            }

            canAfford = canAffordA && canAffordB;
        } else {
            const player = this.gameState.getPlayer();
            const totalCoins = ProgressionSystem.getTotalCoinValue(player.coins);

            // Gate: not available until player has gathered 10 coins
            if (totalCoins < 10) return;
            canAfford = totalCoins >= MANA_COLLECTION_PLAY_COST;
        }

        const btn = this.add.container(x, y).setDepth(depth);
        this.manaCollectionButton = btn;

        // Medieval-styled button: dark parchment with golden border and ornamental text
        const bg = this.add.rectangle(0, 0, 170, 52, 0x2a1f14)
            .setStrokeStyle(2, 0x8b6914);

        // Inner border for ornate double-frame effect
        const innerBorder = this.add.rectangle(0, 0, 160, 42, 0x000000, 0)
            .setStrokeStyle(1, 0x5a4a2a);

        const label = this.add.text(0, -5, '⚡ Sbírání many', {
            fontSize: '13px',
            fontFamily: 'Arial, sans-serif',
            color: canAfford ? '#d4aa44' : '#665533',
            fontStyle: 'bold',
        }).setOrigin(0.5);

        const costLabel = this.add.text(0, 14, coop.isCoopActive() ? '— 3 mince za hráče —' : '— 3 mince —', {
            fontSize: '10px',
            fontFamily: 'Arial, sans-serif',
            color: canAfford ? '#8b7840' : '#554422',
        }).setOrigin(0.5);

        btn.add([bg, innerBorder, label, costLabel]);

        if (canAfford) {
            bg.setInteractive({ useHandCursor: true })
                .on('pointerover', () => {
                    bg.setFillStyle(0x3d2e1c);
                    bg.setStrokeStyle(2, 0xccaa44);
                    label.setColor('#ffe066');
                })
                .on('pointerout', () => {
                    bg.setFillStyle(0x2a1f14);
                    bg.setStrokeStyle(2, 0x8b6914);
                    label.setColor('#d4aa44');
                })
                .on('pointerdown', () => {
                    this.scene.start('ManaCollectionScene', { returnScene: 'GuildScene' });
                });

            // Subtle golden glow pulse
            this.tweens.add({
                targets: label,
                alpha: 0.7,
                duration: 1200,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut',
            });
        }
    }

    // === Phase 1: Overview ===

    private createOverviewOverlay(x: number, y: number): void {
        this.overviewOverlay = this.add.container(x, y);
        this.overviewOverlay.setDepth(200);
        this.overviewOverlay.setVisible(false);

        const bg = this.add.rectangle(0, 0, 1280, 720, 0x000000, 0.92);
        this.overviewOverlay.add(bg);

        const title = this.add.text(0, -200, 'ZKOUŠKA HRDINY', {
            fontSize: '36px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffd700',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5);
        this.overviewOverlay.add(title);

        // Zyx dialog placeholder
        const dialog = this.add.text(0, -100, '', {
            fontSize: '18px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            align: 'center',
            wordWrap: { width: 500 }
        }).setOrigin(0.5);
        this.overviewOverlay.add(dialog);
        this.overviewOverlay.setData('dialog', dialog);

        // Test description placeholder
        const desc = this.add.text(0, 10, '', {
            fontSize: '16px',
            fontFamily: 'Arial, sans-serif',
            color: '#aaaaaa',
            align: 'center',
            wordWrap: { width: 500 }
        }).setOrigin(0.5);
        this.overviewOverlay.add(desc);
        this.overviewOverlay.setData('desc', desc);

        // Start button
        const startBg = this.add.rectangle(0, 120, 220, 60, 0x228822)
            .setStrokeStyle(3, 0x44aa44);
        this.overviewOverlay.add(startBg);
        this.overviewOverlay.setData('startBtnBg', startBg);

        const startText = this.add.text(0, 120, 'ZAČÍT ZKOUŠKU', {
            fontSize: '22px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.overviewOverlay.add(startText);
        this.overviewOverlay.setData('startBtnText', startText);

        startBg.setInteractive({ useHandCursor: true })
            .on('pointerover', () => startBg.setFillStyle(0x33aa33))
            .on('pointerout', () => startBg.setFillStyle(0x228822))
            .on('pointerdown', () => this.startTrial());
    }

    private showTrialOverview(): void {
        const examType = this.currentMasteryExamType;
        const examTarget = this.currentMasteryExamTarget;

        const dialog = this.overviewOverlay.getData('dialog') as Phaser.GameObjects.Text;
        dialog.setText('Ukaž mi, co už umíš!\nNeboj se, každou chybu si vysvětlíme.');

        const desc = this.overviewOverlay.getData('desc') as Phaser.GameObjects.Text;
        if (examType && examTarget) {
            const config = EXAM_CONFIGS[examType];
            const examLabel = MasterySystem.getInstance().getAvailableExams()
                .find(e => e.type === examType && e.targetId === examTarget)?.label || `Zkouška ${examTarget}`;
            const thresholdText = config.passThreshold
                ? `${config.passThreshold}+ správně = postup`
                : `${config.bronzeThreshold}+ správně = postup`;
            desc.setText(
                `${examLabel}\n\n` +
                `${config.itemCount} příkladů, ${config.timePerItem}s na každý\n` +
                thresholdText
            );
        }

        this.overviewOverlay.setVisible(true);
        this.trialState.phase = 'overview';
    }

    // === Phase 2: Problem display with per-problem timer ===

    private createTrialOverlay(x: number, y: number): void {
        this.trialOverlay = this.add.container(x, y);
        this.trialOverlay.setDepth(200);
        this.trialOverlay.setVisible(false);

        const bg = this.add.rectangle(0, 0, 1280, 720, 0x000000, 0.9);
        this.trialOverlay.add(bg);

        // Progress dots (dynamically sized at top)
        this.progressDots = [];
        const maxDots = 20; // Maximum possible exam items
        const dotsStartX = -((maxDots - 1) * 36) / 2;
        for (let i = 0; i < maxDots; i++) {
            const dot = this.add.text(dotsStartX + i * 36, -280, '○', {
                fontSize: '24px',
                fontFamily: 'Arial, sans-serif',
                color: '#666666',
            }).setOrigin(0.5);
            this.trialOverlay.add(dot);
            this.progressDots.push(dot);
        }

        // Timer bar area
        const overlayX = 640;
        const overlayY = 360;

        const timerFrameLayout = this.sceneBuilder.getLayoutOverride('timerFrame');
        const timerBarLayout = this.sceneBuilder.getLayoutOverride('timerBar');

        const frameX = (timerFrameLayout?.x ?? 640) - overlayX;
        const frameY = (timerFrameLayout?.y ?? 180) - overlayY;
        const frameScaleX = timerFrameLayout?.scaleX ?? timerFrameLayout?.scale ?? 0.178;
        const frameScaleY = timerFrameLayout?.scaleY ?? timerFrameLayout?.scale ?? 0.123;

        const barX = (timerBarLayout?.x ?? 640) - overlayX;
        const barY = (timerBarLayout?.y ?? 180) - overlayY;
        const barWidth = timerBarLayout?.width ?? 200;
        const barHeight = timerBarLayout?.height ?? 24;

        this.timerBg = this.add.rectangle(barX, barY, barWidth, barHeight, 0x333333);
        this.trialOverlay.add(this.timerBg);

        const barLeft = barX - barWidth / 2;
        const barTop = barY - barHeight / 2;
        this.timerBar = this.add.graphics();
        this.timerBar.setPosition(barLeft, barTop);
        this.timerBar.fillStyle(0x44aa44, 1);
        this.timerBar.fillRect(0, 0, barWidth, barHeight);
        this.trialOverlay.add(this.timerBar);

        this.timerBar.setData('barWidth', barWidth);
        this.timerBar.setData('barHeight', barHeight);

        this.timerFrame = this.add.image(frameX, frameY, 'ui-stone-bar-frame');
        this.timerFrame.setScale(frameScaleX, frameScaleY);
        this.trialOverlay.add(this.timerFrame);

        this.timerText = this.add.text(frameX, frameY, '', {
            fontSize: '24px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.trialOverlay.add(this.timerText);

        // Problem text
        this.problemText = this.add.text(0, 0, '', {
            fontSize: '64px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.trialOverlay.add(this.problemText);

        // Answer buttons
        const buttonY = 120;
        const buttonSpacing = 150;
        this.answerButtonBgs = [];
        this.answerButtonTexts = [];

        for (let i = 0; i < 3; i++) {
            const btnX = (i - 1) * buttonSpacing;

            const btnBg = this.add.rectangle(btnX, buttonY, 120, 80, 0x4466aa)
                .setStrokeStyle(3, 0x6688cc);
            this.trialOverlay.add(btnBg);
            this.answerButtonBgs.push(btnBg);

            const btnText = this.add.text(btnX, buttonY, '', {
                fontSize: '32px',
                fontFamily: 'Arial, sans-serif',
                color: '#ffffff',
                fontStyle: 'bold'
            }).setOrigin(0.5);
            this.trialOverlay.add(btnText);
            this.answerButtonTexts.push(btnText);

            const buttonIndex = i;
            btnBg.setInteractive({ useHandCursor: true })
                .on('pointerover', () => {
                    if (this.trialState.phase === 'problem') btnBg.setFillStyle(0x5577bb);
                })
                .on('pointerout', () => {
                    if (this.trialState.phase === 'problem') btnBg.setFillStyle(0x4466aa);
                })
                .on('pointerdown', () => this.checkTrialAnswer(buttonIndex));
        }
    }

    // === Phase 3: Feedback overlay ===

    private createFeedbackOverlay(x: number, y: number): void {
        this.feedbackOverlay = this.add.container(x, y);
        this.feedbackOverlay.setDepth(210);
        this.feedbackOverlay.setVisible(false);

        const bg = this.add.rectangle(0, 0, 1280, 720, 0x000000, 0.85);
        this.feedbackOverlay.add(bg);
    }

    private showFeedback(problem: MathProblem, _playerAnswer: number | null): void {
        this.trialState.phase = 'feedback';

        // Pause per-problem timer
        if (this.trialTimer) this.trialTimer.paused = true;

        // Clear previous feedback content (keep bg)
        while (this.feedbackOverlay.length > 1) {
            this.feedbackOverlay.removeAt(1, true);
        }

        // Destroy previous visualizer
        if (this.feedbackVisualizer) {
            this.feedbackVisualizer.destroy();
            this.feedbackVisualizer = null;
        }

        this.feedbackOverlay.setVisible(true);

        // Only show the equation — no text explanation (first-graders can barely read)
        const equationStr = formatMathProblem(problem, 'answer');

        const correctLabel = this.add.text(0, -250, equationStr, {
            fontSize: '36px',
            fontFamily: 'Arial, sans-serif',
            color: '#44ff44',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4,
        }).setOrigin(0.5);
        this.feedbackOverlay.add(correctLabel);

        // Visual counting animation (centered, large area)
        const visualContainer = this.add.container(0, 20);
        this.feedbackOverlay.add(visualContainer);

        // Show skip button immediately — changes to ROZUMÍM after animation
        const btnBg = this.add.rectangle(0, 200, 200, 50, 0x4466aa)
            .setStrokeStyle(2, 0x6688cc);
        this.feedbackOverlay.add(btnBg);

        const btnText = this.add.text(0, 200, 'PŘESKOČIT', {
            fontSize: '22px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.feedbackOverlay.add(btnText);

        btnBg.setAlpha(0);
        btnText.setAlpha(0);
        this.tweens.add({
            targets: [btnBg, btnText],
            alpha: 1,
            duration: 300,
            ease: 'Power2',
        });

        let animationDone = false;

        btnBg.setInteractive({ useHandCursor: true })
            .on('pointerover', () => btnBg.setFillStyle(0x5577bb))
            .on('pointerout', () => btnBg.setFillStyle(0x4466aa))
            .on('pointerdown', () => {
                animationDone = true;
                this.closeFeedback();
            });

        // Create visualizer — button changes to ROZUMÍM after animation completes
        const showTime = Date.now();
        this.feedbackVisualizer = new TrialFeedbackVisualizer(this, visualContainer, () => {
            if (animationDone) return;
            animationDone = true;
            const elapsed = Date.now() - showTime;
            const remaining = Math.max(0, 3000 - elapsed);
            this.time.delayedCall(remaining, () => {
                if (btnText.active) btnText.setText('ROZUMÍM');
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
        this.resultsOverlay = this.add.container(x, y);
        this.resultsOverlay.setDepth(200);
        this.resultsOverlay.setVisible(false);
    }

    private showResults(): void {
        // Clear previous results content
        this.resultsOverlay.removeAll(true);
        this.resultsOverlay.setVisible(true);
        this.trialState.phase = 'results';

        const bg = this.add.rectangle(0, 0, 1280, 720, 0x000000, 0.92);
        this.resultsOverlay.add(bg);

        const tier = this.trialState.tier;
        const correctCount = this.trialState.correctCount;

        // Tier display
        const tierConfig = this.getTierDisplay(tier);
        const title = this.add.text(0, -280, tierConfig.title, {
            fontSize: '36px',
            fontFamily: 'Arial, sans-serif',
            color: tierConfig.color,
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4,
        }).setOrigin(0.5);
        this.resultsOverlay.add(title);

        // Stars
        const stars = this.add.text(0, -230, tierConfig.stars, {
            fontSize: '36px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffd700',
        }).setOrigin(0.5);
        this.resultsOverlay.add(stars);

        // Score summary
        const score = this.add.text(0, -190, `${correctCount} / ${this.trialState.totalProblems} správně`, {
            fontSize: '20px',
            fontFamily: 'Arial, sans-serif',
            color: '#cccccc',
        }).setOrigin(0.5);
        this.resultsOverlay.add(score);

        // Problem review list (compact, 2 balanced columns)
        const results = this.trialState.results;
        const colWidth = 240;
        const rowH = 26;
        const startY = -140;
        const half = Math.ceil(results.length / 2);

        for (let i = 0; i < results.length; i++) {
            const r = results[i];
            const col = i < half ? -1 : 1;
            const row = i < half ? i : i - half;
            const px = col * (colWidth / 2);
            const py = startY + row * rowH;

            const icon = r.wasCorrect ? '✓' : '✗';
            const iconColor = r.wasCorrect ? '#44ff44' : '#ff4444';
            const pStr = formatMathProblem(r.problem, 'answer');

            const entry = this.add.text(px, py, `${icon} ${pStr}`, {
                fontSize: '16px',
                fontFamily: 'Arial, sans-serif',
                color: iconColor,
            }).setOrigin(0.5);
            this.resultsOverlay.add(entry);
        }

        // Position bottom elements below the problem list
        const listBottom = startY + half * rowH;

        // Show stat gains from mastery exam (already applied by applyMasteryExamResult)
        const player = this.gameState.getPlayer();
        this.gameState.save();
        this.registry.set('playerLevel', player.level);

        const gains = this.masteryExamStatGains;
        const hasGains = gains.hpGain > 0 || gains.attackGain > 0 || gains.manaGain > 0 || (gains.shardGain ?? 0) > 0 || (gains.coinGain ?? 0) > 0;

        let rewardText: string;
        if (tier !== 'none' && hasGains) {
            const parts: string[] = [`ÚROVEŇ: ${player.level}`];
            if (gains.hpGain > 0) parts.push(`HP: +${gains.hpGain}`);
            if (gains.attackGain > 0) parts.push(`ÚTOK: +${gains.attackGain}`);
            if (gains.manaGain > 0) parts.push(`MANA: +${gains.manaGain}`);
            if ((gains.shardGain ?? 0) > 0) parts.push(`KRYSTAL: +${gains.shardGain}`);
            if ((gains.coinGain ?? 0) > 0) parts.push(`MINCE: +${gains.coinGain}`);
            rewardText = parts.join('   ');
        } else if (tier !== 'none') {
            rewardText = `ÚROVEŇ: ${player.level}   POSTUP!`;
        } else {
            rewardText = 'Musíš to zkusit znovu — nedáš se!';
        }

        const rewardColor = tier !== 'none' ? '#ffd700' : '#aaaaaa';
        const rewards = this.add.text(0, listBottom + 20, rewardText, {
            fontSize: '18px',
            fontFamily: 'Arial, sans-serif',
            color: rewardColor,
            fontStyle: 'bold',
            align: 'center',
            wordWrap: { width: 500 },
        }).setOrigin(0.5);
        this.resultsOverlay.add(rewards);

        // Zyx encouragement
        const zyxMsg = this.getZyxMessage(tier);
        const zyxText = this.add.text(0, listBottom + 70, zyxMsg, {
            fontSize: '16px',
            fontFamily: 'Arial, sans-serif',
            color: '#88ccff',
            align: 'center',
            wordWrap: { width: 500 },
        }).setOrigin(0.5);
        this.resultsOverlay.add(zyxText);


        // Continue button
        const closeBg = this.add.rectangle(0, listBottom + 150, 220, 50, 0x444444)
            .setStrokeStyle(2, 0x666666);
        this.resultsOverlay.add(closeBg);

        const closeText = this.add.text(0, listBottom + 150, 'POKRAČOVAT', {
            fontSize: '22px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.resultsOverlay.add(closeText);

        closeBg.setInteractive({ useHandCursor: true })
            .on('pointerover', () => closeBg.setFillStyle(0x555555))
            .on('pointerout', () => closeBg.setFillStyle(0x444444))
            .on('pointerdown', () => {
                this.resultsOverlay.setVisible(false);
                this.scene.restart();
            });
    }

    private getTierDisplay(tier: TrialTier): { title: string; stars: string; color: string } {
        switch (tier) {
            case 'gold':   return { title: 'ZLATÁ ZKOUŠKA!', stars: '★ ★ ★', color: '#ffd700' };
            case 'silver': return { title: 'STŘÍBRNÁ ZKOUŠKA!', stars: '★ ★ ☆', color: '#c0c0c0' };
            case 'bronze': return { title: 'BRONZOVÁ ZKOUŠKA!', stars: '★ ☆ ☆', color: '#cd7f32' };
            default:       return { title: 'ZKOUŠKA NEÚSPĚŠNÁ', stars: '☆ ☆ ☆', color: '#ff4444' };
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
        this.trialProblems = [];
        for (const key of problemKeys) {
            const problem = this.mathEngine.generateProblemFromKey(key);
            if (problem) this.trialProblems.push(problem);
        }

        // Ensure we have enough problems
        while (this.trialProblems.length < config.itemCount) {
            // Fallback: generate more problems from the same target
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

        // Reset progress dots (show only the right number)
        for (let i = 0; i < this.progressDots.length; i++) {
            if (i < totalProblems) {
                this.progressDots[i].setText('○');
                this.progressDots[i].setColor('#666666');
                this.progressDots[i].setVisible(true);
            } else {
                this.progressDots[i].setVisible(false);
            }
        }
        // Re-center visible dots
        const dotsStartX = -((totalProblems - 1) * 36) / 2;
        for (let i = 0; i < totalProblems && i < this.progressDots.length; i++) {
            this.progressDots[i].setX(dotsStartX + i * 36);
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
        this.problemStartTime = Date.now();

        this.problemText.setText(formatMathProblem(this.currentTrialProblem, 'question'));

        // Hide timer — no visible countdown (time is tracked internally for tier only)
        this.timerBar.setVisible(false);
        this.timerText.setVisible(false);

        // Update choices — display symbols for comparison types
        const answers = this.currentTrialProblem.choices;
        const isComparison = this.currentTrialProblem.problemType === 'comparison' || this.currentTrialProblem.problemType === 'comparison_eq_vs_eq';
        const comparisonSymbols = ['<', '=', '>'];
        for (let i = 0; i < 3; i++) {
            const displayText = isComparison ? comparisonSymbols[answers[i]] : answers[i].toString();
            this.answerButtonTexts[i].setText(displayText);
            this.answerButtonValues[i] = answers[i];
            this.answerButtonBgs[i].setFillStyle(0x4466aa);
        }

        // Highlight current progress dot
        this.progressDots[idx].setText('●');
        this.progressDots[idx].setColor('#ffffff');

        this.updateTimerUI();
    }

    private onProblemTick(): void {
        // Timer ticks internally for time tracking only — no auto-fail, no visible UI
        if (this.trialState.phase !== 'problem') return;
    }

    private updateTimerUI(): void {
        const remaining = this.trialState.timeRemainingForProblem;
        this.timerText.setText(remaining.toString());

        const progress = remaining / this.trialState.timePerProblem;
        const fullBarWidth = this.timerBar.getData('barWidth') as number || 320;
        const barHeight = this.timerBar.getData('barHeight') as number || 55;
        const currentBarWidth = fullBarWidth * progress;
        const color = remaining <= 5 ? 0xff4444 : (remaining <= 10 ? 0xffaa44 : 0x44aa44);

        this.timerBar.clear();
        this.timerBar.fillStyle(color, 1);
        this.timerBar.fillRect(0, 0, currentBarWidth, barHeight);
    }

    private checkTrialAnswer(index: number): void {
        if (this.trialState.phase !== 'problem' || !this.currentTrialProblem) return;

        const value = this.answerButtonValues[index];
        this.recordTrialAnswer(value);
    }

    private recordTrialAnswer(playerAnswer: number | null): void {
        if (!this.currentTrialProblem) return;

        const problem = this.currentTrialProblem;
        const isCorrect = playerAnswer === problem.answer;
        const timeSpent = (Date.now() - this.problemStartTime) / 1000;
        const idx = this.trialState.currentProblemIndex;

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
            this.progressDots[idx].setColor('#44ff44');

            // Green flash on correct
            this.problemText.setColor('#44ff44');
            this.time.delayedCall(400, () => {
                this.problemText.setColor('#ffffff');
                this.advanceToNextProblem();
            });
        } else {
            this.trialState.wrongCount++;
            this.progressDots[idx].setText('✗');
            this.progressDots[idx].setColor('#ff4444');

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
                if (result.problem.masteryKey) {
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
            case 'sub_atom': return 'exam';
            case 'fluency_challenge': return 'fluency';
            case 'mastery_challenge': return 'mastery_challenge';
            case 'band_gate': return 'band_gate';
            case 'band_mastery': return 'band_gate'; // Same context
            default: return 'exam';
        }
    }

    /** Compute exam tier: bronze uses all correct, silver/gold require fast answers (≤15s) */
    private computeExamTier(correctCount: number, fastCorrectCount: number, config: ExamConfig): TrialTier {
        if (config.goldThreshold && fastCorrectCount >= config.goldThreshold) return 'gold';
        if (config.silverThreshold && fastCorrectCount >= config.silverThreshold) return 'silver';
        if (config.bronzeThreshold && correctCount >= config.bronzeThreshold) return 'bronze';
        return 'none';
    }

    /** Apply the result of a mastery exam to the mastery system */
    private applyMasteryExamResult(): void {
        const masterySystem = MasterySystem.getInstance();
        const target = this.currentMasteryExamTarget!;
        const correct = this.trialState.correctCount;

        // Count fast correct answers (within 15s) for silver/gold tier
        const fastCorrect = this.trialState.results
            .filter(r => r.wasCorrect && r.timeSpent <= 15)
            .length;

        // Reset stat gains
        this.masteryExamStatGains = { hpGain: 0, attackGain: 0, manaGain: 0 };

        switch (this.currentMasteryExamType) {
            case 'sub_atom': {
                const tier = this.computeExamTier(correct, fastCorrect, EXAM_CONFIGS.sub_atom);
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
                const tier = this.computeExamTier(correct, fastCorrect, EXAM_CONFIGS.band_gate);
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
        this.gameState.save();
    }

}
