import type { SubAtomId } from '../types';

export const SUB_ATOM_EXAM_REQUIREMENTS = {
    successfulSolves: 20,
    accuracy: 0.70,
    qualifyingForms: 2,
    solvesPerForm: 4,
} as const;

export interface SubAtomExamProgress {
    targetId: SubAtomId;
    percentage: number;
    ready: boolean;
    successfulSolves: number;
    requiredSuccessfulSolves: number;
    accuracy: number;
    requiredAccuracy: number;
    qualifyingForms: number;
    requiredQualifyingForms: number;
}

/**
 * Overall unlock progress is the least-complete requirement. The exam only
 * becomes available when solves, recent accuracy and form coverage are all met.
 * Count partial practice in the two strongest forms so the first correct
 * answers are visible before either form reaches its four-solve requirement.
 */
export function calculateSubAtomExamProgress(
    targetId: SubAtomId,
    successfulSolves: number,
    accuracy: number,
    successfulSolvesByForm: readonly number[],
): SubAtomExamProgress {
    const requirements = SUB_ATOM_EXAM_REQUIREMENTS;
    const qualifyingForms = successfulSolvesByForm.filter(solves => solves >= requirements.solvesPerForm).length;
    const formCompletion = successfulSolvesByForm
        .map(solves => Math.min(Math.max(0, solves), requirements.solvesPerForm))
        .sort((a, b) => b - a)
        .slice(0, requirements.qualifyingForms)
        .reduce((sum, solves) => sum + solves, 0)
        / (requirements.qualifyingForms * requirements.solvesPerForm);
    const ready = successfulSolves >= requirements.successfulSolves
        && accuracy >= requirements.accuracy
        && qualifyingForms >= requirements.qualifyingForms;
    const completion = Math.min(
        successfulSolves / requirements.successfulSolves,
        accuracy / requirements.accuracy,
        formCompletion,
        1,
    );

    return {
        targetId,
        percentage: ready ? 100 : Math.min(99, Math.floor(Math.max(0, completion) * 100)),
        ready,
        successfulSolves,
        requiredSuccessfulSolves: requirements.successfulSolves,
        accuracy,
        requiredAccuracy: requirements.accuracy,
        qualifyingForms,
        requiredQualifyingForms: requirements.qualifyingForms,
    };
}
