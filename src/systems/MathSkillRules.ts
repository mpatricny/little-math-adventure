import type { BandId } from '../types';

/** Shared numeric domains; E teaches crossing ten, not a larger number range. */
export const BAND_RANGES: Record<BandId, { minResult: number; maxResult: number }> = {
    A: { minResult: 0, maxResult: 5 }, B: { minResult: 0, maxResult: 8 },
    C: { minResult: 0, maxResult: 10 }, D: { minResult: 0, maxResult: 20 }, E: { minResult: 0, maxResult: 20 },
    F: { minResult: 0, maxResult: 100 }, G: { minResult: 0, maxResult: 30 }, H: { minResult: 0, maxResult: 100 },
};
export function crossesTen(a: number, b: number): boolean {
    return a < 10 && b > 10 || a > 10 && b < 10;
}
