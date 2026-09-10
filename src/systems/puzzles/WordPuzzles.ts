import words from '../../../public/assets/data/puzzles/words.json';
import type { PuzzleProfile, PuzzleRng } from '../../types/puzzles';
import { pickPuzzle } from './PuzzleRandom';
export function wordRiddle(_p: PuzzleProfile, rng: PuzzleRng = Math.random) { return { ...pickPuzzle(words.riddles, rng) }; }
export function cipherWord(rng: PuzzleRng = Math.random): string { return pickPuzzle(words.cipherWords, rng); }
export const wordPools = words;
