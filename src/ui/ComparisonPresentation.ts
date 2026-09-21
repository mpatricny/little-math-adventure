/** Keep illustrations unambiguous, including adjacent numeric size values. */
export function comparisonObjectScale(value: number, otherValue: number): number {
    if (value === otherValue) return 0.7;
    return value > otherValue ? 0.9 : 0.45;
}

/** Author's refinement: leave more breathing room inside the answer frames. */
export const COMPARISON_CHOICE_SCALE = 0.9;
