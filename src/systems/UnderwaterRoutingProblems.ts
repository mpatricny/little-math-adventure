import type { BandId } from '../types';
import type { PuzzleProfile, PuzzleRng } from '../types/puzzles';
import { asProfile } from './puzzles/WaterPuzzleCatalog';
import { cachedPool } from './puzzles/PuzzleCatalog';
import { integers, pickPuzzle, rngFrom, seededRandom, shuffle } from './puzzles/PuzzleRandom';
import tuning from '../../public/assets/data/puzzles/tuning.json';
import { allowsStep } from './puzzles/PuzzleDifficulty';

type RoutingBase = { starts: number[]; changes: number[][]; max: number; profile?: PuzzleProfile };

/** Each switch changes BOTH lanes. Follow identities through the actual drawn pipes. */
export function traceUnderwaterRoutes(base: RoutingBase, switches: boolean[]) {
    const traces = base.starts.map((start, identity) => {
        let lane = identity, value = start;
        const legs = switches.map((crossed, column) => {
            const from = lane;
            if (crossed) lane = 1 - lane;
            const before = value;
            if (column < base.changes.length) value += base.changes[column][lane];
            return { from, lane, before, value };
        });
        return { identity, lane, value, legs };
    });
    const targets = [0, 1].map(lane => traces.find(trace => trace.lane === lane)!.value);
    const valid = switches.length === 3 && traces.every(trace => trace.legs.every(leg => leg.value >= 0 && leg.value <= base.max && (!base.profile || allowsStep(base.profile, leg.before, leg.value - leg.before))));
    return { traces, targets, valid };
}

export function routingPool(p: PuzzleProfile) {
    return cachedPool('routing', p, () => {
        const result: Array<RoutingBase & { targets: number[]; solution: boolean[] }> = [];
        const deltaMax = Math.min(p.max, tuning.deltaByTier[p.tier - 1]);
        const deltas = integers(deltaMax * (p.subtraction ? 2 : 1)).map(n => n - (p.subtraction ? deltaMax : 0));
        const patterns: number[][] = [];
        for (const c of deltas) for (const d of deltas) for (const e of deltas) for (const f of deltas)
            if (c !== d && e !== f) patterns.push([c, d, e, f]);
        const rng = seededRandom(610 + p.band.charCodeAt(0) * 17 + p.tier);
        const starts = p.band === 'D' ? integers(p.max - 10).map(i => i + 10) : integers(p.max);
        const all = integers(7).map(mask => [0, 1, 2].map(i => Boolean(mask & (1 << i))));
        for (const a of starts) for (const b of starts) {
            if (a >= b) continue;
            let emitted = 0;
            // Eight different operation sets per source pair give a broad finite catalog without
            // allocating hundreds of thousands of route graphs when the player opens the panel.
            for (const [c, d, e, f] of shuffle(patterns, rng)) {
                const base = { starts: [a, b], changes: [[c, d], [e, f]], max: p.max, profile: p };
                const plans = all.map(solution => ({ solution, ...traceUnderwaterRoutes(base, solution) })).filter(plan => plan.valid);
                const unique = plans.filter(plan => plans.filter(other => other.targets.every((n, i) => n === plan.targets[i])).length === 1);
                if (unique.length) {
                    const plan = unique[Math.floor(rng() * unique.length)];
                    result.push({ ...base, targets: plan.targets, solution: plan.solution });
                    if (++emitted >= 8) break;
                }
            }
        }
        return result;
    });
}
export function underwaterRoutingChallenge(profile: BandId | PuzzleProfile, random?: number | PuzzleRng) {
    const p = asProfile(profile), rng = rngFrom(random), plan = pickPuzzle(routingPool(p), rng);
    const initial = plan.solution.map(value => !value);
    return { ...plan, initial };
}

export type RoutingChallenge = ReturnType<typeof underwaterRoutingChallenge>;
export function evaluateRouting(challenge: RoutingChallenge, switches: boolean[]) {
    const result = traceUnderwaterRoutes(challenge, switches);
    return { ...result, correct: result.valid && result.targets.every((value, i) => value === challenge.targets[i]) };
}
