/** Cumulative correct answers in one run (the combined score in co-op). */
export const MANA_COLLECTION_THRESHOLDS = [1, 3, 6, 10, 15] as const;
const REPEAT_INTERVAL = 5;

export function manaForCorrectAnswers(correctCount: number): number {
    const correct = Number.isFinite(correctCount) ? Math.max(0, Math.floor(correctCount)) : 0;
    const last = MANA_COLLECTION_THRESHOLDS[MANA_COLLECTION_THRESHOLDS.length - 1];
    if (correct >= last) return MANA_COLLECTION_THRESHOLDS.length + Math.floor((correct - last) / REPEAT_INTERVAL);
    return MANA_COLLECTION_THRESHOLDS.filter(threshold => correct >= threshold).length;
}
