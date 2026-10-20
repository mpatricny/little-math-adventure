import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { DevSaveStore } from '../dev-save-store.mjs';

function save(id = 'profile-ada', attempts = 42) {
    return { player: { name: 'Ada', gameplayProfileId: id, level: 5, hp: 15, maxHp: 15, attack: 7, defense: 2,
        crystals: { crystals: [{ id: 'crystal', value: 6 }] }, storyProgress: { hasClaimedForestCrystal: true } },
    mathStats: { totalAttempts: attempts, correctAnswers: 38, recentResults: [true, false], problemStats: { a: { correct: 3 } } }, timestamp: 123456 };
}
async function fixture(t) {
    const directory = await mkdtemp(path.join(tmpdir(), 'dev-save-store-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    return { directory, store: new DevSaveStore(directory) };
}
const write = (data, baseRevision = 0, sourceSlot = 0) => ({ sourceSlot, baseRevision, save: data });

test('full game data survives a commit, restart and idempotent lost-receipt retry', async t => {
    const { store, directory } = await fixture(t), data = save();
    const first = await store.commit([write(data)], 'tablet', null);
    assert.equal(first.ok, true); assert.equal(first.records[0].revision, 1);
    assert.deepEqual(first.records[0].save, data);
    const restarted = new DevSaveStore(directory);
    const retry = await restarted.commit([write(data)], 'tablet', null);
    assert.equal(retry.ok, true); assert.equal(retry.records[0].revision, 1);
    assert.equal(retry.serverId, first.serverId);
});

test('stale saves and different server identities preserve both versions without replacing the head', async t => {
    const { store, directory } = await fixture(t);
    const first = await store.commit([write(save())], 'tablet');
    const newer = save('profile-ada', 65);
    await store.commit([write(newer, 1)], 'home', first.serverId);
    const stale = save('profile-ada', 44);
    const conflict = await store.commit([write(stale, 1)], 'cottage', first.serverId);
    assert.equal(conflict.ok, false); assert.deepEqual((await store.catalog()).records[0].save, newer);
    const archived = JSON.parse(gunzipSync(await readFile(path.join(directory, 'history', conflict.archive))));
    assert.deepEqual(archived.writes[0].save, stale);
    const wrongServer = await store.commit([write(save('profile-ada', 90), 2)], 'other', 'different-server');
    assert.equal(wrongServer.ok, false); assert.deepEqual((await store.catalog()).records[0].save, newer);
});

test('a conflicting co-op batch cannot update only one of its players', async t => {
    const { store } = await fixture(t);
    await store.commit([write(save('profile-ada')), write(save('profile-eli'), 0, 1)], 'tablet');
    await store.commit([write(save('profile-eli', 80), 1, 1)], 'other');
    const result = await store.commit([write(save('profile-ada', 60), 1), write(save('profile-eli', 60), 1, 1)], 'tablet');
    assert.equal(result.ok, false);
    assert.equal((await store.catalog()).records.find(record => record.profileId === 'profile-ada').save.mathStats.totalAttempts, 42);
});

test('concurrent writers serialize and only one can advance the same revision', async t => {
    const { store } = await fixture(t);
    await store.commit([write(save())], 'tablet');
    const results = await Promise.all([store.commit([write(save('profile-ada', 50), 1)], 'A'), store.commit([write(save('profile-ada', 60), 1)], 'B')]);
    assert.deepEqual(results.map(result => result.ok), [true, false]);
    assert.equal((await store.catalog()).records[0].revision, 2);
});

test('history retains original progress and parent archives never change the canonical save', async t => {
    const { store, directory } = await fixture(t), original = save();
    await store.commit([write(original)], 'tablet');
    await store.commit([write(save('profile-ada', 70), 1)], 'tablet');
    await store.archive([write(save('profile-ada', 30))], 'before-restore');
    const histories = await Promise.all((await readdir(path.join(directory, 'history'))).map(async name =>
        JSON.parse(gunzipSync(await readFile(path.join(directory, 'history', name))))));
    assert(histories.some(history => history.records?.some(record => JSON.stringify(record.save) === JSON.stringify(original))));
    assert.equal((await store.catalog()).records[0].save.mathStats.totalAttempts, 70);
});

test('invalid saves, duplicate identities, duplicate slots and a damaged catalog fail closed', async t => {
    const { store, directory } = await fixture(t);
    for (const writes of [[], [write(save(), -1)], [write(save('../escape'))], [write(save()), write(save(), 0, 1)],
        [write(save('profile-ada')), write(save('profile-eli'))]]) {
        assert.throws(() => store.commit(writes, 'tablet'));
    }
    await writeFile(path.join(directory, 'catalog.json'), '{broken');
    await assert.rejects(store.commit([write(save())], 'tablet'));
    assert.equal(await readFile(path.join(directory, 'catalog.json'), 'utf8'), '{broken');
});

test('a valid current revision still cannot replace newer progress with an old snapshot re-saved today', async t => {
    const { store, directory } = await fixture(t);
    const newest = save('profile-ada', 651);
    newest.player.level = 7;
    newest.player.ownedPets = ['pet_slime', 'pet_turtle'];
    newest.player.equippedWeapon = 'better-sword';
    newest.player.arena = { completedArenaLevels: [1, 2, 3, 4] };
    await store.commit([write(newest)], 'home');
    const older = save('profile-ada', 518); older.timestamp = Date.now();
    older.player.arena = { completedArenaLevels: [1, 2, 3] };
    const result = await store.commit([write(older, 1)], 'old-address');
    assert.equal(result.ok, false); assert.equal(result.error, 'older_progress');
    assert.deepEqual((await store.catalog()).records[0].save, newest);
    assert((await readdir(path.join(directory, 'history'))).some(file => file.startsWith('rollback-')));
});

test('more advanced authentic progress can replace a later timestamp from a rolled-back game', async t => {
    const { store } = await fixture(t);
    const rolledBack = save('profile-ada', 518); rolledBack.timestamp = Date.now();
    await store.commit([write(rolledBack)], 'home');
    const recovered = save('profile-ada', 651); recovered.player.level = 7;
    const result = await store.commit([write(recovered, 1)], 'verified-recovery');
    assert.equal(result.ok, true); assert.deepEqual(result.records[0].save, recovered);
});
