import { describe, expect, it } from 'vitest';
import { ALL_SUB_ATOM_NUMBERS, type MasteryData } from '../../types';
import { ensureAdvancedLearningBands, getLearningBand } from '../LearningProgress';
import { advancedCoopWindow, advancedEvidence, advancedExamPlan, distinctAdvancedSuccesses, drawAdvancedCoopKeys } from '../AdvancedAssessment';
import { advancedProblems, getAdvancedProblem } from '../AdvancedCurriculum';
import { getCatacombReadiness } from '../PracticeProgress';
import { getThresholdsForSubAtom } from '../MasteryThresholds';
import { catacombProgress } from '../CatacombProgress';

function legacy(): MasteryData {
    return { bands: { E: { id: 'E', state: 'secure', gateExamBestMedal: 'bronze', bandMasteryChallengeResult: null } },
        subAtoms: {}, problemRecords: {}, currentPool: ['E4:old'], currentPoolIndex: 0, lastPoolProblems: [],
        globalSolveSequence: 0 } as unknown as MasteryData;
}
function record(data: MasteryData, key: string, ms = 3800, assisted = false): void {
    const p = getAdvancedProblem(key)!;
    const row = data.problemRecords[key] ??= { problemKey: key, form: p.form, subAtomId: p.subAtomId, attempts: [] };
    const sequenceIndex = ++data.globalSolveSequence;
    row.attempts.push({ correct: true, responseTimeMs: ms, sequenceIndex, timestamp: sequenceIndex, context: 'battle', assisted });
}
describe('advanced assessments and old profiles', () => {
    it('ranks the weakest group for the higher catacomb trial even when the overall fast-time target is met', () => {
        const data = legacy();
        ensureAdvancedLearningBands(data);
        data.subAtoms.F1.state = 'mastery';
        const targets = [...advancedProblems()].filter(p => p.subAtomId === 'F1' && p.advanced?.role === 'target');
        const groups = [0, 1].map(group => targets.filter(p => p.advanced!.group === group));
        for (let i = 0; i < 40; i++) {
            const minority = i >= 36;
            const group = groups[minority ? 1 : 0];
            const key = group[i % group.length].key;
            record(data, key, minority ? 11000 : 1500);
            const attempt = data.problemRecords[key].attempts.at(-1)!;
            attempt.timestamp = Date.UTC(2026, 10, 18 + Math.floor(i / 20), 12, i % 20);
        }
        const progress = () => catacombProgress(data, {}, 'F1').find(s => s.stage === 'grandmaster')!;
        expect(progress()).toMatchObject({ speedMs: 1500, ready: false, readinessPercent: 0 });
        const minority = groups[1].flatMap(p => data.problemRecords[p.key]?.attempts ?? []);
        expect(minority).toHaveLength(4);
        for (const attempt of minority) attempt.responseTimeMs = 1500;
        minority[0].assisted = true;
        expect(progress()).toMatchObject({ speedMs: 1500, ready: false, readinessPercent: 78 });
        minority[0].assisted = false;
        expect(progress()).toMatchObject({ speedMs: 1500, ready: true, readinessPercent: 100 });
    });
    it('opens only F1 on a completed E gate, at most once, and defers it during an earlier repair', () => {
        const data = legacy();
        ensureAdvancedLearningBands(data);
        expect(getLearningBand(data)).toBe('F');
        expect(data.subAtoms.F1.state).toBe('training');
        expect(data.subAtoms.H4.successfulSolves).toBe(0);
        data.currentPool = ['preserve-issued'];
        const before = structuredClone(data);
        ensureAdvancedLearningBands(data);
        expect(data).toEqual(before);

        const deferred = legacy();
        deferred.bands.D = { ...deferred.bands.E, id: 'D', state: 'training' };
        deferred.requiredBand = 'D';
        ensureAdvancedLearningBands(deferred);
        expect(deferred.bands.F.state).toBe('locked');
        expect(deferred.currentPool).toEqual(['E4:old']);
        delete deferred.requiredBand;
        ensureAdvancedLearningBands(deferred);
        expect(deferred.bands.F.state).toBe('training');

        const earlier = legacy();
        earlier.bands.E.state = 'training'; earlier.bands.E.gateExamBestMedal = null;
        ensureAdvancedLearningBands(earlier);
        expect(earlier.subAtoms.F1.state).toBe('locked');
    });
    it('requires independent evidence in both teaching groups even in result-only nodes', () => {
        const data = legacy();
        ensureAdvancedLearningBands(data); data.subAtoms.F1.state = 'secure';
        const candidates = [...advancedProblems()].filter(p => p.subAtomId === 'F1' && p.advanced?.role === 'target');
        const group = (n: number) => candidates.filter(p => p.advanced!.group === n);
        for (let i = 0; i < 30; i++) record(data, group(0)[i % group(0).length].key);
        for (let i = 0; i < 4; i++) record(data, group(1)[i].key, 3800, true);
        expect(getCatacombReadiness(data, 'F1', 'fluency_challenge').ready).toBe(false);
        expect(distinctAdvancedSuccesses(advancedEvidence(data, 'F1'))[1]).toBe(0);
        for (const p of [...group(1), ...group(0)]) record(data, p.key);
        expect(getCatacombReadiness(data, 'F1', 'fluency_challenge').ready).toBe(true);
        data.subAtoms.F1.state = 'fluent';
        for (let i = 0; i < 30; i++) record(data, group(i % 2)[i % 10].key, i % 2 ? 8500 : 1000);
        expect(getCatacombReadiness(data, 'F1', 'mastery_challenge').ready).toBe(false);
        expect(getThresholdsForSubAtom('H4')).toMatchObject({ masteryRT: 8000, fluentRT: 11200 });
    });
    it('schedules and collects a whole co-op gate across distinct questions and all four nodes', () => {
        const data = legacy(); ensureAdvancedLearningBands(data);
        const plan = advancedExamPlan('band_gate', 'F');
        for (let i = 0; i < 40; i++) {
            const history = advancedEvidence(data, 'F', 0);
            if (advancedCoopWindow(plan, history).length === 12) break;
            const keys = drawAdvancedCoopKeys(plan, history, 2);
            expect(keys).toHaveLength(2);
            keys.forEach(key => record(data, key));
        }
        const gate = advancedCoopWindow(plan, advancedEvidence(data, 'F', 0));
        expect(gate).toHaveLength(12);
        expect(new Set(gate.map(entry => entry.key)).size).toBe(12);
        for (const n of ALL_SUB_ATOM_NUMBERS) {
            const entries = gate.filter(e => e.node === `F${n}`);
            expect(entries).toHaveLength(3);
            expect(new Set(entries.map(e => e.group)).size).toBe(2);
        }
    });
});
