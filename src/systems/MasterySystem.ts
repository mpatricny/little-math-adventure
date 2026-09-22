import {
    BandId, SubAtomId, SubAtomNumber, ProblemForm, ExamType, MasteryTargetId,
    MasteryData, SubAtomState, MasteryAttempt, ProblemDefinition,
    TrialTier, ExamConfig, EXAM_CONFIGS, MathProblem,
    ALL_BANDS, ALL_SUB_ATOM_NUMBERS, ALL_PROBLEM_FORMS,
} from '../types';
import { getLearningBand, getLearningFrontier } from './LearningProgress';
import { GameStateManager } from './GameStateManager';
import { ProblemDatabase } from './ProblemDatabase';
import { ManaSystem } from './ManaSystem';
import { CrystalSystem } from './CrystalSystem';
import { ProgressionSystem } from './ProgressionSystem';
import { DailyProgressSystem } from './DailyProgressSystem';

import { getThresholdsForSubAtom } from './MasteryThresholds';
import { getPlayerAttackProblemCount } from './CombatAttackSystem';
import {
    calculateSubAtomExamProgress,
    SubAtomExamProgress,
    SUB_ATOM_EXAM_REQUIREMENTS,
} from './ExamProgress';
import {
    applyComparisonExamResult as applyChapterExamResult,
    createInitialComparisonChapterState,
    generateComparisonExamProblems as createComparisonExamProblems,
    generateComparisonTrainingProblems as createComparisonTrainingProblems,
    getCurrentComparisonStage,
    markComparisonStageIntroSeen,
    ensureComparisonChapter,
    needsComparisonStageIntro,
    recordComparisonAttempt as recordChapterAttempt,
    comparisonChapterProgress,
} from './ComparisonLearningSystem';

// Non-difficulty thresholds (stay global)
const SLOW_POOL_THRESHOLD_MS = 15000;
const RT_IGNORE_THRESHOLD_MS = 20000; // Don't track RT above this (likely a pause)
const COOP_AUTO_PROMOTION_RT_MS = 15000;

// Problem form weights by phase
const FORM_WEIGHTS: Record<string, Record<ProblemForm, number>> = {
    T1: { result_unknown: 70, missing_part: 30, compare_equation_vs_number: 0,  compare_equation_vs_equation: 0  },
    T2: { result_unknown: 40, missing_part: 30, compare_equation_vs_number: 30, compare_equation_vs_equation: 0  },
    S:  { result_unknown: 30, missing_part: 30, compare_equation_vs_number: 40, compare_equation_vs_equation: 0  },
    FM: { result_unknown: 25, missing_part: 25, compare_equation_vs_number: 25, compare_equation_vs_equation: 25 },
};

// Stat rewards per exam tier (same values as old ProgressionSystem TRIAL_TIER_REWARDS)
const MASTERY_EXAM_REWARDS: Record<TrialTier, { hp: number; atk: number; mana: number }> = {
    none:   { hp: 0, atk: 0, mana: 0 },
    bronze: { hp: 1, atk: 0, mana: 0 },
    silver: { hp: 1, atk: 1, mana: 0 },
    gold:   { hp: 1, atk: 1, mana: 2 },
};

interface ScopedMasteryAttempt {
    attempt: MasteryAttempt;
    subAtomId: SubAtomId;
    form: ProblemForm;
}

/**
 * MasterySystem: handles state machine, fight scheduling, and analytics
 * for the mastery-based progression system.
 */
export class MasterySystem {
    private static instance: MasterySystem;
    private gameState: GameStateManager;
    private problemDb: ProblemDatabase;
    private activeData: MasteryData | null = null;

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

    /**
     * Set which player's mastery data to use (for co-op per-player isolation).
     * Pass null to revert to GameStateManager default.
     */
    setActiveData(data: MasteryData | null): void {
        this.activeData = data;
        if (data) this.ensureComparisonChapter(data);
    }

    private get data(): MasteryData {
        const data = this.activeData ?? this.gameState.getMasteryData();
        this.ensureComparisonChapter(data);
        return data;
    }

    private ensureComparisonChapter(data: MasteryData): void {
        ensureComparisonChapter(data);
    }

    getComparisonChapterState() {
        return this.data.comparisonChapter ?? createInitialComparisonChapterState();
    }

    isComparisonChapterComplete(): boolean {
        return this.getComparisonChapterState().status === 'complete';
    }

    shouldTrainComparisonChapter(): boolean {
        return this.getComparisonChapterState().status === 'training';
    }

    getCurrentComparisonStage() {
        return getCurrentComparisonStage(this.getComparisonChapterState());
    }

    needsComparisonStageIntro(): boolean {
        return needsComparisonStageIntro(this.getComparisonChapterState());
    }

    markComparisonStageIntroSeen(): void {
        markComparisonStageIntroSeen(this.getComparisonChapterState());
    }

    generateComparisonTrainingProblems(count: number, diagnosticMode = false): MathProblem[] {
        return createComparisonTrainingProblems(this.getComparisonChapterState(), count, diagnosticMode);
    }

    generateComparisonExamProblems(count = EXAM_CONFIGS.comparison_chapter.itemCount): MathProblem[] {
        return createComparisonExamProblems(this.getComparisonChapterState(), count);
    }

    /** All three combat actions practice the active chapter, including the wait for its exam. */
    generateComparisonBattleProblems(count: number): MathProblem[] | null {
        const chapter = this.getComparisonChapterState();
        if (chapter.status !== 'training' && chapter.status !== 'exam_ready') return null;
        return createComparisonTrainingProblems(chapter, count);
    }

    recordComparisonSolve(problem: MathProblem, correct: boolean, responseTimeMs: number, assisted: boolean): void {
        const data = this.data;
        data.globalSolveSequence++;
        recordChapterAttempt(
            this.getComparisonChapterState(),
            problem,
            correct,
            responseTimeMs,
            assisted,
            data.globalSolveSequence,
        );
        // Co-op checkpoints use their explicit player tracks in CoopSessionManager.
        if (!this.activeData) this.gameState.save();
    }

    applyComparisonExamResult(correctCount: number, tierOverride?: TrialTier, sessionOnly = false) {
        const tier = tierOverride ?? this.computeExamTier(correctCount, 'comparison_chapter');
        const state = this.getComparisonChapterState();
        const wasComplete = state.status === 'complete';
        applyChapterExamResult(state, tier);
        if (state.status === 'complete') this.unlockA3AfterComparison();
        const statGains = (!sessionOnly && tier !== 'none')
            ? this.applyStatRewards(tier)
            : { hpGain: 0, attackGain: 0, manaGain: 0 };
        if (!sessionOnly) this.updatePlayerLevel();
        return { tier, stateChanged: !wasComplete && state.status === 'complete', ...statGains };
    }

    // ========================================
    // State Queries
    // ========================================

    /** Get the highest unlocked learning band, including a completed final band. */
    getCurrentBand(): BandId {
        return getLearningBand(this.data);
    }

    /** Current arithmetic module, shared by combat and mana collection. */
    getFrontierSubAtom(): SubAtomId {
        return getLearningFrontier(this.data);
    }

    /** Number of base math problems in a solo attack. */
    getProblemsPerTurn(): number {
        const player = this.gameState.getPlayer();
        return getPlayerAttackProblemCount(player.attack);
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

        // Subtract placement-secured levels (band selection shouldn't boost combat stats)
        const startBand = this.data.selectedStartBand;
        if (startBand) {
            const startIndex = ALL_BANDS.indexOf(startBand);
            const placementLevels = startIndex * 5; // 4 sub-atoms + 1 gate per skipped band
            level -= placementLevels;
        }

        return Math.max(1, level); // Max: 1 + 20 sub-atoms + 5 gates = 26 (minus placement)
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
            .filter(a => a.correct && a.context !== 'underwater_bell' && a.responseTimeMs <= RT_IGNORE_THRESHOLD_MS)
            .map(a => a.responseTimeMs);

        if (correctTimes.length === 0) return Infinity;
        return this.median(correctTimes);
    }

    /** Per-form median response time */
    getFormMedianRT(subAtomId: SubAtomId, form: ProblemForm): number {
        const attempts = this.getRecentFirstAttemptsForForm(subAtomId, form, 10);
        const correctTimes = attempts
            .filter(a => a.correct && a.context !== 'underwater_bell' && a.responseTimeMs <= RT_IGNORE_THRESHOLD_MS)
            .map(a => a.responseTimeMs);

        if (correctTimes.length === 0) return Infinity;
        return this.median(correctTimes);
    }

    /** Average RT for a specific problem key (for [improve] pool ordering) */
    getAverageRT(problemKey: string): number {
        const record = this.data.problemRecords[problemKey];
        if (!record || record.attempts.length === 0) return Infinity;
        const correctTimes = record.attempts
            .filter(a => a.correct && a.context !== 'underwater_bell' && a.responseTimeMs <= RT_IGNORE_THRESHOLD_MS)
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
        if (!this.isSubAtomAvailable(subAtomId)) return false;
        const sa = this.data.subAtoms[subAtomId];
        if (sa.state !== 'training') return false;

        return this.getSubAtomExamProgress(subAtomId).ready;
    }

    /** Progress toward the standard exam for one training sub-atom. */
    getSubAtomExamProgress(subAtomId: SubAtomId): SubAtomExamProgress {
        const sa = this.data.subAtoms[subAtomId];
        return calculateSubAtomExamProgress(
            subAtomId,
            sa.successfulSolves,
            this.getLast20Accuracy(subAtomId),
            this.getFormsWithSolves(subAtomId, SUB_ATOM_EXAM_REQUIREMENTS.solvesPerForm),
        );
    }

    /** Progress for the training sub-atom currently blocking the next exam. */
    getNextSubAtomExamProgress(): SubAtomExamProgress | null {
        const targetId = this.getFrontierSubAtom();
        if (this.data.subAtoms[targetId].state !== 'training') return null;
        return this.getSubAtomExamProgress(targetId);
    }

    getComparisonExamProgress() {
        const chapter = this.getComparisonChapterState();
        if (chapter.status !== 'training' && chapter.status !== 'exam_ready') return null;
        return {
            targetId: 'comparison_symbols' as const,
            percentage: Math.floor(comparisonChapterProgress(chapter) * 100),
        };
    }

    /** Chapter answers and later mixed comparison practice share challenge eligibility. */
    private getComparisonChallengeAttempts() {
        const chapter = this.getComparisonChapterState().attempts
            .filter(attempt => !attempt.diagnosticMode)
            .map(attempt => ({ ...attempt, form: attempt.representation as string }));
        const review = Object.values(this.data.problemRecords)
            .filter(record => record.form === 'compare_equation_vs_number' || record.form === 'compare_equation_vs_equation')
            .flatMap(record => record.attempts.map(attempt => ({ ...attempt, assisted: false, exam: !['battle', 'battle_block', 'battle_sword', 'battle_pet'].includes(attempt.context), form: record.form as string })));
        return [...chapter, ...review].sort((a, b) => a.sequenceIndex - b.sequenceIndex);
    }

    private comparisonChallengeRelevant(type: 'fluency_challenge' | 'mastery_challenge'): boolean {
        const chapter = this.getComparisonChapterState();
        if (chapter.status !== 'complete') return false;
        return type === 'fluency_challenge'
            ? chapter.fluencyChallengeResult !== 'pass'
            : chapter.fluencyChallengeResult === 'pass' && chapter.masteryChallengeResult !== 'pass';
    }

    checkComparisonChallengeEligibility(type: 'fluency_challenge' | 'mastery_challenge'): boolean {
        if (!this.comparisonChallengeRelevant(type)) return false;
        const attempts = this.getComparisonChallengeAttempts();
        const correct = attempts.filter(attempt => attempt.correct && !attempt.assisted);
        const recent = attempts.slice(-20);
        const mastery = type === 'mastery_challenge';
        const thresholds = getThresholdsForSubAtom('A3');
        const rt = mastery ? thresholds.masteryRT : thresholds.fluentRT;
        const times = correct.map(attempt => attempt.responseTimeMs).filter(time => time > 0 && time <= RT_IGNORE_THRESHOLD_MS);
        const forms = [...new Set(attempts.map(attempt => attempt.form))].filter(form => {
            const sample = attempts.filter(attempt => attempt.form === form).slice(-20);
            const successes = sample.filter(attempt => attempt.correct && !attempt.assisted);
            return successes.length / sample.length >= (mastery ? 0.9 : 0.8)
                && (!mastery || this.median(successes.map(attempt => attempt.responseTimeMs)) <= rt);
        });
        return correct.length >= (mastery ? 50 : 30)
            && recent.filter(attempt => attempt.correct && !attempt.assisted).length / recent.length >= (mastery ? 0.92 : 0.85)
            && times.length > 0 && this.median(times) <= rt && forms.length >= 2;
    }

    /** Check if fluency challenge is available */
    checkFluencyEligibility(subAtomId: SubAtomId): boolean {
        if (!this.isSubAtomAvailable(subAtomId)) return false;
        const sa = this.data.subAtoms[subAtomId];
        if (sa.state !== 'secure') return false;

        const { fluentRT } = getThresholdsForSubAtom(subAtomId);
        return sa.successfulSolves >= 30
            && this.getLast20Accuracy(subAtomId) >= 0.85
            && this.getMedianRT(subAtomId) <= fluentRT
            && this.getFormsWithFormAccuracy(subAtomId, 0.80) >= 2;
    }

    /** Check if mastery challenge is available */
    checkMasteryChallengeEligibility(subAtomId: SubAtomId): boolean {
        if (!this.isSubAtomAvailable(subAtomId)) return false;
        const sa = this.data.subAtoms[subAtomId];
        if (sa.state !== 'fluent') return false;

        const { masteryRT } = getThresholdsForSubAtom(subAtomId);
        return sa.successfulSolves >= 50
            && this.getLast20Accuracy(subAtomId) >= 0.92
            && this.getMedianRT(subAtomId) <= masteryRT
            && this.getFormsWithFormAccuracyAndRT(subAtomId, 0.90, masteryRT) >= 2;
    }

    /** Check if band gate exam is available */
    getBandGateEligibility(bandId: BandId): boolean {
        if (bandId === 'A' && !this.isComparisonChapterComplete()) return false;
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
        if (bandId === 'A' && !this.isComparisonChapterComplete()) return false;
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

    /** Apply mastery-specific rewards: shard(9), 10 mana, 10 coins. No stat gains. */
    private applyMasteryRewards(): { hpGain: number; attackGain: number; manaGain: number; shardGain: number; coinGain: number } {
        const player = this.gameState.getPlayer();
        const shard = CrystalSystem.generateCrystal('shard', 9);
        CrystalSystem.addToInventory(player, shard);
        ManaSystem.add(player, 10);
        ProgressionSystem.awardBattleCoin(player, 10);
        return { hpGain: 0, attackGain: 0, manaGain: 10, shardGain: 9, coinGain: 10 };
    }

    /** Compute exam tier from correct count using EXAM_CONFIGS thresholds.
     *  Response time is recorded for learning analytics, but never affects the medal.
     *  For pass/fail exams (fluency, mastery, band_mastery), returns 'gold' on pass, 'none' on fail.
     */
    computeExamTier(correctCount: number, examType: ExamType): TrialTier {
        const config = EXAM_CONFIGS[examType];
        // Pass/fail exams
        if (config.passThreshold !== undefined && !config.bronzeThreshold) {
            return correctCount >= config.passThreshold ? 'gold' : 'none';
        }
        // Medal exams
        if (config.goldThreshold && correctCount >= config.goldThreshold) return 'gold';
        if (config.silverThreshold && correctCount >= config.silverThreshold) return 'silver';
        if (config.bronzeThreshold && correctCount >= config.bronzeThreshold) return 'bronze';
        return 'none';
    }

    // ========================================
    // Exam Results
    // ========================================

    /** Apply result of a sub-atom exam */
    applyExamResult(subAtomId: SubAtomId, correctCount: number, tierOverride?: TrialTier, sessionOnly: boolean = false): { tier: TrialTier; stateChanged: boolean; hpGain: number; attackGain: number; manaGain: number } {
        const config = EXAM_CONFIGS.sub_atom;
        const tier = tierOverride ?? this.computeTier(correctCount, config);
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
            if (!sessionOnly) {
                DailyProgressSystem.recordMilestone(
                    this.gameState.getPlayer(),
                    `${subAtomId}: ${sa.state === 'fluent' ? 'Plynulost' : 'Jistota'}`,
                );
            }
        }

        const statGains = (!sessionOnly && tier !== 'none')
            ? this.applyStatRewards(tier)
            : { hpGain: 0, attackGain: 0, manaGain: 0 };
        if (!sessionOnly) {
            this.updatePlayerLevel();
        }
        return { tier, stateChanged, ...statGains };
    }

    /** Apply result of fluency challenge */
    applyFluencyResult(subAtomId: SubAtomId | 'comparison_symbols', correctCount: number, sessionOnly: boolean = false): { passed: boolean; stateChanged: boolean; hpGain: number; attackGain: number; manaGain: number } {
        if (subAtomId === 'comparison_symbols') return this.applyComparisonChallengeResult('fluency_challenge', correctCount, sessionOnly);
        const config = EXAM_CONFIGS.fluency_challenge;
        const passed = correctCount >= (config.passThreshold ?? config.itemCount);
        const sa = this.data.subAtoms[subAtomId];
        let stateChanged = false;

        sa.fluencyChallengeResult = passed ? 'pass' : 'fail';

        if (passed && sa.state === 'secure') {
            sa.state = 'fluent';
            stateChanged = true;
            this.onSubAtomStateChange(subAtomId);
            if (!sessionOnly) {
                DailyProgressSystem.recordMilestone(this.gameState.getPlayer(), `${subAtomId}: Plynulost`);
            }
        }

        const statGains = (!sessionOnly && passed)
            ? this.applyStatRewards('bronze')
            : { hpGain: 0, attackGain: 0, manaGain: 0 };
        if (!sessionOnly) {
            this.updatePlayerLevel();
        }
        return { passed, stateChanged, ...statGains };
    }

    /** Apply result of mastery challenge */
    applyMasteryResult(subAtomId: SubAtomId | 'comparison_symbols', correctCount: number, sessionOnly: boolean = false): { passed: boolean; stateChanged: boolean; hpGain: number; attackGain: number; manaGain: number; shardGain: number; coinGain: number } {
        if (subAtomId === 'comparison_symbols') return this.applyComparisonChallengeResult('mastery_challenge', correctCount, sessionOnly);
        const config = EXAM_CONFIGS.mastery_challenge;
        const passed = correctCount >= (config.passThreshold ?? config.itemCount);
        const sa = this.data.subAtoms[subAtomId];
        let stateChanged = false;

        sa.masteryChallengeResult = passed ? 'pass' : 'fail';

        if (passed && sa.state === 'fluent') {
            sa.state = 'mastery';
            stateChanged = true;
            this.onSubAtomStateChange(subAtomId);
            if (!sessionOnly) {
                DailyProgressSystem.recordMilestone(this.gameState.getPlayer(), `${subAtomId}: Mistrovství`);
            }
        }

        const masteryRewards = (!sessionOnly && passed)
            ? this.applyMasteryRewards()
            : { hpGain: 0, attackGain: 0, manaGain: 0, shardGain: 0, coinGain: 0 };
        if (!sessionOnly) {
            this.updatePlayerLevel();
        }
        return { passed, stateChanged, ...masteryRewards };
    }

    private applyComparisonChallengeResult(type: 'fluency_challenge' | 'mastery_challenge', correctCount: number, sessionOnly: boolean) {
        const config = EXAM_CONFIGS[type];
        const passed = correctCount >= (config.passThreshold ?? config.itemCount);
        const chapter = this.getComparisonChapterState();
        const field = type === 'fluency_challenge' ? 'fluencyChallengeResult' : 'masteryChallengeResult';
        const stateChanged = passed && chapter[field] !== 'pass';
        // A failed replay never takes away an already earned challenge.
        if (chapter[field] !== 'pass') chapter[field] = passed ? 'pass' : 'fail';
        const rewards = { hpGain: 0, attackGain: 0, manaGain: 0, shardGain: 0, coinGain: 0 };
        if (!sessionOnly && passed) {
            Object.assign(rewards, type === 'fluency_challenge' ? this.applyStatRewards('bronze') : this.applyMasteryRewards());
            if (stateChanged) DailyProgressSystem.recordMilestone(this.gameState.getPlayer(), type === 'fluency_challenge' ? 'Porovnávání: Plynulost' : 'Porovnávání: Mistrovství');
        }
        if (!sessionOnly) this.updatePlayerLevel();
        return { passed, stateChanged, ...rewards };
    }

    /** Apply result of band gate exam */
    applyBandGateResult(bandId: BandId, correctCount: number, tierOverride?: TrialTier, sessionOnly: boolean = false): { tier: TrialTier; stateChanged: boolean; hpGain: number; attackGain: number; manaGain: number } {
        const config = EXAM_CONFIGS.band_gate;
        const tier = tierOverride ?? this.computeTier(correctCount, config);
        const band = this.data.bands[bandId];
        let stateChanged = false;

        if (band.gateExamBestMedal === null || this.tierRank(tier) > this.tierRank(band.gateExamBestMedal)) {
            band.gateExamBestMedal = tier;
        }

        if (band.state === 'training' && tier !== 'none') {
            band.state = 'secure';
            stateChanged = true;
            this.onBandStateChange(bandId);
            if (!sessionOnly) {
                DailyProgressSystem.recordMilestone(this.gameState.getPlayer(), `Pásmo ${bandId}: Jistota`);
            }
        }

        const statGains = (!sessionOnly && tier !== 'none')
            ? this.applyStatRewards(tier)
            : { hpGain: 0, attackGain: 0, manaGain: 0 };
        if (!sessionOnly) {
            this.updatePlayerLevel();
        }
        return { tier, stateChanged, ...statGains };
    }

    /** Apply result of band mastery challenge */
    applyBandMasteryResult(bandId: BandId, correctCount: number, sessionOnly: boolean = false): { passed: boolean; stateChanged: boolean; hpGain: number; attackGain: number; manaGain: number; shardGain: number; coinGain: number } {
        const config = EXAM_CONFIGS.band_mastery;
        const passed = correctCount >= (config.passThreshold ?? config.itemCount);
        const band = this.data.bands[bandId];
        let stateChanged = false;

        band.bandMasteryChallengeResult = passed ? 'pass' : 'fail';

        if (passed && band.state === 'fluent') {
            band.state = 'mastery';
            stateChanged = true;
            if (!sessionOnly) {
                DailyProgressSystem.recordMilestone(this.gameState.getPlayer(), `Pásmo ${bandId}: Mistrovství`);
            }
        }

        const masteryRewards = (!sessionOnly && passed)
            ? this.applyMasteryRewards()
            : { hpGain: 0, attackGain: 0, manaGain: 0, shardGain: 0, coinGain: 0 };
        if (!sessionOnly) {
            this.updatePlayerLevel();
        }
        return { passed, stateChanged, ...masteryRewards };
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

        // Planning, dragging and watching a water mechanism is application time, not fact retrieval latency.
        if (context !== 'underwater_bell' && responseTimeMs > SLOW_POOL_THRESHOLD_MS && correct) {
            if (!data.slowPool.includes(problemKey)) {
                data.slowPool.push(problemKey);
            }
        } else if (context !== 'underwater_bell' && correct && responseTimeMs <= SLOW_POOL_THRESHOLD_MS) {
            // Remove from slow pool if answered fast enough
            data.slowPool = data.slowPool.filter(k => k !== problemKey);
        }

        // Check automatic state transitions
        this.checkAutomaticTransitions(problem.subAtomId);
        if (!this.activeData) this.gameState.save();
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
        data.retryPool = data.retryPool.filter(key => this.isProblemKeyAllowed(key));
        data.slowPool = data.slowPool.filter(key => this.isProblemKeyAllowed(key));
        data.currentPool = data.currentPool.filter(key => this.isProblemKeyAllowed(key));
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

        console.log(`[MasterySystem] Generated pool of ${pool.length} problems, frontier=${frontier}, band=${band}`);
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

    /**
     * Build a short, non-consuming preparation set at the player's current edge.
     * Retry and slow items come first, followed by frontier and consolidation work.
     */
    drawPreparationProblems(count: number): string[] {
        const targetCount = Math.max(0, Math.min(5, Math.round(count)));
        if (targetCount === 0) return [];

        const data = this.data;
        const used = new Set<string>();
        const result: string[] = [];
        const add = (keys: string[]): void => {
            for (const key of keys) {
                if (result.length >= targetCount) break;
                if (used.has(key) || !this.isProblemKeyAllowed(key)) continue;
                used.add(key);
                result.push(key);
            }
        };

        add(data.retryPool.slice(0, 2));
        add(data.slowPool.slice(0, 2));

        const frontier = this.getFrontierSubAtom();
        add(this.selectCurrentProblems(frontier, targetCount - result.length, used, []));
        add(this.selectImproveProblems(this.getCurrentBand(), targetCount - result.length, used));
        add(this.selectReviewProblems('fluent', targetCount - result.length, used));
        add(this.selectReviewProblems('mastery', targetCount - result.length, used));

        return result.slice(0, targetCount);
    }

    /** Expose mastery RT threshold for block quick-bonus calculation.
     *  Scales per sub-atom difficulty when masteryKey is provided. */
    getMasteryRTThreshold(masteryKey?: string): number {
        const subAtomId = masteryKey?.split(':')[0];
        return getThresholdsForSubAtom(subAtomId).masteryRT;
    }

    /**
     * Draw next `count` problem keys from the current pool.
     * If pool is exhausted, generates a new one.
     */
    drawFromPool(count: number): string[] {
        const data = this.data;
        const result: string[] = [];

        // Saves created by older builds can still contain forms that are no
        // longer legal (comparison before the chapter or A3 missing-part).
        // Sanitize only the unconsumed tail so an update cannot surface one of
        // those stale entries before the next pool regeneration.
        const remainingPool = data.currentPool
            .slice(data.currentPoolIndex)
            .filter(key => this.isProblemKeyAllowed(key));
        if (remainingPool.length !== data.currentPool.length - data.currentPoolIndex) {
            data.currentPool = remainingPool;
            data.currentPoolIndex = 0;
        }

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

    /** Get speed bonus charges for a response time (fills the speed charge bar).
     *  Thresholds scale per sub-atom difficulty (extracted from masteryKey). */
    getSpeedBonus(responseTimeMs: number, masteryKey?: string): { charges: number; type: 'none' | 'swift' | 'lightning' } {
        const subAtomId = masteryKey?.split(':')[0];
        const thresholds = getThresholdsForSubAtom(subAtomId);

        if (responseTimeMs <= thresholds.lightningHitRT) {
            return { charges: 2, type: 'lightning' };
        } else if (responseTimeMs <= thresholds.swiftHitRT) {
            return { charges: 1, type: 'swift' };
        }
        return { charges: 0, type: 'none' };
    }

    // ========================================
    // Exam Problem Generation
    // ========================================

    /** Generate problem keys for a sub-atom exam (8 items) */
    generateSubAtomExamProblems(subAtomId: SubAtomId): string[] {
        const itemCount = EXAM_CONFIGS.sub_atom.itemCount;
        if (!this.isComparisonChapterComplete() && (subAtomId === 'A1' || subAtomId === 'A2')) {
            return this.generateBalancedProblemKeys(subAtomId, itemCount, ['result_unknown', 'missing_part']);
        }
        if (subAtomId[1] === '3') {
            return this.generateBalancedProblemKeys(subAtomId, itemCount, ['result_unknown', 'compare_equation_vs_number']);
        }
        return this.generateBalancedProblemKeys(
            subAtomId,
            itemCount,
            ['result_unknown', 'missing_part', 'compare_equation_vs_number'],
        );
    }

    /** Generate a form-balanced fluency/mastery challenge of the requested length. */
    generateChallengeProblemKeys(subAtomId: SubAtomId, count: number, examType: ExamType = 'mastery_challenge'): string[] {
        // Fluency challenge: player is secure, hasn't seen compare_equation_vs_equation yet
        // Mastery challenge: player is fluent, all 4 forms available
        const desiredForms: ProblemForm[] = examType === 'fluency_challenge'
            ? ['result_unknown', 'missing_part', 'compare_equation_vs_number']
            : ALL_PROBLEM_FORMS;
        const forms = desiredForms.filter(form => this.isFormAllowed(subAtomId, form));
        return this.generateBalancedProblemKeys(subAtomId, count, forms);
    }

    /** Generate problem keys for band gate exam (12 items: 3 per sub-atom) */
    generateBandGateProblems(bandId: BandId): string[] {
        const problems: string[] = [];
        for (const num of ALL_SUB_ATOM_NUMBERS) {
            const subAtomId = `${bandId}${num}` as SubAtomId;
            const forms = (['result_unknown', 'missing_part', 'compare_equation_vs_number'] as ProblemForm[])
                .filter(form => this.isFormAllowed(subAtomId, form));
            problems.push(...this.generateBalancedProblemKeys(subAtomId, 3, forms));
        }
        return this.shuffle(problems);
    }

    /** Generate a 14-item band mastery challenge with every sub-atom represented. */
    generateBandMasteryProblems(bandId: BandId): string[] {
        const problems: string[] = [];
        const perSubAtom = [4, 4, 3, 3];
        for (const [index, num] of ALL_SUB_ATOM_NUMBERS.entries()) {
            const subAtomId = `${bandId}${num}` as SubAtomId;
            const forms = ALL_PROBLEM_FORMS.filter(form => this.isFormAllowed(subAtomId, form));
            problems.push(...this.generateBalancedProblemKeys(subAtomId, perSubAtom[index], forms));
        }
        return this.shuffle(problems);
    }

    // ========================================
    // Available Exams for Guild
    // ========================================

    /** Get all available exams for the Guild scene */
    getAvailableExams(): Array<{ type: ExamType; targetId: MasteryTargetId; label: string }> {
        const exams: Array<{ type: ExamType; targetId: MasteryTargetId; label: string }> = [];

        if (this.getComparisonChapterState().status === 'exam_ready') {
            exams.push({
                type: 'comparison_chapter',
                targetId: 'comparison_symbols',
                label: 'Zkouška porovnávání',
            });
        }

        for (const type of ['fluency_challenge', 'mastery_challenge'] as const) {
            if (this.checkComparisonChallengeEligibility(type)) {
                exams.push({ type, targetId: 'comparison_symbols', label: type === 'fluency_challenge' ? 'Porovnávání: plynulost' : 'Porovnávání: mistrovství' });
            }
        }

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

    /**
     * Co-op auto-promotion:
     * 1. Capture a baseline the first time a target becomes exam-eligible.
     * 2. Require an extra exam-sized buffer of in-scope attempts after that baseline.
     * 3. Auto-award the fixed co-op outcome when that buffer is strong enough.
     */
    applyCoopAutoPromotions(sessionOnly: boolean = false): Array<{ type: ExamType; targetId: MasteryTargetId }> {
        const promotions: Array<{ type: ExamType; targetId: MasteryTargetId }> = [];
        const candidates = this.getCoopAutoPromotionCandidates();

        for (const candidate of candidates) {
            const key = this.getCoopAutoPromotionKey(candidate.type, candidate.targetId);
            const baseline = this.data.coopAutoPromotionBases[key];

            if (!this.isCoopAutoPromotionStageRelevant(candidate.type, candidate.targetId)) {
                delete this.data.coopAutoPromotionBases[key];
                continue;
            }

            if (baseline === undefined) {
                if (this.isCoopAutoPromotionEligible(candidate.type, candidate.targetId)) {
                    this.data.coopAutoPromotionBases[key] = this.data.globalSolveSequence;
                }
                continue;
            }

            if (!this.isCoopAutoPromotionReady(candidate.type, candidate.targetId, baseline)) {
                continue;
            }

            switch (candidate.type) {
                case 'comparison_chapter':
                    this.applyComparisonExamResult(EXAM_CONFIGS.comparison_chapter.silverThreshold || 0, 'silver', sessionOnly);
                    break;
                case 'sub_atom':
                    this.applyExamResult(candidate.targetId as SubAtomId, EXAM_CONFIGS.sub_atom.silverThreshold || 0, 'silver', sessionOnly);
                    break;
                case 'fluency_challenge':
                    this.applyFluencyResult(candidate.targetId as SubAtomId, EXAM_CONFIGS.fluency_challenge.passThreshold || 0, sessionOnly);
                    break;
                case 'mastery_challenge':
                    this.applyMasteryResult(candidate.targetId as SubAtomId, EXAM_CONFIGS.mastery_challenge.passThreshold || 0, sessionOnly);
                    break;
                case 'band_gate':
                    this.applyBandGateResult(candidate.targetId as BandId, EXAM_CONFIGS.band_gate.silverThreshold || 0, 'silver', sessionOnly);
                    break;
                case 'band_mastery':
                    this.applyBandMasteryResult(candidate.targetId as BandId, EXAM_CONFIGS.band_mastery.passThreshold || 0, sessionOnly);
                    break;
            }

            delete this.data.coopAutoPromotionBases[key];
            promotions.push(candidate);
        }

        return promotions;
    }

    // ========================================
    // Struggle Detection
    // ========================================

    /**
     * Check if the player is struggling at their current band.
     * Returns info about suggested drop band, or null if not struggling.
     *
     * Criteria (ALL must be true):
     * - Current band > A (can't drop below A)
     * - Frontier sub-atom getLast20Accuracy() < 0.50
     * - Frontier sub-atom successfulSolves >= 10 (enough data)
     * - fightCount - lastStruggleOfferFight >= 5 (prevent nagging)
     */
    checkPlayerStruggling(): { struggling: boolean; suggestedBand: BandId } | null {
        const currentBand = this.getCurrentBand();

        // Can't drop below A
        if (currentBand === 'A') return null;

        const data = this.data;
        const frontier = this.getFrontierSubAtom();
        const frontierState = data.subAtoms[frontier];

        // Need enough data to judge
        if (frontierState.successfulSolves < 10) return null;

        // Check accuracy
        const accuracy = this.getLast20Accuracy(frontier);
        if (accuracy >= 0.50) return null;

        // Prevent nagging (at least 5 fights since last offer)
        const lastOffer = data.lastStruggleOfferFight ?? 0;
        if (data.fightCount - lastOffer < 5) return null;

        // Player is struggling — suggest dropping to previous band
        const prevIndex = ALL_BANDS.indexOf(currentBand) - 1;
        const suggestedBand = ALL_BANDS[prevIndex];

        return { struggling: true, suggestedBand };
    }

    // ========================================
    // Private helpers
    // ========================================

    private getCoopAutoPromotionCandidates(): Array<{ type: ExamType; targetId: MasteryTargetId }> {
        const candidates: Array<{ type: ExamType; targetId: MasteryTargetId }> = [
            { type: 'comparison_chapter', targetId: 'comparison_symbols' },
            { type: 'fluency_challenge', targetId: 'comparison_symbols' },
            { type: 'mastery_challenge', targetId: 'comparison_symbols' },
        ];

        for (const band of ALL_BANDS) {
            for (const num of ALL_SUB_ATOM_NUMBERS) {
                const subAtomId = `${band}${num}` as SubAtomId;
                candidates.push({ type: 'sub_atom', targetId: subAtomId });
                candidates.push({ type: 'fluency_challenge', targetId: subAtomId });
                candidates.push({ type: 'mastery_challenge', targetId: subAtomId });
            }

            candidates.push({ type: 'band_gate', targetId: band });
            candidates.push({ type: 'band_mastery', targetId: band });
        }

        return candidates;
    }

    private getCoopAutoPromotionKey(type: ExamType, targetId: MasteryTargetId): string {
        return `${type}:${targetId}`;
    }

    private isCoopAutoPromotionEligible(type: ExamType, targetId: MasteryTargetId): boolean {
        if (targetId === 'comparison_symbols' && (type === 'fluency_challenge' || type === 'mastery_challenge')) return this.checkComparisonChallengeEligibility(type);
        switch (type) {
            case 'comparison_chapter':
                return this.getComparisonChapterState().status === 'exam_ready';
            case 'sub_atom':
                return this.checkExamEligibility(targetId as SubAtomId);
            case 'fluency_challenge':
                return this.checkFluencyEligibility(targetId as SubAtomId);
            case 'mastery_challenge':
                return this.checkMasteryChallengeEligibility(targetId as SubAtomId);
            case 'band_gate':
                return this.getBandGateEligibility(targetId as BandId);
            case 'band_mastery':
                return this.checkBandMasteryEligibility(targetId as BandId);
        }
    }

    private isCoopAutoPromotionStageRelevant(type: ExamType, targetId: MasteryTargetId): boolean {
        if (targetId === 'comparison_symbols' && (type === 'fluency_challenge' || type === 'mastery_challenge')) return this.comparisonChallengeRelevant(type);
        switch (type) {
            case 'comparison_chapter':
                return this.getComparisonChapterState().status === 'exam_ready';
            case 'sub_atom':
                return this.data.subAtoms[targetId as SubAtomId].state === 'training';
            case 'fluency_challenge':
                return this.data.subAtoms[targetId as SubAtomId].state === 'secure';
            case 'mastery_challenge':
                return this.data.subAtoms[targetId as SubAtomId].state === 'fluent';
            case 'band_gate':
                return this.data.bands[targetId as BandId].state === 'training';
            case 'band_mastery':
                return this.data.bands[targetId as BandId].state === 'fluent';
        }
    }

    private isCoopAutoPromotionReady(type: ExamType, targetId: MasteryTargetId, baseline: number): boolean {
        const config = EXAM_CONFIGS[type];
        if (targetId === 'comparison_symbols') {
            const buffer = (type === 'comparison_chapter' ? this.getComparisonChapterState().attempts : this.getComparisonChallengeAttempts())
                .filter(attempt => !attempt.exam && attempt.sequenceIndex > baseline)
                .slice(-config.itemCount);
            if (buffer.length < config.itemCount) return false;
            const correct = buffer.filter(attempt => attempt.correct && !attempt.assisted).length;
            const threshold = config.silverThreshold ?? config.passThreshold ?? config.bronzeThreshold ?? config.itemCount;
            return correct >= threshold
                && this.median(buffer.filter(attempt => attempt.correct).map(attempt => attempt.responseTimeMs))
                    <= COOP_AUTO_PROMOTION_RT_MS;
        }
        const buffer = this.getScopedAttemptsSince(type, targetId, baseline).slice(-config.itemCount);

        if (buffer.length < config.itemCount) {
            return false;
        }

        const correctCount = buffer.filter(entry => entry.attempt.correct).length;
        const correctThreshold = config.silverThreshold ?? config.passThreshold ?? config.bronzeThreshold ?? config.itemCount;
        if (correctCount < correctThreshold) {
            return false;
        }

        if (this.getScopedMedianRT(buffer) > COOP_AUTO_PROMOTION_RT_MS) {
            return false;
        }

        switch (type) {
            case 'sub_atom':
                return this.getDistinctCorrectForms(buffer) >= 2;
            case 'comparison_chapter':
                return false; // This exam only has the comparison_symbols target, handled above.
            case 'fluency_challenge':
                return this.getScopedFormsWithAccuracy(buffer, 0.80) >= 2;
            case 'mastery_challenge':
                return this.getScopedFormsWithAccuracy(buffer, 0.90) >= 2;
            case 'band_gate':
            case 'band_mastery':
                return true;
        }
    }

    private getScopedAttemptsSince(type: ExamType, targetId: MasteryTargetId, baseline: number): ScopedMasteryAttempt[] {
        const attempts: ScopedMasteryAttempt[] = [];

        for (const record of Object.values(this.data.problemRecords)) {
            const inScope = type === 'band_gate' || type === 'band_mastery'
                ? record.subAtomId[0] === targetId
                : record.subAtomId === targetId;

            if (!inScope) continue;

            for (const attempt of record.attempts) {
                if (attempt.sequenceIndex > baseline) {
                    attempts.push({
                        attempt,
                        subAtomId: record.subAtomId,
                        form: record.form,
                    });
                }
            }
        }

        attempts.sort((a, b) => a.attempt.sequenceIndex - b.attempt.sequenceIndex);
        return attempts;
    }

    private getScopedMedianRT(attempts: ScopedMasteryAttempt[]): number {
        const correctTimes = attempts
            .filter(entry => entry.attempt.correct && entry.attempt.context !== 'underwater_bell' && entry.attempt.responseTimeMs <= RT_IGNORE_THRESHOLD_MS)
            .map(entry => entry.attempt.responseTimeMs);

        if (correctTimes.length === 0) return Infinity;
        return this.median(correctTimes);
    }

    private getDistinctCorrectForms(attempts: ScopedMasteryAttempt[]): number {
        return new Set(
            attempts
                .filter(entry => entry.attempt.correct)
                .map(entry => entry.form)
        ).size;
    }

    private getScopedFormsWithAccuracy(attempts: ScopedMasteryAttempt[], threshold: number): number {
        let count = 0;

        for (const form of ALL_PROBLEM_FORMS) {
            const formAttempts = attempts.filter(entry => entry.form === form);
            if (formAttempts.length === 0) continue;

            const correct = formAttempts.filter(entry => entry.attempt.correct).length;
            if ((correct / formAttempts.length) >= threshold) {
                count++;
            }
        }

        return count;
    }

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
            if (subAtomId === 'A2' && !this.isComparisonChapterComplete()) {
                const chapter = this.getComparisonChapterState();
                if (chapter.status === 'locked') chapter.status = 'training';
                this.checkBandFluency(bandId);
                return;
            }
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

    private unlockA3AfterComparison(): void {
        const a2 = this.data.subAtoms.A2;
        const a2Ready = a2.state === 'secure' || a2.state === 'fluent' || a2.state === 'mastery';
        if (a2Ready && this.data.subAtoms.A3.state === 'locked') {
            this.data.subAtoms.A3.state = 'training';
        }
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
            .filter(p => this.isProblemAllowed(p) && !used.has(p.key) && !lastPool.includes(p.key))
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
                .filter(p => this.isProblemAllowed(p) && !used.has(p.key))
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

        for (const band of [this.getCurrentBand()]) {
            for (const num of ALL_SUB_ATOM_NUMBERS) {
                if (result.length >= count) break;
                const id = `${band}${num}` as SubAtomId;
                if (this.data.subAtoms[id].state !== state) continue;

                const problems = this.problemDb.getAllProblems(id)
                    .filter(p => this.isProblemAllowed(p) && !used.has(p.key))
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

    private generateBalancedProblemKeys(subAtomId: SubAtomId, count: number, forms: ProblemForm[]): string[] {
        const allowedForms = forms.filter(form => this.isFormAllowed(subAtomId, form));
        if (allowedForms.length === 0 || count <= 0) return [];

        const problems: string[] = [];
        for (let formIndex = 0; formIndex < allowedForms.length; formIndex++) {
            const formCount = Math.floor(count / allowedForms.length)
                + (formIndex < count % allowedForms.length ? 1 : 0);
            problems.push(...this.pickRandomProblems(subAtomId, allowedForms[formIndex], formCount));
        }
        return this.shuffle(problems);
    }

    private pickRandomProblems(subAtomId: SubAtomId, form: ProblemForm, count: number): string[] {
        const available = this.problemDb.getProblemsForForm(subAtomId, form)
            .filter(problem => this.isProblemAllowed(problem) && !this.hasZero(problem));
        return this.shuffle(available).slice(0, count).map(problem => problem.key);
    }

    private isFormAllowed(subAtomId: SubAtomId, form: ProblemForm): boolean {
        if (subAtomId[1] === '3' && form === 'missing_part') return false;
        if (!this.isComparisonChapterComplete() && form.startsWith('compare_')) return false;
        return true;
    }

    private isProblemAllowed(problem: ProblemDefinition): boolean {
        return this.isSubAtomAvailable(problem.subAtomId) && this.isFormAllowed(problem.subAtomId, problem.form);
    }

    private isSubAtomAvailable(subAtomId: SubAtomId): boolean {
        const state = this.data.subAtoms[subAtomId]?.state;
        return state !== undefined && state !== 'locked'
            && !(subAtomId[0] === 'A' && Number(subAtomId[1]) > 2 && !this.isComparisonChapterComplete());
    }

    private isProblemKeyAllowed(key: string): boolean {
        const problem = this.problemDb.getProblemByKey(key);
        return problem !== undefined && problem.bandId === this.getCurrentBand() && this.isProblemAllowed(problem);
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
