import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerState } from '../../types';
import { getSilverpondQuestStage, hasUnseenSilverpondQuest } from '../SilverpondQuestProgress';
import { StorySystem } from '../StorySystem';

const fixture = vi.hoisted(() => ({ players: [] as PlayerState[], active: 0, coop: false, save: vi.fn() }));
vi.mock('../GameStateManager', () => ({ GameStateManager: { getInstance: () => ({
    getPlayer: () => fixture.players[fixture.active], save: fixture.save,
}) } }));
vi.mock('../CoopSessionManager', () => ({ CoopSessionManager: { getInstance: () => ({
    isCoopActive: () => fixture.coop,
    forBothPlayers: (callback: () => void) => {
        const original = fixture.active;
        for (const i of [0, 1]) { fixture.active = i; callback(); fixture.save(); }
        fixture.active = original;
    },
}) } }));

beforeEach(() => {
    fixture.players = [{}, {}] as PlayerState[];
    fixture.active = 0;
    fixture.coop = false;
    fixture.save.mockReset();
});

describe('Silverpond quest attention', () => {
    it('preserves the legacy intro flag and acknowledges each later stage after a saved reload', () => {
        const story = StorySystem.getInstance();
        expect(hasUnseenSilverpondQuest(fixture.players[0])).toBe(true);
        story.markSilverpondQuestSeen('fairy');
        expect(hasUnseenSilverpondQuest(fixture.players[0])).toBe(false);
        story.completeLakeFairyQuest();
        expect(getSilverpondQuestStage(fixture.players[0])).toBe('dive');
        expect(hasUnseenSilverpondQuest(fixture.players[0])).toBe(true);
        story.markSilverpondQuestSeen('dive');
        fixture.players = JSON.parse(JSON.stringify(fixture.players));
        expect(hasUnseenSilverpondQuest(fixture.players[0])).toBe(false);
        fixture.players[0].underwaterProgress = { depthCrystalClaimed: true } as PlayerState['underwaterProgress'];
        expect(getSilverpondQuestStage(fixture.players[0])).toBe('crystal');
        expect(hasUnseenSilverpondQuest(fixture.players[0])).toBe(true);
        story.markSilverpondQuestSeen('crystal');
        expect(hasUnseenSilverpondQuest(fixture.players[0])).toBe(false);
        expect(fixture.save).toHaveBeenCalledTimes(4);
    });

    it('does not acknowledge new progress when an older open page is closed', () => {
        const story = StorySystem.getInstance();
        const displayed = getSilverpondQuestStage(fixture.players[0]);
        story.completeLakeFairyQuest();
        story.markSilverpondQuestSeen(displayed);
        expect(story.getProgress()).toMatchObject({ hasSeenSilverpondQuest: true, hasWaterBreathingScale: true });
        expect(story.getProgress().hasSeenSilverpondDiveHint).not.toBe(true);
        expect(hasUnseenSilverpondQuest(fixture.players[0])).toBe(true);
    });

    it('marks shared displayed content for both heroes and restores the active player', () => {
        fixture.coop = true;
        fixture.active = 1;
        StorySystem.getInstance().markSilverpondQuestSeen('dive');
        expect(fixture.active).toBe(1);
        expect(fixture.players.map(p => p.storyProgress?.hasSeenSilverpondDiveHint)).toEqual([true, true]);
        expect(fixture.players.every(p => !p.storyProgress?.hasSeenSilverpondCrystalHint)).toBe(true);
        expect(fixture.save).toHaveBeenCalledTimes(2);
    });
});
