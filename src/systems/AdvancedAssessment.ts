import type { ExamType, MasteryAttempt, MasteryData, SubAtomId } from '../types';
import { ALL_SUB_ATOM_NUMBERS, EXAM_CONFIGS } from '../types';
import { drawAdvancedExamKeys, getAdvancedProblem, isAdvancedNode, type AdvancedNodeId } from './AdvancedCurriculum';

export type Group = 0 | 1;
export interface AdvancedEvidence {
    key: string;
    node: AdvancedNodeId;
    group: Group;
    attempt: MasteryAttempt;
}

/** Only real answers to the target family can demonstrate independent transfer. */
export function advancedEvidence(data: MasteryData, id: string, since = -1): AdvancedEvidence[] {
    const evidence: AdvancedEvidence[] = [];
    for (const record of Object.values(data.problemRecords)) {
        if (record.subAtomId !== id && record.subAtomId[0] !== id) continue;
        const node = record.subAtomId;
        if (!isAdvancedNode(node)) continue;
        const meta = getAdvancedProblem(record.problemKey)?.advanced;
        if (meta?.role !== 'target') continue;
        for (const attempt of record.attempts) {
            if (!attempt.synthetic && attempt.sequenceIndex > since) evidence.push({ key: record.problemKey, node, group: meta.group, attempt });
        }
    }
    return evidence.sort((a, b) => a.attempt.sequenceIndex - b.attempt.sequenceIndex);
}

export function advancedIndependent(entry: AdvancedEvidence): boolean {
    return entry.attempt.correct && !entry.attempt.assisted && !entry.attempt.observation?.assisted;
}

export function distinctAdvancedSuccesses(evidence: AdvancedEvidence[]): number[] {
    return ([0, 1] as const).map(group => new Set(evidence
        .filter(e => e.group === group && advancedIndependent(e)).map(e => e.key)).size);
}

interface Quota { node: AdvancedNodeId; count: number }

/** Same proportions for live Guild exams and the per-player co-op evidence window. */
export function advancedExamPlan(type: ExamType, target: string): Quota[] {
    if (isAdvancedNode(target)) return [{ node: target, count: EXAM_CONFIGS[type].itemCount }];
    if (type !== 'band_gate' && type !== 'band_mastery') return [];
    return ALL_SUB_ATOM_NUMBERS.flatMap(n => {
        const node = `${target}${n}` as SubAtomId;
        return isAdvancedNode(node) ? [{ node, count: type === 'band_mastery' && n <= 2 ? 4 : 3 }] : [];
    });
}

function quotas(q: Quota): [number, number] {
    return [Math.ceil(q.count / 2), Math.floor(q.count / 2)];
}

/** Take the latest distinct problems per group. Unrelated practice cannot displace a missing group. */
export function advancedCoopWindow(plan: Quota[], evidence: AdvancedEvidence[]): AdvancedEvidence[] {
    const selected: AdvancedEvidence[] = [];
    for (const q of plan) {
        const counts = quotas(q);
        for (const group of [0, 1] as const) {
            const recent = new Map<string, AdvancedEvidence>();
            for (const entry of evidence) if (entry.node === q.node && entry.group === group) {
                recent.delete(entry.key);
                recent.set(entry.key, entry);
            }
            selected.push(...[...recent.values()].slice(-counts[group]));
        }
    }
    return selected;
}

export function drawAdvancedCoopKeys(plan: Quota[], evidence: AdvancedEvidence[], count: number): string[] {
    const recent = advancedCoopWindow(plan, evidence);
    const seen = new Set(recent.map(e => e.key));
    const candidates = plan.flatMap(q => {
        const keys = drawAdvancedExamKeys(q.node, q.count);
        const limits = quotas(q);
        return keys.map(key => {
            const group = getAdvancedProblem(key)!.advanced!.group;
            const sample = recent.filter(entry => entry.node === q.node && entry.group === group);
            const missing = limits[group] - sample.length;
            const oldest = sample[0]?.attempt.sequenceIndex ?? -1;
            return { key, missing, oldest, seen: seen.has(key) };
        });
    });
    candidates.sort((a, b) => b.missing - a.missing || Number(a.seen) - Number(b.seen) || a.oldest - b.oldest);
    return candidates.slice(0, count).map(candidate => candidate.key);
}
