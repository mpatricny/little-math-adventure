import { bandProfile, allowsStep } from '../puzzles/PuzzleDifficulty';
import { seededRandom } from '../puzzles/PuzzleRandom';
import { describe, expect, it } from 'vitest';
import type { BandId, PlayerState } from '../../types';
import { UNDERWATER_ROOMS, canUseUnderwaterExit, canOpenUnderwaterChest, claimUnderwaterChest,
    completeUnderwaterEncounter, getUnderwaterProgress, visitUnderwaterRoom } from '../UnderwaterProgressSystem';
import { underwaterWordCipher } from '../UnderwaterWordCipher';
import { createEncounterCatalog } from '../EncounterCatalog';
import encounters from '../../../public/assets/data/encounters.json';
import enemies from '../../../public/assets/data/enemies.json';
import type { EnemyDefinition } from '../../types';

describe('postal wreck branch', () => {
    it('replaces the temporary connector, preserving legacy entry IDs in existing saves', () => {
        const garden = UNDERWATER_ROOMS.sp_reed_garden.exits.find(e => e.id === 'canal')!;
        const canal = UNDERWATER_ROOMS.sp_sunken_canal.exits.find(e => e.id === 'garden')!;
        expect(garden).toMatchObject({ target: 'sp_post_wreck', entry: 'garden' });
        expect(canal).toMatchObject({ target: 'sp_post_wreck', entry: 'canal' });
        const p = {} as PlayerState;
        visitUnderwaterRoom(p, 'sp_sunken_canal', 'garden');
        expect(getUnderwaterProgress(p).entryId).toBe('garden');
        for (const room of ['sp_post_wreck', 'sp_wreck_hold']) {
            for (const exit of UNDERWATER_ROOMS[room].exits)
                expect(UNDERWATER_ROOMS[exit.target].exits.some(e => e.target === room && e.passage === exit.passage)).toBe(true);
        }
    });
    it('leaves the through route free but guards both treasures and the hold', () => {
        const p = {} as PlayerState;
        expect(canUseUnderwaterExit(p, 'sp_post_wreck', 'garden')).toBe(true);
        expect(canUseUnderwaterExit(p, 'sp_post_wreck', 'canal')).toBe(true);
        expect(canUseUnderwaterExit(p, 'sp_post_wreck', 'hold')).toBe(false);
        expect(canUseUnderwaterExit(p, 'sp_wreck_hold', 'wreck')).toBe(true);
        for (const id of ['sp_post_wreck', 'sp_wreck_hold']) {
            expect(canOpenUnderwaterChest(p, id)).toBe(false);
            expect(claimUnderwaterChest(p, id)).toBeNull();
        }
        expect(completeUnderwaterEncounter(p, 'silverpond-wreck-watch')).toBe(true);
        expect(completeUnderwaterEncounter(p, 'silverpond-wreck-watch')).toBe(false);
        expect(canUseUnderwaterExit(p, 'sp_post_wreck', 'hold')).toBe(true);
        for (const id of ['sp_post_wreck', 'sp_wreck_hold']) {
            expect(claimUnderwaterChest(p, id)).toEqual(UNDERWATER_ROOMS[id].chest);
            expect(claimUnderwaterChest(p, id)).toBeNull();
        }
        expect(getUnderwaterProgress(p).restoredMechanisms ?? []).toEqual([]);
    });
    it('keeps co-op rewards independent and does not turn shared clues into math answers', () => {
        const a = {} as PlayerState, b = {} as PlayerState;
        completeUnderwaterEncounter(a, 'silverpond-wreck-watch');
        claimUnderwaterChest(a, 'sp_wreck_hold');
        expect(claimUnderwaterChest(a, 'sp_wreck_hold')).toBeNull();
        expect(claimUnderwaterChest(b, 'sp_wreck_hold')).toBeNull();
        expect(claimUnderwaterChest(b, 'sp_wreck_hold', a)).not.toBeNull();
        expect(getUnderwaterProgress(b).defeatedEncounters).toEqual([]);
        expect(getUnderwaterProgress(b).puzzleAttempts).toBe(0);
    });
    it('resolves the optional battle through the production encounter catalog in both modes', () => {
        const catalog = createEncounterCatalog(encounters, { core: enemies as EnemyDefinition[] });
        const solo = catalog.resolveJourneyEncounter('silverpond-wreck-watch', 'solo');
        const coop = catalog.resolveJourneyEncounter('silverpond-wreck-watch', 'coop');
        expect(solo.enemies.map(e => e.id)).toEqual(encounters.scenes.UnderwaterRoomScene.rooms.sp_post_wreck.encounters[0].enemies.map(e => e.enemyId));
        expect(coop.enemies).toHaveLength(solo.enemies.length + 1);
    });
    for (const band of ['A', 'B', 'C', 'D', 'E'] as BandId[]) it(`${band}: postal representations have one unambiguous ordering`, () => {
        const clues = underwaterWordCipher('KOTVA', band, true, seededRandom(123));
        expect(new Set(clues.map(c => c.value)).size).toBe(5);
        expect(clues.map(c => c.letter).join('')).not.toBe('KOTVA');
        expect([...clues].sort((a, b) => a.value - b.value).map(c => c.letter).join('')).toBe('KOTVA');
        expect(clues.filter(c => c.display.includes('?'))).toHaveLength(2);
        for (const c of clues) {
            expect(allowsStep(bandProfile(band), c.problem.operand1, c.problem.operator === '+' ? c.problem.operand2 : -c.problem.operand2)).toBe(true);
            if (c.pearls) expect(c.pearls).toBe(c.value);
            if (c.display.includes('?')) {
                const inverse = c.problem.operator === '+' ? c.value - c.problem.operand2 : c.value + c.problem.operand2;
                expect(inverse).toBe(c.problem.operand1);
            }
        }
    });
});
