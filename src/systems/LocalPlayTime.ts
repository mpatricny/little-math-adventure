import type { PlayerState } from '../types';
import { ActivityClock } from '../telemetry/ActivityClock';

export type PlayTimeDays = Record<string, number>;
export type PlayTimeParticipant = { slotIndex: number; profileId: string };
export type PlayTimeContext = { participants: PlayTimeParticipant[]; active: boolean; preview: boolean };

export function localPlayTimeDay(timeMs: number): string {
    const date = new Date(timeMs);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Calendar boundaries are local midnights, including 23/25-hour DST days. */
export function splitPlayTime(fromMs: number, toMs: number): PlayTimeDays {
    const days: PlayTimeDays = {};
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs
        || Number.isNaN(new Date(fromMs).getTime()) || Number.isNaN(new Date(toMs).getTime())) return days;
    let cursor = fromMs;
    do {
        const next = new Date(cursor);
        next.setHours(24, 0, 0, 0);
        const end = Math.min(next.getTime(), toMs);
        days[localPlayTimeDay(cursor)] = end - cursor;
        cursor = end;
    } while (cursor < toMs);
    return days;
}

export function addPlayTimeDays(player: Pick<PlayerState, 'playTime'>, days: PlayTimeDays): void {
    for (const [day, durationMs] of Object.entries(days)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(durationMs) || durationMs < 0) continue;
        player.playTime ??= { version: 1, days: {} };
        const existing = player.playTime.days[day];
        player.playTime.days[day] = (Number.isFinite(existing) && existing >= 0 ? existing : 0) + durationMs;
    }
}

/** No historical inference: only an explicitly observed interval creates a day. */
export function recordPlayTime(player: Pick<PlayerState, 'playTime'>, fromMs: number, toMs: number): void {
    addPlayTimeDays(player, splitPlayTime(fromMs, toMs));
}

/** Detached co-op lane saves must retain time already persisted for this same hero. */
export function preservePlayTime(player: PlayerState, stored: PlayerState | undefined): void {
    if (!player.gameplayProfileId || player.gameplayProfileId !== stored?.gameplayProfileId || !stored.playTime) return;
    for (const [day, durationMs] of Object.entries(stored.playTime.days)) {
        if (!Number.isFinite(durationMs) || durationMs < 0) continue;
        player.playTime ??= { version: 1, days: {} };
        const current = player.playTime.days[day];
        player.playTime.days[day] = Math.max(Number.isFinite(current) && current >= 0 ? current : 0, durationMs);
    }
}

type PendingTime = { participant: PlayTimeParticipant; player: Pick<PlayerState, 'playTime'> };

/** Pure clock/accounting. It has no consent, network, storage or input-event dependency. */
export class LocalPlayTimeTracker {
    private clock = new ActivityClock();
    private previousParticipants: PlayTimeParticipant[] = [];
    private pending = new Map<string, PendingTime>();
    private sampling = false;
    private lastFlushMs: number | null = null;

    constructor(private readonly persist: (participant: PlayTimeParticipant, days: PlayTimeDays) => boolean) {}

    sample(wallMs: number, monotonicMs: number, context: PlayTimeContext, flush = true): void {
        // Save observers can synchronously save or swap profiles while a checkpoint writes.
        if (this.sampling) return;
        this.sampling = true;
        try {
            if (!Number.isFinite(wallMs) || !Number.isFinite(monotonicMs)) {
                this.clock = new ActivityClock();
                this.previousParticipants = [];
                return;
            }
            const active = context.active && !context.preview;
            const interval = this.clock.sample(wallMs, monotonicMs, active ? 'game-active' : 'paused');
            if (interval?.state === 'game-active' && interval.durationMs > 0) {
                for (const participant of this.previousParticipants) {
                    const key = `${participant.slotIndex}:${participant.profileId}`;
                    const pending = this.pending.get(key) ?? { participant, player: {} };
                    // Monotonic elapsed time is authoritative; a small system-clock adjustment
                    // must not add/subtract play time. ActivityClock rejects sleep/clock-jump gaps.
                    recordPlayTime(pending.player, interval.start, interval.start + interval.durationMs);
                    this.pending.set(key, pending);
                }
            }
            this.previousParticipants = active ? [...new Map(context.participants
                .filter(p => p.slotIndex >= 0 && p.profileId)
                .map(p => [`${p.slotIndex}:${p.profileId}`, { ...p }])).values()] : [];
            this.lastFlushMs ??= monotonicMs;
            if (!context.preview && (flush || monotonicMs - this.lastFlushMs >= 15_000)) {
                // Remove before callbacks: a nested save can never apply an interval twice.
                const pending = this.pending;
                this.pending = new Map();
                for (const [key, entry] of pending) {
                    if (!this.persist(entry.participant, entry.player.playTime!.days)) this.pending.set(key, entry);
                }
                this.lastFlushMs = monotonicMs;
            }
        } finally {
            this.sampling = false;
        }
    }
}
