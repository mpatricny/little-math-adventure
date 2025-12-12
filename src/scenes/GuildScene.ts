import Phaser from 'phaser';
import { GameStateManager } from '../systems/GameStateManager';
import { MathEngine } from '../systems/MathEngine';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { MathProblemDef, ProblemStats, MathProblem, TrialState } from '../types';
import { SceneDebugger } from '../systems/SceneDebugger';
import { SceneBuilder } from '../systems/SceneBuilder';

const ROW_HEIGHT = 28;
const VISIBLE_ROWS = 8;
const TRIAL_DURATION = 60; // seconds
const TRIAL_REQUIRED_CORRECT = 10; // correct answers needed to pass

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
        timeRemaining: TRIAL_DURATION,
        correctCount: 0,
        wrongCount: 0,
        totalProblems: 0
    };
    private currentTrialProblem: MathProblem | null = null;
    private trialTimer: Phaser.Time.TimerEvent | null = null;

    // Trial UI elements
    private trialOverlay!: Phaser.GameObjects.Container;
    private trialStartButton!: Phaser.GameObjects.Container;
    private timerText!: Phaser.GameObjects.Text;
    private timerBar!: Phaser.GameObjects.Graphics;
    private timerFrame!: Phaser.GameObjects.Image;
    private timerBg!: Phaser.GameObjects.Rectangle;
    private scoreText!: Phaser.GameObjects.Text;
    private problemText!: Phaser.GameObjects.Text;
    private answerButtonBgs: Phaser.GameObjects.Rectangle[] = [];
    private answerButtonTexts: Phaser.GameObjects.Text[] = [];
    private answerButtonValues: number[] = [0, 0, 0];
    private resultsOverlay!: Phaser.GameObjects.Container;

    // Universal debugger
    private debugger!: SceneDebugger;

    // Scene Builder
    private sceneBuilder!: SceneBuilder;

    // UI references for debug repositioning
    private guildmaster!: Phaser.GameObjects.Image;
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
        this.mathEngine = new MathEngine(this.registry);
        // Use ALL problems ever attempted, not just current level pool
        this.problemList = this.mathEngine.getAllProblemsWithStats();
        this.scrollOffset = 0;

        // Initialize SceneBuilder - this creates all elements from scenes.json
        this.sceneBuilder = new SceneBuilder(this);
        this.sceneBuilder.buildScene();

        // Retrieve references from SceneBuilder (positions come from scenes.json)
        this.guildmaster = this.sceneBuilder.get('guildmaster') as Phaser.GameObjects.Image;
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
    }

    private createStatsSummary(x: number, y: number, depth: number): void {
        const stats = this.mathEngine.getStats();
        const masteryPct = this.mathEngine.getMasteryPercentage();
        const poolCycle = this.mathEngine.getPoolCycle();

        this.statsContainer = this.add.container(x, y);
        this.statsContainer.setDepth(depth);

        // Background panel
        const bg = this.add.rectangle(0, 0, 300, 50, 0x000000, 0.6)
            .setStrokeStyle(2, 0x4488aa);
        this.statsContainer.add(bg);

        const statsText = this.add.text(0, 0,
            `ÚROVEŇ: ${stats.currentDifficulty}   |   CYKLUS: ${poolCycle + 1}   |   ${masteryPct}%`,
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

            // Diamond slots
            const correct = problem.stats.correctCount;
            const collected = problem.stats.diamondsCollected || 0;
            const thresholds = [5, 10, 20];

            for (let d = 0; d < 3; d++) {
                const threshold = thresholds[d];
                const slotX = -160 - (2 - d) * 18;

                let symbol: string;
                let color: string;

                if (correct >= threshold) {
                    if (collected > d) {
                        symbol = '◆';
                        color = '#888888';
                    } else {
                        symbol = '◆';
                        color = '#44aaff';
                    }
                } else {
                    symbol = '○';
                    color = '#555555';
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
            fontSize: '20px',
            fontFamily: 'Arial, sans-serif',
            color: '#5a4a3a'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        upBtn.on('pointerover', () => upBtn.setColor('#8a6a4a'));
        upBtn.on('pointerout', () => upBtn.setColor('#5a4a3a'));
        upBtn.on('pointerdown', () => this.scroll(-3));
        this.listPanel.add(upBtn);

        // Down button
        const downBtn = this.add.text(155, 100, '▼', {
            fontSize: '20px',
            fontFamily: 'Arial, sans-serif',
            color: '#5a4a3a'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        downBtn.on('pointerover', () => downBtn.setColor('#8a6a4a'));
        downBtn.on('pointerout', () => downBtn.setColor('#5a4a3a'));
        downBtn.on('pointerdown', () => this.scroll(3));
        this.listPanel.add(downBtn);

        // Scroll info
        const scrollInfo = this.add.text(155, 0,
            `${Math.min(this.problemList.length, VISIBLE_ROWS)}/${this.problemList.length}`, {
            fontSize: '11px',
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

        // Calculate daily stats
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTimestamp = today.getTime();

        let allTimeTotal = stats.totalAttempts;
        let allTimeCorrect = stats.correctAnswers;
        let allTimeWrong = allTimeTotal - allTimeCorrect;

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

        // Count problems attempted today
        let todayProblems = 0;
        for (const problem of this.problemList) {
            if (problem.stats && problem.stats.lastAttempt >= todayTimestamp) {
                todayProblems++;
            }
        }

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

        // Mastered count
        const masteredCount = this.problemList.filter(p => (p.stats?.correctCount || 0) >= 5).length;
        const masteredText = this.add.text(20, 30,
            `💎 ${masteredCount} zvládnutých příkladů`, {
            fontSize: '13px',
            fontFamily: 'Arial, sans-serif',
            color: '#44ddff'
        }).setOrigin(0, 0.5);
        statsPanel.add(masteredText);

        // Count collectable diamonds
        let collectableDiamonds = 0;
        const thresholds = [5, 10, 20];
        for (const problem of this.problemList) {
            const correct = problem.stats.correctCount;
            const collected = problem.stats.diamondsCollected || 0;
            for (let d = 0; d < 3; d++) {
                if (correct >= thresholds[d] && collected <= d) {
                    collectableDiamonds++;
                }
            }
        }

        // Collect button
        this.collectButtonContainer = this.add.container(collectX, y);
        this.collectButtonContainer.setDepth(buttonDepth);

        if (collectableDiamonds > 0) {
            const btnBg = this.add.rectangle(0, 0, 120, 32, 0x4488aa)
                .setStrokeStyle(2, 0x66aacc);

            const btnText = this.add.text(0, 0, `◆ SBÍRAT (${collectableDiamonds})`, {
                fontSize: '14px',
                fontFamily: 'Arial, sans-serif',
                color: '#ffffff',
                fontStyle: 'bold'
            }).setOrigin(0.5);

            // Add bg first, then text on top (consistent pattern)
            this.collectButtonContainer.add(btnBg);
            this.collectButtonContainer.add(btnText);

            btnBg.setInteractive({ useHandCursor: true })
                .on('pointerover', () => btnBg.setFillStyle(0x5599bb))
                .on('pointerout', () => btnBg.setFillStyle(0x4488aa))
                .on('pointerdown', () => this.collectDiamonds());

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
            const infoText = this.add.text(0, 0, '(5✓ = ◆)', {
                fontSize: '12px',
                fontFamily: 'Arial, sans-serif',
                color: '#888888'
            }).setOrigin(0.5);
            this.collectButtonContainer.add(infoText);
        }
    }

    private collectDiamonds(): void {
        const collectedCount = this.mathEngine.collectAllDiamonds();

        if (collectedCount > 0) {
            const player = this.gameState.getPlayer();
            player.diamonds.common += collectedCount;
            this.gameState.save();

            this.showCollectionAnimation(collectedCount);
            this.problemList = this.mathEngine.getAllProblemsWithStats();
            this.scene.restart();
        }
    }

    private showCollectionAnimation(count: number): void {
        const floatText = this.add.text(800, 620, `+${count} 💎`, {
            fontSize: '28px',
            fontFamily: 'Arial, sans-serif',
            color: '#44ddff',
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

    // ============ TRIAL MODE ============

    private createTrialUI(): void {
        const player = this.gameState.getPlayer();

        // Get positions from SceneBuilder (cast to access x/y properties)
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

        const btnBg = this.add.rectangle(0, 0, 180, 60, 0x228822)
            .setStrokeStyle(3, 0x44aa44);

        const btnText = this.add.text(0, 0, 'ZAČÍT ZKOUŠKU', {
            fontSize: '18px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        // Add bg first, then text on top (consistent pattern)
        this.trialStartButton.add(btnBg);
        this.trialStartButton.add(btnText);

        if (player.readyToPromote) {
            const dialog = this.add.text(dialogX, dialogY, 'VIDÍM, ŽE JSI ZESÍLIL.\nUKAŽ MI, CO UMÍŠ!', {
                fontSize: '14px',
                fontFamily: 'Arial, sans-serif',
                color: '#ffffff',
                align: 'center',
                backgroundColor: '#333333',
                padding: { x: 10, y: 8 }
            }).setOrigin(0.5).setDepth(50);

            btnBg.setInteractive({ useHandCursor: true })
                .on('pointerover', () => btnBg.setFillStyle(0x33aa33))
                .on('pointerout', () => btnBg.setFillStyle(0x228822))
                .on('pointerdown', () => this.startTrial());

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

        this.createTrialOverlay(overlayX, overlayY);
        this.createResultsOverlay(overlayX, overlayY);
    }

    private createTrialOverlay(x: number, y: number): void {
        this.trialOverlay = this.add.container(x, y);
        this.trialOverlay.setDepth(200);
        this.trialOverlay.setVisible(false);

        const bg = this.add.rectangle(0, 0, 1280, 720, 0x000000, 0.9);
        this.trialOverlay.add(bg);

        const title = this.add.text(0, -250, 'ZKOUŠKA HRDINY', {
            fontSize: '36px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffd700',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5);
        this.trialOverlay.add(title);

        // Read timer frame and bar positions/sizes from scene-layouts.json
        // trialOverlay is at viewport center (640, 360)
        // Layout positions are absolute, so convert to relative
        const overlayX = 640;
        const overlayY = 360;

        const timerFrameLayout = this.sceneBuilder.getLayoutOverride('timerFrame');
        const timerBarLayout = this.sceneBuilder.getLayoutOverride('timerBar');

        // Timer frame position (relative to overlay) and scale
        const frameX = (timerFrameLayout?.x ?? 640) - overlayX;
        const frameY = (timerFrameLayout?.y ?? 180) - overlayY;
        const frameScaleX = timerFrameLayout?.scaleX ?? timerFrameLayout?.scale ?? 0.178;
        const frameScaleY = timerFrameLayout?.scaleY ?? timerFrameLayout?.scale ?? 0.123;

        // Timer bar position (relative to overlay) and dimensions
        const barX = (timerBarLayout?.x ?? 640) - overlayX;
        const barY = (timerBarLayout?.y ?? 180) - overlayY;
        // Bar dimensions from scenes.json or defaults
        const barWidth = timerBarLayout?.width ?? 200;
        const barHeight = timerBarLayout?.height ?? 24;

        // Timer background (dark rectangle behind the bar)
        this.timerBg = this.add.rectangle(barX, barY, barWidth, barHeight, 0x333333);
        this.trialOverlay.add(this.timerBg);

        // Timer bar using Graphics for reliable rendering
        // Position at top-left corner of timerBg
        const barLeft = barX - barWidth / 2;
        const barTop = barY - barHeight / 2;
        this.timerBar = this.add.graphics();
        this.timerBar.setPosition(barLeft, barTop);
        this.timerBar.fillStyle(0x44aa44, 1);
        this.timerBar.fillRect(0, 0, barWidth, barHeight);
        this.trialOverlay.add(this.timerBar);

        // Store bar dimensions for updateTrialUI
        this.timerBar.setData('barWidth', barWidth);
        this.timerBar.setData('barHeight', barHeight);

        // Timer frame - read position and scale from scene-layouts.json
        this.timerFrame = this.add.image(frameX, frameY, 'ui-stone-bar-frame');
        this.timerFrame.setScale(frameScaleX, frameScaleY);
        this.trialOverlay.add(this.timerFrame);

        this.timerText = this.add.text(frameX, frameY, '60', {
            fontSize: '24px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.trialOverlay.add(this.timerText);

        this.scoreText = this.add.text(0, -120, `SKÓRE: 0 / ${TRIAL_REQUIRED_CORRECT}`, {
            fontSize: '24px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.trialOverlay.add(this.scoreText);

        this.problemText = this.add.text(0, 0, '', {
            fontSize: '64px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.trialOverlay.add(this.problemText);

        // Create answer buttons WITHOUT nested containers
        const buttonY = 120;
        const buttonSpacing = 150;
        this.answerButtonBgs = [];
        this.answerButtonTexts = [];

        for (let i = 0; i < 3; i++) {
            const btnX = (i - 1) * buttonSpacing;

            // Add background rectangle directly to trialOverlay
            const btnBg = this.add.rectangle(btnX, buttonY, 120, 80, 0x4466aa)
                .setStrokeStyle(3, 0x6688cc);
            this.trialOverlay.add(btnBg);
            this.answerButtonBgs.push(btnBg);

            // Add text directly to trialOverlay (added after bg so it renders on top)
            const btnText = this.add.text(btnX, buttonY, '', {
                fontSize: '32px',
                fontFamily: 'Arial, sans-serif',
                color: '#ffffff',
                fontStyle: 'bold'
            }).setOrigin(0.5);
            this.trialOverlay.add(btnText);
            this.answerButtonTexts.push(btnText);

            // Setup interactivity on background
            const buttonIndex = i;
            btnBg.setInteractive({ useHandCursor: true })
                .on('pointerover', () => btnBg.setFillStyle(0x5577bb))
                .on('pointerout', () => btnBg.setFillStyle(0x4466aa))
                .on('pointerdown', () => this.checkTrialAnswer(buttonIndex));
        }
    }

    private createResultsOverlay(x: number, y: number): void {
        this.resultsOverlay = this.add.container(x, y);
        this.resultsOverlay.setDepth(200);
        this.resultsOverlay.setVisible(false);

        const bg = this.add.rectangle(0, 0, 1280, 720, 0x000000, 0.9);
        this.resultsOverlay.add(bg);

        const title = this.add.text(0, -100, '', {
            fontSize: '48px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5);
        this.resultsOverlay.add(title);
        this.resultsOverlay.setData('title', title);

        const message = this.add.text(0, 0, '', {
            fontSize: '24px',
            fontFamily: 'Arial, sans-serif',
            color: '#cccccc',
            align: 'center'
        }).setOrigin(0.5);
        this.resultsOverlay.add(message);
        this.resultsOverlay.setData('message', message);

        const closeBtn = this.add.text(0, 150, 'POKRAČOVAT', {
            fontSize: '32px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            backgroundColor: '#444444',
            padding: { x: 20, y: 10 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        closeBtn.on('pointerdown', () => {
            this.resultsOverlay.setVisible(false);
            this.scene.restart();
        });
        this.resultsOverlay.add(closeBtn);
    }

    private startTrial(): void {
        this.trialState = {
            isActive: true,
            timeRemaining: TRIAL_DURATION,
            correctCount: 0,
            wrongCount: 0,
            totalProblems: 0
        };

        this.trialOverlay.setVisible(true);
        this.updateTrialUI();
        this.nextTrialProblem();

        this.trialTimer = this.time.addEvent({
            delay: 1000,
            callback: this.onTrialTick,
            callbackScope: this,
            loop: true
        });
    }

    private onTrialTick(): void {
        if (!this.trialState.isActive) return;

        this.trialState.timeRemaining--;
        this.updateTrialUI();

        if (this.trialState.timeRemaining <= 0) {
            this.endTrial(false);
        }
    }

    private updateTrialUI(): void {
        this.timerText.setText(this.trialState.timeRemaining.toString());
        this.scoreText.setText(`SKÓRE: ${this.trialState.correctCount} / ${TRIAL_REQUIRED_CORRECT}`);

        const progress = this.trialState.timeRemaining / TRIAL_DURATION;
        const fullBarWidth = this.timerBar.getData('barWidth') as number || 320;
        const barHeight = this.timerBar.getData('barHeight') as number || 55;
        const currentBarWidth = fullBarWidth * progress;
        const color = this.trialState.timeRemaining <= 10 ? 0xff4444 : 0x44aa44;

        // Clear and redraw the timer bar using Graphics
        this.timerBar.clear();
        this.timerBar.fillStyle(color, 1);
        this.timerBar.fillRect(0, 0, currentBarWidth, barHeight);
    }

    private nextTrialProblem(): void {
        this.currentTrialProblem = this.mathEngine.generateProblem();
        this.problemText.setText(`${this.currentTrialProblem.operand1} ${this.currentTrialProblem.operator} ${this.currentTrialProblem.operand2} = ?`);

        // Use the choices already included in the MathProblem
        const answers = this.currentTrialProblem.choices;
        for (let i = 0; i < 3; i++) {
            this.answerButtonTexts[i].setText(answers[i].toString());
            this.answerButtonValues[i] = answers[i];
        }
    }

    private checkTrialAnswer(index: number): void {
        if (!this.trialState.isActive || !this.currentTrialProblem) return;

        const value = this.answerButtonValues[index];
        const isCorrect = value === this.currentTrialProblem.answer;

        // Record the result to statistics using the problem ID
        this.mathEngine.recordResultForProblem(this.currentTrialProblem.id, isCorrect);

        if (isCorrect) {
            this.trialState.correctCount++;
            if (this.trialState.correctCount >= TRIAL_REQUIRED_CORRECT) {
                this.endTrial(true);
            } else {
                this.nextTrialProblem();
                this.updateTrialUI();
            }
        } else {
            this.trialState.wrongCount++;
            // Penalty? For now just wrong
            this.cameras.main.shake(200, 0.01);
            this.nextTrialProblem();
        }
    }

    private endTrial(success: boolean): void {
        this.trialState.isActive = false;
        if (this.trialTimer) {
            this.trialTimer.remove();
        }
        this.trialOverlay.setVisible(false);

        this.resultsOverlay.setVisible(true);
        const title = this.resultsOverlay.getData('title') as Phaser.GameObjects.Text;
        const message = this.resultsOverlay.getData('message') as Phaser.GameObjects.Text;

        if (success) {
            title.setText('ZKOUŠKA SPLNĚNA!');
            title.setColor('#44ff44');

            // Apply level up using ProgressionSystem (adds HP and ATK)
            const player = this.gameState.getPlayer();
            const result = ProgressionSystem.applyLevelUp(player, 1);
            this.gameState.save();

            // Show stats gains in the message
            message.setText(
                `Gratuluji! Prokázal jsi své schopnosti.\n\n` +
                `📈 NOVÁ ÚROVEŇ: ${result.newLevel}\n` +
                `❤️ HP: +${result.hpGain} (nyní ${player.maxHp})\n` +
                `⚔️ ÚTOK: +${result.attackGain} (nyní ${player.attack})`
            );
        } else {
            title.setText('ZKOUŠKA NEÚSPĚŠNÁ');
            title.setColor('#ff4444');
            message.setText('Bohužel jsi nestihl vyřešit dostatek příkladů.\nZkus to znovu, až budeš připraven.');
        }
    }
}
