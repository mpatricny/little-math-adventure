import {
    ALL_PROBLEM_FORMS,
    MathStats,
    PlayerState,
    ProblemForm,
    SubAtomId,
} from '../types';

export type DailyProgressDay = {
    date: string;
    attempts: number;
    correct: number;
    wrong: number;
    averageResponseTimeMs: number;
    forms: Record<ProblemForm, number>;
    subAtoms: Partial<Record<SubAtomId, number>>;
    coinsEarned: number;
    manaEarned: number;
    crystalsEarned: number;
    milestones: string[];
};

export type DailyProgressProfile = {
    player: PlayerState;
    stats: MathStats;
};

type DailyRewardLog = NonNullable<PlayerState['dailyProgressLog']>[string];

/**
 * Builds daily learning history from timestamped mastery attempts and keeps a
 * compact reward/milestone ledger for information that cannot be reconstructed
 * from problem records alone.
 */
export class DailyProgressSystem {
    static recordCoins(player: PlayerState, amount: number, timestamp: number = Date.now()): void {
        if (amount <= 0) return;
        this.ensureRewardDay(player, timestamp).coinsEarned += amount;
    }

    static recordMana(player: PlayerState, amount: number, timestamp: number = Date.now()): void {
        if (amount <= 0) return;
        this.ensureRewardDay(player, timestamp).manaEarned += amount;
    }

    static recordCrystal(player: PlayerState, amount: number = 1, timestamp: number = Date.now()): void {
        if (amount <= 0) return;
        this.ensureRewardDay(player, timestamp).crystalsEarned += amount;
    }

    static recordMilestone(player: PlayerState, label: string, timestamp: number = Date.now()): void {
        if (!label) return;
        const day = this.ensureRewardDay(player, timestamp);
        if (!day.milestones.includes(label)) day.milestones.push(label);
    }

    static getRecentDays(
        player: PlayerState,
        stats: MathStats,
        dayCount: number = 7,
        now: number = Date.now(),
    ): DailyProgressDay[] {
        return this.getRecentDaysForProfiles([{ player, stats }], dayCount, now);
    }

    /** Build one shared co-op timeline by summing both players' real activity. */
    static getRecentDaysForProfiles(
        profiles: DailyProgressProfile[],
        dayCount: number = 7,
        now: number = Date.now(),
    ): DailyProgressDay[] {
        const days = new Map<string, DailyProgressDay>();
        const responseTimeCounts = new Map<string, number>();
        const cursor = new Date(now);
        cursor.setHours(12, 0, 0, 0);

        for (let offset = dayCount - 1; offset >= 0; offset--) {
            const date = new Date(cursor);
            date.setDate(cursor.getDate() - offset);
            const key = this.dateKey(date.getTime());
            days.set(key, this.createEmptyDay(key));
        }

        for (const { player, stats } of profiles) {
            const mastery = stats.masteryData;
            if (mastery) {
                for (const record of Object.values(mastery.problemRecords)) {
                    for (const attempt of record.attempts) {
                        const day = days.get(this.dateKey(attempt.timestamp));
                        if (!day) continue;
                        day.attempts += 1;
                        if (attempt.correct) day.correct += 1;
                        else day.wrong += 1;
                        if (attempt.correct && attempt.responseTimeMs > 0 && attempt.responseTimeMs <= 20000) {
                            day.averageResponseTimeMs += attempt.responseTimeMs;
                            responseTimeCounts.set(day.date, (responseTimeCounts.get(day.date) ?? 0) + 1);
                        }
                        day.forms[record.form] += 1;
                        day.subAtoms[record.subAtomId] = (day.subAtoms[record.subAtomId] ?? 0) + 1;
                    }
                }
            }

            for (const [date, reward] of Object.entries(player.dailyProgressLog ?? {})) {
                const day = days.get(date);
                if (!day) continue;
                day.coinsEarned += reward.coinsEarned;
                day.manaEarned += reward.manaEarned;
                day.crystalsEarned += reward.crystalsEarned;
                for (const milestone of reward.milestones) {
                    if (!day.milestones.includes(milestone)) day.milestones.push(milestone);
                }
            }
        }

        for (const day of days.values()) {
            const responseTimeCount = responseTimeCounts.get(day.date) ?? 0;
            day.averageResponseTimeMs = responseTimeCount > 0
                ? Math.round(day.averageResponseTimeMs / responseTimeCount)
                : 0;
        }
        return [...days.values()];
    }

    static dateKey(timestamp: number): string {
        const date = new Date(timestamp);
        const year = date.getFullYear();
        const month = `${date.getMonth() + 1}`.padStart(2, '0');
        const day = `${date.getDate()}`.padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    private static ensureRewardDay(player: PlayerState, timestamp: number): DailyRewardLog {
        player.dailyProgressLog ??= {};
        const key = this.dateKey(timestamp);
        player.dailyProgressLog[key] ??= {
            coinsEarned: 0,
            manaEarned: 0,
            crystalsEarned: 0,
            milestones: [],
        };
        return player.dailyProgressLog[key];
    }

    private static createEmptyDay(date: string): DailyProgressDay {
        return {
            date,
            attempts: 0,
            correct: 0,
            wrong: 0,
            averageResponseTimeMs: 0,
            forms: Object.fromEntries(ALL_PROBLEM_FORMS.map(form => [form, 0])) as Record<ProblemForm, number>,
            subAtoms: {},
            coinsEarned: 0,
            manaEarned: 0,
            crystalsEarned: 0,
            milestones: [],
        };
    }
}
