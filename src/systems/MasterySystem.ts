import {
    BandId, SubAtomId, SubAtomNumber, ProblemForm, ExamType,
    MasteryData, SubAtomState, MasteryAttempt, ProblemDefinition,
    TrialTier, ExamConfig, EXAM_CONFIGS,
    ALL_BANDS, ALL_SUB_ATOM_NUMBERS, ALL_PROBLEM_FORMS,
} from '../types';
import { GameStateManager } from './GameStateManager';
import { ProblemDatabase } from './ProblemDatabase';
import { ManaSystem } from './ManaSystem';

// Speed thresholds (milliseconds)
const FLUENT_RT_MS = 7000;
const MASTERY_RT_MS = 5000;
const SWIFT_HIT_MS = 5000;
const LIGHTNING_HIT_MS = 3000;
const SLOW_POOL_THRESHOLD_MS = 15000;
const RT_IGNORE_THRESHOLD_MS = 20000; // Don't track RT above this (likely a pause)

// Problem form weights by phase
const FORM_WEIGHTS: Record<string, Record<ProblemForm, number>> = {
    T1: { result_unknown: 70, missing_part: 30, compare_equation_vs_number: 0,  compare_equation_vs_equation: 0  },
    T2: { result_unknown: 40, missing_part: 30, compare_equation_vs_number: 30, compare_equation_vs_equation: 0  },
    S:  { result_unknown: 30, missing_part: 30, compare_equation_vs_number: 40, compare_equation_vs_equation: 0  },
    FM: { result_unknown: 25, missing_part: 25, compare_equation_vs_number: 25, compare_equation_vs_equation: 25 },
};

// Max problems per attack turn (player.attack beyond this becomes attack power bonus)
const MAX_PROBLEMS_PER_TURN = 5;

// Stat rewards per exam tier (same values as old ProgressionSystem TRIAL_TIER_REWARDS)
const MASTERY_EXAM_REWARDS: Record<TrialTier, { hp: number; atk: number; mana: number }> = {
    none:   { hp: 0, atk: 0, mana: 0 },
    bronze: { hp: 1, atk: 0, mana: 0 },
    silver: { hp: 1, atk: 1, mana: 0 },
    gold:   { hp: 1, atk: 1, mana: 2 },
};

/**
 * MasterySystem: handles state machine, fight scheduling, and analytics
 * for the mastery-based progression system.
 */
export class MasterySystem {
    private static instance: MasterySystem;
    private gameState: GameStateManager;
    private problemDb: ProblemDatabase;

    private constructor() {
        this.gameState = GameStateManager.getInstance();
        this.problemDb = ProblemDatabase.getInstance();
    }

    static getInstance(): MasterySystem {
        if (!MasterySystem.instance) {
            MasterySystem.instance = new MasterySystem();
        }
        return MasterySystem.instance;
    }

    /** Reset singleton (for testing or when GameStateManager resets) */
    static destroyInstance(): void {
        MasterySystem.instance = null as any;
    }

    private get data(): MasteryData {
        return this.gameState.getMasteryData();
    }

    // ========================================
    // State Queries
    // ========================================

    /** Get the highest unlocked band not yet Secure */
    getCurrentBand(): BandId {
        // Highest unlocked band that is not yet Secure
        for (let i = ALL_BANDS.length - 1; i >= 0; i--) {
            const band = ALL_BANDS[i];
            const state = this.data.bands[band].state;
            if (state !== 'locked' && state !== 'secure' && state !== 'fluent' && state !== 'mastery') {
                return band;
            }
        }
        // All unlocked bands are Secure+, use highest not yet Mastery
        for (let i = ALL_BANDS.length - 1; i >= 0; i--) {
            const band = ALL_BANDS[i];
            const state = this.data.bands[band].state;
            if (state !== 'locked' && state !== 'mastery') {
                return band;
            }
        }
        return 'A'; // fallback
    }

    /** Get the frontier sub-atom (lowest Training in current band) */
    getFrontierSubAtom(): SubAtomId {
        const band = this.getCurrentBand();
        for (const num of ALL_SUB_ATOM_NUMBERS) {
            const id = `${band}${num}` as SubAtomId;
            if (this.data.subAtoms[id].state === 'training') {
                return id;
            }
        }
        // No training sub-atom: use first non-mastery sub-atom
        for (const num of ALL_SUB_ATOM_NUMBERS) {
            const id = `${band}${num}` as SubAtomId;
            if (this.data.subAtoms[id].state !== 'mastery') {
                return id;
            }
        }
        return `${band}1` as SubAtomId;
    }

    /** Number of problems per attack turn = player.attack capped at 5 */
    getProblemsPerTurn(): number {
        const player = this.gameState.getPlayer();
        return Math.min(player.attack, MAX_PROBLEMS_PER_TURN);
    }

    /** Bonus damage per correct answer when player.attack exceeds max problems (5) */
    getAttackPowerBonus(): number {
        const player = this.gameState.getPlayer();
        return Math.max(0, player.attack - MAX_PROBLEMS_PER_TURN);
    }

    /** Calculate player level from mastery progress */
    getPlayerLevel(): number {
        let level = 1; // Base level
        for (const band of ALL_BANDS) {
            // Each sub-atom exam pass (Secure+) = +1
            for (const num of ALL_SUB_ATOM_NUMBERS) {
                const id = `${band}${num}` as SubAtomId;
                const state = this.data.subAtoms[id].state;
                if (state === 'secure' || state === 'fluent' || state === 'mastery') {
                    level++;
                }
            }
            // Each band gate pass (Secure+) = +1
            const bandState = this.data.bands[band].state;
            if (bandState === 'secure' || bandState === 'fluent' || bandState === 'mastery') {
                level++;
            }
        }
        return level; // Max: 1 + 20 sub-atoms + 5 gates = 26
    }

    // ========================================
    // Rolling Stats (computed from problemRecords)
    // ========================================

    /** Last 20 first-attempt accuracy for a sub-atom */
    getLast20Accuracy(subAtomId: SubAtomId): number {
        const attempts = this.getRecentFirstAttempts(subAtomId, 20);
        if (attempts.length === 0) return 0;
        const correct = attempts.filter(a => a.correct).length;
        return correct / attempts.length;
    }

    /** Last 10 first-attempt accuracy for a specific form */
    getFormAccuracy(subAtomId: SubAtomId, form: ProblemForm): number {
        const attempts = this.getRecentFirstAttemptsForForm(subAtomId, form, 10);
        if (attempts.length === 0) return 0;
        const correct = attempts.filter(a => a.correct).length;
        return correct / attempts.length;
    }

    /** Median response time of last 20 correct first-attempts */
    getMedianRT(subAtomId: SubAtomId): number {
        const attempts = this.getRecentFirstAttempts(subAtomId, 20);
        const correctTimes = attempts
            .filter(a => a.correct && a.responseTimeMs <= RT_IGNORE_THRESHOLD_MS)
            .map(a => a.responseTimeMs);

        if (correctTimes.length === 0) return Infinity;
        return this.median(correctTimes);
    }

    /** Per-form median response time */
    getFormMedianRT(subAtomId: SubAtomId, form: ProblemForm): number {
        const attempts = this.getRecentFirstAttemptsForForm(subAtomId, form, 10);
        const correctTimes = attempts
            .filter(a => a.correct && a.responseTimeMs <= RT_IGNORE_THRESHOLD_MS)
            .map(a => a.responseTimeMs);

        if (correctTimes.length === 0) return Infinity;
        return this.median(correctTimes);
    }

    /** Average RT for a specific problem key (for [improve] pool ordering) */
    getAverageRT(problemKey: string): number {
        const record = this.data.problemRecords[problemKey];
        if (!record || record.attempts.length === 0) return Infinity;
        const correctTimes = record.attempts
            .filter(a => a.correct && a.responseTimeMs <= RT_IGNORE_THRESHOLD_MS)
            .map(a => a.responseTimeMs);
        if (correctTimes.length === 0) return Infinity;
        return correctTimes.reduce((sum, t) => sum + t, 0) / correctTimes.length;
    }

    /** Count how many forms have >= N successful solves */
    getFormsWithSolves(subAtomId: SubAtomId, minSolves: number): number {
        let count = 0;
        for (const form of ALL_PROBLEM_FORMS) {
            const problems = this.problemDb.getProblemsForForm(subAtomId, form);
            let formSolves = 0;
            for (const p of problems) {
                const record = this.data.problemRecords[p.key];
                if (record) {
                    formSolves += record.attempts.filter(a => a.correct).length;
                }
            }
            if (formSolves >= minSolves) count++;
        }
        return count;
    }

    // ========================================
    // Exam Eligibility
    // ========================================

    /** Check if sub-atom exam is available */
    checkExamEligibility(subAtomId: SubAtomId): boolean {
        const sa = this.data.subAtoms[subAtomId];
        if (sa.state !== 'training') return false;

        return sa.successfulSolves >= 20
            && this.getLast20Accuracy(subAtomId) >= 0.70
            && this.getFormsWithSolves(subAtomId, 4) >= 2;
    }

    /** Check if fluency challenge is available */
    checkFluencyEligibility(subAtomId: SubAtomId): boolean {
        const sa = this.data.subAtoms[subAtomId];
        if (sa.state !== 'secure') return false;

        return sa.successfulSolves >= 30
            && this.getLast20Accuracy(subAtomId) >= 0.85
            && this.getMedianRT(subAtomId) <= FLUENT_RT_MS
            && this.getFormsWithFormAccuracy(subAtomId, 0.80) >= 2;
    }

    /** Check if mastery challenge is available */
    checkMasteryChallengeEligibility(subAtomId: SubAtomId): boolean {
        const sa = this.data.subAtoms[subAtomId];
        if (sa.state !== 'fluent') return false;

        return sa.successfulSolves >= 50
            && this.getLast20Accuracy(subAtomId) >= 0.92
            && this.getMedianRT(subAtomId) <= MASTERY_RT_MS
            && this.getFormsWithFormAccuracyAndRT(subAtomId, 0.90, MASTERY_RT_MS) >= 2;
    }

    /** Check if band gate exam is available */
    getBandGateEligibility(bandId: BandId): boolean {
        for (const num of ALL_SUB_ATOM_NUMBERS) {
            const id = `${bandId}${num}` as SubAtomId;
            const state = this.data.subAtoms[id].state;
            if (state === 'locked' || state === 'training') return false;
        }
        return this.data.bands[bandId].gateExamBestMedal === null
            || this.data.bands[bandId].state === 'training';
    }

    /** Check if band mastery challenge is available */
    checkBandMasteryEligibility(bandId: BandId): boolean {
        const band = this.data.bands[bandId];
        if (band.state !== 'fluent') return false;

        let fluentCount = 0;
        let masteryCount = 0;
        for (const num of ALL_SUB_ATOM_NUMBERS) {
            const id = `${bandId}${num}` as SubAtomId;
            const state = this.data.subAtoms[id].state;
            if (state === 'fluent' || state === 'mastery') fluentCount++;
            if (state === 'mastery') masteryCount++;
        }

        return fluentCount === 4 && masteryCount >= 3;
    }

    // ========================================
    // Stat Rewards
    // ========================================

    /** Apply stat rewards for an exam tier. Returns the gains applied. */
    applyStatRewards(tier: TrialTier): { hpGain: number; attackGain: number; manaGain: number } {
        const rewards = MASTERY_EXAM_REWARDS[tier];
        if (rewards.hp === 0 && rewards.atk === 0 && rewards.mana === 0) {
            return { hpGain: 0, attackGain: 0, manaGain: 0 };
        }

        const player = this.gameState.getPlayer();
        if (rewards.hp > 0) { player.maxHp += rewards.hp; player.hp += rewards.hp; }
        if (rewards.atk > 0) { player.attack += rewards.atk; }
        if (rewards.mana > 0) { ManaSystem.add(player, rewards.mana); }

        return { hpGain: rewards.hp, attackGain: rewards.atk, manaGain: rewards.mana };
    }

    /** Compute exam tier from correct count using EXAM_CONFIGS thresholds.
     *  For pass/fail exams (fluency, mastery, band_mastery), returns 'gold' on pass, 'none' on fail.
     */
    computeExamTier(correctCount: number, examType: ExamType): TrialTier {
        const config = EXAM_CONFIGS[examType];
        // Pass/fail exams
        if (config.passThreshold !== undefined && !config.bronzeThreshold) {
            return correctCount >= config.passThreshold ? 'gold' : 'none';
        }
        // Medal exams
        return this.computeTier(correctCount, config);
    }

    // ========================================
    // Exam Results
    // ========================================

    /** Apply result of a sub-atom exam */
    applyExamResult(subAtomId: SubAtomId, correctCount: number): { tier: TrialTier; stateChanged: boolean; hpGain: number; attackGain: number; manaGain: number } {
        const config = EXAM_CONFIGS.sub_atom;
        const tier = this.computeTier(correctCount, config);
        const sa = this.data.subAtoms[subAtomId];
        let stateChanged = false;

        // Update best medal
        if (sa.examBestMedal === null || this.tierRank(tier) > this.tierRank(sa.examBestMedal)) {
            sa.examBestMedal = tier;
        }

        if (sa.state === 'training' && tier !== 'none') {
            if (tier === 'gold') {
                sa.state = 'fluent'; // Gold directly → Fluent
            } else {
                sa.state = 'secure'; // Bronze/Silver → Secure
            }
            stateChanged = true;
            this.onSubAtomStateChange(subAtomId);
        }

        const statGains = tier !== 'none' ? this.applyStatRewards(tier) : { hpGain: 0, attackGain: 0, manaGain: 0 };
        this.updatePlayerLevel();
        return { tier, stateChanged, ...statGains };
    }

    /** Apply result of fluency challenge */
    applyFluencyResult(subAtomId: SubAtomId, correctCount: number): { passed: boolean; stateChanged: boolean; hpGain: number; attackGain: number; manaGain: number } {
        const config = EXAM_CONFIGS.fluency_challenge;
        const passed = correctCount >= (config.passThreshold || 10);
        const sa = this.data.subAtoms[subAtomId];
        let stateChanged = false;

        sa.fluencyChallengeResult = passed ? 'pass' : 'fail';

        if (passed && sa.state === 'secure') {
            sa.state = 'fluent';
            stateChanged = true;
            this.onSubAtomStateChange(subAtomId);
        }

        const statGains = passed ? this.applyStatRewards('bronze') : { hpGain: 0, attackGain: 0, manaGain: 0 };
        this.updatePlayerLevel();
        return { passed, stateChanged, ...statGains };
    }

    /** Apply result of mastery challenge */
    applyMasteryResult(subAtomId: SubAtomId, correctCount: number): { passed: boolean; stateChanged: boolean; hpGain: number; attackGain: number; manaGain: number } {
        const config = EXAM_CONFIGS.mastery_challenge;
        const passed = correctCount >= (config.passThreshold || 11);
        const sa = this.data.subAtoms[subAtomId];
        let stateChanged = false;

        sa.masteryChallengeResult = passed ? 'pass' : 'fail';

        if (passed && sa.state === 'fluent') {
            sa.state = 'mastery';
            stateChanged = true;
            this.onSubAtomStateChange(subAtomId);
        }

        const statGains = passed ? this.applyStatRewards('gold') : { hpGain: 0, attackGain: 0, manaGain: 0 };
        this.updatePlayerLevel();
        return { passed, stateChanged, ...statGains };
    }

    /** Apply result of band gate exam */
    applyBandGateResult(bandId: BandId, correctCount: number): { tier: TrialTier; stateChanged: boolean; hpGain: number; attackGain: number; manaGain: number } {
        const config = EXAM_CONFIGS.band_gate;
        const tier = this.computeTier(correctCount, config);
        const band = this.data.bands[bandId];
        let stateChanged = false;

        if (band.gateExamBestMedal === null || this.tierRank(tier) > this.tierRank(band.gateExamBestMedal)) {
            band.gateExamBestMedal = tier;
        }

        if (band.state === 'training' && tier !== 'none') {
            band.state = 'secure';
            stateChanged = true;
            this.onBandStateChange(bandId);
        }

        const statGains = tier !== 'none' ? this.applyStatRewards(tier) : { hpGain: 0, attackGain: 0, manaGain: 0 };
        this.updatePlayerLevel();
        return { tier, stateChanged, ...statGains };
    }

    /** Apply result of band mastery challenge */
    applyBandMasteryResult(bandId: BandId, correctCount: number): { passed: boolean; stateChanged: boolean; hpGain: number; attackGain: number; manaGain: number } {
        const config = EXAM_CONFIGS.band_mastery;
        const passed = correctCount >= (config.passThreshold || 18);
        const band = this.data.bands[bandId];
        let stateChanged = false;

        band.bandMasteryChallengeResult = passed ? 'pass' : 'fail';

        if (passed && band.state === 'fluent') {
            band.state = 'mastery';
            stateChanged = true;
        }

        const statGains = passed ? this.applyStatRewards('gold') : { hpGain: 0, attackGain: 0, manaGain: 0 };
        this.updatePlayerLevel();
        return { passed, stateChanged, ...statGains };
    }

    // ========================================
    // Record Solve
    // ========================================

    /** Record a problem solve from battle or exam */
    recordSolve(
        problemKey: string,
        correct: boolean,
        responseTimeMs: number,
        context: MasteryAttempt['context']
    ): void {
        const problem = this.problemDb.getProblemByKey(problemKey);
        if (!problem) return;

        const data = this.data;
        data.globalSolveSequence++;

        // Ensure problem record exists
        if (!data.problemRecords[problemKey]) {
            data.problemRecords[problemKey] = {
                problemKey,
                subAtomId: problem.subAtomId,
                form: problem.form,
                attempts: [],
            };
        }

        // Add attempt
        const attempt: MasteryAttempt = {
            timestamp: Date.now(),
            correct,
            responseTimeMs,
            context,
            sequenceIndex: data.globalSolveSequence,
        };
        data.problemRecords[problemKey].attempts.push(attempt);

        // Update sub-atom stats
        const sa = data.subAtoms[problem.subAtomId];
        if (correct) {
            sa.successfulSolves++;
        }
        sa.fightsSinceSeen = 0;

        // Update retry/slow pools
        if (!correct) {
            if (!data.retryPool.includes(problemKey)) {
                data.retryPool.push(problemKey);
            }
        } else {
            // Remove from retry pool on correct answer
            data.retryPool = data.retryPool.filter(k => k !== problemKey);
        }

        if (responseTimeMs > SLOW_POOL_THRESHOLD_MS && correct) {
            if (!data.slowPool.includes(problemKey)) {
                data.slowPool.push(problemKey);
            }
        } else if (correct && responseTimeMs <= SLOW_POOL_THRESHOLD_MS) {
            // Remove from slow pool if answered fast enough
            data.slowPool = data.slowPool.filter(k => k !== problemKey);
        }

        // Check automatic state transitions
        this.checkAutomaticTransitions(problem.subAtomId);
    }

    // ========================================
    // Pool Generation & Drawing
    // ========================================

    /**
     * Generate a new pool of 10 problem keys.
     * Called when currentPool is exhausted.
     */
    generatePool(): string[] {
        const data = this.data;
        const pool: string[] = [];
        const used = new Set<string>();

        // [retry] up to 3 from retryPool
        const retryProblems = data.retryPool.slice(0, 3);
        for (const key of retryProblems) {
            if (pool.length >= 10) break;
            pool.push(key);
            used.add(key);
        }

        // [slow] up to 3 from slowPool
        for (const key of data.slowPool) {
            if (pool.length >= 10) break;
            if (used.has(key)) continue;
            pool.push(key);
            used.add(key);
            if (pool.length - retryProblems.length >= 3) break;
        }

        // [current] 6 from frontier sub-atom
        const frontier = this.getFrontierSubAtom();
        const currentProblems = this.selectCurrentProblems(frontier, 6, used, data.lastPoolProblems);
        for (const key of currentProblems) {
            if (pool.length >= 10) break;
            pool.push(key);
            used.add(key);
        }

        // [improve] 2 from same-band Secure-not-Fluent sub-atoms
        const band = this.getCurrentBand();
        const improveProblems = this.selectImproveProblems(band, 2, used);
        for (const key of improveProblems) {
            if (pool.length >= 10) break;
            pool.push(key);
            used.add(key);
        }

        // [review] 1 from Fluent sub-atoms
        const reviewProblems = this.selectReviewProblems('fluent', 1, used);
        for (const key of reviewProblems) {
            if (pool.length >= 10) break;
            pool.push(key);
            used.add(key);
        }

        // [master] 1 from Mastery sub-atoms
        const masterProblems = this.selectReviewProblems('mastery', 1, used);
        for (const key of masterProblems) {
            if (pool.length >= 10) break;
            pool.push(key);
            used.add(key);
        }

        // If pool is not full, loop through categories again
        while (pool.length < 10) {
            const fillProblems = this.selectCurrentProblems(frontier, 10 - pool.length, used, []);
            if (fillProblems.length === 0) break; // Can't generate more
            for (const key of fillProblems) {
                if (pool.length >= 10) break;
                pool.push(key);
                used.add(key);
            }
        }

        // Post-process: enforce max 1 zero-problem across the entire pool
        // (individual selection stages track zeros locally, but across stages
        // duplicates can slip through)
        let poolZeroCount = 0;
        for (let i = pool.length - 1; i >= 0; i--) {
            const prob = this.problemDb.getProblemByKey(pool[i]);
            if (prob && this.hasZero(prob)) {
                poolZeroCount++;
                if (poolZeroCount > 1) {
                    pool.splice(i, 1);
                }
            }
        }

        // Save as current pool
        data.lastPoolProblems = [...data.currentPool];
        data.currentPool = pool;
        data.currentPoolIndex = 0;

        console.log(`[MasterySystem] Generated pool of ${pool.length} problems, frontier=${frontier}`);
        return pool;
    }

    /** Draw from [review] pool (Fluent sub-atoms). Does NOT consume from main battle pool. */
    drawFromReviewPool(count: number): string[] {
        return this.selectReviewProblems('fluent', count, new Set());
    }

    /** Draw from [master] pool (Mastery sub-atoms). Does NOT consume from main battle pool. */
    drawFromMasterPool(count: number): string[] {
        return this.selectReviewProblems('mastery', count, new Set());
    }

    /** Expose mastery RT threshold for block quick-bonus calculation */
    getMasteryRTThreshold(): number { return MASTERY_RT_MS; }

    /**
     * Draw next `count` problem keys from the current pool.
     * If pool is exhausted, generates a new one.
     */
    drawFromPool(count: number): string[] {
        const data = this.data;
        const result: string[] = [];

        for (let i = 0; i < count; i++) {
            if (data.currentPoolIndex >= data.currentPool.length || data.currentPool.length === 0) {
                this.generatePool();
            }
            if (data.currentPoolIndex < data.currentPool.length) {
                result.push(data.currentPool[data.currentPoolIndex]);
                data.currentPoolIndex++;
            }
        }

        return result;
    }

    /** Called after each fight to update fightsSinceSeen counters */
    recordFightEnd(): void {
        const data = this.data;
        data.fightCount++;

        for (const band of ALL_BANDS) {
            for (const num of ALL_SUB_ATOM_NUMBERS) {
                const id = `${band}${num}` as SubAtomId;
                const sa = data.subAtoms[id];
                if (sa.state !== 'locked') {
                    sa.fightsSinceSeen++;
                }
            }
        }
    }

    /** Get speed bonus for a response time */
    getSpeedBonus(responseTimeMs: number): { bonusDamage: number; type: 'none' | 'swift' | 'lightning' } {
        if (responseTimeMs <= LIGHTNING_HIT_MS) {
            return { bonusDamage: 2, type: 'lightning' };
        } else if (responseTimeMs <= SWIFT_HIT_MS) {
            return { bonusDamage: 1, type: 'swift' };
        }
        return { bonusDamage: 0, type: 'none' };
    }

    // ========================================
    // Exam Problem Generation
    // ========================================

    /** Generate problem keys for a sub-atom exam (10 items) */
    generateSubAtomExamProblems(subAtomId: SubAtomId): string[] {
        // 4 result_unknown + 3 missing_part + 3 compare_eq_vs_number (no compare_eq_vs_equation)
        const problems: string[] = [];
        problems.push(...this.pickRandomProblems(subAtomId, 'result_unknown', 4));
        problems.push(...this.pickRandomProblems(subAtomId, 'missing_part', 3));
        problems.push(...this.pickRandomProblems(subAtomId, 'compare_equation_vs_number', 3));
        return this.shuffle(problems);
    }

    /** Generate problem keys for fluency/mastery challenge (12 items, mixed forms) */
    generateChallengeProblemKeys(subAtomId: SubAtomId, count: number, examType: ExamType = 'mastery_challenge'): string[] {
        // Fluency challenge: player is secure, hasn't seen compare_equation_vs_equation yet
        // Mastery challenge: player is fluent, all 4 forms available
        const forms: ProblemForm[] = examType === 'fluency_challenge'
            ? ['result_unknown', 'missing_part', 'compare_equation_vs_number']
            : ALL_PROBLEM_FORMS;
        const perForm = Math.ceil(count / forms.length);
        const problems: string[] = [];
        for (const form of forms) {
            problems.push(...this.pickRandomProblems(subAtomId, form, perForm));
        }
        return this.shuffle(problems).slice(0, count);
    }

    /** Generate problem keys for band gate exam (16 items: 4 per sub-atom) */
    generateBandGateProblems(bandId: BandId): string[] {
        const problems: string[] = [];
        for (const num of ALL_SUB_ATOM_NUMBERS) {
            const subAtomId = `${bandId}${num}` as SubAtomId;
            // 4 problems per sub-atom: 2 result_unknown + 1 missing_part + 1 compare_vs_number
            problems.push(...this.pickRandomProblems(subAtomId, 'result_unknown', 2));
            problems.push(...this.pickRandomProblems(subAtomId, 'missing_part', 1));
            problems.push(...this.pickRandomProblems(subAtomId, 'compare_equation_vs_number', 1));
        }
        return this.shuffle(problems);
    }

    /** Generate problem keys for band mastery challenge (20 items) */
    generateBandMasteryProblems(bandId: BandId): string[] {
        const problems: string[] = [];
        // 4 addition + 4 subtraction + 4 comparison + 6 three-operand + 2 mixed
        const sa1 = `${bandId}1` as SubAtomId;
        const sa2 = `${bandId}2` as SubAtomId;
        const sa3 = `${bandId}3` as SubAtomId;
        const sa4 = `${bandId}4` as SubAtomId;

        problems.push(...this.pickRandomProblems(sa1, 'result_unknown', 2));
        problems.push(...this.pickRandomProblems(sa1, 'missing_part', 2));
        problems.push(...this.pickRandomProblems(sa2, 'result_unknown', 2));
        problems.push(...this.pickRandomProblems(sa2, 'missing_part', 2));
        problems.push(...this.pickRandomProblems(sa3, 'result_unknown', 2));
        problems.push(...this.pickRandomProblems(sa3, 'compare_equation_vs_number', 2));
        problems.push(...this.pickRandomProblems(sa3, 'result_unknown', 2));
        problems.push(...this.pickRandomProblems(sa3, 'compare_equation_vs_equation', 2));
        problems.push(...this.pickRandomProblems(sa4, 'result_unknown', 1));
        problems.push(...this.pickRandomProblems(sa4, 'missing_part', 1));

        return this.shuffle(problems).slice(0, 20);
    }

    // ========================================
    // Available Exams for Guild
    // ========================================

    /** Get all available exams for the Guild scene */
    getAvailableExams(): Array<{ type: ExamType; targetId: SubAtomId | BandId; label: string }> {
        const exams: Array<{ type: ExamType; targetId: SubAtomId | BandId; label: string }> = [];

        for (const band of ALL_BANDS) {
            for (const num of ALL_SUB_ATOM_NUMBERS) {
                const id = `${band}${num}` as SubAtomId;
                if (this.checkExamEligibility(id)) {
                    exams.push({ type: 'sub_atom', targetId: id, label: `Zkouška ${id}` });
                }
                if (this.checkFluencyEligibility(id)) {
                    exams.push({ type: 'fluency_challenge', targetId: id, label: `Plynulost ${id}` });
                }
                if (this.checkMasteryChallengeEligibility(id)) {
                    exams.push({ type: 'mastery_challenge', targetId: id, label: `Mistrovství ${id}` });
                }
            }

            if (this.getBandGateEligibility(band)) {
                exams.push({ type: 'band_gate', targetId: band, label: `Brána ${band}` });
            }
            if (this.checkBandMasteryEligibility(band)) {
                exams.push({ type: 'band_mastery', targetId: band, label: `Mistrovství pásma ${band}` });
            }
        }

        return exams;
    }

    // ========================================
    // Private helpers
    // ========================================

    /** Check transitions that can happen automatically (without exams) */
    private checkAutomaticTransitions(subAtomId: SubAtomId): void {
        // Band state transitions based on sub-atom states
        const bandId = subAtomId[0] as BandId;
        this.checkBandFluency(bandId);
    }

    /** Check if band should become Fluent (3 of 4 sub-atoms Fluent+) */
    private checkBandFluency(bandId: BandId): void {
        const band = this.data.bands[bandId];
        if (band.state !== 'secure') return;

        let fluentCount = 0;
        for (const num of ALL_SUB_ATOM_NUMBERS) {
            const id = `${bandId}${num}` as SubAtomId;
            const state = this.data.subAtoms[id].state;
            if (state === 'fluent' || state === 'mastery') fluentCount++;
        }

        if (fluentCount >= 3) {
            band.state = 'fluent';
        }
    }

    /** Called when a sub-atom changes state — may unlock next sub-atom */
    private onSubAtomStateChange(subAtomId: SubAtomId): void {
        const bandId = subAtomId[0] as BandId;
        const num = parseInt(subAtomId[1]) as SubAtomNumber;

        // Unlock next sub-atom if this one became Secure+
        const sa = this.data.subAtoms[subAtomId];
        if (sa.state === 'secure' || sa.state === 'fluent' || sa.state === 'mastery') {
            const nextNum = (num + 1) as SubAtomNumber;
            if (nextNum <= 4) {
                const nextId = `${bandId}${nextNum}` as SubAtomId;
                if (this.data.subAtoms[nextId].state === 'locked') {
                    this.data.subAtoms[nextId].state = 'training';
                }
            }
        }

        // Check band-level transitions
        this.checkBandFluency(bandId);
    }

    /** Called when a band changes state — may unlock next band */
    private onBandStateChange(bandId: BandId): void {
        const bandIndex = ALL_BANDS.indexOf(bandId);
        if (bandIndex < ALL_BANDS.length - 1) {
            const nextBand = ALL_BANDS[bandIndex + 1];
            const nextBandState = this.data.bands[nextBand];
            if (nextBandState.state === 'locked') {
                nextBandState.state = 'training';
                // Unlock first sub-atom
                const firstSubAtom = `${nextBand}1` as SubAtomId;
                this.data.subAtoms[firstSubAtom].state = 'training';
            }
        }
    }

    /** Update player level based on mastery progress */
    updatePlayerLevel(): void {
        const player = this.gameState.getPlayer();
        player.level = this.getPlayerLevel();
    }

    /** Select [current] problems from frontier sub-atom */
    private selectCurrentProblems(
        subAtomId: SubAtomId,
        count: number,
        used: Set<string>,
        lastPool: string[]
    ): string[] {
        const sa = this.data.subAtoms[subAtomId];
        const phase = this.getPhase(sa);
        const weights = FORM_WEIGHTS[phase];

        // Build weighted form selection
        const result: string[] = [];
        let zeroCount = 0; // Max 1 problem with 0

        const allProblems = this.problemDb.getAllProblems(subAtomId);
        if (allProblems.length === 0) return result;

        // Sort by form weight (highest first) then by RT (highest first)
        const candidates = allProblems
            .filter(p => !used.has(p.key) && !lastPool.includes(p.key))
            .map(p => ({
                problem: p,
                weight: weights[p.form],
                avgRT: this.getAverageRT(p.key),
            }))
            .filter(c => c.weight > 0);

        // Select 2 with highest average RT first
        candidates.sort((a, b) => b.avgRT - a.avgRT);
        const highRT = candidates.slice(0, 2);
        for (const c of highRT) {
            if (result.length >= count) break;
            if (this.hasZero(c.problem) && zeroCount >= 1) continue;
            if (this.hasZero(c.problem)) zeroCount++;
            result.push(c.problem.key);
            used.add(c.problem.key);
        }

        // Fill rest weighted by form
        const remaining = candidates.filter(c => !used.has(c.problem.key));
        this.shuffle(remaining);

        // Weighted selection
        for (const c of remaining) {
            if (result.length >= count) break;
            if (this.hasZero(c.problem) && zeroCount >= 1) continue;
            if (this.hasZero(c.problem)) zeroCount++;
            // Weighted probability check
            if (Math.random() * 100 < c.weight) {
                result.push(c.problem.key);
                used.add(c.problem.key);
            }
        }

        // If still not enough, just fill from remaining
        for (const c of remaining) {
            if (result.length >= count) break;
            if (used.has(c.problem.key)) continue;
            if (this.hasZero(c.problem) && zeroCount >= 1) continue;
            if (this.hasZero(c.problem)) zeroCount++;
            result.push(c.problem.key);
            used.add(c.problem.key);
        }

        return result;
    }

    /** Select [improve] problems from Secure-not-Fluent sub-atoms */
    private selectImproveProblems(band: BandId, count: number, used: Set<string>): string[] {
        const result: string[] = [];
        const subAtoms: SubAtomId[] = [];

        // Find Secure-not-Fluent sub-atoms in this band
        for (const num of ALL_SUB_ATOM_NUMBERS) {
            const id = `${band}${num}` as SubAtomId;
            if (this.data.subAtoms[id].state === 'secure') {
                subAtoms.push(id);
            }
        }

        if (subAtoms.length === 0) return result;

        // Alternate between sub-atoms, ordered by avg RT (highest first)
        let saIndex = 0;
        for (let i = 0; i < count * 3 && result.length < count; i++) {
            const saId = subAtoms[saIndex % subAtoms.length];
            const problems = this.problemDb.getAllProblems(saId)
                .filter(p => !used.has(p.key))
                .sort((a, b) => this.getAverageRT(b.key) - this.getAverageRT(a.key));

            if (problems.length > 0) {
                // Never-seen first, then highest RT
                const neverSeen = problems.find(p => !this.data.problemRecords[p.key]);
                const pick = neverSeen || problems[0];
                result.push(pick.key);
                used.add(pick.key);
            }
            saIndex++;
        }

        return result;
    }

    /** Select [review] or [master] problems from sub-atoms with given state */
    private selectReviewProblems(state: 'fluent' | 'mastery', count: number, used: Set<string>): string[] {
        const result: string[] = [];

        for (const band of ALL_BANDS) {
            for (const num of ALL_SUB_ATOM_NUMBERS) {
                if (result.length >= count) break;
                const id = `${band}${num}` as SubAtomId;
                if (this.data.subAtoms[id].state !== state) continue;

                const problems = this.problemDb.getAllProblems(id)
                    .filter(p => !used.has(p.key))
                    .sort((a, b) => this.getAverageRT(b.key) - this.getAverageRT(a.key));

                // Never-seen first, then highest RT
                const neverSeen = problems.find(p => !this.data.problemRecords[p.key]);
                const pick = neverSeen || problems[0];
                if (pick) {
                    result.push(pick.key);
                    used.add(pick.key);
                }
            }
        }

        return result;
    }

    /** Pick N random problems from a sub-atom/form combo */
    private pickRandomProblems(subAtomId: SubAtomId, form: ProblemForm, count: number): string[] {
        const available = this.problemDb.getProblemsForForm(subAtomId, form)
            .filter(p => !this.hasZero(p));
        const shuffled = this.shuffle([...available]);
        return shuffled.slice(0, count).map(p => p.key);
    }

    /** Determine phase for form weight selection */
    private getPhase(sa: SubAtomState): string {
        if (sa.state === 'training') {
            return sa.successfulSolves < 10 ? 'T1' : 'T2';
        }
        if (sa.state === 'secure') return 'S';
        return 'FM'; // fluent or mastery
    }

    /** Check if a problem contains 0 as any operand or has a zero answer */
    private hasZero(p: ProblemDefinition): boolean {
        const answerIsZero = (p.form === 'result_unknown' || p.form === 'missing_part') && p.answer === 0;
        return p.operand1 === 0 || p.operand2 === 0 || (p.operand3 !== undefined && p.operand3 === 0) || answerIsZero;
    }

    /** Get recent first-attempt entries for a sub-atom (most recent first) */
    private getRecentFirstAttempts(subAtomId: SubAtomId, count: number): MasteryAttempt[] {
        const allAttempts: MasteryAttempt[] = [];
        for (const record of Object.values(this.data.problemRecords)) {
            if (record.subAtomId === subAtomId && record.attempts.length > 0) {
                // First attempt for each problem appearance = the attempt itself
                // (we track all attempts, but for stats we use the first per solve)
                allAttempts.push(...record.attempts);
            }
        }
        // Sort by sequenceIndex descending and take last N
        allAttempts.sort((a, b) => b.sequenceIndex - a.sequenceIndex);
        return allAttempts.slice(0, count);
    }

    /** Get recent first-attempt entries for a specific form */
    private getRecentFirstAttemptsForForm(subAtomId: SubAtomId, form: ProblemForm, count: number): MasteryAttempt[] {
        const allAttempts: MasteryAttempt[] = [];
        for (const record of Object.values(this.data.problemRecords)) {
            if (record.subAtomId === subAtomId && record.form === form && record.attempts.length > 0) {
                allAttempts.push(...record.attempts);
            }
        }
        allAttempts.sort((a, b) => b.sequenceIndex - a.sequenceIndex);
        return allAttempts.slice(0, count);
    }

    /** Count forms where last 10 accuracy >= threshold */
    private getFormsWithFormAccuracy(subAtomId: SubAtomId, threshold: number): number {
        let count = 0;
        for (const form of ALL_PROBLEM_FORMS) {
            if (this.getFormAccuracy(subAtomId, form) >= threshold) count++;
        }
        return count;
    }

    /** Count forms where both accuracy AND RT meet thresholds */
    private getFormsWithFormAccuracyAndRT(subAtomId: SubAtomId, accThreshold: number, rtThreshold: number): number {
        let count = 0;
        for (const form of ALL_PROBLEM_FORMS) {
            if (this.getFormAccuracy(subAtomId, form) >= accThreshold
                && this.getFormMedianRT(subAtomId, form) <= rtThreshold) {
                count++;
            }
        }
        return count;
    }

    /** Compute exam tier from correct count */
    private computeTier(correctCount: number, config: ExamConfig): TrialTier {
        if (config.goldThreshold && correctCount >= config.goldThreshold) return 'gold';
        if (config.silverThreshold && correctCount >= config.silverThreshold) return 'silver';
        if (config.bronzeThreshold && correctCount >= config.bronzeThreshold) return 'bronze';
        return 'none';
    }

    private tierRank(tier: TrialTier): number {
        switch (tier) {
            case 'none': return 0;
            case 'bronze': return 1;
            case 'silver': return 2;
            case 'gold': return 3;
        }
    }

    private median(values: number[]): number {
        if (values.length === 0) return 0;
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    private shuffle<T>(arr: T[]): T[] {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }
}
