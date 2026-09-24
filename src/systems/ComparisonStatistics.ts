import type { ComparisonAttempt, ComparisonChapterState, ComparisonStageStatistics } from '../types';

const timed = (a: ComparisonAttempt) => a.correct && Number.isFinite(a.responseTimeMs)
    && a.responseTimeMs > 0 && a.responseTimeMs <= 20000;
const empty = (): ComparisonStageStatistics => ({ correct: 0, wrong: 0, timedCorrect: 0, totalTimeMs: 0 });

function add(stats: ComparisonStageStatistics, attempt: ComparisonAttempt): void {
    if (attempt.correct) stats.correct++; else stats.wrong++;
    if (timed(attempt)) { stats.timedCorrect++; stats.totalTimeMs += attempt.responseTimeMs; }
}

function counters(chapter: ComparisonChapterState): NonNullable<ComparisonChapterState['statistics']> {
    if (chapter.statistics) return chapter.statistics;
    const result: NonNullable<ComparisonChapterState['statistics']> = {};
    for (const attempt of chapter.attempts) {
        if (!attempt.diagnosticMode) add(result[attempt.stage] ??= empty(), attempt);
    }
    return result;
}

/** Call before appending/trimming history. Older saves seed only from actual retained answers. */
export function accumulateComparisonStatistics(chapter: ComparisonChapterState, attempt: ComparisonAttempt): void {
    chapter.statistics = counters(chapter);
    if (!attempt.diagnosticMode) add(chapter.statistics[attempt.stage] ??= empty(), attempt);
}

/** Same time window as the arithmetic map: correct answers up to 20 seconds. */
function summarize(attempts: ComparisonAttempt[], lifetime: ComparisonStageStatistics) {
    const ordered = [...attempts].sort((a, b) => b.sequenceIndex - a.sequenceIndex || b.timestamp - a.timestamp);
    const recent = ordered.slice(0, 20);
    const times = (items: ComparisonAttempt[]) => items.filter(timed).map(a => a.responseTimeMs);
    const recentTimes = times(recent).sort((a, b) => a - b);
    const middle = Math.floor(recentTimes.length / 2);
    const { correct, wrong, timedCorrect, totalTimeMs } = lifetime;
    const total = correct + wrong;
    return {
        total, correct, wrong,
        accuracy: total ? correct / total : null,
        recentAccuracy: recent.length ? recent.filter(a => a.correct).length / recent.length : null,
        medianMs: recentTimes.length ? (recentTimes.length % 2 ? recentTimes[middle]
            : (recentTimes[middle - 1] + recentTimes[middle]) / 2) : null,
        meanMs: timedCorrect ? totalTimeMs / timedCorrect : null,
    };
}

/** Read-only statistics from real first answers; demos/diagnostics never count as practice. */
export function getComparisonStatistics(chapter: ComparisonChapterState) {
    const attempts = chapter.attempts.filter(a => !a.diagnosticMode);
    const lifetime = counters(chapter);
    const total = Object.values(lifetime).reduce((sum, row) => ({
        correct: sum.correct + row.correct, wrong: sum.wrong + row.wrong,
        timedCorrect: sum.timedCorrect + row.timedCorrect, totalTimeMs: sum.totalTimeMs + row.totalTimeMs,
    }), empty());
    return {
        ...summarize(attempts, total),
        stages: chapter.stages.map(({ stage }) => ({ stage,
            ...summarize(attempts.filter(a => a.stage === stage), lifetime[stage] ?? empty()) })),
    };
}
