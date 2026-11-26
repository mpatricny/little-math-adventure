import { ADVANCED_NODES, getAdvancedProblem, isAdvancedNode } from '../systems/AdvancedCurriculum';
import type { BandId, ExamType, MasteryTargetId, PracticeTargetId } from '../types';
import { BAND_RANGES } from '../systems/MathSkillRules';

/** Display-only examples, never the exam queue, answers, or progression rules. */
const EXAMPLES: Record<Exclude<BandId, 'F' | 'G' | 'H'>, [string, string, string]> = {
    A: ['2 + 3', '5 − 2', '3 + 1 − 2'],
    B: ['4 + 3', '8 − 3', '6 + 2 − 1'],
    C: ['6 + 4', '10 − 3', '6 + 4 − 1'],
    D: ['12 + 3', '18 − 3', '11 + 3 − 2'],
    E: ['8 + 5', '13 − 5', '8 + 5 − 2'],
};

const KINDS: Record<ExamType, string> = {
    sub_atom: 'Zkouška', comparison_chapter: 'Zkouška',
    band_gate: 'Brána', band_mastery: 'Mistrovství',
    fluency_challenge: 'Plynulost', mastery_challenge: 'Mistrovství',
};

export function getPracticeOperation(target: PracticeTargetId): 'add' | 'subtract' | 'mix' | 'comparison' {
    if (target === 'comparison_symbols') return 'comparison';
    if (isAdvancedNode(target)) {
        const signs = new Set(ADVANCED_NODES[target].stages.flatMap(stage => stage.directions));
        if (signs.size !== 1) return 'mix';
        return signs.has('+') ? 'add' : 'subtract';
    }
    if (target.endsWith('1')) return 'add';
    if (target.endsWith('2')) return 'subtract';
    return 'mix';
}

export function getExamPresentation(target: MasteryTargetId, type: ExamType = 'sub_atom') {
    const kind = KINDS[type];
    if (target === 'comparison_symbols') {
        return { kind, title: 'Porovnávání', range: '', preview: '<   =   >', compact: '<  =  >', boardPreview: '<  =  >' };
    }
    const band = target[0] as BandId;
    if (band === 'F' || band === 'G' || band === 'H') {
        const node = isAdvancedNode(target) ? target : `${band}1` as const;
        const definition = ADVANCED_NODES[node];
        const stages = definition.stages;
        const sample = getAdvancedProblem(stages[stages.length - 1].transferKey)!;
        const op = (operator: string) => operator === '-' ? '−' : '+';
        const preview = sample.form === 'missing_part'
            ? `${sample.operand1} ${op(sample.operator)} □ = ${sample.operand2}`
            : `${sample.operand1} ${op(sample.operator)} ${sample.operand2}${sample.operator2 ? ` ${op(sample.operator2)} ${sample.operand3}` : ''}`;
        const range = band === 'G' ? 'Do 30' : band === 'F' && ['F1', 'F2'].includes(target) ? 'Do 50' : 'Do 100';
        const title = isAdvancedNode(target) ? definition.label : band === 'F' ? 'Desítky a pětky' : `Počítání ${range.toLowerCase()}`;
        return { kind, title, range, preview, compact: preview.replaceAll(' ', ''), boardPreview: preview };
    }
    const part = Number(target[1]);
    const max = BAND_RANGES[band].maxResult;
    const operation = part === 1 ? 'Sčítání' : part === 2 ? 'Odčítání' : 'Počítání';
    const title = part === 3 ? 'Tři čísla' : `${operation} ${band === 'E' ? 'přes 10' : `do ${max}`}`;
    const range = band === 'D' ? 'Do 20 · Bez přechodu' : band === 'E' ? 'Do 20 · Přes 10' : `Do ${max}`;
    const preview = part >= 1 && part <= 3 ? EXAMPLES[band][part - 1] : `${EXAMPLES[band][0]}     ${EXAMPLES[band][1]}`;
    // Put operators between numbers so subtraction cannot read as a dash before a range.
    const compact = part >= 1 && part <= 3 ? preview
        : `${EXAMPLES[band][0].replaceAll(' ', '')}   ${EXAMPLES[band][1].replaceAll(' ', '')}`;
    return { kind, title, range, preview, compact, boardPreview: part >= 1 && part <= 3 ? preview : compact };
}
