import { describe, expect, it } from 'vitest';
import {
    ADVANCED_NODES, advancedChoices, advancedMaximum, advancedProblems, drawAdvancedExamKeys, getAdvancedProblem,
    type AdvancedNodeId,
} from '../AdvancedCurriculum';
import { ProblemDatabase } from '../ProblemDatabase';
import type { ProblemDefinition } from '../../types';

const db = ProblemDatabase.getInstance();
const nodes = Object.keys(ADVANCED_NODES) as AdvancedNodeId[];
const apply = (a: number, sign: string, b: number) => sign === '+' ? a + b : a - b;

function resolved(p: ProblemDefinition): [string, number] {
    const sign = p.operator === '-' ? '−' : '+';
    if (p.form === 'missing_part') return [`${p.operand1} ${sign} ${p.answer} = ${p.operand2}`, p.operand2];
    const tail = p.operator2 ? ` ${p.operator2 === '-' ? '−' : '+'} ${p.operand3}` : '';
    return [`${p.operand1} ${sign} ${p.operand2}${tail} = ${p.answer}`, p.answer];
}

describe('F–H arithmetic catalog', () => {
    it('resolves bounded arithmetic and four distinct in-range choices on every issued problem', () => {
        for (const p of advancedProblems()) {
            expect(db.getProblemByKey(p.key)).toBe(p);
            const max = advancedMaximum(p.subAtomId as AdvancedNodeId);
            const missing = p.form === 'missing_part';
            const middle = apply(p.operand1, p.operator, missing ? p.answer : p.operand2);
            const result = p.operator2 ? apply(middle, p.operator2, p.operand3!) : middle;
            expect(result, p.key).toBe(missing ? p.operand2 : p.answer);
            expect([p.operand1,p.operand2,p.operand3 ?? 0,middle,result].every(n => n >= 0 && n <= max)).toBe(true);
            const choices = db.generateChoices(p);
            expect(new Set(choices).size).toBe(4);
            expect(choices).toHaveLength(4);
            expect(choices).toContain(p.answer);
            expect(choices.every(n => Number.isInteger(n) && n >= 0 && n <= max)).toBe(true);
            if (p.subAtomId.startsWith('F') && [p.operand1,p.operand2,p.operand3 ?? 0,p.answer].every(n => n % 5 === 0)) {
                expect(choices.every(n => n % 5 === 0)).toBe(true);
            }
            if (p.subAtomId === 'G1' && p.advanced?.role === 'target') {
                expect(choices.filter(n => n > 20).length).toBeGreaterThanOrEqual(2);
                expect(p.operand2).toBeLessThanOrEqual(9);
            }
        }
    });

    it('pairs each introduction with distinct unscored tasks and unseen transfer opportunities', () => {
        expect(nodes).toHaveLength(12);
        for (const node of nodes) for (const stage of ADVANCED_NODES[node].stages) {
            const bridges = [stage.anchorKey,stage.transferKey,...stage.supportKeys].map(k => getAdvancedProblem(k)!);
            expect(bridges.every(p => p.advanced?.stageId === stage.id && p.advanced.role === 'bridge')).toBe(true);
            for (const p of bridges.slice(0,2)) expect(stage.demo, p.key).not.toContain(resolved(p)[0]);
            const unavailable = new Set([...stage.demo,...bridges.slice(0,2).map(p => resolved(p)[0])]);
            const unseen = db.getAllProblems(node).filter(p => p.advanced?.role === 'target'
                && p.advanced.stageId === stage.id && !unavailable.has(resolved(p)[0]));
            expect(unseen.length, node + stage.id).toBeGreaterThanOrEqual(2);
        }
    });

    it('uses the full legal sets for addition and subtraction up to thirty', () => {
        const target = (id: AdvancedNodeId) => db.getAllProblems(id).filter(p => p.advanced!.role === 'target');
        const pairs = (id: AdvancedNodeId) => new Set(target(id).map(p => `${p.operand1},${p.operand2}`));
        const g1 = pairs('G1'), g2 = pairs('G2'), g3 = pairs('G3');
        for (let a = 11; a <= 30; a++) for (let b = 1; b <= 30; b++) {
            expect(g1.has(`${a},${b}`)).toBe(b < 10 && a + b > 20 && a + b <= 30);
            expect(g2.has(`${a},${b}`)).toBe(b > 10 && a + b <= 30);
            expect(g3.has(`${a},${b}`)).toBe(a > 20 && b <= a);
        }
    });

    it('transfers single changes to unfamiliar bases and covers all units-pair patterns in H2/H3', () => {
        const target = (id: AdvancedNodeId) => db.getAllProblems(id).filter(p => p.advanced!.role === 'target');
        const h1 = target('H1');
        for (const sign of ['+', '-']) {
            const units = h1.filter(p => p.advanced!.stageId === 'other-units' && p.operator === sign);
            expect(new Set(units.map(p => p.operand2))).toEqual(new Set([1,2,3,4,6,7,8,9]));
            const crosses = (p: ProblemDefinition) => Math.floor(p.operand1 / 10) !== Math.floor(p.answer / 10);
            for (const changing of [true,false]) {
                const bases = units.filter(p => crosses(p) === changing);
                expect(new Set(bases.map(p => Math.floor(p.operand1 / 10))).size).toBeGreaterThanOrEqual(6);
            }
        }
        for (const id of ['H2','H3'] as const) for (const group of [0,1]) {
            const problems = target(id).filter(p => p.advanced!.group === group);
            const digits = new Set(problems.map(p => `${p.operand1 % 10},${p.operand2 % 10}`));
            for (let left = 0; left < 10; left++) for (let right = 0; right < 10; right++) {
                const needsExchange = id === 'H2' ? left + right >= 10 : left < right;
                expect(digits.has(`${left},${right}`)).toBe(needsExchange === (group === 1));
            }
            expect(new Set(problems.map(p => `${Math.floor(p.operand1/10)},${Math.floor(p.operand2/10)}`)).size).toBeGreaterThanOrEqual(35);
            const newSkill = problems.filter(p => p.operand1 % 10 && p.operand2 % 10 && ![15,25].includes(p.operand2));
            expect(newSkill.length / problems.length).toBeGreaterThan(0.75);
            expect(problems.length).toBeLessThanOrEqual(400);
        }
    });

    it('builds the sub-atom, gate and challenge sizes with both groups and unique target variants', () => {
        for (const node of nodes) for (const count of [3,4,8,10]) {
            const keys = drawAdvancedExamKeys(node,count);
            const problems = keys.map(key => getAdvancedProblem(key)!);
            expect(keys.length).toBe(count);
            expect(new Set(keys).size).toBe(count);
            expect(new Set(problems.map(p => resolved(p)[0])).size).toBe(count);
            expect(problems.every(p => p.advanced?.role === 'target' && p.subAtomId === node)).toBe(true);
            const first = problems.filter(p => p.advanced!.group === 0).length;
            expect(Math.abs(first - (count - first))).toBeLessThanOrEqual(1);
        }
    });

    it('covers representative boundaries, operation directions, carrying and borrowing on eight-item exams', () => {
        for (let deal = 0; deal < 20; deal++) {
            const draw = (node: AdvancedNodeId) => drawAdvancedExamKeys(node,8).map(k => getAdvancedProblem(k)!);
            const f2 = draw('F2');
            for (const group of [0,1]) {
                expect(new Set(f2.filter(p => p.advanced!.group === group).map(p => p.operator)).size).toBe(2);
            }
            const f3 = draw('F3');
            expect(f3.some(p => p.answer === 100)).toBe(true);
            expect(f3.some(p => Math.min(p.operand1,p.answer)<50 && Math.max(p.operand1,p.answer)>50)).toBe(true);
            expect(draw('G2').some(p => p.answer === 30)).toBe(true);
            expect(draw('H3').some(p => p.operand1 === 100)).toBe(true);
            for (const p of draw('H2')) expect(p.operand1 % 10 + p.operand2 % 10 >= 10).toBe(p.advanced!.group === 1);
            for (const p of draw('H3')) expect(p.operand1 % 10 < p.operand2 % 10).toBe(p.advanced!.group === 1);
        }
    });

    it('offers credible confusions for the worked boundary and missing-part examples', () => {
        const choices = (prefix: string) => advancedChoices([...advancedProblems()].find(p => p.key === prefix)!);
        expect(choices('F2:fifteen:target:35+15').sort((a,b) => a-b)).toEqual([35,40,45,50]);
        expect(choices('G4:missing:target:25-?8').sort((a,b) => a-b)).toEqual([6,7,8,9]);
        expect(choices('F4:two-steps:target:65+25-10')).toContain(90);
    });
});
