import type { PlayerState } from '../types';
import { SILVERPOND_ENABLED } from '../config/buildVariant';
import { needsDepthCrystalShipReturn } from './DepthCrystalProgressSystem';
import { getForestStoryResumeScene } from './ForestCrystalProgression';

export const SILVERPOND_TOWN_SCENE = 'SilverpondTownMockScene' as const;
export const MATHORIA_TOWN_SCENE = 'TownScene' as const;
export const CRASH_SITE_SCENE = 'CrashSiteScene' as const;
/** Global arena ID for Silverpond's local arena level 3. */
export const SILVERPOND_ARENA_LEVEL = 6;

export type PlayerResumeScene =
    | typeof CRASH_SITE_SCENE
    | typeof MATHORIA_TOWN_SCENE
    | typeof SILVERPOND_TOWN_SCENE
    | 'UnderwaterRoomScene'
    | 'ForestCrystalRewardScene'
    | 'ZyxRocketInterludeScene';

/** Resume unfinished story checkpoints before returning to the furthest unlocked town. */
export function getPlayerResumeScene(player: PlayerState): PlayerResumeScene {
    // Fresh games are saved before the comic starts. If the app is reloaded
    // after skipping the comic, the crash-site battle must still be completed.
    // Undefined remains compatible with old saves that predate storyProgress.
    if (player.storyProgress?.hasCompletedIntro === false) {
        return CRASH_SITE_SCENE;
    }
    if (SILVERPOND_ENABLED && player.underwaterProgress?.active && (player.storyProgress?.hasWaterBreathingScale || shouldBackfillLakeFairyReward(player))) {
        return 'UnderwaterRoomScene';
    }
    if (SILVERPOND_ENABLED && needsDepthCrystalShipReturn(player)) return 'ZyxRocketInterludeScene';
    const forestResume = getForestStoryResumeScene(player, SILVERPOND_ENABLED);
    if (forestResume) return forestResume;
    // Keep later progress when importing a development save into the pilot.
    if (!SILVERPOND_ENABLED) return MATHORIA_TOWN_SCENE;
    return player.storyProgress?.hasUnlockedSilverpond === true
        ? SILVERPOND_TOWN_SCENE
        : MATHORIA_TOWN_SCENE;
}

/**
 * Compatibility bridge for saves that completed Silverpond arena 3 before the lake-fairy
 * story was introduced. Returns true when the reward should be backfilled.
 */
export function shouldBackfillLakeFairyReward(player: PlayerState): boolean {
    return player.storyProgress?.hasUnlockedSilverpond === true
        && player.storyProgress.hasWaterBreathingScale !== true
        && player.arena?.completedArenaLevels?.includes(SILVERPOND_ARENA_LEVEL) === true;
}
