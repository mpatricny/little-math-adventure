import { describe, expect, it, vi } from 'vitest';
import type { PlayerState } from '../../types';

vi.mock('../../config/buildVariant', () => ({ SILVERPOND_ENABLED: false }));

import { getPlayerResumeScene } from '../SilverpondProgressSystem';

describe('pilot chapter boundary', () => {
    it('keeps an unfinished intro at the crash site', () => {
        const player = {
            storyProgress: { hasCompletedIntro: false, hasUnlockedSilverpond: true },
        } as PlayerState;

        expect(getPlayerResumeScene(player)).toBe('CrashSiteScene');
    });

    it.each([
        {},
        { storyProgress: { hasCompletedIntro: true } },
        { storyProgress: { hasUnlockedSilverpond: true } },
        {
            storyProgress: { hasUnlockedSilverpond: true, hasWaterBreathingScale: true },
            underwaterProgress: { active: true },
        },
        {
            storyProgress: { hasUnlockedSilverpond: true },
            underwaterProgress: { active: false, depthCrystalClaimed: true },
        },
        {
            storyProgress: { hasUnlockedSilverpond: true },
            underwaterProgress: {
                active: false,
                depthCrystalClaimed: true,
                depthCrystalInstalled: true,
                depthCrystalShipActive: true,
            },
        },
    ])('resumes available content without erasing imported progress: %j', (save) => {
        const player = save as PlayerState;
        const before = JSON.stringify(player);

        expect(getPlayerResumeScene(player)).toBe('TownScene');
        expect(JSON.stringify(player)).toBe(before);
    });
});
