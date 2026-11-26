import { EXAM_CONFIGS, type MasteryData, type MathProblem, type PracticeTargetId, type ProblemDefinition } from '../types';
import tuning from '../data/fox-speed-levels.json';
import personalTuning from '../data/personal-bonuses.json';
import { getAdvancedProblem, isAdvancedNode } from './AdvancedCurriculum';
import type { CatacombChallenge } from './PracticeProgress';
import { collectLearningAttempts, type LearningHistoryAttempt } from './LearningHistory';
import { FOX_LESSON_CORRECT, FOX_LESSON_QUESTIONS } from './FoxLessons';
import { getThresholdsForSubAtom } from './MasteryThresholds';
import { isGenuineThreeOperandProblem } from './ProblemComplexity';
import { ProblemDatabase } from './ProblemDatabase';

export type FoxSpeedStage = 'grandmaster' | 'legend';
type BatchStage = CatacombChallenge | FoxSpeedStage | 'lesson';
export interface CatacombBatchRules {
    readonly total: number;
    readonly required: number;
    /** Allowed milliseconds per ordinary result question before weighting the dealt set. */
    readonly paceMs: number;
    readonly budgetMs: number;
}
export interface CatacombBatchAnswer {
    readonly correct: boolean;
    readonly responseTimeMs: number;
    readonly problemKey?: string;
}

const weights = tuning.trial.timeWeights;

export function catacombProblemWeight(problem: MathProblem): number {
    if (problem.comparisonMeta) return problem.comparisonMeta.representation === 'expression' ? weights.expressionVsNumber : weights.standard;
    if (problem.problemType === 'comparison_eq_vs_eq') {
        return problem.operator3 && problem.operand4 !== undefined ? weights.expressionVsExpression : weights.expressionVsNumber;
    }
    if (problem.problemType === 'comparison') return weights.expressionVsNumber;
    if (isGenuineThreeOperandProblem(problem)) return weights.threeOperands;
    return problem.problemType === 'missing_operand' ? weights.missingPart : weights.standard;
}

function formWeight(form: string | undefined, threeOperands = false): number {
    if (form === 'compare_equation_vs_equation' || form === 'compare_eq_eq') return weights.expressionVsExpression;
    if (form === 'compare_equation_vs_number' || form === 'compare_eq_num') return weights.expressionVsNumber;
    if (threeOperands) return weights.threeOperands;
    return form === 'missing_part' ? weights.missingPart : weights.standard;
}

export function catacombDefinitionWeight(definition: ProblemDefinition): number {
    return formWeight(definition.form, !!definition.operator2 && definition.operand3 !== undefined);
}

function attemptWeight(attempt: LearningHistoryAttempt): number {
    if (attempt.source === 'comparison') {
        // LearningHistory stores comparison:<stage>:<left>:<right>. Only its two expression
        // stages show arithmetic; the size/count/number stages compare a pair directly.
        return /^comparison[:_]expression_/.test(attempt.problemKey) ? weights.expressionVsNumber : weights.standard;
    }
    const definition = ProblemDatabase.getInstance().getProblemByKey(attempt.problemKey);
    if (definition) return catacombDefinitionWeight(definition);
    // Historical rows without a catalog match can still carry the original form.
    return formWeight(attempt.form ?? attempt.problemKey.split(':').pop());
}

export function catacombBatchGoal(stage: BatchStage): { total: number; required: number } {
    if (stage === 'lesson') return { total: FOX_LESSON_QUESTIONS, required: FOX_LESSON_CORRECT };
    if (stage === 'grandmaster' || stage === 'legend') return { ...tuning[stage].goal };
    return { total: EXAM_CONFIGS[stage].itemCount, required: EXAM_CONFIGS[stage].passThreshold! };
}

/** Both speed admission and the personal timer use the same module and clock provenance. */
export function catacombTimedAttempts(data: MasteryData, target: PracticeTargetId, maximumMs: number) {
    const advanced = isAdvancedNode(target);
    return collectLearningAttempts(data).filter(a =>
        (target === 'comparison_symbols' ? a.source === 'comparison' || a.form?.startsWith('compare_') : a.subAtomId === target)
        && (!advanced || getAdvancedProblem(a.problemKey)?.advanced?.role === 'target')
        && !a.clockUncertain && a.context !== 'underwater_bell'
        && a.responseTimeMs > 0 && a.responseTimeMs <= maximumMs);
}

export function foxSpeedTarget(target: PracticeTargetId, stage: FoxSpeedStage): number {
    return Math.round(getThresholdsForSubAtom(target === 'comparison_symbols' ? 'A3' : target).masteryRT * tuning[stage].ratio);
}

/** Freeze this budget on entry, before trial answers can change the player's recent average. */
export function getCatacombBatchRules(data: MasteryData, target: PracticeTargetId, stage: BatchStage,
    questions?: readonly MathProblem[]): CatacombBatchRules {
    const speedStage = stage === 'grandmaster' || stage === 'legend';
    const lesson = stage === 'lesson';
    const thresholds = getThresholdsForSubAtom(target === 'comparison_symbols' ? 'A3' : target);
    const targetMs = speedStage ? foxSpeedTarget(target, stage)
        : lesson || stage === 'fluency_challenge' ? thresholds.fluentRT : thresholds.masteryRT;
    // Ability lessons have no speed gate of their own and retain the module's fluent-pace floor.
    const sample = catacombTimedAttempts(data, target, personalTuning.maximumReferenceTimeMs)
        .filter(a => {
            if (!a.correct || a.assisted) return false;
            if (!lesson) return true;
            if (target === 'comparison_symbols') return a.source === 'comparison';
            // Advanced lessons use the node's own target items. Earlier arithmetic lessons ask for the result.
            if (isAdvancedNode(target)) return true;
            return a.form ? a.form === 'result_unknown' : a.problemKey.endsWith(':result_unknown');
        }).slice(-tuning.trial.paceWindow);
    const paceMs = sample.length ? Math.max(targetMs, Math.round(
        sample.reduce((sum, a) => sum + a.responseTimeMs / attemptWeight(a), 0) / sample.length,
    )) : targetMs;
    const { total, required } = catacombBatchGoal(stage);
    if (questions && questions.length !== total) throw new RangeError('Incomplete catacomb question set');
    const workload = questions ? questions.reduce((sum, p) => sum + catacombProblemWeight(p), 0) : total;
    return { total, required, paceMs, budgetMs: Math.round(paceMs * (workload + workload / total)) };
}

/** A frame that blocks input must not spend a whole pause's worth of thinking time. */
export class CatacombFrameClock {
    private lastFrame: number;
    private accumulated = 0;
    constructor(private readonly now = () => performance.now()) { this.lastFrame = now(); }

    private frameDuration(now: number): number { return Math.min(100, Math.max(0, now - this.lastFrame)); }
    frame(): void {
        const now = this.now();
        this.accumulated += this.frameDuration(now);
        this.lastFrame = now;
    }
    read = (): number => this.accumulated + this.frameDuration(this.now());
}

/** One planet transit for the entire batch. Only time with an actionable prompt counts. */
export class CatacombBatch {
    private spentMs = 0;
    private lastSampleMs: number;
    private questionStartMs: number | null = null;
    private paused = false;
    private hidden = false;
    private readonly recorded: CatacombBatchAnswer[] = [];

    constructor(readonly rules: CatacombBatchRules, private readonly now = () => performance.now()) {
        this.lastSampleMs = now();
    }

    private tick(): number {
        const now = Math.max(this.lastSampleMs, this.now());
        if (this.questionStartMs !== null && !this.paused && !this.hidden) {
            this.spentMs = Math.min(this.rules.budgetMs, this.spentMs + now - this.lastSampleMs);
        }
        this.lastSampleMs = now;
        return this.spentMs;
    }

    get elapsedMs(): number { return this.tick(); }
    get timeFraction(): number { return this.elapsedMs / this.rules.budgetMs; }
    get expired(): boolean { return this.elapsedMs >= this.rules.budgetMs; }
    get answers(): readonly CatacombBatchAnswer[] { return this.recorded; }
    get correctCount(): number { return this.recorded.filter(a => a.correct).length; }
    private get cannotPass(): boolean {
        return this.correctCount + this.rules.total - this.recorded.length < this.rules.required;
    }
    get finished(): boolean { return this.recorded.length === this.rules.total || this.cannotPass || this.expired; }
    get passed(): boolean { return this.recorded.length === this.rules.total && this.correctCount >= this.rules.required && !this.expired; }
    /** Planetary light fills up to two missed places after a win. It never changes the score. */
    get giftedStars(): number[] {
        if (!this.passed) return [];
        return this.recorded.flatMap((answer, index) => answer.correct ? [] : [index]).slice(0, 2);
    }

    setPaused(paused: boolean): void { this.tick(); this.paused = paused; }
    setHidden(hidden: boolean): void { this.tick(); this.hidden = hidden; }

    openQuestion(): boolean {
        if (this.questionStartMs !== null || this.finished) return false;
        this.questionStartMs = this.spentMs;
        return true;
    }

    submit(correct: boolean, problemKey?: string): CatacombBatchAnswer | null {
        const elapsed = this.tick();
        if (this.questionStartMs === null || this.paused || this.hidden || elapsed >= this.rules.budgetMs) return null;
        // Two pointer events can share a low-resolution browser timestamp.
        this.spentMs = Math.max(elapsed, this.questionStartMs + 1);
        if (this.spentMs >= this.rules.budgetMs) return null;
        const answer = { correct, responseTimeMs: this.spentMs - this.questionStartMs, ...(problemKey ? { problemKey } : {}) };
        this.recorded.push(answer);
        this.questionStartMs = null;
        return answer;
    }
}
