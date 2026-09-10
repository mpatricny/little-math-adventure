import type { PlayerState } from '../types';
import { getUnderwaterProgress } from './UnderwaterProgressSystem';

export const DEPTH_MACHINE_PUZZLE = 'zyx:depth-machine';

/** Also picks up older saves which already claimed the crystal before this quest existed. */
export function needsDepthCrystalShipReturn(player: PlayerState): boolean {
    const progress = player.underwaterProgress;
    return Boolean(progress && !progress.active && progress.depthCrystalClaimed
        && (!progress.depthCrystalInstalled || progress.depthCrystalShipActive));
}

export function hasNextCityAccess(player: PlayerState): boolean {
    return player.underwaterProgress?.depthCrystalInstalled === true;
}

/** Story progress is shared in co-op; only the actual solver gets a puzzle observation. */
export function installDepthCrystal(player: PlayerState, worldPlayer: PlayerState = player): boolean {
    if (!worldPlayer.underwaterProgress?.depthCrystalClaimed
        || !worldPlayer.puzzleProgress?.active[DEPTH_MACHINE_PUZZLE]?.completed) return false;
    const progress = getUnderwaterProgress(player);
    if (progress.depthCrystalInstalled) return false;
    progress.depthCrystalClaimed = true;
    progress.depthCrystalInstalled = true;
    progress.depthCrystalShipActive = true;
    progress.active = false;
    return true;
}
