import type { PuzzleProfile, PuzzleRng, SumPuzzle } from '../types/puzzles';
import { cachedPool, sumPool, sumSolutions } from './puzzles/PuzzleCatalog';
import { pickPuzzle, shuffle } from './puzzles/PuzzleRandom';
import { allowsStep } from './puzzles/PuzzleDifficulty';

/** Reuse the ship's three-node circuit, with only one or two valid combinations. */
export function depthCrystalPuzzle(profile: PuzzleProfile, rng: PuzzleRng = Math.random): SumPuzzle {
    const pool = cachedPool('depth-machine', profile, () => {
        if (profile.max > 5) return sumPool(profile, 6)
            .filter(puzzle => sumSolutions(puzzle.values, puzzle.target).length <= 2);
        // The generic pool's stride-based distractors leave only seven variants
        // under this stricter answer limit. Enumerate the complete small domain;
        // do not raise a beginner's number range or relax the answer-count rule.
        const result: { values: number[]; target: number }[] = [];
        const visit = (values: number[]) => {
            if (values.length < 6) {
                for (let n = values.at(-1) ?? 0; n <= profile.max; n++) visit([...values, n]);
                return;
            }
            for (let target = 1; target <= profile.max; target++) {
                const solutions = sumSolutions(values, target);
                if (solutions.length >= 1 && solutions.length <= 2 && solutions.every(ids =>
                    allowsStep(profile, values[ids[2]], values[ids[1]])
                    && allowsStep(profile, values[ids[2]] + values[ids[1]], values[ids[0]]))) result.push({ values, target });
            }
        };
        visit([]);
        return result;
    }, item => JSON.stringify([item.target, [...new Set(sumSolutions(item.values, item.target)
        .map(ids => JSON.stringify(ids.map(i => item.values[i]))))].sort()]));
    const puzzle = pickPuzzle(pool, rng);
    const values = shuffle(puzzle.values, rng);
    return { target: puzzle.target, values, count: 3, items: values.map(value => ({ value, emoji: '' })) };
}
