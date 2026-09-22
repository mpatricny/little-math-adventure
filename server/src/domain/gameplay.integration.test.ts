import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, after, describe, it } from 'node:test';
import { createDatabase, type Database } from '../db/database.js';
import { applyMigrations, discoverMigrations } from '../db/migrations.js';
import { collectGameplay, gameplaySummary, gameplayBatchSchema, resolveGameplayBrowser, type GameplayBatch } from './gameplay.js';

const integration = process.env.DATABASE_URL ? describe : describe.skip;
integration('durable gameplay collection', () => {
  let db: Database;
  const accountId = randomUUID(); const otherAccount = randomUUID(); const profileId = randomUUID();
  const deviceId = randomUUID();
  const batch: GameplayBatch = {
    version: 1, accountId, profileId, deviceId, slotNumber: 1, revision: 2,
    savedAt: Date.now(), release: 'integration-test',
    progress: { player: { name: 'Test player', mana: 6 }, mathStats: { placementCounter: 240 } },
    attempts: [{ eventKey: 'mastery:1:example', source: 'mastery', sequenceIndex: 1,
      timestamp: Date.now(), problemKey: 'D1:10+1:result_unknown', context: 'battle',
      correct: true, responseTimeMs: 1500, assisted: false, details: { form: 'result_unknown' } }],
  };
  before(async () => {
    db = createDatabase(process.env.DATABASE_URL!);
    await applyMigrations(db, await discoverMigrations(new URL('../../migrations/', import.meta.url).pathname));
    await db`INSERT INTO player_accounts (id) VALUES (${accountId}), (${otherAccount})`;
  });
  after(async () => {
    await db`DELETE FROM player_accounts WHERE id IN (${accountId}, ${otherAccount})`;
    await db.end();
  });
  it('deduplicates retries and simultaneous uploads without counting placement totals', async () => {
    assert.equal(gameplayBatchSchema.safeParse(batch).success, true);
    await Promise.all([collectGameplay(db, accountId, batch), collectGameplay(db, accountId, batch)]);
    const [summary] = await gameplaySummary(db, accountId);
    assert.equal(summary!.attempts, 1); assert.equal(summary!.correct, 1);
    assert.equal(summary!.average_response_time_ms, 1500);
    assert.equal((await gameplaySummary(db, otherAccount)).length, 0);
  });
  it('keeps a newer snapshot while accepting previously missing answers in an older batch', async () => {
    await collectGameplay(db, accountId, { ...batch, revision: 1,
      progress: { player: { name: 'stale', mana: 3 }, mathStats: {} },
      attempts: [{ ...batch.attempts[0]!, eventKey: 'comparison:2', source: 'comparison',
        problemKey: 'comparison:3:5', sequenceIndex: 2, context: 'exam', correct: false,
        assisted: true, details: { selectedRelation: 'greater', relation: 'less' } }],
    });
    const [summary] = await gameplaySummary(db, accountId);
    assert.equal(summary!.name, 'Test player'); assert.equal(summary!.attempts, 2);
    assert.equal(summary!.correct, 1);
  });
  it('separates reused slots, co-op profiles and device snapshots', async () => {
    const secondProfile = randomUUID();
    await collectGameplay(db, accountId, { ...batch, profileId: secondProfile,
      progress: { player: { name: 'Player B' }, mathStats: {} } });
    await collectGameplay(db, accountId, { ...batch, deviceId: randomUUID() });
    const summary = await gameplaySummary(db, accountId);
    assert.equal(summary.length, 2);
    assert.equal(summary.find(p => p.profile_id === profileId)!.attempts, 2);
    assert.equal(summary.find(p => p.profile_id === secondProfile)!.attempts, 1);
  });
  it('keeps an anonymous browser stable and links its history only to the first parent', async () => {
    const token = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '');
    const [browser, repeated] = await Promise.all([
      resolveGameplayBrowser(db, token, deviceId), resolveGameplayBrowser(db, token, deviceId),
    ]);
    assert.equal(browser!.id, repeated!.id);
    assert.equal(await resolveGameplayBrowser(db, 'b'.repeat(64)), null);
    try {
      await collectGameplay(db, browser!.id, { ...batch, accountId: browser!.id });
      assert.equal((await gameplaySummary(db, browser!.id))[0]!.attempts, 1);
      assert.equal((await gameplaySummary(db, accountId, true)).length, 0);
      await collectGameplay(db, browser!.id, { ...batch, accountId: browser!.id }, accountId);
      assert.equal((await gameplaySummary(db, accountId, true))[0]!.attempts, 1);
      await collectGameplay(db, browser!.id, { ...batch, accountId: browser!.id }, otherAccount);
      assert.equal((await gameplaySummary(db, otherAccount, true)).length, 0);
      assert.equal((await gameplaySummary(db, accountId, true))[0]!.attempts, 1);
    } finally { await db`DELETE FROM player_accounts WHERE id=${browser!.id}`; }
  });
});
