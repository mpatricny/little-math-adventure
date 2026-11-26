import { sfx } from '../audio/AudioDirector';
import Phaser from 'phaser';
import { ComparisonStageId, MathProblem } from '../types';
import { formatMathProblem, getComparisonExpressions } from '../utils/formatMathProblem';
import { ComparisonExpressionView } from './ComparisonExpressionView';
import { comparisonGlyph } from './ComparisonProblemView';
import { MasterySystem } from '../systems/MasterySystem';
import { MedievalActionButton } from './MedievalActionButton';
import { MathBoardDefense, SequentialMathView } from './SequentialMathView';
import { comparisonChoiceWidth } from './ComparisonPresentation';
import { calculateShieldAnswerBlock } from '../systems/ShieldBlockSystem';
import { COMPARISON_LATER_HINT_DELAY_MS, ComparisonSupportProgress, comparisonHintDelay, normalizeComparisonSupport, updateComparisonSupport } from '../systems/ComparisonSupport';
import type { AnswerChoiceIndex, RemoteAnswerChoice, RemoteComparisonPrompt } from '../remote/types';
import { observeMathProblem, observedChoice, type ProblemObservation } from '../telemetry/ProblemObservation';
import type { BattleAnswerEvidence, PersonalAnswerBonus } from '../systems/PersonalBattleBonuses';
import { validMathBoardCheckpoint, type MathBoardCheckpoint, type MathBoardFeedbackCheckpoint } from './mathboard/checkpoint';
export type { MathBoardCheckpoint } from './mathboard/checkpoint';

export interface MathBoardShowOptions {
    presentation?: 'rows' | 'sequential';
    introduction?: ComparisonStageId;
    support?: Partial<ComparisonSupportProgress>;
    onIntroComplete?: () => void;
    defense?: MathBoardDefense;
    telemetryContext?: string;
}

/** Presentation seam for isolated visual workshops; MathBoard retains answer ownership. */
export type MathBoardPresentation = Pick<SequentialMathView,
    'root' | 'origin' | 'hints' | 'showQuestion' | 'setDefense' | 'updateProgress' |
    'setEnabled' | 'playDemo' | 'showHints' | 'hideHints' | 'showArithmeticHint' |
    'showSpeedBonus' | 'showDefenseResult' | 'answer' | 'setPaused' | 'resetSurfaces' |
    'cancel' | 'hide' | 'destroy'> & { readonly handlesWrongFeedback?: boolean;
        playNumberDemo?: (lines: readonly [string, string], done: () => void) => void;
        finishEntry?: () => void;
        restoreFeedback?: (state: MathBoardFeedbackCheckpoint, done: () => void) => void };
export type MathBoardPresentationFactory = (scene: Phaser.Scene, onDemo: () => void) => MathBoardPresentation;
export type NumberIntroductionProvider = (problem: MathProblem) =>
    { lines: readonly [string, string]; complete: () => void } | undefined;

export interface MathBoardFirstAnswer {
    problem: MathProblem;
    choice: number;
    correct: boolean;
    responseTimeMs: number;
    assisted: boolean;
}

// Visual hint configuration
const HINT_ITEM_COUNT = 8;      // Total items in spritesheet
const HINT_APPEAR_DELAY = 5000; // 5 second delay before hints appear
const PROBLEM_BUTTON_GAP = 12;  // Keep equations visually separate from answer buttons
const PROBLEM_AREA_PADDING = 24;

// Default layout configuration
const DEFAULT_LAYOUT = {
    rowHeight: 80,              // Height per problem row
    twoColumnThreshold: 3,      // Use two columns when more than this many problems (4+)
    columnWidth: 380,           // Width of each column in two-column mode
    buttonSpacing: 75,          // Spacing between answer buttons (single column)
    buttonSpacingTwoCol: 50,    // Spacing between answer buttons (two column)
    buttonScale: 0.28,          // Button scale (single column)
    buttonScaleTwoCol: 0.20,    // Button scale (two column)
    hintY: -80,                 // Y offset for hints
    hintScale: 0.12,            // Scale of hint items
    hintSpacing: 30,            // Spacing between hint items
    problemTextX: -180,         // X position of problem text (single column)
    problemTextXTwoCol: -170,   // X position of problem text (two column)
    buttonStartX: 40,           // X start position of buttons (single column)
    buttonStartXTwoCol: 30,     // X start position of buttons (two column)
    damageTextYOffset: 25,      // Y offset of damage text from board bottom
    boardWidth: 650,            // Board width (single column)
    boardWidthTwoCol: 850,      // Board width (two column)
    boardHeightPadding: 60,     // Extra padding for board height
    boardMinHeight: 200,        // Minimum board height
};

export interface MathBoardLayout {
    rowHeight?: number;
    columnWidth?: number;
    buttonSpacing?: number;
    buttonScale?: number;
    hintY?: number;
    hintScale?: number;
    hintSpacing?: number;
    problemTextX?: number;
    buttonStartX?: number;
    damageTextYOffset?: number;
    boardWidth?: number;
    boardHeightPadding?: number;
    boardMinHeight?: number;
}

export interface MathBoardRemoteSnapshot {
    problem: string;
    choices: RemoteAnswerChoice[];
    comparison?: RemoteComparisonPrompt;
}

interface ProblemRow {
    container: Phaser.GameObjects.Container;
    problemText: Phaser.GameObjects.Text;
    comparison?: ComparisonExpressionView;
    sourceLabel: Phaser.GameObjects.Container | null;  // Container for icon + text
    buttons: Phaser.GameObjects.Container[];
    statusIcon: Phaser.GameObjects.Text;
    problem: MathProblem;
    solved: boolean;
    correct: boolean;
}

export class MathBoard {
    private scene: Phaser.Scene;
    private container!: Phaser.GameObjects.Container;
    private problemRows: ProblemRow[] = [];
    private hintContainer!: Phaser.GameObjects.Container;
    private damageText!: Phaser.GameObjects.Text;
    private comparisonHelpButton!: MedievalActionButton;
    private onComplete: (damageDealt: number, results: boolean[], timings: number[], assisted: boolean[]) => void;
    private originalOnComplete: (damageDealt: number, results: boolean[], timings: number[], assisted: boolean[]) => void; // Store original callback
    private hintTimer: Phaser.Time.TimerEvent | null = null;
    private completionTimer: Phaser.Time.TimerEvent | null = null; // Track pending onComplete callback
    private advanceTimer: Phaser.Time.TimerEvent | null = null; // Track 400ms delay between problems
    private onWrongAnswer?: (problem: MathProblem, onDismiss: () => void) => void; // Optional wrong answer callback
    private speedChargeCallback?: (charges: number, type: 'swift' | 'lightning') => number; // Returns bonus damage from bar fills
    private personalBonusCallback?: (answer: BattleAnswerEvidence) => PersonalAnswerBonus;
    private firstAnswerCallback?: (answer: MathBoardFirstAnswer) => void;
    private answerClock?: (problem: MathProblem, correct: boolean, assisted: boolean) => number | null;
    private currentAssisted = false;
    private activeProblemChangedCallback?: (snapshot: MathBoardRemoteSnapshot | null) => void;
    private damageDisplayEnabled = true;
    private sequential = false;
    private sequentialView: MathBoardPresentation | null = null;
    private acceptingAnswer = false;
    private activeTimeMs = 0;
    private generation = 0;
    private support = normalizeComparisonSupport();
    private defense: MathBoardDefense | null = null;
    private rowsPosition: { x: number; y: number } | null = null;
    private observation:ProblemObservation|null=null;
    private telemetryContext:string|undefined;
    private suspensions = new Set<string>();
    private boardActive = false;
    private demoStage?: ComparisonStageId;
    private numberIntroduction?: NumberIntroductionProvider;
    setNumberIntroductionProvider(provider?: NumberIntroductionProvider): void {
        this.numberIntroduction = provider;
    }
    private completionDelivered = false;
    private feedbackCheckpoints: MathBoardFeedbackCheckpoint[] = [];
    private checkpointChangedCallback?: () => void;

    // Multi-problem state
    private problems: MathProblem[] = [];
    private currentProblemIndex: number = 0;
    private damageDealt: number = 0;
    private results: boolean[] = [];
    private timings: number[] = [];            // Response time per problem (ms)
    private assisted: boolean[] = [];

    // Configurable layout
    private layout = { ...DEFAULT_LAYOUT };

    // UI layouts config from ui-layouts.json
    private uiLayoutsConfig: {
        presets: Record<string, { name: string; params: Partial<typeof DEFAULT_LAYOUT> }>;
        problemCountMappings: Array<{ count: number; presetName: string }>;
        defaultPreset: string;
    } | null = null;

    constructor(scene: Phaser.Scene, onComplete: (damageDealt: number, results: boolean[], timings: number[], assisted: boolean[]) => void,
        private readonly presentationFactory?: MathBoardPresentationFactory) {
        this.scene = scene;
        this.onComplete = onComplete;
        this.originalOnComplete = onComplete; // Store original for restoration
        this.loadUILayouts();
        this.create();
        this.scene.events.on(Phaser.Scenes.Events.UPDATE, this.updateActiveTime, this);
        this.scene.input.on(Phaser.Input.Events.GAME_OUT, this.resetSurfaces, this);
        document.addEventListener('visibilitychange', this.onVisibilityChanged);
        this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    }

    /** Set optional callback for wrong answers (shows explanation popup) */
    setOnWrongAnswer(callback: (problem: MathProblem, onDismiss: () => void) => void): void {
        this.onWrongAnswer = callback;
    }

    /** Set callback for speed charge bar integration. Callback receives charges + type, returns bonus damage from bar fills. */
    setSpeedChargeCallback(cb: (charges: number, type: 'swift' | 'lightning') => number): void {
        this.speedChargeCallback = cb;
    }

    /** Battle owns frozen per-child references; the board owns the first-answer gate. */
    setPersonalBonusCallback(cb: (answer: BattleAnswerEvidence) => PersonalAnswerBonus): void {
        this.personalBonusCallback = cb;
    }

    setActiveProblemChangedCallback(cb: (snapshot: MathBoardRemoteSnapshot | null) => void): void {
        this.activeProblemChangedCallback = cb;
    }

    /** Hide combat-only damage UI when the board is reused for practice flows. */
    setDamageDisplayEnabled(enabled: boolean): void {
        this.damageDisplayEnabled = enabled;
        this.damageText.setVisible(enabled && this.container.visible && !this.sequential);
        this.updateSequentialProgress();
    }

    /**
     * Load UI layouts from cached JSON data
     */
    private loadUILayouts(): void {
        try {
            const uiLayouts = this.scene.cache.json.get('uiLayouts');
            if (uiLayouts?.mathBoard) {
                this.uiLayoutsConfig = uiLayouts.mathBoard;
            }
        } catch (error) {
            console.warn('Failed to load UI layouts:', error);
        }
    }

    /**
     * Apply layout preset based on problem count
     */
    private applyLayoutForProblemCount(problemCount: number): void {
        if (!this.uiLayoutsConfig) return;

        // Find mapping for this problem count
        const mapping = this.uiLayoutsConfig.problemCountMappings.find(m => m.count === problemCount);
        const presetName = mapping?.presetName || this.uiLayoutsConfig.defaultPreset;
        const preset = this.uiLayoutsConfig.presets[presetName];

        if (preset?.params) {
            // Reset to defaults first
            this.layout = { ...DEFAULT_LAYOUT };

            // Apply preset params
            const params = preset.params;
            if (params.rowHeight !== undefined) this.layout.rowHeight = params.rowHeight;
            if (params.twoColumnThreshold !== undefined) this.layout.twoColumnThreshold = params.twoColumnThreshold;
            if (params.columnWidth !== undefined) this.layout.columnWidth = params.columnWidth;
            if (params.buttonSpacing !== undefined) this.layout.buttonSpacing = params.buttonSpacing;
            if (params.buttonSpacingTwoCol !== undefined) this.layout.buttonSpacingTwoCol = params.buttonSpacingTwoCol;
            if (params.buttonScale !== undefined) this.layout.buttonScale = params.buttonScale;
            if (params.buttonScaleTwoCol !== undefined) this.layout.buttonScaleTwoCol = params.buttonScaleTwoCol;
            if (params.hintY !== undefined) this.layout.hintY = params.hintY;
            if (params.hintScale !== undefined) this.layout.hintScale = params.hintScale;
            if (params.hintSpacing !== undefined) this.layout.hintSpacing = params.hintSpacing;
            if (params.problemTextX !== undefined) this.layout.problemTextX = params.problemTextX;
            if (params.problemTextXTwoCol !== undefined) this.layout.problemTextXTwoCol = params.problemTextXTwoCol;
            if (params.buttonStartX !== undefined) this.layout.buttonStartX = params.buttonStartX;
            if (params.buttonStartXTwoCol !== undefined) this.layout.buttonStartXTwoCol = params.buttonStartXTwoCol;
            if (params.damageTextYOffset !== undefined) this.layout.damageTextYOffset = params.damageTextYOffset;
            if (params.boardWidth !== undefined) this.layout.boardWidth = params.boardWidth;
            if (params.boardWidthTwoCol !== undefined) this.layout.boardWidthTwoCol = params.boardWidthTwoCol;
            if (params.boardHeightPadding !== undefined) this.layout.boardHeightPadding = params.boardHeightPadding;
            if (params.boardMinHeight !== undefined) this.layout.boardMinHeight = params.boardMinHeight;
        }
    }

    /**
     * Set custom layout values (for debug/testing)
     */
    setLayout(layout: MathBoardLayout): void {
        if (layout.rowHeight !== undefined) this.layout.rowHeight = layout.rowHeight;
        if (layout.columnWidth !== undefined) this.layout.columnWidth = layout.columnWidth;
        if (layout.buttonSpacing !== undefined) {
            this.layout.buttonSpacing = layout.buttonSpacing;
            this.layout.buttonSpacingTwoCol = Math.round(layout.buttonSpacing * 0.67);
        }
        if (layout.buttonScale !== undefined) {
            this.layout.buttonScale = layout.buttonScale;
            this.layout.buttonScaleTwoCol = layout.buttonScale * 0.71;
        }
        if (layout.hintY !== undefined) this.layout.hintY = layout.hintY;
        if (layout.hintScale !== undefined) this.layout.hintScale = layout.hintScale;
        if (layout.hintSpacing !== undefined) this.layout.hintSpacing = layout.hintSpacing;
        if (layout.problemTextX !== undefined) {
            this.layout.problemTextX = layout.problemTextX;
            this.layout.problemTextXTwoCol = layout.problemTextX + 10; // Slightly more right for two-col
        }
        if (layout.buttonStartX !== undefined) {
            this.layout.buttonStartX = layout.buttonStartX;
            this.layout.buttonStartXTwoCol = layout.buttonStartX - 10;
        }
        if (layout.damageTextYOffset !== undefined) this.layout.damageTextYOffset = layout.damageTextYOffset;
        if (layout.boardWidth !== undefined) {
            this.layout.boardWidth = layout.boardWidth;
            this.layout.boardWidthTwoCol = layout.boardWidth + 200; // Two-col is wider
        }
        if (layout.boardHeightPadding !== undefined) this.layout.boardHeightPadding = layout.boardHeightPadding;
        if (layout.boardMinHeight !== undefined) this.layout.boardMinHeight = layout.boardMinHeight;
    }

    /**
     * Get current layout values
     */
    getLayout(): typeof DEFAULT_LAYOUT {
        return { ...this.layout };
    }

    private create(): void {
        // Main container (centered for 1280x720, hidden by default)
        this.container = this.scene.add.container(640, 200);
        this.container.setVisible(false);
        this.container.setDepth(100);

        // Background board - will be resized based on problem count
        const board = this.scene.add.image(0, 0, 'ui-math-board');
        board.setName('board');
        this.container.add(board);

        // Visual hint container (positioned above problems)
        this.hintContainer = this.scene.add.container(0, 0);
        this.container.add(this.hintContainer);

        // Damage counter
        this.damageText = this.scene.add.text(0, 0, '', {
            fontSize: '24px',
            fontFamily: 'Arial, sans-serif',
            color: '#cc4444',
            fontStyle: 'bold',
        }).setOrigin(0.5);
        this.damageText.setVisible(false);
        this.container.add(this.damageText);

        this.comparisonHelpButton = new MedievalActionButton(this.scene, {
            x: 0,
            y: 0,
            depth: 102,
            width: 138,
            height: 42,
            label: 'NÁPOVĚDA',
            labelFontSize: 13,
            layout: 'text',
            accent: 0x4f7d42,
            onClick: () => this.revealManualComparisonHint(),
        });
        this.comparisonHelpButton.root.setVisible(false);
        this.container.add(this.comparisonHelpButton.root);
    }

    private createProblemRow(problem: MathProblem, index: number, totalProblems: number): ProblemRow {
        const useTwoColumns = totalProblems > this.layout.twoColumnThreshold;
        const rowHeight = this.layout.rowHeight;
        const columnWidth = this.layout.columnWidth;
        const buttonStartX = useTwoColumns ? this.layout.buttonStartXTwoCol : this.layout.buttonStartX;
        const buttonSpacing = useTwoColumns ? this.layout.buttonSpacingTwoCol : this.layout.buttonSpacing;
        const buttonScale = useTwoColumns ? this.layout.buttonScaleTwoCol : this.layout.buttonScale;

        // Calculate position
        let rowX = 0;
        let rowY = 0;

        if (useTwoColumns) {
            // Two-column layout: left column (even indices), right column (odd indices)
            const isLeftColumn = index % 2 === 0;
            const rowIndexInColumn = Math.floor(index / 2);
            const rowsPerColumn = Math.ceil(totalProblems / 2);

            rowX = isLeftColumn ? -columnWidth / 2 : columnWidth / 2;
            const startY = -((rowsPerColumn - 1) * rowHeight) / 2;
            rowY = startY + rowIndexInColumn * rowHeight;
        } else {
            // Single column layout
            const startY = -((totalProblems - 1) * rowHeight) / 2;
            rowY = startY + index * rowHeight;
        }

        const rowContainer = this.scene.add.container(rowX, rowY);

        // Problem text (left side) - smaller for two-column mode
        const problemString = formatMathProblem(problem, 'question');

        // Use smaller font for long problem strings (three-operand missing_part)
        const isLongString = problemString.length > 14;
        const fontSize = useTwoColumns ? 22 : (isLongString ? 24 : 32);
        const textX = useTwoColumns ? this.layout.problemTextXTwoCol : this.layout.problemTextX;

        // Determine text color based on source
        const textColor = this.getSourceTextColor(problem.source);

        const problemText = this.scene.add.text(textX, 0, problemString, {
            fontSize: `${fontSize}px`,
            fontFamily: 'Arial, sans-serif',
            color: textColor,
            fontStyle: 'bold',
            resolution: 2,
        }).setOrigin(0, 0.5);

        const buttonFrameWidth = this.scene.textures.getFrame('ui-button')?.width ?? 300;
        const problemRightLimit = buttonStartX - (buttonFrameWidth * buttonScale / 2) - PROBLEM_BUTTON_GAP;
        const problemAreaLeft = useTwoColumns
            ? -columnWidth / 2 + PROBLEM_AREA_PADDING
            : -this.layout.boardWidth / 2 + PROBLEM_AREA_PADDING;
        const problemAreaWidth = Math.max(1, problemRightLimit - problemAreaLeft);

        if (problemText.width > problemAreaWidth) {
            const minimumFontSize = useTwoColumns ? 16 : 20;
            const fittedFontSize = Math.max(
                minimumFontSize,
                Math.floor(fontSize * problemAreaWidth / problemText.width)
            );
            problemText.setFontSize(fittedFontSize);
        }

        let problemLeftX = textX;
        if (problemText.x + problemText.width > problemRightLimit) {
            problemText.setOrigin(1, 0.5).setX(problemRightLimit);
            problemLeftX = problemRightLimit - problemText.width;
        }
        rowContainer.add(problemText);

        let comparison: ComparisonExpressionView | undefined;
        if (getComparisonExpressions(problem)) {
            problemText.setVisible(false);
            comparison = new ComparisonExpressionView(this.scene, problem, {
                x: textX, y: 0, depth: problemText.depth, fontSize: useTwoColumns ? 22 : 32,
                color: textColor, compact: useTwoColumns, align: 'left',
            });
            comparison.root.setX(Math.min(textX, problemRightLimit - comparison.width));
            rowContainer.add(comparison.root);
            problemLeftX = comparison.root.x;
        }

        // Source label (pet, sword, or attack power bonus indicator)
        let sourceLabel: Phaser.GameObjects.Container | null = null;
        const hasAttackPowerBonus = problem.source !== 'pet' && problem.source !== 'sword'
            && problem.damageMultiplier && problem.damageMultiplier > 1;
        if (hasAttackPowerBonus) {
            const labelFontSize = useTwoColumns ? '12px' : '14px';
            const labelY = useTwoColumns ? -22 : -28;

            sourceLabel = this.scene.add.container(problemLeftX, labelY);
            const labelText = this.scene.add.text(0, 0, `${problem.damageMultiplier}× Síla`, {
                fontSize: labelFontSize,
                fontFamily: 'Arial, sans-serif',
                color: '#ff8844',
                fontStyle: 'bold',
            }).setOrigin(0, 0.5);
            sourceLabel.add(labelText);
            rowContainer.add(sourceLabel);
        }
        if (problem.source === 'pet' || problem.source === 'sword') {
            const labelColor = this.getSourceLabelColor(problem.source);
            const labelFontSize = useTwoColumns ? '12px' : '14px';
            const labelY = useTwoColumns ? -22 : -28;
            const iconScale = useTwoColumns ? 0.08 : 0.1;

            sourceLabel = this.scene.add.container(problemLeftX, labelY);

            if (problem.source === 'sword') {
                // Sword: use actual sword icon from shop-swords-sheet (frame 1 = iron sword)
                const swordIcon = this.scene.add.image(0, 0, 'shop-swords-sheet', 1)
                    .setScale(iconScale)
                    .setOrigin(0, 0.5);
                sourceLabel.add(swordIcon);

                const multiplier = problem.damageMultiplier || 1;
                const labelText = this.scene.add.text(18, 0, `${multiplier}`, {
                    fontSize: labelFontSize,
                    fontFamily: 'Arial, sans-serif',
                    color: labelColor,
                    fontStyle: 'bold',
                }).setOrigin(0, 0.5);
                sourceLabel.add(labelText);
            } else {
                // Pet: use emoji + text
                const multiplier = problem.damageMultiplier || 1;
                const labelText = this.scene.add.text(0, 0, `🐾 ⚔ ${multiplier}`, {
                    fontSize: labelFontSize,
                    fontFamily: 'Arial, sans-serif',
                    color: labelColor,
                    fontStyle: 'bold',
                }).setOrigin(0, 0.5);
                sourceLabel.add(labelText);
            }

            rowContainer.add(sourceLabel);
        }

        // Answer buttons (3 buttons on right side) - use configurable spacing/scale
        const buttons: Phaser.GameObjects.Container[] = [];

        for (let i = 0; i < 3; i++) {
            const displayValue = this.getChoiceDisplayValue(problem, i);

            const btn = this.createAnswerButton(
                buttonStartX + i * buttonSpacing,
                0,
                i,
                index,
                problem.choices[i],
                problem.choices[i] === problem.answer,
                buttonScale,
                displayValue
            );
            buttons.push(btn);
            rowContainer.add(btn);
        }

        // Status icon (shows ✓ or ✗ after answering)
        const statusX = problemLeftX - 18;
        const statusIcon = this.scene.add.text(statusX, 0, '', {
            fontSize: useTwoColumns ? '20px' : '28px',
            fontFamily: 'Arial, sans-serif',
            color: '#44aa44',
        }).setOrigin(0.5);
        rowContainer.add(statusIcon);

        // Initially disable non-first rows
        if (index !== 0) {
            this.setRowEnabled(buttons, false);
            rowContainer.setAlpha(0.5);
        }

        this.container.add(rowContainer);

        return {
            container: rowContainer,
            problemText,
            comparison,
            sourceLabel,
            buttons,
            statusIcon,
            problem,
            solved: false,
            correct: false,
        };
    }

    /**
     * Get color for source label
     */
    private getSourceLabelColor(source?: 'player' | 'pet' | 'sword'): string {
        if (source === 'pet') {
            return '#44aa44'; // Green
        } else if (source === 'sword') {
            return '#aa6644'; // Brown/orange
        }
        return '#666666';
    }

    /**
     * Get text color based on source
     */
    private getSourceTextColor(source?: 'player' | 'pet' | 'sword'): string {
        if (source === 'pet') {
            return '#2d7a2d'; // Darker green
        } else if (source === 'sword') {
            return '#8b5a2b'; // Brown
        }
        return '#333333'; // Default dark gray
    }

    private createAnswerButton(
        x: number,
        y: number,
        buttonIndex: number,
        rowIndex: number,
        value: number,
        isCorrect: boolean,
        scale: number = 0.28,
        displayValue?: string
    ): Phaser.GameObjects.Container {
        const bg = this.scene.add.image(0, 0, 'ui-button').setScale(scale);
        const isSign = displayValue === '<' || displayValue === '=' || displayValue === '>';
        const text = this.scene.add.text(0, -2, displayValue ?? value.toString(), {
            fontSize: scale < 0.25 ? '18px' : '22px',
            fontFamily: 'Arial, sans-serif', color: '#5a3825', fontStyle: 'bold', resolution: 2,
        }).setOrigin(0.5);
        const surface = this.scene.add.container(0, 0, [bg, text]);
        if (isSign) {
            text.setVisible(false);
            const glyphWidth = comparisonChoiceWidth(bg.displayWidth, bg.displayHeight) * 0.9;
            surface.add(comparisonGlyph(this.scene, value, true, glyphWidth).setName('comparisonChoiceGlyph'));
        }
        const container = this.scene.add.container(x, y, [surface]);
        // At the supported 1024 px tablet width, 55 game units give a 44 px target.
        container.setSize(bg.displayWidth, Math.max(bg.displayHeight, 55)).setInteractive({ useHandCursor: true });
        container.setData({ buttonIndex, rowIndex, value, isCorrect, text, bg, surface });
        container.on('pointerover', () => { if (container.input?.enabled) surface.setY(-2); });
        container.on('pointerout', () => surface.setY(0));
        container.on('pointerup', () => surface.setY(0));
        container.on('pointerdown', () => {
            if (!container.input?.enabled) return;
            surface.setY(1);
            this.handleAnswer(rowIndex, buttonIndex, isCorrect);
        });

        return container;
    }

    private getChoiceDisplayValue(problem: MathProblem, choiceIndex: number): string {
        if (problem.problemType === 'comparison' || problem.problemType === 'comparison_eq_vs_eq') {
            const comparisonSymbols = ['<', '=', '>'];
            return comparisonSymbols[problem.choices[choiceIndex]];
        }
        return problem.choices[choiceIndex].toString();
    }

    private setRowEnabled(buttons: Phaser.GameObjects.Container[], enabled: boolean): void {
        buttons.forEach(btn => {
            (btn.getData('surface') as Phaser.GameObjects.Container).setY(0);
            if (enabled) btn.setInteractive({ useHandCursor: true }); else btn.disableInteractive();
        });
    }

    show(problems: MathProblem[], options: MathBoardShowOptions = {}): void {
        this.cancelPending();
        this.boardActive = true;
        this.demoStage = undefined;
        this.completionDelivered = false;
        this.feedbackCheckpoints = [];
        this.currentAssisted = false;
        this.onComplete = this.originalOnComplete;
        this.scene.tweens.killTweensOf(this.container);
        this.support = normalizeComparisonSupport(options.support);
        this.defense = options.defense ?? null;
        this.telemetryContext=options.telemetryContext;
        this.sequential = Boolean(this.defense) || options.presentation === 'sequential'
            || Boolean(this.presentationFactory && options.presentation !== 'rows')
            || problems.some(problem => Boolean(problem.comparisonMeta) || problem.choices.length === 4);
        this.problems = problems;
        this.currentProblemIndex = 0;
        this.damageDealt = 0;
        this.results = [];
        this.timings = [];
        this.assisted = [];
        this.activeTimeMs = 0;
        problems.forEach(problem => {
            if (problem.comparisonMeta) {
                problem.comparisonMeta.assisted = false;
                problem.comparisonMeta.reminderShown = false;
                delete problem.comparisonMeta.selectedRelation;
            }
        });
        this.problemRows.forEach(row => row.container.destroy(true));
        this.problemRows = [];
        this.hintContainer.removeAll(true);
        this.comparisonHelpButton.root.setVisible(false);
        const board = this.container.getByName('board') as Phaser.GameObjects.Image;
        board.setVisible(!this.sequential);
        if (this.sequential) {
            if (!this.sequentialView) {
                this.sequentialView = this.presentationFactory?.(this.scene, () => this.replayComparisonDemo())
                    ?? new SequentialMathView(this.scene, () => this.replayComparisonDemo());
                this.container.add(this.sequentialView.root);
            }
            if (!this.rowsPosition) this.rowsPosition = { x: this.container.x, y: this.container.y };
            this.sequentialView.setDefense(this.defense);
            const parent = this.container.parentContainer;
            if (parent && this.presentationFactory) {
                const local = parent.getWorldTransformMatrix().applyInverse(this.sequentialView.origin.x, this.sequentialView.origin.y);
                this.container.setPosition(local.x, local.y);
            } else if (!parent) this.container.setPosition(this.sequentialView.origin.x, this.sequentialView.origin.y).setDepth(this.sequentialView.origin.depth);
            this.damageText.setVisible(false);
            if (problems[0]) this.renderSequentialQuestion();
        } else {
            this.sequentialView?.hide();
            if (this.rowsPosition) this.container.setPosition(this.rowsPosition.x, this.rowsPosition.y);
            this.rowsPosition = null;
            this.applyLayoutForProblemCount(problems.length);
            const useTwoColumns = problems.length > this.layout.twoColumnThreshold;
            const rowsToDisplay = useTwoColumns ? Math.ceil(problems.length / 2) : problems.length;
            const boardHeight = Math.max(this.layout.boardMinHeight, rowsToDisplay * this.layout.rowHeight + this.layout.boardHeightPadding);
            const boardWidth = useTwoColumns ? this.layout.boardWidthTwoCol : this.layout.boardWidth;
            board.setDisplaySize(boardWidth, boardHeight);
            for (let i = 0; i < problems.length; i++) this.problemRows.push(this.createProblemRow(problems[i], i, problems.length));
            this.problemRows.forEach(row => this.setRowEnabled(row.buttons, false));
            this.damageText.setY(boardHeight / 2 - this.layout.damageTextYOffset)
                .setText(this.personalBonusCallback ? '⚔ 0' : 'Poškození: 0').setVisible(this.damageDisplayEnabled);
            this.comparisonHelpButton.root.setPosition(boardWidth / 2 - 86, -boardHeight / 2 + 34);
            this.hintContainer.setY(this.layout.hintY);
        }
        this.container.setVisible(true).setAlpha(0).setScale(1);
        this.notifyActiveProblemChanged();
        const generation = this.generation;
        const openingDemo = problems.length > 0 && this.beginNumberIntroduction(true, true);
        this.scene.tweens.add({ targets: this.container, alpha: 1, duration: 200, onComplete: () => {
            if (generation !== this.generation || !problems.length || openingDemo) return;
            if (this.sequential && options.introduction && !problems[0].comparisonMeta?.exam) {
                this.demoStage = options.introduction;
                this.sequentialView!.playDemo(options.introduction, () => {
                    if (generation !== this.generation) return;
                    this.demoStage = undefined;
                    options.onIntroComplete?.();
                    this.renderSequentialQuestion();
                    this.activateQuestion();
                });
            } else this.activateQuestion(true, true, false);
        } });
        this.applyPauseState();
    }

    private renderSequentialQuestion(): void {
        this.sequentialView!.showQuestion(this.problems[this.currentProblemIndex], index => this.submitChoice(index));
        this.sequentialView!.setEnabled(false);
        this.updateSequentialProgress();
    }

    private updateSequentialProgress(): void {
        if (this.sequential) this.sequentialView?.updateProgress(this.currentProblemIndex, this.problems.length, this.results, this.damageDealt, this.damageDisplayEnabled);
    }

    private beginNumberIntroduction(resetTime: boolean, startObservation: boolean): boolean {
        const problem = this.problems[this.currentProblemIndex];
        const view = this.sequentialView;
        if (!this.sequential || !view?.playNumberDemo || problem.choices.length !== 4) return false;
        const intro = this.numberIntroduction?.(problem);
        if (!intro) return false;
        const generation = this.generation;
        this.acceptingAnswer = false;
        view.playNumberDemo(intro.lines, () => {
            if (this.generation !== generation) return;
            intro.complete();
            this.renderSequentialQuestion();
            this.activateQuestion(resetTime, startObservation, false);
        });
        this.notifyActiveProblemChanged();
        return true;
    }

    private activateQuestion(resetTime = true, startObservation = resetTime, allowDemo = true): void {
        if (resetTime) { this.activeTimeMs = 0; this.currentAssisted = false; }
        if (allowDemo && this.beginNumberIntroduction(resetTime, startObservation)) return;
        const problem = this.problems[this.currentProblemIndex];
        if (startObservation) {
            const context = this.defense ? 'battle_block' : problem.comparisonMeta?.exam || /Guild|Catacomb/.test(this.scene.sys.settings.key) ? 'exam' :
                problem.source === 'pet' ? 'battle_pet' : problem.source === 'sword' ? 'battle_sword' : 'battle';
            this.observation = observeMathProblem(problem, this.telemetryContext ?? context);
        }
        this.acceptingAnswer = true;
        if (this.sequential) this.sequentialView!.setEnabled(true);
        else {
            const row = this.problemRows[this.currentProblemIndex];
            row.container.setAlpha(1);
            this.setRowEnabled(row.buttons, true);
            this.scheduleHints(row.problem);
        }
        this.updateActiveTime(0, 0);
        this.applyPauseState();
        this.notifyActiveProblemChanged();
        this.checkpointChangedCallback?.();
    }

    private updateActiveTime(_time: number, delta: number): void {
        if (!this.acceptingAnswer || !this.container.visible || this.isSuspended()) return;
        this.activeTimeMs += Math.max(0, delta);
        if (!this.sequential) return;
        const meta = this.problems[this.currentProblemIndex]?.comparisonMeta;
        if (!meta || meta.exam || meta.assisted) return;
        if (!meta.showCrocodile && !meta.reminderShown && (meta.representation === 'number' || meta.representation === 'expression')) {
            const delay = meta.stage === 'number_symbol' ? comparisonHintDelay(this.support) : COMPARISON_LATER_HINT_DELAY_MS;
            if (this.activeTimeMs >= delay) {
                this.sequentialView!.showHints();
                meta.reminderShown = true;
                this.notifyActiveProblemChanged();
            }
        }
        if (meta.autoArithmeticHintMs && this.activeTimeMs >= meta.autoArithmeticHintMs) {
            this.sequentialView!.showArithmeticHint();
            meta.assisted = true;
            this.currentAssisted = true;
            this.observation?.assist('arithmetic_hint');
            this.notifyActiveProblemChanged();
        }
    }

    private readonly onVisibilityChanged = (): void => {
        this.applyPauseState();
        this.notifyActiveProblemChanged();
    };

    /** Independent reasons prevent an ability animation from undoing the user's pause. */
    suspend(reason = 'external'): void { this.suspensions.add(reason); this.applyPauseState(); this.notifyActiveProblemChanged(); }
    resume(reason = 'external'): void { this.suspensions.delete(reason); this.applyPauseState(); this.notifyActiveProblemChanged(); }
    isSuspended(): boolean { return this.suspensions.size > 0 || document.hidden; }

    private applyPauseState(): void {
        const paused = this.isSuspended();
        this.sequentialView?.setPaused(paused);
        if (this.sequential) this.sequentialView?.setEnabled(this.acceptingAnswer && !paused);
        else this.problemRows.forEach((row, index) => this.setRowEnabled(row.buttons,
            this.acceptingAnswer && index === this.currentProblemIndex && !paused));
        for (const timer of [this.hintTimer, this.advanceTimer, this.completionTimer]) if (timer) timer.paused = paused;
        this.scene.tweens.getTweensOf(this.container).forEach(tween => paused ? tween.pause() : tween.resume());
    }

    setCheckpointChangedCallback(callback: () => void): void { this.checkpointChangedCallback = callback; }

    exportCheckpoint(): MathBoardCheckpoint | null {
        if (!this.boardActive || !this.problems.length) return null;
        const stage: MathBoardCheckpoint['stage'] = this.currentProblemIndex >= this.problems.length ? 'complete'
            : this.results.length > this.currentProblemIndex ? 'feedback' : this.demoStage ? 'demo' : 'question';
        return structuredClone({ version: 1, problems: this.problems, index: this.currentProblemIndex,
            results: this.results, timings: this.timings, assisted: this.assisted, feedback: this.feedbackCheckpoints,
            damage: this.damageDealt, activeTimeMs: this.activeTimeMs, currentAssisted: this.currentAssisted,
            support: this.support, defense: this.defense, sequential: this.sequential, telemetryContext: this.telemetryContext,
            damageDisplayEnabled: this.damageDisplayEnabled, stage, demoStage: this.demoStage,
            completionDelivered: this.completionDelivered });
    }

    /** Restore accepted answers as presentation only; never resubmit or re-award a bonus. */
    restoreCheckpoint(saved: MathBoardCheckpoint, options: MathBoardShowOptions = {}): boolean {
        if (!validMathBoardCheckpoint(saved)) return false;
        const value = structuredClone(saved);
        const complete = this.onComplete;
        const notify = this.checkpointChangedCallback;
        this.checkpointChangedCallback = undefined;
        this.show(structuredClone(value.problems), { ...options, introduction: undefined,
            presentation: value.sequential ? 'sequential' : 'rows', support: value.support,
            defense: value.defense ?? undefined, telemetryContext: value.telemetryContext });
        this.scene.tweens.killTweensOf(this.container);
        this.container.setVisible(true).setAlpha(1);
        this.onComplete = complete;
        this.problems = value.problems;
        this.currentProblemIndex = value.index;
        this.results = value.results; this.timings = value.timings; this.assisted = value.assisted;
        this.feedbackCheckpoints = value.feedback; this.damageDealt = value.damage;
        this.activeTimeMs = value.activeTimeMs; this.currentAssisted = value.currentAssisted;
        this.completionDelivered = value.completionDelivered;
        this.damageDisplayEnabled = value.damageDisplayEnabled;
        this.demoStage = value.demoStage;
        this.problemRows.forEach((row, index) => {
            row.problem = this.problems[index];
            if (index < this.results.length) {
                row.solved = true; row.correct = this.results[index]; row.comparison?.reveal();
                row.statusIcon.setText(row.correct ? '✓' : '✗').setColor(row.correct ? '#44aa44' : '#cc4444');
            }
        });
        if (value.stage === 'complete') {
            if (this.sequential) {
                const last = this.problems.length - 1;
                this.sequentialView!.showQuestion(this.problems[last], () => undefined);
                this.sequentialView!.finishEntry?.();
                this.updateSequentialProgress();
                this.sequentialView!.setEnabled(false);
            }
            if (!this.completionDelivered) this.scheduleCompletion();
        } else {
            if (this.sequential) { this.renderSequentialQuestion(); this.sequentialView!.finishEntry?.(); }
            if (value.stage === 'feedback') {
                const feedback = this.feedbackCheckpoints[this.currentProblemIndex];
                const generation = this.generation;
                const done = () => { if (generation === this.generation) this.advanceAfterAnswer(); };
                if (this.sequential && this.sequentialView?.restoreFeedback) this.sequentialView.restoreFeedback(feedback, done);
                else if (this.sequential) this.sequentialView!.answer(feedback.correct, feedback.choiceIndex, done);
                else this.advanceAfterAnswer();
            } else if (value.stage === 'demo' && this.sequential && value.demoStage) {
                const generation = this.generation;
                this.sequentialView!.playDemo(value.demoStage, () => {
                    if (generation !== this.generation) return;
                    this.demoStage = undefined; options.onIntroComplete?.();
                    this.renderSequentialQuestion(); this.activateQuestion(false);
                });
            } else {
                const problem = this.problems[this.currentProblemIndex];
                this.activateQuestion(false, true);
                if (this.sequential && problem.comparisonMeta?.reminderShown) this.sequentialView!.showHints();
                if (this.sequential && problem.comparisonMeta?.assisted && problem.comparisonMeta.autoArithmeticHintMs) this.sequentialView!.showArithmeticHint();
            }
        }
        this.damageText.setText(this.personalBonusCallback ? `⚔ ${this.damageDealt}` : `Poškození: ${this.damageDealt}`)
            .setVisible(this.damageDisplayEnabled && !this.sequential);
        this.checkpointChangedCallback = notify;
        this.applyPauseState(); this.notifyActiveProblemChanged();
        return true;
    }

    private resetSurfaces(): void {
        this.sequentialView?.resetSurfaces();
        for (const row of this.problemRows) for (const button of row.buttons) (button.getData('surface') as Phaser.GameObjects.Container).setY(0);
    }

    private replayComparisonDemo(): void {
        const problem = this.problems[this.currentProblemIndex];
        if (!this.acceptingAnswer || this.isSuspended() || !problem?.comparisonMeta || problem.comparisonMeta.exam) return;
        problem.comparisonMeta.assisted = true;
        this.currentAssisted = true;
        this.observation?.assist('replayed_demo');
        this.acceptingAnswer = false;
        this.notifyActiveProblemChanged();
        const generation = this.generation;
        this.demoStage = problem.comparisonMeta.stage;
        this.sequentialView!.playDemo(problem.comparisonMeta.stage, () => {
            if (generation !== this.generation) return;
            this.demoStage = undefined;
            this.renderSequentialQuestion();
            this.activateQuestion(false);
        });
    }

    // Legacy single-problem support (for shield block, pet turn, etc.)
    showSingle(problem: MathProblem, onAnswer: (isCorrect: boolean, responseTimeMs: number, assisted: boolean, damage: number) => void, options: MathBoardShowOptions = {}): void {
        this.show([problem], options);
        this.onComplete = (damage, results, timings, assisted) => {
            this.onComplete = this.originalOnComplete;
            onAnswer(results[0] || false, timings[0] || 0, assisted[0] || false, damage);
        };
    }

    private scheduleHints(problem: MathProblem): void {
        this.hintContainer.removeAll(true);
        if (this.hintTimer) {
            this.hintTimer.destroy();
            this.hintTimer = null;
        }
        const manualHelp = problem.comparisonMeta?.stage === 'number_symbol'
            || problem.comparisonMeta?.stage === 'expression_independent';
        this.comparisonHelpButton.root.setVisible(manualHelp === true);
        this.comparisonHelpButton.setEnabled(manualHelp === true);
        const delayedArithmeticHint = problem.comparisonMeta?.autoArithmeticHintMs;
        if (delayedArithmeticHint && problem.comparisonMeta?.arithmeticHintText) {
            this.hintTimer = this.scene.time.delayedCall(Math.max(0, delayedArithmeticHint - this.activeTimeMs), () => {
                if (problem.comparisonMeta) problem.comparisonMeta.assisted = true;
                this.currentAssisted = true;
                this.observation?.assist('arithmetic_hint');
                this.displayComparisonArithmeticHint(problem);
            });
            this.hintTimer.paused = this.isSuspended();
            return;
        }
        if (problem.showVisualHint) this.showVisualHints(problem);
    }

    private revealManualComparisonHint(): void { this.replayComparisonDemo(); }

    private displayComparisonArithmeticHint(problem: MathProblem): void {
        this.hintContainer.removeAll(true);
        this.hintContainer.add(this.scene.add.text(0, 0, problem.comparisonMeta?.arithmeticHintText ?? '', {
            fontSize: '28px', fontFamily: 'Arial, sans-serif', color: '#3e6f45', fontStyle: 'bold', resolution: 2,
        }).setOrigin(0.5));
    }

    private showVisualHints(problem: MathProblem): void {
        // Clear any existing hints and cancel pending timer
        this.hintContainer.removeAll(true);
        this.comparisonHelpButton.root.setVisible(false);
        if (this.hintTimer) {
            this.hintTimer.destroy();
            this.hintTimer = null;
        }

        if (!problem.showVisualHint) return;

        // Delay hint appearance by 5 seconds
        this.hintTimer = this.scene.time.delayedCall(HINT_APPEAR_DELAY, () => {
            this.displayHintItems(problem);
            this.currentAssisted = true;
            this.observation?.assist('objects');
        });
    }

    private displayHintItems(problem: MathProblem): void {
        // Select a random item type for this problem
        const randomFrame = Phaser.Math.Between(0, HINT_ITEM_COUNT - 1);

        // Use configurable hint spacing and scale
        const hintSpacing = this.layout.hintSpacing;
        const hintScale = this.layout.hintScale;

        // Calculate total width to center everything
        const itemWidth = hintSpacing;
        const groupGap = 60;  // Gap between operand groups

        let totalItems = problem.operand1 + problem.operand2;
        if (problem.operand3) totalItems += problem.operand3;

        let startX = -((problem.operand1 * itemWidth) + groupGap + (problem.operand2 * itemWidth)) / 2;
        if (problem.operand3) {
            startX -= (groupGap + (problem.operand3 * itemWidth)) / 2;
        }

        let currentX = startX;
        let itemIndex = 0;

        const addGroup = (count: number) => {
            for (let i = 0; i < count; i++) {
                const item = this.scene.add.image(
                    currentX + (i * hintSpacing),
                    0,
                    'hint-items-sheet',
                    randomFrame
                );
                item.setScale(0).setAlpha(0);
                this.hintContainer.add(item);

                this.scene.tweens.add({
                    targets: item,
                    scale: hintScale,
                    alpha: 1,
                    duration: 200,
                    delay: itemIndex * 50,
                    ease: 'Back.easeOut',
                });
                itemIndex++;
            }
            currentX += (count * hintSpacing);
        };

        const addOp = (op: string) => {
            currentX += groupGap / 2;
            const opSymbol = this.scene.add.text(currentX - 15, 0, op, {
                fontSize: '28px',
                fontFamily: 'Arial, sans-serif',
                color: '#555555',
            }).setOrigin(0.5).setAlpha(0);
            this.hintContainer.add(opSymbol);

            this.scene.tweens.add({
                targets: opSymbol,
                alpha: 1,
                duration: 200,
                delay: itemIndex * 50,
            });
            itemIndex++;
            currentX += groupGap / 2;
        };

        addGroup(problem.operand1);
        addOp(problem.operator);
        addGroup(problem.operand2);

        if (problem.operand3 && problem.operator2) {
            addOp(problem.operator2);
            addGroup(problem.operand3);
        }
    }

    private handleAnswer(rowIndex: number, buttonIndex: number, _isCorrect: boolean): void {
        if (!this.acceptingAnswer || !this.container.visible || this.isSuspended() || rowIndex !== this.currentProblemIndex) return;
        const problem = this.problems[rowIndex];
        if (!problem || !Number.isInteger(buttonIndex) || buttonIndex < 0 || buttonIndex >= problem.choices.length) return;
        const isCorrect = problem.choices[buttonIndex] === problem.answer;
        const usedAssistance = this.currentAssisted || problem.comparisonMeta?.assisted === true;
        const responseTimeMs = this.answerClock ? this.answerClock(problem, isCorrect, usedAssistance) : this.activeTimeMs;
        if (responseTimeMs === null) return;
        // The same gate locks mouse, touch and remote before any feedback runs.
        this.acceptingAnswer = false;
        this.observation?.answer(observedChoice(problem,problem.choices[buttonIndex]),isCorrect,responseTimeMs,usedAssistance);
        if (problem.comparisonMeta) {
            problem.comparisonMeta.selectedRelation = (['less', 'equal', 'greater'] as const)[problem.choices[buttonIndex]];
        }
        this.timings.push(responseTimeMs);
        this.assisted.push(usedAssistance);
        this.results.push(isCorrect);
        sfx(this.scene, isCorrect ? 'math.correct' : 'math.retry');
        if (this.hintTimer) { this.hintTimer.remove(false); this.hintTimer = null; }
        this.hintContainer.removeAll(true);
        this.comparisonHelpButton.root.setVisible(false);
        this.notifyActiveProblemChanged();
        this.firstAnswerCallback?.({problem, choice:problem.choices[buttonIndex], correct:isCorrect,
            responseTimeMs, assisted:usedAssistance});

        let chargeBonusDamage = 0;
        let speedCharges = 0;
        const personalBonus = this.personalBonusCallback?.({ problem, correct: isCorrect,
            responseTimeMs, assisted: usedAssistance, defense: this.defense !== null });
        if (isCorrect && !this.defense) {
            if (personalBonus) {
                chargeBonusDamage = personalBonus.damage;
                speedCharges = personalBonus.damage;
            } else if (!usedAssistance && (problem.masteryKey || (problem.comparisonMeta && !problem.comparisonMeta.exam && !problem.comparisonMeta.diagnosticMode)) && responseTimeMs > 0) {
                const speed = MasterySystem.getInstance().getSpeedBonus(responseTimeMs, problem.masteryKey);
                if (speed.charges > 0 && speed.type !== 'none' && this.speedChargeCallback) {
                    speedCharges = speed.charges;
                    chargeBonusDamage = this.speedChargeCallback(speed.charges, speed.type);
                }
            }
            this.damageDealt += (problem.damageMultiplier || 1) + chargeBonusDamage;
        }
        const feedback: MathBoardFeedbackCheckpoint = { choiceIndex: buttonIndex, correct: isCorrect,
            speedCharges, blocked: 0, quickBlock: false };
        if (this.defense) {
            const quick = responseTimeMs > 0 && responseTimeMs < MasterySystem.getInstance().getMasteryRTThreshold(problem.masteryKey);
            feedback.blocked = calculateShieldAnswerBlock(this.defense.power, this.defense.incomingDamage, isCorrect, quick, usedAssistance);
            const base = calculateShieldAnswerBlock(this.defense.power, this.defense.incomingDamage, isCorrect, false, usedAssistance);
            feedback.quickBlock = feedback.blocked > base;
        }
        this.feedbackCheckpoints.push(feedback);
        if (this.sequential && problem.comparisonMeta?.stage === 'number_symbol' && !problem.comparisonMeta.exam) updateComparisonSupport(this.support, isCorrect);
        this.checkpointChangedCallback?.();
        if (this.sequential) {
            this.updateSequentialProgress();
            if (speedCharges > 0) this.sequentialView!.showSpeedBonus(speedCharges);
            if (this.defense) {
                this.sequentialView!.showDefenseResult(feedback.blocked, feedback.quickBlock);
            }
            const generation = this.generation;
            this.sequentialView!.answer(isCorrect, buttonIndex, () => {
                if (generation !== this.generation) return;
                const advance = () => { if (generation === this.generation) this.advanceAfterAnswer(); };
                if (!isCorrect && !problem.comparisonMeta && this.onWrongAnswer && !this.sequentialView?.handlesWrongFeedback) this.onWrongAnswer(problem, advance);
                else advance();
            });
            return;
        }

        const row = this.problemRows[rowIndex];
        row.solved = true;
        row.correct = isCorrect;
        row.comparison?.reveal();
        this.setRowEnabled(row.buttons, false);
        (row.buttons[buttonIndex].getData('bg') as Phaser.GameObjects.Image).setTint(isCorrect ? 0x88ff88 : 0xff8888);
        row.statusIcon.setText(isCorrect ? '✓' : '✗').setColor(isCorrect ? '#44aa44' : '#cc4444');
        if (!isCorrect) row.buttons.forEach(button => {
            if (button.getData('isCorrect')) (button.getData('bg') as Phaser.GameObjects.Image).setTint(0x88ff88);
        });
        this.damageText.setText(this.personalBonusCallback
            ? `⚔ ${this.damageDealt}${chargeBonusDamage ? `   ⚡ +${chargeBonusDamage}` : ''}`
            : `Poškození: ${this.damageDealt}`);
        if (isCorrect && this.damageDisplayEnabled) this.scene.tweens.add({ targets: this.damageText,
            scale: chargeBonusDamage > 0 ? 1.5 : 1.3, duration: 100, yoyo: true });
        if (!isCorrect && this.onWrongAnswer) {
            const generation = this.generation;
            this.onWrongAnswer(problem, () => { if (generation === this.generation) this.advanceAfterAnswer(); });
        } else this.advanceAfterAnswer();
    }

    submitChoice(choiceIndex: AnswerChoiceIndex): void {
        this.handleAnswer(this.currentProblemIndex, choiceIndex, false);
    }

    getActiveProblemSnapshot(): MathBoardRemoteSnapshot | null {
        if (!this.container.visible || !this.acceptingAnswer || this.isSuspended()) return null;
        const problem = this.problems[this.currentProblemIndex];
        if (!problem) return null;
        const meta = problem.comparisonMeta;
        const expressions = getComparisonExpressions(problem);
        return {
            problem: formatMathProblem(problem, 'question'),
            choices: problem.choices.map((_value, index) => ({ index: index as AnswerChoiceIndex, label: this.getChoiceDisplayValue(problem, index) })),
            comparison: meta ? {
                representation: meta.representation, left: meta.leftValue, right: meta.rightValue,
                numberedObjects: meta.stage === 'number_crocodile', crocodileChoices: meta.showCrocodile,
                showReminders: !meta.exam && this.sequentialView?.hints.some(hint => hint.visible) === true,
                expression: meta.representation === 'expression' ? `${problem.operand1} ${problem.operator} ${problem.operand2}` : undefined,
                arithmeticHint: meta.representation === 'expression' && meta.assisted ? meta.leftValue : undefined,
            } : expressions ? {
                representation: 'arithmetic', leftExpression: expressions.left, rightExpression: expressions.right,
                crocodileChoices: false, showReminders: false,
            } : undefined,
        };
    }

    private notifyActiveProblemChanged(): void {
        this.activeProblemChangedCallback?.(this.getActiveProblemSnapshot());
    }

    /** Preserve the full attack batch and invoke its completion exactly once. */
    private advanceAfterAnswer(): void {
        if (this.advanceTimer || this.completionTimer) return;
        const generation = this.generation;
        this.advanceTimer = this.scene.time.delayedCall(this.sequential ? 120 : 400, () => {
            this.advanceTimer = null;
            if (generation !== this.generation) return;
            this.currentProblemIndex++;
            if (this.currentProblemIndex < this.problems.length) {
                if (this.sequential) this.renderSequentialQuestion();
                this.activateQuestion();
            } else {
                this.scheduleCompletion();
                this.checkpointChangedCallback?.();
            }
        });
        this.advanceTimer.paused = this.isSuspended();
    }

    private scheduleCompletion(): void {
        if (this.completionDelivered || this.completionTimer) return;
        const generation = this.generation;
        this.completionTimer = this.scene.time.delayedCall(200, () => {
            this.completionTimer = null;
            if (generation !== this.generation || this.completionDelivered) return;
            this.completionDelivered = true;
            this.onComplete(this.damageDealt, [...this.results], [...this.timings], [...this.assisted]);
        });
        this.completionTimer.paused = this.isSuspended();
    }

    private cancelPending(): void {
        this.observation?.abandon();this.observation=null;
        this.generation++;
        this.acceptingAnswer = false;
        this.sequentialView?.cancel();
        for (const timer of [this.hintTimer, this.advanceTimer, this.completionTimer]) timer?.remove(false);
        this.hintTimer = null; this.advanceTimer = null; this.completionTimer = null;
    }

    hide(): void {
        this.boardActive = false;
        this.cancelPending();
        this.onComplete = this.originalOnComplete;
        this.scene.tweens.killTweensOf(this.container);
        this.sequentialView?.hide();
        this.problemRows.forEach(row => this.setRowEnabled(row.buttons, false));
        this.hintContainer.removeAll(true);
        this.comparisonHelpButton.root.setVisible(false);
        this.notifyActiveProblemChanged();
        const generation = this.generation;
        this.scene.tweens.add({ targets: this.container, alpha: 0, duration: 150, onComplete: () => {
            if (generation !== this.generation) return;
            this.container.setVisible(false);
            this.damageText.setVisible(false);
            this.problemRows.forEach(row => row.container.destroy(true));
            this.problemRows = [];
        } });
    }

    /** A scene may continue showing the result or a demonstration after the last question. */
    dispose(): void {
        if (!this.container.scene) return;
        this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
        this.destroy();
        this.scene.tweens.killTweensOf(this.container);
        this.container.destroy();
    }

    private destroy(): void {
        this.cancelPending();
        document.removeEventListener('visibilitychange', this.onVisibilityChanged);
        this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.updateActiveTime, this);
        this.scene.input.off(Phaser.Input.Events.GAME_OUT, this.resetSurfaces, this);
        this.sequentialView?.destroy();
        this.sequentialView = null;
    }

    // Get current damage for external display
    getDamageDealt(): number {
        return this.damageDealt;
    }

    // Check if board is currently showing
    isVisible(): boolean {
        return this.container.visible;
    }

    // Get container for debug registration
    getContainer(): Phaser.GameObjects.Container {
        return this.container;
    }

    /** Notification at the accepted first answer, before presentation/continuation. */
    /** A timed activity may close admission at the instant of a tap, before any answer telemetry or feedback. */
    setAnswerClock(clock: (problem: MathProblem, correct: boolean, assisted: boolean) => number | null): void { this.answerClock = clock; }

    setFirstAnswerCallback(callback:(answer:MathBoardFirstAnswer)=>void):void {
        this.firstAnswerCallback=callback;
    }
}
