import { isAdvancedNode } from './AdvancedCurriculum';
import { advancedEvidence } from './AdvancedAssessment';
import {
    ALL_BANDS, ALL_PROBLEM_FORMS, ALL_SUB_ATOM_NUMBERS,
    type BandId, type LearningMode, type MasteryData, type MasteryState,
    type PlayerState, type PracticeTargetId, type SubAtomId,
} from '../types';
import { getFoxJourney } from './FoxAbilitySystem';
import { getLearningBand, isLearningBandDeferred } from './LearningProgress';
import { getThresholdsForSubAtom } from './MasteryThresholds';

export type CatacombChallenge = 'fluency_challenge' | 'mastery_challenge';
export const CATACOMB_REQUIREMENTS = {
    fluency_challenge: { solves: 30, accuracy: 0.85, formAccuracy: 0.80, forms: 2 },
    mastery_challenge: { solves: 50, accuracy: 0.92, formAccuracy: 0.90, forms: 2 },
} as const;
const MAX_TIMED_MS = 20000;

export interface PracticeRequirement {
    value: number | null;
    target: number;
    /** Always grows toward 1, including when a response time gets smaller. */
    progress: number;
    met: boolean;
}
export interface CatacombReadiness {
    targetId: PracticeTargetId;
    challenge: CatacombChallenge;
    prerequisiteMet: boolean;
    ready: boolean;
    percentage: number;
    speed: PracticeRequirement;
    accuracy: PracticeRequirement;
    solves: PracticeRequirement;
    forms: PracticeRequirement;
}
export interface PracticeTarget {
    targetId: PracticeTargetId;
    state: MasteryState;
    /** Existing mastery is retained; practising it never re-awards the old trial. */
    completed: boolean;
    readiness: CatacombReadiness;
}
export type PracticeSelection = { mode: 'progress' } | { mode: 'practice'; targetId: PracticeTargetId };
type FoxProgress = Pick<PlayerState, 'catacombFoxJourney'>;
export interface PracticeOverview {
    selection: PracticeSelection;
    /** Valid module a compact Trénovat toggle would resume, even while Dál is selected. */
    practiceTargetId?: PracticeTargetId;
    available: boolean;
    allMastered: boolean;
    remainingCount: number;
    introductionAvailable: boolean;
    introductionSeen: boolean;
    /** All valid targets, including mastered modules for voluntary maintenance. */
    targets: PracticeTarget[];
    recommendations: PracticeTarget[];
}

function bounded(value: number): number { return Math.max(0, Math.min(1, value)); }
function minimum(value: number | null, target: number): PracticeRequirement {
    return { value, target, met: value !== null && value >= target,
        progress: value === null ? 0 : bounded(value / target) };
}
function median(times: number[]): number | null {
    const sorted = times.filter(t => Number.isFinite(t) && t > 0 && t <= MAX_TIMED_MS).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length ? sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2 : null;
}

/** Includes mastered targets for completion detection, but never placement-only or deferred work. */
export function getOpenPracticeTargets(data: MasteryData): PracticeTargetId[] {
    const floor = Math.max(0, ALL_BANDS.indexOf(data.selectedStartBand ?? 'A'));
    const result: PracticeTargetId[] = [];
    for (const band of ALL_BANDS.slice(floor)) {
        if (!data.bands[band] || data.bands[band].state === 'locked' || isLearningBandDeferred(data, band)) continue;
        for (const n of ALL_SUB_ATOM_NUMBERS) {
            // The learning map introduces comparison after A2, before A3.
            if (band === 'A' && n === 3 && data.comparisonChapter && data.comparisonChapter.status !== 'locked') {
                result.push('comparison_symbols');
            }
            const id = `${band}${n}` as SubAtomId;
            if (data.subAtoms[id] && data.subAtoms[id].state !== 'locked'
                && !(band === 'A' && n > 2 && data.comparisonChapter?.status !== 'complete')) result.push(id);
        }
    }
    return result;
}

export function getPracticeTargetState(data: MasteryData, id: PracticeTargetId): MasteryState {
    if (id !== 'comparison_symbols') return data.subAtoms[id]?.state ?? 'locked';
    const chapter = data.comparisonChapter;
    if (!chapter || chapter.status === 'locked') return 'locked';
    if (chapter.status !== 'complete') return 'training';
    return chapter.masteryChallengeResult === 'pass' ? 'mastery'
        : chapter.fluencyChallengeResult === 'pass' ? 'fluent' : 'secure';
}

interface Attempt {
    sequenceIndex: number; correct: boolean; responseTimeMs: number;
    form: string; assisted?: boolean; context?: string;
}
function attemptsFor(data: MasteryData, id: PracticeTargetId): Attempt[] {
    if (isAdvancedNode(id)) return advancedEvidence(data, id).map(entry => ({
        ...entry.attempt, assisted: entry.attempt.assisted || entry.attempt.observation?.assisted,
        form: String(entry.group),
    }));
    const arithmetic = Object.values(data.problemRecords)
        .filter(record => id === 'comparison_symbols' ? record.form.startsWith('compare_') : record.subAtomId === id)
        .flatMap(record => record.attempts.map(attempt => ({ ...attempt, form: record.form })));
    const chapter = id === 'comparison_symbols' ? (data.comparisonChapter?.attempts ?? [])
        .filter(attempt => !attempt.diagnosticMode).map(attempt => ({ ...attempt, form: attempt.representation })) : [];
    return [...arithmetic, ...chapter].sort((a, b) => a.sequenceIndex - b.sequenceIndex);
}

/** This is also the runtime unlock predicate: UI does not estimate eligibility separately. */
export function getCatacombReadiness(data: MasteryData, targetId: PracticeTargetId, challenge: CatacombChallenge): CatacombReadiness {
    const requirements = CATACOMB_REQUIREMENTS[challenge];
    const mastery = challenge === 'mastery_challenge';
    const comparison = targetId === 'comparison_symbols';
    const advanced = isAdvancedNode(targetId);
    const thresholds = getThresholdsForSubAtom(comparison ? 'A3' : targetId);
    const targetMs = mastery ? thresholds.masteryRT : thresholds.fluentRT;
    const attempts = attemptsFor(data, targetId);
    const recent = attempts.slice(-20);
    const correct = (a: Attempt) => a.correct && !a.assisted;
    const times = (sample: Attempt[]) => sample.filter(a => correct(a) && a.context !== 'underwater_bell').map(a => a.responseTimeMs);
    // Preserve the existing chapter evidence window; arithmetic uses its latest 20 answers.
    const medianMs = median(times(comparison ? attempts : recent));
    const accuracy = recent.length ? recent.filter(correct).length / recent.length : null;
    const solves = comparison || advanced ? attempts.filter(correct).length : data.subAtoms[targetId]?.successfulSolves ?? 0;
    const formIds = advanced ? ['0', '1'] : comparison ? [...new Set(attempts.map(a => a.form))] : ALL_PROBLEM_FORMS;
    const formRatios = formIds.map(form => {
        const sample = attempts.filter(a => a.form === form).slice(comparison ? -20 : -10);
        if (advanced && sample.length < 4) return 0;
        const accuracyRatio = sample.length ? sample.filter(correct).length / sample.length / requirements.formAccuracy : 0;
        const rt = median(times(sample));
        return Math.min(bounded(accuracyRatio), mastery ? rt === null ? 0 : bounded(targetMs / rt) : 1);
    });
    const forms = minimum(formRatios.filter(ratio => ratio >= 1).length, requirements.forms);
    // Partial progress in the two strongest forms, without inventing a qualifying form.
    forms.progress = formRatios.sort((a, b) => b - a).slice(0, requirements.forms)
        .reduce((sum, ratio) => sum + ratio, 0) / requirements.forms;
    const state = getPracticeTargetState(data, targetId);
    // Trial eligibility retains its existing rules; placement limits only the practice picker.
    const accessible = comparison ? data.comparisonChapter?.status === 'complete'
        : state !== 'locked' && !isLearningBandDeferred(data, targetId[0] as BandId)
            && !(targetId[0] === 'A' && Number(targetId[1]) > 2 && data.comparisonChapter?.status !== 'complete');
    const prerequisiteMet = accessible && state === (mastery ? 'fluent' : 'secure');
    const speed: PracticeRequirement = { value: medianMs, target: targetMs,
        met: medianMs !== null && medianMs <= targetMs,
        progress: medianMs === null ? 0 : bounded(targetMs / medianMs) };
    const result = { targetId, challenge, prerequisiteMet, speed, accuracy: minimum(accuracy, requirements.accuracy),
        solves: minimum(solves, requirements.solves), forms };
    const gates = [speed, result.accuracy, result.solves, forms];
    const ready = prerequisiteMet && gates.every(gate => gate.met);
    return { ...result, ready, percentage: ready ? 100 : Math.min(99, Math.floor(100 * Math.min(...gates.map(gate => gate.progress)))) };
}

export function getPracticeTargets(data: MasteryData): PracticeTarget[] {
    return getOpenPracticeTargets(data).map(targetId => {
        const state = getPracticeTargetState(data, targetId);
        return { targetId, state, completed: state === 'mastery', readiness: getCatacombReadiness(data, targetId,
            state === 'fluent' || state === 'mastery' ? 'mastery_challenge' : 'fluency_challenge') };
    }).sort((a, b) => Number(a.completed) - Number(b.completed)
        || Number(b.readiness.ready) - Number(a.readiness.ready)
        || Number(b.readiness.prerequisiteMet) - Number(a.readiness.prerequisiteMet)
        || b.readiness.percentage - a.readiness.percentage
        || a.targetId.localeCompare(b.targetId));
}

export function preferredPracticeTarget(data: MasteryData, player: FoxProgress = {}): PracticeTargetId | undefined {
    const open = getOpenPracticeTargets(data);
    const pinned = data.practice?.pinnedTargetId;
    if (pinned && open.includes(pinned)) return pinned;
    const { tiers } = getFoxJourney(player);
    return open.find(target => tiers[target] !== 2);
}

export function getPracticeSelection(data: MasteryData, player: FoxProgress = {}): PracticeSelection {
    const targetId = data.practice?.mode === 'practice' ? preferredPracticeTarget(data, player) : undefined;
    return targetId ? { mode: 'practice', targetId } : { mode: 'progress' };
}

/** Mutates only preference and unanswered practice cache, never earned progress or the progression pool. */
export function setPracticeSelection(data: MasteryData, mode: LearningMode, targetId?: PracticeTargetId, player: FoxProgress = {}): boolean {
    if (mode !== 'progress' && mode !== 'practice') return false;
    if (targetId && !getOpenPracticeTargets(data).includes(targetId)) return false;
    const target = mode === 'practice' ? targetId ?? preferredPracticeTarget(data, player) : undefined;
    if (mode === 'practice' && !target) return false;
    const same = data.practice?.mode === mode && data.practice?.targetId === target;
    data.practice = { mode, ...(target ? { targetId: target } : {}),
        pinnedTargetId: targetId ?? data.practice?.pinnedTargetId,
        defaultMode: data.practice?.defaultMode,
        lastTargetId: target ?? data.practice?.targetId ?? data.practice?.lastTargetId,
        introductionSeen: data.practice?.introductionSeen === true,
        recentNumberMasks: data.practice?.recentNumberMasks,
        ...(same ? { pool: data.practice?.pool, comparisonCursor: data.practice?.comparisonCursor } : {}) };
    return true;
}

/** A new automatic target starts a fresh practice pool, without pinning that target. */
export function reconcilePracticeSelection(data: MasteryData, player: FoxProgress = {}): PracticeSelection {
    const selection = getPracticeSelection(data, player);
    if (data.practice?.mode === 'practice' && (selection.mode === 'progress' || selection.targetId !== data.practice.targetId)) {
        setPracticeSelection(data, selection.mode, undefined, player);
    }
    return selection;
}

export function getPracticeOverview(data: MasteryData, level: number, player: FoxProgress = {}): PracticeOverview {
    const targets = getPracticeTargets(data);
    const band = getLearningBand(data);
    const unfinished = targets.filter(target => !target.completed);
    const olderUnmastered = unfinished.some(target => (target.targetId === 'comparison_symbols' ? 'A' : target.targetId[0]) < band);
    const practiceTargetId = preferredPracticeTarget(data, player);
    const defaultMode = data.practice?.defaultMode ?? data.practice?.mode;
    const selection: PracticeSelection = defaultMode === 'practice' && practiceTargetId
        ? { mode: 'practice', targetId: practiceTargetId } : { mode: 'progress' };
    return { selection, practiceTargetId, available: !!practiceTargetId,
        allMastered: targets.length > 0 && unfinished.length === 0,
        remainingCount: unfinished.length, targets, recommendations: (unfinished.length ? unfinished : targets).slice(0, 3),
        introductionSeen: data.practice?.introductionSeen === true,
        introductionAvailable: targets.length > 0 && data.practice?.introductionSeen !== true && (level >= 5 || olderUnmastered) };
}
