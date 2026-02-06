import { MathProblem, MathStats, DifficultyConfig, MathProblemDef, ProblemStats, LevelAttackConfig, ItemDefinition, PetDefinition } from '../types';
import { GameStateManager } from './GameStateManager';

// Pool size limits
const MIN_POOL_SIZE = 10;
const MAX_POOL_SIZE = 20;

// Unified attack configuration per level (player's 4 slots only - pet/sword are separate)
// Progression: starts with addition, introduces subtraction at L3, 3-operand at L4
// Levels 9-10: no more addition, focus on complexity
const LEVEL_ATTACK_CONFIGS: LevelAttackConfig[] = [
    { level: 1,  additionCount: 1, additionMax: 5,  subtractionCount: 0, subtractionMax: 0,  threeOperandCount: 0, threeOperandMax: 0 },
    { level: 2,  additionCount: 2, additionMax: 8,  subtractionCount: 0, subtractionMax: 0,  threeOperandCount: 0, threeOperandMax: 0 },
    { level: 3,  additionCount: 2, additionMax: 8,  subtractionCount: 1, subtractionMax: 5,  threeOperandCount: 0, threeOperandMax: 0 },
    { level: 4,  additionCount: 2, additionMax: 8,  subtractionCount: 1, subtractionMax: 5,  threeOperandCount: 1, threeOperandMax: 8 },
    { level: 5,  additionCount: 2, additionMax: 10, subtractionCount: 1, subtractionMax: 8,  threeOperandCount: 1, threeOperandMax: 8 },
    { level: 6,  additionCount: 1, additionMax: 10, subtractionCount: 2, subtractionMax: 10, threeOperandCount: 1, threeOperandMax: 10 },
    { level: 7,  additionCount: 1, additionMax: 10, subtractionCount: 1, subtractionMax: 10, threeOperandCount: 2, threeOperandMax: 10 },
    { level: 8,  additionCount: 1, additionMax: 10, subtractionCount: 1, subtractionMax: 10, threeOperandCount: 2, threeOperandMax: 10 },
    { level: 9,  additionCount: 0, additionMax: 0,  subtractionCount: 2, subtractionMax: 10, threeOperandCount: 2, threeOperandMax: 10 },
    { level: 10, additionCount: 0, additionMax: 0,  subtractionCount: 1, subtractionMax: 10, threeOperandCount: 3, threeOperandMax: 10 },
];

// Difficulty configs - unified with attack configs
// Hints: L1-3 show after 3s, L4 after 4s, L5-6 after 5s, L7-10 no hints
const DIFFICULTY_CONFIGS: DifficultyConfig[] = [
    { level: 1,  minNumber: 0, maxNumber: 5,  operators: ['+'],      allowThreeOperands: false, showVisualHint: true,  hintFadeDelay: 3000 },
    { level: 2,  minNumber: 0, maxNumber: 8,  operators: ['+'],      allowThreeOperands: false, showVisualHint: true,  hintFadeDelay: 3000 },
    { level: 3,  minNumber: 0, maxNumber: 8,  operators: ['+', '-'], allowThreeOperands: false, showVisualHint: true,  hintFadeDelay: 3000 },
    { level: 4,  minNumber: 0, maxNumber: 8,  operators: ['+', '-'], allowThreeOperands: true,  showVisualHint: true,  hintFadeDelay: 4000 },
    { level: 5,  minNumber: 0, maxNumber: 10, operators: ['+', '-'], allowThreeOperands: true,  showVisualHint: true,  hintFadeDelay: 5000 },
    { level: 6,  minNumber: 0, maxNumber: 10, operators: ['+', '-'], allowThreeOperands: true,  showVisualHint: true,  hintFadeDelay: 5000 },
    { level: 7,  minNumber: 0, maxNumber: 10, operators: ['+', '-'], allowThreeOperands: true,  showVisualHint: false, hintFadeDelay: 0 },
    { level: 8,  minNumber: 0, maxNumber: 10, operators: ['+', '-'], allowThreeOperands: true,  showVisualHint: false, hintFadeDelay: 0 },
    { level: 9,  minNumber: 0, maxNumber: 10, operators: ['+', '-'], allowThreeOperands: true,  showVisualHint: false, hintFadeDelay: 0 },
    { level: 10, minNumber: 0, maxNumber: 10, operators: ['+', '-'], allowThreeOperands: true,  showVisualHint: false, hintFadeDelay: 0 },
];

export class MathEngine {
    private registry: Phaser.Data.DataManager;
    private gameState: GameStateManager;
    private stats: MathStats;
    private levelPool: MathProblemDef[] = [];  // All problems for current level
    private currentProblemId: string | null = null;

    constructor(registry: Phaser.Data.DataManager) {
        this.registry = registry;
        this.gameState = GameStateManager.getInstance();
        this.stats = this.loadStats();
        this.initializeLevelPool();
    }

    private loadStats(): MathStats {
        // Load from GameStateManager (unified save system)
        return this.gameState.getMathStats();
    }

    private saveStats(): void {
        // Save through GameStateManager (unified save system)
        this.gameState.setMathStats(this.stats);
        this.gameState.save();

        // Also update registry for in-scene access
        this.registry.set('mathStats', this.stats);
    }

    /**
     * Generate all possible problems for the current difficulty level
     * Problems are filtered by RESULT (answer), not operands
     * Problems containing 0 are limited to max 10% of the pool
     */
    generateLevelPool(level: number): MathProblemDef[] {
        const config = DIFFICULTY_CONFIGS[Math.min(level - 1, DIFFICULTY_CONFIGS.length - 1)];
        const maxResult = config.maxNumber; // maxNumber now represents max result
        const withZero: MathProblemDef[] = [];
        const withoutZero: MathProblemDef[] = [];

        // Generate addition problems where result <= maxResult
        if (config.operators.includes('+')) {
            for (let a = 0; a <= maxResult; a++) {
                for (let b = 0; b <= maxResult - a; b++) { // a + b <= maxResult
                    const answer = a + b;
                    const problem: MathProblemDef = {
                        id: `add_${a}_${b}`,
                        operand1: a,
                        operand2: b,
                        operator: '+',
                        answer,
                    };
                    if (a === 0 || b === 0) {
                        withZero.push(problem);
                    } else {
                        withoutZero.push(problem);
                    }
                }
            }
        }

        // Generate subtraction problems where result <= maxResult (and result >= 0)
        if (config.operators.includes('-')) {
            for (let a = 0; a <= maxResult; a++) {
                for (let b = 0; b <= a; b++) { // a - b >= 0 and result <= maxResult
                    const answer = a - b;
                    const problem: MathProblemDef = {
                        id: `sub_${a}_${b}`,
                        operand1: a,
                        operand2: b,
                        operator: '-',
                        answer,
                    };
                    if (a === 0 || b === 0) {
                        withZero.push(problem);
                    } else {
                        withoutZero.push(problem);
                    }
                }
            }
        }

        // Limit problems with 0 to max 10% of total
        // Formula: if we have N non-zero problems, max zero problems = N / 9 (to get ~10%)
        const maxZeroProblems = Math.max(1, Math.floor(withoutZero.length / 9));
        const selectedZeroProblems = this.shuffle(withZero).slice(0, maxZeroProblems);

        return [...withoutZero, ...selectedZeroProblems];
    }

    /**
     * Initialize the level pool based on player level
     */
    initializeLevelPool(): void {
        const playerLevel = this.registry.get('playerLevel') || 1;
        this.levelPool = this.generateLevelPool(playerLevel);

        // Initialize active pool if empty or if difficulty changed
        if (this.stats.currentPool.length === 0) {
            this.refillActivePool();
        } else {
            // Validate that current pool IDs exist in level pool
            const validIds = new Set(this.levelPool.map(p => p.id));
            const validPool = this.stats.currentPool.filter(id => validIds.has(id));
            if (validPool.length !== this.stats.currentPool.length) {
                // Some IDs are invalid (maybe from different difficulty), refill
                this.stats.currentPool = validPool;
                if (this.stats.currentPool.length < MIN_POOL_SIZE) {
                    this.refillActivePool();
                }
            }
        }
    }

    /**
     * Fill the active pool with problems based on priority:
     * 1. Previously wrong (wrongCount > correctCount)
     * 2. Never attempted
     * 3. Previously mastered (if pool not full)
     */
    private refillActivePool(): void {
        const config = this.getConfig();

        // Categorize problems
        const struggling: string[] = [];
        const neverAttempted: string[] = [];
        const mastered: string[] = [];

        for (const problem of this.levelPool) {
            const stats = this.stats.problemStats[problem.id];

            if (!stats) {
                neverAttempted.push(problem.id);
            } else if (stats.mastered) {
                mastered.push(problem.id);
            } else if (stats.wrongCount > stats.correctCount) {
                struggling.push(problem.id);
            } else {
                neverAttempted.push(problem.id); // Not mastered but not struggling
            }
        }

        // Build pool by priority
        const newPool: string[] = [];

        // Add struggling problems first
        this.shuffle(struggling);
        for (const id of struggling) {
            if (newPool.length >= MAX_POOL_SIZE) break;
            newPool.push(id);
        }

        // Add never attempted
        this.shuffle(neverAttempted);
        for (const id of neverAttempted) {
            if (newPool.length >= MAX_POOL_SIZE) break;
            newPool.push(id);
        }

        // If still not enough, add mastered problems
        if (newPool.length < MIN_POOL_SIZE) {
            this.shuffle(mastered);
            for (const id of mastered) {
                if (newPool.length >= MAX_POOL_SIZE) break;
                newPool.push(id);
            }
        }

        // If pool is still too small (all problems mastered), reset mastery and start new cycle
        if (newPool.length < MIN_POOL_SIZE && mastered.length > 0) {
            this.stats.poolCycle++;
            // Reset mastered flags
            for (const problem of this.levelPool) {
                if (this.stats.problemStats[problem.id]) {
                    this.stats.problemStats[problem.id].mastered = false;
                }
            }
            // Refill with all problems
            for (const id of mastered) {
                if (newPool.length >= MAX_POOL_SIZE) break;
                newPool.push(id);
            }
        }

        this.stats.currentPool = this.shuffle(newPool);
        this.saveStats();
    }

    /**
     * Get the next problem from the active pool
     */
    generateProblem(): MathProblem {
        // Refill if pool is empty
        if (this.stats.currentPool.length === 0) {
            this.refillActivePool();
        }

        // Get random problem from pool
        const randomIndex = Math.floor(Math.random() * this.stats.currentPool.length);
        const problemId = this.stats.currentPool[randomIndex];
        this.currentProblemId = problemId;

        // Find the problem definition
        const problemDef = this.levelPool.find(p => p.id === problemId);
        if (!problemDef) {
            // Fallback (shouldn't happen)
            this.refillActivePool();
            return this.generateProblem();
        }

        const config = this.getConfig();
        const choices = this.generateChoices(problemDef.answer, config.maxNumber);

        return {
            id: problemDef.id,
            operand1: problemDef.operand1,
            operand2: problemDef.operand2,
            operator: problemDef.operator,
            answer: problemDef.answer,
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

    /**
     * Check if day has changed and reset daily counter if needed
     */
    private checkDailyReset(): void {
        const today = new Date().toISOString().split('T')[0]; // "YYYY-MM-DD"
        if (this.stats.lastAttemptDate !== today) {
            this.stats.dailyAttempts = 0;
            this.stats.lastAttemptDate = today;
        }
    }

    /**
     * Record the result of a problem with explicit problem ID
     */
    recordResultForProblem(problemId: string, isCorrect: boolean): void {
        this.checkDailyReset();
        this.stats.dailyAttempts++;
        this.stats.totalAttempts++;
        if (isCorrect) this.stats.correctAnswers++;

        // Update per-problem stats
        if (!this.stats.problemStats[problemId]) {
            this.stats.problemStats[problemId] = {
                correctCount: 0,
                wrongCount: 0,
                lastAttempt: 0,
                mastered: false,
                manaCollected: 0,
            };
        }

        const problemStat = this.stats.problemStats[problemId];
        problemStat.lastAttempt = Date.now();

        if (isCorrect) {
            problemStat.correctCount++;
            problemStat.mastered = true;
        } else {
            problemStat.wrongCount++;
        }

        // Sliding window of last 10 for stats tracking
        this.stats.recentResults.push(isCorrect);
        if (this.stats.recentResults.length > 10) {
            this.stats.recentResults.shift();
        }

        this.saveStats();
    }

    /**
     * Record the result of a problem and update stats (uses currentProblemId)
     */
    recordResult(isCorrect: boolean): void {
        this.checkDailyReset();
        this.stats.dailyAttempts++;
        this.stats.totalAttempts++;
        if (isCorrect) this.stats.correctAnswers++;

        // Update per-problem stats
        if (this.currentProblemId) {
            if (!this.stats.problemStats[this.currentProblemId]) {
                this.stats.problemStats[this.currentProblemId] = {
                    correctCount: 0,
                    wrongCount: 0,
                    lastAttempt: 0,
                    mastered: false,
                    manaCollected: 0,
                };
            }

            const problemStat = this.stats.problemStats[this.currentProblemId];
            problemStat.lastAttempt = Date.now();

            if (isCorrect) {
                problemStat.correctCount++;
                problemStat.mastered = true;
                // Remove from active pool
                const poolIndex = this.stats.currentPool.indexOf(this.currentProblemId);
                if (poolIndex > -1) {
                    this.stats.currentPool.splice(poolIndex, 1);
                }
            } else {
                problemStat.wrongCount++;
                // Keep in pool - will be asked again
            }
        }

        // Sliding window of last 10 for stats tracking
        this.stats.recentResults.push(isCorrect);
        if (this.stats.recentResults.length > 10) {
            this.stats.recentResults.shift();
        }

        this.saveStats();
    }

    /**
     * Get the current difficulty configuration (based on player level)
     */
    private getConfig(level?: number): DifficultyConfig {
        const playerLevel = this.registry.get('playerLevel') || 1;
        const effectiveLevel = level !== undefined ? level : playerLevel;
        const idx = Math.min(effectiveLevel - 1, DIFFICULTY_CONFIGS.length - 1);
        return DIFFICULTY_CONFIGS[idx];
    }

    /**
     * Get current math statistics
     */
    getStats(): MathStats {
        return { ...this.stats };
    }

    /**
     * Get statistics for Guild display - all problems for current level with stats
     */
    getLevelProblemsWithStats(): Array<MathProblemDef & { stats: ProblemStats | null }> {
        return this.levelPool.map(problem => ({
            ...problem,
            stats: this.stats.problemStats[problem.id] || null,
        }));
    }

    /**
     * Get ALL problems ever attempted (for comprehensive stats display)
     * Parses problem ID to reconstruct problem definition
     */
    getAllProblemsWithStats(): Array<MathProblemDef & { stats: ProblemStats }> {
        const result: Array<MathProblemDef & { stats: ProblemStats }> = [];

        for (const [id, stats] of Object.entries(this.stats.problemStats)) {
            // Parse ID format: "add_3_5" or "sub_7_2" or "three_4_2_1"
            const parts = id.split('_');
            if (parts.length < 3) continue;

            const type = parts[0];
            let problem: MathProblemDef;

            if (type === 'add') {
                const op1 = parseInt(parts[1], 10);
                const op2 = parseInt(parts[2], 10);
                if (isNaN(op1) || isNaN(op2)) continue;
                problem = {
                    id,
                    operand1: op1,
                    operand2: op2,
                    operator: '+',
                    answer: op1 + op2,
                };
            } else if (type === 'sub') {
                const op1 = parseInt(parts[1], 10);
                const op2 = parseInt(parts[2], 10);
                if (isNaN(op1) || isNaN(op2)) continue;
                problem = {
                    id,
                    operand1: op1,
                    operand2: op2,
                    operator: '-',
                    answer: op1 - op2,
                };
            } else {
                // Skip pet problems, three-operand, etc. for now
                continue;
            }

            result.push({ ...problem, stats });
        }

        return result;
    }

    /**
     * Get all problem stats (for diamond collection)
     */
    getAllProblemStats(): Map<string, ProblemStats> {
        return new Map(Object.entries(this.stats.problemStats));
    }

    /**
     * Calculate how many mana points are available to collect for a problem
     * Thresholds: 5, 10, 20 correct answers = 3 mana total per problem
     */
    getCollectableMana(problemId: string): number {
        const stats = this.stats.problemStats[problemId];
        if (!stats) return 0;

        const thresholds = [5, 10, 20];
        let available = 0;

        thresholds.forEach((threshold, index) => {
            if (stats.correctCount >= threshold && stats.manaCollected <= index) {
                available++;
            }
        });

        return available;
    }

    /**
     * Get total collectable mana across all problems
     */
    getTotalCollectableMana(): number {
        let total = 0;
        for (const problemId in this.stats.problemStats) {
            total += this.getCollectableMana(problemId);
        }
        return total;
    }

    /**
     * Collect mana for a specific problem (marks them as collected)
     * Returns the amount of mana collected
     */
    collectManaForProblem(problemId: string): number {
        const collectable = this.getCollectableMana(problemId);
        if (collectable > 0 && this.stats.problemStats[problemId]) {
            this.stats.problemStats[problemId].manaCollected += collectable;
            this.saveStats();
        }
        return collectable;
    }

    /**
     * Collect all available mana across all problems
     * Returns the total amount of mana collected
     */
    collectAllMana(): number {
        let totalCollected = 0;
        for (const problemId in this.stats.problemStats) {
            totalCollected += this.collectManaForProblem(problemId);
        }
        return totalCollected;
    }

    /**
     * Get mastery percentage for current level
     */
    getMasteryPercentage(): number {
        if (this.levelPool.length === 0) return 0;

        let masteredCount = 0;
        for (const problem of this.levelPool) {
            const stats = this.stats.problemStats[problem.id];
            if (stats && stats.correctCount > stats.wrongCount) {
                masteredCount++;
            }
        }

        return Math.round((masteredCount / this.levelPool.length) * 100);
    }

    /**
     * Get current pool cycle count
     */
    getPoolCycle(): number {
        return this.stats.poolCycle;
    }

    /**
     * Get current active pool size
     */
    getActivePoolSize(): number {
        return this.stats.currentPool.length;
    }

    // Utility methods
    private randomInt(min: number, max: number): number {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    private shuffle<T>(arr: T[]): T[] {
        const result = [...arr];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }

    // ============ ATTACK SYSTEM ============

    /**
     * Get attack config for a player level
     */
    getAttackConfig(level: number): LevelAttackConfig {
        const idx = Math.min(level - 1, LEVEL_ATTACK_CONFIGS.length - 1);
        return LEVEL_ATTACK_CONFIGS[idx];
    }

    /**
     * Generate all problems for a single attack turn
     * Returns array of MathProblems based on player level
     * Optionally includes pet and sword bonus problems
     */
    generateAttackProblems(playerLevel: number, equippedPet?: PetDefinition | null, equippedSword?: ItemDefinition | null): MathProblem[] {
        const config = this.getAttackConfig(playerLevel);
        const problems: MathProblem[] = [];

        // Generate player's base problems (4 slots max)
        // Addition problems
        for (let i = 0; i < config.additionCount; i++) {
            problems.push(this.generateSpecificProblem('+', config.additionMax, playerLevel));
        }

        // Subtraction problems
        for (let i = 0; i < config.subtractionCount; i++) {
            problems.push(this.generateSpecificProblem('-', config.subtractionMax, playerLevel));
        }

        // 3-operand problems
        for (let i = 0; i < config.threeOperandCount; i++) {
            problems.push(this.generateThreeOperandProblem(config.threeOperandMax, playerLevel));
        }

        // Add pet bonus problem if pet is equipped
        if (equippedPet) {
            const petProblem = this.generateEquipmentProblem(
                equippedPet.mathProblemType || 'addition',
                equippedPet.mathProblemMax || 3,
                equippedPet.damageMultiplier || 1,
                'pet'
            );
            problems.push(petProblem);
        }

        // Shuffle base problems (before adding sword)
        const shuffledProblems = this.shuffle(problems);

        // Add sword bonus problem LAST if sword is equipped (always at the end for consistency)
        if (equippedSword && equippedSword.mathProblemType) {
            const swordProblem = this.generateEquipmentProblem(
                equippedSword.mathProblemType,
                equippedSword.mathProblemMax || 5,
                equippedSword.damageMultiplier || 1,
                'sword'
            );
            shuffledProblems.push(swordProblem);
        }

        return shuffledProblems;
    }

    /**
     * Generate a problem for equipment (pet or sword)
     * Returns problem with damage multiplier metadata
     */
    private generateEquipmentProblem(
        problemType: 'addition' | 'subtraction' | 'multiplication' | 'threeOperand',
        maxResult: number,
        multiplier: number,
        source: 'pet' | 'sword'
    ): MathProblem {
        let problem: MathProblem;

        if (problemType === 'threeOperand') {
            problem = this.generateThreeOperandProblem(maxResult);
        } else if (problemType === 'multiplication') {
            problem = this.generateMultiplicationProblem(maxResult);
        } else {
            const operator = problemType === 'addition' ? '+' : '-';
            problem = this.generateSpecificProblem(operator, maxResult);
        }

        // Add metadata for damage calculation
        problem.damageMultiplier = multiplier;
        problem.source = source;

        return problem;
    }

    /**
     * Generate a multiplication problem
     * @param maxResult - maximum value for the answer (e.g., 12 means up to 12×12=144 or similar)
     */
    private generateMultiplicationProblem(maxResult: number): MathProblem {
        // Generate a × b = result where both factors are reasonable
        // For maxResult=12, we want problems like 2×6, 3×4, etc.
        const factorMax = Math.min(maxResult, 12); // Cap factors at 12
        const operand1 = this.randomInt(1, factorMax);
        const operand2 = this.randomInt(1, factorMax);
        const answer = operand1 * operand2;

        const id = `mul_${operand1}_${operand2}`;
        const choices = this.generateMultiplicationChoices(answer, factorMax);

        // Set current problem ID for stats tracking
        this.currentProblemId = id;

        return {
            id,
            operand1,
            operand2,
            operator: '*',
            answer,
            choices,
            showVisualHint: false, // Multiplication is too complex for visual hints
            hintType: 'none',
        };
    }

    /**
     * Generate plausible wrong answers for multiplication
     */
    private generateMultiplicationChoices(correct: number, factorMax: number): number[] {
        const choices = new Set<number>([correct]);

        // Add plausible wrong answers
        while (choices.size < 3) {
            // Common mistakes: off by one factor, adjacent products
            const mistakeType = Math.floor(Math.random() * 3);
            let wrong: number;

            if (mistakeType === 0) {
                // Off by the smaller factor (e.g., 6×7=42, wrong: 36 or 48)
                wrong = correct + this.randomInt(-6, 6);
            } else if (mistakeType === 1) {
                // Adjacent table entry
                wrong = correct + this.randomInt(1, factorMax) * (Math.random() > 0.5 ? 1 : -1);
            } else {
                // Random nearby product
                const a = this.randomInt(1, factorMax);
                const b = this.randomInt(1, factorMax);
                wrong = a * b;
            }

            if (wrong > 0 && wrong !== correct && !choices.has(wrong)) {
                choices.add(wrong);
            }
        }

        return this.shuffle([...choices]);
    }

    /**
     * Generate a single problem specifically for pet's dedicated turn
     * Returns problem with pet metadata set
     */
    generatePetTurnProblem(pet: PetDefinition): MathProblem {
        const problemType = pet.mathProblemType || 'addition';
        const maxResult = pet.mathProblemMax || 3;
        const multiplier = pet.damageMultiplier || 1;

        return this.generateEquipmentProblem(problemType, maxResult, multiplier, 'pet');
    }

    /**
     * Generate a specific type of problem with max result
     * @param operator - '+' or '-'
     * @param maxResult - maximum value for the answer
     * @param level - player level (used to determine hint visibility from config)
     * @param minValue - minimum value for operands (default 0)
     */
    private generateSpecificProblem(operator: '+' | '-', maxResult: number, level?: number, minValue: number = 0): MathProblem {
        let operand1: number;
        let operand2: number;
        let answer: number;

        if (operator === '+') {
            // a + b = result where result <= maxResult and operands >= minValue
            answer = this.randomInt(minValue * 2, maxResult); // Ensure we can have both operands >= minValue
            operand1 = this.randomInt(minValue, answer - minValue);
            operand2 = answer - operand1;
        } else {
            // a - b = result where result >= 0 and operands >= minValue
            operand1 = this.randomInt(minValue, maxResult);
            operand2 = this.randomInt(minValue, operand1 - minValue >= minValue ? operand1 - minValue : operand1);
            answer = operand1 - operand2;
        }

        const id = `${operator === '+' ? 'add' : 'sub'}_${operand1}_${operand2}`;
        const choices = this.generateChoices(answer, maxResult);

        // DEBUG: Log block problem generation
        console.log('[MathEngine] generateSpecificProblem:', {
            operator, operand1, operand2, answer, choices,
            correctInChoices: choices.includes(answer)
        });

        // Set current problem ID for stats tracking
        this.currentProblemId = id;

        // Use difficulty config for hints if level provided, otherwise fallback to maxResult check
        const difficultyConfig = level !== undefined ? this.getConfig(level) : null;
        const showHint = difficultyConfig ? difficultyConfig.showVisualHint : maxResult <= 5;

        return {
            id,
            operand1,
            operand2,
            operator,
            answer,
            choices,
            showVisualHint: showHint,
            hintType: 'apples',
        };
    }

    /**
     * Generate a 3-operand problem (a + b - c or a - b + c)
     * @param maxResult - maximum value for the answer
     * @param level - player level (used to determine hint visibility from config)
     */
    private generateThreeOperandProblem(maxResult: number, level?: number): MathProblem {
        // Generate a ± b ± c = result
        const op1: '+' | '-' = Math.random() > 0.5 ? '+' : '-';
        const op2: '+' | '-' = Math.random() > 0.5 ? '+' : '-';

        let a: number, b: number, c: number, answer: number;
        let attempts = 0;

        // Try to find valid operands
        do {
            a = this.randomInt(1, maxResult);
            b = this.randomInt(0, Math.min(a, maxResult - 1));
            c = this.randomInt(0, Math.min(maxResult - 1, 5));

            // Calculate based on operators
            let intermediate = op1 === '+' ? a + b : a - b;
            answer = op2 === '+' ? intermediate + c : intermediate - c;

            attempts++;
        } while ((answer < 0 || answer > maxResult) && attempts < 50);

        // Fallback to simple problem if we can't find valid operands
        if (answer < 0 || answer > maxResult) {
            a = this.randomInt(2, maxResult);
            b = this.randomInt(1, Math.floor(a / 2));
            c = 1;
            answer = a - b + c;
        }

        const id = `three_${a}_${b}_${c}`;
        const choices = this.generateChoices(answer, maxResult);

        // Set current problem ID for stats tracking
        this.currentProblemId = id;

        // 3-operand problems don't show visual hints (too complex to visualize)
        // But still check config in case we want to enable this in the future
        const difficultyConfig = level !== undefined ? this.getConfig(level) : null;
        const showHint = difficultyConfig ? difficultyConfig.showVisualHint : false;

        return {
            id,
            operand1: a,
            operand2: b,
            operand3: c,
            operator: op1,
            operator2: op2,
            answer,
            choices,
            showVisualHint: showHint,
            hintType: showHint ? 'apples' : 'none',
        };
    }

    /**
     * Generate a missing operand problem (e.g., "5 + ? = 8")
     * @param maxResult - maximum value for the answer
     */
    generateMissingOperandProblem(maxResult: number): MathProblem {
        const operator: '+' | '-' = Math.random() > 0.5 ? '+' : '-';
        let operand1: number, operand2: number, result: number;

        if (operator === '+') {
            // a + ? = result where result <= maxResult
            result = this.randomInt(2, maxResult);
            operand1 = this.randomInt(0, result);
            operand2 = result - operand1; // This is the missing operand (answer)
        } else {
            // a - ? = result where result >= 0
            operand1 = this.randomInt(1, maxResult);
            result = this.randomInt(0, operand1);
            operand2 = operand1 - result; // This is the missing operand (answer)
        }

        const id = `missing_${operator === '+' ? 'add' : 'sub'}_${operand1}_${operand2}`;
        const choices = this.generateChoices(operand2, maxResult);

        this.currentProblemId = id;

        return {
            id,
            operand1,
            operand2: result, // Store result as operand2 for display
            operator,
            answer: operand2, // The missing operand is the answer
            choices,
            showVisualHint: false,
            hintType: 'none',
            source: 'player',
            problemType: 'missing_operand' as const,
        };
    }

    /**
     * Generate a comparison problem (e.g., "7 + 2 ○ 10" where player picks <, =, or >)
     * @param maxResult - maximum value for operands
     */
    generateComparisonProblem(maxResult: number): MathProblem {
        // Generate left side: a + b or a - b
        const operator: '+' | '-' = Math.random() > 0.5 ? '+' : '-';
        let operand1: number, operand2: number, leftSide: number;

        if (operator === '+') {
            operand1 = this.randomInt(1, Math.floor(maxResult / 2));
            operand2 = this.randomInt(1, maxResult - operand1);
            leftSide = operand1 + operand2;
        } else {
            operand1 = this.randomInt(2, maxResult);
            operand2 = this.randomInt(0, operand1);
            leftSide = operand1 - operand2;
        }

        // Generate right side (the comparison value)
        // Make it sometimes equal, sometimes different
        const comparisonType = Math.floor(Math.random() * 3); // 0=less, 1=equal, 2=greater
        let rightSide: number;
        let answer: number; // 0 = <, 1 = =, 2 = >

        if (comparisonType === 0) {
            // Left < Right
            rightSide = this.randomInt(leftSide + 1, maxResult + 3);
            answer = 0;
        } else if (comparisonType === 1) {
            // Left = Right
            rightSide = leftSide;
            answer = 1;
        } else {
            // Left > Right
            rightSide = this.randomInt(Math.max(0, leftSide - 5), leftSide - 1);
            if (rightSide < 0) rightSide = 0;
            if (rightSide >= leftSide) rightSide = leftSide - 1;
            answer = 2;
        }

        const id = `compare_${operand1}_${operator === '+' ? 'add' : 'sub'}_${operand2}_${rightSide}`;

        this.currentProblemId = id;

        // Choices are: 0 = "<", 1 = "=", 2 = ">"
        return {
            id,
            operand1,
            operand2,
            operand3: rightSide,
            operator,
            answer,
            choices: [0, 1, 2], // Always show all three comparison options
            showVisualHint: false,
            hintType: 'none',
            source: 'player',
            problemType: 'comparison' as const,
        };
    }

    /**
     * Generate a boss phase problem based on math type
     * @param mathType - 'addition', 'missing_operand', 'comparison', or 'standard'
     * @param difficulty - problem difficulty (affects max values)
     */
    generateBossPhaseProblem(mathType: string, difficulty: number): MathProblem {
        const maxResult = Math.min(difficulty + 4, 12); // Scale max result with difficulty

        switch (mathType) {
            case 'addition':
                return this.generateSpecificProblem('+', maxResult);
            case 'missing_operand':
                return this.generateMissingOperandProblem(maxResult);
            case 'comparison':
                return this.generateComparisonProblem(maxResult);
            default:
                return this.generateSpecificProblem('+', maxResult);
        }
    }

    /**
     * Generate a pet attack problem (very easy: addition ≤3)
     */
    generatePetProblem(): MathProblem {
        const answer = this.randomInt(1, 3);
        const operand1 = this.randomInt(0, answer);
        const operand2 = answer - operand1;

        const id = `pet_add_${operand1}_${operand2}`;
        const choices = this.generateChoices(answer, 5);

        // Set current problem ID for stats tracking
        this.currentProblemId = id;

        return {
            id,
            operand1,
            operand2,
            operator: '+',
            answer,
            choices,
            showVisualHint: true,
            hintType: 'apples',
        };
    }

    /**
     * Generate a shield block problem
     * @param shield - Optional shield item with math config (mathProblemTypes, mathProblemMax, mathProblemMin)
     */
    generateBlockProblem(shield?: ItemDefinition | null): MathProblem {
        // Use shield config if available
        if (shield && shield.mathProblemTypes && shield.mathProblemTypes.length > 0) {
            const types = shield.mathProblemTypes;
            const selectedType = types[Math.floor(Math.random() * types.length)];
            const maxResult = shield.mathProblemMax || 6;
            const minValue = shield.mathProblemMin || 0;

            if (selectedType === 'multiplication') {
                return this.generateMultiplicationProblem(maxResult);
            } else {
                const operator: '+' | '-' = selectedType === 'addition' ? '+' : '-';
                return this.generateSpecificProblem(operator, maxResult, undefined, minValue);
            }
        }

        // Fallback: basic addition/subtraction up to 5
        const operator: '+' | '-' = Math.random() > 0.5 ? '+' : '-';
        return this.generateSpecificProblem(operator, 5);
    }

    /**
     * Generate multiple block problems at once
     * @param count - Number of problems to generate
     * @param shield - Optional shield item with math config
     */
    generateBlockProblems(count: number, shield?: ItemDefinition | null): MathProblem[] {
        const problems: MathProblem[] = [];
        for (let i = 0; i < count; i++) {
            problems.push(this.generateBlockProblem(shield));
        }
        return problems;
    }

    /**
     * Get total problems for a level (for UI display)
     */
    getTotalProblemsForLevel(level: number): number {
        const config = this.getAttackConfig(level);
        return config.additionCount + config.subtractionCount + config.threeOperandCount;
    }
}
