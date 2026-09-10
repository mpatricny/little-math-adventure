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
 */
export function calculateSubAtomExamProgress(
    targetId: SubAtomId,
    successfulSolves: number,
    accuracy: number,
    qualifyingForms: number,
): SubAtomExamProgress {
    const requirements = SUB_ATOM_EXAM_REQUIREMENTS;
    const ready = successfulSolves >= requirements.successfulSolves
        && accuracy >= requirements.accuracy
        && qualifyingForms >= requirements.qualifyingForms;
    const completion = Math.min(
        successfulSolves / requirements.successfulSolves,
        accuracy / requirements.accuracy,
        qualifyingForms / requirements.qualifyingForms,
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
