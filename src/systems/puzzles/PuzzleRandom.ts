import tuning from '../../../public/assets/data/puzzles/tuning.json';
import type { PuzzleRng } from '../../types/puzzles';
export function pick<T>(pool: readonly T[], rng: PuzzleRng = Math.random): T {
    if (!pool.length) throw new Error('Empty adaptive puzzle pool');
    const value = rng();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Puzzle RNG must return [0, 1)');
    return pool[Math.floor(value * pool.length)];
}
/** Draw an entire semantic challenge only after all skill and layout filters. */
export function pickPuzzle<T>(pool: readonly T[], rng: PuzzleRng = Math.random): T {
    if (pool.length < tuning.minimumPoolSize) throw new Error(`Adaptive puzzle pool requires ${tuning.minimumPoolSize} variants; found ${pool.length}`);
    return pick(pool, rng);
}
export function shuffle<T>(values: readonly T[], rng: PuzzleRng = Math.random): T[] {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1)); [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}
export function seededRandom(seed: number): PuzzleRng {
    let state = seed | 0;
    return () => {
        state += 0x6D2B79F5;
        let t = Math.imul(state ^ state >>> 15, 1 | state);
        t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}
export function rngFrom(value?: number | PuzzleRng): PuzzleRng {
    return typeof value === 'number' ? seededRandom(value) : value ?? Math.random;
}
export const integers = (max: number): number[] => Array.from({ length: max + 1 }, (_, i) => i);
