import { describe, expect, it } from 'vitest';
import type { PlayerState } from '../../types';
import { LocalPlayTimeTracker, localPlayTimeDay, recordPlayTime, splitPlayTime, type PlayTimeContext } from '../LocalPlayTime';

const start = new Date(2026, 10, 17, 12).getTime();
const day = localPlayTimeDay(start);
const solo: PlayTimeContext = { active: true, preview: false, participants: [{ slotIndex: 0, profileId: 'a' }] };
const coop: PlayTimeContext = { ...solo, participants: [...solo.participants, { slotIndex: 1, profileId: 'b' }] };

function clockFixture() {
    const totals: Record<string, number> = {};
    const tracker = new LocalPlayTimeTracker((participant, days) => {
        totals[participant.profileId] = (totals[participant.profileId] ?? 0) + Object.values(days).reduce((a, b) => a + b, 0);
        return true;
    });
    const sample = (ms: number, context = solo) => tracker.sample(start + ms, ms, context);
    return { totals, tracker, sample };
}

describe('local play-time accounting', () => {
    it('leaves legacy/unobserved days absent, including invalid intervals', () => {
        const player: Pick<PlayerState, 'playTime'> = {};
        recordPlayTime(player, start, start - 1);
        recordPlayTime(player, NaN, start);
        recordPlayTime(player, start, Infinity);
        expect(player.playTime).toBeUndefined();
        recordPlayTime(player, start, start);
        expect(player.playTime).toEqual({ version: 1, days: { [day]: 0 } });
    });

    it('splits local midnight and does not invent a zero day at an exclusive end', () => {
        const midnight = new Date(2026, 10, 18).getTime();
        const player: Pick<PlayerState, 'playTime'> = {};
        recordPlayTime(player, midnight - 1200, midnight + 800);
        recordPlayTime(player, midnight - 500, midnight);
        expect(player.playTime?.days).toEqual({ '2026-11-17': 1700, '2026-11-18': 800 });
        expect(splitPlayTime(midnight - 500, midnight)).toEqual({ '2026-11-17': 500 });
    });

    it.each([[2, 29], [9, 25]])('uses actual local calendar boundaries around DST (%i/%i)', (month, date) => {
        const from = new Date(2026, month, date).getTime();
        const to = new Date(2026, month, date + 1).getTime();
        expect(splitPlayTime(from, to)).toEqual({ [localPlayTimeDay(from)]: to - from });
        // Run with TZ=Europe/Prague to exercise both the 23- and 25-hour days.
        if (Intl.DateTimeFormat().resolvedOptions().timeZone === 'Europe/Prague') {
            expect(to - from).toBe((month === 2 ? 23 : 25) * 60 * 60 * 1000);
        }
    });

    it('counts a ten-minute foreground problem without any clicks for both co-op heroes', () => {
        const { sample, totals } = clockFixture();
        sample(0, coop);
        for (let ms = 1000; ms <= 600_000; ms += 1000) {
            sample(ms, ms % 2000 ? coop : { ...coop, participants: [...coop.participants].reverse() });
        }
        expect(totals).toEqual({ a: 600_000, b: 600_000 });
    });

    it('closes the preceding interval at pause and resumes without paused time', () => {
        const { sample, totals } = clockFixture();
        sample(0);
        sample(1000, { ...solo, active: false });
        sample(2000, { ...solo, active: false });
        sample(3000);
        sample(4000);
        expect(totals).toEqual({ a: 2000 });
    });

    it('credits each participating slot once even when imported copies share a profile ID', () => {
        const totals: Record<number, number> = {};
        const tracker = new LocalPlayTimeTracker((participant, days) => {
            totals[participant.slotIndex] = (totals[participant.slotIndex] ?? 0) + days[day];
            return true;
        });
        const context = { ...solo, participants: [...solo.participants, ...solo.participants, { slotIndex: 1, profileId: 'a' }] };
        tracker.sample(start, 0, context);
        tracker.sample(start + 1000, 1000, context);
        expect(totals).toEqual({ 0: 1000, 1: 1000 });
    });

    it('rejects sleep gaps, backwards monotonic time and wall-clock discontinuities', () => {
        const { tracker, totals } = clockFixture();
        tracker.sample(start, 0, solo);
        tracker.sample(start + 1000, 1000, solo);
        tracker.sample(start + 61_000, 61_000, solo); // suspended timers
        tracker.sample(start + 62_000, 62_000, solo);
        tracker.sample(start + 122_000, 63_000, solo); // monotonic clock stopped during sleep
        tracker.sample(start + 123_000, 64_000, solo);
        tracker.sample(start + 124_000, 63_000, solo); // backwards clock
        tracker.sample(start + 125_000, 64_000, solo);
        expect(totals).toEqual({ a: 4000 });
    });

    it('uses monotonic elapsed time for a small wall-clock adjustment', () => {
        const { tracker, totals } = clockFixture();
        tracker.sample(start, 0, solo);
        tracker.sample(start + 1500, 1000, solo);
        expect(totals).toEqual({ a: 1000 });
    });

    it('resets an invalid clock sample and never transfers the old interval to a new profile', () => {
        const { tracker, sample, totals } = clockFixture();
        const other = { ...solo, participants: [{ slotIndex: 2, profileId: 'b' }] };
        sample(0);
        sample(1000, other);
        sample(2000, other);
        tracker.sample(NaN, 3000, other);
        sample(4000, other);
        sample(5000, other);
        expect(totals).toEqual({ a: 1000, b: 2000 });
    });

    it('never measures preview profiles or writes pending real time while preview is active', () => {
        const { sample, totals } = clockFixture();
        sample(0);
        sample(1000, { ...solo, preview: true });
        sample(2000, { ...solo, preview: true });
        expect(totals).toEqual({});
        sample(3000);
        sample(4000);
        expect(totals).toEqual({ a: 2000 });
    });

    it('batches ordinary ticks, retries a failed write and prevents recursive double accounting', () => {
        let total = 0;
        let writes = 0;
        const tracker = new LocalPlayTimeTracker((_participant, days) => {
            writes++;
            if (writes === 1) return false;
            tracker.sample(start + 16_000, 16_000, solo);
            total += days[day];
            return true;
        });
        tracker.sample(start, 0, solo, false);
        for (let ms = 1000; ms <= 14_000; ms += 1000) tracker.sample(start + ms, ms, solo, false);
        expect(writes).toBe(0);
        tracker.sample(start + 15_000, 15_000, solo, false);
        expect(writes).toBe(1);
        tracker.sample(start + 16_000, 16_000, solo);
        expect(total).toBe(16_000);
        expect(writes).toBe(2);
    });
});
