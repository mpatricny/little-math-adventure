import { describe, expect, it, vi } from 'vitest';
import { EXAM_CONFIGS } from '../../types';
import type { ProblemForm } from '../../types';
import { MasterySystem } from '../MasterySystem';
import { calculateSubAtomExamProgress } from '../ExamProgress';

vi.mock('phaser', () => ({
    default: {
        Math: { Between: (min: number) => min },
        Utils: { String: { UUID: () => 'exam-balance-test' } },
    },
}));

function createGeneratorHarness(): MasterySystem {
    const system = Object.create(MasterySystem.prototype) as MasterySystem;
    let serial = 0;

    (system as any).pickRandomProblems = (subAtomId: string, form: ProblemForm, count: number) =>
        Array.from({ length: count }, () => `${subAtomId}|${form}|${serial++}`);
    (system as any).shuffle = <T>(items: T[]) => items;
    (system as any).isComparisonChapterComplete = () => true;

    return system;
}

function countBySegment(keys: string[], segment: number): Record<string, number> {
    return keys.reduce<Record<string, number>>((counts, key) => {
        const value = key.split('|')[segment];
        counts[value] = (counts[value] ?? 0) + 1;
        return counts;
    }, {});
}

describe('exam difficulty balance', () => {
    it('uses the reduced item counts and approved thresholds', () => {
        expect(EXAM_CONFIGS.sub_atom).toMatchObject({
            itemCount: 8, bronzeThreshold: 5, silverThreshold: 6, goldThreshold: 7,
        });
        expect(EXAM_CONFIGS.comparison_chapter).toMatchObject({
            itemCount: 8, bronzeThreshold: 5, silverThreshold: 6, goldThreshold: 7,
        });
        expect(EXAM_CONFIGS.fluency_challenge).toMatchObject({ itemCount: 10, passThreshold: 8 });
        expect(EXAM_CONFIGS.mastery_challenge).toMatchObject({ itemCount: 10, passThreshold: 9 });
        expect(EXAM_CONFIGS.band_gate).toMatchObject({
            itemCount: 12, bronzeThreshold: 8, silverThreshold: 10, goldThreshold: 11,
        });
        expect(EXAM_CONFIGS.band_mastery).toMatchObject({ itemCount: 14, passThreshold: 12 });
    });

    it('awards tiers and pass results at the new boundaries', () => {
        const system = createGeneratorHarness();

        expect(system.computeExamTier(4, 'sub_atom')).toBe('none');
        expect(system.computeExamTier(5, 'sub_atom')).toBe('bronze');
        expect(system.computeExamTier(6, 'sub_atom')).toBe('silver');
        expect(system.computeExamTier(7, 'sub_atom')).toBe('gold');
        expect(system.computeExamTier(7, 'band_gate')).toBe('none');
        expect(system.computeExamTier(8, 'band_gate')).toBe('bronze');
        expect(system.computeExamTier(10, 'band_gate')).toBe('silver');
        expect(system.computeExamTier(11, 'band_gate')).toBe('gold');
        expect(system.computeExamTier(7, 'fluency_challenge')).toBe('none');
        expect(system.computeExamTier(8, 'fluency_challenge')).toBe('gold');
        expect(system.computeExamTier(8, 'mastery_challenge')).toBe('none');
        expect(system.computeExamTier(9, 'mastery_challenge')).toBe('gold');
        expect(system.computeExamTier(11, 'band_mastery')).toBe('none');
        expect(system.computeExamTier(12, 'band_mastery')).toBe('gold');
    });

    it('awards medals solely from the number of correct answers', () => {
        const system = createGeneratorHarness();

        expect(system.computeExamTier(5, 'sub_atom')).toBe('bronze');
        expect(system.computeExamTier(6, 'sub_atom')).toBe('silver');
        expect(system.computeExamTier(7, 'sub_atom')).toBe('gold');
        expect(system.computeExamTier(8, 'sub_atom')).toBe('gold');
    });

    it('shows progress from the least-complete exam requirement', () => {
        expect(calculateSubAtomExamProgress('D2', 12, 1, 2)).toMatchObject({
            targetId: 'D2',
            percentage: 60,
            ready: false,
        });
        expect(calculateSubAtomExamProgress('D2', 20, 0.70, 2)).toMatchObject({
            percentage: 100,
            ready: true,
        });
        expect(calculateSubAtomExamProgress('D2', 20, 0.69, 2).percentage).toBe(98);
    });

    it('keeps the 8-item sub-atom exam balanced across learned forms', () => {
        const keys = createGeneratorHarness().generateSubAtomExamProblems('A1');

        expect(keys).toHaveLength(8);
        expect(countBySegment(keys, 1)).toEqual({ result_unknown: 3, missing_part: 3, compare_equation_vs_number: 2 });
    });

    it('keeps A1/A2 exams at eight arithmetic items before comparison is learned', () => {
        const system = createGeneratorHarness();
        (system as any).isComparisonChapterComplete = () => false;
        const keys = system.generateSubAtomExamProblems('A2');
        expect(keys).toHaveLength(8);
        expect(countBySegment(keys, 1)).toEqual({ result_unknown: 4, missing_part: 4 });
    });

    it('uses four results and four comparisons for A3', () => {
        const keys = createGeneratorHarness().generateSubAtomExamProblems('A3');
        expect(keys).toHaveLength(8);
        expect(countBySegment(keys, 1)).toEqual({
            result_unknown: 4,
            compare_equation_vs_number: 4,
        });
    });

    it('builds exact 10-item fluency and mastery challenges', () => {
        const system = createGeneratorHarness();
        const fluency = system.generateChallengeProblemKeys('A1', 10, 'fluency_challenge');
        const mastery = system.generateChallengeProblemKeys('A1', 10, 'mastery_challenge');

        expect(countBySegment(fluency, 1)).toEqual({
            result_unknown: 4,
            missing_part: 3,
            compare_equation_vs_number: 3,
        });
        expect(countBySegment(mastery, 1)).toEqual({
            result_unknown: 3,
            missing_part: 3,
            compare_equation_vs_number: 2,
            compare_equation_vs_equation: 2,
        });
    });

    it('gives every sub-atom equal representation in the 12-item band gate', () => {
        const keys = createGeneratorHarness().generateBandGateProblems('A');

        expect(keys).toHaveLength(12);
        expect(countBySegment(keys, 0)).toEqual({ A1: 3, A2: 3, A3: 3, A4: 3 });
        expect(countBySegment(keys, 1)).toEqual({
            result_unknown: 5,
            missing_part: 3,
            compare_equation_vs_number: 4,
        });
    });

    it('builds 14 band-mastery items without the removed A3 missing form', () => {
        const keys = createGeneratorHarness().generateBandMasteryProblems('A');

        expect(keys).toHaveLength(14);
        expect(countBySegment(keys, 0)).toEqual({ A1: 4, A2: 4, A3: 3, A4: 3 });
        expect(countBySegment(keys, 1)).toEqual({
            result_unknown: 4,
            missing_part: 3,
            compare_equation_vs_number: 4,
            compare_equation_vs_equation: 3,
        });
    });
});
