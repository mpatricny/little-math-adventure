import Phaser from 'phaser';
import { MathProblem } from '../types';

export class MathBoard {
    private scene: Phaser.Scene;
    private container!: Phaser.GameObjects.Container;
    private problemText!: Phaser.GameObjects.Text;
    private buttons: Phaser.GameObjects.Container[] = [];
    private hintContainer!: Phaser.GameObjects.Container;
    private onAnswer: (isCorrect: boolean) => void;

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
            color: '#333333',
            fontStyle: 'bold',
        }).setOrigin(0.5);
        this.container.add(this.problemText);

        // Visual hint container
        this.hintContainer = this.scene.add.container(0, -20);
        this.container.add(this.hintContainer);

        // Answer buttons (3 buttons in a row)
        const buttonY = 80;
        const buttonSpacing = 140;
        const startX = -buttonSpacing;

        for (let i = 0; i < 3; i++) {
            const btn = this.createAnswerButton(startX + i * buttonSpacing, buttonY, i);
            this.buttons.push(btn);
            this.container.add(btn);
        }
    }

    private createAnswerButton(x: number, y: number, index: number): Phaser.GameObjects.Container {
        const bg = this.scene.add.rectangle(0, 0, 100, 60, 0x4488cc, 1)
            .setInteractive({ useHandCursor: true });

        const text = this.scene.add.text(0, 0, '', {
            fontSize: '32px',
            color: '#ffffff',
            fontStyle: 'bold',
        }).setOrigin(0.5);

        const container = this.scene.add.container(x, y, [bg, text]);
        container.setData('index', index);
        container.setData('text', text);
        container.setData('bg', bg);

        bg.on('pointerover', () => bg.setFillStyle(0x5599dd));
        bg.on('pointerout', () => bg.setFillStyle(0x4488cc));
        bg.on('pointerdown', () => this.handleAnswer(index));

        return container;
    }

    show(problem: MathProblem): void {
        // Set problem text
        this.problemText.setText(`${problem.operand1} ${problem.operator} ${problem.operand2} = ?`);

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
        this.hintContainer.removeAll(true);

        if (!problem.showVisualHint) return;

        const spacing = 28;
        const group1Start = -((problem.operand1 - 1) * spacing) / 2 - 40;
        const group2Start = ((problem.operand2 - 1) * spacing) / 2 + 40;

        // First operand (apples on left)
        for (let i = 0; i < problem.operand1; i++) {
            const apple = this.scene.add.image(
                group1Start + i * spacing,
                0,
                'hints',
                0  // Frame 0 = apple
            ).setScale(0.8);
            this.hintContainer.add(apple);
        }

        // Operator symbol
        const opSymbol = this.scene.add.text(0, 0, problem.operator, {
            fontSize: '32px',
            color: '#666666',
        }).setOrigin(0.5);
        this.hintContainer.add(opSymbol);

        // Second operand (apples on right)
        for (let i = 0; i < problem.operand2; i++) {
            const apple = this.scene.add.image(
                group2Start + i * spacing,
                0,
                'hints',
                0
            ).setScale(0.8);
            this.hintContainer.add(apple);
        }
    }

    private handleAnswer(index: number): void {
        const btn = this.buttons[index];
        const isCorrect = btn.getData('isCorrect') as boolean;
        const bg = btn.getData('bg') as Phaser.GameObjects.Rectangle;

        // Visual feedback
        if (isCorrect) {
            bg.setFillStyle(0x44aa44);
            // this.scene.sound.play('sfx-correct');
        } else {
            bg.setFillStyle(0xaa4444);
            // this.scene.sound.play('sfx-wrong');
        }

        // Disable all buttons
        this.buttons.forEach(b => {
            (b.getData('bg') as Phaser.GameObjects.Rectangle).disableInteractive();
        });

        // Delay then callback
        this.scene.time.delayedCall(500, () => {
            this.onAnswer(isCorrect);
        });
    }

    showCorrectAnswer(problem: MathProblem): void {
        // Highlight the correct button
        this.buttons.forEach(btn => {
            if (btn.getData('isCorrect')) {
                const bg = btn.getData('bg') as Phaser.GameObjects.Rectangle;
                this.scene.tweens.add({
                    targets: bg,
                    fillColor: 0x44aa44,
                    duration: 200,
                    yoyo: true,
                    repeat: 2,
                });
            }
        });

        // Show animated counting
        this.animateCorrectAnswer(problem);
    }

    private animateCorrectAnswer(problem: MathProblem): void {
        // Simple animation showing the answer
        const answerText = this.scene.add.text(0, 120, `= ${problem.answer}`, {
            fontSize: '36px',
            color: '#44aa44',
            fontStyle: 'bold',
        }).setOrigin(0.5);

        this.container.add(answerText);

        this.scene.tweens.add({
            targets: answerText,
            scale: 1.2,
            duration: 300,
            yoyo: true,
        });
    }

    hide(): void {
        this.scene.tweens.add({
            targets: this.container,
            alpha: 0,
            scale: 0.8,
            duration: 150,
            onComplete: () => {
                this.container.setVisible(false);
                // Re-enable buttons and reset colors
                this.buttons.forEach(btn => {
                    const bg = btn.getData('bg') as Phaser.GameObjects.Rectangle;
                    bg.setInteractive({ useHandCursor: true });
                    bg.setFillStyle(0x4488cc);
                });
            },
        });
    }
}
