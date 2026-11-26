import type { MathProblem, ComparisonStageId } from '../../types';
import type { ComparisonSupportProgress } from '../../systems/ComparisonSupport';
import type { MathBoardDefense } from '../SequentialMathView';

export interface MathBoardFeedbackCheckpoint {
    choiceIndex: number;
    correct: boolean;
    speedCharges: number;
    blocked: number;
    quickBlock: boolean;
}

/** JSON only; completion callbacks, Phaser timers and display objects are rebound by the scene. */
export interface MathBoardCheckpoint {
    version: 1;
    problems: MathProblem[];
    index: number;
    results: boolean[];
    timings: number[];
    assisted: boolean[];
    feedback: MathBoardFeedbackCheckpoint[];
    damage: number;
    activeTimeMs: number;
    currentAssisted: boolean;
    support: ComparisonSupportProgress;
    defense: MathBoardDefense | null;
    sequential: boolean;
    telemetryContext?: string;
    damageDisplayEnabled: boolean;
    stage: 'question' | 'feedback' | 'demo' | 'complete';
    demoStage?: ComparisonStageId;
    completionDelivered: boolean;
}

export function validMathBoardCheckpoint(value: MathBoardCheckpoint): boolean {
    if (value?.version !== 1 || !Array.isArray(value.problems) || !value.problems.length
        || !Number.isInteger(value.index) || value.index < 0 || value.index > value.problems.length
        || !Array.isArray(value.results) || value.results.length > value.problems.length
        || !value.results.every(result => typeof result === 'boolean')
        || !Array.isArray(value.timings) || value.timings.length !== value.results.length
        || !value.timings.every(ms => Number.isFinite(ms) && ms >= 0)
        || !Array.isArray(value.assisted) || value.assisted.length !== value.results.length
        || !value.assisted.every(item => typeof item === 'boolean')
        || !Array.isArray(value.feedback) || value.feedback.length !== value.results.length
        || !Number.isFinite(value.damage) || value.damage < 0
        || !Number.isFinite(value.activeTimeMs) || value.activeTimeMs < 0
        || typeof value.currentAssisted !== 'boolean' || typeof value.sequential !== 'boolean'
        || typeof value.damageDisplayEnabled !== 'boolean' || typeof value.completionDelivered !== 'boolean'
        || (value.completionDelivered && value.stage !== 'complete')
        || !value.support || !Number.isInteger(value.support.symbolAnswers) || value.support.symbolAnswers < 0
        || (value.defense !== null && (!value.defense || !Number.isFinite(value.defense.power)
            || value.defense.power < 0 || !Number.isFinite(value.defense.incomingDamage) || value.defense.incomingDamage < 0))
        || !['question', 'feedback', 'demo', 'complete'].includes(value.stage)
        || !value.problems.every(problem => problem && Array.isArray(problem.choices) && problem.choices.length > 0
            && problem.choices.every(choice => Number.isFinite(choice)) && problem.choices.includes(problem.answer))) return false;
    if (!value.feedback.every((feedback, index) => feedback
        && feedback.correct === value.results[index] && Number.isInteger(feedback.choiceIndex)
        && feedback.choiceIndex >= 0 && feedback.choiceIndex < value.problems[index].choices.length
        && Number.isFinite(feedback.speedCharges) && feedback.speedCharges >= 0
        && Number.isFinite(feedback.blocked) && feedback.blocked >= 0 && typeof feedback.quickBlock === 'boolean')) return false;
    if (value.stage === 'feedback') return value.index < value.problems.length && value.results.length === value.index + 1;
    if (value.stage === 'complete') return value.index === value.problems.length && value.results.length === value.problems.length;
    return value.index < value.problems.length && value.results.length === value.index
        && (value.stage !== 'demo' || (value.sequential && ['size_crocodile', 'count_crocodile', 'number_crocodile',
            'number_symbol', 'expression_guided', 'expression_independent'].includes(value.demoStage ?? '')));
}
