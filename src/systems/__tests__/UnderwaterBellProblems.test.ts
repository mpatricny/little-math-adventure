import { describe, expect, it } from 'vitest';
import { underwaterBellChallenge, evaluatePearlFlow, type PearlFlowChallenge } from '../UnderwaterBellProblems';
import { underwaterWordCipher } from '../UnderwaterWordCipher';
import { bandProfile, allowsStep } from '../puzzles/PuzzleDifficulty';
import { seededRandom } from '../puzzles/PuzzleRandom';
import { bellPool, bellSolutions } from '../puzzles/WaterPuzzleCatalog';
import tuning from '../../../public/assets/data/puzzles/tuning.json';

describe('bell choices require planning both steps', () => {
    for (const band of ['A','B','C','D','E'] as const) for (const subtraction of [false,true]) {
        for (const tier of [1,2,3] as const) it(`${band}, subtraction=${subtraction}, tier=${tier}: four usable choices and enough distinct challenges`, () => {
            const profile = { ...bandProfile(band,tier), subtraction };
            const pool = bellPool(profile);
            const semantic = new Set<string>();
            for (const challenge of pool) {
                const { start, target, cards } = challenge;
                expect(cards).toHaveLength(4);
                expect(new Set(cards).size).toBe(4);
                for (const [index, step] of cards.entries()) {
                    expect(allowsStep(profile,start,step)).toBe(true);
                    expect(cards.some((next,j) => j !== index && allowsStep(profile,start+step,next))).toBe(true);
                    if (subtraction) {
                        expect(step).not.toBe(0);
                        expect(step).not.toBe(target-start);
                    }
                }
                const solutions = bellSolutions(profile,start,target,cards);
                expect(solutions.length).toBeGreaterThan(0);
                semantic.add(JSON.stringify([start,target,solutions.map(pair => pair.map(i => cards[i]))]));
            }
            // Button order and alternate distractors cannot masquerade as new maths.
            expect(semantic.size).toBe(pool.length);
            expect(semantic.size).toBeGreaterThanOrEqual(tuning.minimumPoolSize);
        });
    }

    it('replaces the photographed 6→2 absurd distractors with nearby usable steps', () => {
        const profile = bandProfile('D');
        const challenge = bellPool(profile).find(c => c.start === 6 && c.target === 2
            && c.cards.includes(-1) && c.cards.includes(-3));
        expect(challenge?.cards).toEqual([-3,-2,-1,1]);
        const c = { ...challenge!, profile, limit: profile.max,
            solutions: bellSolutions(profile,challenge!.start,challenge!.target,challenge!.cards) };
        const at = (step: number) => c.cards.indexOf(step);
        expect(evaluatePearlFlow(c,[at(-1),at(-3)])).toMatchObject({ correct:true, values:[6,5,2] });
        expect(evaluatePearlFlow(c,[at(-3),at(-1)])).toMatchObject({ correct:true, values:[6,3,2] });
        expect(evaluatePearlFlow(c,[at(-3),at(-2)])).toMatchObject({ valid:true, correct:false, values:[6,3,1] });
    });

    it('fresh draws from the old failing seed no longer offer illegal first steps', () => {
        // Before this fix D/tier2 + seed581 drew 6→2 with [-15,-14,-1,-3].
        const c = underwaterBellChallenge('D',0,0,seededRandom(581));
        expect(c.cards.every(step => allowsStep(c.profile,c.start,step))).toBe(true);
    });

    it('keeps a restored old payload and its selected indices intact', () => {
        const saved: PearlFlowChallenge = { start:6, target:2, limit:20, cards:[-15,-14,-1,-3],
            profile:bandProfile('D'), solutions:[[2,3],[3,2]] };
        const selected = [2,3];
        const original = structuredClone({ saved, selected });
        expect(evaluatePearlFlow(saved,selected)).toEqual({ values:[6,5,2], valid:true, correct:true });
        expect(evaluatePearlFlow(saved,[3,2])).toMatchObject({ values:[6,3,2], correct:true });
        expect(evaluatePearlFlow(saved,[0,2])).toMatchObject({ valid:false, correct:false });
        expect({ saved, selected }).toEqual(original);
    });

    it('retains +0 for addition beginners while requiring two different occupied slots', () => {
        const profile = { ...bandProfile('A'), subtraction:false };
        const challenge = bellPool(profile).find(c => c.cards.includes(0)
            && bellSolutions(profile,c.start,c.target,c.cards).some(pair => pair.some(i => c.cards[i] === 0)))!;
        const c = { ...challenge, profile, limit:profile.max,
            solutions:bellSolutions(profile,challenge.start,challenge.target,challenge.cards) };
        const solution = c.solutions.find(pair => pair.some(i => c.cards[i] === 0))!;
        expect(evaluatePearlFlow(c,solution).correct).toBe(true);
        expect(evaluatePearlFlow(c,[solution[0]]).correct).toBe(false);
        expect(evaluatePearlFlow(c,[solution[0],null]).correct).toBe(false);
        expect(evaluatePearlFlow(c,[solution[0],solution[0]]).correct).toBe(false);
    });
});

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
