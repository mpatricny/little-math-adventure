import { describe, expect, it } from 'vitest';
import { ALL_BANDS, ALL_SUB_ATOM_NUMBERS, EXAM_CONFIGS, type ExamType, type SubAtomId } from '../../types';
import { getExamPresentation } from '../../ui/ExamPresentation';
import { ProblemDatabase } from '../ProblemDatabase';

describe('child-facing exam identity', () => {
    it('replaces curriculum codes with short names and distinguishes crossing ten', () => {
        expect(getExamPresentation('A2').title).toBe('Odčítání do 5');
        expect(getExamPresentation('A', 'band_gate')).toMatchObject({ kind: 'Brána', title: 'Počítání do 5', preview: '2 + 3     5 − 2' });
        expect(getExamPresentation('D1')).toMatchObject({ title: 'Sčítání do 20', range: 'Do 20 · Bez přechodu' });
        expect(getExamPresentation('E1').title).toBe('Sčítání přes 10');
        expect(getExamPresentation('E2').title).toBe('Odčítání přes 10');
        expect(getExamPresentation('comparison_symbols')).toMatchObject({ title: 'Porovnávání', preview: '<   =   >' });
        for (const band of ALL_BANDS) {
            for (const target of [band, ...ALL_SUB_ATOM_NUMBERS.map(n => `${band}${n}` as SubAtomId)]) {
                for (const type of Object.keys(EXAM_CONFIGS) as ExamType[]) {
                    const p = getExamPresentation(target, type);
                    expect(p.title.split(' ').length).toBeLessThanOrEqual(4);
                    expect(Object.values(p).join(' ')).not.toMatch(/\b[A-E][1-4]?\b/);
                    expect(p.preview).not.toContain('='); // no solved example or answer disclosed
                }
            }
        }
    });

    it('every arithmetic illustration exists in the actual problem catalog for its target', () => {
        const db = ProblemDatabase.getInstance();
        for (const band of ALL_BANDS) for (const num of ALL_SUB_ATOM_NUMBERS) {
            const target: SubAtomId = `${band}${num}`;
            for (const expression of getExamPresentation(target).preview.split(/ {3,}/)) {
                const key = `${target}:${expression.replaceAll(' ', '').replaceAll('−', '-')}:result_unknown`;
                expect(db.getProblemByKey(key), key).toBeDefined();
            }
        }
    });
});
