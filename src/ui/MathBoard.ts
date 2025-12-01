import Phaser from 'phaser';
import { MathProblem } from '../types';

// Visual hint configuration
const HINT_ITEM_COUNT = 8;      // Total items in spritesheet
const HINT_APPEAR_DELAY = 5000; // 5 second delay before hints appear
const HINT_ITEM_SCALE = 0.12;   // Scale down 200px items to ~24px display size
const HINT_SPACING = 30;        // Spacing between hint items

export class MathBoard {
    private scene: Phaser.Scene;
    private container!: Phaser.GameObjects.Container;
    private problemText!: Phaser.GameObjects.Text;
    private buttons: Phaser.GameObjects.Container[] = [];
    private hintContainer!: Phaser.GameObjects.Container;
    private onAnswer: (isCorrect: boolean) => void;
    private answerText: Phaser.GameObjects.Text | null = null;
    private hintTimer: Phaser.Time.TimerEvent | null = null;

    constructor(scene: Phaser.Scene, onAnswer: (isCorrect: boolean) => void) {
        this.scene = scene;
        this.onAnswer = onAnswer;
        this.create();
    }

    private create(): void {
        // Main container (centered, hidden by default)
        this.container = this.scene.add.container(400, 200);
        this.container.setVisible(false);
        this.container.setDepth(100);

        // Background board
        const board = this.scene.add.image(0, 0, 'math-board')
            .setDisplaySize(500, 300);
        this.container.add(board);

        // Problem text
        this.problemText = this.scene.add.text(0, -80, '', {
            fontSize: '48px',
            fontFamily: 'Arial, sans-serif',
            color: '#333333',
            fontStyle: 'bold',
        }).setOrigin(0.5);
        this.container.add(this.problemText);

        // Visual hint container
        this.hintContainer = this.scene.add.container(0, -20);
        this.container.add(this.hintContainer);

        // Answer buttons (3 buttons in a row, centered on light wood area)
        const buttonY = 65;
        const buttonSpacing = 115;
        const startX = -buttonSpacing;

        for (let i = 0; i < 3; i++) {
            const btn = this.createAnswerButton(startX + i * buttonSpacing, buttonY, i);
            this.buttons.push(btn);
            this.container.add(btn);
        }
    }

    private createAnswerButton(x: number, y: number, index: number): Phaser.GameObjects.Container {
        // Use image instead of rectangle, scaled to fit the board
        const bg = this.scene.add.image(0, 0, 'btn-answer')
            .setScale(0.35)
            .setInteractive({ useHandCursor: true });

        const text = this.scene.add.text(0, -3, '', {
            fontSize: '28px',
            fontFamily: 'Arial, sans-serif',
            color: '#5a3825',
            fontStyle: 'bold',
        }).setOrigin(0.5);

        const container = this.scene.add.container(x, y, [bg, text]);
        container.setData('index', index);
        container.setData('text', text);
        container.setData('bg', bg);

        // Hover: slight scale up from base 0.35
        bg.on('pointerover', () => bg.setScale(0.38));
        bg.on('pointerout', () => {
            bg.setScale(0.35);
            bg.setTexture('btn-answer');
        });
        // Pressed state: swap texture
        bg.on('pointerdown', () => {
            bg.setTexture('btn-answer-pressed');
            this.handleAnswer(index);
        });

        return container;
    }

    show(problem: MathProblem): void {
        // Set problem text
        let problemString = `${problem.operand1} ${problem.operator} ${problem.operand2}`;
        if (problem.operand3 !== undefined && problem.operator2) {
            problemString += ` ${problem.operator2} ${problem.operand3}`;
        }
        problemString += ' = ?';

        this.problemText.setText(problemString);

        // Set button values
        problem.choices.forEach((choice, i) => {
            const btn = this.buttons[i];
            btn.setData('value', choice);
            btn.setData('isCorrect', choice === problem.answer);
            (btn.getData('text') as Phaser.GameObjects.Text).setText(choice.toString());
        });

        // Show visual hints if enabled
        this.showVisualHints(problem);

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

        // Calculate total width to center everything
        const itemWidth = HINT_SPACING;
        const groupGap = 80;

        let totalItems = problem.operand1 + problem.operand2;
        if (problem.operand3) totalItems += problem.operand3;

        // Simple centering strategy: 
        // Group 1 | Op | Group 2 [| Op2 | Group 3]

        let startX = -((problem.operand1 * itemWidth) + groupGap + (problem.operand2 * itemWidth)) / 2;
        if (problem.operand3) {
            startX -= (groupGap + (problem.operand3 * itemWidth)) / 2;
        }

        let currentX = startX;
        let itemIndex = 0;

        // Helper to add a group of items
        const addGroup = (count: number) => {
            for (let i = 0; i < count; i++) {
                const item = this.scene.add.image(
                    currentX + (i * HINT_SPACING),
                    0,
                    'hints',
                    randomFrame
                );
                item.setScale(0).setAlpha(0);
                this.hintContainer.add(item);

                this.scene.tweens.add({
                    targets: item,
                    scale: HINT_ITEM_SCALE,
                    alpha: 1,
                    duration: 200,
                    delay: itemIndex * 50,
                    ease: 'Back.easeOut',
                });
                itemIndex++;
            }
            currentX += (count * HINT_SPACING);
        };

        // Helper to add operator
        const addOp = (op: string) => {
            currentX += groupGap / 2;
            const opSymbol = this.scene.add.text(currentX - 15, 0, op, {
                fontSize: '32px',
                fontFamily: 'Arial, sans-serif',
                color: '#666666',
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

        // Render groups
        addGroup(problem.operand1);
        addOp(problem.operator);
        addGroup(problem.operand2);

        if (problem.operand3 && problem.operator2) {
            addOp(problem.operator2);
            addGroup(problem.operand3);
        }
    }

    private handleAnswer(index: number): void {
        const btn = this.buttons[index];
        const isCorrect = btn.getData('isCorrect') as boolean;
        const bg = btn.getData('bg') as Phaser.GameObjects.Image;

        // Visual feedback with tint
        if (isCorrect) {
            bg.setTint(0x88ff88);  // Green tint
            // this.scene.sound.play('sfx-correct');
        } else {
            bg.setTint(0xff8888);  // Red tint
            // this.scene.sound.play('sfx-wrong');
        }

        // Disable all buttons
        this.buttons.forEach(b => {
            (b.getData('bg') as Phaser.GameObjects.Image).disableInteractive();
        });

        // Delay then callback
        this.scene.time.delayedCall(500, () => {
            this.onAnswer(isCorrect);
        });
    }

    showCorrectAnswer(problem: MathProblem): void {
        // Highlight the correct button with scale animation and tint
        this.buttons.forEach(btn => {
            if (btn.getData('isCorrect')) {
                const bg = btn.getData('bg') as Phaser.GameObjects.Image;
                this.scene.tweens.add({
                    targets: bg,
                    scale: 0.4,
                    duration: 200,
                    yoyo: true,
                    repeat: 2,
                    onStart: () => bg.setTint(0x88ff88),
                });
            }
        });

        // Show animated counting
        this.animateCorrectAnswer(problem);
    }

    private animateCorrectAnswer(problem: MathProblem): void {
        // Simple animation showing the answer
        this.answerText = this.scene.add.text(0, 120, `= ${problem.answer}`, {
            fontSize: '36px',
            fontFamily: 'Arial, sans-serif',
            color: '#44aa44',
            fontStyle: 'bold',
        }).setOrigin(0.5);

        this.container.add(this.answerText);

        this.scene.tweens.add({
            targets: this.answerText,
            scale: 1.2,
            duration: 300,
            yoyo: true,
        });
    }

    hide(): void {
        // Cancel pending hint timer
        if (this.hintTimer) {
            this.hintTimer.destroy();
            this.hintTimer = null;
        }

        this.scene.tweens.add({
            targets: this.container,
            alpha: 0,
            scale: 0.8,
            duration: 150,
            onComplete: () => {
                this.container.setVisible(false);
                // Re-enable buttons and reset image state
                this.buttons.forEach(btn => {
                    const bg = btn.getData('bg') as Phaser.GameObjects.Image;
                    bg.setInteractive({ useHandCursor: true });
                    bg.setTexture('btn-answer');
                    bg.setScale(0.35);
                    bg.clearTint();
                });
                // Remove answer text if it exists
                if (this.answerText) {
                    this.answerText.destroy();
                    this.answerText = null;
                }
                // Clear hints
                this.hintContainer.removeAll(true);
            },
        });
    }
}
