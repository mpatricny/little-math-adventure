import type { PuzzleProfile, PuzzleRng } from '../../types/puzzles';
import { cachedPool, flowPool } from './PuzzleCatalog';
import { allowsStep, bandProfile } from './PuzzleDifficulty';
import { integers, pickPuzzle, shuffle } from './PuzzleRandom';
import type { BandId } from '../../types';
export const asProfile = (p: BandId | PuzzleProfile): PuzzleProfile => typeof p === 'string' ? bandProfile(p) : p;
export function deltaChoices(p: PuzzleProfile): number[] { return integers(p.max * (p.subtraction ? 2 : 1)).map(n => n - (p.subtraction ? p.max : 0)); }
export function bellSolutions(p: PuzzleProfile, start: number, target: number, cards: readonly number[]): [number, number][] {
    const result: [number, number][] = [];
    cards.forEach((a, i) => cards.forEach((b, j) => {
        if (i !== j && allowsStep(p,start,a) && allowsStep(p,start+a,b) && start+a+b === target) result.push([i,j]);
    })); return result;
}
export function bellPool(p: PuzzleProfile) {
    return cachedPool('bell',p,()=>{
        const pool: {start:number;target:number;cards:number[]}[] = [];
        const domain=deltaChoices(p);
        for (const flow of flowPool({ ...p, tier: Math.max(2, p.tier) as 2 | 3 },2)) {
            if (flow.changes[0] === flow.changes[1]) continue;
            for(let shift=0;shift<Math.min(domain.length,6);shift++) {
                const cards=[...flow.changes];
                for(let i=0; i<domain.length && cards.length < 4; i++) {
                    const n=domain[(i+shift)%domain.length]; if(!cards.includes(n)) cards.push(n);
                }
                cards.sort((a,b)=>a-b); pool.push({start:flow.start,target:flow.values[2],cards});
            }
        }
        return pool;
    },c=>JSON.stringify([c.start,c.target,bellSolutions(p,c.start,c.target,c.cards).map(pair=>pair.map(i=>c.cards[i]))]));
}
export function drawBell(p: PuzzleProfile, rng: PuzzleRng) {
    const c=pickPuzzle(bellPool(p),rng), cards=shuffle(c.cards,rng);
    return {start:c.start,target:c.target,limit:p.max,cards,profile:p,solutions:bellSolutions(p,c.start,c.target,cards)};
}
export function reversePool(p: PuzzleProfile, split:boolean) {
    return cachedPool(`reverse:${split}`,p,()=>{
        if(!split) return flowPool(p,2).map(f=>({start:f.start,changes:f.changes,targets:[f.values[2]]}));
        const result: {start:number;changes:number[];targets:number[]}[]=[];
        for(const start of integers(p.max)) for(const a of deltaChoices(p)) for(const b of deltaChoices(p)) {
            if(a!==b && allowsStep(p,start,a) && allowsStep(p,start,b)) result.push({start,changes:[a,b],targets:[start+a,start+b]});
        }return result;
    });
}
export interface CurrentBase {starts:number[];targets:number[];cards:number[];profile?:PuzzleProfile;solutions:number[][];}
export function currentSolutions(c: CurrentBase):number[][] {
    const solutions:number[][]=[];
    for(let i=0;i<c.cards.length;i++) for(let j=0;j<c.cards.length;j++) for(let k=0;k<c.cards.length;k++) {
        if(new Set([i,j,k]).size!==3)continue;
        const plan=[c.cards[i],c.cards[j],c.cards[k]];
        if(c.starts.every((s,n)=>s+plan[0]+plan[n+1]===c.targets[n]
            && (c.profile ? allowsStep(c.profile,s,plan[0]) && allowsStep(c.profile,s+plan[0],plan[n+1]) : s+plan[0]>=0 && c.targets[n]>=0)))solutions.push([i,j,k]);
    } return solutions;
}
export function currentPool(p:PuzzleProfile) {
    return cachedPool('current',p,()=>{
        const result:CurrentBase[]=[];
        // Two two-step paths sharing their first operation. Bounded by the finite flow pool.
        const flows=flowPool(p,2);
        for(const a of flows) {
            const candidates=flows.filter(b=>b.start!==a.start && b.changes[0]===a.changes[0] && new Set([a.changes[0],a.changes[1],b.changes[1]]).size===3);
            // Deterministic catalog sample; each final semantic candidate is sampled uniformly at runtime.
            for(let n=0;n<Math.min(candidates.length,8);n++) {
                const b=candidates[Math.floor(n*candidates.length/Math.min(candidates.length,8))];
                const cards=[a.changes[0],a.changes[1],b.changes[1]];
                for(const d of deltaChoices(p))if(!cards.includes(d) && cards.length<6)cards.push(d);
                cards.sort((x,y)=>x-y);
                const c={starts:[a.start,b.start],targets:[a.values[2],b.values[2]],cards,profile:p,solutions:[]};
                result.push(c);
            }
        }return result;
    },c=>JSON.stringify([c.starts,c.targets,currentSolutions(c).map(s=>s.map(i=>c.cards[i]))]));
}
export function drawCurrent(p:PuzzleProfile,rng:PuzzleRng):CurrentBase {
    const item=pickPuzzle(currentPool(p),rng), c={...item,cards:shuffle(item.cards,rng)};
    c.solutions=currentSolutions(c);return c;
}
