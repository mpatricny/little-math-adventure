import { describe, expect, it, vi } from 'vitest';
import {
    completeForestGuardianJourneyProgress,
    type ForestGuardianJourneyPort,
} from '../ForestCrystalProgression';

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
