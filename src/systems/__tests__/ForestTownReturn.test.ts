import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerState } from '../../types';
import { JourneySystem } from '../JourneySystem';

const fixture = vi.hoisted(() => ({
    players: [] as PlayerState[], active: 0, coop: false, save: vi.fn(),
}));
vi.mock('../GameStateManager', () => ({ GameStateManager: {
    getInstance: () => ({ getPlayer: () => fixture.players[fixture.active], save: fixture.save }),
} }));
vi.mock('../CoopSessionManager', () => ({ CoopSessionManager: {
    getInstance: () => ({
        isCoopActive: () => fixture.coop,
        activatePlayerA: () => { fixture.active = 0; },
        activatePlayerB: () => { fixture.active = 1; },
    }),
} }));
vi.mock('../ProgressionSystem', () => ({ ProgressionSystem: {
    spendCoins: vi.fn(), awardBattleCoin: vi.fn(),
} }));

function reloadJourney() {
    (JourneySystem as any).instance = undefined;
    return JourneySystem.getInstance();
}

function reachedCamp() {
    const journey = JourneySystem.getInstance();
    journey.startRoomJourney('verdant_forest', 'forest_edge', true);
    journey.setObjectState('forest_edge', 'wolf_1', { interacted: true, defeated: true });
    journey.setObjectState('forest_riddle', 'bridge', { interacted: true, completed: true });
    journey.setObjectState('forest_camp', 'chest_simple', { interacted: true, looted: true });
    journey.addRewards(0, 40);
    journey.setCurrentRoom('forest_camp');
    journey.unlockWaypoint('forest_camp');
    return journey;
}

beforeEach(() => {
    fixture.active = 0;
    fixture.coop = false;
    fixture.save.mockReset();
    fixture.players = [7, 11].map(hp => ({
        hp, maxHp: 20, attack: 4, equippedWeapon: 'sword_reinforced',
        coins: { copper: 0, silver: 0, gold: 0, pouch: 0 },
    } as PlayerState));
    reloadJourney();
});

describe('forest camp / town round trip', () => {
    it('persists the reached camp and all run progress across a reload without charging or rolling back town changes', () => {
        let journey = reachedCamp();
        const before = structuredClone(journey.getJourneyState()!);
        expect(journey.pauseRoomJourneyAtWaypoint('forest_camp')).toBe(true);
        expect(journey.hasActiveJourney()).toBe(false);
        expect(fixture.save).toHaveBeenCalled();
        expect(fixture.players[0].suspendedForestJourney?.roomStates).toEqual(before.roomStates);
        fixture.players = JSON.parse(JSON.stringify(fixture.players));
        const player = fixture.players[0];
        player.hp = 20; // Town healing must not be reverted to the checkpoint's 7 HP.
        player.equippedWeapon = 'sword_iron';
        const townPlayer = structuredClone(player);
        journey = reloadJourney();
        expect(journey.getTownReturnWaypoint('other_journey')).toBeNull();
        expect(journey.getTownReturnWaypoint('verdant_forest')).toBe('forest_camp');
        expect(journey.resumeRoomJourneyFromTown('verdant_forest')).toBe(true);
        expect(journey.getJourneyState()).toMatchObject({
            currentRoom: 'forest_camp', roomStates: before.roomStates, totalGold: 40,
            startedAt: before.startedAt, unlockedWaypoints: ['forest_camp'],
        });
        const { suspendedForestJourney: _, ...expectedPlayer } = townPlayer;
        expect(player).toEqual(expectedPlayer);
        expect(journey.resumeRoomJourneyFromTown('verdant_forest')).toBe(false);
        expect(journey.pauseRoomJourneyAtWaypoint('forest_camp')).toBe(true);
        expect(journey.resumeRoomJourneyFromTown('verdant_forest')).toBe(true);
        expect(journey.getJourneyState()?.totalGold).toBe(40);
        expect(journey.isObjectLooted('forest_camp', 'chest_simple')).toBe(true);
    });

    it('stores a co-op world only on A and never resumes another profile’s checkpoint', () => {
        fixture.coop = true;
        const journey = reachedCamp();
        const otherRun = { ...structuredClone(journey.getJourneyState()!), journeyId: 'other_run' };
        fixture.players[1].suspendedForestJourney = otherRun;
        fixture.active = 1;
        expect(journey.pauseRoomJourneyAtWaypoint('forest_camp')).toBe(true);
        expect(fixture.active).toBe(0);
        expect(fixture.players[0].suspendedForestJourney?.lastSavePoint).toMatchObject({ hp: 7, hpB: 11 });
        expect(fixture.players[1].suspendedForestJourney).toEqual(otherRun);
        fixture.coop = false;
        fixture.active = 1;
        expect(journey.getTownReturnWaypoint('verdant_forest')).toBeNull();
        expect(journey.resumeRoomJourneyFromTown('verdant_forest')).toBe(false);
        fixture.active = 0;
        expect(journey.resumeRoomJourneyFromTown('verdant_forest')).toBe(true);
        expect(fixture.players[1].suspendedForestJourney).toEqual(otherRun);
    });

    it('does not pause an unreached waypoint, a different room or a completed/failed run', () => {
        const journey = JourneySystem.getInstance();
        expect(journey.pauseRoomJourneyAtWaypoint('forest_camp')).toBe(false);
        journey.startRoomJourney('verdant_forest', 'forest_edge', true);
        expect(journey.pauseRoomJourneyAtWaypoint('forest_camp')).toBe(false);
        journey.setCurrentRoom('forest_camp');
        expect(journey.pauseRoomJourneyAtWaypoint('forest_camp')).toBe(false);
        journey.unlockWaypoint('forest_camp');
        journey.getJourneyState()!.completed = true;
        expect(journey.pauseRoomJourneyAtWaypoint('forest_camp')).toBe(false);
        journey.getJourneyState()!.completed = false;
        journey.getJourneyState()!.failed = true;
        expect(journey.pauseRoomJourneyAtWaypoint('forest_camp')).toBe(false);
        expect(fixture.players[0].suspendedForestJourney).toBeUndefined();
    });
});
