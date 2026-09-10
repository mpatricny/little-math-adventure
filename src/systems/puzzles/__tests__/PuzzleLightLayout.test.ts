import { describe, expect, it } from 'vitest';
import scenes from '../../../../public/assets/data/scenes.json';
import { bandProfile } from '../PuzzleDifficulty';
import { lightLayoutKey, lightPool, lightSolutions, traceUnderwaterLight, underwaterLightChallenge, underwaterLightHint } from '../../UnderwaterLightPuzzle';
import { seededRandom } from '../PuzzleRandom';

describe('all generated optical layouts', () => {
    it('has at least twenty genuinely distinct routes, each requiring all four mirrors and lighting pearls on separate legs', () => {
        expect(new Set(lightPool().map(lightLayoutKey)).size).toBe(lightPool().length);
        expect(lightPool().length).toBeGreaterThanOrEqual(20);
        for (const c of lightPool()) {
            // Search ALL 256 configurations, including the pass-through orientations.
            const solutions = lightSolutions(c);
            expect(solutions, JSON.stringify(c)).toHaveLength(1);
            const solution = solutions[0], trace = traceUnderwaterLight(solution, c);
            const key = (p: { x: number; y: number }) => `${p.x},${p.y}`;
            const mirrorKeys = c.mirrors.map(key);
            expect(trace.points.map(key).filter(k => mirrorKeys.includes(k))).toEqual(mirrorKeys);
            expect(new Set(trace.points.map(key)).size).toBe(trace.points.length);
            expect(trace.lit).toHaveLength(2);
            const lampLegs = c.lamps.map(lamp => {
                const beforeLamp = trace.points.slice(0, trace.points.findIndex(p => key(p) === key(lamp)));
                return beforeLamp.filter(p => mirrorKeys.includes(key(p))).length;
            });
            expect(new Set(lampLegs).size).toBe(2);
            expect(lampLegs.every(leg => leg > 0)).toBe(true);
            for (let i = 0; i < c.mirrors.length; i++) {
                // A disconnected/decorative mirror would allow the same solution after removal.
                const withoutMirror = { ...c, mirrors: c.mirrors.filter((_, j) => j !== i) };
                expect(traceUnderwaterLight(solution.filter((_, j) => j !== i), withoutMirror).solved).toBe(false);
            }
        }
    });
    for (const tier of [1, 2, 3] as const) it(`tier ${tier}: starts unsolved, has a reachable solution and useful hints on every board`, () => {
        for (let index = 0; index < lightPool().length; index++) {
            const c = underwaterLightChallenge(bandProfile('A', tier), () => (index + .5) / lightPool().length);
            expect(c.allowedTurns).toHaveLength(tier + 1);
            expect(traceUnderwaterLight(c.initial, c).solved).toBe(false);
            const solutions = lightSolutions(c);
            expect(solutions).toHaveLength(1);
            expect(Math.min(...solutions.map(s => s.filter((v, i) => v !== c.initial[i]).length))).toBe(tier + 1);
            // Even setting any one mirror directly to any allowed angle cannot solve a new board.
            for (let i = 0; i < c.mirrors.length; i++) for (const turn of c.allowedTurns!) {
                const changed = [...c.initial]; changed[i] = turn;
                expect(traceUnderwaterLight(changed, c).solved).toBe(false);
            }
            const turns = [...c.initial];
            for (let step = 0; step < c.mirrors.length; step++) {
                const hint = underwaterLightHint(turns, c);
                if (hint) { expect(c.allowedTurns).toContain(hint.turn); turns[hint.index] = hint.turn; }
            }
            expect(traceUnderwaterLight(turns, c).solved).toBe(true);
        }
    });
    it('keeps the difficulty guarantee for random starts, endpoint RNG values and repeated independent draws', () => {
        for (const tier of [1, 2, 3] as const) {
            const rng = seededRandom(1928 + tier), draws = new Set<string>();
            for (let i = 0; i < 500; i++) {
                const c = underwaterLightChallenge(bandProfile('A', tier), i === 0 ? () => 0 : i === 1 ? () => 1 - Number.EPSILON : rng);
                expect(lightSolutions(c).every(s => s.filter((v, j) => v !== c.initial[j]).length === tier + 1)).toBe(true);
                draws.add(lightLayoutKey(c));
            }
            expect(draws.size).toBe(lightPool().length);
        }
        const c = underwaterLightChallenge(bandProfile('A'), () => 0);
        c.mirrors[0].x = 99; c.initial[0] = 99;
        const fresh = underwaterLightChallenge(bandProfile('A'), () => 0);
        expect(fresh.mirrors[0].x).not.toBe(99);
        expect(fresh.initial[0]).not.toBe(99);
    });
    it('keeps every mirror, lamp and endpoint apart and above feedback in the authored board area', () => {
        const get = (id: string) => scenes.scenes.UnderwaterLight.elements.find(e => e.id === id)!;
        const host = get('lightBoardHost'), feedback = get('lightFeedbackHost');
        for (const c of lightPool()) {
            const nodes = [{ point: c.source, id: 'lightSourceHost' }, { point: c.target, id: 'lightTargetHost' },
                ...c.mirrors.map((point, i) => ({ point, id: `lightMirror${i}Host` })),
                ...c.lamps.map((point, i) => ({ point, id: `lightLamp${i}Host` }))].map(({point, id}) => ({
                ...get(id), x: host.x - host.width / 2 + point.x / c.width * host.width,
                y: host.y - host.height / 2 + point.y / c.height * host.height,
            }));
            for (const node of nodes) expect(node.y + node.height / 2).toBeLessThan(feedback.y - feedback.height / 2);
            for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
                const a = nodes[i], b = nodes[j];
                const overlaps = Math.abs(a.x-b.x) < (a.width+b.width)/2 && Math.abs(a.y-b.y) < (a.height+b.height)/2;
                expect(overlaps, `${a.id}/${b.id}: ${JSON.stringify(c)}`).toBe(false);
            }
        }
    });
});
