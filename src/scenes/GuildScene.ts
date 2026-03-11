import Phaser from 'phaser';
import { GameStateManager } from '../systems/GameStateManager';
import { MathEngine } from '../systems/MathEngine';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { ManaSystem } from '../systems/ManaSystem';
import { MathProblemDef, ProblemStats, MathProblem, TrialState, TrialProblemResult, TrialTier, TRIAL_TOTAL_PROBLEMS, TRIAL_TIME_PER_PROBLEM, TRIAL_LEVEL_DESCRIPTIONS } from '../types';
import { SceneDebugger } from '../systems/SceneDebugger';
import { SceneBuilder } from '../systems/SceneBuilder';
import { TrialFeedbackVisualizer } from '../ui/TrialFeedbackVisualizer';

const ROW_HEIGHT = 28;
const VISIBLE_ROWS = 8;

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
        totalProblems: TRIAL_TOTAL_PROBLEMS,
        timePerProblem: TRIAL_TIME_PER_PROBLEM,
        timeRemainingForProblem: TRIAL_TIME_PER_PROBLEM,
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
    private historyOverlay!: Phaser.GameObjects.Container;
    private historyButton!: Phaser.GameObjects.Container;

    // Current trial level (may differ from player level on retry)
    private currentTrialLevel: number = 0;

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

            // Problem text
            const problemText = `${problem.operand1} ${problem.operator} ${problem.operand2} = ${problem.answer}`;
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

    private createTotalStats(x: number, y: number, collectX: number, panelDepth: number, buttonDepth: number): void {
        const stats = this.mathEngine.getStats();
        const player = this.gameState.getPlayer();

        const allTimeTotal = stats.totalAttempts;
        const allTimeCorrect = stats.correctAnswers;
        const allTimeWrong = allTimeTotal - allTimeCorrect;
        const todayProblems = stats.dailyAttempts;

        this.totalStatsPanel = this.add.container(x, y);
        this.totalStatsPanel.setDepth(panelDepth);
        const statsPanel = this.totalStatsPanel;

        // Background
        const bg = this.add.rectangle(0, 0, 350, 80, 0x000000, 0.85)
            .setStrokeStyle(2, 0x5a4a3a);
        statsPanel.add(bg);

        // Daily stats header
        const dailyHeader = this.add.text(-60, -25, 'DNES:', {
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffd700',
            fontStyle: 'bold'
        }).setOrigin(0, 0.5);
        statsPanel.add(dailyHeader);

        const dailyText = this.add.text(40, -25, `${todayProblems} příkladů dnes`, {
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff'
        }).setOrigin(0, 0.5);
        statsPanel.add(dailyText);

        // All-time stats header
        const allTimeHeader = this.add.text(-60, 10, 'CELKEM:', {
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffd700',
            fontStyle: 'bold'
        }).setOrigin(0, 0.5);
        statsPanel.add(allTimeHeader);

        // All-time stats
        const allTimeText = this.add.text(40, 10,
            `${allTimeTotal} příkladů  ✓${allTimeCorrect}  ✗${allTimeWrong}`, {
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff'
        }).setOrigin(0, 0.5);
        statsPanel.add(allTimeText);

        // Mana display
        const manaCount = ManaSystem.getMana(player);
        const manaText = this.add.text(20, 30,
            `⚡ Mana: ${manaCount}`, {
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            color: '#44ffff'
        }).setOrigin(0, 0.5);
        statsPanel.add(manaText);

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

        // Collect button
        this.collectButtonContainer = this.add.container(collectX, y);
        this.collectButtonContainer.setDepth(buttonDepth);

        if (collectableMana > 0) {
            const btnBg = this.add.rectangle(0, 0, 140, 48, 0x2288aa)
                .setStrokeStyle(2, 0x44aacc);

            const btnText = this.add.text(0, 0, `⚡ SBÍRAT MANU (${collectableMana})`, {
                fontSize: '14px',
                fontFamily: 'Arial, sans-serif',
                color: '#ffffff',
                fontStyle: 'bold'
            }).setOrigin(0.5);

            // Add bg first, then text on top (consistent pattern)
            this.collectButtonContainer.add(btnBg);
            this.collectButtonContainer.add(btnText);

            btnBg.setInteractive({ useHandCursor: true })
                .on('pointerover', () => btnBg.setFillStyle(0x3399bb))
                .on('pointerout', () => btnBg.setFillStyle(0x2288aa))
                .on('pointerdown', () => this.collectMana());

            this.tweens.add({
                targets: this.collectButtonContainer,
                scaleX: 1.05,
                scaleY: 1.05,
                duration: 500,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        } else {
            const infoText = this.add.text(0, 0, '(5✓ = ⚡)', {
                fontSize: '14px',
                fontFamily: 'Arial, sans-serif',
                color: '#888888'
            }).setOrigin(0.5);
            this.collectButtonContainer.add(infoText);
        }
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

    private setupDebugger(): void {
        this.debugger = new SceneDebugger(this, 'GuildScene');
        // Register elements
    }

    // ============ TRIAL MODE (4-phase system) ============

    private createTrialUI(): void {
        const player = this.gameState.getPlayer();
        const trialStatus = ProgressionSystem.canStartTrial(player);

        // Get positions from SceneBuilder
        const trialStartButtonEl = this.sceneBuilder.get('trialStartButton') as Phaser.GameObjects.Container | undefined;
        const trialOverlayEl = this.sceneBuilder.get('trialOverlay') as Phaser.GameObjects.Container | undefined;
        const trialDialogEl = this.sceneBuilder.get('trialDialog') as Phaser.GameObjects.Container | undefined;

        const startBtnX = trialStartButtonEl?.x ?? 200;
        const startBtnY = trialStartButtonEl?.y ?? 420;
        const overlayX = trialOverlayEl?.x ?? 640;
        const overlayY = trialOverlayEl?.y ?? 360;
        const dialogX = trialDialogEl?.x ?? 200;
        const dialogY = trialDialogEl?.y ?? 310;

        this.trialStartButton = this.add.container(startBtnX, startBtnY);
        this.trialStartButton.setDepth(50);

        // Determine button appearance based on trial status
        const isFailRetry = trialStatus.reason === 'retry_fail' || trialStatus.reason === 'blocked_by_fail';
        const btnColor = isFailRetry ? 0x882222 : 0x228822;
        const btnHoverColor = isFailRetry ? 0xaa3333 : 0x33aa33;
        const btnStrokeColor = isFailRetry ? 0xaa4444 : 0x44aa44;
        const btnLabel = isFailRetry ? 'OPAKOVAT ZKOUŠKU' : 'ZAČÍT ZKOUŠKU';

        const btnBg = this.add.rectangle(0, 0, 200, 60, btnColor)
            .setStrokeStyle(3, btnStrokeColor);

        const btnText = this.add.text(0, 0, btnLabel, {
            fontSize: '17px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        this.trialStartButton.add(btnBg);
        this.trialStartButton.add(btnText);

        const showButton = trialStatus.canStart;

        if (showButton) {
            // Determine dialog text
            let dialogMsg: string;
            if (isFailRetry) {
                dialogMsg = 'MUSÍŠ TO ZKUSIT ZNOVU!\nNEVZDÁVEJ SE!';
            } else {
                dialogMsg = 'VIDÍM, ŽE JSI ZESÍLIL.\nUKAŽ MI, CO UMÍŠ!';
            }

            this.add.text(dialogX, dialogY, dialogMsg, {
                fontSize: '14px',
                fontFamily: 'Arial, sans-serif',
                color: isFailRetry ? '#ff8888' : '#ffffff',
                align: 'center',
                backgroundColor: '#333333',
                padding: { x: 10, y: 8 }
            }).setOrigin(0.5).setDepth(50);

            btnBg.setInteractive({ useHandCursor: true })
                .on('pointerover', () => btnBg.setFillStyle(btnHoverColor))
                .on('pointerout', () => btnBg.setFillStyle(btnColor))
                .on('pointerdown', () => this.showTrialOverview());

            this.tweens.add({
                targets: this.trialStartButton,
                scaleX: 1.05,
                scaleY: 1.05,
                duration: 600,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        } else {
            this.trialStartButton.setVisible(false);
        }

        // History button (visible if there are any attempts)
        const history = ProgressionSystem.ensureTrialHistory(player);
        this.historyButton = this.add.container(startBtnX, startBtnY + 50);
        this.historyButton.setDepth(50);

        if (history.attempts.length > 0) {
            const hBtnBg = this.add.rectangle(0, 0, 200, 36, 0x444466)
                .setStrokeStyle(2, 0x6666aa);
            const hBtnText = this.add.text(0, 0, 'HISTORIE ZKOUŠEK', {
                fontSize: '14px',
                fontFamily: 'Arial, sans-serif',
                color: '#aaaacc',
                fontStyle: 'bold'
            }).setOrigin(0.5);
            this.historyButton.add(hBtnBg);
            this.historyButton.add(hBtnText);

            hBtnBg.setInteractive({ useHandCursor: true })
                .on('pointerover', () => { hBtnBg.setFillStyle(0x555588); hBtnText.setColor('#ffffff'); })
                .on('pointerout', () => { hBtnBg.setFillStyle(0x444466); hBtnText.setColor('#aaaacc'); })
                .on('pointerdown', () => this.showHistoryOverlay());
        } else {
            this.historyButton.setVisible(false);
        }

        this.createOverviewOverlay(overlayX, overlayY);
        this.createTrialOverlay(overlayX, overlayY);
        this.createFeedbackOverlay(overlayX, overlayY);
        this.createResultsOverlay(overlayX, overlayY);
        this.createHistoryOverlay(overlayX, overlayY);
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
        const player = this.gameState.getPlayer();
        const trialStatus = ProgressionSystem.canStartTrial(player);
        this.currentTrialLevel = trialStatus.trialLevel;

        const isFailRetry = trialStatus.reason === 'retry_fail' || trialStatus.reason === 'blocked_by_fail';
        const isRetryImprove = player.trialHistory?.retryLevel != null;
        const levelDesc = TRIAL_LEVEL_DESCRIPTIONS[this.currentTrialLevel] || this.getDifficultyDescription(this.currentTrialLevel);

        const dialog = this.overviewOverlay.getData('dialog') as Phaser.GameObjects.Text;
        const startBtnBg = this.overviewOverlay.getData('startBtnBg') as Phaser.GameObjects.Rectangle;
        const startBtnText = this.overviewOverlay.getData('startBtnText') as Phaser.GameObjects.Text;

        if (isFailRetry) {
            dialog.setText('Minule to nedopadlo...\nAle nevzdávej se! Zkus to znovu!');
            if (startBtnBg) { startBtnBg.setFillStyle(0x882222).setStrokeStyle(3, 0xaa4444); }
            if (startBtnText) { startBtnText.setText('OPAKOVAT'); }
        } else if (isRetryImprove) {
            const bestTier = player.trialHistory?.bestTiers[this.currentTrialLevel] || 'none';
            const tierName = bestTier === 'bronze' ? 'bronz' : 'stříbro';
            dialog.setText(`Máš ${tierName} — zkus dosáhnout lepšího výsledku!`);
            if (startBtnText) { startBtnText.setText('ZLEPŠIT SE'); }
        } else {
            dialog.setText('Ukaž mi, co už umíš!\nNeboj se, každou chybu si vysvětlíme.');
        }

        const desc = this.overviewOverlay.getData('desc') as Phaser.GameObjects.Text;
        desc.setText(
            `Úroveň ${this.currentTrialLevel}: ${levelDesc}\n\n` +
            `10 příkladů, ${TRIAL_TIME_PER_PROBLEM}s na každý\n` +
            `6+ správně = postup`
        );

        this.overviewOverlay.setVisible(true);
        this.trialState.phase = 'overview';
    }

    private getDifficultyDescription(level: number): string {
        if (level <= 2) return 'sčítání';
        if (level <= 3) return 'sčítání a odčítání';
        if (level <= 6) return 'sčítání, odčítání a tříoperandové';
        return 'odčítání a tříoperandové příklady';
    }

    // === Phase 2: Problem display with per-problem timer ===

    private createTrialOverlay(x: number, y: number): void {
        this.trialOverlay = this.add.container(x, y);
        this.trialOverlay.setDepth(200);
        this.trialOverlay.setVisible(false);

        const bg = this.add.rectangle(0, 0, 1280, 720, 0x000000, 0.9);
        this.trialOverlay.add(bg);

        // Progress dots (10 dots at top)
        this.progressDots = [];
        const dotsStartX = -((TRIAL_TOTAL_PROBLEMS - 1) * 36) / 2;
        for (let i = 0; i < TRIAL_TOTAL_PROBLEMS; i++) {
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
        const { operand1, operand2, operand3, operator, operator2, answer } = problem;
        let equationStr: string;
        if (operand3 !== undefined && operator2) {
            equationStr = `${operand1} ${operator} ${operand2} ${operator2} ${operand3} = ${answer}`;
        } else if (problem.problemType === 'missing_operand') {
            equationStr = `${operand1} ${operator} ${answer} = ${operand2}`;
        } else {
            equationStr = `${operand1} ${operator} ${operand2} = ${answer}`;
        }

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

        // Create visualizer — ROZUMÍM button appears after animation completes
        let animationDone = false;
        this.feedbackVisualizer = new TrialFeedbackVisualizer(this, visualContainer, () => {
            if (animationDone) return;
            animationDone = true;
            // Minimum 3s viewing time before button (animations are longer now)
            const elapsed = Date.now() - showTime;
            const remaining = Math.max(0, 3000 - elapsed);
            this.time.delayedCall(remaining, () => this.showUnderstandButton());
        });
        const showTime = Date.now();
        this.feedbackVisualizer.show(problem);
    }

    private showUnderstandButton(): void {
        const btnBg = this.add.rectangle(0, 200, 200, 50, 0x4466aa)
            .setStrokeStyle(2, 0x6688cc);
        this.feedbackOverlay.add(btnBg);

        const btnText = this.add.text(0, 200, 'ROZUMÍM', {
            fontSize: '22px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.feedbackOverlay.add(btnText);

        // Animate button appearance
        btnBg.setAlpha(0);
        btnText.setAlpha(0);
        this.tweens.add({
            targets: [btnBg, btnText],
            alpha: 1,
            duration: 300,
            ease: 'Power2',
        });

        btnBg.setInteractive({ useHandCursor: true })
            .on('pointerover', () => btnBg.setFillStyle(0x5577bb))
            .on('pointerout', () => btnBg.setFillStyle(0x4466aa))
            .on('pointerdown', () => this.closeFeedback());
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
        const score = this.add.text(0, -190, `${correctCount} / ${TRIAL_TOTAL_PROBLEMS} správně`, {
            fontSize: '20px',
            fontFamily: 'Arial, sans-serif',
            color: '#cccccc',
        }).setOrigin(0.5);
        this.resultsOverlay.add(score);

        // Problem review list (compact, 2 columns)
        const results = this.trialState.results;
        const colWidth = 240;
        const rowH = 26;
        const startY = -140;

        for (let i = 0; i < results.length; i++) {
            const r = results[i];
            const col = i < 5 ? -1 : 1;
            const row = i < 5 ? i : i - 5;
            const px = col * (colWidth / 2);
            const py = startY + row * rowH;

            const icon = r.wasCorrect ? '✓' : '✗';
            const iconColor = r.wasCorrect ? '#44ff44' : '#ff4444';

            const { operand1, operand2, operand3, operator, operator2, answer } = r.problem;
            let pStr: string;
            if (operand3 !== undefined && operator2) {
                pStr = `${operand1}${operator}${operand2}${operator2}${operand3}=${answer}`;
            } else {
                pStr = `${operand1}${operator}${operand2}=${answer}`;
            }

            const entry = this.add.text(px, py, `${icon} ${pStr}`, {
                fontSize: '16px',
                fontFamily: 'Arial, sans-serif',
                color: iconColor,
            }).setOrigin(0.5);
            this.resultsOverlay.add(entry);
        }

        // Apply rewards and show gains
        const player = this.gameState.getPlayer();
        const rewardResult = ProgressionSystem.applyTrialResultWithHistory(
            player, tier, correctCount, this.trialState.wrongCount
        );
        this.gameState.save();
        this.registry.set('playerLevel', player.level);

        let rewardText: string;
        if (rewardResult.leveledUp) {
            const parts: string[] = [
                `NOVÁ ÚROVEŇ: ${rewardResult.newLevel}`,
            ];
            if (rewardResult.hpGain > 0) parts.push(`HP: +${rewardResult.hpGain}`);
            if (rewardResult.attackGain > 0) parts.push(`ÚTOK: +${rewardResult.attackGain}`);
            if (rewardResult.manaGain > 0) parts.push(`MANA: +${rewardResult.manaGain}`);
            rewardText = parts.join('   ');
        } else if (rewardResult.wasRetry && rewardResult.isImprovement) {
            // Improved on retry
            const parts: string[] = ['VYLEPŠENÍ!'];
            if (rewardResult.hpGain > 0) parts.push(`HP: +${rewardResult.hpGain}`);
            if (rewardResult.attackGain > 0) parts.push(`ÚTOK: +${rewardResult.attackGain}`);
            if (rewardResult.manaGain > 0) parts.push(`MANA: +${rewardResult.manaGain}`);
            rewardText = parts.join('   ');
        } else if (rewardResult.wasRetry && !rewardResult.isImprovement && tier !== 'none') {
            rewardText = 'Stejný výsledek jako předtím — zkus ještě lépe!';
        } else if (tier === 'none') {
            rewardText = 'Musíš to zkusit znovu — nedáš se!';
        } else {
            rewardText = 'Zkus to znovu - příště to zvládneš lépe!';
        }

        const rewardColor = (rewardResult.leveledUp || rewardResult.isImprovement) ? '#ffd700' : '#aaaaaa';
        const rewards = this.add.text(0, 50, rewardText, {
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
        const zyxText = this.add.text(0, 110, zyxMsg, {
            fontSize: '16px',
            fontFamily: 'Arial, sans-serif',
            color: '#88ccff',
            align: 'center',
            wordWrap: { width: 500 },
        }).setOrigin(0.5);
        this.resultsOverlay.add(zyxText);

        // Fail warning
        if (tier === 'none' && !rewardResult.wasRetry) {
            const warnText = this.add.text(0, 155, '⚠ Další postup je blokován — musíš zkoušku složit!', {
                fontSize: '14px',
                fontFamily: 'Arial, sans-serif',
                color: '#ff6666',
                align: 'center',
                wordWrap: { width: 500 },
            }).setOrigin(0.5);
            this.resultsOverlay.add(warnText);
        }

        // Continue button
        const closeBg = this.add.rectangle(0, 210, 220, 50, 0x444444)
            .setStrokeStyle(2, 0x666666);
        this.resultsOverlay.add(closeBg);

        const closeText = this.add.text(0, 210, 'POKRAČOVAT', {
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

        // Generate problems for the trial level (may differ from player level on retry)
        const playerLevel = this.registry.get('playerLevel') || 1;
        if (this.currentTrialLevel !== playerLevel) {
            // Retry at a different level — use level-specific generation
            this.trialProblems = this.mathEngine.generateTrialProblemsForLevel(TRIAL_TOTAL_PROBLEMS, this.currentTrialLevel);
        } else {
            this.trialProblems = this.mathEngine.generateTrialProblems(TRIAL_TOTAL_PROBLEMS);
        }

        this.trialState = {
            isActive: true,
            currentProblemIndex: 0,
            totalProblems: TRIAL_TOTAL_PROBLEMS,
            timePerProblem: TRIAL_TIME_PER_PROBLEM,
            timeRemainingForProblem: TRIAL_TIME_PER_PROBLEM,
            correctCount: 0,
            wrongCount: 0,
            results: [],
            tier: 'none',
            phase: 'problem',
        };

        // Reset progress dots
        for (const dot of this.progressDots) {
            dot.setText('○');
            dot.setColor('#666666');
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
        this.trialState.timeRemainingForProblem = TRIAL_TIME_PER_PROBLEM;
        this.trialState.phase = 'problem';
        this.problemStartTime = Date.now();

        const { operand1, operand2, operand3, operator, operator2 } = this.currentTrialProblem;
        let text: string;
        if (operand3 !== undefined && operator2) {
            text = `${operand1} ${operator} ${operand2} ${operator2} ${operand3} = ?`;
        } else {
            text = `${operand1} ${operator} ${operand2} = ?`;
        }
        this.problemText.setText(text);

        // Update choices
        const answers = this.currentTrialProblem.choices;
        for (let i = 0; i < 3; i++) {
            this.answerButtonTexts[i].setText(answers[i].toString());
            this.answerButtonValues[i] = answers[i];
            this.answerButtonBgs[i].setFillStyle(0x4466aa);
        }

        // Highlight current progress dot
        this.progressDots[idx].setText('●');
        this.progressDots[idx].setColor('#ffffff');

        this.updateTimerUI();
    }

    private onProblemTick(): void {
        if (this.trialState.phase !== 'problem') return;

        this.trialState.timeRemainingForProblem--;
        this.updateTimerUI();

        if (this.trialState.timeRemainingForProblem <= 0) {
            // Time expired = wrong answer
            this.recordTrialAnswer(null);
        }
    }

    private updateTimerUI(): void {
        const remaining = this.trialState.timeRemainingForProblem;
        this.timerText.setText(remaining.toString());

        const progress = remaining / TRIAL_TIME_PER_PROBLEM;
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

        if (this.trialState.currentProblemIndex >= TRIAL_TOTAL_PROBLEMS) {
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

        // Determine tier
        this.trialState.tier = ProgressionSystem.getTrialTier(this.trialState.correctCount);

        this.showResults();
    }

    // ============ TRIAL HISTORY OVERLAY ============

    private createHistoryOverlay(x: number, y: number): void {
        this.historyOverlay = this.add.container(x, y);
        this.historyOverlay.setDepth(200);
        this.historyOverlay.setVisible(false);
    }

    private showHistoryOverlay(): void {
        this.historyOverlay.removeAll(true);
        this.historyOverlay.setVisible(true);

        const player = this.gameState.getPlayer();
        const history = ProgressionSystem.ensureTrialHistory(player);

        // Background
        const bg = this.add.rectangle(0, 0, 1280, 720, 0x000000, 0.94);
        this.historyOverlay.add(bg);

        // Title
        const title = this.add.text(0, -310, 'HISTORIE ZKOUŠEK', {
            fontSize: '30px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffd700',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3,
        }).setOrigin(0.5);
        this.historyOverlay.add(title);

        // Scrollable content container
        const contentContainer = this.add.container(0, 0);
        this.historyOverlay.add(contentContainer);

        // Group attempts by level
        const levelMap = new Map<number, typeof history.attempts>();
        for (const attempt of history.attempts) {
            if (!levelMap.has(attempt.level)) {
                levelMap.set(attempt.level, []);
            }
            levelMap.get(attempt.level)!.push(attempt);
        }

        // Sort levels
        const sortedLevels = [...levelMap.keys()].sort((a, b) => a - b);

        let yOffset = -240;
        const contentItems: Phaser.GameObjects.GameObject[] = [];

        for (const level of sortedLevels) {
            const attempts = levelMap.get(level)!;
            const bestTier = history.bestTiers[level] || 'none';
            const tierDisplay = this.getTierDisplay(bestTier);
            const levelDesc = TRIAL_LEVEL_DESCRIPTIONS[level] || this.getDifficultyDescription(level);

            // Level header
            const headerBg = this.add.rectangle(0, yOffset, 560, 32, 0x333355, 0.8)
                .setStrokeStyle(1, 0x555577);
            contentContainer.add(headerBg);
            contentItems.push(headerBg);

            const headerText = this.add.text(-270, yOffset, `Úroveň ${level}: ${tierDisplay.stars}  ${levelDesc}`, {
                fontSize: '15px',
                fontFamily: 'Arial, sans-serif',
                color: tierDisplay.color,
                fontStyle: 'bold',
            }).setOrigin(0, 0.5);
            contentContainer.add(headerText);
            contentItems.push(headerText);

            yOffset += 24;

            // Individual attempts
            for (let i = 0; i < attempts.length; i++) {
                const a = attempts[i];
                const tierName = this.getTierLabel(a.tier);
                const tierColor = this.getTierDisplay(a.tier).color;
                const retryTag = a.isRetry ? ' (opakování)' : '';

                // Rewards summary
                const rewardParts: string[] = [];
                if (a.rewardsGiven.hp > 0) rewardParts.push(`+${a.rewardsGiven.hp} HP`);
                if (a.rewardsGiven.atk > 0) rewardParts.push(`+${a.rewardsGiven.atk} ÚTOK`);
                if (a.rewardsGiven.mana > 0) rewardParts.push(`+${a.rewardsGiven.mana} ⚡`);
                const rewardStr = rewardParts.length > 0 ? `  ${rewardParts.join(' ')}` : '';

                const attemptText = this.add.text(-260, yOffset,
                    `  Pokus ${i + 1}: ${a.correctCount}/${TRIAL_TOTAL_PROBLEMS}  ${tierName}${retryTag}${rewardStr}`, {
                    fontSize: '13px',
                    fontFamily: 'Arial, sans-serif',
                    color: tierColor,
                }).setOrigin(0, 0.5);
                contentContainer.add(attemptText);
                contentItems.push(attemptText);

                yOffset += 22;
            }

            // Retry button for bronze/silver (only when no pending fail block)
            if (ProgressionSystem.canRetryForImprovement(player, level) && history.failedTrialLevel == null) {
                const retryBtnBg = this.add.rectangle(220, yOffset - 11, 100, 24, 0x446644)
                    .setStrokeStyle(1, 0x66aa66);
                contentContainer.add(retryBtnBg);
                contentItems.push(retryBtnBg);

                const retryBtnText = this.add.text(220, yOffset - 11, 'ZLEPŠIT', {
                    fontSize: '12px',
                    fontFamily: 'Arial, sans-serif',
                    color: '#88ff88',
                    fontStyle: 'bold',
                }).setOrigin(0.5);
                contentContainer.add(retryBtnText);
                contentItems.push(retryBtnText);

                const capturedLevel = level;
                retryBtnBg.setInteractive({ useHandCursor: true })
                    .on('pointerover', () => retryBtnBg.setFillStyle(0x558855))
                    .on('pointerout', () => retryBtnBg.setFillStyle(0x446644))
                    .on('pointerdown', () => {
                        ProgressionSystem.startRetryForImprovement(player, capturedLevel);
                        this.gameState.save();
                        this.historyOverlay.setVisible(false);
                        this.showTrialOverview();
                    });
            }

            yOffset += 16; // spacing between levels
        }

        // If no attempts
        if (sortedLevels.length === 0) {
            const emptyText = this.add.text(0, 0, 'Zatím žádné zkoušky.', {
                fontSize: '18px',
                fontFamily: 'Arial, sans-serif',
                color: '#888888',
            }).setOrigin(0.5);
            contentContainer.add(emptyText);
        }

        // Scrolling support
        const totalContentHeight = yOffset + 240; // approximate total height
        const visibleHeight = 480;
        let scrollY = 0;
        const maxScroll = Math.max(0, totalContentHeight - visibleHeight);

        if (maxScroll > 0) {
            bg.setInteractive();
            bg.on('wheel', (_pointer: Phaser.Input.Pointer, _dx: number, _dy: number, dz: number) => {
                scrollY = Phaser.Math.Clamp(scrollY + dz * 0.5, 0, maxScroll);
                contentContainer.setY(-scrollY);
            });
        }

        // Close button
        const closeBg = this.add.rectangle(0, 290, 180, 44, 0x444444)
            .setStrokeStyle(2, 0x666666);
        this.historyOverlay.add(closeBg);

        const closeText = this.add.text(0, 290, 'ZAVŘÍT', {
            fontSize: '20px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold',
        }).setOrigin(0.5);
        this.historyOverlay.add(closeText);

        closeBg.setInteractive({ useHandCursor: true })
            .on('pointerover', () => closeBg.setFillStyle(0x555555))
            .on('pointerout', () => closeBg.setFillStyle(0x444444))
            .on('pointerdown', () => {
                this.historyOverlay.setVisible(false);
            });
    }

    private getTierLabel(tier: TrialTier): string {
        switch (tier) {
            case 'gold':   return 'ZLATO';
            case 'silver': return 'STŘÍBRO';
            case 'bronze': return 'BRONZ';
            default:       return 'NEÚSPĚCH';
        }
    }
}
