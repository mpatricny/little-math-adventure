import Phaser from 'phaser';
import { MathBoard, MathBoardLayout } from '../ui/MathBoard';
import { MathProblem } from '../types';

// Adjustable layout values
interface LayoutConfig {
    boardY: number;
    rowHeight: number;
    buttonSpacing: number;
    buttonScale: number;
    hintY: number;
    hintScale: number;
    hintSpacing: number;
    problemTextX: number;
    buttonStartX: number;
    damageYOffset: number;
    columnWidth: number;
    boardWidth: number;
    boardHeightPadding: number;
    boardMinHeight: number;
}

/**
 * Debug scene for testing MathBoard UI with different problem counts
 * Press arrow keys to move board, +/- to adjust values
 */
export class MathBoardDebugScene extends Phaser.Scene {
    private mathBoard!: MathBoard;
    private problemCountText!: Phaser.GameObjects.Text;
    private currentProblemCount: number = 4;
    private showHints: boolean = true;
    private hintsToggleText!: Phaser.GameObjects.Text;
    private statusText!: Phaser.GameObjects.Text;

    // Layout adjustment - these are the DEFAULT values from MathBoard
    private layout: LayoutConfig = {
        boardY: 350,
        rowHeight: 80,
        buttonSpacing: 75,
        buttonScale: 0.28,
        hintY: -80,
        hintScale: 0.15,
        hintSpacing: 35,
        problemTextX: -180,
        buttonStartX: 40,
        damageYOffset: 25,
        columnWidth: 380,
        boardWidth: 650,
        boardHeightPadding: 60,
        boardMinHeight: 200,
    };
    private selectedParam: keyof LayoutConfig = 'boardY';
    private layoutTexts: Map<string, Phaser.GameObjects.Text> = new Map();
    private infoPanel!: Phaser.GameObjects.Container;

    constructor() {
        super({ key: 'MathBoardDebugScene' });
    }

    create(): void {
        // Dark background
        this.add.rectangle(640, 360, 1280, 720, 0x222233);

        // Title
        this.add.text(640, 30, 'MATHBOARD DEBUG MODE', {
            fontSize: '28px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffff00',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        // Create MathBoard
        this.mathBoard = new MathBoard(this, (damage, results, _timings) => {
            this.onMathComplete(damage, results);
        });

        // Problem count selector
        this.createProblemCountSelector();

        // Hints toggle
        this.createHintsToggle();

        // Show button
        this.createShowButton();

        // Reset button
        this.createResetButton();

        // Back button
        this.createBackButton();

        // Layout controls panel
        this.createLayoutPanel();

        // Status text
        this.statusText = this.add.text(640, 700, 'Šipky: posun boardu | PageUp/Down: změna hodnoty | Tab: další parametr', {
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            color: '#888888'
        }).setOrigin(0.5);

        // Keyboard controls
        this.setupKeyboardControls();

        // Auto-show with 4 problems
        this.showMathBoard();
    }

    private createLayoutPanel(): void {
        this.infoPanel = this.add.container(120, 300);

        // Panel background (larger for more params)
        const bg = this.add.rectangle(0, 150, 220, 520, 0x000000, 0.8)
            .setStrokeStyle(2, 0x4488aa);
        this.infoPanel.add(bg);

        // Title
        const title = this.add.text(0, -100, 'LAYOUT EDITOR', {
            fontSize: '16px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffff00',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.infoPanel.add(title);

        // Layout parameters - all adjustable values
        const params: Array<{ key: keyof LayoutConfig; label: string }> = [
            { key: 'boardY', label: 'Board Y' },
            { key: 'rowHeight', label: 'Row Height' },
            { key: 'problemTextX', label: 'Text X' },
            { key: 'buttonStartX', label: 'Btn Start X' },
            { key: 'buttonSpacing', label: 'Btn Spacing' },
            { key: 'buttonScale', label: 'Btn Scale' },
            { key: 'hintY', label: 'Hint Y' },
            { key: 'hintScale', label: 'Hint Scale' },
            { key: 'hintSpacing', label: 'Hint Spacing' },
            { key: 'damageYOffset', label: 'Dmg Y Offset' },
            { key: 'columnWidth', label: 'Column W' },
            { key: 'boardWidth', label: 'Board Width' },
            { key: 'boardHeightPadding', label: 'Height Pad' },
            { key: 'boardMinHeight', label: 'Min Height' },
        ];

        params.forEach((param, index) => {
            const y = -50 + index * 32;
            const isSelected = param.key === this.selectedParam;

            // Label
            const label = this.add.text(-100, y, param.label + ':', {
                fontSize: '12px',
                fontFamily: 'Arial, sans-serif',
                color: isSelected ? '#00ff00' : '#aaaaaa'
            }).setOrigin(0, 0.5);
            label.setData('paramKey', param.key);
            this.infoPanel.add(label);

            // Value
            const value = this.add.text(90, y, this.formatValue(param.key), {
                fontSize: '12px',
                fontFamily: 'Arial, sans-serif',
                color: isSelected ? '#00ff00' : '#ffffff',
                fontStyle: 'bold'
            }).setOrigin(1, 0.5);
            value.setData('paramKey', param.key);
            this.layoutTexts.set(param.key, value);
            this.infoPanel.add(value);

            // Make clickable to select
            const hitArea = this.add.rectangle(0, y, 200, 28, 0x000000, 0)
                .setInteractive({ useHandCursor: true });
            hitArea.on('pointerdown', () => {
                this.selectedParam = param.key;
                this.updateLayoutDisplay();
            });
            this.infoPanel.add(hitArea);
        });

        // Instructions
        const instructions = this.add.text(0, 400, '↑↓: změna | Tab: další', {
            fontSize: '11px',
            fontFamily: 'Arial, sans-serif',
            color: '#666666',
            align: 'center'
        }).setOrigin(0.5);
        this.infoPanel.add(instructions);
    }

    private updateLayoutDisplay(): void {
        // Update all layout text colors
        this.layoutTexts.forEach((text, key) => {
            const isSelected = key === this.selectedParam;
            text.setColor(isSelected ? '#00ff00' : '#ffffff');
            text.setText(this.formatValue(key as keyof LayoutConfig));
        });

        // Update labels
        this.infoPanel.each((child: Phaser.GameObjects.GameObject) => {
            if (child instanceof Phaser.GameObjects.Text && child.getData('paramKey')) {
                const key = child.getData('paramKey') as keyof LayoutConfig;
                const isSelected = key === this.selectedParam;
                if (!this.layoutTexts.has(key)) {
                    child.setColor(isSelected ? '#00ff00' : '#aaaaaa');
                }
            }
        });
    }

    private formatValue(key: keyof LayoutConfig): string {
        const value = this.layout[key];
        if (key === 'buttonScale' || key === 'hintScale') {
            return value.toFixed(2);
        }
        return Math.round(value).toString();
    }

    private setupKeyboardControls(): void {
        // Arrow keys to move board position
        this.input.keyboard!.on('keydown-UP', () => {
            this.adjustSelectedParam(1);
        });

        this.input.keyboard!.on('keydown-DOWN', () => {
            this.adjustSelectedParam(-1);
        });

        this.input.keyboard!.on('keydown-PAGE_UP', () => {
            this.adjustSelectedParam(5);
        });

        this.input.keyboard!.on('keydown-PAGE_DOWN', () => {
            this.adjustSelectedParam(-5);
        });

        // Tab to cycle through parameters
        this.input.keyboard!.on('keydown-TAB', (event: KeyboardEvent) => {
            event.preventDefault();
            this.cycleSelectedParam();
        });

        // Enter to apply changes
        this.input.keyboard!.on('keydown-ENTER', () => {
            this.applyLayoutChanges();
        });

        // Space to refresh board
        this.input.keyboard!.on('keydown-SPACE', () => {
            this.showMathBoard();
        });
    }

    private adjustSelectedParam(direction: number): void {
        const steps: Record<keyof LayoutConfig, number> = {
            boardY: 10,
            rowHeight: 5,
            buttonSpacing: 5,
            buttonScale: 0.02,
            hintY: 10,
            hintScale: 0.02,
            hintSpacing: 5,
            problemTextX: 10,
            buttonStartX: 10,
            damageYOffset: 5,
            columnWidth: 20,
            boardWidth: 25,
            boardHeightPadding: 10,
            boardMinHeight: 20,
        };

        const step = steps[this.selectedParam];
        this.layout[this.selectedParam] += step * direction;

        // Clamp values to reasonable ranges
        this.layout.buttonScale = Phaser.Math.Clamp(this.layout.buttonScale, 0.15, 0.5);
        this.layout.hintScale = Phaser.Math.Clamp(this.layout.hintScale, 0.08, 0.3);
        this.layout.rowHeight = Phaser.Math.Clamp(this.layout.rowHeight, 50, 150);
        this.layout.buttonSpacing = Phaser.Math.Clamp(this.layout.buttonSpacing, 40, 120);
        this.layout.columnWidth = Phaser.Math.Clamp(this.layout.columnWidth, 300, 500);
        this.layout.hintSpacing = Phaser.Math.Clamp(this.layout.hintSpacing, 20, 60);
        this.layout.damageYOffset = Phaser.Math.Clamp(this.layout.damageYOffset, 10, 80);
        this.layout.boardWidth = Phaser.Math.Clamp(this.layout.boardWidth, 400, 1000);
        this.layout.boardHeightPadding = Phaser.Math.Clamp(this.layout.boardHeightPadding, 20, 150);
        this.layout.boardMinHeight = Phaser.Math.Clamp(this.layout.boardMinHeight, 100, 400);

        this.updateLayoutDisplay();

        // Live update - refresh board immediately
        this.showMathBoard();
    }

    private cycleSelectedParam(): void {
        const params: Array<keyof LayoutConfig> = [
            'boardY', 'rowHeight', 'problemTextX', 'buttonStartX', 'buttonSpacing',
            'buttonScale', 'hintY', 'hintScale', 'hintSpacing', 'damageYOffset', 'columnWidth',
            'boardWidth', 'boardHeightPadding', 'boardMinHeight'
        ];
        const currentIndex = params.indexOf(this.selectedParam);
        const nextIndex = (currentIndex + 1) % params.length;
        this.selectedParam = params[nextIndex];
        this.updateLayoutDisplay();
    }

    private applyLayoutChanges(): void {
        // Re-show board with new layout
        this.showMathBoard();
        this.statusText.setText('Layout aplikován!');
        this.statusText.setColor('#00ff00');

        // Log current values for copy-paste
        console.log('Current MathBoard Layout:');
        console.log(JSON.stringify(this.layout, null, 2));
    }

    private createProblemCountSelector(): void {
        const y = 80;

        this.add.text(300, y, 'Počet příkladů:', {
            fontSize: '18px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff'
        }).setOrigin(0, 0.5);

        // Buttons for 1-6 problems
        const counts = [1, 2, 3, 4, 5, 6];
        counts.forEach((count, index) => {
            const btnX = 450 + index * 55;
            const btn = this.add.text(btnX, y, count.toString(), {
                fontSize: '22px',
                fontFamily: 'Arial, sans-serif',
                color: count === this.currentProblemCount ? '#00ff00' : '#888888',
                backgroundColor: count === this.currentProblemCount ? '#004400' : '#333333',
                padding: { x: 12, y: 6 }
            }).setOrigin(0.5).setInteractive({ useHandCursor: true });

            btn.setData('count', count);

            btn.on('pointerover', () => {
                if (count !== this.currentProblemCount) {
                    btn.setColor('#ffffff');
                }
            });

            btn.on('pointerout', () => {
                if (count !== this.currentProblemCount) {
                    btn.setColor('#888888');
                }
            });

            btn.on('pointerdown', () => {
                this.currentProblemCount = count;
                this.updateProblemCountButtons();
                this.showMathBoard();
            });
        });

        this.problemCountText = this.add.text(800, y, '', {
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            color: '#888888'
        }).setOrigin(0, 0.5);
    }

    private updateProblemCountButtons(): void {
        this.children.each((child) => {
            if (child instanceof Phaser.GameObjects.Text && child.getData('count') !== undefined) {
                const count = child.getData('count') as number;
                if (count === this.currentProblemCount) {
                    child.setColor('#00ff00');
                    child.setBackgroundColor('#004400');
                } else {
                    child.setColor('#888888');
                    child.setBackgroundColor('#333333');
                }
            }
        });
    }

    private createHintsToggle(): void {
        const y = 120;

        this.add.text(300, y, 'Vizuální nápovědy:', {
            fontSize: '18px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff'
        }).setOrigin(0, 0.5);

        this.hintsToggleText = this.add.text(500, y, this.showHints ? 'ZAP' : 'VYP', {
            fontSize: '18px',
            fontFamily: 'Arial, sans-serif',
            color: this.showHints ? '#00ff00' : '#ff4444',
            backgroundColor: this.showHints ? '#004400' : '#440000',
            padding: { x: 12, y: 6 }
        }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });

        this.hintsToggleText.on('pointerdown', () => {
            this.showHints = !this.showHints;
            this.hintsToggleText.setText(this.showHints ? 'ZAP' : 'VYP');
            this.hintsToggleText.setColor(this.showHints ? '#00ff00' : '#ff4444');
            this.hintsToggleText.setBackgroundColor(this.showHints ? '#004400' : '#440000');
        });

        this.add.text(570, y, '(po 5s)', {
            fontSize: '12px',
            fontFamily: 'Arial, sans-serif',
            color: '#666666'
        }).setOrigin(0, 0.5);
    }

    private createShowButton(): void {
        const btn = this.add.text(950, 100, 'ZOBRAZIT', {
            fontSize: '20px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            backgroundColor: '#2266aa',
            padding: { x: 15, y: 8 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        btn.on('pointerover', () => btn.setBackgroundColor('#3388cc'));
        btn.on('pointerout', () => btn.setBackgroundColor('#2266aa'));
        btn.on('pointerdown', () => this.showMathBoard());
    }

    private createResetButton(): void {
        const btn = this.add.text(1080, 100, 'RESET', {
            fontSize: '20px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            backgroundColor: '#aa6622',
            padding: { x: 15, y: 8 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        btn.on('pointerover', () => btn.setBackgroundColor('#cc8844'));
        btn.on('pointerout', () => btn.setBackgroundColor('#aa6622'));
        btn.on('pointerdown', () => {
            this.mathBoard.hide();
            this.statusText.setText('Board skryt');
            this.statusText.setColor('#aaaaaa');
        });
    }

    private createBackButton(): void {
        const btn = this.add.text(80, 30, '< ZPĚT', {
            fontSize: '18px',
            fontFamily: 'Arial, sans-serif',
            color: '#aaaaaa',
            backgroundColor: '#333333',
            padding: { x: 12, y: 6 }
        }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });

        btn.on('pointerover', () => btn.setColor('#ffffff'));
        btn.on('pointerout', () => btn.setColor('#aaaaaa'));
        btn.on('pointerdown', () => this.scene.start('TownScene'));
    }

    private generateTestProblems(count: number): MathProblem[] {
        const problems: MathProblem[] = [];

        const testCases = [
            { op1: 3, op2: 2, operator: '+' as const, answer: 5 },
            { op1: 7, op2: 4, operator: '-' as const, answer: 3 },
            { op1: 5, op2: 3, operator: '+' as const, answer: 8 },
            { op1: 9, op2: 6, operator: '-' as const, answer: 3 },
            { op1: 4, op2: 4, operator: '+' as const, answer: 8 },
            { op1: 8, op2: 5, operator: '-' as const, answer: 3 },
        ];

        for (let i = 0; i < count; i++) {
            const test = testCases[i % testCases.length];
            const wrongAnswers = this.generateWrongAnswers(test.answer);

            problems.push({
                id: `debug_${i}`,
                operand1: test.op1,
                operand2: test.op2,
                operator: test.operator,
                answer: test.answer,
                choices: this.shuffle([test.answer, ...wrongAnswers]),
                showVisualHint: this.showHints,
                hintType: 'apples'
            });
        }

        return problems;
    }

    private generateWrongAnswers(correct: number): number[] {
        const wrong: number[] = [];
        while (wrong.length < 2) {
            const offset = Phaser.Math.Between(-3, 3);
            const value = correct + offset;
            if (value >= 0 && value !== correct && !wrong.includes(value)) {
                wrong.push(value);
            }
        }
        return wrong;
    }

    private shuffle<T>(arr: T[]): T[] {
        const result = [...arr];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }

    private showMathBoard(): void {
        // Hide current board first
        if (this.mathBoard.isVisible()) {
            this.mathBoard.hide();
        }

        // Apply configurable layout to MathBoard
        const layoutToApply: MathBoardLayout = {
            rowHeight: this.layout.rowHeight,
            columnWidth: this.layout.columnWidth,
            buttonSpacing: this.layout.buttonSpacing,
            buttonScale: this.layout.buttonScale,
            hintY: this.layout.hintY,
            hintScale: this.layout.hintScale,
            hintSpacing: this.layout.hintSpacing,
            problemTextX: this.layout.problemTextX,
            buttonStartX: this.layout.buttonStartX,
            damageTextYOffset: this.layout.damageYOffset,
            boardWidth: this.layout.boardWidth,
            boardHeightPadding: this.layout.boardHeightPadding,
            boardMinHeight: this.layout.boardMinHeight,
        };

        console.log('[Debug] Applying layout:', layoutToApply);
        this.mathBoard.setLayout(layoutToApply);

        // Generate and show problems
        const problems = this.generateTestProblems(this.currentProblemCount);

        // Small delay to ensure hide animation completes
        this.time.delayedCall(50, () => {
            // Apply board Y position
            const container = this.mathBoard.getContainer();
            container.setY(this.layout.boardY);

            this.mathBoard.show(problems);

            // Log actual layout after show
            console.log('[Debug] MathBoard layout after show:', this.mathBoard.getLayout());
        });

        this.statusText.setText(`${this.currentProblemCount} příkladů | ↑↓: změna | Tab: další`);
        this.statusText.setColor('#88ff88');
    }

    private onMathComplete(damage: number, results: boolean[]): void {
        const correct = results.filter(r => r).length;
        const total = results.length;

        this.statusText.setText(`Hotovo! Správně: ${correct}/${total} | Space: další test`);
        this.statusText.setColor(correct === total ? '#00ff00' : '#ffaa00');

        // Don't auto-hide in debug mode - let user press space
    }
}
