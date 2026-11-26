import type { MasteryData, ProblemForm, SubAtomId } from '../types';

/** Evidence for summaries, independent of placement counters and mastery windows. */
export interface LearningHistoryAttempt {
    source: 'mastery' | 'comparison';
    problemKey: string;
    timestamp: number;
    correct: boolean;
    responseTimeMs: number;
    sequenceIndex?: number;
    /** Unknown in older arithmetic history; only explicit assistance is excluded from speed. */
    assisted?: boolean;
    context?: string;
    clockUncertain?: boolean;
    subAtomId?: SubAtomId;
    form?: ProblemForm;
}

export interface LearningHistory {
    version: 1;
    attempts: LearningHistoryAttempt[];
    /** Provenance of a verified, additive recovery. Never grants game progress. */
    recovery?: { source: string; recoveredAt: number; attempts: number };
}

/** Older repaired saves may renumber attempts. Their answer evidence is stable. */
export function learningAttemptKey(attempt: LearningHistoryAttempt): string {
    return JSON.stringify([attempt.source, attempt.problemKey, attempt.timestamp,
        attempt.correct, Math.round(attempt.responseTimeMs * 100000) / 100000]);
}

function valid(attempt: LearningHistoryAttempt): boolean {
    return (attempt.source === 'mastery' || attempt.source === 'comparison')
        && typeof attempt.problemKey === 'string' && typeof attempt.correct === 'boolean'
        && Number.isFinite(attempt.timestamp) && attempt.timestamp > 0 && Number.isFinite(new Date(attempt.timestamp).getTime())
        && Number.isFinite(attempt.responseTimeMs) && attempt.responseTimeMs >= 0;
}

/** An older copy may know whether help appeared even when the live window does not. */
function preserveKnownMetadata(primary: LearningHistoryAttempt, other?: LearningHistoryAttempt): LearningHistoryAttempt {
    if (!other) return primary;
    return { ...primary, assisted: primary.assisted ?? other.assisted,
        context: primary.context ?? other.context, clockUncertain: primary.clockUncertain ?? other.clockUncertain,
        subAtomId: primary.subAtomId ?? other.subAtomId, form: primary.form ?? other.form };
}

/** Read-only union: recovered answers + current answers, with no duplicated copies. */
export function collectLearningAttempts(data: MasteryData | undefined): LearningHistoryAttempt[] {
    if (!data) return [];
    type Groups = Map<string, Map<number | 'legacy', LearningHistoryAttempt>>;
    const saved: Groups = new Map(), current: Groups = new Map();
    const add = (groups: Groups, attempt: LearningHistoryAttempt) => {
        if (!valid(attempt)) return;
        const key = learningAttemptKey(attempt);
        const group = groups.get(key) ?? new Map();
        if (Number.isSafeInteger(attempt.sequenceIndex)) {
            const copy = group.get(attempt.sequenceIndex!) ?? group.get('legacy');
            group.delete('legacy'); // A recovered unnumbered copy is not another answer.
            group.set(attempt.sequenceIndex!, preserveKnownMetadata(attempt, copy));
        } else if (!group.size || group.has('legacy')) {
            group.set('legacy', preserveKnownMetadata(attempt, group.get('legacy')));
        } else if (group.size === 1) {
            const [index, known] = [...group.entries()][0];
            group.set(index, preserveKnownMetadata(known, attempt));
        }
        groups.set(key, group);
    };
    if (data.learningHistory?.version === 1 && Array.isArray(data.learningHistory.attempts)) {
        data.learningHistory.attempts.forEach(attempt => add(saved, attempt));
    }
    for (const [key, record] of Object.entries(data.problemRecords ?? {})) {
        for (const attempt of record.attempts) {
            if (attempt.synthetic) continue;
            add(current, { source: 'mastery', problemKey: record.problemKey ?? key,
                timestamp: attempt.observation?.answeredAt ?? attempt.timestamp,
                correct: attempt.correct,
                responseTimeMs: attempt.observation?.responseTimeMs ?? attempt.responseTimeMs,
                assisted: attempt.assisted ?? attempt.observation?.assisted,
                context: attempt.context, clockUncertain: attempt.observation ? attempt.observation.clockQuality === 'uncertain' : undefined,
                sequenceIndex: attempt.sequenceIndex, subAtomId: record.subAtomId, form: record.form });
        }
    }
    for (const attempt of data.comparisonChapter?.attempts ?? []) {
        if (attempt.diagnosticMode) continue;
        add(current, { source: 'comparison', problemKey: `comparison:${attempt.stage}:${attempt.leftValue}:${attempt.rightValue}`,
            timestamp: attempt.observation?.answeredAt ?? attempt.timestamp, correct: attempt.correct,
            responseTimeMs: attempt.observation?.responseTimeMs ?? attempt.responseTimeMs,
            assisted: attempt.observation?.assisted ?? attempt.assisted,
            context: attempt.context, clockUncertain: attempt.observation ? attempt.observation.clockQuality === 'uncertain' : undefined,
            sequenceIndex: attempt.sequenceIndex });
    }
    // A synchronous result batch may contain the same task/time more than once.
    // Keep its distinct sequences, but do not sum copies from archive and save:
    // historical repairs can renumber those sequences without another answer.
    const answers: LearningHistoryAttempt[] = [];
    for (const key of new Set([...saved.keys(), ...current.keys()])) {
        const previous = saved.get(key), live = current.get(key);
        const group = live && live.size >= (previous?.size ?? 0) ? live : previous!;
        const other = group === live ? previous : live;
        for (const [index, attempt] of group) {
            const copy = group.size === 1 && other?.size === 1 ? [...other.values()][0] : other?.get(index);
            answers.push(preserveKnownMetadata(attempt, copy));
        }
    }
    return answers.sort((a, b) => a.timestamp - b.timestamp || (a.sequenceIndex ?? 0) - (b.sequenceIndex ?? 0));
}

/** Called before history windows can rotate and after a new first answer. */
export function retainLearningHistory(data: MasteryData): void {
    data.learningHistory = { ...data.learningHistory, version: 1, attempts: collectLearningAttempts(data) };
}
