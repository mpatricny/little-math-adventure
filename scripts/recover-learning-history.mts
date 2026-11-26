/** Add verified answer evidence to local profiles without changing gameplay.
 * Preview: server/node_modules/.bin/tsx scripts/recover-learning-history.mts
 *   --analysis /private/path/analysis.json --profile UUID:EXPECTED_COUNT [...]
 * Apply adds --apply --origin http://127.0.0.1:8001 (atomic, revision-guarded API).
 */
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { collectLearningAttempts, learningAttemptKey, type LearningHistoryAttempt } from '../src/systems/LearningHistory';
import { DailyProgressSystem } from '../src/systems/DailyProgressSystem';
import type { SaveSlotData } from '../src/types';

const args = process.argv.slice(2);
const values = (flag: string) => args.flatMap((value, index) => value === flag ? [args[index + 1]] : []);
const analysisPath = values('--analysis')[0];
const selections = values('--profile').map(value => {
    const [id, count] = value.split(':');
    assert(id && Number.isSafeInteger(Number(count)), 'Use --profile UUID:EXPECTED_COUNT');
    return { id, count: Number(count) };
});
assert(analysisPath && selections.length && new Set(selections.map(s => s.id)).size === selections.length,
    'An analysis source and distinct explicit --profile selections are required.');
const apply = args.includes('--apply');
const origin = new URL(values('--origin')[0] ?? 'http://127.0.0.1:8001').origin;
assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname), 'Only the local development server is supported.');
const endpoint = `${origin}/__dev-saves/api`;
const source = JSON.parse(await readFile(analysisPath, 'utf8'));
const catalog = apply ? await (await fetch(endpoint)).json()
    : JSON.parse(await readFile('.local-saves/development/catalog.json', 'utf8'));
assert(catalog.version === 1 && Array.isArray(catalog.records), 'Invalid catalog');
const writes: Array<{ sourceSlot: number; baseRevision: number; save: SaveSlotData }> = [];
const report = [];
for (const selection of selections) {
    const record = catalog.records.find((r: any) => r.profileId === selection.id);
    const sourceProfile = source.profiles.find((p: any) => p.id === selection.id);
    assert(record && sourceProfile?.local === true, 'The selected identity must exist in both local sources.');
    const evidence = source.attempts.filter((a: any) => a.profile_id === selection.id && a.included === true);
    assert.equal(evidence.length, selection.count, 'Source evidence differs from the reviewed count.');
    const answers: LearningHistoryAttempt[] = evidence.map((a: any) => ({
        source: a.source, problemKey: a.problem_key, timestamp: a.timestamp, correct: a.correct,
        responseTimeMs: a.response_time_ms,
        ...(typeof a.assisted === 'boolean' ? { assisted: a.assisted } : {}),
        ...(a.source === 'mastery' ? { subAtomId: a.details.subAtomId, form: a.details.form } : {}),
    }));
    assert.equal(new Set(answers.map(learningAttemptKey)).size, selection.count, 'Duplicate evidence');
    const save: SaveSlotData = structuredClone(record.save);
    const mastery = save.mathStats.masteryData;
    assert(mastery, 'The existing mastery state is required.');
    const before = DailyProgressSystem.getSummary(save.player, save.mathStats);
    const old = collectLearningAttempts(mastery);
    mastery.learningHistory = { version: 1, attempts: [...answers, ...old], recovery: {
        source: 'verified-local-archive-report-2026-11-17', recoveredAt: Date.now(), attempts: answers.length,
    } };
    mastery.learningHistory.attempts = collectLearningAttempts(mastery);
    const after = DailyProgressSystem.getSummary(save.player, save.mathStats);
    assert(after.attempts >= answers.length && after.attempts >= old.length, 'Recovery must be additive.');
    assert.equal(after.attempts, selection.count, 'Current data has additional answers; review the recovery count again before writing.');
    for (const answer of answers) assert(mastery.learningHistory.attempts.some(a => learningAttemptKey(a) === learningAttemptKey(answer)));
    // Verify the *only* changed save field. In particular do not reset level,
    // coins, story, placement, raw counters, mastery records or last-played time.
    const gameplay = structuredClone(save);
    const original = structuredClone(record.save);
    delete gameplay.mathStats.masteryData!.learningHistory;
    delete original.mathStats.masteryData.learningHistory;
    assert.deepEqual(gameplay, original);
    const unchanged = record.save.mathStats.masteryData.learningHistory
        && JSON.stringify(collectLearningAttempts(record.save.mathStats.masteryData)) === JSON.stringify(mastery.learningHistory.attempts);
    // Compare the receipt with exactly the JSON sent over the wire (optional
    // undefined metadata keys are omitted by JSON, including in old saves).
    if (!unchanged) writes.push({ sourceSlot: record.sourceSlot, baseRevision: record.revision,
        save: JSON.parse(JSON.stringify(save)) as SaveSlotData });
    report.push({ name: save.player.name, profileId: selection.id, before: before.attempts,
        after: after.attempts, correct: after.correct, firstDate: after.firstDate, lastDate: after.lastDate,
        levelUnchanged: save.player.level, gameplayUnchanged: true, changed: !unchanged });
}
if (apply && writes.length) {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin },
        body: JSON.stringify({ mode: 'commit', serverId: catalog.serverId, writes }) });
    const receipt = await response.json();
    assert(response.ok && receipt.ok === true, `Recovery was not committed: ${receipt.error ?? response.status}`);
    for (const write of writes) assert.deepEqual(receipt.records.find((r: any) => r.profileId === write.save.player.gameplayProfileId)?.save, write.save);
}
console.log(JSON.stringify({ applied: apply, profiles: report }, null, 2));
