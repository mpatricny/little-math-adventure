import { describe, expect, it } from 'vitest';
import type { PlayerState } from '../../types';
import { getUnderwaterProgress } from '../UnderwaterProgressSystem';
import { DEPTH_MACHINE_PUZZLE, hasNextCityAccess, installDepthCrystal, needsDepthCrystalShipReturn } from '../DepthCrystalProgressSystem';
import { getPlayerResumeScene } from '../SilverpondProgressSystem';
import { depthCrystalPuzzle } from '../DepthCrystalPuzzle';
import { bandProfile, allowsStep } from '../puzzles/PuzzleDifficulty';
import { sumSolutions } from '../puzzles/PuzzleCatalog';
import { seededRandom } from '../puzzles/PuzzleRandom';

function player(): PlayerState {
    return { storyProgress: { hasCompletedIntro: true, hasUnlockedSilverpond: true,
        hasWaterBreathingScale: true, hasInstalledForestCrystal: true },
        mana: 12, crystals: { crystals: [], maxCapacity: 60 } } as unknown as PlayerState;
}
function solved(hero: PlayerState): void {
    hero.puzzleProgress = { version: 1, active: { [DEPTH_MACHINE_PUZZLE]: {
        version: 1, family: 'sum_selection', completed: true, assisted: false,
        profile: bandProfile('A'), payload: {}, state: {}, startedAt: 1,
    } }, results: {} };
}

describe('second crystal journey', () => {
    it('routes old claimed saves to the ship, but preserves underwater exploration', () => {
        const hero = player(), progress = getUnderwaterProgress(hero);
        expect(needsDepthCrystalShipReturn(hero)).toBe(false);
        progress.depthCrystalClaimed = true;
        expect(getPlayerResumeScene(hero)).toBe('ZyxRocketInterludeScene');
        progress.active = true;
        expect(getPlayerResumeScene(hero)).toBe('UnderwaterRoomScene');
    });
    it('requires both the story crystal and its own completed calibration', () => {
        const hero = player();
        expect(installDepthCrystal(hero)).toBe(false);
        const progress = getUnderwaterProgress(hero);
        progress.depthCrystalClaimed = true;
        expect(installDepthCrystal(hero)).toBe(false);
        solved(hero);
        hero.puzzleProgress!.active['zyx:machine'] = hero.puzzleProgress!.active[DEPTH_MACHINE_PUZZLE];
        delete hero.puzzleProgress!.active[DEPTH_MACHINE_PUZZLE];
        expect(installDepthCrystal(hero)).toBe(false);
        solved(hero);
        expect(installDepthCrystal(hero)).toBe(true);
        expect(hasNextCityAccess(hero)).toBe(true);
        expect(hero.storyProgress!.hasInstalledForestCrystal).toBe(true);
        expect(hero.mana).toBe(12); expect(hero.crystals!.crystals).toEqual([]);
        expect(installDepthCrystal(JSON.parse(JSON.stringify(hero)))).toBe(false);
        expect(getPlayerResumeScene(hero)).toBe('ZyxRocketInterludeScene');
        progress.depthCrystalShipActive = false;
        expect(getPlayerResumeScene(hero)).toBe('SilverpondTownMockScene');
    });
    it('shares the story unlock without inventing answers for the co-op guest', () => {
        const host = player(), guest = player();
        getUnderwaterProgress(host).depthCrystalClaimed = true;
        solved(host);
        expect(installDepthCrystal(host)).toBe(true);
        expect(installDepthCrystal(guest, host)).toBe(true);
        expect(hasNextCityAccess(guest)).toBe(true);
        expect(guest.puzzleProgress).toBeUndefined();
    });
    for (const band of ['A', 'B', 'C', 'D', 'E'] as const) for (const tier of [1, 2, 3] as const) {
        it(`${band}/${tier}: shuffled six choices, one or two valid combinations inside the learner's range`, () => {
            const profile = bandProfile(band, tier), positions = new Set<string>();
            for (let seed = 0; seed < 30; seed++) {
                const puzzle = depthCrystalPuzzle(profile, seededRandom(seed));
                expect(puzzle.values).toHaveLength(6);
                const solutions = sumSolutions(puzzle.values, puzzle.target);
                expect(solutions.length).toBeGreaterThan(0); expect(solutions.length).toBeLessThanOrEqual(2);
                solutions.forEach(ids => {
                    positions.add(ids.join(','));
                    const values = ids.map(i => puzzle.values[i]).sort((a, b) => b - a);
                    expect(allowsStep(profile, values[0], values[1])).toBe(true);
                    expect(allowsStep(profile, values[0] + values[1], values[2])).toBe(true);
                });
            }
            expect(positions.size).toBeGreaterThan(6);
        });
    }
});
