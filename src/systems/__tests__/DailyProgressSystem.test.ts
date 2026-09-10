import { describe, expect, it } from 'vitest';
import { DailyProgressSystem } from '../DailyProgressSystem';
import { MathStats, PlayerState } from '../../types';

function localTime(daysFromToday: number, hour: number = 12): number {
    const date = new Date(2026, 7, 16, hour, 0, 0, 0);
    date.setDate(date.getDate() + daysFromToday);
    return date.getTime();
}

describe('DailyProgressSystem', () => {
    it('groups timestamped mastery attempts and merges the reward ledger', () => {
        const player = {} as PlayerState;
        const stats = {
            masteryData: {
                problemRecords: {
                    first: {
                        subAtomId: 'A1',
                        form: 'result_unknown',
                        attempts: [
                            { timestamp: localTime(-1), correct: true, responseTimeMs: 4000 },
                            { timestamp: localTime(0, 10), correct: false, responseTimeMs: 6000 },
                        ],
                    },
                    second: {
                        subAtomId: 'A2',
                        form: 'missing_part',
                        attempts: [
                            { timestamp: localTime(0, 11), correct: true, responseTimeMs: 5000 },
                        ],
                    },
                },
            },
        } as unknown as MathStats;

        DailyProgressSystem.recordCoins(player, 7, localTime(0));
        DailyProgressSystem.recordMana(player, 3, localTime(0));
        DailyProgressSystem.recordCrystal(player, 2, localTime(0));
        DailyProgressSystem.recordMilestone(player, 'A2: Jistota', localTime(0));

        const days = DailyProgressSystem.getRecentDays(player, stats, 2, localTime(0));
        expect(days[0]).toMatchObject({ attempts: 1, correct: 1, wrong: 0 });
        expect(days[1]).toMatchObject({
            attempts: 2,
            correct: 1,
            wrong: 1,
            averageResponseTimeMs: 5000,
            coinsEarned: 7,
            manaEarned: 3,
            crystalsEarned: 2,
            milestones: ['A2: Jistota'],
        });
        expect(days[1].forms.result_unknown).toBe(1);
        expect(days[1].forms.missing_part).toBe(1);
        expect(days[1].subAtoms).toEqual({ A1: 1, A2: 1 });
    });

    it('deduplicates milestones on the same day', () => {
        const player = {} as PlayerState;
        DailyProgressSystem.recordMilestone(player, 'A1: Plynulost', localTime(0));
        DailyProgressSystem.recordMilestone(player, 'A1: Plynulost', localTime(0));
        expect(player.dailyProgressLog?.['2026-08-16'].milestones).toEqual(['A1: Plynulost']);
    });

    it('combines attempts and rewards from both co-op profiles', () => {
        const playerA = {} as PlayerState;
        const playerB = {} as PlayerState;
        const statsA = {
            masteryData: {
                problemRecords: {
                    a: {
                        subAtomId: 'A1',
                        form: 'result_unknown',
                        attempts: [
                            { timestamp: localTime(0, 9), correct: true, responseTimeMs: 4000 },
                        ],
                    },
                },
            },
        } as unknown as MathStats;
        const statsB = {
            masteryData: {
                problemRecords: {
                    b: {
                        subAtomId: 'A2',
                        form: 'missing_part',
                        attempts: [
                            { timestamp: localTime(0, 10), correct: true, responseTimeMs: 6000 },
                            { timestamp: localTime(0, 11), correct: false, responseTimeMs: 7000 },
                        ],
                    },
                },
            },
        } as unknown as MathStats;

        DailyProgressSystem.recordCoins(playerA, 3, localTime(0));
        DailyProgressSystem.recordCoins(playerB, 4, localTime(0));
        DailyProgressSystem.recordMana(playerA, 1, localTime(0));
        DailyProgressSystem.recordMana(playerB, 2, localTime(0));

        const [today] = DailyProgressSystem.getRecentDaysForProfiles([
            { player: playerA, stats: statsA },
            { player: playerB, stats: statsB },
        ], 1, localTime(0));

        expect(today).toMatchObject({
            attempts: 3,
            correct: 2,
            wrong: 1,
            averageResponseTimeMs: 5000,
            coinsEarned: 7,
            manaEarned: 3,
        });
        expect(today.forms.result_unknown).toBe(1);
        expect(today.forms.missing_part).toBe(2);
        expect(today.subAtoms).toEqual({ A1: 1, A2: 2 });
    });
});
