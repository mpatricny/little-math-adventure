/** Read-only review of existing local profiles before introducing practice UI.
 * No imports of GameStateManager, SaveSystem, browser storage or network clients.
 * Output and the exact input backup stay in the ignored .local-saves directory.
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { getLearningBand, getLearningFrontier, getLearningLevel } from '../src/systems/LearningProgress';
import { collectLearningAttempts } from '../src/systems/LearningHistory';
import { getPracticeOverview } from '../src/systems/PracticeProgress';
import { getCatacombFoxBonus } from '../src/systems/CatacombPetProgress';
import type { SaveSlotData } from '../src/types';

const args = process.argv.slice(2);
const overrides = new Map(args.filter(arg => arg.startsWith('--target=')).map(arg => {
    const [name, target] = arg.slice('--target='.length).split(':');
    assert(name && target, 'Use --target=Name:Module');
    return [name, target];
}));
const names = args.filter(arg => !arg.startsWith('--target='));
assert(names.length, 'Pass the exact profile names to inspect. This command never applies a change.');
const input = '.local-saves/development/catalog.json';
const bytes = await readFile(input);
const hash = createHash('sha256').update(bytes).digest('hex');
const catalog = JSON.parse(bytes.toString());
const selected = catalog.records.filter((record: any) => names.includes(record.save.player.name));
for (const name of names) assert.equal(selected.filter((record: any) => record.save.player.name === name).length,
    1, `Each name must resolve to exactly one saved identity: ${name}`);
const profiles = selected.map((record: any) => {
    const save: SaveSlotData = structuredClone(record.save);
    const before = JSON.stringify(save);
    const { player, mathStats } = save;
    const data = mathStats.masteryData;
    assert(data, 'Existing mastery evidence is required.');
    const overview = getPracticeOverview(data, getLearningLevel(data));
    const proposedTarget = overrides.get(player.name) ?? overview.practiceTargetId;
    assert(!proposedTarget || overview.targets.some(target => target.targetId === proposedTarget), 'The proposed target must already be accessible.');
    const history = collectLearningAttempts(data);
    const targets = overview.targets.map(({ targetId, state, readiness: r }) => ({
        targetId, state, challenge: r.challenge, ready: r.ready,
        speedMs: r.speed.value, targetMs: r.speed.target,
        blockers: [!r.prerequisiteMet && 'exam', !r.speed.met && 'speed',
            !r.accuracy.met && 'accuracy', !r.solves.met && 'solves', !r.forms.met && 'forms'].filter(Boolean),
        solves: r.solves.value, requiredSolves: r.solves.target,
        accuracy: r.accuracy.value, forms: r.forms.value,
    }));
    const result = {
        name: player.name, profileId: record.profileId, sourceSlot: record.sourceSlot,
        revision: record.revision, savedAt: new Date(save.timestamp).toISOString(),
        receivedAt: new Date(record.receivedAt).toISOString(),
        level: player.level, derivedLevel: getLearningLevel(data), hp: player.hp, maxHp: player.maxHp,
        placement: data.selectedStartBand ?? 'A', band: getLearningBand(data), frontier: getLearningFrontier(data),
        mastered: Object.values(data.subAtoms).filter(atom => atom.state === 'mastery').map(atom => atom.id),
        completedArenas: player.arena.completedArenaLevels,
        story: player.storyProgress,
        weapon: player.equippedWeapon, shield: player.equippedShield,
        activePet: player.activePet, foxOwned: player.ownedPets.includes('pet_catacomb_A'),
        foxBonus: getCatacombFoxBonus(player),
        reportedAttempts: mathStats.totalAttempts, verifiedHistoryAttempts: history.length,
        lastRecordedAnswer: history.length ? new Date(Math.max(...history.map(a => a.timestamp))).toISOString() : null,
        introductionAvailable: overview.introductionAvailable,
        currentPreference: data.practice ?? null,
        suggestedTarget: overview.practiceTargetId ?? null,
        targets,
        proposedPreference: { mode: 'progress', lastTargetId: proposedTarget, introductionSeen: data.practice?.introductionSeen === true },
        proposalOnly: true,
    };
    assert.equal(JSON.stringify(save), before, 'Inspection must not mutate the profile.');
    return result;
});
const output = `.local-saves/reports/practice-transition-${hash.slice(0, 12)}`;
await mkdir(output, { recursive: true, mode: 0o700 });
try { await writeFile(`${output}/catalog-before.json.gz`, gzipSync(bytes), { flag: 'wx', mode: 0o600 }); }
catch (error: any) { if (error.code !== 'EEXIST') throw error; }
const report = { input, inputSha256: hash, inspectedAt: new Date().toISOString(), applied: false, profiles };
await writeFile(`${output}/proposal.json`, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
assert.deepEqual(await readFile(input), bytes, 'The live catalog must remain byte-for-byte unchanged.');
console.log(JSON.stringify({ output, ...report }, null, 2));
