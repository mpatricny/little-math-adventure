import type { PlayerState } from '../types';
import tuning from '../../public/assets/data/underwater-puzzles.json';
import { ProgressionSystem } from './ProgressionSystem';

export const UNDERWATER_HINT = tuning.hints;

/** Elapsed time is active puzzle time, never offline/wall-clock time. */
export function buyUnderwaterHint(player: PlayerState, elapsedMs: number, useful: boolean): boolean {
    return useful && elapsedMs >= UNDERWATER_HINT.delayMs
        && ProgressionSystem.spendCoins(player, UNDERWATER_HINT.cost);
}
