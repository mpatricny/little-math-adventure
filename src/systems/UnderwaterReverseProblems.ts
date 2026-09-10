import type { BandId } from '../types';
import type { PuzzleProfile, PuzzleRng } from '../types/puzzles';
import { asProfile, reversePool } from './puzzles/WaterPuzzleCatalog';
import { allowsStep } from './puzzles/PuzzleDifficulty';
import { choices } from './puzzles/PuzzleCatalog';
import { pickPuzzle } from './puzzles/PuzzleRandom';
export function underwaterReverseChallenge(profile:BandId|PuzzleProfile,stage:number,rng:PuzzleRng=Math.random) {
    const p=asProfile(profile),index=Math.max(0,Math.min(2,stage)),split=index===2;
    const item=pickPuzzle(reversePool(p,split),rng),cards=choices(item.start,p,6,rng);
    return {...item,stage:index,split,cards,answerIndex:cards.indexOf(item.start),max:p.max,profile:p};
}
export type ReverseChallenge=ReturnType<typeof underwaterReverseChallenge>;
export function evaluateReverse(c:ReverseChallenge,selected:number|null) {
    const start=selected===null ? NaN:c.cards[selected]??NaN;
    const middle=start+c.changes[0],values=c.split?c.changes.map(d=>start+d):[middle,middle+c.changes[1]];
    const targets=c.split?values:[values[1]];
    const valid=allowsStep(c.profile,start,c.changes[0]) && allowsStep(c.profile,c.split?start:middle,c.changes[1]);
    return {start,values,correct:valid && targets.every((v,i)=>v===c.targets[i])};
}
