import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildLearningReturnPlan } from '../prepare-learning-return.mts';
import { prepareLearningRepair } from '../learning-save-repair.mjs';
import { ALL_BANDS, ALL_SUB_ATOM_NUMBERS } from '../../src/types/index.ts';

function fixture() {
    const save = {
        player: { name: 'Return QA', gameplayProfileId: 'profile-a', attack: 5, equipment: ['iron'] },
        timestamp: 123456,
        mathStats: { totalAttempts: 678, correctAnswers: 555, masteryData: {
            selectedStartBand: 'D',
            bands: Object.fromEntries(ALL_BANDS.map(band => [band, { id: band, state: band < 'D' ? 'secure' : 'training', gateExamBestMedal: null }])),
            subAtoms: Object.fromEntries(ALL_BANDS.flatMap(band => ALL_SUB_ATOM_NUMBERS.map(num => [`${band}${num}`, { state: 'fluent', successfulSolves: 40, examBestMedal: 'silver' }]))),
            problemRecords: { 'E1:8+7:result_unknown': { attempts: [{ correct: true, responseTimeMs: 3456, sequenceIndex: 679 }] } },
            currentPool: ['E1:8+7:result_unknown'], currentPoolIndex: 0, lastPoolProblems: ['E2:13-7:result_unknown'],
            retryPool: ['E2:13-7:result_unknown'], slowPool: ['E1:8+7:result_unknown'], globalSolveSequence: 679,
        } },
    };
    return { format: 'little-math-adventure-save-bundle', version: 1, saves: [
        { sourceSlot: 1, save }, { sourceSlot: 6, save: { ...structuredClone(save), player: { name: 'Other QA' } } },
    ] };
}

describe('guarded return to an unfinished learning band', () => {
    it('uses the fresh snapshot, changes only scheduling, and touches one explicit profile', () => {
        const bundle = fixture(), before = structuredClone(bundle);
        const plan = buildLearningReturnPlan(bundle, 1, 'Return QA', 'D');
        assert.equal(plan.entries.length, 1);
        const request = { id: plan.id, saves: [bundle.saves[0]] };
        const [repaired] = prepareLearningRepair(plan, request);
        assert.deepEqual(repaired.save, { ...before.saves[0].save, mathStats: { ...before.saves[0].save.mathStats,
            masteryData: { ...before.saves[0].save.mathStats.masteryData, requiredBand: 'D', currentPool: [], currentPoolIndex: 0, lastPoolProblems: [] },
        } });
        assert.deepEqual(bundle, before);
        assert.deepEqual(prepareLearningRepair(plan, { id: plan.id, saves: [repaired] }), [repaired]);
    });

    it('rejects newer E play and a different same-named profile', () => {
        const bundle = fixture(); const plan = buildLearningReturnPlan(bundle, 1, 'Return QA', 'D');
        const newer = structuredClone(bundle.saves[0]); newer.save.mathStats.masteryData.subAtoms.E1.successfulSolves++;
        assert.throws(() => prepareLearningRepair(plan, { id: plan.id, saves: [newer] }), /přibylo hraní/);
        const other = structuredClone(bundle.saves[0]); other.save.player.gameplayProfileId = 'profile-b';
        assert.throws(() => prepareLearningRepair(plan, { id: plan.id, saves: [other] }), /očekávané profily/);
    });

    it('refuses ambiguity, a completed band and an invalid placement', () => {
        const bundle = fixture();
        assert.throws(() => buildLearningReturnPlan(bundle, 1, 'Other QA', 'D'), /expected player/);
        assert.throws(() => buildLearningReturnPlan({ ...bundle, saves: [bundle.saves[0], bundle.saves[0]] }, 1, 'Return QA', 'D'), /expected player/);
        assert.throws(() => buildLearningReturnPlan(bundle, 1, 'Return QA', 'C'), /placement/);
        bundle.saves[0].save.mathStats.masteryData.bands.D.state = 'secure';
        assert.throws(() => buildLearningReturnPlan(bundle, 1, 'Return QA', 'D'), /already complete/);
    });
});
