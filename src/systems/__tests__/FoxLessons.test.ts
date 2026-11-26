import { describe, it, expect } from 'vitest';
import { MasteryMigration } from '../MasteryMigration';
import { admitFoxLesson, completeFoxLesson, drawFoxLessonArithmeticKeys, FOX_LESSON_QUESTIONS, getFoxLessonProgress } from '../FoxLessons';
import { getFoxJourney } from '../FoxAbilitySystem';
import { ProblemDatabase } from '../ProblemDatabase';
import { isAdvancedNode } from '../AdvancedCurriculum';
import { ALL_BANDS, ALL_SUB_ATOM_NUMBERS, type MathStats, type PlayerState, type SubAtomId } from '../../types';
const fresh = (bonus = 3) => {
    const data = MasteryMigration.migrateFromLevel(1, { problemStats: {} } as MathStats);
    data.bands.C.state = 'training'; data.subAtoms.C1.state = 'mastery';
    const player = { catacombFoxBonus: bonus, unlockedPets: ['catacomb_creature_A'], ownedPets: ['pet_catacomb_A'],
        activePet: 'pet_turtle', catacombFoxJourney: undefined } as unknown as PlayerState;
    data.practice = { mode: 'progress', pinnedTargetId: 'A1', lastTargetId: 'A1' };
    return { player, data };
};
const solved = [1, 2, 3, 4, 5, 6].map(n => ({ problemKey: `C1:${n}`, correct: true, assisted: false }));
describe('introductory fox abilities', () => {
    it('unlocks with mastery elsewhere, then uses the current practice module even for an old cached selection', () => {
        const { player, data } = fresh();
        data.practice = { mode: 'practice', targetId: 'C1' };
        expect(getFoxLessonProgress(player, data)).toMatchObject({ ready: true, targetId: 'A1' });
        expect(admitFoxLesson(player, data, 'A1', 'shield', 'try')).toBeTruthy();
        data.practice.pinnedTargetId = 'C1';
        expect(getFoxLessonProgress(player, data).targetId).toBe('C1');
        data.subAtoms.C1.state = 'fluent';
        expect(admitFoxLesson(player, data, 'A1', 'shield', 'try')).toBeNull();
    });
    it('draws six distinct questions from each module, with a direct result for ordinary arithmetic', () => {
        const db = ProblemDatabase.getInstance();
        for (const band of ALL_BANDS) for (const number of ALL_SUB_ATOM_NUMBERS) {
            const target: SubAtomId = `${band}${number}`;
            const keys = drawFoxLessonArithmeticKeys(target);
            expect(keys, target).toHaveLength(FOX_LESSON_QUESTIONS);
            expect(new Set(keys).size, target).toBe(keys.length);
            for (const key of keys) {
                const fact = db.getProblemByKey(key)!;
                expect(fact.subAtomId).toBe(target);
                if (isAdvancedNode(target)) { expect(fact.advanced?.role).toBe('target'); continue; }
                expect(fact.form).toBe('result_unknown');
                if (number === 1 || number === 2) {
                    expect(fact.operator).toBe(number === 1 ? '+' : '-');
                    expect(fact.operand3).toBeUndefined();
                }
                if (number === 3) expect(fact.operand3).toBeDefined();
            }
        }
    });
    it('keeps first addition inside five, including answer buttons, and crossing-ten sums inside their module', () => {
        const db = ProblemDatabase.getInstance();
        const first = drawFoxLessonArithmeticKeys('A1').map(key => db.getProblemByKey(key)!);
        expect(first.filter(p => p.operand1 > 1 && p.operand2 > 1)).toHaveLength(3);
        for (const problem of first) {
            expect(problem.answer).toBe(problem.operand1 + problem.operand2);
            expect(Math.max(...db.generateChoices(problem, 'practice'))).toBeLessThanOrEqual(5);
        }
        for (const key of drawFoxLessonArithmeticKeys('E1')) {
            const problem = db.getProblemByKey(key)!;
            expect(problem.operand1).toBeLessThan(10);
            expect(problem.answer).toBeGreaterThan(10);
            expect(problem.answer).toBeLessThanOrEqual(20);
        }
    });
    it('three lessons can use the same mastered module, once each, without attack, appearance or pin changes', () => {
        const { player, data } = fresh(), pin = structuredClone(data.practice);
        for (const ability of ['shield', 'heal', 'strike'] as const) {
            expect(getFoxLessonProgress(player, data).next).toBe(ability);
            const admission = admitFoxLesson(player, data, 'C1', ability, ability)!;
            expect(admission).toBeTruthy();
            expect(completeFoxLesson(admission, solved, false)).toBe(false);
            expect(completeFoxLesson(admission, solved, true)).toBe(true);
            expect(completeFoxLesson(admission, solved, true)).toBe(false);
            expect(player.catacombFoxBonus).toBe(3); expect(player.activePet).toBe('pet_turtle');
            expect(data.practice).toEqual(pin); expect(getFoxJourney(player).points).toBe(0);
        }
        expect(getFoxJourney(player).powers).toEqual({ shield: 1, heal: 1, strike: 1 });
        expect(getFoxLessonProgress(player, data).next).toBeNull();
    });
    it('requires old attack upgrades and independent correct first answers, not a corrected or assisted repeat', () => {
        const { player, data } = fresh(1);
        expect(admitFoxLesson(player, data, 'C1', 'heal', 'skip')).toBeNull();
        const admission = admitFoxLesson(player, data, 'C1', 'shield', 'first')!;
        const fourCorrect = solved.map((a, i) => ({ ...a, correct: i !== 0, assisted: i === 1 }));
        for (const answers of [
            solved.slice(0, 5), fourCorrect, [...fourCorrect, { ...solved[0], problemKey: 'C1:7' }],
            [...solved.slice(0, 5), solved[0]], [{ ...solved[0], correct: false }, ...solved],
        ]) {
            expect(completeFoxLesson(admission, answers, true)).toBe(false);
            expect(player.catacombFoxJourney).toBeUndefined();
        }
        expect(completeFoxLesson(admission, [{ ...solved[0], correct: false }, ...solved.slice(1)], true)).toBe(true);
        expect(getFoxLessonProgress(player, data).ready).toBe(false);
    });
    it('does not manufacture rewards by reading legacy, malformed or future saves', () => {
        for (const progress of [undefined, { version: 1, awards: {}, lessons: { shield: { evidenceId: 17, earnedAt: 12 } } }, { version: 22, awards: {} }]) {
            const { player, data } = fresh(); player.catacombFoxJourney = progress as any;
            const before = structuredClone(player);
            expect(() => getFoxLessonProgress(player, data)).not.toThrow();
            if (progress?.version === 22) expect(getFoxLessonProgress(player, data).ready).toBe(false);
            expect(player).toEqual(before);
        }
    });
    it('never changes the other owner', () => {
        const a = fresh(), b = fresh(), original = structuredClone(b);
        completeFoxLesson(admitFoxLesson(a.player, a.data, 'C1', 'shield', 'a')!, solved, true);
        expect(b).toEqual(original);
    });
});
