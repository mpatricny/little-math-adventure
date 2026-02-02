import Phaser from 'phaser';
import { JourneySystem } from '../systems/JourneySystem';

/**
 * Puzzle template interfaces
 */
interface NumberBridgeTemplate {
    sequence: (number | null)[];
    pattern: string;
    answers: number[];
    options: number[];
}

interface BalanceScaleTemplate {
    left: string;
    right: string;
    answer: number;
    options: number[];
}

interface PathChoiceTemplate {
    paths: { equation: string; correct: boolean }[];
}

interface FeedingTemplate {
    target: number;
    items: { emoji: string; value: number }[];
}

interface PuzzleConfig {
    id: string;
    name: string;
    nameCs: string;
    type: string;
    difficulty: string;
    timeLimit: number;
    failDamage?: number;
    successBonus?: { gold?: number; bossAtkReduction?: number };
    failPenalty?: { extraBattle?: string };
    optional?: boolean;
    templates: (NumberBridgeTemplate | BalanceScaleTemplate | PathChoiceTemplate | FeedingTemplate)[];
}

/**
 * ForestPuzzleScene - Math puzzle mini-games during forest journey
 * 
 * Puzzle types:
 * - Number Bridge: Complete the sequence
 * - Balance Scale: Balance the equation
 * - Path Choice: Choose correct equation
 * - Feeding Puzzle: Sum items to target
 */
export class ForestPuzzleScene extends Phaser.Scene {
    private journeySystem = JourneySystem.getInstance();
    private puzzleId: string = '';
    private puzzleConfig: PuzzleConfig | null = null;
    private currentTemplate: unknown = null;
    
    // UI elements
    private timerText!: Phaser.GameObjects.Text;
    private timerEvent!: Phaser.Time.TimerEvent;
    private timeRemaining: number = 60;
    
    // Puzzle state
    private selectedAnswers: number[] = [];
    private requiredAnswers: number[] = [];
    private answerSlots: Phaser.GameObjects.Container[] = [];
    private optionButtons: Phaser.GameObjects.Container[] = [];
    
    // Feeding puzzle state
    private feedingTargetSum: number = 0;
    private feedingCurrentSum: number = 0;
    private feedingSumText: Phaser.GameObjects.Text | null = null;

    constructor() {
        super({ key: 'ForestPuzzleScene' });
    }

    init(data: { puzzleId: string }) {
        this.puzzleId = data.puzzleId;
        this.selectedAnswers = [];
        this.requiredAnswers = [];
    }

    preload(): void {
        if (!this.cache.json.has('forestPuzzles')) {
            this.load.json('forestPuzzles', 'assets/data/forest-puzzles.json');
        }
    }

    create(): void {
        // Load puzzle config
        const puzzlesData = this.cache.json.get('forestPuzzles');
        this.puzzleConfig = puzzlesData?.puzzles?.[this.puzzleId] ?? null;

        if (!this.puzzleConfig) {
            console.error('Puzzle not found:', this.puzzleId);
            this.returnToMap(false);
            return;
        }

        // Select random template
        const templates = this.puzzleConfig.templates;
        this.currentTemplate = templates[Math.floor(Math.random() * templates.length)];

        // Background
        if (this.textures.exists('bg-forest')) {
            this.add.image(640, 360, 'bg-forest');
        } else {
            this.add.rectangle(640, 360, 1280, 720, 0x2a4a3a);
        }

        // Render puzzle based on type
        switch (this.puzzleConfig.type) {
            case 'sequence':
                this.renderNumberBridge();
                break;
            case 'equation':
                this.renderBalanceScale();
                break;
            case 'multiple_choice':
                this.renderPathChoice();
                break;
            case 'sum_to_target':
                this.renderFeedingPuzzle();
                break;
            default:
                this.renderGenericPuzzle();
        }

        // Timer
        this.timeRemaining = this.puzzleConfig.timeLimit;
        this.createTimer();

        // Title
        this.add.text(640, 40, this.puzzleConfig.nameCs || this.puzzleConfig.name, {
            fontSize: '32px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5);
    }

    /**
     * Number Bridge - Complete the sequence by filling gaps
     */
    private renderNumberBridge(): void {
        const template = this.currentTemplate as NumberBridgeTemplate;
        this.requiredAnswers = [...template.answers];

        // Stone stepping positions
        const startX = 250;
        const stoneY = 500;
        const stoneSpacing = 130;
        const stoneWidth = 100;
        const stoneHeight = 80;

        // Track which slots need answers
        let answerSlotIndex = 0;

        // Render sequence stones
        template.sequence.forEach((value, index) => {
            const x = startX + index * stoneSpacing;
            
            // Stone base
            this.add.rectangle(x, stoneY, stoneWidth, stoneHeight, 0x8B7355)
                .setStrokeStyle(4, 0x5D4E37);
            
            // Add rounded look
            this.add.ellipse(x, stoneY - 30, stoneWidth - 10, 20, 0x9D8B7A);

            if (value === null) {
                // Empty slot - needs answer
                const slotContainer = this.add.container(x, stoneY);
                
                const slotBg = this.add.rectangle(0, 0, 60, 60, 0x444444, 0.8)
                    .setStrokeStyle(3, 0x88ccff);
                
                const questionMark = this.add.text(0, 0, '?', {
                    fontSize: '36px',
                    fontFamily: 'Arial, sans-serif',
                    color: '#88ccff',
                    fontStyle: 'bold'
                }).setOrigin(0.5);

                slotContainer.add([slotBg, questionMark]);
                slotContainer.setData('slotIndex', answerSlotIndex);
                slotContainer.setData('filled', false);
                this.answerSlots.push(slotContainer);
                answerSlotIndex++;
            } else {
                // Show number
                this.add.text(x, stoneY, value.toString(), {
                    fontSize: '32px',
                    fontFamily: 'Arial, sans-serif',
                    color: '#ffffff',
                    fontStyle: 'bold',
                    stroke: '#333333',
                    strokeThickness: 3
                }).setOrigin(0.5);
            }
        });

        // Render floating answer options
        const optionsY = 200;
        const optionSpacing = 120;
        const optionsStartX = 640 - ((template.options.length - 1) * optionSpacing) / 2;

        template.options.forEach((option, index) => {
            const x = optionsStartX + index * optionSpacing;
            this.createOptionButton(x, optionsY, option);
        });

        // Instructions
        this.add.text(640, 650, 'Doplň chybějící čísla v posloupnosti!', {
            fontSize: '24px',
            fontFamily: 'Arial, sans-serif',
            color: '#aaddaa',
            fontStyle: 'italic'
        }).setOrigin(0.5);
    }

    /**
     * Balance Scale - Find the missing value to balance
     */
    private renderBalanceScale(): void {
        const template = this.currentTemplate as BalanceScaleTemplate;
        this.requiredAnswers = [template.answer];

        // Scale visual
        const scaleX = 640;
        const scaleY = 400;

        // Scale post
        this.add.rectangle(scaleX, scaleY + 100, 20, 200, 0x8B4513);
        
        // Scale beam
        this.add.rectangle(scaleX, scaleY - 50, 400, 15, 0x8B4513);

        // Left pan
        this.add.ellipse(scaleX - 150, scaleY, 120, 40, 0xA0522D);
        this.add.text(scaleX - 150, scaleY - 30, template.left.replace('?', '___'), {
            fontSize: '28px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        // Right pan
        this.add.ellipse(scaleX + 150, scaleY, 120, 40, 0xA0522D);
        this.add.text(scaleX + 150, scaleY - 30, template.right, {
            fontSize: '28px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        // Answer slot
        const slotContainer = this.add.container(scaleX - 150, scaleY + 50);
        const slotBg = this.add.rectangle(0, 0, 70, 60, 0x444444, 0.8)
            .setStrokeStyle(3, 0x88ccff);
        const questionMark = this.add.text(0, 0, '?', {
            fontSize: '36px',
            fontFamily: 'Arial, sans-serif',
            color: '#88ccff'
        }).setOrigin(0.5);
        slotContainer.add([slotBg, questionMark]);
        slotContainer.setData('slotIndex', 0);
        slotContainer.setData('filled', false);
        this.answerSlots.push(slotContainer);

        // Options
        const optionsY = 600;
        const optionSpacing = 100;
        const optionsStartX = 640 - ((template.options.length - 1) * optionSpacing) / 2;

        template.options.forEach((option, index) => {
            const x = optionsStartX + index * optionSpacing;
            this.createOptionButton(x, optionsY, option);
        });

        // Instructions
        this.add.text(640, 150, 'Vyrovnej váhy! Jaké číslo chybí?', {
            fontSize: '26px',
            fontFamily: 'Arial, sans-serif',
            color: '#aaddaa'
        }).setOrigin(0.5);
    }

    /**
     * Path Choice - Select the correct equation
     */
    private renderPathChoice(): void {
        const template = this.currentTemplate as PathChoiceTemplate;
        
        // Find correct answer index
        const correctIndex = template.paths.findIndex(p => p.correct);
        this.requiredAnswers = [correctIndex];

        // Render paths
        const pathY = 400;
        const pathSpacing = 300;
        const pathsStartX = 640 - ((template.paths.length - 1) * pathSpacing) / 2;

        template.paths.forEach((path, index) => {
            const x = pathsStartX + index * pathSpacing;
            
            // Path visual (tree/sign)
            this.add.rectangle(x, pathY, 200, 100, 0x4a6a4a)
                .setStrokeStyle(3, 0x2a4a2a);
            
            // Equation text
            const btn = this.add.container(x, pathY);
            const bg = this.add.rectangle(0, 0, 180, 80, 0x335533)
                .setStrokeStyle(2, 0x557755);
            const text = this.add.text(0, 0, path.equation, {
                fontSize: '24px',
                fontFamily: 'Arial, sans-serif',
                color: '#ffffff',
                fontStyle: 'bold'
            }).setOrigin(0.5);

            btn.add([bg, text]);
            btn.setSize(180, 80);
            btn.setInteractive({ useHandCursor: true });
            btn.setData('value', index);

            btn.on('pointerover', () => bg.setFillStyle(0x447744));
            btn.on('pointerout', () => bg.setFillStyle(0x335533));
            btn.on('pointerdown', () => this.selectPathOption(index, path.correct));

            this.optionButtons.push(btn);
        });

        // Instructions
        this.add.text(640, 200, 'Vyber cestu se SPRÁVNOU rovnicí!', {
            fontSize: '28px',
            fontFamily: 'Arial, sans-serif',
            color: '#aaddaa',
            fontStyle: 'bold'
        }).setOrigin(0.5);
    }

    /**
     * Feeding Puzzle - Sum items to reach target
     */
    private renderFeedingPuzzle(): void {
        const template = this.currentTemplate as FeedingTemplate;
        
        // Store target for checking
        this.feedingTargetSum = template.target;
        this.feedingCurrentSum = 0;

        // Target display
        this.add.text(640, 150, `Cíl: ${template.target}`, {
            fontSize: '48px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffdd44',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5);

        // Current sum display
        this.feedingSumText = this.add.text(640, 220, 'Součet: 0', {
            fontSize: '32px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff'
        }).setOrigin(0.5);

        // Item buttons
        const itemY = 400;
        const itemSpacing = 150;
        const itemsStartX = 640 - ((template.items.length - 1) * itemSpacing) / 2;

        template.items.forEach((item, index) => {
            const x = itemsStartX + index * itemSpacing;
            
            const btn = this.add.container(x, itemY);
            const bg = this.add.circle(0, 0, 50, 0x445566)
                .setStrokeStyle(3, 0x667788);
            const emoji = this.add.text(0, -10, item.emoji, {
                fontSize: '36px'
            }).setOrigin(0.5);
            const value = this.add.text(0, 30, item.value.toString(), {
                fontSize: '20px',
                fontFamily: 'Arial, sans-serif',
                color: '#ffffff',
                fontStyle: 'bold'
            }).setOrigin(0.5);

            btn.add([bg, emoji, value]);
            btn.setSize(100, 100);
            btn.setInteractive({ useHandCursor: true });
            btn.setData('value', item.value);
            btn.setData('selected', false);
            btn.setData('bg', bg);

            btn.on('pointerdown', () => this.toggleFeedingItem(btn, item.value, template.target));

            this.optionButtons.push(btn);
        });

        // Confirm button
        const confirmBtn = this.add.container(640, 550);
        const confirmBg = this.add.rectangle(0, 0, 200, 60, 0x4a9a4a)
            .setStrokeStyle(3, 0x6aba6a);
        const confirmText = this.add.text(0, 0, '✓ Potvrdit', {
            fontSize: '24px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        confirmBtn.add([confirmBg, confirmText]);
        confirmBtn.setSize(200, 60);
        confirmBtn.setInteractive({ useHandCursor: true });
        confirmBtn.on('pointerdown', () => this.checkFeedingPuzzle(template.target));

        // Instructions
        this.add.text(640, 650, 'Vyber položky, které dají přesně cílový součet!', {
            fontSize: '22px',
            fontFamily: 'Arial, sans-serif',
            color: '#aaddaa'
        }).setOrigin(0.5);
    }

    /**
     * Generic puzzle fallback
     */
    private renderGenericPuzzle(): void {
        this.add.text(640, 360, 'Puzzle type not implemented yet', {
            fontSize: '24px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff'
        }).setOrigin(0.5);

        // Skip button
        const skipBtn = this.add.text(640, 500, '[Skip]', {
            fontSize: '20px',
            color: '#aaaaaa'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        skipBtn.on('pointerdown', () => this.returnToMap(true));
    }

    /**
     * Create a clickable answer option button
     */
    private createOptionButton(x: number, y: number, value: number): void {
        const btn = this.add.container(x, y);

        // Glowing stone effect
        const glow = this.add.circle(0, 0, 45, 0x88ccff, 0.3);
        const stone = this.add.circle(0, 0, 40, 0x6a8a6a)
            .setStrokeStyle(3, 0x8aaa8a);
        const text = this.add.text(0, 0, value.toString(), {
            fontSize: '28px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        btn.add([glow, stone, text]);
        btn.setSize(90, 90);
        btn.setInteractive({ useHandCursor: true });
        btn.setData('value', value);
        btn.setData('used', false);

        // Hover effects
        btn.on('pointerover', () => {
            if (!btn.getData('used')) {
                stone.setFillStyle(0x8aaa8a);
                glow.setAlpha(0.6);
            }
        });

        btn.on('pointerout', () => {
            if (!btn.getData('used')) {
                stone.setFillStyle(0x6a8a6a);
                glow.setAlpha(0.3);
            }
        });

        btn.on('pointerdown', () => {
            if (!btn.getData('used')) {
                this.selectOption(btn, value);
            }
        });

        this.optionButtons.push(btn);
    }

    /**
     * Handle option selection for sequence/equation puzzles
     */
    private selectOption(btn: Phaser.GameObjects.Container, value: number): void {
        // Find first empty slot
        const emptySlot = this.answerSlots.find(slot => !slot.getData('filled'));
        if (!emptySlot) return;

        // Mark button as used
        btn.setData('used', true);
        btn.setAlpha(0.5);

        // Fill the slot
        emptySlot.setData('filled', true);
        emptySlot.setData('value', value);
        
        // Update slot visual
        emptySlot.removeAll(true);
        const newText = this.add.text(0, 0, value.toString(), {
            fontSize: '32px',
            fontFamily: 'Arial, sans-serif',
            color: '#44ff44',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        emptySlot.add(newText);

        // Add to selected answers
        this.selectedAnswers.push(value);

        // Check if all slots filled
        if (this.selectedAnswers.length >= this.requiredAnswers.length) {
            this.checkAnswer();
        }
    }

    /**
     * Handle path selection
     */
    private selectPathOption(_index: number, isCorrect: boolean): void {
        // Disable all buttons
        this.optionButtons.forEach(btn => btn.disableInteractive());

        if (isCorrect) {
            this.puzzleSuccess();
        } else {
            this.puzzleFail();
        }
    }

    /**
     * Toggle item selection for feeding puzzle
     */
    private toggleFeedingItem(btn: Phaser.GameObjects.Container, value: number, _target: number): void {
        const selected = btn.getData('selected');
        const bg = btn.getData('bg') as Phaser.GameObjects.Arc;
        
        btn.setData('selected', !selected);
        
        if (!selected) {
            bg.setFillStyle(0x66aa66);
            this.feedingCurrentSum += value;
        } else {
            bg.setFillStyle(0x445566);
            this.feedingCurrentSum -= value;
        }
        
        if (this.feedingSumText) {
            this.feedingSumText.setText(`Součet: ${this.feedingCurrentSum}`);
            
            // Visual feedback when matching target
            if (this.feedingCurrentSum === this.feedingTargetSum) {
                this.feedingSumText.setColor('#44ff44');
            } else {
                this.feedingSumText.setColor('#ffffff');
            }
        }
    }

    /**
     * Check feeding puzzle result
     */
    private checkFeedingPuzzle(_target: number): void {
        if (this.feedingCurrentSum === this.feedingTargetSum) {
            this.puzzleSuccess();
        } else {
            this.puzzleFail();
        }
    }

    /**
     * Check if answer is correct
     */
    private checkAnswer(): void {
        // Compare selected answers with required
        const isCorrect = this.requiredAnswers.every((answer, index) => 
            this.selectedAnswers[index] === answer
        );

        if (isCorrect) {
            this.puzzleSuccess();
        } else {
            this.puzzleFail();
        }
    }

    /**
     * Handle puzzle success
     */
    private puzzleSuccess(): void {
        this.timerEvent?.remove();

        // Success animation
        const successText = this.add.text(640, 360, '✓ SPRÁVNĚ!', {
            fontSize: '64px',
            fontFamily: 'Arial, sans-serif',
            color: '#44ff44',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 6
        }).setOrigin(0.5).setAlpha(0);

        this.tweens.add({
            targets: successText,
            alpha: 1,
            scale: { from: 0.5, to: 1 },
            duration: 500,
            ease: 'Back.easeOut',
            onComplete: () => {
                // Apply bonus rewards
                if (this.puzzleConfig?.successBonus?.gold) {
                    this.journeySystem.addRewards(0, this.puzzleConfig.successBonus.gold);
                }

                this.time.delayedCall(1000, () => {
                    this.returnToMap(true);
                });
            }
        });
    }

    /**
     * Handle puzzle failure
     */
    private puzzleFail(): void {
        this.timerEvent?.remove();

        // Fail animation
        const failText = this.add.text(640, 360, '✗ ŠPATNĚ!', {
            fontSize: '64px',
            fontFamily: 'Arial, sans-serif',
            color: '#ff4444',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 6
        }).setOrigin(0.5).setAlpha(0);

        this.tweens.add({
            targets: failText,
            alpha: 1,
            scale: { from: 0.5, to: 1 },
            duration: 500,
            ease: 'Back.easeOut',
            onComplete: () => {
                // Apply damage
                if (this.puzzleConfig?.failDamage) {
                    this.journeySystem.applyDamage(this.puzzleConfig.failDamage);
                }

                this.time.delayedCall(1000, () => {
                    this.returnToMap(true); // Still advance, but took damage
                });
            }
        });
    }

    /**
     * Create and start timer
     */
    private createTimer(): void {
        this.timerText = this.add.text(1200, 50, `⏱️ ${this.timeRemaining}s`, {
            fontSize: '28px',
            fontFamily: 'Arial, sans-serif',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(1, 0.5);

        this.timerEvent = this.time.addEvent({
            delay: 1000,
            callback: () => {
                this.timeRemaining--;
                this.timerText.setText(`⏱️ ${this.timeRemaining}s`);

                if (this.timeRemaining <= 10) {
                    this.timerText.setColor('#ff6666');
                }

                if (this.timeRemaining <= 0) {
                    this.puzzleFail();
                }
            },
            repeat: this.timeRemaining - 1
        });
    }

    /**
     * Return to forest map
     */
    private returnToMap(advance: boolean): void {
        if (advance) {
            this.journeySystem.advanceEncounter();
        }
        this.scene.start('ForestMapScene');
    }
}
