import type { BandId, ProblemDefinition, SubAtomNumber } from '../types';

export type AdvancedNodeId = `${'F' | 'G' | 'H'}${SubAtomNumber}`;
type Group = 0 | 1;
type Sign = '+' | '-';

export interface AdvancedStage {
    id: string;
    group: Group;
    demo: readonly [string, string];
    demoExpressions: readonly string[];
    directions: readonly Sign[];
    anchorKey: string;
    transferKey: string;
    supportKeys: readonly string[];
}

interface NodeContent {
    label: string;
    masteryMs: number;
    stages: AdvancedStage[];
}

// Each row is a finite family: two worked examples, two related issued tasks,
// then optional simpler steps and a bank of unseen targets. A question mark
// hides the second operand (e.g. 25-?8 means 25 − □ = 17).
interface StageSource {
    id: string;
    group: Group;
    demo: [string, string];
    pair: [string, string];
    support: string;
    targets: string;
}
function stage(id: string, group: Group, demo: [string,string], pair: [string,string],
    support: string, targets: string): StageSource {
    return { id, group, demo, pair, support, targets };
}

const sources: Record<AdvancedNodeId, [string, number, StageSource[]]> = {
    F1: ['Celé desítky', 5000, [
        stage('add-tens', 0, ['1+2','10+20'], ['10+10','30+10'], '10+10',
            '10+10 10+20 20+10 10+30 20+20 30+10 10+40 20+30 30+20 40+10'),
        stage('subtract-tens', 1, ['20+10','30-10'], ['40-10','50-10'], '20-10',
            '20-10 30-10 30-20 40-10 40-20 40-30 50-10 50-20 50-30 50-40'),
    ]],
    F2: ['Pětky do 50', 5500, [
        stage('add-five', 0, ['0+5','10+5'], ['5+5','20+5'], '10+5', '10+5 20+5 30+5 40+5'),
        stage('fill-five', 0, ['10+5','15+5'], ['25+5','35+5'], '10+5', '5+5 15+5 25+5 35+5 45+5'),
        stage('subtract-five', 0, ['15+5','20-5'], ['35-5','30-5'], '15-5',
            '10-5 15-5 20-5 25-5 30-5 35-5 40-5 45-5 50-5'),
        stage('fifteen', 1, ['20+10+5','20+15'], ['15+10+5','15+15'], '35+10 45+5',
            '5+15 10+15 15+15 20+15 25+15 30+15 35+15 20-15 25-15 30-15 35-15 40-15 45-15 50-15'),
        stage('twenty-five', 1, ['15+20+5','15+25'], ['10+20+5','10+25'], '15+20 35+5',
            '5+25 10+25 15+25 20+25 25+25 30-25 35-25 40-25 45-25 50-25'),
    ]],
    F3: ['Přes padesát', 6000, [
        stage('tens', 0, ['20+20','40+20'], ['30+20','50+20'], '30+20',
            '40+20 30+30 40+30 20+50 30+60 50+40 60+40 70+30 80+20 90+10 60-20 70-30 80-40 90-50 100-60 70-20 80-30 100-20 80-10'),
        stage('five', 1, ['35+5','55+5'], ['45+5','50+5'], '40+5',
            '50+5 55+5 60+5 65+5 75+5 85+5 95+5 55-5 60-5 65-5 70-5 85-5 95-5 100-5'),
        stage('larger-fives', 1, ['35+15','65+15'], ['40+15','60+15'], '60+10 70+5',
            '40+15 45+15 50+15 65+15 75+15 85+15 30+25 35+25 55+25 75+25 60-15 65-15 90-15 55-25 70-25 85-25 95-25 100-25'),
    ]],
    F4: ['Doplň a spoj', 7000, [
        stage('missing', 0, ['60-35','35+?25'], ['25+?15','45+?15'], '20+15',
            '35+?25 25+?15 45+?15 55+?25 65+?15 75+?25 55-?15 65-?25 85-?25 90-?15 95-?25 100-?15'),
        stage('two-steps', 1, ['30+25','30+25+15'], ['25+15','25+15+10'], '30+25 55+15',
            '30+25+15 20+25+10 25+15+10 35+15+25 65+25-10 55+25-15 45+15-25 90-25+10 75-15+25 80-25-15 70-15-25 50+25+25'),
    ]],
    G1: ['Přičti jednotky', 6000, [
        stage('units', 0, ['14+3','24+3'], ['12+4','22+4'], '4+3',
            '20+2 20+4 20+7 21+3 22+4 23+3 24+3 25+2 25+4 26+3 26+4 27+3 28+2'),
        stage('over-twenty', 1, ['7+8','17+8'], ['18+2','18+5'], '18+2 20+3',
            '13+8 14+7 14+9 15+7 15+9 16+5 16+7 16+9 17+6 17+8 18+4 18+7 19+5 19+9'),
    ]],
    G2: ['Přičti obě části', 6500, [
        stage('eleven-thirteen', 0, ['14+3','14+13'], ['12+2','12+12'], '14+10 24+3',
            '11+11 12+11 13+11 15+11 17+11 19+11 11+12 14+12 15+12 18+12 11+13 12+13 14+13 17+13'),
        stage('fourteen-nineteen', 1, ['12+4','12+14'], ['13+5','13+15'], '12+10 22+4',
            '11+14 12+14 13+14 15+14 16+14 11+15 13+15 15+15 12+16 14+16 12+17 13+17 11+18 12+18 11+19'),
    ]],
    G3: ['Odčítej do 30', 7000, [
        stage('subtract-units', 0, ['14-3','24-3'], ['17-3','27-3'], '14-3',
            '23-2 24-2 24-3 25-2 26-3 26-4 27-3 28-2 28-6 29-3 29-7'),
        stage('below-twenty', 0, ['17+8','25-8'], ['23-3','23-6'], '25-5 20-3',
            '21-4 21-6 22-4 22-7 23-5 23-8 24-7 24-8 25-8 26-9 27-9 28-9'),
        stage('two-digit', 1, ['27-4','27-14'], ['26-3','26-13'], '24-10 14-6',
            '21-12 22-13 23-12 24-16 25-13 25-18 26-13 27-14 27-18 28-16 29-12 30-14 30-18'),
    ]],
    G4: ['Doplň a spoj', 7500, [
        stage('missing', 0, ['25-17','17+?8'], ['16+?7','18+?7'], '16+7',
            '17+?8 16+?7 18+?7 19+?5 14+?9 18+?9 23-?7 25-?8 26-?7 24-?6 27-?9 22-?8 30-?14'),
        stage('two-steps', 1, ['16+7','16+7+4'], ['14+8','14+8+3'], '16+7 23+4',
            '16+7+4 14+8+3 17+4+6 18+5-7 19+6-9 17+8-6 15+6+9 28-9+6 26-8+5 25-8+9 29-7-4 27-8-5'),
    ]],
    H1: ['Známé kroky', 6500, [
        stage('tens', 0, ['40+20','43+20'], ['50+20','54+20'], '40+20',
            '32+20 43+20 47+30 54+20 61+30 68+10 73+20 87+10 76-30 62-20 49-10 81-40 57-30 94-50'),
        stage('fives', 0, ['65+15','68+15'], ['55-15','57-15'], '68+10 78+5',
            '42+5 68+5 73+5 46+15 57+15 68+25 54+25 86-5 92-5 83-15 72-15 93-25 67-25'),
        stage('other-units', 1, ['17+8','47+8'], ['25-7','75-7'], '47+3 50+5',
            '46+7 47+8 56+8 69+4 78+6 92+8 37+2 42+6 86+3 54-8 64-6 75-7 83-7 91-6 87-4 69-3'),
    ]],
    H2: ['Sečti dvě čísla', 7500, [
        stage('without-carry', 0, ['42+20','42+23'], ['53+20','53+24'], '42+20 62+3',
            '32+24 41+37 42+23 43+26 52+34 53+24 61+28 64+22 71+18 72+16 82+17'),
        stage('with-carry', 1, ['42+23','48+23'], ['54+24','58+24'], '48+20 68+3',
            '38+24 48+23 36+27 47+26 48+34 56+27 58+34 64+28 76+18 68+32 47+53 57+43'),
    ]],
    H3: ['Odečti dvě čísla', 8000, [
        stage('without-borrow', 0, ['67-20','67-23'], ['76-30','76-32'], '67-20 47-3',
            '46-23 57-24 67-23 68-34 76-32 78-36 82-41 86-42 89-57 94-32 98-46'),
        stage('with-borrow', 1, ['67-23','62-27'], ['74-32','74-38'], '62-20 42-7',
            '42-27 51-24 62-27 63-48 71-34 72-38 74-38 81-36 83-47 92-56 100-24 100-37'),
    ]],
    H4: ['Doplň a spoj', 8000, [
        stage('missing', 0, ['73-48','48+?25'], ['37+?26','47+?26'], '48+20 68+5',
            '36+?27 37+?26 47+?26 48+?25 59+?32 68+?32 62-?27 72-?34 74-?28 81-?36 93-?47 100-?26'),
        stage('two-steps', 1, ['36+27','36+27-14'], ['42+23','42+23-14'], '36+27 63-14',
            '36+27-14 42+23-14 46+27-18 38+26+14 43+29+17 54+27+19 82-36+17 75-28+34 93-46+18 87-29-16 79-34-18'),
    ]],
};

const problemsByKey = new Map<string, ProblemDefinition>();
const targetsByNode = new Map<AdvancedNodeId, ProblemDefinition[]>();

function apply(a: number, op: Sign, b: number): number {
    return op === '+' ? a + b : a - b;
}

function decode(node: AdvancedNodeId, source: StageSource, role: 'target' | 'bridge', expression: string): ProblemDefinition {
    const match = /^(\d+)([+-])(\??)(\d+)(?:([+-])(\d+))?$/.exec(expression);
    if (!match) throw new Error(`Invalid advanced curriculum expression: ${expression}`);
    const [, aText, op, missing, bText, secondOp, cText] = match;
    const a = Number(aText), b = Number(bText);
    const sign = op as Sign;
    const middle = apply(a, sign, b);
    const c = cText === undefined ? undefined : Number(cText);
    const result = c === undefined ? middle : apply(middle, secondOp as Sign, c);
    const key = `${node}:${source.id}:${role}:${expression}`;
    const maximum = advancedMaximum(node);
    if ([a, b, c ?? 0, middle, result].some(value => value < 0 || value > maximum) || (missing && c !== undefined)) {
        throw new Error(`Out of range advanced curriculum expression: ${key}`);
    }
    return {
        key, bandId: node[0] as BandId, subAtomId: node, form: missing ? 'missing_part' : 'result_unknown',
        operand1: a, operator: sign, operand2: missing ? result : b, answer: missing ? b : result,
        ...(c === undefined ? {} : { operator2: secondOp as Sign, operand3: c }),
        advanced: { group: source.group, stageId: source.id, role, direction: sign, family: `${source.id}:${sign}` },
    };
}

function workedExample(p: ProblemDefinition): string {
    const sign = (op: string) => op === '-' ? '−' : '+';
    if (p.form === 'missing_part') return `${p.operand1} ${sign(p.operator)} ${p.answer} = ${p.operand2}`;
    const tail = p.operator2 ? ` ${sign(p.operator2)} ${p.operand3}` : '';
    return `${p.operand1} ${sign(p.operator)} ${p.operand2}${tail} = ${p.answer}`;
}

export function advancedMaximum(node: AdvancedNodeId): number {
    if (node.startsWith('G')) return 30;
    return node === 'F1' || node === 'F2' ? 50 : 100;
}

interface NumericPair { a: number; b: number; op: Sign }
type FamilyRule = (a: number, op: Sign, b: number, result: number) => string | undefined;

// The intermediate bands express real operand constraints. In particular G1
// crosses *twenty*, whereas H2/H3 classify the operation on the units figures.
const pairFamilies: Partial<Record<AdvancedNodeId, FamilyRule>> = {
    G1(a, op, b, result) {
        if (op !== '+' || a <= 10 || b < 1 || b > 9 || result <= 20) return;
        return a >= 20 ? 'units' : 'over-twenty';
    },
    G2(a, op, b) {
        if (op !== '+' || a <= 10 || b < 11 || b > 19) return;
        return b <= 13 ? 'eleven-thirteen' : 'fourteen-nineteen';
    },
    G3(a, op, b, result) {
        if (op !== '-' || a <= 20 || b < 1) return;
        if (b >= 10) return 'two-digit';
        return result >= 20 ? 'subtract-units' : 'below-twenty';
    },
    H1(a, _op, b) {
        if (a <= 30 || b < 1) return;
        if (b < 10 && b !== 5) return 'other-units';
        if (a % 5 === 0) return;
        if (b % 10 === 0) return 'tens';
        if ([5, 15, 25].includes(b)) return 'fives';
        return undefined;
    },
    H2(a, op, b, result) {
        if (op !== '+' || a < 10 || b < 10 || result <= 30) return;
        return a % 10 + b % 10 >= 10 ? 'with-carry' : 'without-carry';
    },
    H3(a, op, b) {
        if (op !== '-' || a <= 30 || b < 10 || b >= 100) return;
        return a % 10 < b % 10 ? 'with-borrow' : 'without-borrow';
    },
};

function groupPairs(pairs: NumericPair[], index: (n: number) => number): NumericPair[][] {
    const groups = new Map<number, NumericPair[]>();
    for (const pair of pairs) {
        const key = index(pair.a) * 100 + index(pair.b);
        const group = groups.get(key);
        if (group) group.push(pair);
        else groups.set(key, [pair]);
    }
    return [...groups.values()];
}

// Two-digit operation families are much larger than a child can exhaust in
// one block. Keep at least one of every possible pairing of decades, then
// span the legal magnitudes for each pair of units figures. For example,
// 18 + 13 and 68 + 23 both practise 8 + 3 on different decade bases.
function samplePlaceValues(pairs: NumericPair[]): NumericPair[] {
    const limit = 384;
    if (pairs.length <= limit) return pairs;
    const selected = new Set<NumericPair>();
    const beyondH1 = (p: NumericPair) => p.a % 10 !== 0 && p.b % 10 !== 0 && p.b !== 15 && p.b !== 25;
    for (const group of groupPairs(pairs, n => Math.floor(n / 10))) {
        const primary = group.filter(beyondH1);
        const options = primary.length ? primary : group;
        selected.add(options[Math.floor(options.length / 2)]);
    }
    const units = groupPairs(pairs, n => n % 10);
    const weight = (group: NumericPair[]) => group.some(beyondH1) ? 4 : 1;
    const totalWeight = units.reduce((sum, group) => sum + weight(group), 0);
    const remaining = limit - selected.size;
    for (const group of units) {
        const quota = Math.max(1, Math.floor(remaining * weight(group) / totalWeight));
        const primary = group.filter(beyondH1);
        const options = primary.length >= quota ? primary : group;
        const n = Math.min(quota, options.length);
        for (let i = 0; i < n; i++) selected.add(options[Math.floor((i + 0.5) * options.length / n)]);
    }
    return [...selected];
}

function generatedFamilies(node: AdvancedNodeId): Map<string, NumericPair[]> {
    const families = new Map<string, NumericPair[]>();
    const familyOf = pairFamilies[node];
    if (!familyOf) return families;
    const max = advancedMaximum(node);
    for (let a = 1; a <= max; a++) {
        for (let b = 1; b <= max; b++) {
            for (const op of ['+', '-'] as const) {
                const result = apply(a, op, b);
                if (result < 0 || result > max) continue;
                const stageId = familyOf(a, op, b, result);
                if (!stageId) continue;
                const pair: NumericPair = { a, b, op };
                const family = families.get(stageId);
                if (family) family.push(pair);
                else families.set(stageId, [pair]);
            }
        }
    }
    if (node === 'H2' || node === 'H3') {
        for (const [stageId, pairs] of families) families.set(stageId, samplePlaceValues(pairs));
    }
    return families;
}

function buildNode(node: AdvancedNodeId): NodeContent {
    const [label, masteryMs, rows] = sources[node];
    const targets: ProblemDefinition[] = [];
    const generated = generatedFamilies(node);
    const stages = rows.map(source => {
        const register = (expression: string, role: 'target' | 'bridge') => {
            const p = decode(node, source, role, expression);
            problemsByKey.set(p.key, p);
            if (role === 'target') targets.push(p);
            return p.key;
        };
        const expressions = new Set(source.targets.split(' '));
        for (const pair of generated.get(source.id) ?? []) expressions.add(`${pair.a}${pair.op}${pair.b}`);
        for (const expression of expressions) register(expression, 'target');
        return {
            id: source.id, group: source.group,
            demoExpressions: source.demo,
            directions: [...new Set(targets.filter(p => p.advanced!.stageId === source.id).map(p => p.advanced!.direction))],
            demo: source.demo.map(expr => workedExample(decode(node, source, 'bridge', expr))) as [string,string],
            anchorKey: register(source.pair[0], 'bridge'), transferKey: register(source.pair[1], 'bridge'),
            supportKeys: source.support.split(' ').map(expr => register(expr, 'bridge')),
        };
    });
    targetsByNode.set(node, targets);
    return { label, masteryMs, stages };
}

export const ADVANCED_NODES = Object.fromEntries(
    (Object.keys(sources) as AdvancedNodeId[]).map(node => [node, buildNode(node)])
) as Record<AdvancedNodeId, NodeContent>;

export function isAdvancedNode(id: string): id is AdvancedNodeId {
    return Object.hasOwn(ADVANCED_NODES, id);
}

export function getAdvancedProblem(key: string): ProblemDefinition | undefined {
    return problemsByKey.get(key);
}

export function advancedProblems(): Iterable<ProblemDefinition> {
    return problemsByKey.values();
}

function shuffle<T>(values: T[]): T[] {
    for (let i = values.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [values[i], values[j]] = [values[j], values[i]];
    }
    return values;
}

/** A scored exam deals only target items. Within each half, cover the actual skill
 * (operation, stage, boundary and transfer), before sampling more items. */
function coverage(p: ProblemDefinition): string[] {
    const meta = p.advanced!;
    const features = [meta.direction, meta.stageId];
    const b = p.form === 'missing_part' ? p.answer : p.operand2;
    const result = p.form === 'missing_part' ? p.operand2 : p.answer;
    if (p.subAtomId === 'F2' || p.subAtomId === 'F3' || p.subAtomId === 'H1') {
        if ([5,15,25].includes(b)) features.push(`change${b}`);
    }
    if (p.subAtomId === 'F3') {
        if (Math.min(p.operand1, result) < 50 && Math.max(p.operand1, result) > 50) features.push('cross50');
        if (result === 100) features.push('reach100');
    }
    if (p.subAtomId === 'G2' && result === 30) features.push('reach30');
    if (p.subAtomId === 'H3' && p.operand1 === 100) features.push('from100');
    if (p.subAtomId === 'H1' && meta.group === 1 && Math.floor(p.operand1 / 10) !== Math.floor(result / 10)) {
        features.push(`cross${p.operator}`);
    }
    if (p.operator2) features.push(`${p.operator}${p.operator2}`);
    return features;
}

export function drawAdvancedExamKeys(node: AdvancedNodeId, count: number): string[] {
    if (!Number.isSafeInteger(count) || count < 1) return [];
    const all = targetsByNode.get(node)!;
    const result: string[] = [];
    const oddGroup = Math.random() < 0.5 ? 0 : 1;
    for (const group of [0, 1]) {
        const candidates = shuffle(all.filter(p => p.advanced!.group === group));
        const covered = new Set<string>();
        const required = Math.floor(count / 2) + Number(count % 2 === 1 && group === oddGroup);
        for (let i = 0; i < required && candidates.length > 0; i++) {
            const novelty = (p: ProblemDefinition) => coverage(p).filter(feature => !covered.has(feature)).length;
            const best = candidates.reduce((current, p) => novelty(p) > novelty(current) ? p : current);
            result.push(best.key);
            coverage(best).forEach(feature => covered.add(feature));
            candidates.splice(candidates.indexOf(best), 1);
        }
    }
    return shuffle(result);
}

/** Return credible numeric alternatives first. The issue-time shuffle is part of
 * the MathProblem snapshot so restoring a turn also restores its four buttons. */
export function advancedChoices(p: ProblemDefinition): number[] {
    const node = p.subAtomId as AdvancedNodeId;
    const answer = p.answer;
    const maximum = advancedMaximum(node);
    const a = p.operand1, b = p.operand2;
    const increment = p.operator === '+' ? 1 : -1;
    const members = [a, b, answer, p.operand3 ?? 0];
    const step = node.startsWith('F') && members.every(n => n % 10 === 0) ? 10
        : node.startsWith('F') && members.every(n => n % 5 === 0) ? 5 : 1;
    const picks = new Set<number>([answer]);
    const tryValue = (value: number) => {
        if (picks.size < 4 && value >= 0 && value <= maximum && value % step === 0) picks.add(value);
    };
    if (p.form === 'missing_part') {
        [answer - step, answer + step, answer - 2 * step, answer + 2 * step].forEach(tryValue);
    } else if (p.operand3 !== undefined && p.operator2) {
        const middle = apply(a, p.operator, b);
        tryValue(middle);
        tryValue(apply(middle, p.operator2 === '+' ? '-' : '+', p.operand3));
    } else if (step === 10) {
        [a, a - increment * b, answer + step, answer - step].forEach(tryValue);
    } else if (b === 15 || b === 25) {
        [a + increment * 5, a + increment * (b - 5), a].forEach(tryValue);
    } else if (node === 'G1' && answer > 20) {
        // At least two feasible results above twenty, including at the upper edge.
        tryValue(answer === 30 ? 29 : answer + 1);
        tryValue(20);
        tryValue(answer - 1);
    } else {
        if (Math.floor(a / 10) !== Math.floor(answer / 10)) tryValue(10 * Math.round(answer / 10));
        tryValue(answer - increment * 10);
        tryValue(a);
    }
    for (let distance = step; picks.size < 4 && distance <= maximum; distance += step) {
        tryValue(answer - distance);
        tryValue(answer + distance);
    }
    return shuffle([...picks]);
}
