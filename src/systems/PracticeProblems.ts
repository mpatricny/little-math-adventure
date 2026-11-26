import { ALL_PROBLEM_FORMS, type MasteryData, type ProblemDefinition, type SubAtomId } from '../types';
import { ProblemDatabase } from './ProblemDatabase';
import { isAdvancedNode } from './AdvancedCurriculum';
import { drawAdvancedKeys } from './AdvancedScheduler';
import tuning from '../data/practice.json';
import { canDrawPracticeNumbers, practiceNumberMask, recentPracticeNumbers, rememberPracticeNumbers, PRACTICE_NUMBER_HISTORY_SIZE } from './PracticeNumberLimits';

/** Focused work uses its own cache; returning to Dál resumes the ordinary pool. */
export function drawPracticeProblemKeys(data: MasteryData, targetId: SubAtomId, count: number): string[] {
    const size = Number.isFinite(count) ? Math.max(0, Math.min(20, Math.floor(count))) : 0;
    if (!size) return [];
    if (isAdvancedNode(targetId)) return drawAdvancedKeys(data, targetId, size, true);
    const db = ProblemDatabase.getInstance();
    const state = data.subAtoms[targetId];
    // A single-operation module practises that fact and its missing operand.
    // Finishing the separate comparison chapter must not turn it into a comparison drill.
    const singleOperation = targetId[1] === '1' || targetId[1] === '2';
    const forms = ALL_PROBLEM_FORMS.filter(form => !(singleOperation && form.startsWith('compare_'))
        && !(targetId[1] === '3' && form === 'missing_part')
        && !(data.comparisonChapter?.status !== 'complete' && form.startsWith('compare_'))
        && !(form === 'compare_equation_vs_equation' && state.state !== 'fluent' && state.state !== 'mastery')
        && !(state.state === 'training' && state.successfulSolves < 10 && form.startsWith('compare_')));
    const allowed = (key: string): boolean => {
        const problem = db.getProblemByKey(key);
        return !!problem && problem.subAtomId === targetId && forms.includes(problem.form) && belongsToModule(problem, targetId);
    };
    const cache = data.practice?.pool;
    const recent = recentPracticeNumbers(data);
    // Upgrade an already started legacy deck without forgetting its just-issued rare values.
    if (!data.practice?.recentNumberMasks && cache && Array.isArray(cache.keys) && Number.isInteger(cache.index)) {
        for (const key of cache.keys.slice(0, Math.max(0, cache.index)).slice(-PRACTICE_NUMBER_HISTORY_SIZE)) {
            const problem = db.getProblemByKey(key);
            if (problem) rememberPracticeNumbers(recent, practiceNumberMask(problem));
        }
    }
    let pool: { targetId: SubAtomId; keys: string[]; index: number } = { targetId, keys: [], index: 0 };
    // Filter only the unconsumed tail; stale catalog entries must not skip valid questions.
    if (cache?.targetId === targetId && Array.isArray(cache.keys) && Number.isInteger(cache.index) && cache.index >= 0) {
        pool = { targetId, keys: cache.keys.slice(cache.index).filter(allowed), index: 0 };
    }
    const result: string[] = [];
    while (result.length < size) {
        if (pool.index >= pool.keys.length) {
            pool = { targetId, keys: createPool(data, db, targetId, forms, pool.keys, recent), index: 0 };
            if (pool.keys.length === 0) break;
        }
        const key = pool.keys[pool.index++];
        const mask = practiceNumberMask(db.getProblemByKey(key)!);
        // Revalidate old or restored queues at issue time, not only at deck boundaries.
        if (!canDrawPracticeNumbers(mask, recent)) continue;
        result.push(key);
        rememberPracticeNumbers(recent, mask);
    }
    if (data.practice) {
        data.practice.pool = pool;
        data.practice.recentNumberMasks = recent;
    }
    return result;
}

function belongsToModule(problem: ProblemDefinition, targetId: SubAtomId): boolean {
    const operation = targetId[1] === '1' ? '+' : targetId[1] === '2' ? '-' : null;
    return !operation || [problem.operator, problem.operator2, problem.operator3]
        .every(operator => operator === undefined || operator === operation);
}

function createPool(data: MasteryData, db: ProblemDatabase, targetId: SubAtomId,
    forms: ProblemDefinition['form'][], previous: string[], recent: number[]): string[] {
    const candidates = db.getAllProblems(targetId).filter(problem => forms.includes(problem.form) && belongsToModule(problem, targetId));
    const used = new Map<string, number>();
    const pool: string[] = [];
    const priority = (p: ProblemDefinition): number => data.retryPool.includes(p.key) ? 3
        : data.slowPool.includes(p.key) ? 2 : data.problemRecords[p.key] ? 0 : 1;
    // Randomize ties, then alternate forms so practice can satisfy the real coverage requirement.
    const shuffled = [...candidates];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    shuffled.sort((a, b) => priority(b) - priority(a) || Number(previous.includes(a.key)) - Number(previous.includes(b.key)));
    const planned = [...recent];
    for (let turn = 0; turn < tuning.poolSize; turn++) {
        const form = forms[(turn + data.globalSolveSequence) % forms.length];
        const legal = shuffled.filter(p => canDrawPracticeNumbers(practiceNumberMask(p), planned))
            .sort((a, b) => (used.get(a.key) ?? 0) - (used.get(b.key) ?? 0));
        // A small module may have only three non-trivial facts. Repeat those instead
        // of importing a different operation/band or relaxing the zero/one limits.
        const pick = legal.find(p => p.form === form && !used.has(p.key))
            ?? legal.find(p => !used.has(p.key)) ?? legal.find(p => p.form === form) ?? legal[0];
        if (!pick) break;
        pool.push(pick.key);
        used.set(pick.key, (used.get(pick.key) ?? 0) + 1);
        rememberPracticeNumbers(planned, practiceNumberMask(pick));
    }
    return pool;
}
