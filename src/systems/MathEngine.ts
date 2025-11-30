import { MathProblem, MathStats, DifficultyConfig } from '../types';

const DIFFICULTY_CONFIGS: DifficultyConfig[] = [
    { level: 1, minNumber: 0, maxNumber: 3, operators: ['+'], showVisualHint: true, hintFadeDelay: 0 },
    { level: 2, minNumber: 0, maxNumber: 5, operators: ['+'], showVisualHint: true, hintFadeDelay: 0 },
    { level: 3, minNumber: 0, maxNumber: 5, operators: ['+'], showVisualHint: true, hintFadeDelay: 3000 },
    { level: 4, minNumber: 0, maxNumber: 7, operators: ['+'], showVisualHint: true, hintFadeDelay: 2000 },
    { level: 5, minNumber: 0, maxNumber: 10, operators: ['+'], showVisualHint: true, hintFadeDelay: 1500 },
    { level: 6, minNumber: 0, maxNumber: 10, operators: ['+'], showVisualHint: false, hintFadeDelay: 0 },
    { level: 7, minNumber: 0, maxNumber: 10, operators: ['+', '-'], showVisualHint: false, hintFadeDelay: 0 },
    { level: 8, minNumber: 0, maxNumber: 15, operators: ['+', '-'], showVisualHint: false, hintFadeDelay: 0 },
    { level: 9, minNumber: 0, maxNumber: 20, operators: ['+', '-'], showVisualHint: false, hintFadeDelay: 0 },
    { level: 10, minNumber: 0, maxNumber: 20, operators: ['+', '-'], showVisualHint: false, hintFadeDelay: 0 },
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

        let operand1: number, operand2: number, answer: number;

        if (operator === '+') {
            operand1 = this.randomInt(config.minNumber, config.maxNumber);
            operand2 = this.randomInt(config.minNumber, config.maxNumber - operand1);
            answer = operand1 + operand2;
        } else {
            // Subtraction: ensure non-negative result
            operand1 = this.randomInt(config.minNumber + 1, config.maxNumber);
            operand2 = this.randomInt(config.minNumber, operand1);
            answer = operand1 - operand2;
        }

        const choices = this.generateChoices(answer, config.maxNumber);

        return {
            operand1,
            operand2,
            operator,
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
        if (this.stats.recentResults.length < 5) return; // Need data

        const recentCorrect = this.stats.recentResults.filter(r => r).length;
        const successRate = recentCorrect / this.stats.recentResults.length;
        const playerLevel = this.registry.get('playerLevel') || 1;

        if (successRate < 0.5 && this.stats.currentDifficulty > 1) {
            // Struggling: decrease difficulty
            this.stats.currentDifficulty--;
        } else if (successRate > 0.8 && this.stats.currentDifficulty < playerLevel) {
            // Doing great: increase difficulty (capped at player level)
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
