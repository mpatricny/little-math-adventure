import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync,
  rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PILOT_SCENE_KEYS, PILOT_LAYOUT_KEYS, PILOT_SCENE_SOURCE_OVERRIDES,
  EXCLUDED_SOURCE_PREFIXES, EXCLUDED_MUSIC_KEYS, EXCLUDED_AUDIO_PREFIXES,
  EXCLUDED_AUDIO_KEYS, OPTIONAL_CHAPTER_TEXTURE_PREFIXES, PILOT_DATA_FILES,
  SHARED_RUNTIME_SOURCE_FILES, SHARED_CHAPTER_TEXTURE_KEYS,
} from './pilot-content.config.mjs';

const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const readJson = filename => JSON.parse(readFileSync(filename, 'utf8'));
const clone = value => structuredClone(value);
const keepEntries = (object, predicate) => Object.fromEntries(Object.entries(object).filter(predicate));

function walk(value, visit) {
  if (typeof value === 'string') visit(value);
  else if (Array.isArray(value)) value.forEach(child => walk(child, visit));
  else if (value && typeof value === 'object') Object.values(value).forEach(child => walk(child, visit));
}

function leafMap(value, predicate, prefix = '', result = new Map()) {
  if (!value || typeof value !== 'object') return result;
  if (predicate(value)) result.set(prefix, value);
  else for (const [key, child] of Object.entries(value)) {
    if (key !== 'version') leafMap(child, predicate, prefix ? `${prefix}.${key}` : key, result);
  }
  return result;
}

function pickLeaves(value, predicate, selected, prefix = '') {
  if (!value || typeof value !== 'object') return value;
  if (predicate(value)) return selected.has(prefix) ? clone(value) : undefined;
  const entries = Object.entries(value).flatMap(([key, child]) => {
    if (key === 'version') return [[key, child]];
    const filtered = pickLeaves(child, predicate, selected, prefix ? `${prefix}.${key}` : key);
    return filtered && typeof filtered === 'object' && Object.keys(filtered).length > 0
      ? [[key, filtered]] : [];
  });
  return Object.fromEntries(entries);
}

function stripEditorMetadata(value) {
  if (Array.isArray(value)) return value.map(stripEditorMetadata);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['thumbnail', 'createdAt', 'updatedAt'].includes(key))
    .map(([key, child]) => [key, stripEditorMetadata(child)]));
}

function sourceFiles(rootDir) {
  const allowedScenes = new Set(PILOT_SCENE_KEYS.map(key => `${PILOT_SCENE_SOURCE_OVERRIDES[key] ?? key}.ts`));
  const files = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!['simulation', '__tests__', 'test', 'tests'].includes(entry.name)) visit(absolute);
      } else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) {
        const rootRelative = path.relative(rootDir, absolute).split(path.sep).join('/');
        if (EXCLUDED_SOURCE_PREFIXES.some(prefix => entry.name.startsWith(prefix))
            && !SHARED_RUNTIME_SOURCE_FILES.includes(rootRelative)) continue;
        if (/Debugger|DebugOverlay/.test(entry.name) || entry.name === 'main.ts') continue;
        const relative = path.relative(path.join(rootDir, 'src'), absolute).split(path.sep).join('/');
        if (relative.startsWith('scenes/') && !allowedScenes.has(entry.name)) continue;
        // Config scene registries describe all variants, not runtime resource dependencies.
        if (relative.startsWith('config/') && /Scenes\.ts$/.test(entry.name)) continue;
        files.push(absolute);
      }
    }
  }
  visit(path.join(rootDir, 'src'));
  return files.sort();
}

/** Reject paths escaping public, external URLs, and editor-only/source files. */
export function publicFilePath(relative) {
  const normalized = relative.replace(/^\//, '').replaceAll('\\', '/');
  if (!normalized || normalized.includes('\0') || normalized.split('/').includes('..')
      || /^[a-z]+:/i.test(normalized) || normalized.startsWith('/')) {
    throw new Error(`Unsafe public asset path: ${relative}`);
  }
  if (/(^|\/)(incoming|previews|thumbnails)(\/|$)|\.db(?:-shm|-wal)?$|\.DS_Store$/.test(normalized)) {
    throw new Error(`Editor/source file cannot be published: ${relative}`);
  }
  return normalized;
}

function textureFile(resource) {
  const relative = typeof resource === 'string' ? resource : resource.path;
  if (typeof relative !== 'string') throw new Error('Texture is missing its file path');
  return publicFilePath(relative.startsWith('library:')
    ? `assets/library/${relative.slice(8)}` : `assets/${relative}`);
}

function filterEncounters(original) {
  const data = clone(original);
  delete data.scenes.UnderwaterRoomScene;
  data.sceneOrder = data.sceneOrder.filter(key => own(data.scenes, key));
  const arenaData = data.scenes.ArenaScene;
  arenaData.arenas = keepEntries(arenaData.arenas, ([, arena]) => arena.cityId === 'mathoria');
  const arenaIds = new Set(Object.values(arenaData.arenas).map(arena => arena.id));
  for (const arena of Object.values(arenaData.arenas)) {
    if (arena.metadata?.nextArenaId && !arenaIds.has(arena.metadata.nextArenaId)) {
      arena.metadata.nextArenaId = null;
    }
  }
  const usedStrings = new Set();
  walk(data.scenes, value => usedStrings.add(value));
  data.bosses = keepEntries(data.bosses, ([key]) => usedStrings.has(key));
  data.multiplayerPolicies = keepEntries(data.multiplayerPolicies, ([key]) => usedStrings.has(key));
  return data;
}

/** Read-only collection, exported for validation and reporting without starting a build. */
export function collectPilotContent(rootDir) {
  rootDir = path.resolve(rootDir);
  const dataDir = path.join(rootDir, 'public/assets/data');
  const load = name => readJson(path.join(dataDir, name));
  const original = {
    scenes: load('scenes.json'), assets: load('assets.json'), textures: load('textures.json'),
    animations: load('animations.json'), templates: load('ui-element-templates.json'),
    nineSlices: load('nine-slices.json'), encounters: load('encounters.json'),
    enemies: load('enemies.json'), audio: load('audio.json'),
  };
  const metadata = new Map(PILOT_DATA_FILES.map(name => [name, load(name)]));
  const layouts = new Set(PILOT_LAYOUT_KEYS);
  const scenes = { scenes: keepEntries(original.scenes.scenes, ([key]) => layouts.has(key)) };
  // Menu hosts are data too: editor-only actions must not reappear in the public catalog.
  const menu = scenes.scenes.MenuScene;
  if (menu) {
    for (const field of ['elements', 'ui']) if (menu[field]) {
      menu[field] = menu[field].filter(element => !/^btn(Silverpond|Underwater|ComparisonTest)/.test(element.id));
    }
  }
  const encounters = filterEncounters(original.encounters);
  const enemyIds = new Set();
  const collectEnemies = value => {
    if (!value || typeof value !== 'object') return;
    if (value.enemyId) enemyIds.add(value.enemyId);
    if (value.visualEnemyId) enemyIds.add(value.visualEnemyId);
    Object.values(value).forEach(collectEnemies);
  };
  collectEnemies(encounters);
  collectEnemies(metadata.get('forest-rooms.json'));
  // Tutorial encounters and pet previews have legitimate enemies outside a battle roster.
  enemyIds.add('slime_tutorial');
  for (const pet of metadata.get('pets.json')) if (pet.unlockedByEnemy) enemyIds.add(pet.unlockedByEnemy);
  const enemies = original.enemies.filter(enemy => enemyIds.has(enemy.id));
  for (const id of enemyIds) if (!enemies.some(enemy => enemy.id === id)) {
    throw new Error(`Pilot references unknown enemy ${id}`);
  }
  const audio = {
    ...original.audio,
    assets: keepEntries(original.audio.assets, ([key]) => !EXCLUDED_AUDIO_KEYS.includes(key)
      && !EXCLUDED_AUDIO_PREFIXES.some(prefix => key.startsWith(prefix))),
    music: keepEntries(original.audio.music, ([key]) => !EXCLUDED_MUSIC_KEYS.includes(key)),
  };
  metadata.set('scenes.json', scenes);
  metadata.set('encounters.json', encounters);
  metadata.set('enemies.json', enemies);
  metadata.set('audio.json', audio);

  const isAsset = value => typeof value.type === 'string';
  const isAnimation = value => typeof value.texture === 'string' && value.frames;
  const assets = leafMap(original.assets, isAsset);
  const animations = leafMap(original.animations, isAnimation);
  const animNames = new Map([...animations].map(([key, value]) => [key.split('.').at(-1), { key, value }]));
  const templates = new Map(original.templates.templates.map(template => [template.id, template]));
  const configs = original.nineSlices.configs;
  const textureKeys = new Set([...Object.keys(original.textures.images), ...Object.keys(original.textures.spritesheets)]);
  const selected = { assets: new Set(), animations: new Set(), textures: new Set(),
    templates: new Set(), configs: new Set() };
  const queue = [];
  const enqueue = value => walk(value, string => queue.push(string));
  for (const [name, value] of metadata) {
    // Localization copy is content, not a reference to every similarly named texture/asset.
    if (!name.startsWith('localization/') && name !== 'audio.json') enqueue(value);
  }

  function visit(string, fromSource = false) {
    if (assets.has(string) && !selected.assets.has(string)) {
      selected.assets.add(string); enqueue(assets.get(string));
    }
    if (textureKeys.has(string) && !(fromSource && !SHARED_CHAPTER_TEXTURE_KEYS.includes(string)
        && OPTIONAL_CHAPTER_TEXTURE_PREFIXES.some(prefix => string.startsWith(prefix)))) {
      selected.textures.add(string);
    }
    if (templates.has(string) && !selected.templates.has(string)) {
      selected.templates.add(string); enqueue(templates.get(string));
    }
    if (own(configs, string) && !selected.configs.has(string)) {
      selected.configs.add(string); enqueue(configs[string]);
    }
    const animation = animNames.get(string);
    if (animation && !selected.animations.has(animation.key)
        && !(fromSource && OPTIONAL_CHAPTER_TEXTURE_PREFIXES.some(prefix => animation.value.texture.startsWith(prefix)))) {
      selected.animations.add(animation.key); enqueue(animation.value);
    }
  }
  const files = sourceFiles(rootDir);
  const source = files.map(filename => readFileSync(filename, 'utf8')).join('\n');
  const quotedStrings = new Set();
  // Literal lookups cover runtime-only HUD/portrait resources absent from scene metadata.
  // Computed creature animation names are closed through animPrefix below.
  for (const match of source.matchAll(/(['"`])([^'"`\r\n]*?)\1/g)) {
    if (!match[2].includes('${')) quotedStrings.add(match[2]);
  }
  for (const string of quotedStrings) visit(string, true);
  // Scene code also selects resources such as `arena-${this.arenaLevel}-bg`.
  // Match its static pieces against known catalog keys; never invent paths from source text.
  const resourceKeys = new Set([...textureKeys, ...assets.keys(), ...animNames.keys(), ...templates.keys(), ...Object.keys(configs)]);
  for (const match of source.matchAll(/`([^`\r\n]*\$\{[^`\r\n]*?)`/g)) {
    const parts = match[1].split(/\$\{[^}]*\}/g);
    if (parts.length < 2 || parts.join('').length < 4) continue;
    const pattern = new RegExp(`^${parts.map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.+')}$`);
    for (const key of resourceKeys) if (pattern.test(key)) visit(key, true);
  }
  const actors = [...enemies, ...metadata.get('pets.json'), ...metadata.get('characters.json'), ...metadata.get('npcs.json')];
  for (const actor of actors) {
    if (!actor.animPrefix) continue;
    for (const [name] of animNames) {
      if (name === actor.animPrefix || name.startsWith(`${actor.animPrefix}-`)) visit(name);
    }
  }
  while (queue.length) visit(queue.pop());

  const textures = {
    version: original.textures.version,
    images: keepEntries(original.textures.images, ([key]) => selected.textures.has(key)),
    spritesheets: keepEntries(original.textures.spritesheets, ([key]) => selected.textures.has(key)),
  };
  metadata.set('textures.json', textures);
  metadata.set('assets.json', pickLeaves(original.assets, isAsset, selected.assets));
  metadata.set('animations.json', pickLeaves(original.animations, isAnimation, selected.animations));
  metadata.set('ui-element-templates.json', {
    ...original.templates,
    templates: original.templates.templates.filter(template => selected.templates.has(template.id)),
  });
  metadata.set('nine-slices.json', {
    ...original.nineSlices, configs: keepEntries(configs, ([key]) => selected.configs.has(key)),
  });
  // Shared progress helpers import these schemas at module load. Empty data prevents chapter
  // content leaking into the JS bundle while retaining safe imports for pilot-gated helpers.
  metadata.set('underwater-rooms.json', { schemaVersion: 1, startRoom: '', rooms: {} });
  metadata.set('underwater-puzzles.json', { hints: {} });
  for (const [name, value] of metadata) metadata.set(name, stripEditorMetadata(value));

  const publicFiles = new Set();
  for (const resource of Object.values(textures.images)) publicFiles.add(textureFile(resource));
  for (const resource of Object.values(textures.spritesheets)) publicFiles.add(textureFile(resource));
  for (const resource of [...Object.values(audio.assets), ...Object.values(audio.music)]) {
    publicFiles.add(publicFilePath(resource.url));
  }
  // Existing TV support is part of the pilot, but no editor/source directories are copied.
  for (const filename of ['manifest.json', 'sdk/mesa-sdk.js']) {
    if (existsSync(path.join(rootDir, 'public', filename))) publicFiles.add(filename);
  }
  let mediaBytes = 0;
  for (const relative of publicFiles) {
    const absolute = path.join(rootDir, 'public', relative);
    if (!existsSync(absolute) || !statSync(absolute).isFile()) {
      throw new Error(`Missing pilot dependency: public/${relative}`);
    }
    mediaBytes += statSync(absolute).size;
  }
  const allTextureFiles = new Set([
    ...Object.values(original.textures.images), ...Object.values(original.textures.spritesheets),
  ].map(textureFile));
  const textureFiles = [...publicFiles].filter(filename => allTextureFiles.has(filename));
  const report = {
    variant: 'pilot',
    sceneKeys: [...PILOT_SCENE_KEYS], layoutKeys: Object.keys(scenes.scenes),
    textureKeys: [...selected.textures].sort(), templateIds: [...selected.templates].sort(),
    sourceFiles: files.map(filename => path.relative(rootDir, filename).split(path.sep).join('/')),
    mediaFiles: [...publicFiles].sort(), metadataFiles: [...metadata.keys()].sort(),
    counts: {
      originalTextures: textureKeys.size, pilotTextures: selected.textures.size,
      originalTextureFiles: allTextureFiles.size, pilotTextureFiles: textureFiles.length,
      originalTextureBytes: [...allTextureFiles].reduce((sum, file) => sum + statSync(path.join(rootDir, 'public', file)).size, 0),
      pilotTextureBytes: textureFiles.reduce((sum, file) => sum + statSync(path.join(rootDir, 'public', file)).size, 0),
      mediaFiles: publicFiles.size, mediaBytes,
      metadataBytes: [...metadata.values()].reduce((sum, value) => sum + Buffer.byteLength(JSON.stringify(value)), 0),
    },
  };
  return { metadata, publicFiles, report };
}

/** Build a separate public tree. Copies, rather than hardlinks, keep generated edits isolated. */
export function preparePilotPublic(rootDir, options = {}) {
  rootDir = path.resolve(rootDir);
  const publicDir = path.resolve(options.outputDir ?? path.join(rootDir, '.generated/pilot-public'));
  const originalPublic = path.join(rootDir, 'public');
  if (publicDir === rootDir || publicDir === originalPublic || originalPublic.startsWith(`${publicDir}${path.sep}`)
      || publicDir.startsWith(`${originalPublic}${path.sep}`)) {
    throw new Error('Pilot output must be separate from the original public tree');
  }
  const { metadata, publicFiles, report } = collectPilotContent(rootDir);
  const stagingDir = `${publicDir}.preparing-${process.pid}`;
  rmSync(stagingDir, { recursive: true, force: true });
  mkdirSync(stagingDir, { recursive: true });
  try {
    for (const relative of publicFiles) {
      const target = path.join(stagingDir, relative);
      mkdirSync(path.dirname(target), { recursive: true });
      copyFileSync(path.join(originalPublic, relative), target);
    }
    for (const [name, value] of metadata) {
      const target = path.join(stagingDir, 'assets/data', name);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, JSON.stringify(value));
    }
    rmSync(publicDir, { recursive: true, force: true });
    renameSync(stagingDir, publicDir);
  } finally {
    rmSync(stagingDir, { recursive: true, force: true });
  }
  // The dependency/source report is a build artifact, not a publicly served file.
  writeFileSync(path.join(path.dirname(publicDir), 'pilot-content-report.json'), JSON.stringify(report, null, 2));
  return { publicDir, report };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = preparePilotPublic(rootDir);
  console.log(JSON.stringify({ publicDir: result.publicDir, counts: result.report.counts }, null, 2));
}
