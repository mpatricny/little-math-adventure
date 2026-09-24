export const MANA_ROW_COUNT = 8;
export const MANA_READING_PAUSE_MS = 750;

/** Each floor is a stationary, tappable target; even late rounds allow time to react. */
export function getManaRowHoldMs(problemCount: number): number {
    return Math.max(900, 1000 - Math.max(0, problemCount) * 25);
}

export function getManaRowY(top: number, bottom: number, row: number): number {
    return top + (Math.max(0, Math.min(MANA_ROW_COUNT - 1, row)) + 0.5) * (bottom - top) / MANA_ROW_COUNT;
}
