import { describe, expect, it } from 'vitest';
import type { MasteryData, MathStats, PlayerState } from '../../types';
import { collectLearningAttempts, retainLearningHistory, type LearningHistoryAttempt } from '../LearningHistory';
import { DailyProgressSystem } from '../DailyProgressSystem';

const at = (day: number) => new Date(2026, 8, day, 14).getTime();
const answer = (timestamp = at(2), correct = true): LearningHistoryAttempt => ({
    source: 'mastery', problemKey: 'A1:2+1:result_unknown', timestamp, correct,
    responseTimeMs: 3500.123456, subAtomId: 'A1', form: 'result_unknown',
});
const data = () => ({ problemRecords: {}, comparisonChapter: { attempts: [] } } as unknown as MasteryData);
const stats = (masteryData: MasteryData) => ({ totalAttempts: 9999, correctAnswers: 9999, masteryData } as MathStats);

describe('durable personal learning history', () => {
    it('restores dated evidence without doubling current answers, inventing placement attempts or mutating progress', () => {
        const mastery = data();
        mastery.learningHistory = { version: 1, attempts: [answer(), answer(at(3), false), answer()] };
        mastery.problemRecords.current = { problemKey: answer().problemKey, subAtomId: 'A1', form: 'result_unknown', attempts: [
            { ...answer(), context: 'battle', sequenceIndex: 77 },
            { ...answer(at(4)), synthetic: true, context: 'battle', sequenceIndex: 78 },
        ] };
        const before = JSON.stringify(mastery);
        expect(DailyProgressSystem.getSummary({} as PlayerState, stats(mastery))).toEqual({
            attempts: 2, correct: 1, wrong: 1, accuracy: 0.5, firstDate: '2026-09-02', lastDate: '2026-09-03',
        });
        const days = DailyProgressSystem.getRecentDays({} as PlayerState, stats(mastery), 3, at(4));
        expect(days.map(d => d.attempts)).toEqual([1, 1, 0]);
        expect(days.every(d => d.playTimeMs === null)).toBe(true);
        expect(JSON.stringify(mastery)).toBe(before);
    });

    it('keeps the first comparison answers after the teaching window rotates and excludes diagnostics', () => {
        const mastery = data();
        const chapter = mastery.comparisonChapter!;
        chapter.attempts = Array.from({ length: 400 }, (_, i) => ({
            timestamp: at(2) + i, correct: i % 2 === 0, responseTimeMs: 2200,
            stage: 'number_symbol', leftValue: 2, rightValue: 4, sequenceIndex: i,
        })) as typeof chapter.attempts;
        retainLearningHistory(mastery);
        chapter.attempts = chapter.attempts.slice(1);
        chapter.attempts.push({ ...chapter.attempts[0], timestamp: at(3), correct: true, sequenceIndex: 401 });
        chapter.attempts.push({ ...chapter.attempts[0], timestamp: at(4), diagnosticMode: true });
        retainLearningHistory(mastery);
        retainLearningHistory(mastery);
        const summary = DailyProgressSystem.getSummary({} as PlayerState, stats(mastery));
        expect(summary).toMatchObject({ attempts: 401, correct: 201, wrong: 200 });
    });

    it('keeps repeated answers in a synchronous exam batch without counting an archived copy again', () => {
        const mastery = data();
        mastery.learningHistory = { version: 1, attempts: [answer()] };
        mastery.problemRecords.batch = { problemKey: answer().problemKey, subAtomId: 'A1', form: 'result_unknown', attempts: [
            { ...answer(), context: 'exam', sequenceIndex: 1 },
            { ...answer(), context: 'exam', sequenceIndex: 2 },
        ] };
        expect(collectLearningAttempts(mastery)).toHaveLength(2);
        retainLearningHistory(mastery);
        retainLearningHistory(mastery);
        expect(collectLearningAttempts(mastery)).toHaveLength(2);
        mastery.learningHistory!.attempts.push(answer()); // Importing the same unnumbered archive again.
        expect(collectLearningAttempts(mastery)).toHaveLength(2);
        mastery.problemRecords = {};
        expect(collectLearningAttempts(mastery)).toHaveLength(2);
    });

    it('counts an actual repeated practice on another date, using the answer clock rather than save time', () => {
        const mastery = data();
        mastery.learningHistory = { version: 1, attempts: [answer()] };
        mastery.problemRecords.current = { problemKey: answer().problemKey, subAtomId: 'A1', form: 'result_unknown', attempts: [
            { ...answer(at(5)), context: 'battle', sequenceIndex: 100,
                observation: { answeredAt: at(3), responseTimeMs: 6000 } as any },
        ] };
        const days = DailyProgressSystem.getRecentDays({} as PlayerState, stats(mastery), 4, at(5));
        expect(days.map(d => d.attempts)).toEqual([1, 1, 0, 0]);
        expect(days[1].averageResponseTimeMs).toBe(6000);
    });

    it('keeps measured playing time separate from response speed and allows browsing all historical days', () => {
        const mastery = data();
        mastery.learningHistory = { version: 1, attempts: [answer()] };
        const player = { playTime: { version: 1, days: { '2026-09-03': 900000, '2026-09-04': 0 } } } as unknown as PlayerState;
        const days = DailyProgressSystem.getRecentDays(player, stats(mastery), 3, at(4));
        expect(days.map(d => d.playTimeMs)).toEqual([null, 900000, 0]);
        expect(days[0].averageResponseTimeMs).toBe(3500);
        expect(DailyProgressSystem.getAvailableDateRange(player, stats(mastery), new Date(2026, 10, 17, 12).getTime()))
            .toEqual({ firstDate: '2026-09-02', lastDate: '2026-11-17' });
        expect(collectLearningAttempts(mastery)).toHaveLength(1);
    });

    it('preserves known help metadata across archive, renumbered live copies and JSON saves', () => {
        const mastery = data();
        mastery.learningHistory = { version: 1, attempts: [{ ...answer(), assisted: true },
            { ...answer(), sequenceIndex: 3 }] };
        mastery.problemRecords.current = { problemKey: answer().problemKey, subAtomId: 'A1', form: 'result_unknown', attempts: [
            { ...answer(), context: 'battle', sequenceIndex: 77 },
        ] };
        retainLearningHistory(mastery);
        const restored = JSON.parse(JSON.stringify(mastery)) as MasteryData;
        expect(collectLearningAttempts(restored)).toHaveLength(1);
        expect(collectLearningAttempts(restored)[0].assisted).toBe(true);
        expect(DailyProgressSystem.getRecentDays({} as PlayerState, stats(restored), 1, at(2))[0].averageResponseTimeMs).toBe(0);
    });

    it('averages correct first answers including slower work, excluding wrong answers, help, unknown times and long pauses', () => {
        const mastery = data();
        mastery.learningHistory = { version: 1, attempts: [
            { ...answer(at(2)), responseTimeMs: 5000 },
            { ...answer(at(2) + 1), responseTimeMs: 35000 },
            { ...answer(at(2) + 2, false), responseTimeMs: 10000 },
            { ...answer(at(2) + 3), responseTimeMs: 0 },
            { ...answer(at(2) + 4), responseTimeMs: 300000 },
            { ...answer(at(2) + 5), responseTimeMs: 1000, assisted: true },
        ] };
        const [day] = DailyProgressSystem.getRecentDays({} as PlayerState, stats(mastery), 1, at(2));
        expect(day).toMatchObject({ attempts: 6, correct: 5, averageResponseTimeMs: 20000, playTimeMs: null });
    });
});
