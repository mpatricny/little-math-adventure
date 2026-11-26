import { expect, test } from 'vitest';
import { EXAM_CONFIGS } from '../../../../src/types';
import { FOX_LESSON_CORRECT, FOX_LESSON_QUESTIONS } from '../../../../src/systems/FoxLessons';
import speed from '../../../../src/data/fox-speed-levels.json';
import { TRIAL_RECIPES, createSession, makeQuestions, planetaryStars } from './session.js';

test('the static presets use the real catacomb counts and pass marks', () => {
    expect(TRIAL_RECIPES.lesson).toMatchObject({ total: FOX_LESSON_QUESTIONS, required: FOX_LESSON_CORRECT });
    for (const stage of ['fluency', 'mastery'] as const) {
        const cfg = EXAM_CONFIGS[`${stage}_challenge`];
        expect(TRIAL_RECIPES[stage]).toMatchObject({ total: cfg.itemCount, required: cfg.passThreshold });
    }
    for (const stage of ['grandmaster', 'legend'] as const) {
        expect(TRIAL_RECIPES[stage]).toMatchObject(speed[stage].goal);
    }
});

test('each question is valid and distinct even for a long round', () => {
    const deck = makeQuestions(72);
    expect(new Set(deck.map(q => q.text)).size).toBe(72);
    for (const q of deck) {
        const [left, op, right] = q.text.split(' ');
        expect(q.answer).toBe(op === '+' ? +left + +right : +left - +right);
        expect(new Set(q.choices).size).toBe(3);
        expect(q.choices).toContain(q.answer);
    }
    expect(() => makeQuestions(73)).toThrow(RangeError);
});

test('time belongs to the batch and only runs while input is open', () => {
    const s = createSession({ ...TRIAL_RECIPES.lesson, paceMs: 4000 });
    s.start(1000);
    expect(s.state.budgetMs).toBe(28000);
    expect(s.answer(s.state.question.answer, 10000)).toBe(true); // 9 s on one problem
    expect(s.answer(s.state.history[0].value, 10000)).toBe(false);
    s.advance(50000); // long visual feedback
    s.setHidden(true, 50500);
    s.setPaused(true, 60000);
    s.setHidden(false, 70000);
    expect(s.answer(s.state.question.answer, 80000)).toBe(false);
    s.setPaused(false, 81000);
    expect(s.answer(s.state.question.answer, 82000, s.state.history[0].id)).toBe(false); // stale button
    expect(s.state.elapsedMs).toBe(10500);
    expect(s.state.answered).toBe(1);
    s.tick(99500);
    expect(s.state.phase).toBe('timeout');
    expect(s.answer(0, 99600)).toBe(false);
});

test.each([[6, 5, 5, 'passed'], [6, 5, 4, 'failed'], [10, 8, 8, 'passed'],
    [10, 9, 8, 'failed'], [10, 10, 9, 'failed'], [18, 13, 13, 'passed']] as const)
('judges a %i/%i round only after the final submission', (total, required, successes, verdict) => {
    const s = createSession({ total, required, paceMs: 1000 });
    s.start(0);
    for (let i = 0; i < total; i++) {
        const q = s.state.question;
        const value = i < successes ? q.answer : q.choices.find(value => value !== q.answer);
        expect(s.answer(value, i * 500 + 200, q.id)).toBe(true);
        if (i < total - 1) {
            expect(s.state.phase).toBe('feedback');
            s.advance(i * 500 + 220);
        }
    }
    expect(s.state.phase).toBe(verdict);
    expect(s.state.correct).toBe(successes);
});

test('only a passed trial gets planetary light in up to two actual missed slots', () => {
    const history = [true, false, true, false, false, true].map(correct => ({ correct }));
    for (const phase of ['asking','feedback','timeout','failed']) {
        expect(planetaryStars({ phase, history })).toEqual([]);
    }
    expect(planetaryStars({ phase: 'passed', history })).toEqual([1,3]);
    expect(planetaryStars({ phase: 'passed', history: [{correct: true}] })).toEqual([]);
    expect(planetaryStars({ phase: 'passed', history: [{correct: false},{correct: true}] })).toEqual([0]);
});
