import type { BandId } from '../types';
import type { PuzzleProfile, PuzzleRng } from '../types/puzzles';
import { asProfile, drawBell } from './puzzles/WaterPuzzleCatalog';
import { allowsStep } from './puzzles/PuzzleDifficulty';
/** Attempts/stages no longer seed content. Each new allocation draws independently. */
export function underwaterBellChallenge(profile: BandId | PuzzleProfile, _attempt = 0, _notes = 0, rng: PuzzleRng = Math.random) {
    return drawBell(asProfile(profile),rng);
}
export type PearlFlowChallenge=ReturnType<typeof underwaterBellChallenge>;
export function evaluatePearlFlow(c:PearlFlowChallenge, selected:Array<number|null>) {
    const values=[c.start];
    let valid=selected.length===2 && new Set(selected).size===2;
    for(const index of selected) {
        if(index===null || !Number.isInteger(index) || c.cards[index]===undefined){valid=false;break;}
        const start=values[values.length-1],delta=c.cards[index];
        valid &&= allowsStep(c.profile,start,delta); values.push(start+delta);
    }
    return {values,valid,correct:valid && values.length===3 && values[2]===c.target};
}
