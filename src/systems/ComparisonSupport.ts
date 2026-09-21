import config from '../data/comparison-learning.json';

export const COMPARISON_INTRO_VERSION = config.introVersion;
export const COMPARISON_HINT_DELAYS_MS = config.symbolHintDelaysMs;

export interface ComparisonSupportProgress {
    hintLevel: number;
    hintCorrectStreak: number;
}

export function normalizeComparisonSupport(prior?: Partial<ComparisonSupportProgress>): ComparisonSupportProgress {
    const level = prior?.hintLevel;
    return {
        hintLevel: typeof level === 'number' && Number.isFinite(level)
            ? Math.max(0, Math.min(COMPARISON_HINT_DELAYS_MS.length - 1, Math.floor(level))) : 0,
        hintCorrectStreak: prior?.hintCorrectStreak === 1 ? 1 : 0,
    };
}

export function comparisonHintDelay(progress: ComparisonSupportProgress): number | null {
    return COMPARISON_HINT_DELAYS_MS[normalizeComparisonSupport(progress).hintLevel];
}

/** Accuracy fades support; one wrong first answer restores one step immediately. */
export function updateComparisonSupport(progress: ComparisonSupportProgress, correct: boolean): void {
    Object.assign(progress, normalizeComparisonSupport(progress));
    if (!correct) {
        progress.hintLevel = Math.max(0, progress.hintLevel - 1);
        progress.hintCorrectStreak = 0;
    } else if (++progress.hintCorrectStreak >= config.correctAnswersToFade) {
        progress.hintLevel = Math.min(COMPARISON_HINT_DELAYS_MS.length - 1, progress.hintLevel + 1);
        progress.hintCorrectStreak = 0;
    }
}
