import type { BandId } from '../types';
import type { PuzzleProfile, PuzzleRng } from '../types/puzzles';
import { drawCurrent, asProfile } from './puzzles/WaterPuzzleCatalog';
import { allowsStep } from './puzzles/PuzzleDifficulty';

export interface CurrentChallenge {
    profile?: PuzzleProfile;
    starts: number[];
    targets: number[];
    cards: number[];
    solutions: number[][];
}

/** A shared change and two branch-specific changes: world application, not a fact-speed test. */
export function underwaterCurrentChallenge(profile: BandId | PuzzleProfile, rng: PuzzleRng = Math.random): CurrentChallenge {
    return drawCurrent(asProfile(profile), rng);
}

export function evaluateCurrents(challenge: CurrentChallenge, selected: Array<number | null>) {
    const validCards = selected.length === 3 && new Set(selected).size === 3
        && selected.every(index => index !== null && Number.isInteger(index) && challenge.cards[index] !== undefined);
    const deltas = selected.map(index => index === null ? 0 : challenge.cards[index] ?? 0);
    const shared = challenge.starts.map(value => value + deltas[0]);
    const targets = shared.map((value, i) => value + (deltas[i + 1] ?? 0));
    const valid = validCards && [...shared, ...targets].every(value => value >= 0)
        && (!challenge.profile || challenge.starts.every((start, i) => allowsStep(challenge.profile!, start, deltas[0]) && allowsStep(challenge.profile!, shared[i], deltas[i + 1])));
    const matches = targets.map((value, i) => value === challenge.targets[i]);
    return { valid, shared, targets, matches, correct: valid && matches.every(Boolean) };
}
