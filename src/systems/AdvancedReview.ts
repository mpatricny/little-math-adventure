import type { MasteryData, ProblemDefinition, SubAtomId } from '../types';
import { ALL_BANDS, ALL_SUB_ATOM_NUMBERS } from '../types';
import { ADVANCED_NODES, isAdvancedNode, type AdvancedNodeId } from './AdvancedCurriculum';
import { ProblemDatabase } from './ProblemDatabase';

/** Defense and the falling-mana game ask for familiar arithmetic. Reading this
 * pool must never deal the pending introduction or advance the attack scheduler. */
export function knownAdvancedArithmetic(data: MasteryData, node: AdvancedNodeId, simpleOnly: boolean, pinned = false): ProblemDefinition[] {
    const db = ProblemDatabase.getInstance();
    const valid = (p: ProblemDefinition) => !simpleOnly ||
        (p.form === 'result_unknown' && p.operand3 === undefined && p.operand1 > 0 && p.operand2 > 0 && p.answer > 0);
    const learned = (id: SubAtomId) => ['secure','fluent','mastery'].includes(data.subAtoms[id]?.state);
    const known = (id: SubAtomId) => {
        const candidates = db.getAllProblems(id).filter(p => valid(p) && (p.advanced ? p.advanced.role === 'target' : p.form === 'result_unknown'));
        const solved = candidates.filter(p => {
            const attempts = data.problemRecords[p.key]?.attempts;
            const latest = attempts?.filter(a => !a.synthetic).at(-1);
            return latest?.correct && !latest.assisted;
        });
        if (simpleOnly && isAdvancedNode(id) && solved.length) {
            // The twenty-item mana deck varies facts in a demonstrated family.
            // Defense can select the exact previously answered problem.
            const families = new Set(solved.map(p => p.advanced!.family));
            return candidates.filter(p => families.has(p.advanced!.family));
        }
        if (solved.length) return solved;
        if (learned(id)) return candidates;
        if (!isAdvancedNode(id)) return [];
        const stages = data.advancedStages?.[id]?.stages;
        return candidates.filter(p => stages?.[p.advanced!.stageId]?.secure);
    };

    const current = known(node);
    if (current.length) return current;
    const firstAnchor = db.getProblemByKey(ADVANCED_NODES[node].stages[0].anchorKey)!;
    if (pinned && valid(firstAnchor)) return [firstAnchor];

    // Immediately after a gate (notably E → F1), no new fact has been
    // independently answered. The previous earned node supplies the known task.
    const order = ALL_BANDS.flatMap(band => ALL_SUB_ATOM_NUMBERS.map(n => `${band}${n}` as SubAtomId));
    for (const earlier of order.slice(0, order.indexOf(node)).reverse()) {
        if (!learned(earlier)) continue;
        const candidates = known(earlier);
        if (candidates.length) return candidates;
    }
    return valid(firstAnchor) ? [firstAnchor] : [];
}
