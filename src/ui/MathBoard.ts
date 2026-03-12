import Phaser from 'phaser';
import { MathProblem } from '../types';
import { MasterySystem } from '../systems/MasterySystem';

// Visual hint configuration
const HINT_ITEM_COUNT = 8;      // Total items in spritesheet
const HINT_APPEAR_DELAY = 5000; // 5 second delay before hints appear

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

interface ProblemRow {
    container: Phaser.GameObjects.Container;
    problemText: Phaser.GameObjects.Text;
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
    private onComplete: (damageDealt: number, results: boolean[], timings: number[]) => void;
    private originalOnComplete: (damageDealt: number, results: boolean[], timings: number[]) => void; // Store original callback
    private hintTimer: Phaser.Time.TimerEvent | null = null;
    private completionTimer: Phaser.Time.TimerEvent | null = null; // Track pending onComplete callback
    private advanceTimer: Phaser.Time.TimerEvent | null = null; // Track 400ms delay between problems
    private onWrongAnswer?: (problem: MathProblem, onDismiss: () => void) => void; // Optional wrong answer callback

    // Multi-problem state
    private problems: MathProblem[] = [];
    private currentProblemIndex: number = 0;
    private damageDealt: number = 0;
    private results: boolean[] = [];
    private timings: number[] = [];            // Response time per problem (ms)
    private problemStartTime: number = 0;       // Timestamp when current problem activated

    // Configurable layout
    private layout = { ...DEFAULT_LAYOUT };

    // UI layouts config from ui-layouts.json
    private uiLayoutsConfig: {
        presets: Record<string, { name: string; params: Partial<typeof DEFAULT_LAYOUT> }>;
        problemCountMappings: Array<{ count: number; presetName: string }>;
        defaultPreset: string;
    } | null = null;

    constructor(scene: Phaser.Scene, onComplete: (damageDealt: number, results: boolean[], timings: number[]) => void) {
        this.scene = scene;
        this.onComplete = onComplete;
        this.originalOnComplete = onComplete; // Store original for restoration
        this.loadUILayouts();
        this.create();
    }

    /** Set optional callback for wrong answers (shows explanation popup) */
    setOnWrongAnswer(callback: (problem: MathProblem, onDismiss: () => void) => void): void {
        this.onWrongAnswer = callback;
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
    }

    private createProblemRow(problem: MathProblem, index: number, totalProblems: number): ProblemRow {
        const useTwoColumns = totalProblems > this.layout.twoColumnThreshold;
        const rowHeight = this.layout.rowHeight;
        const columnWidth = this.layout.columnWidth;

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
        // Display × for multiplication operator
        const displayOperator = problem.operator === '*' ? '×' : problem.operator;

        // Format problem string based on problem type
        let problemString: string;
        if (problem.problemType === 'missing_operand') {
            // Missing operand: "5 + ? = 8" (operand2 stores the result)
            // Three-operand variant: "4 + ? - 5 = 4" (operand3 + operator2 present)
            if (problem.operand3 !== undefined && problem.operator2) {
                const displayOp2 = problem.operator2 === '*' ? '×' : problem.operator2;
                problemString = `${problem.operand1} ${displayOperator} ? ${displayOp2} ${problem.operand3} = ${problem.operand2}`;
            } else {
                problemString = `${problem.operand1} ${displayOperator} ? = ${problem.operand2}`;
            }
        } else if (problem.problemType === 'comparison_eq_vs_eq') {
            // Equation vs equation: "3 + 2 ○ 4 - 1"
            const rightOp = problem.operator3 === '-' ? '-' : '+';
            problemString = `${problem.operand1} ${displayOperator} ${problem.operand2} ○ ${problem.operand3} ${rightOp} ${problem.operand4}`;
        } else if (problem.problemType === 'comparison') {
            if (problem.operand4 !== undefined && problem.operator2) {
                // Three-operand comparison: "1 + 3 - 2 ○ 2" (operand4 is the comparison target)
                const displayOp2 = problem.operator2 === '*' ? '×' : problem.operator2;
                problemString = `${problem.operand1} ${displayOperator} ${problem.operand2} ${displayOp2} ${problem.operand3} ○ ${problem.operand4}`;
            } else {
                // Two-operand comparison: "7 + 2 ○ 10" (operand3 stores the right side)
                problemString = `${problem.operand1} ${displayOperator} ${problem.operand2} ○ ${problem.operand3}`;
            }
        } else {
            // Standard: "5 + 3 = ?"
            problemString = `${problem.operand1} ${displayOperator} ${problem.operand2}`;
            if (problem.operand3 !== undefined && problem.operator2) {
                const displayOperator2 = problem.operator2 === '*' ? '×' : problem.operator2;
                problemString += ` ${displayOperator2} ${problem.operand3}`;
            }
            problemString += ' = ?';
        }

        // Use smaller font for long problem strings (three-operand missing_part)
        const isLongString = problemString.length > 14;
        const fontSize = useTwoColumns ? '22px' : (isLongString ? '24px' : '32px');
        const textX = useTwoColumns ? this.layout.problemTextXTwoCol : this.layout.problemTextX;

        // Determine text color based on source
        const textColor = this.getSourceTextColor(problem.source);

        const problemText = this.scene.add.text(textX, 0, problemString, {
            fontSize: fontSize,
            fontFamily: 'Arial, sans-serif',
            color: textColor,
            fontStyle: 'bold',
        }).setOrigin(0, 0.5);
        rowContainer.add(problemText);

        // Source label (pet, sword, or attack power bonus indicator)
        let sourceLabel: Phaser.GameObjects.Container | null = null;
        const hasAttackPowerBonus = problem.source !== 'pet' && problem.source !== 'sword'
            && problem.damageMultiplier && problem.damageMultiplier > 1;
        if (hasAttackPowerBonus) {
            const labelFontSize = useTwoColumns ? '12px' : '14px';
            const labelY = useTwoColumns ? -22 : -28;

            sourceLabel = this.scene.add.container(textX, labelY);
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

            sourceLabel = this.scene.add.container(textX, labelY);

            if (problem.source === 'sword') {
                // Sword: use actual sword icon from shop-swords-sheet (frame 1 = iron sword)
                const swordIcon = this.scene.add.image(0, 0, 'shop-swords-sheet', 1)
                    .setScale(iconScale)
                    .setOrigin(0, 0.5);
                sourceLabel.add(swordIcon);

                const multiplier = problem.damageMultiplier || 1;
                const labelText = this.scene.add.text(18, 0, `Meč (×${multiplier})`, {
                    fontSize: labelFontSize,
                    fontFamily: 'Arial, sans-serif',
                    color: labelColor,
                    fontStyle: 'bold',
                }).setOrigin(0, 0.5);
                sourceLabel.add(labelText);
            } else {
                // Pet: use emoji + text
                const multiplier = problem.damageMultiplier || 1;
                const labelText = this.scene.add.text(0, 0, `🐾 Mazlíček (×${multiplier})`, {
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
        const buttonStartX = useTwoColumns ? this.layout.buttonStartXTwoCol : this.layout.buttonStartX;
        const buttonSpacing = useTwoColumns ? this.layout.buttonSpacingTwoCol : this.layout.buttonSpacing;
        const buttonScale = useTwoColumns ? this.layout.buttonScaleTwoCol : this.layout.buttonScale;

        for (let i = 0; i < 3; i++) {
            // For comparison problems, display symbols instead of numbers
            let displayValue: string;
            if (problem.problemType === 'comparison' || problem.problemType === 'comparison_eq_vs_eq') {
                const comparisonSymbols = ['<', '=', '>'];
                displayValue = comparisonSymbols[problem.choices[i]];
            } else {
                displayValue = problem.choices[i].toString();
            }

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
        const statusX = useTwoColumns ? -185 : -210;
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
        // Use smaller button for multi-problem layout
        const bg = this.scene.add.image(0, 0, 'ui-button')
            .setScale(scale)
            .setInteractive({ useHandCursor: true });

        const fontSize = scale < 0.25 ? '18px' : '22px';
        const text = this.scene.add.text(0, -2, displayValue ?? value.toString(), {
            fontSize: fontSize,
            fontFamily: 'Arial, sans-serif',
            color: '#5a3825',
            fontStyle: 'bold',
        }).setOrigin(0.5);

        const container = this.scene.add.container(x, y, [bg, text]);
        container.setData('buttonIndex', buttonIndex);
        container.setData('rowIndex', rowIndex);
        container.setData('value', value);
        container.setData('isCorrect', isCorrect);
        container.setData('text', text);
        container.setData('bg', bg);

        // Hover effects
        const hoverScale = scale * 1.07;
        bg.on('pointerover', () => bg.setScale(hoverScale));
        bg.on('pointerout', () => {
            bg.setScale(scale);
            bg.setTexture('ui-button');
        });

        // Click handler
        bg.on('pointerdown', () => {
            bg.setTexture('ui-button-pressed');
            this.handleAnswer(rowIndex, buttonIndex, isCorrect);
        });

        return container;
    }

    private setRowEnabled(buttons: Phaser.GameObjects.Container[], enabled: boolean): void {
        buttons.forEach(btn => {
            const bg = btn.getData('bg') as Phaser.GameObjects.Image;
            if (enabled) {
                bg.setInteractive({ useHandCursor: true });
            } else {
                bg.disableInteractive();
            }
        });
    }

    show(problems: MathProblem[]): void {
        // DEBUG: Log problems being shown
        console.log('[MathBoard] Showing problems:', problems.map(p => ({
            problem: `${p.operand1} ${p.operator} ${p.operand2}${p.operand3 !== undefined ? ` ${p.operator2} ${p.operand3}` : ''} = ?`,
            answer: p.answer,
            choices: p.choices,
            correctInChoices: p.choices.includes(p.answer)
        })));

        // Apply layout preset based on problem count
        this.applyLayoutForProblemCount(problems.length);

        // Reset state
        this.problems = problems;
        this.currentProblemIndex = 0;
        this.damageDealt = 0;
        this.results = [];
        this.timings = [];
        this.problemStartTime = Date.now();

        // Clear old problem rows
        this.problemRows.forEach(row => row.container.destroy());
        this.problemRows = [];

        // Calculate board size based on problem count (using configurable layout)
        const useTwoColumns = problems.length > this.layout.twoColumnThreshold;
        const rowsToDisplay = useTwoColumns ? Math.ceil(problems.length / 2) : problems.length;
        const boardHeight = Math.max(this.layout.boardMinHeight, rowsToDisplay * this.layout.rowHeight + this.layout.boardHeightPadding);
        const boardWidth = useTwoColumns ? this.layout.boardWidthTwoCol : this.layout.boardWidth;
        const board = this.container.getByName('board') as Phaser.GameObjects.Image;
        board.setDisplaySize(boardWidth, boardHeight);

        // Create problem rows
        for (let i = 0; i < problems.length; i++) {
            const row = this.createProblemRow(problems[i], i, problems.length);
            this.problemRows.push(row);
        }

        // Position damage text at bottom
        this.damageText.setY(boardHeight / 2 - this.layout.damageTextYOffset);
        this.damageText.setText(`Poškození: 0`);
        this.damageText.setVisible(true);

        // Position hint container (using configurable hintY offset)
        this.hintContainer.setY(this.layout.hintY);

        // Show visual hints for first problem if enabled
        if (problems.length > 0 && problems[0].showVisualHint) {
            this.showVisualHints(problems[0]);
        }

        // Animate in
        this.container.setVisible(true);
        this.container.setAlpha(0);
        this.container.setScale(0.8);

        this.scene.tweens.add({
            targets: this.container,
            alpha: 1,
            scale: 1,
            duration: 200,
            ease: 'Back.easeOut',
        });
    }

    // Legacy single-problem support (for shield block, pet turn, etc.)
    showSingle(problem: MathProblem, onAnswer: (isCorrect: boolean, responseTimeMs: number) => void): void {
        const wrappedCallback = this.onComplete;
        this.onComplete = (damage, results, timings) => {
            onAnswer(results[0] || false, timings[0] || 0);
            this.onComplete = wrappedCallback;
        };
        this.show([problem]);
    }

    private showVisualHints(problem: MathProblem): void {
        // Clear any existing hints and cancel pending timer
        this.hintContainer.removeAll(true);
        if (this.hintTimer) {
            this.hintTimer.destroy();
            this.hintTimer = null;
        }

        if (!problem.showVisualHint) return;

        // Delay hint appearance by 5 seconds
        this.hintTimer = this.scene.time.delayedCall(HINT_APPEAR_DELAY, () => {
            this.displayHintItems(problem);
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

    private handleAnswer(rowIndex: number, buttonIndex: number, isCorrect: boolean): void {
        // Only handle if this is the current problem
        if (rowIndex !== this.currentProblemIndex) return;

        // Record response time for this problem
        const responseTimeMs = Date.now() - this.problemStartTime;
        this.timings.push(responseTimeMs);

        // Immediately cancel any pending hint timer to prevent wrong hints
        if (this.hintTimer) {
            this.hintTimer.destroy();
            this.hintTimer = null;
        }
        // Also clear visible hints immediately
        this.hintContainer.removeAll(true);

        const row = this.problemRows[rowIndex];
        const btn = row.buttons[buttonIndex];
        const bg = btn.getData('bg') as Phaser.GameObjects.Image;

        // Visual feedback
        if (isCorrect) {
            bg.setTint(0x88ff88);  // Green tint
            row.statusIcon.setText('✓');
            row.statusIcon.setColor('#44aa44');
            // Add damage with multiplier (from equipment bonuses)
            const multiplier = row.problem.damageMultiplier || 1;
            let totalHit = multiplier;

            // Speed bonus for mastery problems
            let speedLabel = '';
            if (row.problem.masteryKey && responseTimeMs > 0) {
                const speedBonus = MasterySystem.getInstance().getSpeedBonus(responseTimeMs);
                if (speedBonus.bonusDamage > 0 && speedBonus.type !== 'none') {
                    totalHit += speedBonus.bonusDamage;
                    speedLabel = speedBonus.type === 'lightning' ? ' ⚡' : ' ✨';
                }
            }

            this.damageDealt += totalHit;
            // Show hit detail on status icon
            if (totalHit > 1) {
                row.statusIcon.setText(`✓ ×${totalHit}${speedLabel}`);
            } else if (speedLabel) {
                row.statusIcon.setText(`✓${speedLabel}`);
            }
            row.correct = true;
        } else {
            bg.setTint(0xff8888);  // Red tint
            row.statusIcon.setText('✗');
            row.statusIcon.setColor('#cc4444');
            row.correct = false;

            // Highlight correct answer
            row.buttons.forEach(b => {
                if (b.getData('isCorrect')) {
                    const correctBg = b.getData('bg') as Phaser.GameObjects.Image;
                    correctBg.setTint(0x88ff88);
                }
            });
        }

        row.solved = true;
        this.results.push(isCorrect);

        // Disable this row's buttons
        this.setRowEnabled(row.buttons, false);

        // Update damage display
        this.damageText.setText(`Poškození: ${this.damageDealt}`);

        // Animate damage text on correct
        if (isCorrect) {
            this.scene.tweens.add({
                targets: this.damageText,
                scale: 1.3,
                duration: 100,
                yoyo: true,
            });
        }

        // If wrong and onWrongAnswer is set, show explanation instead of auto-advancing
        if (!isCorrect && this.onWrongAnswer) {
            const problem = row.problem;
            this.onWrongAnswer(problem, () => {
                this.advanceAfterAnswer();
            });
            return;
        }

        // Move to next problem or complete
        this.advanceAfterAnswer();
    }

    /** Advance to next problem or complete (called after answer or after wrong-answer popup dismissed) */
    private advanceAfterAnswer(): void {
        this.advanceTimer = this.scene.time.delayedCall(400, () => {
            this.advanceTimer = null;
            this.currentProblemIndex++;

            if (this.currentProblemIndex < this.problems.length) {
                // Start timing the next problem
                this.problemStartTime = Date.now();

                // Activate next row
                const nextRow = this.problemRows[this.currentProblemIndex];
                nextRow.container.setAlpha(1);
                this.setRowEnabled(nextRow.buttons, true);

                // Show hints for next problem if applicable
                const nextProblem = this.problems[this.currentProblemIndex];
                if (nextProblem.showVisualHint) {
                    this.showVisualHints(nextProblem);
                }

                // Highlight current row
                this.scene.tweens.add({
                    targets: nextRow.container,
                    scaleX: 1.02,
                    duration: 150,
                    yoyo: true,
                });
            } else {
                // All problems answered - complete (track the timer so it can be cancelled)
                this.completionTimer = this.scene.time.delayedCall(300, () => {
                    this.completionTimer = null;
                    this.onComplete(this.damageDealt, this.results, this.timings);
                });
            }
        });
    }

    hide(): void {
        // Cancel pending hint timer
        if (this.hintTimer) {
            this.hintTimer.destroy();
            this.hintTimer = null;
        }

        // Cancel pending advance delay (prevents completionTimer from being created after hide)
        if (this.advanceTimer) {
            this.advanceTimer.destroy();
            this.advanceTimer = null;
        }

        // Cancel pending completion callback (prevents race condition with block phase timer)
        if (this.completionTimer) {
            this.completionTimer.destroy();
            this.completionTimer = null;
        }

        // Restore original callback (in case showSingle was interrupted)
        this.onComplete = this.originalOnComplete;

        this.scene.tweens.add({
            targets: this.container,
            alpha: 0,
            scale: 0.8,
            duration: 150,
            onComplete: () => {
                this.container.setVisible(false);
                this.damageText.setVisible(false);

                // Clear problem rows
                this.problemRows.forEach(row => row.container.destroy());
                this.problemRows = [];

                // Clear hints
                this.hintContainer.removeAll(true);
            },
        });
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
}
