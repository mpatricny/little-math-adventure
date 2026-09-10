import { describe, expect, it } from 'vitest';
import { underwaterReverseChallenge, evaluateReverse } from '../UnderwaterReverseProblems';
import { underwaterRoutingChallenge, evaluateRouting } from '../UnderwaterRoutingProblems';
import type { BandId, PlayerState } from '../../types';
import { getUnderwaterProgress, completeUnderwaterMechanismStage, restoreUnderwaterMechanism, getUnderwaterSeals,
    canUseUnderwaterExit, completeUnderwaterEncounter, UNDERWATER_ROOMS } from '../UnderwaterProgressSystem';
import scenes from '../../../public/assets/data/scenes.json';

for (const band of ['A', 'B', 'C', 'D', 'E'] as BandId[]) describe(`seal applications: band ${band}`, () => {
    it('has three valid inverse/transfer stages, one correct pearl with randomized answer placement', () => {
        for (let stage = 0; stage < 3; stage++) {
            const challenge = underwaterReverseChallenge(band, stage);
            const results = challenge.cards.map((_, selected) => evaluateReverse(challenge, selected));
            expect(results.filter(result => result.correct)).toHaveLength(1);
            expect(new Set(challenge.cards).size).toBe(6);
            expect(challenge.cards.every(value => value >= 0 && value <= challenge.max)).toBe(true);
            expect(evaluateReverse(challenge, challenge.answerIndex).values.every(value => value >= 0 && value <= challenge.max)).toBe(true);
            expect(evaluateReverse(challenge, null).correct).toBe(false);
            expect(challenge.split).toBe(stage === 2);
        }
    });
    it('has one complete routing solution, unsolved start and changes both lanes on every switch', () => {
        for (let seed = 1; seed <= 30; seed++) {
            const challenge = underwaterRoutingChallenge(band, seed);
            const all = Array.from({ length: 8 }, (_, mask) => [0, 1, 2].map(i => Boolean(mask & (1 << i))));
            expect(all.filter(plan => evaluateRouting(challenge, plan).correct)).toHaveLength(1);
            expect(evaluateRouting(challenge, challenge.initial).correct).toBe(false);
            const solved = evaluateRouting(challenge, challenge.solution);
            expect(solved.correct).toBe(true);
            expect(solved.traces[0].legs.every((leg, i) => leg.lane !== solved.traces[1].legs[i].lane)).toBe(true);
            for (let i = 0; i < 3; i++) {
                const changed = [...challenge.solution]; changed[i] = !changed[i];
                expect(evaluateRouting(challenge, changed).correct).toBe(false);
            }
        }
    });
});

describe('seal state and physical passage contracts', () => {
    const player = () => ({}) as PlayerState;
    const shrine = 'sp_shell_shrine', chamber = 'sp_current_chamber';
    for (const first of [shrine, chamber]) it(`grants permanent independent seals in either order: ${first}`, () => {
        const p = player();
        const order = first === shrine ? [shrine, chamber] : [chamber, shrine];
        expect(getUnderwaterSeals(p)).toEqual([]);
        expect(canUseUnderwaterExit(p, 'sp_reed_garden', 'shrine')).toBe(false);
        expect(canUseUnderwaterExit(p, 'sp_sunken_canal', 'chamber')).toBe(false);
        for (const room of ['sp_reed_garden', 'sp_sunken_canal']) {
            completeUnderwaterEncounter(p, UNDERWATER_ROOMS[room].encounter!.id);
            restoreUnderwaterMechanism(p, room);
        }
        expect(canUseUnderwaterExit(p, 'sp_reed_garden', 'shrine')).toBe(true);
        expect(canUseUnderwaterExit(p, 'sp_sunken_canal', 'chamber')).toBe(true);
        for (const room of order) {
            expect(restoreUnderwaterMechanism(p, room)).toBe(false);
            if (room === shrine) {
                for (let stage = 0; stage < 3; stage++) {
                    expect(completeUnderwaterMechanismStage(p, room, stage)).toBe(true);
                    expect(completeUnderwaterMechanismStage(p, room, stage)).toBe(false);
                }
            } else completeUnderwaterEncounter(p, UNDERWATER_ROOMS[room].encounter!.id);
            expect(restoreUnderwaterMechanism(p, room)).toBe(true);
            expect(restoreUnderwaterMechanism(p, room)).toBe(false);
        }
        expect(getUnderwaterSeals(p).sort()).toEqual(['current', 'shell']);
        const reloaded = JSON.parse(JSON.stringify(p));
        expect(getUnderwaterSeals(reloaded).sort()).toEqual(['current', 'shell']);
        expect(getUnderwaterProgress(reloaded).mechanismStages?.['shrine-memory']).toBe(3);
        expect(canUseUnderwaterExit(p, shrine, 'garden')).toBe(true);
        expect(canUseUnderwaterExit(p, chamber, 'canal')).toBe(true);
    });
    it('pairs every new doorway with its reverse and spawns by that physical opening', () => {
        const layouts = scenes.scenes as Record<string, any>;
        for (const [roomId, room] of Object.entries(UNDERWATER_ROOMS)) for (const exit of room.exits.filter(exit => exit.passage)) {
            const target = UNDERWATER_ROOMS[exit.target];
            const reverse = exit.oneWay ? target.arrivals?.find(back => back.passage === exit.passage)
                : target.exits.find(back => back.passage === exit.passage);
            expect(reverse && ('from' in reverse ? reverse.from : reverse.target)).toBe(roomId);
            expect(reverse?.id).toBe(exit.entry);
            const layout = layouts[target.layout];
            const spawn = layout.zones.find((zone: any) => zone.id === exit.entry);
            const opening = layout.elements.find((element: any) => element.id === reverse?.host);
            expect(Math.abs(spawn.x - opening.x)).toBeLessThan(150);
        }
    });
    it('joins lock frames with touching metal bodies and one shared rusty backing', () => {
        const elements = scenes.scenes.UnderwaterCipher.elements;
        const wheels = elements.filter(e => /^wordWheel/.test(e.id));
        const backing = elements.find(e => e.id === 'wordBackingHost')!;
        for (let i = 1; i < wheels.length; i++) {
            const pitch = wheels[i].x - wheels[i - 1].x;
            expect(pitch).toBeLessThanOrEqual(wheels[i].height * 165 / 256);
            expect(pitch).toBeGreaterThanOrEqual(wheels[i].width);
        }
        expect(backing.depth).toBeLessThan(wheels[0].depth);
        expect(backing.width).toBeGreaterThan(wheels[4].x - wheels[0].x + wheels[0].height);
    });
});
