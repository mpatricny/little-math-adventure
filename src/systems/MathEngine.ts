import { MathProblem, MathStats, DifficultyConfig } from '../types';

const DIFFICULTY_CONFIGS: DifficultyConfig[] = [
    { level: 1, minNumber: 0, maxNumber: 3, operators: ['+'], allowThreeOperands: false, showVisualHint: true, hintFadeDelay: 0 },
    { level: 2, minNumber: 0, maxNumber: 5, operators: ['+'], allowThreeOperands: false, showVisualHint: true, hintFadeDelay: 0 },
    { level: 3, minNumber: 0, maxNumber: 5, operators: ['+'], allowThreeOperands: false, showVisualHint: true, hintFadeDelay: 3000 },
    { level: 4, minNumber: 0, maxNumber: 7, operators: ['+'], allowThreeOperands: false, showVisualHint: true, hintFadeDelay: 2000 },
    { level: 5, minNumber: 0, maxNumber: 10, operators: ['+'], allowThreeOperands: true, showVisualHint: true, hintFadeDelay: 1500 }, // Intro 3 operands
    { level: 6, minNumber: 0, maxNumber: 10, operators: ['+'], allowThreeOperands: true, showVisualHint: false, hintFadeDelay: 0 },
    { level: 7, minNumber: 0, maxNumber: 10, operators: ['+', '-'], allowThreeOperands: false, showVisualHint: false, hintFadeDelay: 0 },
    { level: 8, minNumber: 0, maxNumber: 15, operators: ['+', '-'], allowThreeOperands: true, showVisualHint: false, hintFadeDelay: 0 },
    { level: 9, minNumber: 0, maxNumber: 20, operators: ['+', '-'], allowThreeOperands: true, showVisualHint: false, hintFadeDelay: 0 },
    { level: 10, minNumber: 0, maxNumber: 20, operators: ['+', '-'], allowThreeOperands: true, showVisualHint: false, hintFadeDelay: 0 },
];

export class MathEngine {
    private registry: Phaser.Data.DataManager;
    private stats: MathStats;

    constructor(registry: Phaser.Data.DataManager) {
        this.registry = registry;
        this.stats = this.loadStats();
    }

    private loadStats(): MathStats {
        const saved = this.registry.get('mathStats');
        return saved || {
            totalAttempts: 0,
            correctAnswers: 0,
            recentResults: [],
            currentDifficulty: 1,
            highestDifficulty: 1,
        };
    }

    private saveStats(): void {
        this.registry.set('mathStats', this.stats);
    }

    generateProblem(): MathProblem {
        const config = this.getConfig();
        const operator = this.randomChoice(config.operators);

        // 30% chance for 3 operands if allowed
        const useThreeOperands = config.allowThreeOperands && Math.random() < 0.3;

        let operand1: number, operand2: number, operand3: number | undefined;
        let operator2: any | undefined;
        let answer: number;

        if (useThreeOperands && operator === '+') {
            // 3-operand addition (e.g. 1 + 2 + 3)
            operand1 = this.randomInt(config.minNumber, Math.floor(config.maxNumber / 2));
            operand2 = this.randomInt(config.minNumber, Math.floor(config.maxNumber / 2));
            operand3 = this.randomInt(config.minNumber, Math.floor(config.maxNumber / 2));
            operator2 = '+';
            answer = operand1 + operand2 + operand3;
        } else if (operator === '+') {
            operand1 = this.randomInt(config.minNumber, config.maxNumber);
            operand2 = this.randomInt(config.minNumber, config.maxNumber - operand1);
            answer = operand1 + operand2;
        } else {
            // Subtraction: ensure non-negative result
            operand1 = this.randomInt(config.minNumber + 1, config.maxNumber);
            operand2 = this.randomInt(config.minNumber, operand1);
            answer = operand1 - operand2;
        }

        const choices = this.generateChoices(answer, config.maxNumber * (useThreeOperands ? 1.5 : 1));

        return {
            operand1,
            operand2,
            operand3,
            operator,
            operator2,
            answer,
            choices,
            showVisualHint: config.showVisualHint,
            hintType: config.showVisualHint ? 'apples' : 'none',
        };
    }

    private generateChoices(correct: number, maxNum: number): number[] {
        const choices = new Set<number>([correct]);

        // Add plausible wrong answers (within ±3 of correct)
        while (choices.size < 3) {
            const offset = this.randomInt(-3, 3);
            const wrong = correct + offset;
            if (wrong >= 0 && wrong <= maxNum + 5 && wrong !== correct) {
                choices.add(wrong);
            }
        }

        // Shuffle
        return this.shuffle([...choices]);
    }

    recordResult(isCorrect: boolean): void {
        this.stats.totalAttempts++;
        if (isCorrect) this.stats.correctAnswers++;

        // Sliding window of last 10
        this.stats.recentResults.push(isCorrect);
        if (this.stats.recentResults.length > 10) {
            this.stats.recentResults.shift();
        }

        // Adapt difficulty
        this.adaptDifficulty();
        this.saveStats();
    }

    private adaptDifficulty(): void {
        if (this.stats.recentResults.length < 3) return; // Need less data to adapt faster

        const recentCorrect = this.stats.recentResults.filter(r => r).length;
        const successRate = recentCorrect / this.stats.recentResults.length;
        const playerLevel = this.registry.get('playerLevel') || 1;

        // More aggressive adaptation
        if (successRate < 0.4 && this.stats.currentDifficulty > 1) {
            // Struggling: decrease difficulty
            this.stats.currentDifficulty--;
        } else if (successRate >= 0.7 && this.stats.currentDifficulty < playerLevel + 2) {
            // Doing well: increase difficulty (can go slightly above level)
            this.stats.currentDifficulty++;
            if (this.stats.currentDifficulty > this.stats.highestDifficulty) {
                this.stats.highestDifficulty = this.stats.currentDifficulty;
            }
        }
    }

    private getConfig(): DifficultyConfig {
        const idx = Math.min(this.stats.currentDifficulty - 1, DIFFICULTY_CONFIGS.length - 1);
        return DIFFICULTY_CONFIGS[idx];
    }

    getStats(): MathStats {
        return { ...this.stats };
    }

    // Utility methods
    private randomInt(min: number, max: number): number {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    private randomChoice<T>(arr: T[]): T {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    private shuffle<T>(arr: T[]): T[] {
        const result = [...arr];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }
}
