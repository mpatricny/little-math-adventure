import { getAdvancedProblem, isAdvancedNode } from './AdvancedCurriculum';
import type { MasteryData, MasteryState, MathProblem, PlayerState, PracticeTargetId } from '../types';
import type { FoxRuneTier } from '../types/foxAbilities';
import tuning from '../data/fox-speed-levels.json';
import { getCatacombReadiness, getOpenPracticeTargets, getPracticeTargetState, type CatacombChallenge } from './PracticeProgress';
import { catacombBatchGoal, catacombDefinitionWeight, catacombProblemWeight, catacombTimedAttempts, foxSpeedTarget, getCatacombBatchRules,
    type CatacombBatchAnswer, type CatacombBatchRules, type FoxSpeedStage } from './CatacombBatch';
import { awardFoxRune, getFoxJourney } from './FoxAbilitySystem';
import { ProblemDatabase } from './ProblemDatabase';
import type { LearningHistoryAttempt } from './LearningHistory';

export const FOX_SPEED_LEVELS = tuning;
export { foxSpeedTarget, type FoxSpeedStage } from './CatacombBatch';
export type CatacombStage = CatacombChallenge | FoxSpeedStage;
export type LearningStage = MasteryState | FoxSpeedStage;
export const CATACOMB_STAGES: readonly CatacombStage[] = ['fluency_challenge', 'mastery_challenge', 'grandmaster', 'legend'];
export const CATACOMB_STAGE_LABELS: Record<CatacombStage, string> = {
    fluency_challenge: 'Plynulost', mastery_challenge: 'Mistrovství',
    grandmaster: tuning.grandmaster.label, legend: tuning.legend.label,
};
type FoxPlayer = Pick<PlayerState, 'catacombFoxJourney'>;
export interface CatacombStageProgress {
    stage: CatacombStage; completed: boolean; ready: boolean;
    /** Progress of the least fulfilled requirement, used to sort trials. */
    readinessPercent: number;
    speedMs: number | null; targetMs: number;
    lock: 'exam' | 'previous' | 'practice' | null;
}

/** The milestone shown when a child opens a module for the first time. */
export function nextCatacombStage(stages: CatacombStageProgress[]): CatacombStageProgress {
    return stages.find(stage => stage.ready) ?? stages.find(stage => !stage.completed) ?? stages[stages.length - 1];
}

export function learningStage(state: MasteryState, player: FoxPlayer, target: PracticeTargetId): LearningStage {
    const tier = getFoxJourney(player).tiers[target];
    return tier === 2 ? 'legend' : tier === 1 ? 'grandmaster' : state;
}

function ratio(value: number, total: number): number {
    return total > 0 ? value / total : 0;
}

function shareProgress(count: number, sampleSize: number, requiredShare: number): number {
    return ratio(ratio(count, sampleSize), requiredShare);
}

function measureSpeedWindow(attempts: LearningHistoryAttempt[], advanced: boolean) {
    const correct = attempts.filter(a => a.correct && !a.assisted);
    const times = correct.map(a => a.responseTimeMs).sort((a, b) => a - b);
    // A robust upper percentile: a handful of very easy answers cannot unlock a tier.
    const speedMs = times.length ? times[Math.max(0, Math.ceil(times.length * tuning.evidence.fastShare) - 1)] : null;
    const days = new Set(attempts.map(a => new Date(a.timestamp).toLocaleDateString('en-CA'))).size;
    const distinct = new Set(attempts.map(a => a.problemKey)).size;
    const forms = new Set(attempts.map(a => advanced ? getAdvancedProblem(a.problemKey)?.advanced?.group.toString() : a.form ?? (a.source === 'comparison' ? a.problemKey.split(':')[1] : undefined)).filter(Boolean)).size;
    const evidenceProgress = Math.min(1, ratio(attempts.length, tuning.evidence.window), ratio(days, tuning.evidence.days),
        shareProgress(correct.length, attempts.length, tuning.evidence.accuracy),
        ratio(distinct, tuning.evidence.distinctProblems), ratio(forms, tuning.evidence.forms));
    const advancedGroups = advanced ? ([0, 1] as const).map(group => {
        const sample = attempts.filter(a => getAdvancedProblem(a.problemKey)?.advanced?.group === group);
        return { size: sample.length, correct: sample.filter(a => a.correct && !a.assisted) };
    }) : [];
    function progressAt(targetMs: number) {
        const groupsProgress = advancedGroups.map(group => {
            const fast = group.correct.filter(a => a.responseTimeMs <= targetMs).length;
            return Math.min(ratio(group.size, 4), shareProgress(group.correct.length, group.size, tuning.evidence.accuracy),
                shareProgress(fast, group.correct.length, tuning.evidence.fastShare));
        });
        return Math.min(evidenceProgress, ratio(targetMs, speedMs ?? 0), ...groupsProgress);
    }
    return { speedMs, progressAt };
}

/** Older trials had no entry receipt. Re-evaluate the real practice window before a saved exam began. */
function qualifiedBeforeTrial(history: LearningHistoryAttempt[], target: PracticeTargetId, targetMs: number, earliest: number): boolean {
    const count = tuning.evidence.window;
    const inTrial = target === 'comparison_symbols'
        ? (attempt: LearningHistoryAttempt) => attempt.source === 'comparison' && attempt.context === 'exam'
        : (attempt: LearningHistoryAttempt) => attempt.context === 'mastery_challenge';
    for (let i = history.length - 1; i >= count; i--) {
        const attempt = history[i];
        if (attempt.timestamp < earliest) break;
        if (!inTrial(attempt) || inTrial(history[i - 1])) continue;
        if (measureSpeedWindow(history.slice(i - count, i), isAdvancedNode(target)).progressAt(targetMs) >= 1) return true;
    }
    return false;
}

/** Read-only, shared by the door, learning map, trial admission and reward validation. */
export function catacombProgress(data: MasteryData, player: FoxPlayer, target: PracticeTargetId): CatacombStageProgress[] {
    const state = getPracticeTargetState(data, target);
    const tier = getFoxJourney(player).tiers[target] ?? 0;
    const open = getOpenPracticeTargets(data).includes(target);
    const advanced = isAdvancedNode(target);
    const history = catacombTimedAttempts(data, target, 20000);
    const current = measureSpeedWindow(history.slice(-tuning.evidence.window), advanced);
    return CATACOMB_STAGES.map(stage => {
        if (stage === 'fluency_challenge' || stage === 'mastery_challenge') {
            const readiness = getCatacombReadiness(data, target, stage);
            const completed = state === 'mastery' || (stage === 'fluency_challenge' && state === 'fluent');
            return { stage, completed, ready: !completed && readiness.ready, speedMs: readiness.speed.value,
                targetMs: readiness.speed.target, readinessPercent: completed ? 100 : readiness.percentage,
                lock: completed || readiness.ready ? null : state === 'training' || state === 'locked' ? 'exam'
                    : stage === 'mastery_challenge' && state === 'secure' ? 'previous' : 'practice' };
        }
        const rank = tuning[stage].runeTier;
        const completed = tier >= rank;
        const prerequisite = open && state === 'mastery' && (rank === 1 || tier >= 1);
        const targetMs = foxSpeedTarget(target, stage);
        const progress = current.progressAt(targetMs);
        const firstRuneAt = player.catacombFoxJourney?.awards[target]?.I?.earnedAt ?? Infinity;
        const ready = !completed && prerequisite && (progress >= 1
            || (data.openedCatacombSpeed?.[target] ?? 0) >= rank
            || qualifiedBeforeTrial(history, target, targetMs, rank === 1 ? 0 : firstRuneAt));
        const { speedMs } = current;
        return { stage, completed, ready, speedMs, targetMs,
            readinessPercent: completed || ready ? 100 : Math.min(99, Math.floor(progress * 100)),
            lock: completed || ready ? null : state === 'training' || state === 'locked' ? 'exam' : !prerequisite ? 'previous' : 'practice' };
    });
}

export type FoxTrialAnswer = CatacombBatchAnswer;
export interface FoxTrialAdmission {
    readonly data: MasteryData; readonly player: FoxPlayer; readonly target: PracticeTargetId;
    readonly stage: FoxSpeedStage; readonly targetMs: number; readonly budgetMs: number; readonly evidenceId: string;
    readonly rules: CatacombBatchRules; readonly questionKeys: readonly string[]; readonly firstEntry: boolean;
}

const admittedTrials = new WeakSet<FoxTrialAdmission>();

function isSpeedTrialQuestion(problem: MathProblem | undefined, target: PracticeTargetId): boolean {
    if (!problem) return false;
    if (target === 'comparison_symbols') {
        const meta = problem.comparisonMeta;
        return !!meta && meta.chapterId === target && meta.exam === true && !problem.masteryKey
            && problem.problemType === 'comparison' && problem.id.startsWith(`comparison_${meta.stage}_`)
            && problem.answer === (meta.leftValue === meta.rightValue ? 1 : meta.leftValue < meta.rightValue ? 0 : 2);
    }
    if (!problem.masteryKey || problem.comparisonMeta) return false;
    const def = ProblemDatabase.getInstance().getProblemByKey(problem.masteryKey);
    return !!def && def.subAtomId === target && (!def.advanced || def.advanced.role === 'target')
        && def.answer === problem.answer && catacombDefinitionWeight(def) === catacombProblemWeight(problem);
}

export function admitFoxSpeedTrial(data: MasteryData, player: FoxPlayer, target: PracticeTargetId,
    stage: FoxSpeedStage, evidenceId: string, questions: readonly MathProblem[]): FoxTrialAdmission | null {
    if (!evidenceId?.trim() || questions?.length !== catacombBatchGoal(stage).total) return null;
    for (const problem of questions) if (!isSpeedTrialQuestion(problem, target)) return null;
    const progress = catacombProgress(data, player, target).find(item => item.stage === stage)!;
    if (!progress.ready) return null;
    const rules = Object.freeze(getCatacombBatchRules(data, target, stage, questions));
    const questionKeys = Object.freeze(questions.map(p => p.masteryKey ?? p.id));
    const rank = tuning[stage].runeTier as FoxRuneTier;
    const firstEntry = (data.openedCatacombSpeed?.[target] ?? 0) < rank;
    if (firstEntry) (data.openedCatacombSpeed ??= {})[target] = rank;
    const admission = Object.freeze({ data, player, target, stage, evidenceId, questionKeys, rules, firstEntry,
        targetMs: progress.targetMs, budgetMs: rules.budgetMs });
    admittedTrials.add(admission);
    return admission;
}
/** A fresh completed trial is required. Reading old speed evidence never creates rewards. */
export function completeFoxSpeedTrial(data: MasteryData, player: FoxPlayer, target: PracticeTargetId,
    stage: FoxSpeedStage, answers: readonly FoxTrialAnswer[], evidenceId: string, earnedAt: number,
    admission: FoxTrialAdmission | null = null): boolean {
    // Trial answers rotate the history window. Keep the eligibility demonstrated at admission.
    if (!admission || !admittedTrials.has(admission) || admission.data !== data || admission.player !== player || admission.target !== target
        || admission.stage !== stage || admission.evidenceId !== evidenceId || getPracticeTargetState(data, target) !== 'mastery') return false;
    if (answers.length !== admission.rules.total || !admission.questionKeys.every((key, i) => {
        const answer = answers[i];
        return answer?.problemKey === key && typeof answer.correct === 'boolean'
            && Number.isFinite(answer.responseTimeMs) && answer.responseTimeMs > 0;
    })) return false;
    if (answers.filter(a => a.correct).length < admission.rules.required
        || answers.reduce((total, a) => total + a.responseTimeMs, 0) >= admission.budgetMs) return false;
    const awarded = awardFoxRune(player, target, tuning[stage].runeTier as FoxRuneTier, { evidenceId, earnedAt });
    if (awarded) admittedTrials.delete(admission);
    return awarded;
}
