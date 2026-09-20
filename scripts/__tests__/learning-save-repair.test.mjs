import test from 'node:test';
import assert from 'node:assert/strict';
import { learningStatsHash, prepareLearningRepair } from '../learning-save-repair.mjs';

function fixture() {
    const save = { player: { name: 'Ada', attack: 5, equipment: ['iron'], arena: { completed: [1, 2] } },
        mathStats: { totalAttempts: 332, correctAnswers: 248, masteryData: { band: 'A' } }, timestamp: 123 };
    const masteryData = { band: 'D', records: [1, 2, 3] };
    const plan = { id: 'test', entries: [{ sourceSlot: 1, playerName: 'Ada', masteryData,
        beforeHash: learningStatsHash(save.mathStats), afterHash: learningStatsHash({ ...save.mathStats, masteryData }) }] };
    return { plan, bundle: { id: 'test', saves: [{ sourceSlot: 1, save }] } };
}

test('a reviewed repair preserves combat, counters, timestamps and its source', () => {
    const { plan, bundle } = fixture(), before = structuredClone(bundle);
    const [result] = prepareLearningRepair(plan, bundle);
    assert.deepEqual(result.save.player, bundle.saves[0].save.player);
    assert.equal(result.save.mathStats.totalAttempts, 332);
    assert.equal(result.save.mathStats.correctAnswers, 248);
    assert.equal(result.save.timestamp, 123);
    assert.deepEqual(result.save.mathStats.masteryData, plan.entries[0].masteryData);
    assert.deepEqual(bundle, before);
    assert.deepEqual(prepareLearningRepair(plan, { id: plan.id, saves: [result] }), [result]);
});

test('refuses stale progress, wrong slots, wrong profiles and incomplete bundles', () => {
    for (const mutate of [
        b => b.saves[0].save.mathStats.totalAttempts++,
        b => b.saves[0].save.mathStats.masteryData.band = 'B',
        b => b.saves[0].save.player.name = 'Borek',
        b => b.saves[0].sourceSlot = 2,
        b => b.saves = [],
        b => b.id = 'other',
    ]) {
        const { plan, bundle } = fixture(); mutate(bundle);
        assert.throws(() => prepareLearningRepair(plan, bundle));
    }
});

test('rejects a damaged plan instead of guessing an update', () => {
    const { plan, bundle } = fixture();
    plan.entries[0].masteryData.band = 'E';
    assert.throws(() => prepareLearningRepair(plan, bundle), /Neplatný plán/);
});
