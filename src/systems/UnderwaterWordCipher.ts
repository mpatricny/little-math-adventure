import type { BandId, SubAtomId } from '../types';
import type { PuzzleProfile, PuzzleRng } from '../types/puzzles';
import { ProblemDatabase } from './ProblemDatabase';
import { asProfile } from './puzzles/WaterPuzzleCatalog';
import { allowsStep } from './puzzles/PuzzleDifficulty';
import { pick, shuffle } from './puzzles/PuzzleRandom';
export function underwaterWordCipher(word:string,profile:BandId|PuzzleProfile,postal=false,rng:PuzzleRng=Math.random) {
    const p=asProfile(profile), db=ProblemDatabase.getInstance(), bands:BandId[]=['A','B','C','D','E'];
    const pool=bands.slice(0,bands.indexOf(p.band)+1).flatMap(band=>(p.subtraction?[1,2]:[1]).flatMap(atom=>db.getProblemsForForm(`${band}${atom}` as SubAtomId,'result_unknown')))
        .filter(f=>allowsStep(p,f.operand1,f.operator==='+'?f.operand2:-f.operand2));
    const values=shuffle([...new Set(pool.map(f=>f.answer))],rng).slice(0,5).sort((a,b)=>a-b);
    const letters=Array.from(word.toUpperCase());
    if(letters.length!==5 || !/^[A-Z]+$/.test(word) || values.length!==5)throw new Error('Cipher requires five supported letters and five distinct values');
    return shuffle(letters.map((letter,i)=>{
        const value=values[i],problem=pick(pool.filter(f=>f.answer===value),rng);
        let display=`${problem.operand1} ${problem.operator==='-'?'−':'+'} ${problem.operand2}`;
        // Only use inverse representation when its operation is already unlocked.
        if(postal && p.subtraction && i%2===1) display=problem.operator==='+'
            ?`? − ${problem.operand2}\n= ${problem.operand1}`:`? + ${problem.operand2}\n= ${problem.operand1}`;
        const pearls=postal && i===0 && value>0 && value<=10 ? value:undefined;
        return {letter,problem,value,display,pearls};
    }),rng);
}
