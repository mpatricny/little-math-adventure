import { describe, expect, it } from 'vitest';
import { BRIDGE_FIXED, bridgePool, bridgePuzzle } from '../PuzzleCatalog';
import { bandProfile } from '../PuzzleDifficulty';

describe('illustrated bridge gameplay contract', () => {
    for (const band of ['A', 'B', 'C', 'D', 'E'] as const) for (const tier of [1, 2, 3] as const) {
        it(`${band}/${tier}: every candidate fills all stones and requires both gaps with enough physical answers`, () => {
            const profile = { ...bandProfile(band, tier), subtraction: false };
            const pool = bridgePool(profile), visibleRows = new Map<string, number[]>();
            expect(pool.length).toBeGreaterThanOrEqual(20);
            expect(new Set(pool.map(p => JSON.stringify(p.full))).size).toBe(pool.length);
            pool.forEach((_, index) => {
                const c = bridgePuzzle(profile, () => (index + .5) / pool.length);
                expect(c.full).toHaveLength(7);
                expect(c.full.every(Number.isInteger)).toBe(true);
                expect(c.holes).toEqual([1, 5]);
                expect(c.sequence.filter(n => n === null)).toHaveLength(2);
                expect(c.stoneDisplayValues).toEqual(BRIDGE_FIXED.map(i => c.full[i]));
                expect(c.stoneDisplayValues).toHaveLength(5);
                expect(c.stoneDisplayValues.every(n => n >= 1)).toBe(true);
                expect(c.dropZoneConfig).toEqual([
                    { gap: 0, sequenceIndex: 1, expectedValue: c.full[1] },
                    { gap: 1, sequenceIndex: 5, expectedValue: c.full[5] },
                ]);
                expect(c.floatingRockValues).toHaveLength(5);
                const rocks = [...c.floatingRockValues];
                for (const answer of c.answers) {
                    const found = rocks.indexOf(answer);
                    expect(found).toBeGreaterThanOrEqual(0);
                    rocks.splice(found, 1);
                }
                expect(rocks.every(n => !c.answers.includes(n))).toBe(true);
                if (c.rule.kind === 'step') {
                    const step = c.rule.step;
                    expect(c.full.slice(1).every((value, i) => value - c.full[i] === step)).toBe(true);
                    expect(Math.max(...c.full, ...c.floatingRockValues)).toBeLessThanOrEqual(Math.max(10, profile.max));
                } else {
                    const cycle = c.rule.cycle;
                    expect(c.full).toEqual(Array.from({ length: 7 }, (_, i) => cycle[i % cycle.length]));
                    expect(cycle.every(value => c.stoneDisplayValues.includes(value))).toBe(true);
                    expect(Math.max(...c.full, ...c.floatingRockValues)).toBeLessThanOrEqual(profile.max);
                }
                // The visible numbers and stated rule cannot imply two different completions.
                const visible = JSON.stringify([c.pattern, c.sequence]);
                if (visibleRows.has(visible)) expect(c.full).toEqual(visibleRows.get(visible));
                visibleRows.set(visible, c.full);
            });
        });
    }
    it('includes simple counting up to ten, repeated triples and repeated equal answers for a beginner', () => {
        const pool = bridgePool({ ...bandProfile('A', 1), subtraction: false });
        for (const full of [[4, 5, 6, 7, 8, 9, 10], [1, 2, 3, 1, 2, 3, 1], [1, 2, 1, 2, 1, 2, 1]]) {
            expect(pool.some(c => JSON.stringify(c.full) === JSON.stringify(full))).toBe(true);
        }
    });
});
