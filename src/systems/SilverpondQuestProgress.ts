import type { PlayerState, StoryProgress } from '../types';

export type SilverpondQuestStage = 'fairy' | 'dive' | 'crystal';

/** Capability/progress wins over old introductory dialogue flags. */
export function getSilverpondQuestStage(player: Pick<PlayerState, 'storyProgress' | 'underwaterProgress'>): SilverpondQuestStage {
    if (player.underwaterProgress?.depthCrystalClaimed) return 'crystal';
    if (player.storyProgress?.hasWaterBreathingScale) return 'dive';
    return 'fairy';
}

export function silverpondQuestSeenFlag(stage: SilverpondQuestStage): keyof Pick<StoryProgress,
    'hasSeenSilverpondQuest' | 'hasSeenSilverpondDiveHint' | 'hasSeenSilverpondCrystalHint'> {
    return stage === 'crystal' ? 'hasSeenSilverpondCrystalHint'
        : stage === 'dive' ? 'hasSeenSilverpondDiveHint' : 'hasSeenSilverpondQuest';
}

export function hasUnseenSilverpondQuest(player: Pick<PlayerState, 'storyProgress' | 'underwaterProgress'>): boolean {
    return player.storyProgress?.[silverpondQuestSeenFlag(getSilverpondQuestStage(player))] !== true;
}
