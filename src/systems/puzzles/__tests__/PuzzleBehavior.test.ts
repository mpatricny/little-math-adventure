import { describe, expect, it } from 'vitest';
import { allowsStep, bandProfile, masteryPuzzleProfile, sharedPuzzleProfile } from '../PuzzleDifficulty';
import { flowPool, bridgePool, sumPuzzle, sequencePuzzle, balancePuzzle } from '../PuzzleCatalog';
import { seededRandom } from '../PuzzleRandom';
import { wordPools } from '../WordPuzzles';
import { lightPool, lightSolutions, traceUnderwaterLight, underwaterLightHint } from '../../UnderwaterLightPuzzle';
import { underwaterBellChallenge, evaluatePearlFlow } from '../../UnderwaterBellProblems';
import { underwaterCurrentChallenge, evaluateCurrents } from '../../UnderwaterCurrentProblems';
import { underwaterPumpChallenge, evaluatePump } from '../../UnderwaterPumpProblems';
import { underwaterReverseChallenge, evaluateReverse } from '../../UnderwaterReverseProblems';
import type { MasteryData } from '../../../types';

describe('adaptive generated puzzles',()=>{
    for(const band of ['A','B','C','D','E'] as const) for(const subtraction of [true,false])it(`${band} +/-=${subtraction}: 1000 seeds stay solvable and within skill limits`,()=>{
        const p={...bandProfile(band),subtraction};
        expect(bridgePool(p).length).toBeGreaterThanOrEqual(20);
        for(let seed=0;seed<1000;seed++) {
            const rng=seededRandom(seed),sum=sumPuzzle(p,6,rng);
            expect(sum.values.length).toBe(6);
            let found=false;
            for(let a=0;a<6;a++)for(let b=a+1;b<6;b++)for(let c=b+1;c<6;c++)if(sum.values[a]+sum.values[b]+sum.values[c]===sum.target)found=true;
            expect(found).toBe(true);
            const seq=sequencePuzzle(p,rng);
            expect(seq.sequence.map((v,i)=>v??seq.answers[seq.holes.indexOf(i)])).toEqual(seq.full);
            const balance=balancePuzzle(p,rng);
            const evaluate=(text:string)=>{const [a,op,b]=text.split(' ');return op==='+'?Number(a)+Number(b):Number(a)-Number(b);};
            expect(evaluate(balance.left.replace('?',String(balance.answer)))).toBe(evaluate(balance.right));
            const bell=underwaterBellChallenge(p,seed,seed%3,rng);
            expect(bell.solutions.every(s=>evaluatePearlFlow(bell,s).correct)).toBe(true);
            const current=underwaterCurrentChallenge(p,rng);
            expect(current.solutions.length).toBeGreaterThan(0);
            expect(current.solutions.every(s=>evaluateCurrents(current,s).correct)).toBe(true);
            const pump=underwaterPumpChallenge(p,rng);expect(evaluatePump(pump,pump.solution).correct).toBe(true);
            const reverse=underwaterReverseChallenge(p,seed%3,rng);expect(evaluateReverse(reverse,reverse.answerIndex).correct).toBe(true);
        }
        for(const flow of flowPool(p,3))expect(flow.changes.every((d,i)=>allowsStep(p,flow.values[i],d))).toBe(true);
    });
    it('has 25 non-paraphrased riddles, 25 words and at least 20 solvable optical boards',()=>{
        expect(new Set(wordPools.riddles.map(r=>r.id)).size).toBeGreaterThanOrEqual(20);
        expect(wordPools.riddles.every(r=>/^[A-Z]{4}$/.test(r.answer))).toBe(true);
        expect(new Set(wordPools.cipherWords).size).toBeGreaterThanOrEqual(20);
        expect(wordPools.cipherWords.every(w=>/^[A-Z]{5}$/.test(w))).toBe(true);
        expect(lightPool().length).toBeGreaterThanOrEqual(20);
        for(const c of lightPool()) {
            const solutions=lightSolutions(c);expect(solutions.length).toBeGreaterThan(0);
            let turns=[...c.initial];
            for(let i=0;i<c.mirrors.length;i++){const hint=underwaterLightHint(turns,c);if(hint)turns[hint.index]=hint.turn;}
            expect(traceUnderwaterLight(turns,c).solved).toBe(true);
        }
    });
    it('uses actual unlocked skills, including all-mastered and mixed co-op profiles',()=>{
        const bands=['A','B','C','D','E'];
        const data={bands:Object.fromEntries(bands.map(b=>[b,{state:b==='A'?'training':'locked'}])),subAtoms:{A1:{state:'training'}}} as unknown as MasteryData;
        expect(masteryPuzzleProfile(data)).toMatchObject({band:'A',max:5,subtraction:false});
        bands.forEach(b=>data.bands[b as keyof typeof data.bands].state='mastery');
        expect(masteryPuzzleProfile(data).band).toBe('E');
        expect(sharedPuzzleProfile([bandProfile('E'),{...bandProfile('A'),subtraction:false}])).toMatchObject({max:5,subtraction:false,crossing:false});
    });
});
