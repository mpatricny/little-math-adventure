/**
 * Per-sub-atom mastery RT thresholds (milliseconds).
 * Harder bands/sub-atoms get more time to account for problem complexity.
 *
 * Extracted to a separate file for testability (no Phaser dependency).
 */
const MASTERY_RT_BY_SUBATOM: Record<string, number> = {
    A1: 5000, A2: 5000, A3: 5500, A4: 5500,
    B1: 5000, B2: 5000, B3: 5500, B4: 5500,
    C1: 5000, C2: 5000, C3: 5500, C4: 5500,
    D1: 5500, D2: 5500, D3: 6000, D4: 6000,
    E1: 6000, E2: 6000, E3: 6500, E4: 6500,
};

export const DEFAULT_MASTERY_RT_MS = 5000;

/** Derive all thresholds from the per-sub-atom mastery RT (preserves existing ratios) */
export function getThresholdsForSubAtom(subAtomId?: string) {
    const mastery = (subAtomId && MASTERY_RT_BY_SUBATOM[subAtomId]) || DEFAULT_MASTERY_RT_MS;
    return {
        masteryRT: mastery,
        swiftHitRT: mastery,                        // 1.0×
        lightningHitRT: Math.round(mastery * 0.6),  // 0.6×
        fluentRT: Math.round(mastery * 1.4),        // 1.4×
    };
}
