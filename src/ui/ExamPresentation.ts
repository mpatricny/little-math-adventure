import type { BandId, ExamType, MasteryTargetId } from '../types';
import { BAND_RANGES } from '../systems/MathSkillRules';

/** Display-only examples, never the exam queue, answers, or progression rules. */
const EXAMPLES: Record<BandId, [string, string, string]> = {
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

export function getExamPresentation(target: MasteryTargetId, type: ExamType = 'sub_atom') {
    const kind = KINDS[type];
    if (target === 'comparison_symbols') {
        return { kind, title: 'Porovnávání', range: '', preview: '<   =   >', compact: '<  =  >', boardPreview: '<  =  >' };
    }
    const band = target[0] as BandId;
    const part = Number(target[1]);
    const max = BAND_RANGES[band].maxResult;
    const operation = part === 1 ? 'Sčítání' : part === 2 ? 'Odčítání' : 'Počítání';
    const title = part === 3 ? 'Tři čísla' : `${operation} ${band === 'E' ? 'přes 10' : `do ${max}`}`;
    const range = band === 'D' ? 'Do 20 · Bez přechodu' : band === 'E' ? 'Do 20 · Přes 10' : `Do ${max}`;
    const symbol = part === 1 ? '+' : part === 2 ? '−' : '+ −';
    const preview = part >= 1 && part <= 3 ? EXAMPLES[band][part - 1] : `${EXAMPLES[band][0]}     ${EXAMPLES[band][1]}`;
    const compact = `${symbol} 0–${max}`;
    return { kind, title, range, preview, compact, boardPreview: part >= 1 && part <= 3 ? preview : compact };
}
