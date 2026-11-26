import { describe, expect, it } from 'vitest';
import type { MasteryAttempt, MasteryData, MathStats } from '../../types';
import { AdvancedNodeId, ADVANCED_NODES, getAdvancedProblem } from '../AdvancedCurriculum';
import { advancedIntroduction, advancedNodeReady, advancedProgressTarget, drawAdvancedKeys, focusAdvancedExamRetry, recordAdvancedAttempt } from '../AdvancedScheduler';
import { MasteryMigration } from '../MasteryMigration';

function fresh() {
    return MasteryMigration.migrateFromLevel(1, { problemStats: {} } as MathStats);
}
function answer(data: MasteryData, key: string, correct = true, extra: Partial<MasteryAttempt> = {}) {
    const sequenceIndex = ++data.globalSolveSequence;
    recordAdvancedAttempt(data, getAdvancedProblem(key)!, { correct, context: 'battle', sequenceIndex,
        responseTimeMs: 12000, timestamp: sequenceIndex, ...extra });
}

describe('adaptive arithmetic on a personal save', () => {
    it.each(Object.keys(ADVANCED_NODES) as AdvancedNodeId[])('%s reaches every stage with correct responses across turns and reloads', id => {
        let data = fresh();
        data.subAtoms[id].state = 'training';
        const intros: string[] = [];
        for (let turn = 0; turn < 100 && !advancedNodeReady(data,id); turn++) {
            const keys = drawAdvancedKeys(data, id, [1,3,2][turn % 3], turn % 2 === 0);
            for (const key of keys) {
                const intro = advancedIntroduction(data, key);
                if (intro) {
                    intros.push(getAdvancedProblem(key)!.advanced!.stageId);
                    intro.complete();
                }
                answer(data, key);
            }
            if (turn % 5 === 0) data = structuredClone(data);
        }
        expect(intros).toEqual(ADVANCED_NODES[id].stages.map(s => s.id));
        expect(advancedNodeReady(data,id)).toBe(true);
    });

    it('preserves the opening pair and ignores demonstrations, bridges, synthetic, exam and assisted answers for transfer', () => {
        const data = fresh();
        const [stage,next] = ADVANCED_NODES.F1.stages;
        const [a] = drawAdvancedKeys(data,'F1',1);
        expect(a).toBe(stage.anchorKey);
        const intro = advancedIntroduction(data,a)!;
        expect(advancedIntroduction(structuredClone(data),a)?.lines).toEqual(intro.lines);
        intro.complete();
        expect(advancedIntroduction(data,a)).toBeUndefined();
        answer(data,a);
        expect(drawAdvancedKeys(data,'F1',1)).toEqual([stage.transferKey]);
        answer(data,stage.transferKey);
        const x = 'F1:add-tens:target:20+20', y = 'F1:add-tens:target:40+10';
        answer(data,x, true,{context:'exam'});
        answer(data,x, true,{synthetic:true});
        answer(data,x, true,{assisted:true});
        answer(data,y);
        expect(data.advancedStages!.F1!.current).toBe(0);
        answer(data,x);
        const progress = data.advancedStages!.F1!;
        expect(progress.current).toBe(1);
        expect(drawAdvancedKeys(data,'F1',2)).toEqual([next.anchorKey,next.transferKey]);
        const record = progress.stages[stage.id];
        answer(data,y);
        answer(data,x);
        answer(data,y);
        expect(record.secure).toBe(false);
        answer(data,x);
        expect(record.secure).toBe(true);
    });

    it('uses related smaller steps after repeated misses, and keeps the other child’s stage independent', () => {
        const a = fresh(), b = fresh();
        const stage = ADVANCED_NODES.F1.stages[0];
        drawAdvancedKeys(a,'F1',2);
        const key = 'F1:add-tens:target:20+20';
        answer(a,key,false);
        expect(a.advancedStages!.F1!.stages[stage.id].pending).toEqual([]);
        answer(a,key,false);
        const recovery = drawAdvancedKeys(a,'F1',stage.supportKeys.length + 1);
        expect(recovery.slice(0,-1)).toEqual(stage.supportKeys);
        expect(recovery.at(-1)).not.toBe(key);
        expect(getAdvancedProblem(recovery.at(-1)!)?.advanced?.family).toBe('add-tens:+');
        expect(drawAdvancedKeys(b,'F1',1)).toEqual([stage.anchorKey]);
        expect(advancedNodeReady(a,'F1')).toBe(false);
    });

    it('after a failed band gate, practices the lowest-accuracy group, then resumes the frontier', () => {
        const data = fresh();
        data.subAtoms.F2.state = 'secure';
        const first = 'F2:fifteen:target:35+15', second = 'F2:fifteen:target:20+15';
        const other = 'F1:add-tens:target:20+20';
        for (const [key, correct] of [[other,false],[other,true],[first,false]] as const) {
            const p = getAdvancedProblem(key)!;
            const row = data.problemRecords[key] ??= { problemKey:key, subAtomId:p.subAtomId, form:p.form, attempts:[] };
            row.attempts.push({ context:'band_gate', correct, sequenceIndex:++data.globalSolveSequence, timestamp:1, responseTimeMs:3000 });
        }
        focusAdvancedExamRetry(data,'F','band_gate',12);
        expect(advancedProgressTarget(data,'F1')).toBe('F2');
        expect(advancedProgressTarget(data,'G1')).toBe('G1');
        expect(drawAdvancedKeys(data,'F2',2)).toEqual(ADVANCED_NODES.F2.stages.find(s => s.id === 'fifteen')!.supportKeys);
        answer(data,second);
        expect(advancedProgressTarget(data,'F1')).toBe('F2');
        answer(data,'F2:fifteen:target:25+15');
        expect(advancedProgressTarget(data,'F1')).toBe('F1');
    });
});
