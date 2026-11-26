import {
    ALL_PROBLEM_FORMS,
    MathStats,
    PlayerState,
    ProblemForm,
    SubAtomId,
} from '../types';
import { collectLearningAttempts } from './LearningHistory';

export type DailyProgressDay = {
    date: string;
    attempts: number;
    correct: number;
    wrong: number;
    averageResponseTimeMs: number;
    /** Foreground play measured locally; null means it was never measured. */
    playTimeMs: number | null;
    forms: Record<ProblemForm, number>;
    subAtoms: Partial<Record<SubAtomId, number>>;
    comparisonAttempts: number;
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
        const measuredProfiles = new Map<string, number>();
        const cursor = new Date(now);
        cursor.setHours(12, 0, 0, 0);

        for (let offset = dayCount - 1; offset >= 0; offset--) {
            const date = new Date(cursor);
            date.setDate(cursor.getDate() - offset);
            const key = this.dateKey(date.getTime());
            days.set(key, this.createEmptyDay(key));
        }

        for (const { player, stats } of profiles) {
            for (const attempt of collectLearningAttempts(stats.masteryData)) {
                const day = days.get(this.dateKey(attempt.timestamp));
                if (!day) continue;
                day.attempts += 1;
                if (attempt.correct) day.correct += 1;
                else day.wrong += 1;
                // Keep real slower answers; only unknown times and obvious long pauses
                // are omitted, using the same two-minute ceiling as the source report.
                if (attempt.correct && attempt.assisted !== true && attempt.responseTimeMs > 0 && attempt.responseTimeMs <= 120000) {
                    day.averageResponseTimeMs += attempt.responseTimeMs;
                    responseTimeCounts.set(day.date, (responseTimeCounts.get(day.date) ?? 0) + 1);
                }
                if (attempt.source === 'comparison') day.comparisonAttempts += 1;
                if (attempt.form && attempt.form in day.forms) day.forms[attempt.form] += 1;
                if (attempt.subAtomId) day.subAtoms[attempt.subAtomId] = (day.subAtoms[attempt.subAtomId] ?? 0) + 1;
            }
            for (const [date, time] of Object.entries(player.playTime?.days ?? {})) {
                const day = days.get(date);
                if (!day || !Number.isFinite(time) || time < 0) continue;
                day.playTimeMs = (day.playTimeMs ?? 0) + time;
                measuredProfiles.set(date, (measuredProfiles.get(date) ?? 0) + 1);
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
            if ((measuredProfiles.get(day.date) ?? 0) !== profiles.length) day.playTimeMs = null;
            const responseTimeCount = responseTimeCounts.get(day.date) ?? 0;
            day.averageResponseTimeMs = responseTimeCount > 0
                ? Math.round(day.averageResponseTimeMs / responseTimeCount)
                : 0;
        }
        return [...days.values()];
    }

    static getSummary(_player: PlayerState, stats: MathStats): {
        attempts: number; correct: number; wrong: number; accuracy: number | null;
        firstDate: string | null; lastDate: string | null;
    } {
        const attempts = collectLearningAttempts(stats.masteryData);
        const correct = attempts.filter(attempt => attempt.correct).length;
        return { attempts: attempts.length, correct, wrong: attempts.length - correct,
            accuracy: attempts.length ? correct / attempts.length : null,
            firstDate: attempts.length ? this.dateKey(attempts[0].timestamp) : null,
            lastDate: attempts.length ? this.dateKey(attempts[attempts.length - 1].timestamp) : null };
    }

    /** Navigation includes empty days between actual play, and never goes into the future. */
    static getAvailableDateRange(player: PlayerState, stats: MathStats, now = Date.now()): { firstDate: string; lastDate: string } {
        const today = this.dateKey(now);
        const first = this.getSummary(player, stats).firstDate;
        const dates = [today, ...(first ? [first] : []), ...Object.keys(player.playTime?.days ?? {}),
            ...Object.keys(player.dailyProgressLog ?? {})]
            .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today).sort();
        return { firstDate: dates[0], lastDate: today };
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
            playTimeMs: null,
            forms: Object.fromEntries(ALL_PROBLEM_FORMS.map(form => [form, 0])) as Record<ProblemForm, number>,
            subAtoms: {},
            comparisonAttempts: 0,
            coinsEarned: 0,
            manaEarned: 0,
            crystalsEarned: 0,
            milestones: [],
        };
    }
}
