import type { SaveSlotData } from '../types';

export type GameplayAttempt = {
    eventKey: string; source: 'mastery' | 'comparison'; sequenceIndex: number;
    timestamp: number; problemKey: string; context: string; correct: boolean;
    responseTimeMs: number; assisted: boolean; details: Record<string, unknown>;
};
export type GameplayProgress = { player: Record<string, unknown> & { name: string }; mathStats: Record<string, unknown> };
export type CapturedGameplay = { id: string; slotNumber: number; savedAt: number;
    progress: GameplayProgress; attempts: GameplayAttempt[] };

/** Placement counters are deliberately excluded: only individual recorded answers count. */
export function captureGameplay(slot: number, save: SaveSlotData): CapturedGameplay {
    const mastery = save.mathStats.masteryData;
    const attempts: GameplayAttempt[] = [];
    for (const record of Object.values(mastery?.problemRecords ?? {})) {
        for (const attempt of record.attempts) {
            if (attempt.synthetic) continue;
            attempts.push({
                eventKey: `mastery:${attempt.sequenceIndex}:${attempt.timestamp}:${record.problemKey}`,
                source: 'mastery', sequenceIndex: attempt.sequenceIndex, timestamp: attempt.timestamp,
                problemKey: record.problemKey, context: attempt.context, correct: attempt.correct,
                responseTimeMs: attempt.responseTimeMs, assisted: false,
                details: { form: record.form, subAtomId: record.subAtomId },
            });
        }
    }
    for (const attempt of mastery?.comparisonChapter?.attempts ?? []) {
        if (attempt.diagnosticMode) continue;
        const problemKey = `comparison:${attempt.stage}:${attempt.leftValue}:${attempt.rightValue}`;
        attempts.push({
            eventKey: `comparison:${attempt.sequenceIndex}:${attempt.timestamp}:${problemKey}`,
            source: 'comparison', sequenceIndex: attempt.sequenceIndex, timestamp: attempt.timestamp,
            problemKey, context: attempt.context, correct: attempt.correct,
            responseTimeMs: attempt.responseTimeMs, assisted: attempt.assisted,
            details: { ...attempt },
        });
    }
    // Answers have their own append-only table; snapshots stay small throughout a long game.
    const { problemStats: _problemStats, masteryData: _masteryData, ...stats } = save.mathStats;
    const { problemRecords: _records, comparisonChapter: chapter, ...masteryProgress } = mastery ?? {};
    const { attempts: _attempts, ...comparisonProgress } = chapter ?? {};
    return JSON.parse(JSON.stringify({
        id: save.player.gameplayProfileId!, slotNumber: slot + 1, savedAt: save.timestamp,
        progress: { player: save.player, mathStats: { ...stats,
            masteryData: { ...masteryProgress, comparisonChapter: comparisonProgress } } },
        attempts: attempts.filter(a => Number.isFinite(a.responseTimeMs) && a.responseTimeMs >= 0
            && a.responseTimeMs <= 86_400_000 && Number.isSafeInteger(a.sequenceIndex)),
    }));
}

export function gameplayId(): string {
    if (typeof globalThis.crypto?.randomUUID === 'function') return crypto.randomUUID();
    // HTTP LAN play can lack randomUUID; these are record identities, never credentials.
    return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c =>
        (+c ^ (Math.random() * 16 >> 0) >> (+c / 4)).toString(16));
}
