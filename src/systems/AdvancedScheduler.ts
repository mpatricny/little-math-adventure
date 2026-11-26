import type { BandId, MasteryAttempt, MasteryData, ProblemDefinition, SubAtomId } from '../types';
import { advancedEvidence } from './AdvancedAssessment';
import { ADVANCED_NODES, getAdvancedProblem, isAdvancedNode, type AdvancedNodeId, type AdvancedStage } from './AdvancedCurriculum';
import { ProblemDatabase } from './ProblemDatabase';
import { canDrawPracticeNumbers, practiceNumberMask, recentPracticeNumbers, rememberPracticeNumbers } from './PracticeNumberLimits';

interface StageProgress {
    introSeen: boolean;
    recent: { key: string; correct: boolean; independent: boolean }[];
    correctDirections: string[];
    qualified: boolean;
    secure: boolean;
    reviewAfter?: number;
    retryAfter?: number;
    failedKey?: string;
    lastIssued: number;
    lastResponseMs: number;
    support: boolean;
    pending: string[];
}
export interface AdvancedNodeProgress {
    current: number;
    issued: number;
    recentKeys: string[];
    stages: Record<string, StageProgress>;
    bandExamReview?: string;
}

function progressFor(data: MasteryData, id: AdvancedNodeId): AdvancedNodeProgress {
    const nodes = data.advancedStages ??= {};
    if (nodes[id]) return nodes[id]!;
    const stages = ADVANCED_NODES[id].stages;
    const mastered = ['secure', 'fluent', 'mastery'].includes(data.subAtoms[id]?.state);
    const state: AdvancedNodeProgress = { current: mastered ? stages.length - 1 : 0, issued: 0, recentKeys: [], stages: {} };
    for (const [index, stage] of stages.entries()) {
        state.stages[stage.id] = {
            introSeen: mastered, recent: [], correctDirections: mastered ? [...stage.directions] : [],
            qualified: mastered, secure: mastered, support: false, lastIssued: 0, lastResponseMs: 0,
            pending: !mastered && index === 0 ? [stage.anchorKey, stage.transferKey] : [],
        };
    }
    return nodes[id] = state;
}

export function advancedIntroduction(data: MasteryData, key: string) {
    const problem = getAdvancedProblem(key);
    if (!problem?.advanced || !isAdvancedNode(problem.subAtomId)) return undefined;
    const state = progressFor(data, problem.subAtomId);
    const stage = ADVANCED_NODES[problem.subAtomId].stages[state.current];
    const record = state.stages[stage.id];
    if (record.introSeen || stage.id !== problem.advanced.stageId) return undefined;
    return { lines: stage.demo, complete: () => { record.introSeen = true; } };
}

const expression = (key: string) => key.slice(key.lastIndexOf(':') + 1);
function transferExample(stage: AdvancedStage, key: string): boolean {
    const task = expression(key);
    return !stage.demoExpressions.includes(task) && expression(stage.anchorKey) !== task && expression(stage.transferKey) !== task;
}

/** Evidence is applied once per scored presentation. A started batch keeps its original questions. */
export function recordAdvancedAttempt(data: MasteryData, problem: ProblemDefinition, attempt: MasteryAttempt): void {
    const meta = problem.advanced;
    const id = problem.subAtomId;
    if (!meta || meta.role !== 'target' || !isAdvancedNode(id) || attempt.synthetic ||
        !['battle', 'battle_sword', 'battle_block', 'battle_pet', 'shop_prep_shield', 'shop_prep_sword'].includes(attempt.context)) return;
    const state = progressFor(data, id);
    const stages = ADVANCED_NODES[id].stages;
    const stage = stages.find(s => s.id === meta.stageId)!;
    const record = state.stages[stage.id];
    const independent = attempt.correct && !attempt.assisted && !attempt.observation?.assisted;
    const previous = record.recent.at(-1);
    record.recent.push({ key: problem.key, correct: attempt.correct, independent });
    record.recent = record.recent.slice(-4);
    record.lastResponseMs = attempt.responseTimeMs;

    if (!attempt.correct) {
        record.failedKey = problem.key;
        record.retryAfter = attempt.sequenceIndex + 4;
        if (record.qualified && !record.secure) record.reviewAfter = record.retryAfter;
        if (!record.support && record.recent.filter(a => !a.correct).length >= 2) {
            record.support = true;
            record.pending = [...stage.supportKeys];
        }
        return;
    }
    if (!independent) return;
    if (!record.correctDirections.includes(meta.direction)) record.correctDirections.push(meta.direction);
    if (record.retryAfter !== undefined && attempt.sequenceIndex >= record.retryAfter && record.failedKey !== problem.key &&
        getAdvancedProblem(record.failedKey!)?.advanced?.family === meta.family) {
        delete record.retryAfter;
        delete record.failedKey;
    }
    if (record.qualified && record.reviewAfter !== undefined && attempt.sequenceIndex >= record.reviewAfter &&
        problem.key !== previous?.key && problem.key !== record.failedKey) {
        record.secure = true;
        delete record.reviewAfter;
    }
    if (!previous?.independent || previous.key === problem.key) return;
    record.support = false;
    if (state.bandExamReview === stage.id) delete state.bandExamReview;
    if (record.qualified || stage.id !== stages[state.current].id ||
        !transferExample(stage, previous.key) || !transferExample(stage, problem.key)) return;
    record.qualified = true;
    record.reviewAfter = attempt.sequenceIndex + 4;
    if (state.current < stages.length - 1) {
        const next = stages[++state.current];
        state.stages[next.id].pending = [next.anchorKey, next.transferKey];
    }
}

/** Breadth (four distinct tasks per group) is checked alongside these stage gates by MasterySystem. */
export function advancedNodeReady(data: MasteryData, id: SubAtomId): boolean {
    if (!isAdvancedNode(id)) return false;
    const state = data.advancedStages?.[id];
    return !!state && ADVANCED_NODES[id].stages.every(stage => {
        const record = state.stages[stage.id];
        return record?.secure && stage.directions.every(direction => record.correctDirections.includes(direction));
    });
}

export function focusAdvancedExamRetry(data: MasteryData, id: SubAtomId | BandId, context: MasteryAttempt['context'], count: number): void {
    if (!isAdvancedNode(id) && !isAdvancedNode(id + '1')) return;
    const recent = advancedEvidence(data, id).filter(r => r.attempt.context === context).slice(-count);
    const outcomes = new Map<string, { count: number; misses: number; lastMiss?: string }>();
    for (const { key, node, group, attempt } of recent) {
        const bucket = node + '/' + group;
        const result = outcomes.get(bucket) ?? { count: 0, misses: 0 };
        result.count++;
        if (!attempt.correct) { result.misses++; result.lastMiss = key; }
        outcomes.set(bucket, result);
    }
    const weakest = [...outcomes.values()].filter(r => r.lastMiss).sort((a,b) => b.misses / b.count - a.misses / a.count)[0];
    const problem = weakest?.lastMiss && getAdvancedProblem(weakest.lastMiss);
    if (!problem || !isAdvancedNode(problem.subAtomId)) return;
    const stage = ADVANCED_NODES[problem.subAtomId].stages.find(s => s.id === problem.advanced!.stageId)!;
    const state = progressFor(data, problem.subAtomId);
    if (id.length === 1) {
        for (const [key, node] of Object.entries(data.advancedStages!)) {
            if (key[0] === id && node) delete node.bandExamReview;
        }
        state.bandExamReview = stage.id;
    }
    const record = state.stages[stage.id];
    record.support = true;
    record.recent = [];
    record.pending = [...stage.supportKeys];
    record.failedKey = problem.key;
    record.retryAfter = data.globalSolveSequence;
}

export function advancedProgressTarget(data: MasteryData, frontier: AdvancedNodeId): AdvancedNodeId {
    for (const [key, state] of Object.entries(data.advancedStages ?? {})) {
        if (key[0] === frontier[0] && state?.bandExamReview && isAdvancedNode(key)) return key;
    }
    return frontier;
}

function dueAt(progress: StageProgress): number {
    return Math.min(progress.reviewAfter ?? Infinity, progress.retryAfter ?? Infinity);
}

/** Deal only the requested positions. The per-child cursor also spans single-question turns. */
export function drawAdvancedKeys(data: MasteryData, id: AdvancedNodeId, count: number, practice = false): string[] {
    const state = progressFor(data, id);
    const stages = ADVANCED_NODES[id].stages.slice(0, state.current + 1);
    const current = stages[stages.length - 1];
    const recentNumbers = recentPracticeNumbers(data);
    const all = ProblemDatabase.getInstance().getAllProblems(id);
    const canUse = (p: ProblemDefinition) => !practice || canDrawPracticeNumbers(practiceNumberMask(p), recentNumbers);
    const issued: string[] = [];
    const reviewsIssued = new Set<string>();
    const allQualified = stages.length === ADVANCED_NODES[id].stages.length && stages.every(s => state.stages[s.id].qualified);
    for (let i = 0; i < count; i++) {
        const ordered = [...stages].sort((a,b) => state.stages[a.id].lastIssued - state.stages[b.id].lastIssued);
        const pending = stages.find(s => state.stages[s.id].pending.length);
        const reviewSlot = state.issued % 3 === 2;
        const due = ordered.filter(s => !reviewsIssued.has(s.id) && dueAt(state.stages[s.id]) <= data.globalSolveSequence + 1)
            .sort((a,b) => dueAt(state.stages[a.id]) - dueAt(state.stages[b.id]) || state.stages[b.id].lastResponseMs - state.stages[a.id].lastResponseMs);
        const supporting = ordered.find(s => state.stages[s.id].support && !reviewsIssued.has(s.id));
        const previous = ordered.find(s => s !== current);
        const stage = pending ?? supporting ?? (reviewSlot ? due[0] ?? previous : undefined) ?? (allQualified ? ordered[0] : current);
        const record = state.stages[stage.id];
        let pick: ProblemDefinition | undefined;
        while (record.pending.length && !pick) {
            const candidate = getAdvancedProblem(record.pending.shift()!);
            if (candidate && canUse(candidate)) pick = candidate;
        }
        if (!pick) {
            let pool = all.filter(p => p.advanced?.stageId === stage.id && p.advanced.role === 'target' && canUse(p));
            const prefer = (predicate: (p: ProblemDefinition) => boolean) => {
                const subset = pool.filter(predicate);
                if (subset.length) pool = subset;
            };
            if (!record.qualified) prefer(p => transferExample(stage, p.key));
            if (record.failedKey && (supporting === stage || due.includes(stage))) {
                const family = getAdvancedProblem(record.failedKey)?.advanced?.family;
                prefer(p => p.advanced!.family === family && p.key !== record.failedKey);
            }
            prefer(p => expression(p.key) !== expression(state.recentKeys.at(-1) ?? ''));
            prefer(p => !record.correctDirections.includes(p.advanced!.direction));
            prefer(p => !state.recentKeys.some(key => expression(key) === expression(p.key)));
            if (!pool.length) throw new Error('No available arithmetic variant for ' + id + '/' + stage.id);
            pick = pool[Math.floor(Math.random() * pool.length)];
            if (reviewSlot || supporting === stage) reviewsIssued.add(stage.id);
        }
        record.lastIssued = ++state.issued;
        state.recentKeys = [...state.recentKeys.slice(-5), pick.key];
        issued.push(pick.key);
        if (practice) rememberPracticeNumbers(recentNumbers, practiceNumberMask(pick));
    }
    if (practice && data.practice) data.practice.recentNumberMasks = recentNumbers;
    return issued;
}
