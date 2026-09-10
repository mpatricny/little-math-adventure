import { afterAll, describe, it, expect } from 'vitest';
import { bandProfile } from '../PuzzleDifficulty';
import { bridgePool, sequencePool, balancePool, truthPool, sumPool, flowPool } from '../PuzzleCatalog';
import { bellPool, currentPool, reversePool } from '../WaterPuzzleCatalog';
import { routingPool } from '../../UnderwaterRoutingProblems';
import { pick, pickPuzzle, seededRandom } from '../PuzzleRandom';
const report: unknown[] = [];
afterAll(() => { if ((globalThis as any).process?.env.PUZZLE_CAPACITY_REPORT) console.info('PUZZLE_CAPACITY='+JSON.stringify(report)); });
describe('adaptive catalog capacity', () => {
    for (const band of ['A','B','C','D','E'] as const) for (const subtraction of [false,true]) for (const tier of [1,2,3] as const) {
        it(`${band} subtract=${subtraction} tier=${tier}`, () => {
            const p = { ...bandProfile(band, tier), subtraction };
            const counts = { bridge: bridgePool(p).length, sequence: sequencePool(p).length, balance: balancePool(p).length,
                truth: truthPool(p).length, sum6: sumPool(p,6).length,
                flow2: flowPool(p,2).length, flow3: flowPool(p,3).length, bell:bellPool(p).length, reverse:reversePool(p,true).length, current:currentPool(p).length, routing:routingPool(p).length };
            report.push({band, subtraction, tier, counts});
            for (const [kind,count] of Object.entries(counts)) expect(count, `${kind}: ${JSON.stringify(counts)}`).toBeGreaterThanOrEqual(20);
        });
    }
    it('rejects undersized catalogs and invalid random sources without fixed fallbacks', () => {
        expect(()=>pickPuzzle([])).toThrow();
        expect(()=>pickPuzzle(Array.from({length:19}))).toThrow();
        for (const value of [-1,1,NaN,Infinity]) expect(()=>pick([1],()=>value)).toThrow();
    });
    it('a seeded large sample matches the independent uniform draw, including occasional repeats', () => {
        const pool=Array.from({length:20},(_,i)=>i),rng=seededRandom(402),counts=pool.map(()=>0);
        let previous=-1,repeats=0;
        for(let i=0;i<100000;i++){const n=pickPuzzle(pool,rng);counts[n]++;if(n===previous)repeats++;previous=n;}
        expect(repeats/99999).toBeGreaterThan(0.045);expect(repeats/99999).toBeLessThan(0.055);
        expect(Math.max(...counts)/100000).toBeLessThan(0.055);
    });
    it('uniform sampler exposes each candidate with equal interval width', () => {
        const pool = Array.from({length:20},(_,i)=>i);
        pool.forEach((_,i)=>expect(pick(pool,()=> (i+0.5)/20)).toBe(i));
    });
});
