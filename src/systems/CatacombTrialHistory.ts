import type { MasteryData, MathProblem, PracticeTargetId } from '../types';
import { formatMathProblem } from '../utils/formatMathProblem';
import { catacombProblemWeight, type CatacombBatch, type FoxSpeedStage } from './CatacombBatch';

export interface CatacombTrialRecord {
    id: string;
    target: PracticeTargetId;
    finishedAt: number;
    outcome: 'passed' | 'timeout' | 'not-passed';
    required: number;
    paceMs: number;
    budgetMs: number;
    elapsedMs: number;
    questions: {
        key: string;
        prompt: string;
        weight: number;
        correct: boolean | null;
        responseTimeMs: number | null;
    }[];
}

/** Keep the last two finished runs per speed tier, including questions left when the planet set. */
export function recordCatacombTrial(data: MasteryData, target: PracticeTargetId, stage: FoxSpeedStage,
    id: string, problems: readonly MathProblem[], batch: CatacombBatch, passed: boolean): void {
    const history = data.recentCatacombTrials ??= {};
    const previous = history[stage] ?? [];
    if (previous.some(record => record.id === id)) return;
    const answers = batch.answers;
    const record: CatacombTrialRecord = {
        id, target, finishedAt: Date.now(),
        outcome: passed ? 'passed' : batch.expired ? 'timeout' : 'not-passed',
        required: batch.rules.required, paceMs: batch.rules.paceMs, budgetMs: batch.rules.budgetMs,
        elapsedMs: Math.round(batch.elapsedMs),
        questions: problems.map((problem, i) => ({
            key: problem.masteryKey ?? problem.id, prompt: formatMathProblem(problem, 'question'),
            weight: catacombProblemWeight(problem), correct: answers[i]?.correct ?? null,
            responseTimeMs: answers[i] ? Math.round(answers[i].responseTimeMs) : null,
        })),
    };
    history[stage] = [...previous.slice(-1), record];
}
