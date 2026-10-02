import type { PlayerState, StoryProgress } from '../types';

export type ForestStoryMilestone = 'guardian' | 'crystal' | 'installed' | 'silverpond';
export type ForestStoryResumeScene = 'ForestCrystalRewardScene' | 'ZyxRocketInterludeScene';

const FOREST_STORY_FLAGS = [
    'hasDefeatedVerdantGuardian',
    'hasClaimedForestCrystal',
    'hasInstalledForestCrystal',
    'hasUnlockedSilverpond',
] as const;
const FOREST_STORY_STAGES: ForestStoryMilestone[] = ['guardian', 'crystal', 'installed', 'silverpond'];

/** Story checkpoints only: never replay combat rewards or change learning progress. */
export function advanceForestStory(progress: StoryProgress, milestone: ForestStoryMilestone): void {
    const last = FOREST_STORY_STAGES.indexOf(milestone);
    FOREST_STORY_FLAGS.forEach((flag, index) => {
        if (index <= last) progress[flag] = true;
    });
}

/** Legacy co-op victories saved this combat marker before missing the story exit. */
export function getForestStoryResumeScene(
    player: PlayerState,
    silverpondEnabled = true,
): ForestStoryResumeScene | null {
    const story = player.storyProgress;
    if (story?.hasUnlockedSilverpond) return null;
    if (story?.hasInstalledForestCrystal) return silverpondEnabled ? 'ZyxRocketInterludeScene' : null;
    if (story?.hasClaimedForestCrystal) return 'ZyxRocketInterludeScene';
    if (story?.hasDefeatedVerdantGuardian
        || player.unlockedPets?.includes('verdant_guardian_defeated')
        || player.defeatedBosses?.includes('verdant_guardian')) {
        return 'ForestCrystalRewardScene';
    }
    return null;
}

export type ForestGuardianReturnData = Record<string, unknown>;

export interface ForestGuardianJourneyPort {
    setObjectState(
        roomId: string,
        objectId: string,
        state: { interacted: boolean; defeated: boolean }
    ): void;
    getJourneyState(): { completed: boolean } | null;
    completeRoomJourney(): void;
}

/**
 * Persist the production forest-boss result before the story flow leaves the
 * journey scenes. Returns true only when this call completes the journey.
 */
export function completeForestGuardianJourneyProgress(
    journeySystem: ForestGuardianJourneyPort,
    returnData: ForestGuardianReturnData
): boolean {
    const roomId = typeof returnData.roomId === 'string'
        ? returnData.roomId
        : null;
    const defeatedObjectId = typeof returnData.defeatedObjectId === 'string'
        ? returnData.defeatedObjectId
        : null;
    if (!roomId || !defeatedObjectId) return false;

    journeySystem.setObjectState(roomId, defeatedObjectId, {
        interacted: true,
        defeated: true,
    });

    if (journeySystem.getJourneyState()?.completed === true) {
        return false;
    }

    journeySystem.completeRoomJourney();
    return true;
}
