// Run only after the two normalized families pass source, alpha and visual review.
// No placeholder or static fallback is ever registered as a production animation.
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const read = async path => JSON.parse(await fs.readFile(new URL(path, root), 'utf8'));
const write = async (path, value) => {
    const file = new URL(path, root);
    const original = await fs.readFile(file, 'utf8');
    const indentation = original.match(/\n([ \t]+)\S/)?.[1] ?? '    ';
    await fs.writeFile(file, JSON.stringify(value, null, indentation) + '\n');
};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const existingEliteIds=['silverpond_silverfin_scalefish_deep','silverpond_ruin_axolotl_deep','silverpond_bubble_crab_deep','silverpond_mill_turtle_deep','silverpond_pearl_jellyfish_deep'];
const rosterBaseline = (live, staged, liveEnemies) => {
    const liveEncounters=Object.values(live.scenes.UnderwaterRoomScene.rooms).flatMap(room=>room.encounters);
    const ids=Object.values(staged.scenes.UnderwaterRoomScene.rooms).flatMap(room=>room.encounters).map(encounter=>encounter.id).sort();
    const rosters=ids.map(id=>{
        const encounter=liveEncounters.find(encounter=>encounter.id===id);
        if(!encounter)throw new Error(`Missing current underwater encounter ${id}`);
        return {id,enemies:encounter.enemies};
    });
    const attacks=existingEliteIds.map(id=>{
        const enemy=liveEnemies.find(enemy=>enemy.id===id);
        if(!enemy)throw new Error(`Missing current elite definition ${id}`);
        return {id,attack:enemy.attack};
    });
    return sha(JSON.stringify({rosters,attacks}));
};
if (process.argv.includes('--baseline')) {
    console.log(rosterBaseline(await read('public/assets/data/encounters.json'),await read('artifacts/underwater/balance-candidate/encounters.json'),await read('public/assets/data/enemies.json')));
    process.exit(0);
}
const productionBytes = await fs.readFile(new URL('artifacts/sorceress/underwater-expansion/production.json', root));
const production = JSON.parse(productionBytes);
const approvals = await read('artifacts/sorceress/underwater-expansion/approvals.json');
const verification = await read('artifacts/sorceress/underwater-expansion/verification.json');
if (!approvals.production?.approvedBy || approvals.production.productionSha256 !== sha(productionBytes)
    || verification.productionSha256 !== sha(productionBytes) || verification.verifiedFrames <= 0
    || !['assets-only', 'registered'].includes(verification.mode) || Object.keys(verification.sheets).length !== 8) {
    throw new Error('Exact production bytes need a successful frame-verifier receipt and parent/Astra extracted-motion approval');
}
for (const [path, hash] of Object.entries(verification.sheets)) {
    if (sha(await fs.readFile(new URL(path, root))) !== hash || approvals.production.sheets?.[path] !== hash) {
        throw new Error('Production sheet changed after frame verification or visual approval');
    }
}
const textures = await read('public/assets/data/textures.json');
const animations = await read('public/assets/data/animations.json');
const assets = await read('public/assets/data/assets.json');
const enemies = await read('public/assets/data/enemies.json');
const encounters = await read('public/assets/data/encounters.json');
const stagedEnemiesBytes = await fs.readFile(new URL('artifacts/underwater/balance-candidate/enemies.json', root));
const stagedEncountersBytes = await fs.readFile(new URL('artifacts/underwater/balance-candidate/encounters.json', root));
if (!approvals.balance?.approvedBy || approvals.balance.enemiesSha256 !== sha(stagedEnemiesBytes)
    || approvals.balance.encountersSha256 !== sha(stagedEncountersBytes)) {
    throw new Error('The exact staged balance candidate needs parent approval before promotion');
}
const stagedEnemies = JSON.parse(stagedEnemiesBytes);
const stagedEncounters = JSON.parse(stagedEncountersBytes);
if ((approvals.balance.livePromotionSha256??approvals.balance.liveRostersSha256) !== rosterBaseline(encounters,stagedEncounters,enemies)) {
    throw new Error('Live underwater rosters or selected elite attacks changed since promotion review; review the current delta again');
}
const cs = await read('public/assets/data/localization/cs.json');
const en = await read('public/assets/data/localization/en.json');
const names = {
    seahorse: { id: 'silverpond_armored_seahorse', asset: 'armored_seahorse', key: 'ENM_011', cs: 'Pancéřový koník', en: 'Armored Seahorse' },
    nautilus: { id: 'silverpond_rune_nautilus', asset: 'rune_nautilus', key: 'ENM_012', cs: 'Runová loděnka', en: 'Rune Nautilus' },
};
if (Object.keys(production.creatures).length !== 2) throw new Error('Both complete species are required');
for (const [slug, spec] of Object.entries(names)) {
    const creature = production.creatures[slug], prefix = creature.prefix;
    for (const locale of [cs, en]) {
        const expected = locale === cs ? spec.cs : spec.en;
        if (locale.characters.enemies[spec.key] !== undefined && locale.characters.enemies[spec.key] !== expected) {
            throw new Error(`Localization key ${spec.key} is occupied by another creature`);
        }
    }
    if (Object.keys(creature.actions).sort().join() !== 'attack,defeat,defend,idle') throw new Error('Incomplete family');
    const family = {};
    for (const [action, data] of Object.entries(creature.actions)) {
        if (!verification.sheets[data.sheet]) throw new Error('Motion absent from the exact verification receipt');
        if (data.frameCount < 2 || data.sampleEvery !== 4 || data.frameRate !== 6 || !data.approvedBy) throw new Error('Not approved Every 4 video motion');
        const file = new URL(data.sheet, root);
        const geometry = await sharp(file.pathname).metadata();
        const columns = Math.min(4, data.frameCount), rows = Math.ceil(data.frameCount / columns);
        if (geometry.width !== columns * 512 || geometry.height !== rows * 512
            || geometry.width > 2048 || geometry.height > 2048 || !geometry.hasAlpha) {
            throw new Error('Invalid production grid: complete 512px frames must fit a 2048px tablet atlas');
        }
        const texture = `silverpond-${prefix}-${action}-sheet`;
        textures.spritesheets[texture] = { path: data.sheet.replace(/^public\/assets\//, ''), frameWidth: 512, frameHeight: 512, frameCount: data.frameCount };
        const animation = { texture, frames: action === 'idle' ? { sequence: data.playbackFrames } : { start: 0, end: data.frameCount - 1 }, frameRate: 6, repeat: action === 'idle' ? -1 : 0 };
        if (action === 'attack') {
            animation.movement = { type: 'dash', offsetX: -35, duration: 400, ease: 'Power2' };
            animation.holdUntilComplete = true;
        }
        family[`${prefix}-${action}`] = animation;
        if (action === 'attack') family[`${prefix}-attack-anim`] = structuredClone(animation);
        if (action === 'defend') family[`${prefix}-hurt`] = structuredClone(animation);
        if (action === 'defeat') family[`${prefix}-death`] = structuredClone(animation);
    }
    animations.enemies[prefix] = family;
    const spriteKey = `silverpond-${prefix}-idle-sheet`;
    assets.characters.enemies[spec.asset] = {
        type: 'animatedSprite', category: 'enemy', nameKey: `$characters.enemies.${spec.key}`, origin: [.5, .5],
        scale: { default: .45, battle: .45, arena: .45 }, depth: 5, defaultTexture: spriteKey,
        animations: Object.fromEntries(['idle', 'attack', 'hurt', 'death'].map(action => [action, `${prefix}-${action}`])), defaultAnimation: 'idle',
    };
    for (const id of [spec.id, `${spec.id}_deep`]) {
        if (!enemies.some(enemy => enemy.id === id)) {
            const candidate = stagedEnemies.find(enemy => enemy.id === id);
            if (!candidate || (id !== spec.id && (candidate.baseEnemyId !== spec.id || candidate.rank !== 'elite'))) {
                throw new Error(`Missing valid staged definition ${id}`);
            }
            enemies.push(structuredClone(candidate));
        }
    }
    const registered = enemies.filter(enemy => enemy.id === spec.id || enemy.baseEnemyId === spec.id);
    if (registered.length !== 2) throw new Error(`Expected base + elite definitions for ${spec.id}`);
    for (const enemy of registered) {
        enemy.spriteKey = spriteKey; enemy.animPrefix = prefix; enemy.frameTopInset = creature.frameTopInset;
    }
    cs.characters.enemies[spec.key] = spec.cs;
    en.characters.enemies[spec.key] = spec.en;
    const portraitPath = `sprites/portraits/${spriteKey}.webp`;
    await sharp(new URL(creature.actions.idle.sheet, root).pathname).extract({ left: 0, top: 0, width: 512, height: 512 })
        .webp({ lossless: true, effort: 4 }).toFile(new URL(`public/assets/${portraitPath}`, root).pathname);
    textures.images[`${spriteKey}-portrait`] = portraitPath;
}
// The approved attack adjustment belongs to the final rosters. Apply only these
// five scalar fields in this same invocation, retaining all live geometry/stats.
for(const id of existingEliteIds) {
    const live=enemies.find(enemy=>enemy.id===id),candidate=stagedEnemies.find(enemy=>enemy.id===id);
    if(!live||!candidate||!Number.isFinite(candidate.attack))throw new Error(`Missing approved attack value ${id}`);
    live.attack=candidate.attack;
}
// Promote only the approved underwater roster arrays, preserving current policy,
// rewards, bosses, arena data and any concurrent unrelated catalog edits.
const liveRooms = encounters.scenes.UnderwaterRoomScene.rooms;
for (const room of Object.values(stagedEncounters.scenes.UnderwaterRoomScene.rooms)) {
    for (const candidate of room.encounters) {
        const live = Object.values(liveRooms).flatMap(room => room.encounters).find(encounter => encounter.id === candidate.id);
        if (!live) throw new Error(`Missing current underwater encounter ${candidate.id}`);
        for (const ref of candidate.enemies) if (ref.source !== 'core' || !enemies.some(enemy => enemy.id === ref.enemyId)) throw new Error('Unresolved final roster');
        live.enemies = structuredClone(candidate.enemies);
    }
}
await write('public/assets/data/textures.json', textures);
await write('public/assets/data/animations.json', animations);
await write('public/assets/data/assets.json', assets);
await write('public/assets/data/enemies.json', enemies);
await write('public/assets/data/encounters.json', encounters);
await write('public/assets/data/localization/cs.json', cs);
await write('public/assets/data/localization/en.json', en);
console.log('Registered both complete video families, aliases, editor assets, intrinsic HUD geometry and portraits.');
