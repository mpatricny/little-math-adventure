import { describe, expect, it, vi } from 'vitest';
import {
    advanceForestStory,
    completeForestGuardianJourneyProgress,
    getForestStoryResumeScene,
    type ForestGuardianJourneyPort,
} from '../ForestCrystalProgression';
import type { PlayerState, StoryProgress } from '../../types';
import { getPlayerResumeScene } from '../SilverpondProgressSystem';

describe('forest story recovery', () => {
    const legacyWinner = () => ({
        unlockedPets: ['verdant_guardian_defeated'],
        storyProgress: { hasCompletedIntro: true },
        coins: { copper: 17 },
        level: 8,
        crystals: { crystals: [{ id: 'existing-reward', value: 5 }] },
    } as unknown as PlayerState);

    it('resumes a saved victory at the unclaimed crystal without replaying rewards', () => {
        const player = legacyWinner(), before = structuredClone(player);
        expect(getPlayerResumeScene(player)).toBe('ForestCrystalRewardScene');
        expect(player).toEqual(before);
        advanceForestStory(player.storyProgress!, 'guardian');
        expect(player).toEqual({ ...before, storyProgress: { ...before.storyProgress, hasDefeatedVerdantGuardian: true } });
    });

    it('does not infer victory from an unlocked enemy alone or a fresh save', () => {
        expect(getForestStoryResumeScene({ unlockedPets: ['verdant_guardian'] } as PlayerState)).toBeNull();
        expect(getForestStoryResumeScene({} as PlayerState)).toBeNull();
    });

    it('resumes each checkpoint and never sends a later save back to claim rewards', () => {
        const player = legacyWinner();
        advanceForestStory(player.storyProgress!, 'crystal');
        expect(getPlayerResumeScene(player)).toBe('ZyxRocketInterludeScene');
        advanceForestStory(player.storyProgress!, 'installed');
        expect(getPlayerResumeScene(player)).toBe('ZyxRocketInterludeScene');
        expect(getForestStoryResumeScene(player, false)).toBeNull(); // Pilot has ended.
        advanceForestStory(player.storyProgress!, 'silverpond');
        expect(getForestStoryResumeScene(player)).toBeNull();
        expect(getPlayerResumeScene(player)).toBe('SilverpondTownMockScene');
    });

    it('is idempotent and never rolls back later story milestones', () => {
        const progress = { hasSeenForgeIntro: true } as StoryProgress;
        advanceForestStory(progress, 'silverpond');
        const completed = structuredClone(progress);
        advanceForestStory(progress, 'guardian');
        advanceForestStory(progress, 'crystal');
        expect(progress).toEqual(completed);
        expect(progress.hasSeenForgeIntro).toBe(true);
    });
});

function createJourneyPort(completed = false): ForestGuardianJourneyPort {
    const state = { completed };
    return {
        setObjectState: vi.fn(),
        getJourneyState: vi.fn(() => state),
        completeRoomJourney: vi.fn(() => {
            state.completed = true;
        }),
    };
}

describe('completeForestGuardianJourneyProgress', () => {
    it('marks the guardian defeated and completes the active journey', () => {
        const journey = createJourneyPort();

        expect(completeForestGuardianJourneyProgress(journey, {
            roomId: 'guardian_lair',
            defeatedObjectId: 'boss_guardian',
        })).toBe(true);
        expect(journey.setObjectState).toHaveBeenCalledWith(
            'guardian_lair',
            'boss_guardian',
            { interacted: true, defeated: true }
        );
        expect(journey.completeRoomJourney).toHaveBeenCalledTimes(1);
    });

    it('does not complete or reward an already completed journey twice', () => {
        const journey = createJourneyPort();
        const returnData = {
            roomId: 'guardian_lair',
            defeatedObjectId: 'boss_guardian',
        };

        completeForestGuardianJourneyProgress(journey, returnData);
        expect(completeForestGuardianJourneyProgress(journey, returnData)).toBe(false);
        expect(journey.completeRoomJourney).toHaveBeenCalledTimes(1);
    });

    it('does nothing without production room identifiers', () => {
        const journey = createJourneyPort();

        expect(completeForestGuardianJourneyProgress(journey, {})).toBe(false);
        expect(journey.setObjectState).not.toHaveBeenCalled();
        expect(journey.completeRoomJourney).not.toHaveBeenCalled();
    });
});
