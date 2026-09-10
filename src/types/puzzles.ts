import type { BandId } from './index';
export type PuzzleFamily = 'sequence' | 'balance' | 'true_equation' | 'sum_selection' | 'word_riddle' | 'word_cipher' | 'bell' | 'pump' | 'reverse' | 'current' | 'routing' | 'light';
export interface PuzzleProfile { band: BandId; max: number; subtraction: boolean; crossing: boolean; tier: 1 | 2 | 3; }
export interface PuzzleAttempt { firstCorrect: boolean; assisted: boolean; elapsedMs: number; }
export interface PuzzleInstance<T = unknown> {
    version: 1; family: PuzzleFamily; payload: T; profile: PuzzleProfile;
    startedAt: number; firstCorrect?: boolean; assisted: boolean; completed: boolean;
    state: Record<string, unknown>;
}
export interface PuzzleProgress {
    version: 1;
    active: Record<string, PuzzleInstance>;
    results: Partial<Record<PuzzleFamily, { tier: 1 | 2 | 3; attempts: PuzzleAttempt[] }>>;
}
export type PuzzleRng = () => number;
export interface SequencePuzzle { sequence: (number | null)[]; full: number[]; holes: number[]; pattern: string; answers: number[]; options: number[]; }
export interface BridgePuzzle extends Omit<SequencePuzzle, 'options'> {
    layoutVersion: 2;
    rule: { kind: 'step'; step: number } | { kind: 'repeat'; cycle: number[] };
    stoneDisplayValues: number[];
    dropZoneConfig: { expectedValue: number; sequenceIndex: number; gap: number }[];
    floatingRockValues: number[];
}
export interface BalancePuzzle { left: string; right: string; answer: number; options: number[]; }
export interface TruthPuzzle { paths: { equation: string; correct: boolean }[]; }
export interface SumPuzzle { target: number; values: number[]; count: number; items: { emoji: string; value: number }[]; }
