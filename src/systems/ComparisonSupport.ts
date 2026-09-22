import config from '../data/comparison-learning.json';

export const COMPARISON_INTRO_VERSION = config.introVersion;
export const COMPARISON_INSTANT_HINT_COUNT = config.instantSymbolHintCount;
export const COMPARISON_LATER_HINT_DELAY_MS = config.symbolHintDelayMs;

export interface ComparisonSupportProgress {
    symbolAnswers: number;
}

export function normalizeComparisonSupport(prior?: Partial<ComparisonSupportProgress> & { attempts?: number }): ComparisonSupportProgress {
    const count = prior?.symbolAnswers ?? prior?.attempts ?? 0;
    return {
        symbolAnswers: Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0,
    };
}

export function comparisonHintDelay(progress: ComparisonSupportProgress): number {
    return normalizeComparisonSupport(progress).symbolAnswers < COMPARISON_INSTANT_HINT_COUNT ? 0 : config.symbolHintDelayMs;
}

/** Five answered numeric examples get immediate reminders; subsequent examples wait 10 s. */
export function updateComparisonSupport(progress: ComparisonSupportProgress, _correct: boolean): void {
    Object.assign(progress, normalizeComparisonSupport(progress));
    progress.symbolAnswers++;
}
