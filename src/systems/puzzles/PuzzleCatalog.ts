import type { BalancePuzzle, BridgePuzzle, PuzzleProfile, PuzzleRng, SequencePuzzle, SumPuzzle, TruthPuzzle } from '../../types/puzzles';
import { allowsStep } from './PuzzleDifficulty';
import { integers, pickPuzzle, shuffle } from './PuzzleRandom';
import tuning from '../../../public/assets/data/puzzles/tuning.json';

const cache = new Map<string, readonly unknown[]>();
/** Pools contain semantic candidates, not permutations of their answer buttons. */
export function cachedPool<T>(kind: string, profile: PuzzleProfile, build: () => T[], key: (value: T) => string = JSON.stringify): readonly T[] {
    const id = `${kind}:${JSON.stringify(profile)}`;
    if (!cache.has(id)) {
        const unique = new Map(build().map(value => [key(value), value]));
        if (!unique.size) throw new Error(`No valid ${kind} puzzles for ${id}`);
        cache.set(id, [...unique.values()]);
    }
    return cache.get(id) as readonly T[];
}
export function choices(answer: number, p: PuzzleProfile, count: number, rng: PuzzleRng): number[] {
    return shuffle([answer, ...shuffle(integers(p.max).filter(n => n !== answer), rng).slice(0, count - 1)], rng);
}
export function sequencePool(p: PuzzleProfile, maxLength = 7): readonly Omit<SequencePuzzle, 'options'>[] {
    return cachedPool(`sequence:${maxLength}`, p, () => {
        const result: Omit<SequencePuzzle, 'options'>[] = [];
        // Shorter chains remain available in small numeric domains at every logical tier.
        for (let length = 3; length <= Math.min(maxLength, p.max + 1, 4 + p.tier); length++) {
            for (let step = 1; step <= Math.min(3, p.tier + 1); step++) for (let start = 0; start <= p.max; start++) {
                const full = integers(length - 1).map(i => start + i * step);
                if (!full.slice(1).every((n, i) => allowsStep(p, full[i], n - full[i]))) continue;
                for (let hole = 1; hole < length; hole++) {
                    const patterns = [[hole]];
                    if (p.tier > 1 && length >= 4) for (let second = hole + 1; second < length; second++) patterns.push([hole, second]);
                    for (const holes of patterns) result.push({ full, holes, sequence: full.map((n, i) => holes.includes(i) ? null : n),
                        answers: holes.map(i => full[i]), pattern: `+${step}` });
                }
            }
        }
        return result;
    });
}
export function sequencePuzzle(p: PuzzleProfile, rng: PuzzleRng = Math.random): SequencePuzzle {
    const item = pickPuzzle(sequencePool(p), rng);
    const distractors = shuffle(integers(p.max).filter(n => !item.answers.includes(n)), rng).slice(0, 5 - item.answers.length);
    return { ...item, options: shuffle([...item.answers, ...distractors], rng) };
}
export function arithmeticFacts(p: PuzzleProfile): { a: number; b: number; op: string; answer: number }[] {
    const results = [];
    for (const a of integers(p.max)) for (const b of integers(p.max)) for (const op of p.subtraction ? ['+', '−'] : ['+']) {
        const delta = op === '+' ? b : -b;
        if (allowsStep(p, a, delta)) results.push({ a, b, op, answer: a + delta });
    }
    return results;
}
export function balancePool(p: PuzzleProfile): readonly Omit<BalancePuzzle, 'options'>[] {
    return cachedPool('balance', p, () => {
        const facts = arithmeticFacts(p), result: Omit<BalancePuzzle, 'options'>[] = [];
        for (const f of facts) for (const g of facts) {
            if (f.answer !== g.answer) continue;
            result.push({ left: `${f.a} ${f.op} ?`, right: `${g.a} ${g.op} ${g.b}`, answer: f.b });
        }
        return result;
    });
}
export function balancePuzzle(p: PuzzleProfile, rng: PuzzleRng = Math.random): BalancePuzzle {
    const item = pickPuzzle(balancePool(p), rng); return { ...item, options: choices(item.answer, p, 4, rng) };
}
export function truthPool(p: PuzzleProfile): readonly TruthPuzzle[] {
    return cachedPool('truth', p, () => {
        const facts = arithmeticFacts(p);
        return facts.map((f, i) => ({ paths: [f, facts[(i + 3) % facts.length], facts[(i + 7) % facts.length]].map((g, j) => ({
            equation: `${g.a} ${g.op} ${g.b} = ${j ? (g.answer + j) % (p.max + 1) : g.answer}`, correct: j === 0,
        })) }));
    });
}
export function truthPuzzle(p: PuzzleProfile, rng: PuzzleRng = Math.random): TruthPuzzle {
    return { paths: shuffle(pickPuzzle(truthPool(p), rng).paths, rng) };
}
export function sumSolutions(values: readonly number[], target: number, count = 3): number[][] {
    const solutions: number[][] = [];
    const walk = (start: number, indices: number[], sum: number) => {
        if (indices.length === count) { if (sum === target) solutions.push(indices); return; }
        for (let i = start; i < values.length; i++) walk(i + 1, [...indices, i], sum + values[i]);
    };
    walk(0, [], 0); return solutions;
}
export function sumPool(p: PuzzleProfile, optionCount = 6): readonly { target: number; values: number[] }[] {
    return cachedPool(`sum:${optionCount}`, p, () => {
        const result: { target: number; values: number[] }[] = [];
        for (let a = 0; a <= p.max; a++) for (let b = a; b <= p.max; b++) for (let c = b; c <= p.max; c++) {
            const target = a + b + c;
            // Selection is unordered: add the largest amount first, then the two smaller amounts.
            if (target === 0 || !allowsStep(p, c, b) || !allowsStep(p, c + b, a)) continue;
            for (let offset = 0; offset <= p.max; offset++) {
                const values = [a, b, c];
                for (let j = 0; values.length < optionCount; j++) values.push((offset + j * 2) % (p.max + 1));
                values.sort((x, y) => x - y);
                // Every accepted combination must stay inside the learner's arithmetic domain.
                const solutions = sumSolutions(values, target);
                if (!solutions.every(s => allowsStep(p, values[s[2]], values[s[1]]) && allowsStep(p, values[s[2]] + values[s[1]], values[s[0]]))) continue;
                result.push({ target, values });
            }
        }
        return result;
    }, item => JSON.stringify([item.target, [...new Set(sumSolutions(item.values, item.target).map(ids => JSON.stringify(ids.map(i => item.values[i]))))].sort()]));
}
export function sumPuzzle(p: PuzzleProfile, optionCount = 6, rng: PuzzleRng = Math.random): SumPuzzle {
    const item = pickPuzzle(sumPool(p, optionCount), rng), values = shuffle(item.values, rng);
    return { target: item.target, values, count: 3, items: values.map((value, i) => ({ value, emoji: ['🔴', '💚', '💙', '💜', '💎', '🟡'][i] })) };
}
export interface FlowPlan { start: number; changes: number[]; values: number[]; }
export function flowPool(p: PuzzleProfile, steps: number): readonly FlowPlan[] {
    return cachedPool(`flow:${steps}`, p, () => {
        const result: FlowPlan[] = [], deltaMax = Math.min(p.max, tuning.deltaByTier[p.tier - 1]);
        const walk = (values: number[], changes: number[]) => {
            if (changes.length === steps) {
                if (changes.some(n => n !== 0)) result.push({ start: values[0], changes, values });
                return;
            }
            for (let delta = p.subtraction ? -deltaMax : 0; delta <= deltaMax; delta++) {
                const last = values[values.length - 1];
                if (allowsStep(p, last, delta)) walk([...values, last + delta], [...changes, delta]);
            }
        };
        integers(p.max).forEach(start => walk([start], [])); return result;
    });
}
/** Both illustrated bridges ALWAYS have seven positions: five numbers and two gaps. */
export const BRIDGE_HOLES = [1, 5] as const;
export const BRIDGE_FIXED = [0, 2, 3, 4, 6] as const;
export function isCurrentBridgePuzzle(payload: unknown): payload is BridgePuzzle {
    return !!payload && typeof payload === 'object' && 'layoutVersion' in payload && payload.layoutVersion === 2;
}
export function bridgePool(p: PuzzleProfile): readonly Omit<BridgePuzzle, 'floatingRockValues'>[] {
    return cachedPool('bridge:seven-stones:v2', p, () => {
        const result: Omit<BridgePuzzle, 'floatingRockValues'>[] = [];
        const add = (full: number[], rule: BridgePuzzle['rule']) => {
            const holes = [...BRIDGE_HOLES];
            result.push({ layoutVersion: 2, full, holes, rule,
                pattern: rule.kind === 'step' ? `Každý krok +${rule.step}.`
                    : `Opakuje se ${rule.cycle.length === 2 ? 'dvojice' : 'trojice'} čísel.`,
                sequence: full.map((value, i) => holes.includes(i as 1 | 5) ? null : value),
                answers: holes.map(i => full[i]), stoneDisplayValues: BRIDGE_FIXED.map(i => full[i]),
                dropZoneConfig: holes.map((sequenceIndex, gap) => ({ sequenceIndex, gap, expectedValue: full[sequenceIndex] })),
            });
        };
        // Explicit bridge-only exception approved by the user: even A (arithmetic
        // up to five) can follow a simple counting row up to ten. Never shorten art.
        const countingProfile = { ...p, max: Math.max(10, p.max) };
        for (let step = 1; step <= Math.min(3, p.tier + 1); step++) for (let start = 1; start <= countingProfile.max; start++) {
            const full = Array.from({ length: 7 }, (_, i) => start + i * step);
            if (full.slice(1).every((n, i) => allowsStep(countingProfile, full[i], n - full[i]))) add(full, { kind: 'step', step });
        }
        // Repeating pairs/triples use known numbers; every cycle position remains
        // visible on a fixed stone. A four-item cycle would hide the same value in
        // both gaps and leave the answer unknowable, so it is deliberately excluded.
        for (const length of [2, 3]) for (let step = 1; step <= Math.min(3, p.tier + 1); step++) for (let start = 1; start <= p.max; start++) {
            const base = Array.from({ length }, (_, i) => start + i * step);
            if (!base.slice(1).every((n, i) => allowsStep(p, base[i], n - base[i]))) continue;
            for (let phase = 0; phase < length; phase++) {
                const cycle = base.map((_, i) => base[(i + phase) % length]);
                add(Array.from({ length: 7 }, (_, i) => cycle[i % length]), { kind: 'repeat', cycle });
            }
        }
        return result;
    }, item => JSON.stringify(item.full));
}
export function bridgePuzzle(p: PuzzleProfile, rng: PuzzleRng = Math.random): BridgePuzzle {
    const item = pickPuzzle(bridgePool(p), rng);
    const max = item.rule.kind === 'step' ? Math.max(10, p.max) : p.max;
    const distractors = shuffle(integers(max).filter(n => n > 0 && !item.answers.includes(n)), rng).slice(0, 3);
    // Keep duplicate answers as separate physical rocks (e.g. two 2s in 1,2,1,2,...).
    return { ...item, full: [...item.full], sequence: [...item.sequence], holes: [...item.holes], answers: [...item.answers],
        rule: item.rule.kind === 'repeat' ? { ...item.rule, cycle: [...item.rule.cycle] } : { ...item.rule },
        stoneDisplayValues: [...item.stoneDisplayValues], dropZoneConfig: item.dropZoneConfig.map(gap => ({ ...gap })),
        floatingRockValues: shuffle([...item.answers, ...distractors], rng) };
}
