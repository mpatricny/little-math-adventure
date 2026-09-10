import type { BandId } from '../types';
import type { PuzzleProfile, PuzzleRng } from '../types/puzzles';
import { asProfile, deltaChoices } from './puzzles/WaterPuzzleCatalog';
import { flowPool } from './puzzles/PuzzleCatalog';
import { pickPuzzle, shuffle, rngFrom } from './puzzles/PuzzleRandom';
export function underwaterPumpChallenge(profile:BandId|PuzzleProfile, random?:number|PuzzleRng) {
    const p=asProfile(profile),rng=rngFrom(random), readings=[...pickPuzzle(flowPool(p,3),rng).values];
    const options=readings.slice(1).map((target,i)=>{
        const change=target-readings[i];return shuffle([change,...shuffle(deltaChoices(p).filter(n=>n!==change),rng).slice(0,3)],rng);
    });
    const solution=options.map((v,i)=>v.indexOf(readings[i+1]-readings[i]));
    const offsets=shuffle([1,2,3],rng);
    const initial=solution.map((value,i)=>(value+offsets[i])%options[i].length);
    return {readings,options,solution,initial};
}
export function evaluatePump(c:ReturnType<typeof underwaterPumpChallenge>,selected:number[]) {
    const values=[c.readings[0]];
    selected.forEach((n,i)=>values.push(values[i]+(c.options[i]?.[n]??NaN)));
    return {values,correct:selected.length===3 && values.every((v,i)=>v===c.readings[i])};
}
