import { describe, expect, it } from 'vitest';
import { underwaterBellChallenge, evaluatePearlFlow } from '../UnderwaterBellProblems';
import { underwaterWordCipher } from '../UnderwaterWordCipher';
import { bandProfile, allowsStep } from '../puzzles/PuzzleDifficulty';
import { seededRandom } from '../puzzles/PuzzleRandom';

describe('generated pearl-flow and cipher', () => {
    for (const band of ['A','B','C','D','E'] as const) it(`${band}: independent valid solutions and distinct clue values`, () => {
        const p=bandProfile(band),rng=seededRandom(984);
        for(let sample=0;sample<100;sample++) {
            const c=underwaterBellChallenge(p,0,0,rng);
            const solutions:number[][]=[];
            for(let i=0;i<c.cards.length;i++) for(let j=0;j<c.cards.length;j++) {
                if(i===j)continue;
                const middle=c.start+c.cards[i],end=middle+c.cards[j];
                if(allowsStep(p,c.start,c.cards[i]) && allowsStep(p,middle,c.cards[j]) && end===c.target)solutions.push([i,j]);
            }
            expect(solutions).toEqual(c.solutions);
            expect(solutions.length).toBeGreaterThan(0);
            for(const solution of solutions)expect(evaluatePearlFlow(c,solution).correct).toBe(true);
            expect(evaluatePearlFlow(c,[0,0]).correct).toBe(false);
            expect(evaluatePearlFlow(c,[null,null]).correct).toBe(false);
            const clues=underwaterWordCipher('PERLA',p,false,rng);
            expect(new Set(clues.map(c=>c.value)).size).toBe(5);
            expect([...clues].sort((a,b)=>a.value-b.value).map(c=>c.letter).join('')).toBe('PERLA');
            expect(clues.every(c=>allowsStep(p,c.problem.operand1,c.problem.operator==='+'?c.problem.operand2:-c.problem.operand2))).toBe(true);
        }
    });
});
