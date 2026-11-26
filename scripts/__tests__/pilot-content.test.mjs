import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { collectSceneAssets } from '../scene-assets.mjs';
import { collectPilotContent, preparePilotPublic, publicFilePath } from '../pilot-content.mjs';
import { PILOT_SCENE_KEYS } from '../pilot-content.config.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const content = collectPilotContent(rootDir);
const json = name => content.metadata.get(name);
const original = name => JSON.parse(readFileSync(path.join(rootDir, 'public/assets/data', name), 'utf8'));
const hash = filename => createHash('sha256').update(readFileSync(filename)).digest('hex');

function walk(value, visit) {
  if (!value || typeof value !== 'object') return;
  visit(value);
  Object.values(value).forEach(child => walk(child, visit));
}

test('public build includes the playable story, without development scenes or menu shortcuts', () => {
  for (const key of ['GuardianLairScene', 'ZyxCrystalMachineScene', 'SilverpondTownMockScene',
    'SilverpondArenaMockScene', 'UnderwaterDescentScene', 'UnderwaterRoomScene']) assert.ok(PILOT_SCENE_KEYS.includes(key), key);
  for (const key of ['TestingTownScene', 'GuildExamMockScene', 'ArenaUiMockScene', 'BattleUiMockScene']) {
    assert.ok(!PILOT_SCENE_KEYS.includes(key) && !content.report.layoutKeys.includes(key), key);
  }
  for (const key of ['WalkingHudOverlay', 'AudioControlHosts', 'UnderwaterOverlay']) assert.ok(content.report.layoutKeys.includes(key), key);
  assert.deepEqual(json('encounters.json'), original('encounters.json'));
  const rooms = original('underwater-rooms.json');
  assert.deepEqual(json('underwater-rooms.json'), rooms);
  for (const room of Object.values(rooms.rooms)) assert.ok(content.report.layoutKeys.includes(room.layout), room.layout);
  const menu = json('scenes.json').scenes.MenuScene;
  for (const element of [...menu.elements, ...menu.ui]) assert.doesNotMatch(element.id, /^btn(Silverpond|Underwater|ComparisonTest)/);
  for (const name of ['pets.json', 'items.json']) assert.deepEqual(json(name), original(name));
});

test('runtime scene registration and packaged pilot scope stay in sync', () => {
  const registry = readFileSync(path.join(rootDir, 'src/config/pilotScenes.ts'), 'utf8');
  const declaration = registry.match(/export\s+const\s+GAME_SCENES\s*=\s*\[([\s\S]*?)\]/);
  assert.ok(declaration, 'Pilot registry must expose a reviewable static GAME_SCENES array');
  const names = declaration[1].split(',').map(value => value.trim()).filter(Boolean);
  assert.ok(names.every(name => /^[A-Za-z_$][\w$]*$/.test(name)), 'Scene registry must use named scene classes');
  assert.equal(new Set(names).size, names.length, 'No duplicate scene registrations');
  assert.deepEqual([...names].sort(), [...PILOT_SCENE_KEYS].sort());
});

test('comparison lessons retain their editor layouts and illustrated choices in the pilot', () => {
  const scenes = json('scenes.json').scenes;
  for (const key of ['MathBoardComparisonLayout', 'ComparisonFeedbackLayout']) {
    assert.deepEqual(scenes[key], original('scenes.json').scenes[key], `Missing comparison layout ${key}`);
  }
  for (const key of ['comparison-apple', 'comparison-crocodile', 'comparison-equal-jaws',
    'comparison-greater', 'comparison-equal']) {
    assert.ok(content.report.textureKeys.includes(key), `Missing comparison texture ${key}`);
    const texture = original('textures.json').images[key];
    const url = typeof texture === 'string' ? texture : texture.path;
    assert.ok(content.publicFiles.has(publicFilePath(`assets/${url}`)), `Missing comparison image ${key}`);
  }
});

test('retained actor animations, UI templates, nine slices and textures form a closed dependency graph', () => {
  const textures = new Set(content.report.textureKeys);
  const templateIds = new Set(content.report.templateIds);
  const configs = json('nine-slices.json').configs;
  const knownTextures = new Set([...Object.keys(original('textures.json').images), ...Object.keys(original('textures.json').spritesheets)]);
  for (const name of ['assets.json', 'animations.json', 'ui-element-templates.json', 'nine-slices.json', 'enemies.json', 'items.json', 'pets.json']) {
    walk(json(name), object => {
      for (const field of ['texture', 'defaultTexture', 'spriteKey', 'imageAssetId']) {
        if (typeof object[field] === 'string' && knownTextures.has(object[field])) {
          assert.ok(textures.has(object[field]), `${name}: missing texture ${object[field]}`);
        }
      }
      if (object.nineSliceConfigId) assert.ok(configs[object.nineSliceConfigId], `Missing nine slice ${object.nineSliceConfigId}`);
    });
  }
  walk(json('scenes.json'), object => {
    if (object.uiElement?.templateId) assert.ok(templateIds.has(object.uiElement.templateId), `Missing template ${object.uiElement.templateId}`);
  });
  // Dynamic arena lookup, story end, both avatars, and the guardian's final phase.
  for (const key of ['arena-1-bg', 'arena-2-bg', 'arena-3-bg', 'forest-crystal-story',
    'boy-knight-walk-sheet', 'girl-knight-walk-sheet']) assert.ok(textures.has(key), key);
  const allAnimationNames = new Set();
  function animationNames(value) {
    for (const [key, child] of Object.entries(value)) {
      if (child && typeof child === 'object') {
        if (child.texture && child.frames) allAnimationNames.add(key);
        else animationNames(child);
      }
    }
  }
  animationNames(json('animations.json'));
  for (const key of ['verdant-shield-on', 'verdant-shield-idle', 'verdant-shield-attack',
    'verdant-shield-broke', 'verdant-death']) assert.ok(allAnimationNames.has(key), key);
  const enemies = new Set(json('enemies.json').map(enemy => enemy.id));
  walk(json('encounters.json'), object => {
    if (object.enemyId) assert.ok(enemies.has(object.enemyId), `Missing enemy ${object.enemyId}`);
  });
});

test('public media is selected from runtime dependencies, without editor files', () => {
  assert.ok(content.report.counts.pilotTextureBytes < content.report.counts.originalTextureBytes);
  assert.ok(content.report.counts.pilotTextureBytes > 0);
  for (const key of ['underwater-depth-crystal', 'silverpond-fairy-title-frame']) assert.ok(content.report.textureKeys.includes(key), key);
  const audio = json('audio.json');
  assert.ok(audio.music.m04_forest && audio.music.m10_zyx_hope);
  assert.ok(audio.music.m08_silverpond && audio.music.m09_underwater);
  for (const filename of content.publicFiles) {
    assert.ok(!/\/incoming\/|\/previews\/|\/thumbnails\/|\.db(?:-|$)|\.DS_Store$/.test(filename), filename);
    assert.ok(existsSync(path.join(rootDir, 'public', filename)), filename);
  }
  for (const asset of [...Object.values(audio.assets), ...Object.values(audio.music)]) {
    assert.ok(content.publicFiles.has(asset.url.slice(1)), asset.url);
  }
  assert.ok(!JSON.stringify(json('ui-element-templates.json')).includes('data:image/'));
  const landingHtml = readFileSync(path.join(rootDir, 'landing.html'), 'utf8');
  const screenshots = [...landingHtml.matchAll(/src="\/(assets\/images\/screenshots\/[^\"]+)"/g)];
  assert.ok(screenshots.length > 0, 'Landing gallery must contain screenshots');
  for (const [, filename] of screenshots) {
    assert.ok(content.publicFiles.has(filename), filename);
  }
});

test('victory keeps shared frames and both continue-button states despite historical chapter names', () => {
  const textures = new Set(content.report.textureKeys);
  for (const key of ['practice-choice-panel-v1', 'practice-choice-plaque-v1', 'catacomb-detail-laurels', 'green-slime-happy',
    'enamel-control-socket', 'enamel-continue-normal', 'enamel-continue-active']) {
    assert.ok(textures.has(key), `VictoryScene shared resource missing: ${key}`);
  }
  const scenes = json('scenes.json').scenes;
  assert.ok(scenes.PracticeChoiceOverlay && scenes.CatacombProgressOverlay);
  assert.ok(scenes.VictoryScene.elements.some(element => element.id === 'practiceVictoryJourney'));
  for (const key of ['practice-victory-rail', 'practice-victory-fox', 'practice-victory-coin',
    'practice-victory-lock-open-active', 'practice-victory-lock-closed-active']) assert.ok(textures.has(key), key);
  assert.ok(content.publicFiles.has('assets/ui/mathboard-v4/Gelasio.ttf'));
  assert.ok(content.report.sourceFiles.includes('src/ui/UnderwaterTheme.ts'));
  assert.ok(content.report.sourceFiles.includes('src/scenes/UnderwaterRoomScene.ts'));
  assert.ok(!content.report.sourceFiles.includes('src/scenes/TestingTownScene.ts'));
});

test('generated build leaves original catalogs and copied media unchanged', () => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'cislokraj-pilot-content-test-'));
  const publicDir = path.join(temporary, 'pilot-public');
  const watched = [...content.metadata.keys()].map(name => path.join(rootDir, 'public/assets/data', name))
    .filter(existsSync);
  const media = [...content.publicFiles][0];
  watched.push(path.join(rootDir, 'public', media));
  const before = new Map(watched.map(filename => [filename, hash(filename)]));
  try {
    const result = preparePilotPublic(rootDir, { outputDir: publicDir });
    assert.equal(result.publicDir, publicDir);
    assert.ok(existsSync(path.join(temporary, 'pilot-content-report.json')));
    assert.ok(!existsSync(path.join(publicDir, 'pilot-content-report.json')));
    assert.deepEqual(JSON.parse(readFileSync(path.join(publicDir, 'assets/data/textures.json'), 'utf8')), json('textures.json'));
    // Generated media must not be hardlinked to the editor's original.
    writeFileSync(path.join(publicDir, media), 'generated-only mutation');
    for (const [filename, digest] of before) assert.equal(hash(filename), digest, filename);
    assert.ok(!readdirSync(path.join(publicDir, 'assets')).includes('source'));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('unsafe paths and attempts to replace the source public tree are rejected', () => {
  for (const filename of ['../secret', '/assets/../../secret', 'https://example.com/test',
    'assets/library/assets.db', 'assets/library/thumbnails/example.png', 'assets/audio/incoming/source.wav']) {
    assert.throws(() => publicFilePath(filename), /Unsafe|Editor/);
  }
  assert.throws(() => preparePilotPublic(rootDir, { outputDir: path.join(rootDir, 'public') }), /separate/);
});

// Cold entry into a trial must not depend on having visited a battle first.
test('comparison artwork is preloaded independently in guild and catacomb trials', () => {
  const dependencies = collectSceneAssets(rootDir);
  for (const scene of ['GuildScene', 'CatacombTrialScene']) {
    for (const key of ['comparison-apple', 'comparison-equal', 'comparison-greater']) {
      assert.ok(dependencies[scene].includes(key), `${scene} is missing ${key}`);
    }
  }
});

test('the guild and fox lesson ship their painted layouts and cold-entry artwork', () => {
  for (const layout of ['CatacombProgressOverlay', 'FoxLessonScene', 'MathBoardArtLayout']) {
    assert.deepEqual(json('scenes.json').scenes[layout], original('scenes.json').scenes[layout], layout);
    assert.ok(content.report.layoutKeys.includes(layout), layout);
  }
  const dependencies = collectSceneAssets(rootDir);
  for (const scene of ['GuildScene', 'FoxLessonScene']) {
    for (const key of ['catacomb-painted-room', 'catacomb-painted-action']) {
      assert.ok(dependencies[scene].includes(key), `${scene} is missing ${key}`);
      assert.ok(content.report.textureKeys.includes(key), key);
    }
  }
  for (const key of ['mathboard-catacomb-v4', 'mathboard-answer-v4']) {
    assert.ok(dependencies.FoxLessonScene.includes(key), key);
    assert.ok(content.report.textureKeys.includes(key), key);
  }
});
